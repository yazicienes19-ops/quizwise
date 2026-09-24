import { describe, it, expect } from 'vitest';
import type { FlashcardDeck, Flashcard } from '../types';
import { findDuplicateDeckGroups, mergeDuplicateDecks } from './duplicateDecks';

const card = (id: string, front: string, back: string, reps = 0, lastReview = 0): Flashcard =>
  ({ id, front, back, level: 0, nextReview: 0, srs: { ease: 2.5, interval: 1, repetitions: reps, nextReview: 0, lastReview } });
const deck = (id: string, title: string, cards: Flashcard[]): FlashcardDeck => ({ id, title, cards });

describe('duplicateDecks', () => {
  it('findet gleich benannte Stapel unabhängig von Groß-/Kleinschreibung und Leerzeichen', () => {
    const groups = findDuplicateDeckGroups([
      deck('a', 'Halo Effekt', []), deck('b', 'halo  effekt ', []), deck('c', 'Anderes', []),
    ]);
    expect(groups.map(g => g.map(d => d.id))).toEqual([['a', 'b']]);
  });

  it('führt zusammen: Basis mit mehr Fortschritt, doppelte Karten einmal, besserer Lernstand bleibt', () => {
    const a = deck('a', 'Halo', [card('1', 'Was ist X?', 'Y', 0), card('2', 'Z', 'W', 0)]);
    const b = deck('b', 'Halo', [card('3', 'was ist x? ', 'y', 3, 100), card('4', 'Neu', 'N', 0)]);
    const merged = mergeDuplicateDecks([a, b]);
    expect(merged.id).toBe('b');
    expect(merged.cards).toHaveLength(3);
    expect(merged.cards.find(c => c.front.toLowerCase().startsWith('was ist'))!.srs!.repetitions).toBe(3);
  });
});
