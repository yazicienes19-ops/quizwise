import { describe, it, expect } from 'vitest';
import type { GraphNodeSummary } from './types';
import { searchNodes } from './graphSearchService';

const makeSummary = (id: string, title: string, tags: string[] = []): GraphNodeSummary => ({
  id, title, type: 'begriff', position: { x: 0, y: 0 }, tags,
});

describe('searchNodes', () => {
  it('liefert keine Ergebnisse für eine leere Anfrage', () => {
    const nodes = [makeSummary('n1', 'Falsifikation')];
    expect(searchNodes(nodes, '')).toEqual([]);
    expect(searchNodes(nodes, '   ')).toEqual([]);
  });

  it('findet Titel case-insensitive', () => {
    const nodes = [makeSummary('n1', 'Falsifikationsprinzip')];
    const results = searchNodes(nodes, 'FALSIFIKATION');
    expect(results).toHaveLength(1);
    expect(results[0].node.id).toBe('n1');
  });

  it('bewertet exakten Titeltreffer höher als einen Präfix-Treffer, höher als einen Enthalten-Treffer', () => {
    const exact = makeSummary('exact', 'Popper');
    const prefix = makeSummary('prefix', 'Popperianismus');
    const contains = makeSummary('contains', 'Karl Popper und die Wissenschaftstheorie');
    const results = searchNodes([contains, prefix, exact], 'popper');

    expect(results.map(r => r.node.id)).toEqual(['exact', 'prefix', 'contains']);
  });

  it('findet über Tags, wenn der Titel nicht passt', () => {
    const nodes = [makeSummary('n1', 'Klassische Konditionierung', ['lernpsychologie', 'behaviorismus'])];
    const results = searchNodes(nodes, 'behaviorismus');
    expect(results).toHaveLength(1);
    expect(results[0].matchedOn).toBe('tag-exact');
  });

  it('bewertet Titel-Treffer immer höher als reine Tag-Treffer', () => {
    const tagMatch = makeSummary('tag', 'Anderes Thema', ['popper']);
    const titleMatch = makeSummary('title', 'Popper-Kritik');
    const results = searchNodes([tagMatch, titleMatch], 'popper');
    expect(results[0].node.id).toBe('title');
  });

  it('liefert kein Ergebnis, wenn weder Titel noch Tags passen', () => {
    const nodes = [makeSummary('n1', 'Klassische Konditionierung', ['lernpsychologie'])];
    expect(searchNodes(nodes, 'quantenmechanik')).toEqual([]);
  });

  it('begrenzt die Ergebnisse auf `limit`', () => {
    const nodes = Array.from({ length: 30 }, (_, i) => makeSummary(`n${i}`, `Konzept ${i}`));
    const results = searchNodes(nodes, 'konzept', 5);
    expect(results).toHaveLength(5);
  });
});
