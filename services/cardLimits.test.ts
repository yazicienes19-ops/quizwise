import { describe, it, expect, beforeEach } from 'vitest';
import { getCardLimits, setCardLimits, todayUsage, remainingToday, DEFAULT_CARD_LIMITS } from './cardLimits';
import { buildSessionBatch, createSrsState, type SrsState } from './spacedRepetition';

const now = new Date(2026, 8, 25, 15, 0).getTime();
const today = new Date(2026, 8, 25, 9, 0).getTime();
const yesterday = new Date(2026, 8, 24, 9, 0).getTime();
const card = (srs: Partial<SrsState>) => ({ id: Math.random().toString(36), front: 'f', back: 'b', level: 0, nextReview: 0, srs: { ...createSrsState(), ...srs } });

describe('cardLimits', () => {
  beforeEach(() => localStorage.clear());

  it('startet mit Ankis Standard 20/200 und merkt sich Änderungen', () => {
    expect(getCardLimits()).toEqual(DEFAULT_CARD_LIMITS);
    setCardLimits({ newPerDay: 10, reviewsPerDay: 100 });
    expect(getCardLimits()).toEqual({ newPerDay: 10, reviewsPerDay: 100 });
  });

  it('zählt heute begonnene und heute wiederholte Karten getrennt', () => {
    const decks = [{ cards: [
      card({ lastReview: today, firstReview: today }),
      card({ lastReview: today, firstReview: yesterday }),
      card({ lastReview: yesterday, firstReview: yesterday }),
      card({}),
    ] }];
    expect(todayUsage(decks as any, now)).toEqual({ newToday: 1, reviewsToday: 1 });
    expect(remainingToday(decks as any, { newPerDay: 20, reviewsPerDay: 200 }, now)).toMatchObject({ newLeft: 19, reviewLeft: 199 });
  });
});

describe('buildSessionBatch mit Tageslimits', () => {
  const due = Date.now() - 1000;
  const fresh = (n: number) => Array.from({ length: n }, () => card({ nextReview: due }));
  const review = (n: number) => Array.from({ length: n }, () => card({ nextReview: due, lastReview: due - 86_400_000 * 5, interval: 5, difficulty: 5 }));

  it('begrenzt neue Karten und Wiederholungen und meldet Zurückgehaltene', () => {
    const b = buildSessionBatch([...fresh(8), ...review(6)], 30, { newLeft: 3, reviewLeft: 2 });
    expect(b.cards.filter(c => !c.srs?.lastReview)).toHaveLength(3);
    expect(b.cards.filter(c => c.srs?.lastReview)).toHaveLength(2);
    expect(b.heldBack).toBe(9);
  });

  it('ohne Restkontingent ist die Runde leer, alles zurückgehalten', () => {
    const b = buildSessionBatch([...fresh(2), ...review(2)], 30, { newLeft: 0, reviewLeft: 0 });
    expect(b.cards).toHaveLength(0);
    expect(b.heldBack).toBe(4);
  });

  it('ohne Limits wie bisher', () => {
    expect(buildSessionBatch([...fresh(2), ...review(2)]).heldBack).toBe(0);
  });
});
