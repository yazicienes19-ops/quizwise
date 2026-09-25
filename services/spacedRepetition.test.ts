import { describe, it, expect } from 'vitest';
import { createSrsState, reviewCard, getDueCards, countDueCards, migrateLegacyCard, buildSessionBatch, SESSION_BATCH_SIZE, NEW_CARDS_PER_SESSION, isCardDue, LEECH_THRESHOLD, type SrsState } from './spacedRepetition';

describe('createSrsState', () => {
  it('startet mit Ease 2.5 und sofort fällig', () => {
    const s = createSrsState();
    expect(s.ease).toBe(2.5);
    expect(s.interval).toBe(0);
    expect(s.repetitions).toBe(0);
    expect(s.nextReview).toBeLessThanOrEqual(Date.now());
  });
});

describe('reviewCard (FSRS-5)', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const T0 = Date.UTC(2026, 8, 1);

  it('neue Karte: Nochmal/Schwer/Gut/Leicht → 1/1/3/16 Tage', () => {
    const s = createSrsState();
    expect([1, 3, 4, 5].map(q => reviewCard(s, q, T0).interval)).toEqual([1, 1, 3, 16]);
  });

  it('erste Easy-Bewertung → mindestens 6 Tage (Paket-1-Kriterium)', () => {
    const r = reviewCard(createSrsState(), 5, T0);
    expect(r.repetitions).toBe(1);
    expect(r.nextReview).toBeGreaterThanOrEqual(T0 + 6 * DAY);
  });

  it('vergessen setzt Wiederholungen zurück und verkürzt das Intervall', () => {
    let s = reviewCard(createSrsState(), 4, T0);
    s = reviewCard(s, 4, T0 + 3 * DAY);
    const before = s.interval;
    const failed = reviewCard(s, 0, T0 + (3 + before) * DAY);
    expect(failed.repetitions).toBe(0);
    expect(failed.interval).toBeLessThan(before);
    expect(failed.stability!).toBeLessThan(s.stability!);
    expect(failed.difficulty!).toBeGreaterThan(s.difficulty!);
  });

  it('Intervalle wachsen bei pünktlichem Gewusst deutlich', () => {
    let s = createSrsState();
    let t = T0;
    const intervals: number[] = [];
    for (let i = 0; i < 5; i++) {
      s = reviewCard(s, 4, t);
      intervals.push(s.interval);
      t += s.interval * DAY;
    }
    for (let i = 1; i < intervals.length; i++) expect(intervals[i]).toBeGreaterThan(intervals[i - 1]);
    expect(intervals[4]).toBeGreaterThan(60);
  });

  it('Wiederholung am selben Tag lässt die Stabilität praktisch unverändert', () => {
    const s = reviewCard(createSrsState(), 4, T0);
    const again = reviewCard(s, 4, T0 + 60_000);
    expect(again.stability!).toBeCloseTo(s.stability!, 1);
  });

  it('länger ungeübt und trotzdem gewusst → größerer Sprung', () => {
    const s = reviewCard(createSrsState(), 4, T0);
    const onTime = reviewCard(s, 4, T0 + 3 * DAY);
    const late = reviewCard(s, 4, T0 + 20 * DAY);
    expect(late.stability!).toBeGreaterThan(onTime.stability!);
  });

  it('übernimmt SM-2-Karten ohne FSRS-Werte', () => {
    const legacy: SrsState = { ease: 2.5, interval: 20, repetitions: 4, nextReview: T0, lastReview: T0 - 20 * DAY };
    const r = reviewCard(legacy, 4, T0);
    expect(r.interval).toBeGreaterThan(20);
    expect(r.repetitions).toBe(5);
    expect(r.difficulty).toBeGreaterThan(1);
  });

  it('Ease wird weiter fortgeschrieben (Anzeige), min 1.3', () => {
    let s = createSrsState();
    expect(reviewCard(s, 5, T0).ease).toBeGreaterThan(2.5);
    for (let i = 0; i < 20; i++) s = reviewCard(s, 3, T0 + i * DAY);
    expect(s.ease).toBeGreaterThanOrEqual(1.3);
  });

  it('nextReview liegt in der Zukunft', () => {
    const r = reviewCard(createSrsState(), 4);
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

describe('Aussetzen, Zurückstellen, Problemkarten', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const T0 = Date.UTC(2026, 8, 1);
  const past = { ...createSrsState(), nextReview: T0 - 1000 };

  it('isCardDue schließt ausgesetzte und zurückgestellte Karten aus', () => {
    expect(isCardDue({ srs: past }, T0)).toBe(true);
    expect(isCardDue({ srs: past, suspended: true }, T0)).toBe(false);
    expect(isCardDue({ srs: past, buriedUntil: T0 + DAY }, T0)).toBe(false);
    expect(isCardDue({ srs: past, buriedUntil: T0 - 1 }, T0)).toBe(true);
    expect(countDueCards([{ srs: past }, { srs: past, suspended: true }])).toBe(1);
  });

  it('zählt Lapses nur bei schon gelernten Karten', () => {
    let s = reviewCard(createSrsState(), 0, T0);
    expect(s.lapses ?? 0).toBe(0); // neue Karte vergessen = kein Lapse
    s = reviewCard(s, 4, T0 + DAY);
    s = reviewCard(s, 0, T0 + 5 * DAY);
    expect(s.lapses).toBe(1);
    for (let i = 0; i < 7; i++) s = reviewCard(reviewCard(s, 4, T0 + (10 + i * 2) * DAY), 0, T0 + (11 + i * 2) * DAY);
    expect(s.lapses).toBe(LEECH_THRESHOLD);
  });

  it('merkt sich die erste Bewertung', () => {
    const s = reviewCard(createSrsState(), 4, T0);
    expect(s.firstReview).toBe(T0);
    expect(reviewCard(s, 4, T0 + 3 * DAY).firstReview).toBe(T0);
  });
});
