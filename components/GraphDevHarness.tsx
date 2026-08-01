import React, { useState } from 'react';
import { GraphCanvas, type GraphEntityChange } from './GraphCanvas';
import { generateGraphId } from '../services/graph/id';
import { createEmptyGraphState, type GraphState, type GraphNode, type GraphRelationType } from '../services/graph/types';
import { createEmptyHistory, type GraphHistory, undo, redo, canUndo, canRedo } from '../services/graph/graphHistoryService';
import { createEmptySelection, type GraphSelectionState } from '../services/graph/graphSelectionService';

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
 *    Datei dadurch komplett aus dem Bundle (verifiziert per `npm run build`
 *    + Grep auf den Bundle-Output, s. Commit-Beschreibung).
 * 2. Query-Parameter `?graphDevHarness=1` — auch im normalen `npm run dev`
 *    verdrängt der Harness die echte App nicht ungefragt.
 *
 * Seedet ein paar Beispiel-Nodes/-Kanten/-Beziehungstypen rein lokal (kein
 * Supabase, kein Login nötig) — GraphPersistenceService wird hier bewusst
 * NICHT aufgerufen, das wäre ein Layer-Sprung (UI → Infrastructure) genau
 * wie in GraphCanvas selbst vermieden.
 */

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
  const state = createEmptyGraphState({ kind: 'all' });

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
  const [state, setState] = useState<GraphState>(buildFixtureState);
  const [history, setHistory] = useState<GraphHistory>(createEmptyHistory);
  const [selection, setSelection] = useState<GraphSelectionState>(createEmptySelection);
  const [log, setLog] = useState<string[]>([]);

  const pushLog = (line: string) => setLog(prev => [line, ...prev].slice(0, 8));

  const handleEntityChanged = (change: GraphEntityChange) => {
    pushLog(change.kind === 'node' ? `Node geändert: "${change.entity.title}"` : `Kante geändert: ${change.entity.id.slice(0, 8)}`);
  };

  const handleUndo = () => {
    const result = undo(history, state);
    setState(result.state);
    setHistory(result.history);
  };
  const handleRedo = () => {
    const result = redo(history, state);
    setState(result.state);
    setHistory(result.history);
  };
  const handleReset = () => {
    setState(buildFixtureState());
    setHistory(createEmptyHistory());
    setSelection(createEmptySelection());
    setLog([]);
  };

  const nodeCount = [...state.nodesById.values()].filter(n => n.archivedAt === undefined).length;
  const edgeCount = [...state.edgesById.values()].filter(e => e.archivedAt === undefined).length;

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', background: '#f8fafc' }}>
      <div style={{ padding: '8px 16px', fontSize: 12, fontFamily: 'monospace', display: 'flex', gap: 12, alignItems: 'center', borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
        <strong>Graph Dev-Harness</strong>
        <button onClick={handleUndo} disabled={!canUndo(history)}>↶ Undo</button>
        <button onClick={handleRedo} disabled={!canRedo(history)}>↷ Redo</button>
        <button onClick={handleReset}>⟲ Fixture neu laden</button>
        <span>{nodeCount} Nodes · {edgeCount} Kanten</span>
        <span>Ausgewählt: {selection.selectedNodeId ? state.nodesById.get(selection.selectedNodeId)?.title : '–'}</span>
        <span style={{ marginLeft: 'auto', opacity: 0.6 }}>Doppelklick = Node anlegen · Ziehen vom kleinen Punkt = Kante · Ziehen am Node = verschieben</span>
      </div>
      <div style={{ flex: 1, position: 'relative' }}>
        <GraphCanvas
          state={state}
          history={history}
          selection={selection}
          onChange={({ state: s, history: h }) => { setState(s); setHistory(h); }}
          onSelectionChange={setSelection}
          onEntityChanged={handleEntityChanged}
        />
      </div>
      <div style={{ padding: '4px 16px', fontSize: 11, fontFamily: 'monospace', color: '#64748b', maxHeight: 100, overflowY: 'auto' }}>
        {log.map((line, i) => <div key={i}>{line}</div>)}
      </div>
    </div>
  );
};
