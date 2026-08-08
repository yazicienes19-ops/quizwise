import { describe, it, expect } from 'vitest';
import { createEmptyGraphState, type GraphEdge, type GraphNode, type GraphRelationType } from './types';
import { buildEdgeExplanationSource } from './graphEdgeExplanationSource';

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
  version: 1,
  createdAt: 0,
  updatedAt: 0,
  ...overrides,
});

const makeRelationType = (id: string, overrides: Partial<GraphRelationType> = {}): GraphRelationType => ({
  id,
  label: id,
  symmetric: false,
  isBuiltIn: false,
  sortOrder: 0,
  createdAt: 0,
  ...overrides,
});

describe('buildEdgeExplanationSource', () => {
  it('liefert null, wenn der Quellnode fehlt', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    state.nodesById.set('b', makeNode('b'));
    const edge = makeEdge('e1', 'a', 'b');
    expect(buildEdgeExplanationSource(state, edge)).toBeNull();
  });

  it('liefert null, wenn der Zielnode fehlt', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    state.nodesById.set('a', makeNode('a'));
    const edge = makeEdge('e1', 'a', 'b');
    expect(buildEdgeExplanationSource(state, edge)).toBeNull();
  });

  it('setzt Titel, Beschreibung und Notizen beider Konzepte in den Quelltext', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    state.nodesById.set('a', makeNode('a', { title: 'Konzept A', description: 'Beschreibung A', notes: 'Notiz A' }));
    state.nodesById.set('b', makeNode('b', { title: 'Konzept B', description: 'Beschreibung B', notes: 'Notiz B' }));
    const edge = makeEdge('e1', 'a', 'b');

    const ctx = buildEdgeExplanationSource(state, edge);
    expect(ctx).not.toBeNull();
    expect(ctx!.nodeATitle).toBe('Konzept A');
    expect(ctx!.nodeBTitle).toBe('Konzept B');
    expect(ctx!.source.text).toContain('Konzept A');
    expect(ctx!.source.text).toContain('Beschreibung A');
    expect(ctx!.source.text).toContain('Notiz A');
    expect(ctx!.source.text).toContain('Konzept B');
    expect(ctx!.source.text).toContain('Beschreibung B');
    expect(ctx!.source.text).toContain('Notiz B');
  });

  it('bevorzugt edge.label vor dem Label des Beziehungstyps', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    state.nodesById.set('a', makeNode('a', { title: 'A' }));
    state.nodesById.set('b', makeNode('b', { title: 'B' }));
    state.relationTypesById.set('rel-1', makeRelationType('rel-1', { label: 'Typ-Label' }));
    const edge = makeEdge('e1', 'a', 'b', { relationTypeId: 'rel-1', label: 'Freitext-Label' });

    const ctx = buildEdgeExplanationSource(state, edge);
    expect(ctx!.source.text).toContain('A → Freitext-Label → B');
    expect(ctx!.source.text).not.toContain('Typ-Label');
  });

  it('fällt auf das Label des Beziehungstyps zurück, wenn edge.label fehlt', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    state.nodesById.set('a', makeNode('a', { title: 'A' }));
    state.nodesById.set('b', makeNode('b', { title: 'B' }));
    state.relationTypesById.set('rel-1', makeRelationType('rel-1', { label: 'Typ-Label' }));
    const edge = makeEdge('e1', 'a', 'b', { relationTypeId: 'rel-1' });

    const ctx = buildEdgeExplanationSource(state, edge);
    expect(ctx!.source.text).toContain('A → Typ-Label → B');
  });

  it('nutzt einen Fallback-Text, wenn weder edge.label noch ein Beziehungstyp vorhanden ist', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    state.nodesById.set('a', makeNode('a', { title: 'A' }));
    state.nodesById.set('b', makeNode('b', { title: 'B' }));
    const edge = makeEdge('e1', 'a', 'b');

    const ctx = buildEdgeExplanationSource(state, edge);
    expect(ctx!.source.text).toContain('A → ohne Bezeichnung → B');
  });
});
