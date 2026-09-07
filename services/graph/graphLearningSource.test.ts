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
  it('verpackt den Text als reine Text-GenerationSource, wenn keine Verknüpfungen übergeben werden', () => {
    const node = makeNode({ description: 'Kurz.' });
    expect(buildNodeGenerationSource(node)).toEqual({ text: 'Konditionierung\n\nKurz.' });
  });

  it('hängt Beziehungen inkl. Beschreibungs-Schnipsel als eigenen Kontext-Block an', () => {
    const node = makeNode({ description: 'Lernprozess durch Reizassoziation.' });
    const source = buildNodeGenerationSource(node, [
      { key: 'e1', otherNodeId: 'n2', otherTitle: 'Pawlow', text: '→ Beispiel für Pawlow', otherDescriptionSnippet: 'Russischer Physiologe.' },
      { key: 'e2', otherNodeId: 'n3', otherTitle: 'Löschung', text: '↔ Gegensatz zu Löschung', otherDescriptionSnippet: '' },
    ]);
    expect(source.text).toContain('Konditionierung\n\nLernprozess durch Reizassoziation.');
    expect(source.text).toContain('Verknüpfungen im persönlichen Wissensnetz des Nutzers');
    expect(source.text).toContain('- → Beispiel für Pawlow (Pawlow: "Russischer Physiologe.")');
    // Kein Schnipsel vorhanden -> keine leeren Klammern anhängen
    expect(source.text).toContain('- ↔ Gegensatz zu Löschung\n');
    expect(source.text).not.toContain('Löschung: ""');
  });

  it('weist darauf hin, dass Verknüpfungen keine automatisch geprüften Fakten sind', () => {
    const node = makeNode();
    const source = buildNodeGenerationSource(node, [
      { key: 'e1', otherNodeId: 'n2', otherTitle: 'Therapieschule', text: '→ ist Beispiel für Therapieschule', otherDescriptionSnippet: '' },
    ]);
    expect(source.text).toContain('keine automatisch geprüften Fakten');
  });

  it('verlangt semantische Integration OHNE sichtbare Meta-Verweise auf das Wissensnetz (User-Feedback 2026-09-07)', () => {
    const node = makeNode();
    const source = buildNodeGenerationSource(node, [
      { key: 'e1', otherNodeId: 'n2', otherTitle: 'Therapieschule', text: '→ ist Beispiel für Therapieschule', otherDescriptionSnippet: '' },
    ]);
    expect(source.text).toContain('OHNE technische Meta-Hinweise');
    expect(source.text).toContain('laut deinem Wissensnetz');
    expect(source.text).toContain('AUSNAHME');
    expect(source.text).toContain('fachlich NICHT etabliert');
  });

  it('lässt den Beziehungs-Block komplett weg, wenn es keine Beziehungen gibt', () => {
    const node = makeNode();
    expect(buildNodeGenerationSource(node, [])).toEqual({ text: 'Konditionierung' });
  });
});

describe('buildNodeDialogSource', () => {
  it('ist identisch zu buildNodeGenerationSource (kein eigener Aufbau mehr)', () => {
    const node = makeNode({ description: 'Lernprozess durch Reizassoziation.' });
    const entries = [{ key: 'e1', otherNodeId: 'n2', otherTitle: 'Pawlow', text: '→ Beispiel für Pawlow', otherDescriptionSnippet: '' }];
    expect(buildNodeDialogSource(node, entries)).toEqual(buildNodeGenerationSource(node, entries));
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
