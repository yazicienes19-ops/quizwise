import { describe, it, expect } from 'vitest';
import { createEmptyGraphState, type GraphEdge, type GraphNode } from './types';
import { computeNodeInsights, groupInsightsByNode } from './graphInsightsService';

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

describe('computeNodeInsights — no-description / no-notes', () => {
  it('meldet fehlende Beschreibung und fehlende Notizen unabhängig voneinander', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    state.nodesById.set('a', makeNode('a', { description: '', notes: 'hat Notizen' }));
    state.nodesById.set('b', makeNode('b', { description: 'hat Beschreibung', notes: '' }));

    const insights = computeNodeInsights(state);
    expect(insights).toContainEqual({ nodeId: 'a', type: 'no-description' });
    expect(insights).toContainEqual({ nodeId: 'b', type: 'no-notes' });
    expect(insights).not.toContainEqual({ nodeId: 'a', type: 'no-notes' });
    expect(insights).not.toContainEqual({ nodeId: 'b', type: 'no-description' });
  });

  it('wertet reinen Leerraum wie eine fehlende Beschreibung/Notiz (trim)', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    state.nodesById.set('a', makeNode('a', { description: '   ', notes: '\n' }));

    const insights = computeNodeInsights(state);
    expect(insights).toContainEqual({ nodeId: 'a', type: 'no-description' });
    expect(insights).toContainEqual({ nodeId: 'a', type: 'no-notes' });
  });

  it('meldet nichts, wenn Beschreibung und Notizen vorhanden sind', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    state.nodesById.set('a', makeNode('a', { description: 'x', notes: 'y' }));
    expect(computeNodeInsights(state)).toEqual([]);
  });

  it('ignoriert archivierte Nodes', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    state.nodesById.set('a', makeNode('a', { description: '', archivedAt: 1 }));
    expect(computeNodeInsights(state)).toEqual([]);
  });
});

describe('computeNodeInsights — many-relationships', () => {
  it('prüft Ausreißer erst ab der Mindest-Node-Anzahl (sonst verrauscht)', () => {
    // 4 Nodes: a hat 3 Kanten, b/c/d haben 0 -> Durchschnitt 0.75, a wäre klarer
    // Ausreißer, aber unter der Mindest-Node-Schwelle wird gar nicht geprüft.
    const state = createEmptyGraphState({ kind: 'all' });
    ['a', 'b', 'c', 'd'].forEach(id => state.nodesById.set(id, makeNode(id, { description: 'x', notes: 'x' })));
    state.edgesById.set('e1', makeEdge('e1', 'a', 'b'));
    state.edgesById.set('e2', makeEdge('e2', 'a', 'c'));
    state.edgesById.set('e3', makeEdge('e3', 'a', 'd'));

    expect(computeNodeInsights(state).some(i => i.type === 'many-relationships')).toBe(false);
  });

  it('markiert einen Node deutlich über dem Durchschnitt als Ausreißer, sobald genug Nodes vorhanden sind', () => {
    // 6 Nodes, a ist bidirektional mit jedem anderen verbunden (Grad 10),
    // jeder andere Node hat nur Grad 2 (je eine Kante zu/von a). Durchschnitt
    // liegt bei (10+2+2+2+2+2)/6 ≈ 3,3 — a liegt klar über average+4.
    const state = createEmptyGraphState({ kind: 'all' });
    ['a', 'b', 'c', 'd', 'e', 'f'].forEach(id => state.nodesById.set(id, makeNode(id, { description: 'x', notes: 'x' })));
    let i = 0;
    for (const other of ['b', 'c', 'd', 'e', 'f']) {
      state.edgesById.set(`out-${other}`, makeEdge(`out-${i}`, 'a', other));
      state.edgesById.set(`in-${other}`, makeEdge(`in-${i}`, other, 'a'));
      i++;
    }

    const insights = computeNodeInsights(state);
    expect(insights).toContainEqual({ nodeId: 'a', type: 'many-relationships' });
    expect(insights.filter(i => i.type === 'many-relationships').map(i => i.nodeId)).toEqual(['a']);
  });

  it('markiert niemanden, wenn die Kanten gleichmäßig verteilt sind', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    ['a', 'b', 'c', 'd', 'e'].forEach(id => state.nodesById.set(id, makeNode(id, { description: 'x', notes: 'x' })));
    state.edgesById.set('e1', makeEdge('e1', 'a', 'b'));
    state.edgesById.set('e2', makeEdge('e2', 'b', 'c'));
    state.edgesById.set('e3', makeEdge('e3', 'c', 'd'));
    state.edgesById.set('e4', makeEdge('e4', 'd', 'e'));

    expect(computeNodeInsights(state).filter(i => i.type === 'many-relationships')).toEqual([]);
  });

  it('ignoriert archivierte Kanten und Kanten zu archivierten Nodes bei der Zählung', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    ['a', 'b', 'c', 'd', 'e'].forEach(id => state.nodesById.set(id, makeNode(id, { description: 'x', notes: 'x' })));
    state.edgesById.set('e1', makeEdge('e1', 'a', 'b', { archivedAt: 1 }));
    state.edgesById.set('e2', makeEdge('e2', 'a', 'c', { archivedAt: 1 }));
    state.edgesById.set('e3', makeEdge('e3', 'a', 'd', { archivedAt: 1 }));

    expect(computeNodeInsights(state).filter(i => i.type === 'many-relationships')).toEqual([]);
  });
});

describe('groupInsightsByNode', () => {
  it('gruppiert mehrere Insights desselben Node zusammen', () => {
    const grouped = groupInsightsByNode([
      { nodeId: 'a', type: 'no-description' },
      { nodeId: 'a', type: 'no-notes' },
      { nodeId: 'b', type: 'no-notes' },
    ]);
    expect(grouped.get('a')).toEqual([{ nodeId: 'a', type: 'no-description' }, { nodeId: 'a', type: 'no-notes' }]);
    expect(grouped.get('b')).toEqual([{ nodeId: 'b', type: 'no-notes' }]);
    expect(grouped.has('c')).toBe(false);
  });
});
