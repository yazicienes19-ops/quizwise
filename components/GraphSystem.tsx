import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Collection, FlashcardDeck, ProcessedDocument } from '../types';
import type { GraphScope, GraphState } from '../services/graph/types';
import { canUndo, canRedo, recordUpdateNode, recordCreateEdge, recordCreateNode, type GraphHistory } from '../services/graph/graphHistoryService';
import { clearSelection, selectNode } from '../services/graph/graphSelectionService';
import { buildGraphIndex, outgoingEdges, incomingEdges, describeRelatedEntry } from '../services/graph/graphIndex';
import { computeNodeInsights, groupInsightsByNode } from '../services/graph/graphInsightsService';
import { buildRelationSuggestionSource, validateRelationSuggestions, type RelationSuggestion } from '../services/graph/graphRelationSuggestionSource';
import { buildDuplicateSuggestionSource, validateDuplicateSuggestions, type DuplicateSuggestion } from '../services/graph/graphDuplicateSuggestionSource';
import { buildMissingConceptSource, validateMissingConceptSuggestions, type MissingConceptSuggestion } from '../services/graph/graphMissingConceptSource';
import { shouldUsePdfReader } from '../services/libraryService';
import { useKnowledgeGraph } from '../hooks/useKnowledgeGraph';
import { GraphCanvas } from './GraphCanvas';
import { GraphEdgeExplainOverlay } from './GraphEdgeExplainOverlay';
import { GraphNodeDetailPanel } from './GraphNodeDetailPanel';
import { GraphLearningOverlay, type GraphLearningActivity } from './GraphLearningOverlay';
import { useTranslation } from '../i18n/I18nProvider';
import { toast } from '../services/toast';
import { resolveErrorMessage } from '../services/errorMessages';
import { suggestMissingRelationships, suggestDuplicateConcepts, suggestMissingConcepts, type GenerationSource } from '../services/geminiService';

const SplitScreenReader = React.lazy(() => import('./SplitScreenReader').then(m => ({ default: m.SplitScreenReader })));
const PdfSplitScreenReader = React.lazy(() => import('./PdfSplitScreenReader').then(m => ({ default: m.PdfSplitScreenReader })));

/**
 * Produktseite "Wissensnetz" — erste reale Integration des Knowledge-Graph-
 * Features (bisher nur über den Dev-Harness erreichbar, s.
 * KNOWLEDGE_GRAPH_PHASE1_PLAN.md). Verbindet GraphCanvas mit dem bereits
 * bestehenden App-weiten Fach-Kontext ("aktives Modul", Sidebar-Auswahl in
 * Layout.tsx) statt einer eigenen Fach-Auswahl — ein Graph pro Fach ist die
 * in Phase 1 getroffene Architekturentscheidung, kein neues UI-Konzept nötig.
 *
 * Kein eigener "Neu anlegen"-Dialog wie bei der alten Mindmap (die durfte
 * beliebig viele benannte Items pro Fach haben) — es gibt genau einen Graphen
 * pro Fach bzw. einen fachübergreifenden ({kind:'all'}), useKnowledgeGraph
 * erzeugt ihn beim ersten Öffnen automatisch leer.
 *
 * Phase 3 ("Eigene Unterlagen") — Architekturentscheidung "Variante A": der
 * bestehende Reader (SplitScreenReader/PdfSplitScreenReader, unverändert,
 * keine Kopie) wird HIER als Vollbild-Overlay geöffnet, NICHT über den
 * globalen ActiveTab-Wechsel in AppContent.tsx. Grund: jeder bestehende
 * Reader-Aufruf hardcoded `onBack` auf ActiveTab.LIBRARY, und ein Tab-Wechsel
 * würde diese Komponente (und damit useKnowledgeGraph) komplett unmounten —
 * Auswahl/History sind bereits heute nicht über einen Mount hinweg persistent,
 * und Zoom/Pan (GraphCanvas-lokaler State) werden NIRGENDS persistiert. Ein
 * Tab-Wechsel hätte "gleicher Zoom, gleiche Position" strukturell unmöglich
 * gemacht. Mit dem Overlay-Ansatz unmountet nichts — der gesamte Wissensnetz-
 * Zustand bleibt exakt erhalten, es gibt nichts wiederherzustellen.
 * `createPortal` nach `document.body`, weil der Karten-Container weiter unten
 * bewusst `overflow-hidden` hat (rundet die Ecken) — ein normales absolutes
 * Overlay würde daran geclippt, ein Portal umgeht das sauber.
 *
 * Phase 4 ("Verwandte Konzepte") — `onSelectNode` ruft nur `selectNode()`
 * auf, denselben Selektionswechsel, den ein Klick auf den Node im Canvas
 * ohnehin auslöst. Kein Sondercode nötig, damit Zoom/Pan dabei unverändert
 * bleiben — GraphCanvas unmountet nicht, und Auswahländerungen bewegen die
 * Kamera schon heute nirgends.
 *
 * Phase 5 ("Aktiv lernen") — letzte große Funktionsphase. `activeActivity`
 * hält nur die Art (Karteikarten/Quiz/Feynman/KI-Erklärung), der Ziel-Node
 * wird live aus `graph.selection.selectedNodeId` aufgelöst (dieselbe
 * "immer frisch, nie eine eigene Kopie"-Regel wie schon in Phase 4) — dieser
 * Overlay und der Reader-Overlay (Phase 3) sind strukturell gleich
 * (Vollbild-Portal, GraphCanvas bleibt gemounted) und schon dadurch
 * gegenseitig exklusiv: ist einer offen, deckt er den ganzen Bildschirm ab,
 * der Panel-Button für den jeweils anderen ist währenddessen gar nicht
 * klickbar. Siehe GraphLearningOverlay.tsx für die eigentliche Umsetzung
 * (jede Aktivität ruft exakt dieselbe bestehende Service-Funktion/
 * Komponente wie die "normale" App — kein zweiter Workflow).
 */

interface GraphSystemProps {
  userId?: string;
  collections: Collection[];
  activeModuleId?: string | null;
  documents: ProcessedDocument[];
  getDocumentSource: (doc: ProcessedDocument) => GenerationSource;
  /** Identisch zur Reader-Verdrahtung in AppContent.tsx — der Reader bleibt
   *  der Reader, sein "Erklären"-Sprung zu Feynman verlässt bewusst das
   *  Wissensnetz (fachweite Aktion, kein Sonderverhalten hier). */
  onStartFeynman: (topic: string | null) => void;
  /** Direktstart von einer Dokument-Aktionskarte (SourceDetailPage) — springt
   *  zum Wissensnetz DIESES Fachs, legt aber bewusst nichts automatisch an
   *  (KI/Automatik schreibt nie in den Graphen, s. services/graph/graphMutationService.ts). */
  initialDoc?: ProcessedDocument;
  /** Phase 5 ("Aktiv lernen") — identische App-weite Karteikarten-/Metrik-/
   *  Fehlerbehandlung wie AppContent.tsx selbst nutzt, damit ein node-
   *  gestartetes Quiz/Feynman/Karten genauso ins Lernprofil/den Streak/die
   *  Limit-Prüfung einzahlt wie jede andere Aktivität in der App. */
  decks: FlashcardDeck[];
  onDecksChange: (decks: FlashcardDeck[]) => void;
  updateMetricsAfterSession: (score: number, name: string, type: 'quiz' | 'exam' | 'recall' | 'cards') => Promise<void>;
  onApiError: (e: unknown) => void;
  /** Globaler App-Theme-Zustand (User-Vorgabe 2026-08-04: kein eigener
   *  Wissensnetz-Modus mehr) — kommt von useAuth() über AppContent.tsx. */
  isDark: boolean;
}

export const GraphSystem: React.FC<GraphSystemProps> = ({
  userId, collections, activeModuleId, documents, getDocumentSource, onStartFeynman, initialDoc,
  decks, onDecksChange, updateMetricsAfterSession, onApiError, isDark,
}) => {
  const { t } = useTranslation();

  const effectiveCollectionId = initialDoc?.collectionId ?? activeModuleId ?? undefined;
  const scope: GraphScope = effectiveCollectionId
    ? { kind: 'collection', collectionId: effectiveCollectionId }
    : { kind: 'all' };
  const activeCollection = effectiveCollectionId
    ? collections.find(c => c.id === effectiveCollectionId)
    : undefined;

  const graph = useKnowledgeGraph({ scope, userId });

  // Nodes einem Fach nachträglich zuordnen (User-Fund 2026-08-05): unter
  // "Alle Fächer" angelegte Nodes bekommen KEINE collectionId (s.
  // GraphCanvas.tsx handleBackgroundDoubleClick) — dadurch tauchen sie nie
  // im fachspezifischen Wissensnetz auf, obwohl sie inhaltlich zu einem
  // bestimmten Fach gehören. Nur relevant/sichtbar in der "Alle Fächer"-
  // Gesamtansicht; bewusst NUR bereits unzugeordnete Nodes (collectionId
  // === undefined), niemals bereits einem ANDEREN Fach zugeordnete —
  // sonst würde diese Aktion versehentlich Nodes aus fremden Fächern
  // umhängen, nur weil sie in der Gesamtansicht mit sichtbar sind.
  const unassignedNodes = scope.kind === 'all'
    ? [...graph.state.nodesById.values()].filter(n => n.archivedAt === undefined && n.collectionId === undefined)
    : [];
  const [moveTargetId, setMoveTargetId] = useState('');
  const [isMoving, setIsMoving] = useState(false);

  // Wissensnetz-Coach, Punkt 3 (rein strukturell, kein KI-Call) — s. Memory
  // project_quizwise_wissensnetz_coach.md. Standardmäßig aus, damit die
  // Hinweise als optionale Unterstützung wahrgenommen werden, nicht als
  // Dauerzustand (User-Vorgabe im Plan).
  const [showInsights, setShowInsights] = useState(false);
  // .size (betroffene Nodes), nicht .length (Insight-Einträge) — ein Node
  // ohne Beschreibung UND Notizen hat 2 Einträge, soll aber nur 1x zählen.
  const nodeInsightCount = useMemo(() => groupInsightsByNode(computeNodeInsights(graph.state)).size, [graph.state]);

  // Wissensnetz-Coach, Baustein 4 ("Fehlende Beziehungen erkennen", Punkt 1)
  // — erste graphweite KI-Aktion, deshalb bewusst KEIN Dauer-Toggle wie
  // showInsights (das ist kostenlos/strukturell), sondern eine einmalige,
  // explizit ausgelöste Aktion. null = noch nicht geprüft/verworfen,
  // [] = geprüft, nichts Plausibles gefunden.
  const [missingRelationSuggestions, setMissingRelationSuggestions] = useState<RelationSuggestion[] | null>(null);
  const [isCheckingRelations, setIsCheckingRelations] = useState(false);

  const handleCheckMissingRelations = async () => {
    if (isCheckingRelations) return;
    setIsCheckingRelations(true);
    try {
      const built = buildRelationSuggestionSource(graph.state);
      if (!built) {
        toast.success('Zu wenig Nodes für einen Beziehungs-Check.');
        return;
      }
      const raw = await suggestMissingRelationships(built.source);
      const valid = validateRelationSuggestions(graph.state, raw);
      setMissingRelationSuggestions(valid);
      if (valid.length === 0) toast.success('Keine plausiblen fehlenden Beziehungen gefunden.');
    } catch (e) {
      onApiError(e);
      toast.error(resolveErrorMessage(e));
    } finally {
      setIsCheckingRelations(false);
    }
  };

  const handleAcceptRelationSuggestion = (suggestion: RelationSuggestion) => {
    const result = recordCreateEdge(graph.history, graph.state, {
      sourceNodeId: suggestion.sourceNodeId,
      targetNodeId: suggestion.targetNodeId,
    });
    if (!result.error && result.entity) {
      graph.onChange({ state: result.state, history: result.history });
      graph.onEntityChanged({ kind: 'edge', entity: result.entity });
    }
    setMissingRelationSuggestions(prev => (prev ?? []).filter(s => s !== suggestion));
  };

  const handleDiscardRelationSuggestion = (suggestion: RelationSuggestion) => {
    setMissingRelationSuggestions(prev => (prev ?? []).filter(s => s !== suggestion));
  };

  // Wissensnetz-Coach, Baustein 5 ("Doppelte Konzepte erkennen", Punkt 6) —
  // bewusst KEIN automatisches Zusammenführen (s. Plan-Begründung): "Ansehen"
  // öffnet nur das bestehende Detail-Panel für Node A, der Nutzer entscheidet
  // und handelt selbst (umbenennen/Notizen übertragen/archivieren über die
  // dort bereits vorhandenen Werkzeuge).
  const [duplicateSuggestions, setDuplicateSuggestions] = useState<DuplicateSuggestion[] | null>(null);
  const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false);

  const handleCheckDuplicates = async () => {
    if (isCheckingDuplicates) return;
    setIsCheckingDuplicates(true);
    try {
      const built = buildDuplicateSuggestionSource(graph.state);
      if (!built) {
        toast.success('Zu wenig Nodes für einen Duplikat-Check.');
        return;
      }
      const raw = await suggestDuplicateConcepts(built.source);
      const valid = validateDuplicateSuggestions(graph.state, raw);
      setDuplicateSuggestions(valid);
      if (valid.length === 0) toast.success('Keine vermutlichen Duplikate gefunden.');
    } catch (e) {
      onApiError(e);
      toast.error(resolveErrorMessage(e));
    } finally {
      setIsCheckingDuplicates(false);
    }
  };

  const handleViewDuplicateSuggestion = (suggestion: DuplicateSuggestion) => {
    graph.onSelectionChange(selectNode(graph.selection, suggestion.nodeAId));
    setDuplicateSuggestions(prev => (prev ?? []).filter(s => s !== suggestion));
  };

  const handleDiscardDuplicateSuggestion = (suggestion: DuplicateSuggestion) => {
    setDuplicateSuggestions(prev => (prev ?? []).filter(s => s !== suggestion));
  };

  // Wissensnetz-Coach, Baustein 6 ("Fehlende Konzepte erkennen", Punkt 2,
  // letzter Baustein der Roadmap) — bewusst NUR Dokumente, die der Nutzer
  // über "Eigene Unterlagen" mit Nodes DIESES Graphen verknüpft hat, kein
  // Abgleich gegen den gesamten Dokumentbestand des Fachs (User-Vorgabe).
  const [missingConceptSuggestions, setMissingConceptSuggestions] = useState<MissingConceptSuggestion[] | null>(null);
  const [isCheckingConcepts, setIsCheckingConcepts] = useState(false);

  const handleCheckMissingConcepts = async () => {
    if (isCheckingConcepts) return;
    setIsCheckingConcepts(true);
    try {
      const built = buildMissingConceptSource(graph.state, documents);
      if (built.status === 'no-linked-documents') {
        toast.success('Keine mit Nodes verknüpften Dokumente gefunden — zuerst über "Eigene Unterlagen" welche verknüpfen.');
        return;
      }
      if (built.status === 'no-readable-documents') {
        toast.success(`${built.linkedCount} verknüpfte${built.linkedCount === 1 ? 's' : ''} Dokument${built.linkedCount === 1 ? '' : 'e'} noch nicht lesbar — Digest läuft noch oder ist fehlgeschlagen. Später erneut versuchen.`);
        return;
      }
      const raw = await suggestMissingConcepts(built.source);
      const valid = validateMissingConceptSuggestions(graph.state, raw);
      setMissingConceptSuggestions(valid);
      if (valid.length === 0) toast.success('Keine fehlenden Konzepte gefunden — der Graph deckt das verknüpfte Material bereits ab.');
    } catch (e) {
      onApiError(e);
      toast.error(resolveErrorMessage(e));
    } finally {
      setIsCheckingConcepts(false);
    }
  };

  const handleCreateNodeFromSuggestion = (suggestion: MissingConceptSuggestion, index: number) => {
    const activeNodeList = [...graph.state.nodesById.values()].filter(n => n.archivedAt === undefined);
    const centroid = activeNodeList.length > 0
      ? {
          x: activeNodeList.reduce((sum, n) => sum + n.position.x, 0) / activeNodeList.length,
          y: activeNodeList.reduce((sum, n) => sum + n.position.y, 0) / activeNodeList.length,
        }
      : { x: 0, y: 0 };
    // Gleiches Muster wie GraphCanvas.tsx' Doppelklick-Node-Erstellung —
    // collectionId nur im fachspezifischen Scope, hauptthema nur beim
    // allerersten Node (hier praktisch nie, da verknüpfte Dokumente bereits
    // mindestens einen bestehenden Node voraussetzen).
    const collectionId = scope.kind === 'collection' ? scope.collectionId : undefined;
    const hierarchyLevel = activeNodeList.length === 0 ? 'hauptthema' : undefined;

    const result = recordCreateNode(graph.history, graph.state, {
      title: suggestion.title,
      description: suggestion.description,
      position: { x: centroid.x + index * 40, y: centroid.y + index * 40 },
      collectionId,
      hierarchyLevel,
    });
    if (!result.error && result.entity) {
      graph.onChange({ state: result.state, history: result.history });
      graph.onEntityChanged({ kind: 'node', entity: result.entity });
    }
    setMissingConceptSuggestions(prev => (prev ?? []).filter(s => s !== suggestion));
  };

  const handleDiscardMissingConceptSuggestion = (suggestion: MissingConceptSuggestion) => {
    setMissingConceptSuggestions(prev => (prev ?? []).filter(s => s !== suggestion));
  };

  const handleAssignToCollection = () => {
    if (!moveTargetId || unassignedNodes.length === 0) return;
    setIsMoving(true);
    let workingState: GraphState = graph.state;
    let workingHistory: GraphHistory = graph.history;
    const changedEntities: Parameters<typeof graph.onEntityChanged>[0][] = [];
    for (const node of unassignedNodes) {
      const result = recordUpdateNode(workingHistory, workingState, node.id, { collectionId: moveTargetId });
      if (!result.error && result.entity) {
        workingState = result.state;
        workingHistory = result.history;
        changedEntities.push({ kind: 'node', entity: result.entity });
      }
    }
    graph.onChange({ state: workingState, history: workingHistory });
    changedEntities.forEach(change => graph.onEntityChanged(change));
    setMoveTargetId('');
    setIsMoving(false);
    toast.success(`${changedEntities.length} ${changedEntities.length === 1 ? 'Node' : 'Nodes'} zugeordnet.`);
  };

  // Welches Dokument gerade im Reader-Overlay offen ist — nur eine ID, damit
  // sich das offene Dokument beim Umbenennen/Neuladen der documents-Liste
  // automatisch mit aktualisiert (kein veralteter, eingefrorener Snapshot).
  const [openDocumentId, setOpenDocumentId] = useState<string | null>(null);
  const openDocument = documents.find(d => d.id === openDocumentId);

  // Phase 5 ("Aktiv lernen") — nur die Art merken, der Node wird live
  // aufgelöst (s. Datei-Kommentar oben).
  const [activeActivity, setActiveActivity] = useState<GraphLearningActivity | null>(null);
  const activeActivityNode = activeActivity ? graph.state.nodesById.get(graph.selection.selectedNodeId ?? '') : undefined;

  // Node-Dialog (KI-Erklärung, s. GraphLearningOverlay): braucht dieselben
  // "Verwandte Konzepte"-Einträge wie das Seitenpanel, damit Rückfragen zur
  // Beziehung zu verbundenen Konzepten beantwortbar sind. Derselbe Index wie
  // GraphNodeDetailPanel, nur hier gebraucht, wenn eine Aktivität offen ist.
  const relatedConceptEntries = useMemo(() => {
    if (!activeActivityNode) return [];
    const index = buildGraphIndex(graph.state);
    return [
      ...outgoingEdges(index, activeActivityNode.id).map(edge => describeRelatedEntry(graph.state, edge, true)),
      ...incomingEdges(index, activeActivityNode.id).map(edge => describeRelatedEntry(graph.state, edge, false)),
    ].filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  }, [activeActivityNode, graph.state]);

  // Verschwindet der Node während einer laufenden Aktivität (z.B. Undo
  // archiviert ihn), sauber schließen statt eine Karteileiche zu zeigen —
  // dieselbe Regel wie im Panel selbst.
  useEffect(() => {
    if (activeActivity && !activeActivityNode) setActiveActivity(null);
  }, [activeActivity, activeActivityNode]);

  // Wissensnetz-Coach, Baustein 2 ("Beziehungen erklären", s.
  // GraphEdgeExplainOverlay.tsx) — nur die ID merken, dieselbe "live
  // auflösen statt Snapshot einfrieren"-Regel wie bei activeActivity/
  // activeActivityNode oben. Schließt automatisch, falls die Kante
  // währenddessen verschwindet (z.B. Undo/Löschen).
  const [explainingEdgeId, setExplainingEdgeId] = useState<string | null>(null);
  useEffect(() => {
    if (explainingEdgeId && !graph.state.edgesById.has(explainingEdgeId)) setExplainingEdgeId(null);
  }, [explainingEdgeId, graph.state]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap px-1">
        <div className="min-w-0">
          <h1 className="text-lg font-black text-slate-900 dark:text-white tracking-tight break-words">
            {activeCollection ? `${activeCollection.emoji} ${activeCollection.name}` : t('kg.allSubjects')}
          </h1>
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{t('nav.knowledgeGraph.hint')}</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={() => setShowInsights(v => !v)}
            title={showInsights ? 'Coach-Hinweise ausblenden' : 'Coach-Hinweise einblenden'}
            aria-pressed={showInsights}
            className="h-8 px-3 flex items-center justify-center rounded-lg text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            style={showInsights
              ? { background: 'color-mix(in srgb, var(--primary) 14%, transparent)' }
              : undefined}
          >
            Hinweise
          </button>
          <button
            onClick={handleCheckMissingRelations}
            disabled={isCheckingRelations}
            title="Fehlende Beziehungen prüfen"
            className="h-8 px-3 flex items-center justify-center rounded-lg text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-300 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            {isCheckingRelations ? '…' : 'Beziehungen'}
          </button>
          <button
            onClick={handleCheckDuplicates}
            disabled={isCheckingDuplicates}
            title="Doppelte Konzepte prüfen"
            className="h-8 px-3 flex items-center justify-center rounded-lg text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-300 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            {isCheckingDuplicates ? '…' : 'Duplikate'}
          </button>
          <button
            onClick={handleCheckMissingConcepts}
            disabled={isCheckingConcepts}
            title="Fehlende Konzepte prüfen"
            className="h-8 px-3 flex items-center justify-center rounded-lg text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-300 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            {isCheckingConcepts ? '…' : 'Konzepte'}
          </button>
          <button
            onClick={graph.undo}
            disabled={!canUndo(graph.history)}
            title={t('kg.undo')}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-300 disabled:opacity-30 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            ↶
          </button>
          <button
            onClick={graph.redo}
            disabled={!canRedo(graph.history)}
            title={t('kg.redo')}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-300 disabled:opacity-30 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            ↷
          </button>
        </div>
      </div>

      {unassignedNodes.length > 0 && (
        <div
          className="flex items-center gap-3 flex-wrap px-4 py-3 rounded-[18px]"
          style={{
            background: 'color-mix(in srgb, var(--primary) 8%, transparent)',
            border: '1px solid color-mix(in srgb, var(--primary) 20%, transparent)',
          }}
        >
          <p className="text-xs font-medium text-slate-600 dark:text-slate-300 min-w-0">
            {unassignedNodes.length} {unassignedNodes.length === 1 ? 'Node ist' : 'Nodes sind'} noch keinem Fach zugeordnet.
          </p>
          <div className="flex items-center gap-2 ml-auto">
            <select
              value={moveTargetId}
              onChange={e => setMoveTargetId(e.target.value)}
              className="text-[10px] font-black uppercase tracking-widest bg-white dark:bg-slate-800 dark:text-white rounded-xl px-3 py-2 outline-none border"
              style={{ borderColor: 'var(--border-color)' }}
            >
              <option value="">Fach wählen...</option>
              {collections.map(c => (
                <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>
              ))}
            </select>
            <button
              onClick={handleAssignToCollection}
              disabled={!moveTargetId || isMoving}
              className="text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl text-white disabled:opacity-40 transition-colors"
              style={{ background: 'var(--primary)' }}
            >
              {isMoving ? '...' : 'Zuordnen'}
            </button>
          </div>
        </div>
      )}

      {showInsights && nodeInsightCount > 0 && (
        <div
          className="flex items-center gap-3 flex-wrap px-4 py-3 rounded-[18px]"
          style={{
            background: 'color-mix(in srgb, var(--primary) 8%, transparent)',
            border: '1px solid color-mix(in srgb, var(--primary) 20%, transparent)',
          }}
        >
          <p className="text-xs font-medium text-slate-600 dark:text-slate-300 min-w-0">
            {nodeInsightCount} {nodeInsightCount === 1 ? 'Node könnte' : 'Nodes könnten'} noch ausgebaut werden.
          </p>
        </div>
      )}

      {missingRelationSuggestions && missingRelationSuggestions.length > 0 && (
        <div
          className="space-y-2 px-4 py-3 rounded-[18px]"
          style={{
            background: 'color-mix(in srgb, var(--primary) 8%, transparent)',
            border: '1px solid color-mix(in srgb, var(--primary) 20%, transparent)',
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Vermutlich fehlende {missingRelationSuggestions.length === 1 ? 'Beziehung' : 'Beziehungen'}:
            </p>
            <button
              onClick={() => setMissingRelationSuggestions([])}
              className="text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors shrink-0"
            >
              Alle ignorieren
            </button>
          </div>
          {missingRelationSuggestions.map((s, i) => {
            const titleA = graph.state.nodesById.get(s.sourceNodeId)?.title ?? s.sourceNodeId;
            const titleB = graph.state.nodesById.get(s.targetNodeId)?.title ?? s.targetNodeId;
            return (
              <div key={`${s.sourceNodeId}-${s.targetNodeId}-${i}`} className="flex items-center gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-200 break-words">{titleA} ↔ {titleB}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 break-words">{s.reason}</p>
                </div>
                <div className="flex items-center gap-2 ml-auto shrink-0">
                  <button
                    onClick={() => handleAcceptRelationSuggestion(s)}
                    className="text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-xl text-white transition-colors"
                    style={{ background: 'var(--primary)' }}
                  >
                    Verbinden
                  </button>
                  <button
                    onClick={() => handleDiscardRelationSuggestion(s)}
                    className="text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    Ignorieren
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {duplicateSuggestions && duplicateSuggestions.length > 0 && (
        <div
          className="space-y-2 px-4 py-3 rounded-[18px]"
          style={{
            background: 'color-mix(in srgb, var(--primary) 8%, transparent)',
            border: '1px solid color-mix(in srgb, var(--primary) 20%, transparent)',
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
              {duplicateSuggestions.length === 1 ? 'Vermutlich doppeltes Konzept-Paar:' : 'Vermutlich doppelte Konzept-Paare:'}
            </p>
            <button
              onClick={() => setDuplicateSuggestions([])}
              className="text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors shrink-0"
            >
              Alle ignorieren
            </button>
          </div>
          {duplicateSuggestions.map((s, i) => {
            const titleA = graph.state.nodesById.get(s.nodeAId)?.title ?? s.nodeAId;
            const titleB = graph.state.nodesById.get(s.nodeBId)?.title ?? s.nodeBId;
            return (
              <div key={`${s.nodeAId}-${s.nodeBId}-${i}`} className="flex items-center gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-200 break-words">{titleA} ↔ {titleB}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 break-words">{s.reason}</p>
                </div>
                <div className="flex items-center gap-2 ml-auto shrink-0">
                  <button
                    onClick={() => handleViewDuplicateSuggestion(s)}
                    className="text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-xl text-white transition-colors"
                    style={{ background: 'var(--primary)' }}
                  >
                    Ansehen
                  </button>
                  <button
                    onClick={() => handleDiscardDuplicateSuggestion(s)}
                    className="text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    Ignorieren
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {missingConceptSuggestions && missingConceptSuggestions.length > 0 && (
        <div
          className="space-y-2 px-4 py-3 rounded-[18px]"
          style={{
            background: 'color-mix(in srgb, var(--primary) 8%, transparent)',
            border: '1px solid color-mix(in srgb, var(--primary) 20%, transparent)',
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
              {missingConceptSuggestions.length === 1 ? 'Mögliches fehlendes Konzept:' : 'Mögliche fehlende Konzepte:'}
            </p>
            <button
              onClick={() => setMissingConceptSuggestions([])}
              className="text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors shrink-0"
            >
              Alle ignorieren
            </button>
          </div>
          {missingConceptSuggestions.map((s, i) => (
            <div key={`${s.title}-${i}`} className="flex items-center gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200 break-words">{s.title}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 break-words">{s.description}</p>
              </div>
              <div className="flex items-center gap-2 ml-auto shrink-0">
                <button
                  onClick={() => handleCreateNodeFromSuggestion(s, i)}
                  className="text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-xl text-white transition-colors"
                  style={{ background: 'var(--primary)' }}
                >
                  Node erstellen
                </button>
                <button
                  onClick={() => handleDiscardMissingConceptSuggestion(s)}
                  className="text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Ignorieren
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div
        className="relative rounded-[24px] overflow-hidden h-[80vh] lg:h-[calc(100vh-11rem)]"
        style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}
      >
        {graph.loading ? (
          <div className="absolute inset-0 flex items-center justify-center text-[10px] font-black uppercase tracking-widest text-slate-400">
            {t('kg.loading')}
          </div>
        ) : (
          <>
            <GraphCanvas
              state={graph.state}
              history={graph.history}
              selection={graph.selection}
              onChange={graph.onChange}
              onSelectionChange={graph.onSelectionChange}
              onEntityChanged={graph.onEntityChanged}
              isDark={isDark}
              showInsights={showInsights}
              onExplainEdge={setExplainingEdgeId}
            />
            {explainingEdgeId && (
              <GraphEdgeExplainOverlay
                state={graph.state}
                edgeId={explainingEdgeId}
                onClose={() => setExplainingEdgeId(null)}
                onApiError={onApiError}
              />
            )}
            {/* Absolutes Overlay, kein Resize der Kanvasfläche — s.
                GraphNodeDetailPanel.tsx für die Begründung (Performance +
                räumliche Orientierung).
                Bewusst NICHT rendern, während Reader- oder Learning-Overlay
                offen sind (echter Bug bei der Phase-5-Verifikation gefunden:
                das Panel bleibt sonst unsichtbar HINTER dem Vollbild-Overlay
                gemountet, sein eigener globaler Escape-Listener aus Phase 3
                feuert aber weiterhin mit — ein Escape zum Schließen der
                Aktivität hat dadurch gleichzeitig lautlos die Auswahl
                gelöscht. Betraf strukturell auch schon den Reader-Overlay
                aus Phase 3, nur nie bemerkt, weil dort bisher niemand Escape
                statt des sichtbaren Zurück-Buttons getestet hatte. */}
            {graph.selection.selectedNodeId && !openDocument && !activeActivity && (
              <GraphNodeDetailPanel
                state={graph.state}
                history={graph.history}
                nodeId={graph.selection.selectedNodeId}
                documents={documents}
                onChange={graph.onChange}
                onEntityChanged={graph.onEntityChanged}
                onClose={() => graph.onSelectionChange(clearSelection(graph.selection))}
                onOpenDocument={setOpenDocumentId}
                onSelectNode={id => graph.onSelectionChange(selectNode(graph.selection, id))}
                onStartActivity={setActiveActivity}
                onApiError={onApiError}
              />
            )}
          </>
        )}
        {graph.error && (
          <div
            className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[10px] font-bold text-rose-500 rounded-lg px-3 py-2 shadow-sm border border-rose-200 dark:border-rose-900 bg-white dark:bg-slate-800"
          >
            {t('kg.errorPull')}
          </div>
        )}
      </div>

      {openDocument && createPortal(
        <div className="fixed inset-0 z-50 bg-white dark:bg-slate-900">
          <React.Suspense fallback={null}>
            {shouldUsePdfReader(openDocument) ? (
              <PdfSplitScreenReader
                key={`graph-pdf-reader-${openDocument.id}`}
                doc={openDocument}
                userId={userId}
                onBack={() => setOpenDocumentId(null)}
                onStartFeynman={onStartFeynman}
                getDocumentSource={getDocumentSource}
              />
            ) : (
              <SplitScreenReader
                key={`graph-reader-${openDocument.id}`}
                doc={openDocument}
                userId={userId}
                onBack={() => setOpenDocumentId(null)}
                onStartFeynman={onStartFeynman}
              />
            )}
          </React.Suspense>
        </div>,
        document.body,
      )}

      {activeActivity && activeActivityNode && (
        <GraphLearningOverlay
          node={activeActivityNode}
          activity={activeActivity}
          relatedConceptEntries={relatedConceptEntries}
          onClose={() => setActiveActivity(null)}
          userId={userId}
          documents={documents}
          collections={collections}
          decks={decks}
          onDecksChange={onDecksChange}
          updateMetricsAfterSession={updateMetricsAfterSession}
          onApiError={onApiError}
        />
      )}
    </div>
  );
};
