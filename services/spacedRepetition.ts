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
 * >= 3 → Intervall wächst: 1 Tag → 6 Tage → interval * ease
 * (Easy schon bei der ersten Bewertung direkt 6 Tage).
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
    // Paket-1-Kriterium ("Easy-Karte ≥ 6 Tage weg"): schon die ERSTE Easy-
    // Bewertung (5) springt direkt aufs 6-Tage-Intervall — SM-2-Standard
    // würde sie 1 Tag später wieder fällig machen.
    if (repetitions === 1 && q === 5) interval = 6;
    else if (repetitions === 1) interval = 1;
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

// ── Lernrunden für große Decks (wie beim Recall: "Erklären üben") ────────────
// Decks mit sehr vielen fälligen Karten sollen keine endlose Liste spielen,
// sondern kuratierte Runden — dieselbe Philosophie wie recallGaps.ts:
// Schwäche vor Stärke, Abdeckung vor Vertiefung, Gemeistertes ruht (macht
// SM-2 über nextReview ohnehin schon).

/** Max. Karten pro Lernrunde. */
export const SESSION_BATCH_SIZE = 30;
/** Max. NEUE Karten pro Runde (Anki-Prinzip: Neu-Lernen begrenzen, sonst
 *  ertrinken frische Karten in den Wiederholungen). */
export const NEW_CARDS_PER_SESSION = 15;

export interface SessionBatch<T> {
  /** Die Karten dieser Runde, in Spiel-Reihenfolge (Lernen → Neu → Wiederholen). */
  cards: T[];
  /** Wie viele fällige Karten nach dieser Runde noch warten. */
  remainingAfter: number;
}

/**
 * Baut die nächste Lernrunde: bei <= batchSize fälligen Karten alles (wie
 * bisher), darüber hinaus eine priorisierte Auswahl —
 * 1. Lern-Karten (kurzes Intervall oder niedriger Ease-Faktor): "schwierig/
 *    gerade gescheitert" — Analog zu recallGaps' "häufige Fehler zuerst"
 * 2. neue Karten, auf NEW_CARDS_PER_SESSION begrenzt — "Abdeckung vor
 *    Vertiefung", wie das Kapitel-Coverage beim Recall
 * 3. weiterführende Wiederholungen, überfälligste zuerst
 */
export function buildSessionBatch<T extends { srs?: SrsState }>(cards: T[], batchSize: number = SESSION_BATCH_SIZE): SessionBatch<T> {
  const now = Date.now();
  const due = getDueCards(cards);

  const dayMs = 24 * 60 * 60 * 1000;
  const isNew = (c: T) => !c.srs?.lastReview;
  const isLearning = (c: T) => {
    const srs = c.srs;
    return !!srs?.lastReview && (srs.interval < 1 || srs.ease < 2.3);
  };
  const overdueDays = (c: T) => Math.max(0, (now - (c.srs?.nextReview ?? now)) / dayMs);

  const learning = due.filter(isLearning);
  // Neu-Karten-Limit greift NUR, wenn mehr fällig ist als in eine Runde passt —
  // ein kleines Deck spielt alles, nur in sinnvoller Reihenfolge.
  const freshLimit = due.length > batchSize ? NEW_CARDS_PER_SESSION : due.length;
  const fresh = due.filter(isNew).slice(0, freshLimit);
  const inBatch = new Set([...learning, ...fresh]);
  // Neue Karten, die das Limit nicht schafften, zählen NICHT alsReviews-Füller
  // — sonst würde das Neu-Limit wirkungslos (Fund aus dem Unit-Test).
  const reviews = due
    .filter(c => !inBatch.has(c) && !isNew(c))
    .sort((a, b) => overdueDays(b) - overdueDays(a));

  const batch = [...learning, ...fresh, ...reviews].slice(0, batchSize);
  return { cards: batch, remainingAfter: due.length - batch.length };
}

/** Migration: bestehende Karten mit level/nextReview auf SRS umstellen */
export const migrateLegacyCard = (legacy: { level?: number; nextReview?: number }): SrsState => ({
  ease: 2.5,
  interval: Math.max(1, legacy.level ?? 0),
  repetitions: legacy.level ?? 0,
  nextReview: legacy.nextReview ?? Date.now(),
  lastReview: null,
});

export const QUALITY_MAP: Record<'again' | 'hard' | 'good' | 'easy', ReviewQuality> = {
  again: ReviewQuality.BLACKOUT,
  hard:  ReviewQuality.HARD,
  good:  ReviewQuality.GOOD,
  easy:  ReviewQuality.EASY,
};
