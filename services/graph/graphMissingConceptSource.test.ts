import { describe, it, expect } from 'vitest';
import { createEmptyGraphState, type GraphNode, type GraphNodeDocumentRef } from './types';
import type { ProcessedDocument } from '../../types';
import { buildMissingConceptSource, validateMissingConceptSuggestions, type MissingConceptSuggestion } from './graphMissingConceptSource';

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

const makeRef = (id: string, nodeId: string, documentId: string): GraphNodeDocumentRef => ({
  id,
  nodeId,
  documentId,
  createdAt: 0,
});

const makeDoc = (overrides: Partial<ProcessedDocument> & { id: string }): ProcessedDocument => ({
  name: overrides.id,
  content: '',
  type: 'text',
  uploadDate: 0,
  ...overrides,
});

describe('buildMissingConceptSource', () => {
  it('liefert null ohne verknüpfte Dokumente', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    state.nodesById.set('a', makeNode('a'));
    expect(buildMissingConceptSource(state, [])).toBeNull();
  });

  it('liefert null, wenn verknüpfte Refs nur auf archivierte Nodes zeigen', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    state.nodesById.set('a', makeNode('a', { archivedAt: 1 }));
    state.nodeDocumentsById.set('r1', makeRef('r1', 'a', 'doc1'));
    const documents = [makeDoc({ id: 'doc1', type: 'text', content: 'Inhalt' })];
    expect(buildMissingConceptSource(state, documents)).toBeNull();
  });

  it('liefert null, wenn kein verknüpftes Dokument lesbaren Text hat (z.B. PDF ohne Digest)', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    state.nodesById.set('a', makeNode('a'));
    state.nodeDocumentsById.set('r1', makeRef('r1', 'a', 'doc1'));
    const documents = [makeDoc({ id: 'doc1', type: 'pdf', content: 'base64...', digestStatus: 'pending' })];
    expect(buildMissingConceptSource(state, documents)).toBeNull();
  });

  it('bevorzugt Digest-Text vor Volltext', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    state.nodesById.set('a', makeNode('a'));
    state.nodeDocumentsById.set('r1', makeRef('r1', 'a', 'doc1'));
    const documents = [makeDoc({ id: 'doc1', type: 'text', content: 'Volltext-Inhalt', digestText: 'Digest-Inhalt', digestStatus: 'ready' })];
    const result = buildMissingConceptSource(state, documents);
    expect(result!.source.text).toContain('Digest-Inhalt');
    expect(result!.source.text).not.toContain('Volltext-Inhalt');
  });

  it('enthält ein Quellen-Label pro Dokument', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    state.nodesById.set('a', makeNode('a'));
    state.nodeDocumentsById.set('r1', makeRef('r1', 'a', 'doc1'));
    const documents = [makeDoc({ id: 'doc1', name: 'Vorlesung 3.pdf', type: 'text', content: 'Inhalt' })];
    const result = buildMissingConceptSource(state, documents);
    expect(result!.source.text).toContain('[Quelle:');
  });

  it('listet bereits vorhandene aktive Node-Titel im Prompt auf', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    state.nodesById.set('a', makeNode('a', { title: 'Konzept A' }));
    state.nodeDocumentsById.set('r1', makeRef('r1', 'a', 'doc1'));
    const documents = [makeDoc({ id: 'doc1', type: 'text', content: 'Inhalt' })];
    const result = buildMissingConceptSource(state, documents);
    expect(result!.source.text).toContain('Bereits vorhandene Konzepte');
    expect(result!.source.text).toContain('Konzept A');
    expect(result!.existingTitles.has('konzept a')).toBe(true);
  });
});

describe('validateMissingConceptSuggestions', () => {
  const baseState = () => {
    const state = createEmptyGraphState({ kind: 'all' });
    state.nodesById.set('a', makeNode('a', { title: 'Arbeitsgedächtnis' }));
    return state;
  };

  it('akzeptiert einen gültigen, neuen Vorschlag', () => {
    const state = baseState();
    const raw: MissingConceptSuggestion[] = [{ title: 'Langzeitgedächtnis', description: 'x' }];
    expect(validateMissingConceptSuggestions(state, raw)).toEqual(raw);
  });

  it('verwirft einen leeren Titel', () => {
    const state = baseState();
    const raw: MissingConceptSuggestion[] = [{ title: '   ', description: 'x' }];
    expect(validateMissingConceptSuggestions(state, raw)).toEqual([]);
  });

  it('verwirft ein Titel-Duplikat zu einem bestehenden Node (case-insensitive)', () => {
    const state = baseState();
    const raw: MissingConceptSuggestion[] = [{ title: 'arbeitsgedächtnis', description: 'x' }];
    expect(validateMissingConceptSuggestions(state, raw)).toEqual([]);
  });

  it('dedupliziert mehrfach genannte Titel innerhalb derselben Antwort', () => {
    const state = baseState();
    const raw: MissingConceptSuggestion[] = [
      { title: 'Langzeitgedächtnis', description: 'erste Nennung' },
      { title: 'langzeitgedächtnis', description: 'zweite Nennung' },
    ];
    expect(validateMissingConceptSuggestions(state, raw)).toHaveLength(1);
  });
});
