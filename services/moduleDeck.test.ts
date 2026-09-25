import { describe, it, expect } from 'vitest';
import { splitSections, planModule, suggestNewPerDay, docTag, MAX_MODULE_CARDS, CHUNK_CHARS } from './moduleDeck';
import type { ProcessedDocument } from '../types';

const doc = (p: Partial<ProcessedDocument>): ProcessedDocument => ({ id: 'd', name: 'Folien.pdf', content: '', type: 'pdf', uploadDate: 0, ...p });
const para = (n: number) => 'Satz über Lernpsychologie. '.repeat(Math.ceil(n / 27)).slice(0, n);

describe('moduleDeck', () => {
  it('teilt an Überschriften, fasst Kleines zusammen, teilt Großes', () => {
    const text = `# A\n${para(500)}\n## B\n${para(500)}\n## C\n${para(9000)}`;
    const parts = splitSections(text);
    expect(parts.every(p => p.length <= CHUNK_CHARS)).toBe(true);
    expect(parts[0]).toContain('# A');
    expect(parts[0]).toContain('## B'); // klein, zusammengefasst
    // kein Inhalt verloren: gleiche Zahl sichtbarer Zeichen
    expect(parts.join('').replace(/\s/g, '').length).toBe(text.replace(/\s/g, '').length);
  });

  it('plant mehr Karten für längere Dokumente und je Stufe, überspringt Unfertiges', () => {
    const docs = [
      doc({ id: 'kurz', digestStatus: 'ready', digestText: para(2000), uploadDate: 1 }),
      doc({ id: 'lang', digestStatus: 'ready', digestText: para(12000), uploadDate: 2 }),
      doc({ id: 'offen', digestStatus: 'pending', uploadDate: 3 }),
      doc({ id: 'text', type: 'text', content: para(3000), uploadDate: 4 }),
    ];
    const std = planModule(docs, 'standard');
    expect(std.skipped.map(d => d.id)).toEqual(['offen']);
    const cards = Object.fromEntries(std.docs.map(d => [d.doc.id, d.cards]));
    expect(cards.lang).toBeGreaterThan(cards.kurz);
    expect(planModule(docs, 'thorough').totalCards).toBeGreaterThan(std.totalCards);
    expect(planModule(docs, 'overview').totalCards).toBeLessThan(std.totalCards);
  });

  it('hält die Obergrenze fürs Fach ein', () => {
    const docs = Array.from({ length: 12 }, (_, i) => doc({ id: `d${i}`, digestStatus: 'ready', digestText: para(60000) }));
    expect(planModule(docs, 'thorough').totalCards).toBeLessThanOrEqual(MAX_MODULE_CARDS);
  });

  it('rechnet neue Karten pro Tag bis zur Klausur mit Puffer', () => {
    const now = new Date(2026, 8, 25, 10).getTime();
    expect(suggestNewPerDay(240, '2026-10-25', now)).toEqual({ perDay: 9, days: 27 }); // 30 Tage minus 3 Puffer
    expect(suggestNewPerDay(10, '2026-09-26', now)).toEqual({ perDay: 10, days: 1 });
    expect(suggestNewPerDay(10, '2026-09-20', now)).toBeNull();
  });

  it('macht aus Dateinamen kurze Schlagwörter', () => {
    expect(docTag(doc({ name: 'Folien 1-19.pdf' }))).toBe('Folien 1-19');
  });
});
