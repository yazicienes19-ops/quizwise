import { describe, it, expect, beforeEach } from 'vitest';
import {
  addHighlight, getHighlights, updateHighlight, removeHighlight, restoreHighlight, mergeHighlightMaps, HIGHLIGHTS_KEY,
} from './userHighlights';
import { mergeReadingProgress } from './syncService';

describe('userHighlights', () => {
  beforeEach(() => localStorage.clear());

  it('speichert Markierungen je Dokument im Lesefortschritt, ohne ihn zu überschreiben', () => {
    localStorage.setItem('studearc_reading_progress', JSON.stringify({ doc1: { 0: { done: true, doneAt: 1 } } }));
    addHighlight('doc1', { page: 3, quote: '  Der   Halo-Effekt ' }, null, 10);
    addHighlight('doc1', { page: 1, quote: 'Konformität', color: 'green' }, null, 20);
    const all = JSON.parse(localStorage.getItem('studearc_reading_progress')!);
    expect(all.doc1).toEqual({ 0: { done: true, doneAt: 1 } });
    const list = getHighlights('doc1');
    expect(list.map(h => h.page)).toEqual([1, 3]);
    expect(list[1].quote).toBe('Der Halo-Effekt');
    expect(list[1].color).toBe('yellow');
    expect(all[HIGHLIGHTS_KEY].doc1).toHaveLength(2);
  });

  it('ändert Notiz und Farbe, löscht als Grabstein und stellt wieder her', () => {
    const h = addHighlight('d', { page: 1, quote: 'Zitat' }, null, 1);
    updateHighlight('d', h.id, { note: 'wichtig', color: 'pink' }, null, 2);
    expect(getHighlights('d')[0]).toMatchObject({ note: 'wichtig', color: 'pink', updatedAt: 2 });
    removeHighlight('d', h.id, null, 3);
    expect(getHighlights('d')).toEqual([]);
    restoreHighlight('d', h.id, null, 4);
    expect(getHighlights('d')).toHaveLength(1);
  });

  it('gleicht Geräte ab: Vereinigung, jüngere Änderung gewinnt, Löschen bleibt gelöscht', () => {
    const base = { id: 'a', page: 1, quote: 'q', color: 'yellow' as const, createdAt: 1 };
    const local = { d: [{ ...base, updatedAt: 5, deleted: true }, { ...base, id: 'b', updatedAt: 1 }] };
    const cloud = { d: [{ ...base, updatedAt: 2, note: 'alt' }, { ...base, id: 'c', updatedAt: 1 }] };
    const m = mergeHighlightMaps(local, cloud);
    expect(m.d.map(h => h.id).sort()).toEqual(['a', 'b', 'c']);
    expect(m.d.find(h => h.id === 'a')).toMatchObject({ deleted: true, updatedAt: 5 });
  });

  it('mergeReadingProgress behandelt Markierungen gesondert', () => {
    const base = { page: 1, quote: 'q', color: 'yellow', createdAt: 1 };
    const local = { [HIGHLIGHTS_KEY]: { d: [{ ...base, id: 'a', updatedAt: 1 }] } } as any;
    const cloud = { [HIGHLIGHTS_KEY]: { d: [{ ...base, id: 'b', updatedAt: 1 }] } } as any;
    const merged = mergeReadingProgress(local, cloud) as any;
    expect(merged[HIGHLIGHTS_KEY].d.map((h: any) => h.id).sort()).toEqual(['a', 'b']);
  });
});

describe('frei gesetzte Notizen', () => {
  beforeEach(() => localStorage.clear());
  it('speichert eine Notiz ohne Markierung mit Position auf der Seite', async () => {
    const { isPinNote } = await import('./userHighlights');
    const h = addHighlight('d', { page: 2, pos: { x: 0.25, y: 1.4 }, note: 'Nachfragen' }, null, 1);
    expect(h).toMatchObject({ quote: '', pos: { x: 0.25, y: 1 }, note: 'Nachfragen' });
    expect(isPinNote(h)).toBe(true);
    expect(isPinNote({ quote: 'Text', pos: undefined })).toBe(false);
    expect(getHighlights('d')).toHaveLength(1);
  });
});
