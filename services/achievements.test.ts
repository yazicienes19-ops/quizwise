import { describe, it, expect } from 'vitest';
import { computeAchievements } from './achievements';
import type { FlashcardDeck } from '../types';

const deck = (reps: number[]): FlashcardDeck => ({
  id: 'd', title: 'T',
  cards: reps.map((r, i) => ({ id: `c${i}`, front: 'F', back: 'B', level: 0, nextReview: 0, srs: { ease: 2.5, interval: 1, repetitions: r, nextReview: 0, lastReview: 0 } })),
});

const empty = { bestStreak: 0, decks: [], quizResults: [], recallResults: [], examResults: [], documentCount: 0 };

describe('computeAchievements', () => {
  it('ohne Daten: alle auf Stufe 0 mit erstem Ziel', () => {
    const a = computeAchievements(empty);
    expect(a.map(x => x.tier)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(a.find(x => x.id === 'streak')!.next).toBe(3);
  });

  it('zählt Werte richtig und vergibt Stufen an den Schwellen', () => {
    const a = computeAchievements({
      bestStreak: 7,
      decks: [deck([30, 20]), deck([0, 5])],
      quizResults: [{ totalCount: 10 }, { totalCount: 40 }],
      recallResults: [{ method: 'recall' }, {}, { method: 'explainer' }],
      examResults: [{ passed: true }, { passed: false }],
      documentCount: 25,
    });
    const by = Object.fromEntries(a.map(x => [x.id, x]));
    expect(by.streak).toMatchObject({ value: 7, tier: 2, next: 30 });
    expect(by.cards).toMatchObject({ value: 55, tier: 1, next: 250 });
    expect(by.quiz).toMatchObject({ value: 50, tier: 1 });
    expect(by.feynman).toMatchObject({ value: 2, tier: 1, next: 10 });
    expect(by.exam).toMatchObject({ value: 1, tier: 1 });
    expect(by.library).toMatchObject({ value: 25, tier: 3, next: null });
  });
});
