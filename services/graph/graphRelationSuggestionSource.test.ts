import { describe, it, expect } from 'vitest';
import { createEmptyGraphState, type GraphEdge, type GraphNode } from './types';
import { buildRelationSuggestionSource, validateRelationSuggestions, type RelationSuggestion } from './graphRelationSuggestionSource';

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

describe('buildRelationSuggestionSource', () => {
  it('liefert null bei weniger als 2 aktiven Nodes', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    state.nodesById.set('a', makeNode('a'));
    expect(buildRelationSuggestionSource(state)).toBeNull();
  });

  it('ignoriert archivierte Nodes bei der Mindest-Anzahl', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    state.nodesById.set('a', makeNode('a'));
    state.nodesById.set('b', makeNode('b', { archivedAt: 1 }));
    expect(buildRelationSuggestionSource(state)).toBeNull();
  });

  it('deckelt die Kandidaten-Anzahl auf 60 Nodes', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    for (let i = 0; i < 80; i++) state.nodesById.set(`n${i}`, makeNode(`n${i}`));
    const result = buildRelationSuggestionSource(state);
    expect(result).not.toBeNull();
    expect(result!.candidateIds.size).toBe(60);
  });

  it('nimmt Titel/Beschreibung/Notizen in den Quelltext auf', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    state.nodesById.set('a', makeNode('a', { title: 'Konzept A', description: 'Beschreibung A', notes: 'Notiz A' }));
    state.nodesById.set('b', makeNode('b', { title: 'Konzept B' }));
    const result = buildRelationSuggestionSource(state);
    expect(result!.source.text).toContain('Konzept A');
    expect(result!.source.text).toContain('Beschreibung A');
    expect(result!.source.text).toContain('Notiz A');
  });

  it('listet bereits verbundene Paare auf, damit sie nicht erneut vorgeschlagen werden', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    state.nodesById.set('a', makeNode('a'));
    state.nodesById.set('b', makeNode('b'));
    state.edgesById.set('e1', makeEdge('e1', 'a', 'b'));
    const result = buildRelationSuggestionSource(state);
    expect(result!.source.text).toContain('Bereits verbundene Paare');
  });
});

describe('validateRelationSuggestions', () => {
  const baseState = () => {
    const state = createEmptyGraphState({ kind: 'all' });
    state.nodesById.set('a', makeNode('a'));
    state.nodesById.set('b', makeNode('b'));
    state.nodesById.set('c', makeNode('c', { archivedAt: 1 }));
    return state;
  };

  it('akzeptiert einen gültigen Vorschlag zwischen zwei existierenden, unverbundenen Nodes', () => {
    const state = baseState();
    const raw: RelationSuggestion[] = [{ sourceNodeId: 'a', targetNodeId: 'b', reason: 'könnte zusammengehören' }];
    expect(validateRelationSuggestions(state, raw)).toEqual(raw);
  });

  it('verwirft Vorschläge mit nicht existierender ID', () => {
    const state = baseState();
    const raw: RelationSuggestion[] = [{ sourceNodeId: 'a', targetNodeId: 'zzz', reason: 'x' }];
    expect(validateRelationSuggestions(state, raw)).toEqual([]);
  });

  it('verwirft Vorschläge, die auf einen archivierten Node verweisen', () => {
    const state = baseState();
    const raw: RelationSuggestion[] = [{ sourceNodeId: 'a', targetNodeId: 'c', reason: 'x' }];
    expect(validateRelationSuggestions(state, raw)).toEqual([]);
  });

  it('verwirft Vorschläge mit identischer Quell- und Ziel-ID', () => {
    const state = baseState();
    const raw: RelationSuggestion[] = [{ sourceNodeId: 'a', targetNodeId: 'a', reason: 'x' }];
    expect(validateRelationSuggestions(state, raw)).toEqual([]);
  });

  it('verwirft Vorschläge zwischen bereits verbundenen Nodes (auch in umgekehrter Richtung)', () => {
    const state = baseState();
    state.edgesById.set('e1', makeEdge('e1', 'a', 'b'));
    const raw: RelationSuggestion[] = [{ sourceNodeId: 'b', targetNodeId: 'a', reason: 'x' }];
    expect(validateRelationSuggestions(state, raw)).toEqual([]);
  });

  it('dedupliziert mehrfach genannte Paare (auch mit vertauschter Reihenfolge)', () => {
    const state = baseState();
    const raw: RelationSuggestion[] = [
      { sourceNodeId: 'a', targetNodeId: 'b', reason: 'erste Nennung' },
      { sourceNodeId: 'b', targetNodeId: 'a', reason: 'zweite Nennung, gleiches Paar' },
    ];
    expect(validateRelationSuggestions(state, raw)).toHaveLength(1);
  });
});
