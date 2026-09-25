import { describe, it, expect, beforeEach, vi } from 'vitest';

const upsert = vi.fn(async (..._args: unknown[]) => ({ error: null }));
vi.mock('./supabaseClient', () => ({
  supabase: { from: () => ({ upsert, delete: () => ({ eq: () => ({ eq: async () => ({}) }) }) }) },
}));

import { makeEntry, logReview, loadReviews, undoLastReview, countByDay, trueRetention, ratingFor, flushReviews, setReviewLogUser } from './reviewLog';
import { createSrsState, reviewCard } from './spacedRepetition';

const DAY = 86_400_000;
const T0 = new Date(2026, 8, 20, 10).getTime();

describe('reviewLog', () => {
  beforeEach(() => { localStorage.clear(); upsert.mockClear(); setReviewLogUser(null); });

  it('baut Einträge mit vergangener Zeit und neuem Intervall', () => {
    const s1 = reviewCard(createSrsState(), 4, T0);
    const e1 = makeEntry('c1', 'd1', ratingFor('good'), createSrsState(), s1, T0);
    expect(e1).toMatchObject({ cardId: 'c1', rating: 3, elapsedDays: null, intervalDays: s1.interval });
    const e2 = makeEntry('c1', 'd1', 1, s1, reviewCard(s1, 0, T0 + 4 * DAY), T0 + 4 * DAY);
    expect(e2.elapsedDays).toBeCloseTo(4);
  });

  it('speichert lokal, nimmt die letzte Wiederholung einer Karte zurück', async () => {
    logReview(makeEntry('c1', 'd', 3, undefined, createSrsState(), T0));
    logReview(makeEntry('c1', 'd', 1, undefined, createSrsState(), T0 + 1000));
    expect((await loadReviews()).map(e => e.rating)).toEqual([3, 1]);
    await undoLastReview('c1');
    expect((await loadReviews()).map(e => e.rating)).toEqual([3]);
  });

  it('sendet die Warteschlange mit Geräte-IDs gegen Dubletten', async () => {
    setReviewLogUser('u1');
    logReview(makeEntry('c1', 'd', 3, undefined, createSrsState(), T0));
    expect(await flushReviews()).toBe(1);
    const rows = upsert.mock.calls[0][0] as unknown as Record<string, unknown>[];
    expect(rows[0]).toMatchObject({ user_id: 'u1', card_id: 'c1', rating: 3 });
    expect(rows[0].client_id).toBeTruthy();
    expect(await flushReviews()).toBe(0); // Warteschlange leer
  });

  it('zählt je Tag und berechnet die Behaltensrate', () => {
    const base = { cardId: 'c', intervalDays: 1 } as const;
    const list = [
      { ...base, clientId: 'a', reviewedAt: T0, rating: 3 as const, elapsedDays: 2 },
      { ...base, clientId: 'b', reviewedAt: T0 + 1000, rating: 1 as const, elapsedDays: 3 },
      { ...base, clientId: 'c', reviewedAt: T0 + DAY, rating: 3 as const, elapsedDays: null },
    ];
    const days = countByDay(list);
    expect([...days.values()]).toEqual([2, 1]);
    expect(trueRetention(list)).toBe(0.5);
    expect(trueRetention([])).toBeNull();
  });
});
