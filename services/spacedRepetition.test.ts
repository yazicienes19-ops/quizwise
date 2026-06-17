import { describe, it, expect } from 'vitest';
import { createSrsState, reviewCard, getDueCards, countDueCards, migrateLegacyCard } from './spacedRepetition';

describe('createSrsState', () => {
  it('startet mit Ease 2.5 und sofort fällig', () => {
    const s = createSrsState();
    expect(s.ease).toBe(2.5);
    expect(s.interval).toBe(0);
    expect(s.repetitions).toBe(0);
    expect(s.nextReview).toBeLessThanOrEqual(Date.now());
  });
});

describe('reviewCard (SM-2)', () => {
  it('quality < 3 resettet Repetitions', () => {
    const s = createSrsState();
    const r = reviewCard(s, 1);
    expect(r.repetitions).toBe(0);
    expect(r.interval).toBe(1);
  });

  it('quality >= 3 erhöht Repetitions', () => {
    const s = createSrsState();
    const r = reviewCard(s, 4);
    expect(r.repetitions).toBe(1);
    expect(r.interval).toBe(1);
  });

  it('zweite korrekte Bewertung → 6 Tage Intervall', () => {
    let s = createSrsState();
    s = reviewCard(s, 4);
    s = reviewCard(s, 4);
    expect(s.repetitions).toBe(2);
    expect(s.interval).toBe(6);
  });

  it('dritte korrekte Bewertung → Intervall * Ease', () => {
    let s = createSrsState();
    s = reviewCard(s, 4);
    s = reviewCard(s, 4);
    s = reviewCard(s, 4);
    expect(s.repetitions).toBe(3);
    expect(s.interval).toBe(Math.round(6 * s.ease));
  });

  it('Easy (5) erhöht Ease', () => {
    const s = createSrsState();
    const r = reviewCard(s, 5);
    expect(r.ease).toBeGreaterThan(2.5);
  });

  it('Hard (3) senkt Ease, min 1.3', () => {
    let s = createSrsState();
    for (let i = 0; i < 20; i++) s = reviewCard(s, 3);
    expect(s.ease).toBeGreaterThanOrEqual(1.3);
  });

  it('nextReview liegt in der Zukunft', () => {
    const s = createSrsState();
    const r = reviewCard(s, 4);
    expect(r.nextReview).toBeGreaterThan(Date.now());
    expect(r.lastReview).toBeLessThanOrEqual(Date.now());
  });
});

describe('getDueCards / countDueCards', () => {
  it('neue Karten ohne SRS sind immer fällig', () => {
    const cards: { srs?: ReturnType<typeof createSrsState> }[] = [{}, {}];
    expect(getDueCards(cards)).toHaveLength(2);
    expect(countDueCards(cards)).toBe(2);
  });

  it('Karte mit Zukunfts-nextReview ist nicht fällig', () => {
    const future: any = { id: '1', srs: { ...createSrsState(), nextReview: Date.now() + 999999999 } };
    expect(getDueCards([future])).toHaveLength(0);
  });

  it('Karte mit vergangener nextReview ist fällig', () => {
    const past: any = { id: '1', srs: { ...createSrsState(), nextReview: Date.now() - 1000 } };
    expect(getDueCards([past])).toHaveLength(1);
  });
});

describe('migrateLegacyCard', () => {
  it('migriert alte Karten auf SrsState', () => {
    const s = migrateLegacyCard({ level: 3, nextReview: 12345 });
    expect(s.ease).toBe(2.5);
    expect(s.repetitions).toBe(3);
    expect(s.nextReview).toBe(12345);
  });

  it('funktioniert ohne Legacy-Felder', () => {
    const s = migrateLegacyCard({});
    expect(s.repetitions).toBe(0);
    expect(s.nextReview).toBeLessThanOrEqual(Date.now());
  });
});
