import { describe, it, expect } from 'vitest';
import type { GraphNode } from './types';
import { buildNodeLearningText, buildNodeGenerationSource, buildNodeSyntheticDocument } from './graphLearningSource';

const makeNode = (overrides: Partial<GraphNode> = {}): GraphNode => ({
  id: 'node-1', type: 'begriff', title: 'Konditionierung', description: '', notes: '', tags: [],
  position: { x: 0, y: 0 }, pinned: false, version: 1, createdAt: 0, updatedAt: 0,
  ...overrides,
});

describe('buildNodeLearningText', () => {
  it('kombiniert Titel, Beschreibung und Notiz mit Leerzeile getrennt', () => {
    const node = makeNode({ description: 'Lernprozess durch Reizassoziation.', notes: 'Wichtig für die Klausur.' });
    expect(buildNodeLearningText(node)).toBe(
      'Konditionierung\n\nLernprozess durch Reizassoziation.\n\nWichtig für die Klausur.',
    );
  });

  it('lässt leere Beschreibung/Notiz einfach weg, statt Leerzeilen zu erzeugen', () => {
    const node = makeNode({ description: '', notes: '   ' });
    expect(buildNodeLearningText(node)).toBe('Konditionierung');
  });
});

describe('buildNodeGenerationSource', () => {
  it('verpackt den Text als reine Text-GenerationSource', () => {
    const node = makeNode({ description: 'Kurz.' });
    expect(buildNodeGenerationSource(node)).toEqual({ text: 'Konditionierung\n\nKurz.' });
  });
});

describe('buildNodeSyntheticDocument', () => {
  it('baut ein clientseitiges ProcessedDocument mit stabiler, node-abgeleiteter ID', () => {
    const node = makeNode({ id: 'abc-123', description: 'Text.' });
    const doc = buildNodeSyntheticDocument(node);
    expect(doc.id).toBe('graph-node-abc-123');
    expect(doc.name).toBe('Konditionierung');
    expect(doc.type).toBe('text');
    expect(doc.content).toBe('Konditionierung\n\nText.');
  });
});
