import { describe, it, expect } from 'vitest';
import { createEmptyGraphState, type GraphEdge, type GraphNode } from './types';
import {
  buildGraphIndex, outgoingEdges, incomingEdges, neighborIds,
  hasActiveEdgeBetween, hasActiveEdgeBetweenEitherDirection, subgraph,
} from './graphIndex';

const makeNode = (id: string, overrides: Partial<GraphNode> = {}): GraphNode => ({
  id,
  type: 'begriff',
  title: id,
  description: '',
  notes: '',
  tags: [],
  position: { x: 0, y: 0 },
  pinned: false,
  version: 1,
  createdAt: 0,
  updatedAt: 0,
  ...overrides,
});

const makeEdge = (id: string, sourceNodeId: string, targetNodeId: string, overrides: Partial<GraphEdge> = {}): GraphEdge => ({
  id,
  sourceNodeId,
  targetNodeId,
  relationTypeId: 'rel-1',
  version: 1,
  createdAt: 0,
  updatedAt: 0,
  ...overrides,
});

describe('buildGraphIndex', () => {
  it('indiziert eine aktive Kante zwischen zwei aktiven Nodes in beide Richtungen', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    state.nodesById.set('a', makeNode('a'));
    state.nodesById.set('b', makeNode('b'));
    state.edgesById.set('e1', makeEdge('e1', 'a', 'b'));

    const index = buildGraphIndex(state);
    expect(outgoingEdges(index, 'a').map(e => e.id)).toEqual(['e1']);
    expect(incomingEdges(index, 'b').map(e => e.id)).toEqual(['e1']);
    expect(outgoingEdges(index, 'b')).toEqual([]);
  });

  it('blendet eine Kante aus, wenn sie selbst archiviert ist', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    state.nodesById.set('a', makeNode('a'));
    state.nodesById.set('b', makeNode('b'));
    state.edgesById.set('e1', makeEdge('e1', 'a', 'b', { archivedAt: 1 }));

    const index = buildGraphIndex(state);
    expect(outgoingEdges(index, 'a')).toEqual([]);
  });

  it('blendet eine Kante aus, wenn ihr Zielknoten archiviert ist (Lese-Zeit-Filter statt Schreib-Amplifikation)', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    state.nodesById.set('a', makeNode('a'));
    state.nodesById.set('b', makeNode('b', { archivedAt: 1 }));
    state.edgesById.set('e1', makeEdge('e1', 'a', 'b'));

    const index = buildGraphIndex(state);
    expect(outgoingEdges(index, 'a')).toEqual([]);
    expect(neighborIds(index, 'a').size).toBe(0);
  });

  it('blendet eine Kante aus, deren Endpunkt-Node gar nicht (mehr) existiert', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    state.nodesById.set('a', makeNode('a'));
    state.edgesById.set('e1', makeEdge('e1', 'a', 'ghost'));

    const index = buildGraphIndex(state);
    expect(outgoingEdges(index, 'a')).toEqual([]);
  });
});

describe('neighborIds', () => {
  it('sammelt Nachbarn aus ein- und ausgehenden Kanten ohne Duplikate', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    ['a', 'b', 'c'].forEach(id => state.nodesById.set(id, makeNode(id)));
    state.edgesById.set('e1', makeEdge('e1', 'a', 'b'));
    state.edgesById.set('e2', makeEdge('e2', 'c', 'a'));

    const index = buildGraphIndex(state);
    expect(neighborIds(index, 'a')).toEqual(new Set(['b', 'c']));
  });
});

describe('hasActiveEdgeBetween / hasActiveEdgeBetweenEitherDirection', () => {
  it('erkennt eine bestehende Kante mit exakt demselben Beziehungstyp', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    state.nodesById.set('a', makeNode('a'));
    state.nodesById.set('b', makeNode('b'));
    state.edgesById.set('e1', makeEdge('e1', 'a', 'b', { relationTypeId: 'rel-gegensatz' }));
    const index = buildGraphIndex(state);

    expect(hasActiveEdgeBetween(index, 'a', 'b', 'rel-gegensatz')).toBe(true);
    expect(hasActiveEdgeBetween(index, 'a', 'b', 'rel-anders')).toBe(false);
    expect(hasActiveEdgeBetween(index, 'b', 'a', 'rel-gegensatz')).toBe(false); // Richtung zählt hier
  });

  it('erkennt für symmetrische Typen die Gegenrichtung als dieselbe Aussage', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    state.nodesById.set('a', makeNode('a'));
    state.nodesById.set('b', makeNode('b'));
    state.edgesById.set('e1', makeEdge('e1', 'b', 'a', { relationTypeId: 'rel-gegensatz' }));
    const index = buildGraphIndex(state);

    expect(hasActiveEdgeBetweenEitherDirection(index, 'a', 'b', 'rel-gegensatz')).toBe(true);
  });
});

describe('subgraph (Grundlage für den künftigen Fokus-Modus)', () => {
  it('findet Nodes/Kanten bis zur angegebenen Hop-Distanz, unabhängig von der Kantenrichtung', () => {
    // a -> b -> c -> d, Fokus auf b mit 1 Hop soll a, b, c erreichen, nicht d
    const state = createEmptyGraphState({ kind: 'all' });
    ['a', 'b', 'c', 'd'].forEach(id => state.nodesById.set(id, makeNode(id)));
    state.edgesById.set('e1', makeEdge('e1', 'a', 'b'));
    state.edgesById.set('e2', makeEdge('e2', 'b', 'c'));
    state.edgesById.set('e3', makeEdge('e3', 'c', 'd'));
    const index = buildGraphIndex(state);

    const { nodeIds, edgeIds } = subgraph(index, 'b', 1);
    expect(nodeIds).toEqual(new Set(['b', 'a', 'c']));
    expect(edgeIds).toEqual(new Set(['e1', 'e2']));
  });

  it('bricht ab, wenn keine weiteren Nachbarn mehr existieren, auch bei großem hops-Wert', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    state.nodesById.set('isoliert', makeNode('isoliert'));
    const index = buildGraphIndex(state);

    const { nodeIds, edgeIds } = subgraph(index, 'isoliert', 10);
    expect(nodeIds).toEqual(new Set(['isoliert']));
    expect(edgeIds.size).toBe(0);
  });
});
