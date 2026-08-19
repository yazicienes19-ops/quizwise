import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GraphCanvas } from './GraphCanvas';
import { GraphNodeDetailPanel } from './GraphNodeDetailPanel';
import { GraphLearningOverlay, type GraphLearningActivity } from './GraphLearningOverlay';
import { supabase } from '../services/supabaseClient';
import { generateGraphId } from '../services/graph/id';
import {
  createEmptyGraphState, type GraphState, type GraphNode, type GraphRelationType,
  type GraphNodeDocumentRef, type GraphScope,
} from '../services/graph/types';
import { createEmptyHistory } from '../services/graph/graphHistoryService';
import { clearSelection, selectNode } from '../services/graph/graphSelectionService';
import { buildGraphIndex, outgoingEdges, incomingEdges, describeRelatedEntry } from '../services/graph/graphIndex';
import { saveCachedState } from '../services/graph/graphSyncService';
import { useKnowledgeGraph } from '../hooks/useKnowledgeGraph';
import { shouldUsePdfReader } from '../services/libraryService';
import { resolveErrorMessage } from '../services/errorMessages';
import { toast } from '../services/toast';
import type { ProcessedDocument, FlashcardDeck } from '../types';
import type { GenerationSource } from '../services/geminiService';

const SplitScreenReader = React.lazy(() => import('./SplitScreenReader').then(m => ({ default: m.SplitScreenReader })));
const PdfSplitScreenReader = React.lazy(() => import('./PdfSplitScreenReader').then(m => ({ default: m.PdfSplitScreenReader })));

/**
 * OFFIZIELLER Development Harness des Knowledge Graph — dauerhafter
 * Bestandteil der Entwicklungsinfrastruktur, kein Wegwerf-Code. Zweck:
 * Rendering/Layout/Interaktionen/Performance des Graphen isoliert testen und
 * Bugs reproduzieren können, ohne Login, Supabase, echte Nutzerdaten oder die
 * reale App-Navigation. Kein Produktfeature — Nutzer sehen das nie.
 *
 * Erreichbarkeit ist bewusst zweifach abgesichert (s. index.tsx):
 * 1. `import.meta.env.DEV` — in einem Produktions-Build ist dieser Zweig
 *    statisch `false`, Vite/Rollup eliminieren den dynamischen Import dieser
 *    Datei dadurch komplett aus dem Bundle.
 * 2. Query-Parameter `?graphDevHarness=1`.
 *
 * Seit Phase 4 (Application-Schicht) läuft der Harness über denselben
 * useKnowledgeGraph-Hook, den auch ein künftiges echtes Produkt-UI nutzen
 * würde — GraphCanvas bekommt hier also exakt dieselbe Verdrahtung wie im
 * "echten" Einsatz, nur mit einem Harness statt einer Produkt-Seite drumherum.
 *
 * Zwei Modi, automatisch erkannt (KEIN Login-Formular gebaut — das wäre eine
 * UI-Erweiterung, die explizit nicht Teil dieser Phase ist):
 * - Kein Login (Normalfall): eigener, isolierter Fixture-Scope
 *   (`dev-harness-fixture`), rein lokal, kein Netzwerk. Genau das bisherige
 *   Verhalten.
 * - Bereits bestehende Supabase-Session im selben Browser (z.B. weil parallel
 *   in der echten App eingeloggt): Scope wechselt auf die Gesamtansicht des
 *   echten Kontos — GraphCanvas arbeitet dann mit echten Daten aus Supabase,
 *   inkl. echtem Sync/Autosave über die Application-Schicht. Kann von hier
 *   aus NICHT vollständig automatisiert verifiziert werden (echte Zugangsdaten
 *   nötig) — manueller Check durch den Nutzer bei Bedarf.
 */

const FIXTURE_SCOPE: GraphScope = { kind: 'collection', collectionId: 'dev-harness-fixture' };
const REAL_SCOPE: GraphScope = { kind: 'all' };

const now = Date.now();

const makeNode = (title: string, x: number, y: number, overrides: Partial<GraphNode> = {}): [string, GraphNode] => {
  const id = generateGraphId();
  return [id, {
    id, type: 'begriff', title, description: '', notes: '', tags: [],
    position: { x, y }, pinned: false, version: 1, createdAt: now, updatedAt: now,
    ...overrides,
  }];
};

const makeRelationType = (
  label: string, symmetric: boolean, sortOrder: number, inverseLabel?: string,
): [string, GraphRelationType] => {
  const id = generateGraphId();
  return [id, { id, label, inverseLabel, symmetric, isBuiltIn: true, sortOrder, createdAt: now }];
};

// Phase 3 ("Eigene Unterlagen") — 40 Fixture-Dokumente, damit "Verhalten bei
// vielen Dokumenten" (Picker-Liste) tatsächlich unter realistischer Last
// geprüft werden kann, nicht nur mit 1-2 Beispielen. Echter Textinhalt
// (type: 'text'), damit der bestehende SplitScreenReader beim Öffnen
// tatsächlich etwas anzeigt statt eines leeren Digest-Zustands.
const FIXTURE_DOCUMENTS: ProcessedDocument[] = Array.from({ length: 40 }, (_, i) => ({
  id: `fixture-doc-${i + 1}`,
  name: `Vorlesung ${i + 1} - Behaviorismus.txt`,
  type: 'text' as const,
  content: `Inhalt von Vorlesung ${i + 1}: Grundlagen des Behaviorismus, klassische und operante Konditionierung.`,
  uploadDate: now - i * 86_400_000,
}));

function buildFixtureState(): GraphState {
  const state = createEmptyGraphState(FIXTURE_SCOPE);

  const relationTypes = [
    makeRelationType('ist Teil von', false, 1),
    // Mit inverseLabel + "…"-Lückentext-Konvention — exakt wie der echte
    // Migrations-Seed (builtInRelationTypes.ts) — damit Phase 4 ("Verwandte
    // Konzepte") die grammatikalisch korrekte Gegenrichtung tatsächlich
    // gegen Fixture-Daten prüfen kann, nicht nur den Arrow-Flip-Fallback.
    makeRelationType('Voraussetzung von', false, 2, 'baut auf … auf'),
    makeRelationType('Beispiel für', false, 3),
    makeRelationType('Gegensatz zu', true, 5),
  ];
  relationTypes.forEach(([id, rt]) => state.relationTypesById.set(id, rt));
  const [teilVonId] = relationTypes[0];
  const [voraussetzungId] = relationTypes[1];
  const [beispielFuerId] = relationTypes[2];
  const [gegensatzId] = relationTypes[3];

  const nodes = [
    makeNode('Konditionierung', 0, 0, { color: '#6366f1' }),
    makeNode('Klassische Konditionierung', -220, 160),
    makeNode('Operante Konditionierung', 220, 160),
    makeNode('Pawlow', -220, 320, { type: 'person' }),
    makeNode('Verstärkung', 220, 320),
    makeNode('Bestrafung', 420, 320),
    // Phase 4 ("Verwandte Konzepte") — bewusst OHNE jede Kante, damit
    // "Verhalten ohne Beziehungen" (Leerzustand) beim ersten Laden direkt
    // testbar ist, ohne erst manuell eine Kante zu löschen.
    makeNode('Löschung', 620, 320),
  ];
  nodes.forEach(([id, n]) => state.nodesById.set(id, n));
  const [rootId] = nodes[0];
  const [klassischId] = nodes[1];
  const [operantId] = nodes[2];
  const [pawlowId] = nodes[3];
  const [verstaerkungId] = nodes[4];
  const [bestrafungId] = nodes[5];

  const edge = (sourceNodeId: string, targetNodeId: string, relationTypeId: string) => {
    const id = generateGraphId();
    state.edgesById.set(id, { id, sourceNodeId, targetNodeId, relationTypeId, version: 1, createdAt: now, updatedAt: now });
  };
  edge(klassischId, rootId, teilVonId);
  edge(operantId, rootId, teilVonId);
  edge(pawlowId, klassischId, beispielFuerId);
  edge(verstaerkungId, operantId, teilVonId);
  edge(bestrafungId, operantId, teilVonId);
  edge(verstaerkungId, bestrafungId, gegensatzId);

  // 20 zusätzliche Nodes, alle als "Voraussetzung von" auf die Kondition-
  // ierung bezogen — testet "viele Beziehungen" (Scroll/Performance im
  // Abschnitt) UND gleichzeitig den inverseLabel-Pfad in großer Zahl
  // (Konditionierung sieht die Gegenrichtung "baut auf X auf").
  for (let i = 1; i <= 20; i++) {
    const [fillerId, fillerNode] = makeNode(`Zusatzkonzept ${i}`, -400 + i * 40, 500);
    state.nodesById.set(fillerId, fillerNode);
    edge(fillerId, rootId, voraussetzungId);
  }

  // Drei der 40 Fixture-Dokumente sind bereits mit dem Hauptthema verknüpft —
  // damit "viele bereits verknüpfte Dokumente" (Anzeige-Reihenfolge, Klick
  // zum Öffnen) direkt beim ersten Laden testbar ist, nicht erst nach
  // manuellem Verknüpfen.
  [0, 1, 2].forEach(i => {
    const id = generateGraphId();
    const ref: GraphNodeDocumentRef = { id, nodeId: rootId, documentId: FIXTURE_DOCUMENTS[i].id, createdAt: now + i };
    state.nodeDocumentsById.set(id, ref);
  });

  return state;
}

export const GraphDevHarness: React.FC = () => {
  // Nicht-blockierende, opportunistische Erkennung einer bereits bestehenden
  // Session — kein Login-Formular, kein Warten. Ohne Session bleibt userId
  // undefined und der Harness verhält sich exakt wie zuvor (rein lokal).
  const [userId, setUserId] = useState<string | undefined>(undefined);
  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data }) => setUserId(data.session?.user?.id))
      .catch(() => {});
  }, []);

  const scope = userId ? REAL_SCOPE : FIXTURE_SCOPE;
  const graph = useKnowledgeGraph({ scope, userId });

  // Dev-Harness hat kein eigenes useAuth() — liest den globalen App-Theme-
  // Zustand einmalig genau wie useAuth.ts selbst (dieselbe 'dark'-Klasse auf
  // <html>), damit GraphCanvas auch hier dieselbe verpflichtende isDark-Prop
  // bekommt wie im echten Produkt-UI.
  const [isDark] = useState(() => document.documentElement.classList.contains('dark'));

  const [log, setLog] = useState<string[]>([]);
  const pushLog = (line: string) => setLog(prev => [line, ...prev].slice(0, 8));

  // Phase 3: derselbe Portal-Overlay-Ansatz wie in GraphSystem.tsx ("Variante
  // A") — hier dupliziert statt importiert, weil der Harness bewusst
  // eigenständig bleibt (kein Collection[]/activeModuleId-Kontext einer
  // echten Seite, s. Datei-Kommentar oben). getDocumentSource/onStartFeynman
  // sind hier reine Platzhalter (kein echtes Gemini/RECALL im Harness) — nur
  // der Reader-Öffnen/Schließen-Mechanismus selbst wird geprüft.
  const [openDocumentId, setOpenDocumentId] = useState<string | null>(null);
  const openDocument = FIXTURE_DOCUMENTS.find(d => d.id === openDocumentId);
  const stubGetDocumentSource = (doc: ProcessedDocument): GenerationSource => ({ text: doc.content });

  // Phase 5 ("Aktiv lernen") — rein lokaler Deck-Speicher (kein AppContent-
  // Kontext im Harness) + einfache Fehlerbehandlung (kein Limit-/Auth-
  // Sonderverhalten wie in der echten App, s. Datei-Kommentar zur echten-
  // Zugangsdaten-Grenze). `updateMetricsAfterSession` ist hier bewusst ein
  // No-Op mit Log-Zeile statt eines echten TopicMetric-Updates — der Harness
  // hat kein Lernprofil, das ist kein Testziel dieser Komponente.
  const [harnessDecks, setHarnessDecks] = useState<FlashcardDeck[]>([]);
  const stubUpdateMetricsAfterSession = async (score: number, name: string) => {
    pushLog(`Metrik aktualisiert: "${name}" → ${score}%`);
  };
  const stubApiError = (e: unknown) => toast.error(resolveErrorMessage(e));

  const [activeActivity, setActiveActivity] = useState<GraphLearningActivity | null>(null);
  const activeActivityNode = activeActivity ? graph.state.nodesById.get(graph.selection.selectedNodeId ?? '') : undefined;
  useEffect(() => {
    if (activeActivity && !activeActivityNode) setActiveActivity(null);
  }, [activeActivity, activeActivityNode]);

  // Selbe Berechnung wie GraphSystem.tsx (Node-Dialog braucht dieselben
  // "Verwandte Konzepte"-Einträge, damit sich Rückfragen im Harness identisch
  // zum echten Produkt-UI verhalten).
  const relatedConceptEntries = useMemo(() => {
    if (!activeActivityNode) return [];
    const index = buildGraphIndex(graph.state);
    return [
      ...outgoingEdges(index, activeActivityNode.id).map(edge => describeRelatedEntry(graph.state, edge, true)),
      ...incomingEdges(index, activeActivityNode.id).map(edge => describeRelatedEntry(graph.state, edge, false)),
    ].filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  }, [activeActivityNode, graph.state]);

  // Fixture einmalig seeden — nur ohne Login UND nur, wenn der isolierte
  // Fixture-Scope-Cache tatsächlich leer ist (erster Start in diesem Browser/
  // Profil). Eigene Interaktionen aus einer vorherigen Sitzung (bereits über
  // onEntityChanged persistiert) werden dadurch nicht überschrieben.
  const seededRef = useRef(false);
  useEffect(() => {
    if (userId || graph.loading || seededRef.current) return;
    seededRef.current = true;
    if (graph.state.nodesById.size === 0) {
      const fixture = buildFixtureState();
      saveCachedState(fixture, undefined);
      graph.onChange({ state: fixture, history: createEmptyHistory() });
      pushLog('Fixture initial geseedet (leerer Cache)');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, graph.loading]);

  const handleReset = () => {
    const fixture = buildFixtureState();
    saveCachedState(fixture, undefined);
    graph.onChange({ state: fixture, history: createEmptyHistory() });
    setLog([]);
  };

  const nodeCount = [...graph.state.nodesById.values()].filter(n => n.archivedAt === undefined).length;
  const edgeCount = [...graph.state.edgesById.values()].filter(e => e.archivedAt === undefined).length;

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', background: '#f8fafc' }}>
      <div style={{ padding: '8px 16px', fontSize: 12, fontFamily: 'monospace', display: 'flex', gap: 12, alignItems: 'center', borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
        <strong>Graph Dev-Harness</strong>
        <span style={{ padding: '2px 6px', borderRadius: 4, background: userId ? '#dcfce7' : '#e2e8f0', color: userId ? '#166534' : '#475569' }}>
          {userId ? `Live-Daten (${userId.slice(0, 8)}…)` : 'Lokale Fixture (kein Login)'}
        </span>
        {graph.loading && <span>lädt…</span>}
        {graph.error && <span style={{ color: '#b91c1c' }}>Fehler: {graph.error}</span>}
        <button onClick={graph.undo}>↶ Undo</button>
        <button onClick={graph.redo}>↷ Redo</button>
        {!userId && <button onClick={handleReset}>⟲ Fixture neu laden</button>}
        <span>{nodeCount} Nodes · {edgeCount} Kanten</span>
        <span>Ausgewählt: {graph.selection.selectedNodeId ? graph.state.nodesById.get(graph.selection.selectedNodeId)?.title : '–'}</span>
        <span style={{ marginLeft: 'auto', opacity: 0.6 }}>Doppelklick = Node anlegen · Ziehen vom kleinen Punkt = Kante · Ziehen am Node = verschieben</span>
      </div>
      <div style={{ flex: 1, position: 'relative' }}>
        <GraphCanvas
          state={graph.state}
          history={graph.history}
          selection={graph.selection}
          onChange={graph.onChange}
          onSelectionChange={graph.onSelectionChange}
          onEntityChanged={change => {
            graph.onEntityChanged(change);
            if (change.kind === 'node') pushLog(`Node geändert: "${change.entity.title}"`);
            else if (change.kind === 'edge') pushLog(`Kante geändert: ${change.entity.id.slice(0, 8)}`);
            else if (change.kind === 'relationType') pushLog(`Beziehungstyp angelegt: "${change.entity.label}"`);
            else pushLog(`Dokument-Verknüpfung ${change.action === 'create' ? 'angelegt' : 'entfernt'}`);
          }}
          isDark={isDark}
        />
        {/* Phase 2/3: dasselbe Overlay-Panel wie in GraphSystem.tsx, hier
            verdrahtet, damit es ohne echten Login über den Harness testbar
            ist (s. Kommentar oben zur echten-Zugangsdaten-Grenze). Bewusst
            NICHT rendern, während ein Vollbild-Overlay offen ist — s.
            GraphSystem.tsx für den dort bei der Phase-5-Verifikation
            gefundenen Escape-Listener-Bug, den das hier auf dieselbe Art
            vermeidet. */}
        {graph.selection.selectedNodeId && !openDocument && !activeActivity && (
          <GraphNodeDetailPanel
            state={graph.state}
            history={graph.history}
            nodeId={graph.selection.selectedNodeId}
            documents={FIXTURE_DOCUMENTS}
            onChange={graph.onChange}
            onEntityChanged={change => {
              graph.onEntityChanged(change);
              if (change.kind === 'node') pushLog(`Node geändert: "${change.entity.title}"`);
              else if (change.kind === 'nodeDocumentRef') pushLog(`Dokument-Verknüpfung ${change.action === 'create' ? 'angelegt' : 'entfernt'}`);
            }}
            onOpenDocument={setOpenDocumentId}
            onClose={() => graph.onSelectionChange(clearSelection(graph.selection))}
            onSelectNode={id => graph.onSelectionChange(selectNode(graph.selection, id))}
            onStartActivity={setActiveActivity}
            onApiError={stubApiError}
          />
        )}
      </div>
      <div style={{ padding: '4px 16px', fontSize: 11, fontFamily: 'monospace', color: '#64748b', maxHeight: 100, overflowY: 'auto' }}>
        {log.map((line, i) => <div key={i}>{line}</div>)}
      </div>

      {openDocument && createPortal(
        <div className="fixed inset-0 z-50 bg-white dark:bg-slate-900">
          <React.Suspense fallback={null}>
            {shouldUsePdfReader(openDocument) ? (
              <PdfSplitScreenReader
                key={`harness-pdf-reader-${openDocument.id}`}
                doc={openDocument}
                userId={userId}
                onBack={() => setOpenDocumentId(null)}
                onStartFeynman={topic => pushLog(`Feynman-Sprung angefragt: "${topic}"`)}
                getDocumentSource={stubGetDocumentSource}
              />
            ) : (
              <SplitScreenReader
                key={`harness-reader-${openDocument.id}`}
                doc={openDocument}
                userId={userId}
                onBack={() => setOpenDocumentId(null)}
                onStartFeynman={topic => pushLog(`Feynman-Sprung angefragt: "${topic}"`)}
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
          documents={FIXTURE_DOCUMENTS}
          collections={[]}
          decks={harnessDecks}
          onDecksChange={setHarnessDecks}
          updateMetricsAfterSession={stubUpdateMetricsAfterSession}
          onApiError={stubApiError}
        />
      )}
    </div>
  );
};
