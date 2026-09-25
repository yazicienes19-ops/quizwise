import { describe, it, expect } from 'vitest';
import { splitSections, planModule, scaleChunks, suggestNewPerDay, docTag, MAX_MODULE_CARDS, CHUNK_CHARS } from './moduleDeck';
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

  it('nutzt den PDF-Volltext statt der Zusammenfassung: ein 300-Seiten-Buch ergibt hunderte Karten', () => {
    const book = doc({ id: 'buch', digestStatus: 'ready', digestText: para(20000) });
    const full = new Map([['buch', { text: Array.from({ length: 300 }, () => para(2500)).join('\n\n'), pages: 300 }]]);
    const fromSummary = planModule([book], 'thorough');
    const fromFull = planModule([book], 'thorough', full);
    expect(fromSummary.docs[0].fullText).toBe(false);
    expect(fromFull.docs[0].fullText).toBe(true);
    expect(fromFull.totalCards).toBeGreaterThanOrEqual(400); // etwa 1,5 bis 2 Karten je Seite
    expect(fromFull.totalCards).toBeLessThanOrEqual(600);
    expect(fromFull.totalCards).toBeGreaterThan(fromSummary.totalCards * 5);
    expect(planModule([book], 'overview', full).totalCards).toBeLessThan(planModule([book], 'standard', full).totalCards);
  });

  it('Folien mit wenig Text je Seite: gründlich etwa eine Karte je Seite', () => {
    const slides = doc({ id: 'folien', digestStatus: 'ready', digestText: para(15000) });
    const full = new Map([['folien', { text: Array.from({ length: 317 }, () => para(400)).join('\n\n'), pages: 317 }]]);
    expect(planModule([slides], 'thorough', full).totalCards).toBe(317);
    expect(planModule([slides], 'standard', full).totalCards).toBe(159);
    expect(planModule([slides], 'overview', full).totalCards).toBe(79);
  });

  it('kürzt anteilig exakt auf die Grenze und legt leere Abschnitte zusammen, ohne Text zu verlieren', () => {
    const chunks = Array.from({ length: 10 }, (_, i) => ({ text: `T${i}`, count: 2 }));
    const out = scaleChunks(chunks, 7);
    expect(out.reduce((s, c) => s + c.count, 0)).toBe(7);
    expect(out.every(c => c.count >= 1)).toBe(true);
    expect(out.map(c => c.text).join('\n\n').split('\n\n')).toEqual(chunks.map(c => c.text));
    expect(scaleChunks(chunks, 50)).toBe(chunks);
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
