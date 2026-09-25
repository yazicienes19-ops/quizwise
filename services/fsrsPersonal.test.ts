import { describe, it, expect, afterEach } from 'vitest';
import { fitStability, firstReviewPairs, personalize, MIN_PAIRS } from './fsrsPersonal';
import { FSRS_WEIGHTS, FACTOR, DECAY, reviewCard, createSrsState, setFsrsParams } from './spacedRepetition';
import type { ReviewEntry } from './reviewLog';

// Reproduzierbarer Zufall
const rng = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const R = (t: number, s: number) => Math.pow(1 + FACTOR * t / s, DECAY);
const DAY = 86_400_000;

/** Simulierte Protokolle: erste Note g, zweite Wiederholung nach t Tagen, gewusst mit Wahrscheinlichkeit R(t, S). */
const simulate = (g: 1 | 2 | 3 | 4, trueS: number, n: number, seed: number): ReviewEntry[] => {
  const rand = rng(seed); const out: ReviewEntry[] = [];
  for (let i = 0; i < n; i++) {
    const t = 1 + Math.floor(rand() * 20);
    const base = i * 100 * DAY;
    out.push({ clientId: `${g}-${i}-a`, cardId: `${g}-${i}`, reviewedAt: base, rating: g, elapsedDays: null, intervalDays: 1 });
    out.push({ clientId: `${g}-${i}-b`, cardId: `${g}-${i}`, reviewedAt: base + t * DAY, rating: rand() < R(t, trueS) ? 3 : 1, elapsedDays: t, intervalDays: 1 });
  }
  return out;
};

describe('fsrsPersonal', () => {
  afterEach(() => setFsrsParams(null));

  it('findet eine bekannte Stabilität aus simulierten Daten wieder', () => {
    const pairs = firstReviewPairs(simulate(3, 8, 600, 7))[3];
    expect(pairs).toHaveLength(600);
    const s = fitStability(pairs);
    expect(s).toBeGreaterThan(6);
    expect(s).toBeLessThan(10.5);
  });

  it('bleibt bei zu wenig Daten beim Standard und meldet das', () => {
    const r = personalize(simulate(3, 30, 20, 3));
    expect(r.ok).toBe(false);
    expect(r.pairsUsed).toBeLessThan(MIN_PAIRS);
    expect(r.initialStability[0]).toBeCloseTo(FSRS_WEIGHTS[0], 1);
  });

  it('passt an, glättet Richtung Standard und hält die Reihenfolge der Noten', () => {
    const entries = [...simulate(3, 12, 300, 11), ...simulate(1, 3, 100, 5)];
    const r = personalize(entries);
    expect(r.ok).toBe(true);
    expect(r.initialStability[2]).toBeGreaterThan(FSRS_WEIGHTS[2]); // "Gut" behält man hier länger als im Standard
    for (let i = 1; i < 4; i++) expect(r.initialStability[i]).toBeGreaterThanOrEqual(r.initialStability[i - 1]);
  });

  it('Behaltensrate und Startwerte wirken auf die Planung', () => {
    const base = reviewCard(createSrsState(), 4, 0).interval;
    setFsrsParams({ retention: 0.8 });
    expect(reviewCard(createSrsState(), 4, 0).interval).toBeGreaterThan(base);
    setFsrsParams({ initialStability: [0.5, 1.5, 10, 20] });
    expect(reviewCard(createSrsState(), 4, 0).interval).toBe(10);
  });
});
