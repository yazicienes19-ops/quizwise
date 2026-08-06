import { describe, it, expect } from 'vitest';
import type { GraphNode } from './types';
import { buildNodeLearningText, buildNodeGenerationSource, buildNodeSyntheticDocument, buildNodeDialogSource } from './graphLearningSource';

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

describe('buildNodeDialogSource', () => {
  it('hängt Beziehungen als eigenen Block an den Node-Text an', () => {
    const node = makeNode({ description: 'Lernprozess durch Reizassoziation.' });
    const source = buildNodeDialogSource(node, [
      { key: 'e1', otherNodeId: 'n2', otherTitle: 'Pawlow', text: '→ Beispiel für Pawlow' },
      { key: 'e2', otherNodeId: 'n3', otherTitle: 'Löschung', text: '↔ Gegensatz zu Löschung' },
    ]);
    expect(source).toEqual({
      text:
        'Konditionierung\n\nLernprozess durch Reizassoziation.' +
        '\n\nBeziehungen zu anderen Konzepten im Wissensnetz:\n- → Beispiel für Pawlow\n- ↔ Gegensatz zu Löschung',
    });
  });

  it('lässt den Beziehungs-Block komplett weg, wenn es keine Beziehungen gibt', () => {
    const node = makeNode();
    expect(buildNodeDialogSource(node, [])).toEqual(buildNodeGenerationSource(node));
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
