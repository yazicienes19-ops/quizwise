import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { motion, AnimatePresence } from 'framer-motion';
import type { GraphState, GraphNodePosition, GraphEntityChange } from '../services/graph/types';
import { buildGraphIndex } from '../services/graph/graphIndex';
import { resolveOverlaps } from '../services/graph/graphLayoutEngine';
import {
  type GraphSelectionState, selectNode, selectEdge, clearSelection, hoverNode, isSelected, isHovered, isEdgeSelected,
} from '../services/graph/graphSelectionService';
import {
  type GraphHistory, recordCreateNode, recordUpdateNode, recordArchiveNode,
  recordCreateEdge, recordUpdateEdge, recordArchiveEdge,
} from '../services/graph/graphHistoryService';
import { createRelationType } from '../services/graph/graphMutationService';

/**
 * Phase 3 — reine Graph Engine: SVG-Rendering, Pan/Zoom, Selection,
 * Drag-to-Move. Phase 5A: Node-Titel/-Notiz direkt bearbeitbar, Node
 * löschbar, Beziehungstyp wird beim Kantenziehen bewusst per Texteingabe
 * gewählt statt automatisch defaultet (s. KNOWLEDGE_GRAPH_USABILITY_SESSION.md
 * — der stille Default widersprach der Kernregel "Nutzer ist bewusster Autor
 * jeder Bedeutung im Graphen"). Phase 5B (Relationship UX, s. Nachtest-Sektion
 * am Ende desselben Dokuments): ein abgelehnter Kanten-Versuch (Duplikat)
 * zeigt jetzt eine verständliche Meldung statt kommentarlos zu verschwinden;
 * Kanten sind jetzt genau wie Nodes auswählbar (breiter, unsichtbarer
 * Hit-Bereich neben der sichtbaren Linie) und darüber ansehbar, umbenennbar
 * (dieselbe Freitext-Logik wie beim Anlegen) und löschbar (Entf-Taste oder
 * Button im Editier-Overlay). Jede Kante zeigt ihre Bedeutung jetzt direkt
 * auf der Fläche (horizontales Label mit Hintergrund-Pille am
 * Kantenmittelpunkt, kein Menü/Inspector nötig); liegen mehrere Kanten
 * zwischen demselben Node-Paar (unterschiedliche Beziehungstypen sind
 * erlaubt, nur inhaltliche Duplikate nicht), werden nur ihre Labels
 * gestaffelt versetzt — reine Anzeigekorrektur, keine Linien-Geometrie.
 *
 * UI-Schicht-Grenze bewusst eingehalten: diese Komponente importiert keine
 * Infrastructure (GraphRepository/GraphSyncService/GraphPersistenceService).
 * Sie ruft ausschließlich Domain-Funktionen auf (GraphHistoryService, damit
 * Undo/Redo automatisch funktioniert) und meldet jede erfolgreiche Änderung
 * über `onEntityChanged` nach außen — Persistenz ist Sache des Aufrufers
 * (heute: Test-Harness, später: ein useKnowledgeGraph-Hook der
 * Application-Schicht). Kontrollierte Komponente: state/history/selection
 * kommen als Props, Änderungen laufen über onChange-Callbacks.
 *
 * GraphEntityChange ist in services/graph/types.ts definiert (Domain-
 * Schicht), nicht hier — s. Kommentar dort.
 *
 * Ausnahme von "nur Domain-Funktionen über GraphHistoryService": das Anlegen
 * eines neuen Beziehungstyps (createRelationType, direkt aus
 * GraphMutationService) läuft NICHT über die History — das war schon in
 * Phase 3 eine bewusste Scope-Entscheidung (RelationType-Mutationen sind
 * seltene, "Einstellungs"-artige Aktionen, kein typischer Undo-Fall). Nur die
 * daraus entstehende Kante selbst ist undo-fähig.
 */

export interface GraphCanvasProps {
  state: GraphState;
  history: GraphHistory;
  selection: GraphSelectionState;
  onChange: (next: { state: GraphState; history: GraphHistory }) => void;
  onSelectionChange: (next: GraphSelectionState) => void;
  onEntityChanged?: (change: GraphEntityChange) => void;
}

interface ZoomTransform { x: number; y: number; k: number; }

const NODE_RADIUS = 28;
const HANDLE_RADIUS = 6;
const HANDLE_DISTANCE = NODE_RADIUS + 14;
const DRAG_THRESHOLD_PX = 4;
const NODE_DATA_ATTR = 'data-graph-node';

export const GraphCanvas: React.FC<GraphCanvasProps> = ({
  state, history, selection, onChange, onSelectionChange, onEntityChanged,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const gRef = useRef<SVGGElement | null>(null);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [zoomTransform, setZoomTransform] = useState<ZoomTransform>({ x: 0, y: 0, k: 1 });

  // ── Sichtbare Nodes/Kanten ──────────────────────────────────────────────
  const activeNodes = useMemo(
    () => [...state.nodesById.values()].filter(n => n.archivedAt === undefined),
    [state.nodesById],
  );
  const index = useMemo(() => buildGraphIndex(state), [state]);
  const visibleEdges = useMemo(() => [...index.edgesBySource.values()].flat(), [index]);

  // Phase 5B Punkt 2: zwei unterschiedliche Beziehungstypen zwischen
  // demselben Node-Paar sind erlaubt (nur inhaltliche Duplikate werden
  // blockiert, s. validateNoDuplicateEdge) — beide Kanten wären ohne diesen
  // Index optisch identische, deckungsgleiche Linien mit exakt
  // übereinanderliegenden Labels. Reine Anzeige-Korrektur (nur die
  // Label-Position wird pro Kante innerhalb ihrer Gruppe leicht versetzt),
  // KEINE Änderung an Linien-Geometrie/Layout-Engine.
  const edgeParallelIndex = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const edge of visibleEdges) {
      const key = [edge.sourceNodeId, edge.targetNodeId].sort().join('|');
      const ids = groups.get(key) ?? [];
      ids.push(edge.id);
      groups.set(key, ids);
    }
    const indexById = new Map<string, number>();
    for (const ids of groups.values()) {
      ids.forEach((id, i) => indexById.set(id, i));
    }
    return indexById;
  }, [visibleEdges]);

  // Nur rein visuelle Entzerrung exakt überlappender Nodes — wird NICHT in
  // state/history committet. Ein automatischer Hintergrund-Commit hier würde
  // sonst als überraschender Eintrag im Undo-Stack auftauchen, obwohl der
  // Nutzer nichts getan hat (s. graphLayoutEngine.ts für die Begründung,
  // warum Entzerren überhaupt sicher ist).
  const displayPositions = useMemo(
    () => resolveOverlaps(
      activeNodes.map(n => ({ id: n.id, position: n.position, pinned: n.pinned })),
      visibleEdges.map(e => ({ sourceNodeId: e.sourceNodeId, targetNodeId: e.targetNodeId })),
    ),
    [activeNodes, visibleEdges],
  );

  const positionOf = useCallback(
    (nodeId: string): GraphNodePosition => displayPositions.get(nodeId) ?? { x: 0, y: 0 },
    [displayPositions],
  );

  // Am NODE_RADIUS gekürzte Endpunkte einer Kante plus Mittelpunkt — einmal
  // berechnet, sowohl fürs Linien-Rendering als auch für die Positionierung
  // des Bearbeiten-Overlays (Phase 5B) genutzt, damit beide immer exakt
  // übereinstimmen.
  const computeEdgeGeometry = useCallback((edge: { sourceNodeId: string; targetNodeId: string }) => {
    const from = positionOf(edge.sourceNodeId);
    const to = positionOf(edge.targetNodeId);
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const x1 = from.x + Math.cos(angle) * NODE_RADIUS;
    const y1 = from.y + Math.sin(angle) * NODE_RADIUS;
    const x2 = to.x - Math.cos(angle) * NODE_RADIUS;
    const y2 = to.y - Math.sin(angle) * NODE_RADIUS;
    return { x1, y1, x2, y2, midX: (x1 + x2) / 2, midY: (y1 + y2) / 2 };
  }, [positionOf]);

  // ── Pan/Zoom (Muster aus MindmapCanvas.tsx, angepasst) ──────────────────
  const fitView = useCallback(() => {
    if (!svgRef.current || !zoomBehaviorRef.current || activeNodes.length === 0) return;
    const xs = activeNodes.map(n => positionOf(n.id).x);
    const ys = activeNodes.map(n => positionOf(n.id).y);
    const minX = Math.min(...xs) - NODE_RADIUS, maxX = Math.max(...xs) + NODE_RADIUS;
    const minY = Math.min(...ys) - NODE_RADIUS, maxY = Math.max(...ys) + NODE_RADIUS;
    const contentWidth = maxX - minX || 1;
    const contentHeight = maxY - minY || 1;
    const svgW = svgRef.current.clientWidth || 800;
    const svgH = svgRef.current.clientHeight || 500;
    const scale = Math.min(1.2, 0.9 * Math.min(svgW / contentWidth, svgH / contentHeight));
    const tx = svgW / 2 - scale * (minX + contentWidth / 2);
    const ty = svgH / 2 - scale * (minY + contentHeight / 2);
    d3.select(svgRef.current).transition().duration(300)
      .call(zoomBehaviorRef.current.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
  }, [activeNodes, positionOf]);

  useEffect(() => {
    if (!svgRef.current || !gRef.current) return;
    const svgSel = d3.select(svgRef.current);
    const g = d3.select(gRef.current);
    const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 2.5])
      // Klicks/Drags, die auf einem Node beginnen, sollen den Node bewegen,
      // nicht die Canvas verschieben.
      .filter(event => !event.ctrlKey && !event.button && !(event.target as Element).closest(`[${NODE_DATA_ATTR}]`))
      .on('zoom', event => {
        g.attr('transform', event.transform.toString());
        setZoomTransform({ x: event.transform.x, y: event.transform.y, k: event.transform.k });
      });
    svgSel.call(zoomBehavior);
    // Eigener Doppelklick-Handler (Node anlegen) statt d3s eingebautem
    // Doppelklick-Zoom.
    svgSel.on('dblclick.zoom', null);
    zoomBehaviorRef.current = zoomBehavior;
    return () => { svgSel.on('.zoom', null); };
  }, []);

  const didInitialFit = useRef(false);
  useEffect(() => {
    if (didInitialFit.current || activeNodes.length === 0 || !zoomBehaviorRef.current) return;
    didInitialFit.current = true;
    fitView();
  }, [activeNodes.length, fitView]);

  const zoomBy = (factor: number) => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    d3.select(svgRef.current).transition().duration(200).call(zoomBehaviorRef.current.scaleBy, factor);
  };

  const clientToGraphPoint = useCallback((clientX: number, clientY: number): GraphNodePosition => {
    const rect = svgRef.current?.getBoundingClientRect();
    const screenX = clientX - (rect?.left ?? 0);
    const screenY = clientY - (rect?.top ?? 0);
    return { x: (screenX - zoomTransform.x) / zoomTransform.k, y: (screenY - zoomTransform.y) / zoomTransform.k };
  }, [zoomTransform]);

  // ── Titel direkt bearbeiten (Phase 5A Punkt 2) ──────────────────────────
  // Kein Dialog/Modal — ein HTML-Overlay-<input>, absolut positioniert über
  // dem Node (Muster aus dem alten MindmapCanvas.tsx: interaktive Controls
  // liegen als HTML außerhalb des SVG, nicht als <foreignObject> darin, weil
  // Safari beim Klicken durch ein transformiertes SVG-<g> hindurch bekannte
  // Hit-Testing-Bugs hat — das transformierte <g ref={gRef}> für Pan/Zoom
  // existiert hier genauso).
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const editInputRef = useRef<HTMLInputElement | null>(null);
  // Escape muss verwerfen, nicht speichern — aber das Entfernen des
  // fokussierten <input> aus dem DOM löst danach trotzdem ein natives
  // blur-Event aus, das sonst versehentlich erneut committen würde, bevor
  // der State-Update aus setEditingNodeId(null) im Closure sichtbar ist
  // (State-Updates sind asynchron, ein Ref ist es nicht).
  const skipNextBlurCommitRef = useRef(false);

  useEffect(() => {
    if (editingNodeId) {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    }
  }, [editingNodeId]);

  const beginEditingTitle = (nodeId: string, currentTitle: string) => {
    setEditingNodeId(nodeId);
    setEditingValue(currentTitle);
  };

  const commitTitleEdit = () => {
    if (skipNextBlurCommitRef.current) { skipNextBlurCommitRef.current = false; return; }
    if (!editingNodeId) return;
    const trimmed = editingValue.trim();
    // Leerer Titel wird nicht committet (DB/Domain verlangen einen nicht-
    // leeren Titel) — die Bearbeitung schließt einfach, ohne den
    // bestehenden Titel zu verwerfen. Kein Fehler-UI nötig dafür.
    if (trimmed.length > 0) {
      const result = recordUpdateNode(history, state, editingNodeId, { title: trimmed });
      if (!result.error && result.entity) {
        onChange({ state: result.state, history: result.history });
        onEntityChanged?.({ kind: 'node', entity: result.entity });
      }
    }
    setEditingNodeId(null);
  };

  const cancelTitleEdit = () => {
    skipNextBlurCommitRef.current = true;
    setEditingNodeId(null);
  };

  // ── Freitext-Notiz (Phase 5A Punkt 4) ────────────────────────────────────
  // Genau EIN Feld, wie vorgegeben — bewusst `notes` (persönliche Anmerkung:
  // "warum ist das wichtig"), nicht `description` (objektive Definition, im
  // Datenmodell separat vorhanden, aber hier nicht exponiert). Sichtbar,
  // sobald ein Node ausgewählt ist — keine Sidebar, ein einfaches Overlay
  // direkt unter dem Node reicht für diese Phase.
  const [notesDraft, setNotesDraft] = useState<{ nodeId: string; value: string } | null>(null);
  const [isEditingNotes, setIsEditingNotes] = useState(false);

  // Initialisiert den Entwurf NUR, wenn sich die Auswahl ändert — nicht bei
  // jeder state-Änderung, sonst würde der gerade getippte Text durch eine
  // unabhängige Änderung anderswo überschrieben (dieselbe Überlegung wie bei
  // der Titel-Bearbeitung).
  useEffect(() => {
    if (!selection.selectedNodeId) { setNotesDraft(null); return; }
    const node = state.nodesById.get(selection.selectedNodeId);
    setNotesDraft(node ? { nodeId: node.id, value: node.notes } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection.selectedNodeId]);

  const commitNotes = () => {
    setIsEditingNotes(false);
    if (!notesDraft) return;
    const node = state.nodesById.get(notesDraft.nodeId);
    if (!node || node.notes === notesDraft.value) return; // unverändert, kein Commit/History-Eintrag nötig
    const result = recordUpdateNode(history, state, notesDraft.nodeId, { notes: notesDraft.value });
    if (!result.error && result.entity) {
      onChange({ state: result.state, history: result.history });
      onEntityChanged?.({ kind: 'node', entity: result.entity });
    }
  };

  // ── Node-Drag (Verschieben) ──────────────────────────────────────────────
  interface NodeDragState { nodeId: string; startClientX: number; startClientY: number; startPos: GraphNodePosition; currentPos: GraphNodePosition; moved: boolean; }
  const [nodeDrag, setNodeDrag] = useState<NodeDragState | null>(null);

  const handleNodePointerDown = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    setNodeDrag({ nodeId, startClientX: e.clientX, startClientY: e.clientY, startPos: positionOf(nodeId), currentPos: positionOf(nodeId), moved: false });
  };

  useEffect(() => {
    if (!nodeDrag) return;
    const handleMove = (e: MouseEvent) => {
      const dx = (e.clientX - nodeDrag.startClientX) / zoomTransform.k;
      const dy = (e.clientY - nodeDrag.startClientY) / zoomTransform.k;
      const moved = nodeDrag.moved || Math.hypot(e.clientX - nodeDrag.startClientX, e.clientY - nodeDrag.startClientY) > DRAG_THRESHOLD_PX;
      setNodeDrag(prev => prev && { ...prev, currentPos: { x: nodeDrag.startPos.x + dx, y: nodeDrag.startPos.y + dy }, moved });
    };
    const handleUp = () => {
      if (nodeDrag.moved) {
        const result = recordUpdateNode(history, state, nodeDrag.nodeId, { position: nodeDrag.currentPos });
        if (!result.error && result.entity) {
          onChange({ state: result.state, history: result.history });
          onEntityChanged?.({ kind: 'node', entity: result.entity });
        }
      } else {
        onSelectionChange(selectNode(selection, nodeDrag.nodeId));
      }
      setNodeDrag(null);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeDrag, zoomTransform.k]);

  // ── Kanten-Erstellung per Ziehen vom Connector-Handle ───────────────────
  interface EdgeDraftState { sourceNodeId: string; pointer: GraphNodePosition; }
  const [edgeDraft, setEdgeDraft] = useState<EdgeDraftState | null>(null);

  const handleHandlePointerDown = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    setEdgeDraft({ sourceNodeId: nodeId, pointer: clientToGraphPoint(e.clientX, e.clientY) });
  };

  useEffect(() => {
    if (!edgeDraft) return;
    const handleMove = (e: MouseEvent) => {
      setEdgeDraft(prev => prev && { ...prev, pointer: clientToGraphPoint(e.clientX, e.clientY) });
    };
    const handleUp = () => setEdgeDraft(null); // Fallback: Loslassen außerhalb eines Nodes bricht ab
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [edgeDraft, clientToGraphPoint]);

  // ── Beziehung bewusst wählen (Phase 5A Punkt 5) ─────────────────────────
  // Kein stiller Standard-Beziehungstyp mehr. Loslassen über einem Zielnode
  // öffnet eine einfache Texteingabe ("Beziehung eingeben...") statt sofort
  // eine Kante anzulegen — die Software interpretiert nichts. Abbruch ohne
  // Eingabe (leer lassen, Escape) erzeugt bewusst KEINE Kante.
  interface EdgePromptState { sourceNodeId: string; targetNodeId: string; position: GraphNodePosition; value: string; }
  const [edgePrompt, setEdgePrompt] = useState<EdgePromptState | null>(null);
  // Phase 5B Punkt 1: Nachtest zeigte, dass ein Duplikat-Versuch das Prompt
  // kommentarlos schließt — keine technische Fehlermeldung, aber auch keine
  // Rückmeldung ist keine Lösung. Der Ablehnungsgrund aus GraphValidationService
  // ist bereits eine verständliche, undokumentierte Alltagssprache-Meldung
  // (z.B. "Eine Kante mit dem Beziehungstyp ... existiert bereits.") — die wird
  // hier einfach sichtbar gemacht, statt sie zu verwerfen.
  const [edgePromptError, setEdgePromptError] = useState<string | null>(null);
  const edgePromptInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (edgePrompt) edgePromptInputRef.current?.focus();
  }, [edgePrompt]);

  const handleNodePointerUp = (e: React.MouseEvent, targetNodeId: string) => {
    if (!edgeDraft) return;
    e.stopPropagation();
    const { sourceNodeId } = edgeDraft;
    setEdgeDraft(null);
    if (sourceNodeId === targetNodeId) return;
    setEdgePromptError(null);
    setEdgePrompt({ sourceNodeId, targetNodeId, position: clientToGraphPoint(e.clientX, e.clientY), value: '' });
  };

  const cancelEdgePrompt = () => { setEdgePrompt(null); setEdgePromptError(null); };

  const commitEdgePrompt = () => {
    if (!edgePrompt) return;
    const label = edgePrompt.value.trim();
    if (label.length === 0) { setEdgePrompt(null); return; } // keine Eingabe = keine Kante, nichts wird interpretiert

    // resolveRelationTypeId: exakte (case-insensitive) Übereinstimmung mit
    // einem bereits vorhandenen Typ wiederverwenden, sonst spontan einen
    // neuen eigenen anlegen. Läuft bewusst NICHT über die History (s.
    // Datei-Kommentar oben), nur die Kante selbst ist undo-fähig.
    const resolved = resolveRelationTypeId(label);
    if (resolved.error || !resolved.relationTypeId) { setEdgePromptError(resolved.error ?? null); return; }

    const edgeResult = recordCreateEdge(history, resolved.workingState, {
      sourceNodeId: edgePrompt.sourceNodeId, targetNodeId: edgePrompt.targetNodeId, relationTypeId: resolved.relationTypeId,
    });
    if (edgeResult.error || !edgeResult.entity) {
      // Prompt bleibt bewusst offen (statt setEdgePrompt(null)) — der Nutzer
      // sieht den Grund direkt unter der Eingabe und kann korrigieren oder
      // bewusst mit Escape abbrechen, statt zu rätseln, ob der Klick verpufft ist.
      setEdgePromptError(edgeResult.error ?? 'Diese Beziehung konnte nicht angelegt werden.');
      return;
    }
    setEdgePromptError(null);
    setEdgePrompt(null);
    onChange({ state: edgeResult.state, history: edgeResult.history });
    onEntityChanged?.({ kind: 'edge', entity: edgeResult.entity });
  };

  /** Exakte (case-insensitive) Übereinstimmung mit einem bestehenden
   *  Beziehungstyp wiederverwenden, sonst einen neuen anlegen — dieselbe
   *  Logik wie beim Kantenziehen (commitEdgePrompt), jetzt auch fürs
   *  nachträgliche Umbenennen einer bestehenden Kante gebraucht (Phase 5B). */
  const resolveRelationTypeId = (label: string): { workingState: GraphState; relationTypeId?: string; error?: string } => {
    const existing = [...state.relationTypesById.values()].find(
      rt => rt.label.trim().toLowerCase() === label.toLowerCase(),
    );
    if (existing) return { workingState: state, relationTypeId: existing.id };
    const createResult = createRelationType(state, { label });
    if (createResult.error || !createResult.entity) return { workingState: state, error: createResult.error };
    onEntityChanged?.({ kind: 'relationType', entity: createResult.entity });
    return { workingState: createResult.state, relationTypeId: createResult.entity.id };
  };

  // ── Beziehung ansehen/ändern/löschen (Phase 5B) ──────────────────────────
  // Klick auf die Kante wählt sie aus (s. Hit-Line im Rendering) — dieselbe
  // Selektion steuert Highlight (Ansehen), das Editier-Overlay (Ändern) und
  // die Entf-Taste (Löschen). Kein Kontextmenü, kein Formular — Muster aus
  // Phase 5A 1:1 auf Kanten übertragen: HTML-Overlay am Kantenmittelpunkt,
  // Text kommt aus dem bestehenden Beziehungstyp/Label, "Ändern" läuft über
  // dieselbe Frei-Text-Logik wie das Anlegen (resolveRelationTypeId oben),
  // inklusive derselben Duplikat-Rückmeldung wie in Punkt 1.
  interface EdgeEditDraft { edgeId: string; value: string; originalValue: string; }
  const [edgeEditDraft, setEdgeEditDraft] = useState<EdgeEditDraft | null>(null);
  const [edgeEditError, setEdgeEditError] = useState<string | null>(null);
  const [isEditingEdgeLabel, setIsEditingEdgeLabel] = useState(false);

  // Initialisiert den Entwurf nur bei Auswahl-Wechsel, nicht bei jeder
  // state-Änderung — dieselbe Überlegung wie beim notesDraft-Effekt oben
  // (sonst würde gerade getippter Text durch unabhängige Änderungen anderswo
  // überschrieben).
  useEffect(() => {
    if (!selection.selectedEdgeId) { setEdgeEditDraft(null); setEdgeEditError(null); return; }
    const edge = state.edgesById.get(selection.selectedEdgeId);
    if (!edge) { setEdgeEditDraft(null); return; }
    const relationType = state.relationTypesById.get(edge.relationTypeId);
    const currentLabel = edge.label || relationType?.label || '';
    setEdgeEditDraft({ edgeId: edge.id, value: currentLabel, originalValue: currentLabel });
    setEdgeEditError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection.selectedEdgeId]);

  const cancelEdgeEdit = () => {
    setEdgeEditDraft(prev => prev && { ...prev, value: prev.originalValue });
    setEdgeEditError(null);
  };

  const commitEdgeEdit = () => {
    if (!edgeEditDraft) return;
    const label = edgeEditDraft.value.trim();
    if (label.length === 0) { cancelEdgeEdit(); return; } // leer = keine Änderung, bestehender Typ bleibt

    const edge = state.edgesById.get(edgeEditDraft.edgeId);
    if (!edge) return;

    const resolved = resolveRelationTypeId(label);
    if (resolved.error || !resolved.relationTypeId) { setEdgeEditError(resolved.error ?? null); return; }
    if (resolved.relationTypeId === edge.relationTypeId) { setEdgeEditError(null); return; } // unverändert (auch nach Groß-/Kleinschreibung), kein Commit nötig

    const result = recordUpdateEdge(history, resolved.workingState, edgeEditDraft.edgeId, { relationTypeId: resolved.relationTypeId });
    if (result.error || !result.entity) {
      // Genau dieselbe Rückmeldung wie beim Neu-Anlegen (Punkt 1) — ein
      // Duplikat-Versuch beim Umbenennen darf ebenso wenig kommentarlos
      // verpuffen.
      setEdgeEditError(result.error ?? 'Diese Änderung konnte nicht gespeichert werden.');
      return;
    }
    setEdgeEditError(null);
    onChange({ state: result.state, history: result.history });
    onEntityChanged?.({ kind: 'edge', entity: result.entity });
    setEdgeEditDraft(prev => prev && { ...prev, originalValue: label });
  };

  const deleteSelectedEdge = () => {
    if (!selection.selectedEdgeId) return;
    const result = recordArchiveEdge(history, state, selection.selectedEdgeId);
    if (!result.error && result.entity) {
      onChange({ state: result.state, history: result.history });
      onSelectionChange(clearSelection(selection));
      onEntityChanged?.({ kind: 'edge', entity: result.entity });
    }
  };

  // ── Node/Kante löschen über die Entf-Taste (Phase 5A Punkt 3, Phase 5B) ──
  // Bewusst archiveNode/archiveEdge (undo-fähig, Soft Delete), nicht
  // purgeNode — das endgültige Löschen bleibt eine bewusste Zweitaktion, s.
  // Datenmodell. "Noch keine perfekte UX" (User-Vorgabe) — kein
  // Kontextmenü, keine Bestätigung, nur die Taste. Reagiert nicht, während
  // Titel, Notiz ODER Kanten-Label gerade bearbeitet werden (sonst würde
  // Löschen von Zeichen im Textfeld stattdessen die ganze Entität
  // archivieren) oder während gezogen wird. selectedNodeId/selectedEdgeId
  // schließen sich gegenseitig aus (s. graphSelectionService), deshalb reicht
  // ein einzelner Handler für beide.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (editingNodeId || isEditingNotes || isEditingEdgeLabel || nodeDrag || edgeDraft) return;
      if (e.key !== 'Delete') return;
      if (selection.selectedNodeId) {
        e.preventDefault();
        const result = recordArchiveNode(history, state, selection.selectedNodeId);
        if (!result.error && result.entity) {
          onChange({ state: result.state, history: result.history });
          onSelectionChange(clearSelection(selection));
          onEntityChanged?.({ kind: 'node', entity: result.entity });
        }
      } else if (selection.selectedEdgeId) {
        e.preventDefault();
        deleteSelectedEdge();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingNodeId, isEditingNotes, isEditingEdgeLabel, nodeDrag, edgeDraft, selection, history, state, onChange, onSelectionChange, onEntityChanged]);

  // ── Hintergrund: Klick = Auswahl aufheben, Doppelklick = neuer Node ─────
  const handleBackgroundClick = () => onSelectionChange(clearSelection(selection));

  const handleBackgroundDoubleClick = (e: React.MouseEvent) => {
    const position = clientToGraphPoint(e.clientX, e.clientY);
    const result = recordCreateNode(history, state, { title: 'Neuer Node', position });
    if (!result.error && result.entity) {
      onChange({ state: result.state, history: result.history });
      onSelectionChange(selectNode(selection, result.entity.id));
      onEntityChanged?.({ kind: 'node', entity: result.entity });
      // Sofort umbenennbar (Phase 5A Punkt 2) — der Platzhaltertitel ist nur
      // die Voraussetzung für den nicht-leeren-Titel-Constraint, nicht das,
      // was der Nutzer eigentlich benennen wollte. Text ist vorausgewählt
      // (s. beginEditingTitle-Effekt), der erste Tastendruck ersetzt ihn.
      beginEditingTitle(result.entity.id, result.entity.title);
    }
  };

  return (
    <div className="relative w-full h-full overflow-hidden">
      <div className="absolute top-3 right-3 z-10 flex gap-1.5">
        <button onClick={() => zoomBy(1.3)} className="w-8 h-8 flex items-center justify-center bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-300 rounded-lg shadow-sm text-sm font-black">+</button>
        <button onClick={() => zoomBy(1 / 1.3)} className="w-8 h-8 flex items-center justify-center bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-300 rounded-lg shadow-sm text-sm font-black">−</button>
        <button onClick={fitView} className="w-8 h-8 flex items-center justify-center bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-300 rounded-lg shadow-sm">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
        </button>
      </div>
      <svg
        ref={svgRef}
        className="w-full h-full"
        onClick={handleBackgroundClick}
        onDoubleClick={handleBackgroundDoubleClick}
      >
        <g ref={gRef}>
          <AnimatePresence initial={false}>
            {visibleEdges.map(edge => {
              const { x1, y1, x2, y2, midX, midY } = computeEdgeGeometry(edge);
              const edgeSelected = isEdgeSelected(selection, edge.id);
              // Bedeutung direkt auf der Fläche sichtbar (Phase 5B Punkt 2) —
              // ohne Menü/Inspector. `label` ist der Freitext-Override am
              // Edge-Datensatz (heute von keiner UI gesetzt, aber
              // vorrangig falls vorhanden), sonst der Name des Beziehungstyps.
              const relationType = state.relationTypesById.get(edge.relationTypeId);
              const rawLabel = edge.label || relationType?.label || '';
              const displayLabel = rawLabel.length > 20 ? `${rawLabel.slice(0, 19)}…` : rawLabel;
              const labelOffsetY = (edgeParallelIndex.get(edge.id) ?? 0) * 14;
              const labelWidth = Math.max(28, displayLabel.length * 5 + 12);
              return (
                <motion.g
                  key={edge.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  {/* Unsichtbarer breiter Hit-Bereich (Phase 5B) — die
                      sichtbare Linie selbst ist mit 2px zu schmal, um
                      zuverlässig klickbar zu sein. */}
                  <line
                    x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke="transparent" strokeWidth={14}
                    onClick={e => { e.stopPropagation(); onSelectionChange(selectEdge(selection, edge.id)); }}
                    style={{ cursor: 'pointer' }}
                  />
                  <line
                    x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke={edgeSelected ? 'var(--primary)' : 'var(--border-color, #cbd5e1)'}
                    strokeWidth={edgeSelected ? 3 : 2}
                    style={{ pointerEvents: 'none' }}
                  />
                  {/* Während der Bearbeitung übernimmt das HTML-Overlay
                      (Editier-Input) exakt dieselbe Stelle — Label hier
                      ausblenden statt doppelt zu rendern. Bewusst horizontal
                      (nicht mit der Kante rotiert): bleibt bei jedem
                      Kantenwinkel aufrecht lesbar, wie die Node-Titel auch. */}
                  {!edgeSelected && displayLabel && (
                    <g transform={`translate(${midX}, ${midY + labelOffsetY})`} style={{ pointerEvents: 'none' }}>
                      <rect
                        x={-labelWidth / 2} y={-8} width={labelWidth} height={16} rx={4}
                        fill="var(--bg-sidebar, #fff)" stroke="var(--border-color, #e2e8f0)" strokeWidth={1}
                      />
                      <text
                        textAnchor="middle" y={3}
                        className="text-[9px] font-bold fill-slate-500 dark:fill-slate-300 select-none"
                      >
                        {displayLabel}
                      </text>
                    </g>
                  )}
                </motion.g>
              );
            })}
            {edgeDraft && (
              <line
                x1={positionOf(edgeDraft.sourceNodeId).x} y1={positionOf(edgeDraft.sourceNodeId).y}
                x2={edgeDraft.pointer.x} y2={edgeDraft.pointer.y}
                stroke="var(--primary)" strokeWidth={2} strokeDasharray="4 4"
              />
            )}
            {activeNodes.map(node => {
              const pos = nodeDrag?.nodeId === node.id ? nodeDrag.currentPos : positionOf(node.id);
              const selected = isSelected(selection, node.id);
              const hovered = isHovered(selection, node.id);
              const fill = node.color || (selected ? 'var(--primary)' : 'var(--bg-sidebar, #fff)');
              return (
                <motion.g
                  key={node.id}
                  {...{ [NODE_DATA_ATTR]: true }}
                  initial={{ x: pos.x, y: pos.y, opacity: 0, scale: 0.6 }}
                  animate={{ x: pos.x, y: pos.y, opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  onMouseDown={e => handleNodePointerDown(e, node.id)}
                  onMouseUp={e => handleNodePointerUp(e, node.id)}
                  // Verhindert, dass das native, nach mousedown+mouseup
                  // automatisch ausgelöste click-Event zum Hintergrund
                  // hochbubbelt und dort die gerade erst gesetzte Auswahl
                  // sofort wieder löscht (handleBackgroundClick).
                  onClick={e => e.stopPropagation()}
                  // stopPropagation verhindert weiterhin, dass der Doppelklick
                  // bis zum Hintergrund durchbubbelt und dort einen zweiten
                  // Node anlegt (Phase 5A Punkt 1) — zusätzlich öffnet er jetzt
                  // die Titel-Bearbeitung (Punkt 2), statt nur ins Leere zu laufen.
                  onDoubleClick={e => { e.stopPropagation(); beginEditingTitle(node.id, node.title); }}
                  onMouseEnter={() => onSelectionChange(hoverNode(selection, node.id))}
                  onMouseLeave={() => onSelectionChange(hoverNode(selection, undefined))}
                  style={{ cursor: 'pointer' }}
                >
                  <circle
                    r={NODE_RADIUS}
                    fill={fill}
                    stroke={selected ? 'var(--primary)' : 'var(--border-color, #e2e8f0)'}
                    strokeWidth={selected ? 3 : 1.5}
                  />
                  {editingNodeId !== node.id && (
                    <text
                      textAnchor="middle" y={4}
                      className={`text-[10px] font-bold select-none ${node.color || selected ? 'fill-white' : 'fill-slate-700 dark:fill-white'}`}
                      style={{ pointerEvents: 'none' }}
                    >
                      {node.title.length > 14 ? `${node.title.slice(0, 13)}…` : node.title}
                    </text>
                  )}
                  {(hovered || selected) && (
                    <circle
                      cx={HANDLE_DISTANCE} cy={0} r={HANDLE_RADIUS}
                      fill="var(--primary)"
                      onMouseDown={e => handleHandlePointerDown(e, node.id)}
                      style={{ cursor: 'crosshair' }}
                    />
                  )}
                </motion.g>
              );
            })}
          </AnimatePresence>
        </g>
      </svg>
      {editingNodeId && (() => {
        const pos = positionOf(editingNodeId);
        const screenX = zoomTransform.x + zoomTransform.k * pos.x;
        const screenY = zoomTransform.y + zoomTransform.k * pos.y;
        return (
          <input
            ref={editInputRef}
            value={editingValue}
            onChange={e => setEditingValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); commitTitleEdit(); }
              else if (e.key === 'Escape') { e.preventDefault(); cancelTitleEdit(); }
            }}
            onBlur={commitTitleEdit}
            className="absolute text-[10px] font-bold text-center rounded-md px-1 py-1 outline-none border-2 bg-white dark:bg-slate-800 dark:text-white"
            style={{
              left: screenX, top: screenY, transform: 'translate(-50%, -50%)',
              width: NODE_RADIUS * 2 + 16, borderColor: 'var(--primary)', zIndex: 20,
            }}
          />
        );
      })()}
      {notesDraft && (() => {
        const pos = positionOf(notesDraft.nodeId);
        const screenX = zoomTransform.x + zoomTransform.k * pos.x;
        const screenY = zoomTransform.y + zoomTransform.k * pos.y;
        return (
          <textarea
            value={notesDraft.value}
            placeholder="Notiz — warum ist das wichtig?"
            onChange={e => setNotesDraft(prev => prev && { ...prev, value: e.target.value })}
            onFocus={() => setIsEditingNotes(true)}
            onBlur={commitNotes}
            className="absolute text-[10px] rounded-md px-2 py-1.5 outline-none border resize-none bg-white dark:bg-slate-800 dark:text-white"
            style={{
              left: screenX, top: screenY + NODE_RADIUS * zoomTransform.k + 10, transform: 'translate(-50%, 0)',
              width: 180, height: 56, borderColor: 'var(--border-color, #e2e8f0)', zIndex: 15,
            }}
          />
        );
      })()}
      {edgePrompt && (() => {
        const screenX = zoomTransform.x + zoomTransform.k * edgePrompt.position.x;
        const screenY = zoomTransform.y + zoomTransform.k * edgePrompt.position.y;
        return (
          <div className="absolute" style={{ left: screenX, top: screenY, transform: 'translate(-50%, -50%)', zIndex: 25 }}>
            <input
              ref={edgePromptInputRef}
              value={edgePrompt.value}
              placeholder="Beziehung eingeben…"
              onChange={e => {
                setEdgePrompt(prev => prev && { ...prev, value: e.target.value });
                setEdgePromptError(null);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); commitEdgePrompt(); }
                else if (e.key === 'Escape') { e.preventDefault(); cancelEdgePrompt(); }
              }}
              onBlur={cancelEdgePrompt}
              className="text-[10px] font-bold rounded-md px-2 py-1.5 outline-none border-2 bg-white dark:bg-slate-800 dark:text-white"
              style={{ width: 160, borderColor: edgePromptError ? '#ef4444' : 'var(--primary)' }}
            />
            {edgePromptError && (
              <div
                className="text-[9px] font-bold text-red-500 bg-white dark:bg-slate-800 rounded px-1.5 py-1 shadow-sm mt-1"
                style={{ maxWidth: 220 }}
              >
                {edgePromptError}
              </div>
            )}
          </div>
        );
      })()}
      {selection.selectedEdgeId && edgeEditDraft && (() => {
        const edge = state.edgesById.get(selection.selectedEdgeId!);
        if (!edge) return null;
        const { midX, midY } = computeEdgeGeometry(edge);
        // Derselbe Versatz wie beim Label-Rendering oben — sonst würde das
        // Overlay beim Auswählen einer von mehreren parallelen Kanten an
        // eine andere Stelle springen als das gerade sichtbare Label.
        const labelOffsetY = (edgeParallelIndex.get(edge.id) ?? 0) * 14;
        const screenX = zoomTransform.x + zoomTransform.k * midX;
        const screenY = zoomTransform.y + zoomTransform.k * (midY + labelOffsetY);
        return (
          <div className="absolute flex items-center gap-1" style={{ left: screenX, top: screenY, transform: 'translate(-50%, -50%)', zIndex: 25 }}>
            <input
              value={edgeEditDraft.value}
              onChange={e => {
                setEdgeEditDraft(prev => prev && { ...prev, value: e.target.value });
                setEdgeEditError(null);
              }}
              onFocus={() => setIsEditingEdgeLabel(true)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); commitEdgeEdit(); }
                else if (e.key === 'Escape') { e.preventDefault(); cancelEdgeEdit(); }
              }}
              onBlur={() => { setIsEditingEdgeLabel(false); commitEdgeEdit(); }}
              className="text-[10px] font-bold rounded-md px-2 py-1.5 outline-none border-2 bg-white dark:bg-slate-800 dark:text-white"
              style={{ width: 140, borderColor: edgeEditError ? '#ef4444' : 'var(--primary)' }}
            />
            <button
              onClick={deleteSelectedEdge}
              title="Beziehung löschen"
              className="w-6 h-6 flex items-center justify-center rounded-md bg-white dark:bg-slate-800 text-red-500 border shrink-0 font-bold"
              style={{ borderColor: 'var(--border-color, #e2e8f0)' }}
            >
              ×
            </button>
            {edgeEditError && (
              <div
                className="absolute text-[9px] font-bold text-red-500 bg-white dark:bg-slate-800 rounded px-1.5 py-1 shadow-sm"
                style={{ maxWidth: 220, top: '100%', left: 0, marginTop: 4 }}
              >
                {edgeEditError}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
};
