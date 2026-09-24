import { describe, it, expect } from 'vitest';
import { buildSubjectSummary, summaryFileName, TEXT_SOURCE_LIMIT } from './subjectSummary';
import type { ProcessedDocument } from '../types';

const labels = { missing: 'Noch keine Zusammenfassung.', truncated: 'Gekürzt.' };
const doc = (p: Partial<ProcessedDocument>): ProcessedDocument => ({
  id: p.id ?? 'd', name: p.name ?? 'Dok', content: '', type: 'pdf', uploadDate: 0, ...p,
});

describe('buildSubjectSummary', () => {
  it('bündelt Digests in Upload-Reihenfolge und setzt Überschriften tiefer', () => {
    const s = buildSubjectSummary('Sozialpsychologie', [
      doc({ id: 'b', name: 'Vorlesung 2', uploadDate: 2, digestStatus: 'ready', digestText: '# Konformität\nText B' }),
      doc({ id: 'a', name: 'Vorlesung 1', uploadDate: 1, digestStatus: 'ready', digestText: '## Halo Effekt\nText A' }),
    ], labels);
    expect(s.markdown.indexOf('## Vorlesung 1')).toBeLessThan(s.markdown.indexOf('## Vorlesung 2'));
    expect(s.markdown).toContain('### Halo Effekt');
    expect(s.markdown).toMatch(/^## Konformität/m);
    expect(s.markdown).not.toMatch(/^# Konformität/m);
    expect(s.markdown.startsWith('# Sozialpsychologie')).toBe(true);
    expect(s).toMatchObject({ included: 2, missing: 0 });
  });

  it('nutzt bei Textquellen den Text und kürzt lange Texte', () => {
    const long = 'x'.repeat(TEXT_SOURCE_LIMIT + 50);
    const s = buildSubjectSummary('Fach', [doc({ type: 'text', content: long })], labels);
    expect(s.markdown).toContain('_Gekürzt._');
    expect(s.included).toBe(1);
  });

  it('markiert Dokumente ohne Digest statt sie wegzulassen', () => {
    const s = buildSubjectSummary('Fach', [doc({ name: 'Scan', digestStatus: 'pending' })], labels);
    expect(s.markdown).toContain('## Scan\n\n_Noch keine Zusammenfassung._');
    expect(s).toMatchObject({ included: 0, missing: 1 });
  });
});

describe('summaryFileName', () => {
  it('entfernt Sonderzeichen', () => {
    expect(summaryFileName('Sozial & Persönlichkeit!')).toBe('Sozial_Persönlichkeit_Zusammenfassung.md');
    expect(summaryFileName('***')).toBe('Fach_Zusammenfassung.md');
  });
});

describe('buildSubjectSummary mit Markierungen', () => {
  it('hängt eigene Markierungen samt Notiz an das Dokument an', () => {
    const s = buildSubjectSummary(
      'Fach',
      [doc({ id: 'x', name: 'Folien', digestStatus: 'ready', digestText: 'Inhalt' })],
      { ...labels, highlights: 'Meine Markierungen', page: n => `S. ${n}` },
      id => (id === 'x' ? [{ page: 4, quote: 'Halo', note: 'Klausur' }, { page: 7, quote: 'Asch' }] : []),
    );
    expect(s.markdown).toContain('### Meine Markierungen\n\n- „Halo“ (S. 4): Klausur\n- „Asch“ (S. 7)');
  });
});

describe('buildSubjectSummary mit freien Notizen', () => {
  it('zeigt Notizen ohne Markierung mit Seite und Text', () => {
    const s = buildSubjectSummary('Fach', [doc({ id: 'x', name: 'Folien', digestStatus: 'ready', digestText: 'Inhalt' })],
      { ...labels, highlights: 'Meine Markierungen', page: n => `S. ${n}` },
      () => [{ page: 3, quote: '', note: 'Dozent fragen' }]);
    expect(s.markdown).toContain('- S. 3: Dozent fragen');
  });
});
