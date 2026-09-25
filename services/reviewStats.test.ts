import { describe, it, expect } from 'vitest';
import { heatmapWeeks, heatLevel, reviewStreak, dueForecast, dayKey } from './reviewStats';
import { createSrsState } from './spacedRepetition';

const now = new Date(2026, 8, 25, 14).getTime(); // Freitag
const day = (offset: number) => { const d = new Date(now); d.setDate(d.getDate() + offset); return d.getTime(); };

describe('reviewStats', () => {
  it('Heatmap: Wochen mit Montag oben, Zukunft markiert, heute drin', () => {
    const counts = new Map([[dayKey(now), 12], [dayKey(day(-1)), 3]]);
    const weeks = heatmapWeeks(counts, 4, now);
    expect(weeks).toHaveLength(4);
    const last = weeks[3];
    expect(new Date(`${last[0].key}T12:00`).getDay()).toBe(1); // Montag
    expect(last[4]).toEqual({ key: dayKey(now), count: 12 });
    expect(last[3].count).toBe(3);
    expect(last[5].count).toBe(-1); // Samstag liegt in der Zukunft
  });

  it('Stufen und Serie', () => {
    expect([0, 5, 15, 45, 80].map(heatLevel)).toEqual([0, 1, 2, 3, 4]);
    const counts = new Map([[dayKey(day(-1)), 1], [dayKey(day(-2)), 4], [dayKey(day(-4)), 2]]);
    expect(reviewStreak(counts, now)).toBe(2); // heute noch nichts, gestern + vorgestern
    counts.set(dayKey(now), 1);
    expect(reviewStreak(counts, now)).toBe(3);
  });

  it('Prognose: Überfälliges heute, Ausgesetztes nie, Zurückgestelltes morgen', () => {
    const card = (next: number, extra = {}) => ({ id: 'x', front: '', back: '', level: 0, nextReview: next, srs: { ...createSrsState(), nextReview: next }, ...extra });
    const decks = [{ cards: [
      card(day(-3)), card(day(2)), card(day(2)), card(day(20)),
      card(day(-1), { suspended: true }),
      card(day(-1), { buriedUntil: new Date(day(1)).setHours(0, 0, 0, 0) }),
    ] }];
    expect(dueForecast(decks as any, 5, now)).toEqual([1, 1, 2, 0, 0]);
  });
});
