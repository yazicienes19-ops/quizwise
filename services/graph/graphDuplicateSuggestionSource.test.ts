import { describe, it, expect } from 'vitest';
import { createEmptyGraphState, type GraphEdge, type GraphNode } from './types';
import { buildDuplicateSuggestionSource, validateDuplicateSuggestions, type DuplicateSuggestion } from './graphDuplicateSuggestionSource';

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

describe('buildDuplicateSuggestionSource', () => {
  it('liefert null bei weniger als 2 aktiven Nodes', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    state.nodesById.set('a', makeNode('a'));
    expect(buildDuplicateSuggestionSource(state)).toBeNull();
  });

  it('ignoriert archivierte Nodes bei der Mindest-Anzahl', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    state.nodesById.set('a', makeNode('a'));
    state.nodesById.set('b', makeNode('b', { archivedAt: 1 }));
    expect(buildDuplicateSuggestionSource(state)).toBeNull();
  });

  it('deckelt die Kandidaten-Anzahl auf 60 Nodes', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    for (let i = 0; i < 80; i++) state.nodesById.set(`n${i}`, makeNode(`n${i}`));
    const result = buildDuplicateSuggestionSource(state);
    expect(result).not.toBeNull();
    expect(result!.candidateIds.size).toBe(60);
  });

  it('nimmt Titel/Beschreibung/Notizen in den Quelltext auf', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    state.nodesById.set('a', makeNode('a', { title: 'Arbeitsgedächtnis', description: 'Beschreibung A', notes: 'Notiz A' }));
    state.nodesById.set('b', makeNode('b', { title: 'Working Memory' }));
    const result = buildDuplicateSuggestionSource(state);
    expect(result!.source.text).toContain('Arbeitsgedächtnis');
    expect(result!.source.text).toContain('Working Memory');
    expect(result!.source.text).toContain('Beschreibung A');
    expect(result!.source.text).toContain('Notiz A');
  });

  it('nennt bereits verbundene Paare nur als weichen Hinweis, nicht als hartes Verbot', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    state.nodesById.set('a', makeNode('a'));
    state.nodesById.set('b', makeNode('b'));
    state.edgesById.set('e1', makeEdge('e1', 'a', 'b'));
    const result = buildDuplicateSuggestionSource(state);
    expect(result!.source.text).toContain('Bereits verbundene Paare');
    expect(result!.source.text).toContain('keine Duplikate');
  });
});

describe('validateDuplicateSuggestions', () => {
  const baseState = () => {
    const state = createEmptyGraphState({ kind: 'all' });
    state.nodesById.set('a', makeNode('a'));
    state.nodesById.set('b', makeNode('b'));
    state.nodesById.set('c', makeNode('c', { archivedAt: 1 }));
    return state;
  };

  it('akzeptiert einen gültigen Vorschlag zwischen zwei existierenden Nodes', () => {
    const state = baseState();
    const raw: DuplicateSuggestion[] = [{ nodeAId: 'a', nodeBId: 'b', reason: 'könnte dasselbe Konzept sein' }];
    expect(validateDuplicateSuggestions(state, raw)).toEqual(raw);
  });

  it('erlaubt Vorschläge für bereits verbundene Nodes (kein hartes Verbot wie bei Beziehungs-Vorschlägen)', () => {
    const state = baseState();
    state.edgesById.set('e1', makeEdge('e1', 'a', 'b'));
    const raw: DuplicateSuggestion[] = [{ nodeAId: 'a', nodeBId: 'b', reason: 'x' }];
    expect(validateDuplicateSuggestions(state, raw)).toEqual(raw);
  });

  it('verwirft Vorschläge mit nicht existierender ID', () => {
    const state = baseState();
    const raw: DuplicateSuggestion[] = [{ nodeAId: 'a', nodeBId: 'zzz', reason: 'x' }];
    expect(validateDuplicateSuggestions(state, raw)).toEqual([]);
  });

  it('verwirft Vorschläge, die auf einen archivierten Node verweisen', () => {
    const state = baseState();
    const raw: DuplicateSuggestion[] = [{ nodeAId: 'a', nodeBId: 'c', reason: 'x' }];
    expect(validateDuplicateSuggestions(state, raw)).toEqual([]);
  });

  it('verwirft Vorschläge mit identischer nodeAId und nodeBId', () => {
    const state = baseState();
    const raw: DuplicateSuggestion[] = [{ nodeAId: 'a', nodeBId: 'a', reason: 'x' }];
    expect(validateDuplicateSuggestions(state, raw)).toEqual([]);
  });

  it('dedupliziert mehrfach genannte Paare (auch mit vertauschter Reihenfolge)', () => {
    const state = baseState();
    const raw: DuplicateSuggestion[] = [
      { nodeAId: 'a', nodeBId: 'b', reason: 'erste Nennung' },
      { nodeAId: 'b', nodeBId: 'a', reason: 'zweite Nennung, gleiches Paar' },
    ];
    expect(validateDuplicateSuggestions(state, raw)).toHaveLength(1);
  });
});
