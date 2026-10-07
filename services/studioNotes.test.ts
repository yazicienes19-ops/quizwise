import { describe, it, expect, beforeEach } from 'vitest';
import { buildAnswerNote, resolveNoteCollection } from './studioNotes';
import type { Collection } from '../types';

describe('buildAnswerNote', () => {
  it('Frage wird Titel, Zitat mit Seitenfußnote, Dokument wird Quelle 1', () => {
    const note = buildAnswerNote({
      question: 'Was ist das  Premack-Prinzip?', answer: 'Häufiges Verhalten verstärkt seltenes.',
      quote: 'Verhaltensweisen mit hoher Auftretenswahrscheinlichkeit', source: { docId: 'd1', name: 'Allgemeine II', page: 28 },
    });
    expect(note.title).toBe('Was ist das Premack-Prinzip?');
    expect(note.markdown).toBe('Häufiges Verhalten verstärkt seltenes.\n\n*„Verhaltensweisen mit hoher Auftretenswahrscheinlichkeit“* [1:28]');
    expect(note.sources).toEqual([{ n: 1, docId: 'd1', name: 'Allgemeine II' }]);
  });

  it('ohne Zitat hängt die Fußnote an die Antwort, ohne Quelle gibt es keine', () => {
    expect(buildAnswerNote({ question: 'F', answer: 'A', source: { docId: 'd', name: 'N' } }).markdown).toBe('A [1]');
    const plain = buildAnswerNote({ question: 'x'.repeat(200), answer: 'A' });
    expect(plain.markdown).toBe('A');
    expect(plain.sources).toEqual([]);
    expect(plain.title.length).toBe(90);
  });
});

describe('resolveNoteCollection', () => {
  const cols: Collection[] = [{ id: 'a', name: 'A', emoji: '', color: '' }, { id: 'b', name: 'B', emoji: '', color: '' }];
  beforeEach(() => localStorage.clear());

  it('ausdrückliches Fach vor aktivem Fach, sonst null', () => {
    localStorage.setItem('studearc_active_module', 'b');
    expect(resolveNoteCollection('a', cols)?.id).toBe('a');
    expect(resolveNoteCollection(undefined, cols)?.id).toBe('b');
    localStorage.clear();
    expect(resolveNoteCollection('weg', cols)).toBeNull();
  });
});
