import { describe, it, expect } from 'vitest';
import { createSrsState, reviewCard, getDueCards, countDueCards, migrateLegacyCard, buildSessionBatch, SESSION_BATCH_SIZE, NEW_CARDS_PER_SESSION, type SrsState } from './spacedRepetition';

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


// ── Lernrunden für große Decks (buildSessionBatch) ─────────────────────────
describe('buildSessionBatch', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const card = (id: string, srs?: Partial<SrsState>): { id: string; srs?: SrsState } => ({
    id,
    srs: srs ? { ...createSrsState(), ...srs } : undefined,
  });
  const learning = (id: string) =>
    card(id, { lastReview: Date.now() - DAY, interval: 0.5, nextReview: Date.now() - 1000 });
  const hardEase = (id: string) =>
    card(id, { lastReview: Date.now() - DAY, interval: 5, ease: 1.5, nextReview: Date.now() - 2000 });
  const fresh = (id: string) => card(id);
  const review = (id: string, overdueDays: number) =>
    card(id, { lastReview: Date.now() - 30 * DAY, interval: 20, repetitions: 3, nextReview: Date.now() - overdueDays * DAY });

  it('liefert alles, wenn weniger fällig als die Rundengröße', () => {
    const batch = buildSessionBatch([fresh('a'), review('b', 2), learning('c')]);
    expect(batch.cards).toHaveLength(3);
    expect(batch.remainingAfter).toBe(0);
  });

  it('liefert genau die Rundengröße, wenn mehr fällig ist', () => {
    const cards = Array.from({ length: SESSION_BATCH_SIZE + 12 }, (_, i) => review(`r${i}`, 1 + i));
    const batch = buildSessionBatch(cards);
    expect(batch.cards).toHaveLength(SESSION_BATCH_SIZE);
    expect(batch.remainingAfter).toBe(12);
  });

  it('priorisiert Lern-Karten (kurzes Intervall / niedriger Ease) an den Anfang', () => {
    const cards = [
      ...Array.from({ length: 25 }, (_, i) => review(`r${i}`, 5)),
      learning('L1'),
      hardEase('L2'),
    ];
    const batch = buildSessionBatch(cards);
    // Innerhalb der Klasse gilt Fälligkeits-Reihenfolge (L2 ist stärker überfällig)
    expect(batch.cards.slice(0, 2).map(c => c.id).sort()).toEqual(['L1', 'L2']);
  });

  it('begrenzt neue Karten pro Runde (Abdeckung ohne Neu-Karten-Flut)', () => {
    const cards = [
      ...Array.from({ length: 40 }, (_, i) => fresh(`n${i}`)),
      review('r1', 3),
    ];
    const batch = buildSessionBatch(cards);
    const freshCount = batch.cards.filter(c => !c.srs?.lastReview).length;
    expect(freshCount).toBe(NEW_CARDS_PER_SESSION);
    expect(batch.cards[batch.cards.length - 1].id).toBe('r1'); // Reviews füllen auf
  });

  it('füllt mit den überfälligsten Wiederholungen auf', () => {
    const cards = [
      ...Array.from({ length: 20 }, (_, i) => fresh(`n${i}`)),
      review('old1', 30),
      review('old2', 2),
      review('old3', 10),
    ];
    const batch = buildSessionBatch(cards);
    const reviewIds = batch.cards.filter(c => c.srs?.lastReview && c.srs!.interval >= 1).map(c => c.id);
    expect(reviewIds).toEqual(['old1', 'old3', 'old2']); // 30d > 10d > 2d überfällig
  });
});
