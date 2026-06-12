/**
 * spacedRepetition.ts — SM-2 Algorithmus (SuperMemo 2) für Karteikarten.
 *
 * FERTIG IMPLEMENTIERT — nur noch in FlashcardPlayer/flashcardService einbauen.
 *
 * Verwendung:
 *   import { reviewCard, getDueCards, createSrsState } from './spacedRepetition';
 *
 *   // Beim Anlegen einer Karte:
 *   card.srs = createSrsState();
 *
 *   // Nach jeder Bewertung (0=keine Ahnung ... 5=perfekt):
 *   card.srs = reviewCard(card.srs, quality);
 *
 *   // Für "X Karten heute fällig":
 *   const due = getDueCards(allCards);
 */

export interface SrsState {
  /** Easiness-Faktor, startet bei 2.5, min 1.3 */
  ease: number;
  /** Aktuelles Intervall in Tagen */
  interval: number;
  /** Anzahl erfolgreicher Wiederholungen in Folge */
  repetitions: number;
  /** Timestamp (ms) wann die Karte wieder fällig ist */
  nextReview: number;
  /** Timestamp der letzten Wiederholung */
  lastReview: number | null;
}

/** Bewertungsskala für die UI */
export enum ReviewQuality {
  BLACKOUT = 0,   // "Keine Ahnung"
  WRONG = 1,      // "Falsch"
  HARD = 3,       // "Schwer, aber gewusst"
  GOOD = 4,       // "Gewusst"
  EASY = 5,       // "Easy"
}

const DAY_MS = 24 * 60 * 60 * 1000;

export const createSrsState = (): SrsState => ({
  ease: 2.5,
  interval: 0,
  repetitions: 0,
  nextReview: Date.now(), // sofort fällig
  lastReview: null,
});

/**
 * SM-2 Kernlogik. quality: 0–5.
 * < 3 → Karte gilt als vergessen, Intervall resettet.
 * >= 3 → Intervall wächst: 1 Tag → 6 Tage → interval * ease.
 */
export const reviewCard = (state: SrsState, quality: number): SrsState => {
  const q = Math.max(0, Math.min(5, Math.round(quality)));
  const now = Date.now();

  let { ease, interval, repetitions } = state;

  if (q < 3) {
    repetitions = 0;
    interval = 1;
  } else {
    repetitions += 1;
    if (repetitions === 1) interval = 1;
    else if (repetitions === 2) interval = 6;
    else interval = Math.round(interval * ease);
  }

  // Ease-Anpassung (SM-2 Formel)
  ease = ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  if (ease < 1.3) ease = 1.3;

  return {
    ease,
    interval,
    repetitions,
    nextReview: now + interval * DAY_MS,
    lastReview: now,
  };
};

/** Karten die jetzt fällig sind, sortiert: überfälligste zuerst */
export const getDueCards = <T extends { srs?: SrsState }>(cards: T[]): T[] => {
  const now = Date.now();
  return cards
    .filter(c => !c.srs || c.srs.nextReview <= now)
    .sort((a, b) => (a.srs?.nextReview ?? 0) - (b.srs?.nextReview ?? 0));
};

/** Anzahl fälliger Karten — für Dashboard-Badge */
export const countDueCards = <T extends { srs?: SrsState }>(cards: T[]): number =>
  getDueCards(cards).length;

/** Migration: bestehende Karten mit level/nextReview auf SRS umstellen */
export const migrateLegacyCard = (legacy: { level?: number; nextReview?: number }): SrsState => ({
  ease: 2.5,
  interval: Math.max(1, legacy.level ?? 0),
  repetitions: legacy.level ?? 0,
  nextReview: legacy.nextReview ?? Date.now(),
  lastReview: null,
});
