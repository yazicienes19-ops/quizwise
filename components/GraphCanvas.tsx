import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { motion, AnimatePresence } from 'framer-motion';
import type { GraphState, GraphNodePosition, GraphEntityChange } from '../services/graph/types';
import { buildGraphIndex } from '../services/graph/graphIndex';
import { resolveOverlaps } from '../services/graph/graphLayoutEngine';
import {
  type GraphSelectionState, selectNode, clearSelection, hoverNode, isSelected, isHovered,
} from '../services/graph/graphSelectionService';
import { type GraphHistory, recordCreateNode, recordUpdateNode, recordArchiveNode, recordCreateEdge } from '../services/graph/graphHistoryService';

/**
 * Phase 3 — reine Graph Engine: SVG-Rendering, Pan/Zoom, Selection,
 * Drag-to-Move, Node-/Kanten-Erstellung ohne Formular (Platzhalter-Titel
 * bzw. Standard-Beziehungstyp — Picker/Formulare sind spätere UI-Arbeit).
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
 */

export interface GraphCanvasProps {
  state: GraphState;
  history: GraphHistory;
  selection: GraphSelectionState;
  onChange: (next: { state: GraphState; history: GraphHistory }) => void;
  onSelectionChange: (next: GraphSelectionState) => void;
  onEntityChanged?: (change: GraphEntityChange) => void;
  /** Ohne UI-Picker (Phase 3) braucht eine neue Kante einen Standard-
   *  Beziehungstyp. Fehlt die Prop, wird der eingebaute Typ mit der
   *  niedrigsten sortOrder verwendet; ist gar keiner geladen, ist
   *  Kantenerstellung schlicht nicht möglich (kein Fehler, nur kein Handle). */
  defaultRelationTypeId?: string;
}

interface ZoomTransform { x: number; y: number; k: number; }

const NODE_RADIUS = 28;
const HANDLE_RADIUS = 6;
const HANDLE_DISTANCE = NODE_RADIUS + 14;
const DRAG_THRESHOLD_PX = 4;
const NODE_DATA_ATTR = 'data-graph-node';

const pickDefaultRelationTypeId = (state: GraphState): string | undefined => {
  const types = [...state.relationTypesById.values()];
  const builtIn = types.filter(t => t.isBuiltIn).sort((a, b) => a.sortOrder - b.sortOrder);
  return builtIn[0]?.id ?? types[0]?.id;
};

export const GraphCanvas: React.FC<GraphCanvasProps> = ({
  state, history, selection, onChange, onSelectionChange, onEntityChanged, defaultRelationTypeId,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const gRef = useRef<SVGGElement | null>(null);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [zoomTransform, setZoomTransform] = useState<ZoomTransform>({ x: 0, y: 0, k: 1 });

  const resolvedRelationTypeId = defaultRelationTypeId ?? pickDefaultRelationTypeId(state);

  // ── Sichtbare Nodes/Kanten ──────────────────────────────────────────────
  const activeNodes = useMemo(
    () => [...state.nodesById.values()].filter(n => n.archivedAt === undefined),
    [state.nodesById],
  );
  const index = useMemo(() => buildGraphIndex(state), [state]);
  const visibleEdges = useMemo(() => [...index.edgesBySource.values()].flat(), [index]);

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
    if (e.button !== 0 || !resolvedRelationTypeId) return;
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

  // ── Node löschen über die Entf-Taste (Phase 5A Punkt 3) ─────────────────
  // Bewusst archiveNode (undo-fähig, Soft Delete), nicht purgeNode — das
  // endgültige Löschen bleibt eine bewusste Zweitaktion, s. Datenmodell.
  // "Noch keine perfekte UX" (User-Vorgabe) — kein Kontextmenü, keine
  // Bestätigung, nur die Taste. Reagiert nicht, während der Titel ODER die
  // Notiz gerade bearbeitet wird (sonst würde Löschen von Zeichen im
  // Textfeld/der Textarea stattdessen den ganzen Node archivieren) oder
  // während gezogen wird.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (editingNodeId || isEditingNotes || nodeDrag || edgeDraft) return;
      if (e.key !== 'Delete' || !selection.selectedNodeId) return;
      e.preventDefault();
      const result = recordArchiveNode(history, state, selection.selectedNodeId);
      if (!result.error && result.entity) {
        onChange({ state: result.state, history: result.history });
        onSelectionChange(clearSelection(selection));
        onEntityChanged?.({ kind: 'node', entity: result.entity });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editingNodeId, isEditingNotes, nodeDrag, edgeDraft, selection, history, state, onChange, onSelectionChange, onEntityChanged]);

  const handleNodePointerUp = (e: React.MouseEvent, targetNodeId: string) => {
    if (!edgeDraft || !resolvedRelationTypeId) return;
    e.stopPropagation();
    const { sourceNodeId } = edgeDraft;
    setEdgeDraft(null);
    if (sourceNodeId === targetNodeId) return;
    const result = recordCreateEdge(history, state, { sourceNodeId, targetNodeId, relationTypeId: resolvedRelationTypeId });
    if (!result.error && result.entity) {
      onChange({ state: result.state, history: result.history });
      onEntityChanged?.({ kind: 'edge', entity: result.entity });
    }
  };

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
              const from = positionOf(edge.sourceNodeId);
              const to = positionOf(edge.targetNodeId);
              const angle = Math.atan2(to.y - from.y, to.x - from.x);
              const x1 = from.x + Math.cos(angle) * NODE_RADIUS;
              const y1 = from.y + Math.sin(angle) * NODE_RADIUS;
              const x2 = to.x - Math.cos(angle) * NODE_RADIUS;
              const y2 = to.y - Math.sin(angle) * NODE_RADIUS;
              return (
                <motion.line
                  key={edge.id}
                  x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke="var(--border-color, #cbd5e1)"
                  strokeWidth={2}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                />
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
                  {(hovered || selected) && resolvedRelationTypeId && (
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
    </div>
  );
};
