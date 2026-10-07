import { describe, it, expect } from 'vitest';
import { buildStudioSources, buildStudioPrompt, checkCitations, toPlainExport, STUDIO_MIN_PER_SOURCE, mergeAdjacentCitations, splitGuide, studioSize, citedPages, stripCitations } from './subjectStudio';
import { parseCitationToken } from './citations';
import type { ProcessedDocument } from '../types';

const doc = (id: string, over: Partial<ProcessedDocument> = {}): ProcessedDocument => ({
  id, name: `${id}.pdf`, content: '', type: 'pdf', uploadDate: 0, collectionId: 'c1', ...over,
});

describe('buildStudioSources', () => {
  it('nummeriert lesbare Quellen, setzt Seitenmarken und überspringt Unlesbares', () => {
    const { sources, skipped } = buildStudioSources([
      { doc: doc('folien'), pages: ['Einleitung', '', 'Befunde'] },
      { doc: doc('skript', { digestText: 'Digest', digestStatus: 'ready' }) },
      { doc: doc('scan', { digestStatus: 'pending' }) },
    ]);
    expect(sources.map(s => [s.n, s.docId, s.paged])).toEqual([[1, 'folien', true], [2, 'skript', false]]);
    expect(sources[0].text).toContain('[Seite 1]\nEinleitung');
    expect(sources[0].text).toContain('[Seite 3]\nBefunde');
    expect(sources[0].text).not.toContain('[Seite 2]');
    expect(sources[0].lastPage).toBe(3);
    expect(skipped.map(d => d.id)).toEqual(['scan']);
  });

  it('kürzt große Quellen zugunsten kleiner und bleibt im Budget', () => {
    const big = Array.from({ length: 50 }, (_, i) => `Seite ${i} `.repeat(300));
    const { sources } = buildStudioSources([
      { doc: doc('gross'), pages: big },
      { doc: doc('klein', { type: 'text', content: 'kurze Notiz' }) },
    ], 40_000);
    const [gross, klein] = sources;
    expect(klein.text).toBe('kurze Notiz');
    expect(klein.truncated).toBe(false);
    expect(gross.truncated).toBe(true);
    expect(gross.text.length).toBeLessThanOrEqual(40_000);
    expect(gross.text.length).toBeGreaterThan(STUDIO_MIN_PER_SOURCE);
  });
});

describe('checkCitations', () => {
  const sources = buildStudioSources([
    { doc: doc('a'), pages: ['eins', 'zwei'] },
    { doc: doc('b', { type: 'text', content: 'Notiz' }) },
  ]).sources;

  it('behält gültige Fußnoten, entfernt unbekannte Quellen und unmögliche Seiten', () => {
    const res = checkCitations('Satz eins [1:2]. Satz zwei [2:5][7]. Mehrere [1, 2].', sources);
    expect(res.markdown).toBe('Satz eins [1:2]. Satz zwei [2]. Mehrere [1, 2].');
    expect(res.removed).toBe(1);
    expect(res.counts).toEqual({ 1: 2, 2: 2 });
  });

  it('Seite jenseits der gelieferten Seiten wird zur reinen Quellenangabe', () => {
    expect(checkCitations('X [1:9]', sources).markdown).toBe('X [1]');
  });
});

describe('Prompt und Export', () => {
  it('Prompt enthält Quellen, Format, Schwerpunkt und Fußnotenregel', () => {
    const { sources } = buildStudioSources([{ doc: doc('a', { type: 'text', content: 'Inhalt A' }) }]);
    const p = buildStudioPrompt('glossary', 'Statistik', sources, 'nur Kapitel 3');
    expect(p).toContain('QUELLE 1: a');
    expect(p).toContain('GLOSSAR');
    expect(p).toContain('nur Kapitel 3');
    expect(p).toContain('[n:p]');
  });

  it('Export schreibt Fußnoten aus und hängt die Quellenliste an', () => {
    const out = toPlainExport('Glossar', 'Begriff [1:4][2]', [{ n: 1, name: 'Folien' }, { n: 2, name: 'Skript' }]);
    expect(out).toContain('Begriff [1, S. 4][2]');
    expect(toPlainExport('X', 'a [1:10, 1:12, 2]', [])).toContain('a [1, S. 10, 12][2]');
    expect(out).toContain('1. Folien\n2. Skript');
  });

  it('parseCitationToken liest Seiten und Listen', () => {
    expect(parseCitationToken('[3:12; 4]')).toEqual([{ n: 3, page: 12 }, { n: 4 }]);
  });
});

describe('Fußnoten zusammenziehen', () => {
  it('fasst Nachbarn zusammen, sortiert und entfernt Doppelte', () => {
    expect(mergeAdjacentCitations('A [1:12][1:10][2][1:10]. B [3].')).toBe('A [1:10, 1:12, 2]. B [3].');
  });
});

describe('Selbsttest im Lernleitfaden', () => {
  const guide = [
    '## Kernkonzepte', '- **Lernen:** Veränderung [1:5].', '',
    '## Verständnisfragen',
    '- **Was ist latentes Lernen?** Lernen ohne sichtbares Verhalten [1:42].',
    '- **Was besagt das Premack-Prinzip?** Häufiges Verhalten verstärkt seltenes [1:28].',
    '', '## Typische Klausurfragen', '- Vergleichen Sie Hull und Lewin [1:140].',
  ].join('\n');

  it('macht aus Fragezeilen Selbsttest-Fragen, der Rest bleibt Markdown', () => {
    const seg = splitGuide(guide);
    expect(seg.map(s => s.type)).toEqual(['md', 'question', 'question', 'md']);
    const q = seg[1] as Extract<typeof seg[number], { type: 'question' }>;
    expect(q).toMatchObject({ index: 0, question: 'Was ist latentes Lernen?', answer: 'Lernen ohne sichtbares Verhalten [1:42].' });
    expect((seg[3] as { text: string }).text).toContain('Vergleichen Sie');
  });

  it('liest zitierte Seiten und entfernt Fußnoten für Prompts', () => {
    expect(citedPages('x [1:28, 1:30][2] y [1:28]')).toEqual([{ n: 1, pages: [28, 30] }, { n: 2, pages: [] }]);
    expect(stripCitations('Satz [1:2]. Noch einer [1, 2].')).toBe('Satz. Noch einer.');
  });

  it('Umfang wächst mit der Materialmenge', () => {
    expect(studioSize([{ text: 'x'.repeat(10_000) }])).toBe('small');
    expect(studioSize([{ text: 'x'.repeat(50_000) }])).toBe('medium');
    expect(studioSize([{ text: 'x'.repeat(100_000) }])).toBe('large');
    const big = buildStudioSources([{ doc: doc('s', { type: 'text', content: 'y'.repeat(100_000) }) }]).sources;
    expect(buildStudioPrompt('guide', 'F', big)).toContain('18 bis 25');
  });
});
