import { describe, it, expect, beforeEach } from 'vitest';
import { markChapterDone, isChapterDone, getDoneChapterIndices, getDocProgress } from './chapterProgressService';

beforeEach(() => {
  localStorage.clear();
});

describe('markChapterDone / isChapterDone', () => {
  it('Kapitel ist standardmäßig nicht als gelesen markiert', () => {
    expect(isChapterDone('docA', 0)).toBe(false);
  });

  it('markiert ein Kapitel als gelesen', () => {
    markChapterDone('docA', 0);
    expect(isChapterDone('docA', 0)).toBe(true);
  });

  it('doppeltes Markieren ist idempotent — kein Duplikat, nur doneAt aktualisiert sich', () => {
    markChapterDone('docA', 0);
    const first = getDocProgress('docA')[0].doneAt;
    markChapterDone('docA', 0);
    const indices = getDoneChapterIndices('docA');
    expect(indices).toEqual([0]);
    expect(getDocProgress('docA')[0].doneAt).toBeGreaterThanOrEqual(first);
  });

  it('Kapitel-Fortschritt ist zwischen Dokumenten isoliert', () => {
    markChapterDone('docA', 0);
    expect(isChapterDone('docB', 0)).toBe(false);
    expect(getDoneChapterIndices('docB')).toEqual([]);
  });

  it('mehrere Kapitel desselben Dokuments werden unabhängig getrackt', () => {
    markChapterDone('docA', 2);
    markChapterDone('docA', 0);
    markChapterDone('docA', 5);
    expect(getDoneChapterIndices('docA')).toEqual([0, 2, 5]);
    expect(isChapterDone('docA', 1)).toBe(false);
  });

  it('unbekanntes Dokument liefert leeren Fortschritt statt Crash', () => {
    expect(getDocProgress('nie-existiert')).toEqual({});
    expect(getDoneChapterIndices('nie-existiert')).toEqual([]);
  });
});
