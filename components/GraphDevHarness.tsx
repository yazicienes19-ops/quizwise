import React, { useEffect, useRef, useState } from 'react';
import { GraphCanvas } from './GraphCanvas';
import { supabase } from '../services/supabaseClient';
import { generateGraphId } from '../services/graph/id';
import { createEmptyGraphState, type GraphState, type GraphNode, type GraphRelationType, type GraphScope } from '../services/graph/types';
import { createEmptyHistory } from '../services/graph/graphHistoryService';
import { saveCachedState } from '../services/graph/graphSyncService';
import { useKnowledgeGraph } from '../hooks/useKnowledgeGraph';

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

const makeRelationType = (label: string, symmetric: boolean, sortOrder: number): [string, GraphRelationType] => {
  const id = generateGraphId();
  return [id, { id, label, symmetric, isBuiltIn: true, sortOrder, createdAt: now }];
};

function buildFixtureState(): GraphState {
  const state = createEmptyGraphState(FIXTURE_SCOPE);

  const relationTypes = [
    makeRelationType('ist Teil von', false, 1),
    makeRelationType('Beispiel für', false, 3),
    makeRelationType('Gegensatz zu', true, 5),
  ];
  relationTypes.forEach(([id, rt]) => state.relationTypesById.set(id, rt));
  const [teilVonId] = relationTypes[0];
  const [beispielFuerId] = relationTypes[1];
  const [gegensatzId] = relationTypes[2];

  const nodes = [
    makeNode('Konditionierung', 0, 0, { color: '#6366f1' }),
    makeNode('Klassische Konditionierung', -220, 160),
    makeNode('Operante Konditionierung', 220, 160),
    makeNode('Pawlow', -220, 320, { type: 'person' }),
    makeNode('Verstärkung', 220, 320),
    makeNode('Bestrafung', 420, 320),
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

  const [log, setLog] = useState<string[]>([]);
  const pushLog = (line: string) => setLog(prev => [line, ...prev].slice(0, 8));

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
      saveCachedState(fixture);
      graph.onChange({ state: fixture, history: createEmptyHistory() });
      pushLog('Fixture initial geseedet (leerer Cache)');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, graph.loading]);

  const handleReset = () => {
    const fixture = buildFixtureState();
    saveCachedState(fixture);
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
            pushLog(change.kind === 'node' ? `Node geändert: "${change.entity.title}"` : `Kante geändert: ${change.entity.id.slice(0, 8)}`);
          }}
        />
      </div>
      <div style={{ padding: '4px 16px', fontSize: 11, fontFamily: 'monospace', color: '#64748b', maxHeight: 100, overflowY: 'auto' }}>
        {log.map((line, i) => <div key={i}>{line}</div>)}
      </div>
    </div>
  );
};
