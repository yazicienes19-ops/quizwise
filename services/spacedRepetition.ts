/**
 * spacedRepetition.ts — Wiederholungsplanung für Karteikarten und Fehlerfragen.
 *
 * Seit 24.09.2026 FSRS-5 (Free Spaced Repetition Scheduler, Standardgewichte,
 * Ziel-Behaltensquote 90 %) statt SM-2: Intervalle folgen einem Gedächtnis-
 * modell aus Stabilität und Schwierigkeit und berücksichtigen, wie lange die
 * letzte Wiederholung tatsächlich her ist. Die SM-2-Felder (ease, interval,
 * repetitions) bleiben gefüllt, damit Statistik, Runden-Auswahl und Cloud-Sync
 * unverändert funktionieren. Bestehende Karten ohne FSRS-Werte werden bei
 * ihrer nächsten Bewertung aus ihrem SM-2-Stand übernommen.
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
  /** FSRS: Tage, nach denen die Abrufwahrscheinlichkeit auf 90 % fällt. */
  stability?: number;
  /** FSRS: Schwierigkeit 1 (leicht) bis 10 (schwer). */
  difficulty?: number;
  /** Wie oft eine bereits gelernte Karte vergessen wurde (Anki: "lapses"). */
  lapses?: number;
  /** Zeitpunkt der allerersten Bewertung (für das Tageslimit neuer Karten). */
  firstReview?: number;
}

/** Anki-Standard: ab so vielen Lapses gilt eine Karte als Problemkarte. */
export const LEECH_THRESHOLD = 8;

/** Felder, mit denen eine Karte aus der Wiederholung genommen wird. */
export interface DueFlags { srs?: SrsState; suspended?: boolean; buriedUntil?: number }

/** Fällig = Zeitpunkt erreicht und weder ausgesetzt noch für heute zurückgestellt. */
export const isCardDue = (c: DueFlags, now: number = Date.now()): boolean =>
  !c.suspended && !(c.buriedUntil && c.buriedUntil > now) && (!c.srs || c.srs.nextReview <= now);

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

// ── FSRS-5 ──────────────────────────────────────────────────────────────────
/** Standardgewichte FSRS-5 (open-spaced-repetition, auf großen Anki-Datensätzen trainiert). */
export const FSRS_WEIGHTS = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192,
  1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621,
] as const;
const W = FSRS_WEIGHTS;
const DECAY = -0.5;
const FACTOR = 19 / 81; // so gewählt, dass R(S, S) = 90 %
export const REQUEST_RETENTION = 0.9;
const MAX_INTERVAL_DAYS = 36500;

type Grade = 1 | 2 | 3 | 4; // Nochmal, Schwer, Gut, Leicht

/** App-Skala 0–5 auf FSRS-Noten: < 3 vergessen, 3 schwer, 4 gut, 5 leicht. */
const toGrade = (q: number): Grade => (q < 3 ? 1 : q === 3 ? 2 : q === 4 ? 3 : 4);

const clampD = (d: number) => Math.min(10, Math.max(1, d));

/** Abrufwahrscheinlichkeit nach t Tagen bei Stabilität s. */
export const retrievability = (elapsedDays: number, stability: number): number =>
  Math.pow(1 + FACTOR * Math.max(0, elapsedDays) / Math.max(0.01, stability), DECAY);

const initStability = (g: Grade) => Math.max(0.1, W[g - 1]);
const initDifficulty = (g: Grade) => clampD(W[4] - Math.exp(W[5] * (g - 1)) + 1);

const nextDifficulty = (d: number, g: Grade): number => {
  const delta = -W[6] * (g - 3);
  const damped = d + delta * (10 - d) / 9;
  return clampD(W[7] * initDifficulty(4) + (1 - W[7]) * damped);
};

const recallStability = (d: number, s: number, r: number, g: Grade): number => {
  const hard = g === 2 ? W[15] : 1;
  const easy = g === 4 ? W[16] : 1;
  return s * (Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) * (Math.exp(W[10] * (1 - r)) - 1) * hard * easy + 1);
};

const forgetStability = (d: number, s: number, r: number): number =>
  Math.min(s, W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp(W[14] * (1 - r)));

/** Intervall in ganzen Tagen für die Ziel-Behaltensquote (bei 90 % = Stabilität). */
export const intervalForStability = (s: number): number =>
  Math.min(MAX_INTERVAL_DAYS, Math.max(1, Math.round(s / FACTOR * (Math.pow(REQUEST_RETENTION, 1 / DECAY) - 1))));

/** SM-2-Stand ohne FSRS-Werte übernehmen: Intervall ≈ Stabilität, Ease → Schwierigkeit. */
const fromSm2 = (state: SrsState): { s: number; d: number } => ({
  s: Math.max(0.5, state.interval || 1),
  d: clampD(5 + (2.5 - (state.ease || 2.5)) * 4.17),
});

/**
 * Bewertet eine Karte. quality: 0–5 (siehe ReviewQuality).
 * < 3 → vergessen: Wiederholungen zurück auf 0, kurze neue Stabilität.
 * >= 3 → gewusst: Stabilität wächst umso stärker, je länger die Karte
 * ungeübt lag und je leichter sie ist. Leicht bei neuen Karten ≈ 16 Tage
 * (erfüllt das Paket-1-Kriterium "Easy-Karte ≥ 6 Tage weg").
 */
export const reviewCard = (state: SrsState, quality: number, now: number = Date.now()): SrsState => {
  const q = Math.max(0, Math.min(5, Math.round(quality)));
  const g = toGrade(q);
  const isNewCard = !state.lastReview;

  let stability: number;
  let difficulty: number;
  if (isNewCard) {
    stability = initStability(g);
    difficulty = initDifficulty(g);
  } else {
    const prev = state.stability && state.difficulty
      ? { s: state.stability, d: state.difficulty }
      : fromSm2(state);
    const elapsed = (now - (state.lastReview ?? now)) / DAY_MS;
    const r = retrievability(elapsed, prev.s);
    stability = g === 1 ? forgetStability(prev.d, prev.s, r) : recallStability(prev.d, prev.s, r, g);
    difficulty = nextDifficulty(prev.d, g);
  }

  const interval = intervalForStability(stability);
  const repetitions = g === 1 ? 0 : state.repetitions + 1;
  // Lapse: eine schon gelernte Karte wird vergessen (neue Karten zählen nicht).
  const lapses = (state.lapses ?? 0) + (g === 1 && !isNewCard ? 1 : 0);
  // Ease weiter nach SM-2 fortschreiben: dient nur noch als Anzeige-/Statistikwert.
  const ease = Math.max(1.3, state.ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));

  return {
    ease,
    interval,
    repetitions,
    nextReview: now + interval * DAY_MS,
    lastReview: now,
    stability: Math.round(stability * 1000) / 1000,
    difficulty: Math.round(difficulty * 1000) / 1000,
    ...(lapses ? { lapses } : {}),
    firstReview: state.firstReview ?? (isNewCard ? now : state.lastReview ?? now),
  };
};

/** Karten die jetzt fällig sind, sortiert: überfälligste zuerst */
export const getDueCards = <T extends DueFlags>(cards: T[]): T[] => {
  const now = Date.now();
  return cards
    .filter(c => isCardDue(c, now))
    .sort((a, b) => (a.srs?.nextReview ?? 0) - (b.srs?.nextReview ?? 0));
};

/** Anzahl fälliger Karten — für Dashboard-Badge */
export const countDueCards = <T extends DueFlags>(cards: T[]): number =>
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
  /** Davon durch die Tageslimits zurückgehalten (heute nicht mehr dran). */
  heldBack: number;
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
export function buildSessionBatch<T extends DueFlags>(
  cards: T[],
  batchSize: number = SESSION_BATCH_SIZE,
  /** Rest der Tageslimits (services/cardLimits.ts); ohne Angabe unbegrenzt. */
  limits?: { newLeft: number; reviewLeft: number },
): SessionBatch<T> {
  const now = Date.now();
  const due = getDueCards(cards);

  const dayMs = 24 * 60 * 60 * 1000;
  const isNew = (c: T) => !c.srs?.lastReview;
  const isLearning = (c: T) => {
    const srs = c.srs;
    // FSRS-Karten: hohe Schwierigkeit; ältere SM-2-Karten: niedriger Ease.
    const hard = srs?.difficulty !== undefined ? srs.difficulty >= 6.5 : (srs?.ease ?? 2.5) < 2.3;
    return !!srs?.lastReview && (srs.interval < 1 || hard);
  };
  const overdueDays = (c: T) => Math.max(0, (now - (c.srs?.nextReview ?? now)) / dayMs);

  const learning = due.filter(isLearning);
  // Neu-Karten-Limit greift NUR, wenn mehr fällig ist als in eine Runde passt —
  // ein kleines Deck spielt alles, nur in sinnvoller Reihenfolge.
  const freshLimit = due.length > batchSize ? NEW_CARDS_PER_SESSION : due.length;
  const newCandidates = due.filter(isNew);
  const fresh = newCandidates.slice(0, Math.min(freshLimit, limits?.newLeft ?? Infinity));
  const inBatch = new Set([...learning, ...fresh]);
  // Neue Karten, die das Limit nicht schafften, zählen NICHT alsReviews-Füller
  // — sonst würde das Neu-Limit wirkungslos (Fund aus dem Unit-Test).
  const reviewCandidates = due
    .filter(c => !inBatch.has(c) && !isNew(c))
    .sort((a, b) => overdueDays(b) - overdueDays(a));
  // Lernkarten (gerade vergessen oder sehr schwer) laufen außerhalb des Limits, wie in Anki.
  const reviews = reviewCandidates.slice(0, limits?.reviewLeft ?? Infinity);

  const batch = [...learning, ...fresh, ...reviews].slice(0, batchSize);
  const heldBack = limits
    ? Math.max(0, newCandidates.length - Math.min(newCandidates.length, limits.newLeft))
      + Math.max(0, reviewCandidates.length - Math.min(reviewCandidates.length, limits.reviewLeft))
    : 0;
  return { cards: batch, remainingAfter: due.length - batch.length, heldBack };
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
