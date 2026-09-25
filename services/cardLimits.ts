import type { FlashcardDeck } from '../types';

/**
 * Tageslimits für Karteikarten wie in Anki (Standard: 20 neue Karten und
 * 200 Wiederholungen pro Tag, rslib/src/deckconfig). Gilt über alle Stapel.
 * Ohne Limit wächst der Wiederholungsberg, wenn man an einem Tag sehr viele
 * neue Karten beginnt.
 */
export interface CardLimits { newPerDay: number; reviewsPerDay: number }

export const DEFAULT_CARD_LIMITS: CardLimits = { newPerDay: 20, reviewsPerDay: 200 };
export const NEW_LIMIT_OPTIONS = [5, 10, 15, 20, 30, 50, 100, 9999];
export const REVIEW_LIMIT_OPTIONS = [50, 100, 200, 300, 500, 9999];
/** Wert für "kein Limit" in den Auswahllisten. */
export const UNLIMITED = 9999;
export const CARD_LIMITS_KEY = 'studearc_card_limits';

export const getCardLimits = (): CardLimits => {
  try {
    const raw = JSON.parse(localStorage.getItem(CARD_LIMITS_KEY) || 'null');
    if (raw && typeof raw.newPerDay === 'number' && typeof raw.reviewsPerDay === 'number') return raw;
  } catch { /* Standard */ }
  return DEFAULT_CARD_LIMITS;
};

export const setCardLimits = (limits: CardLimits, userId?: string | null): void => {
  try { localStorage.setItem(CARD_LIMITS_KEY, JSON.stringify(limits)); } catch { /* Speicher gesperrt */ }
  if (userId) {
    import('./syncService').then(({ syncPreferences }) => syncPreferences(userId, { card_limits: limits })).catch(() => {});
  }
};

export const startOfDay = (now: number): number => {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/**
 * Heute schon verbraucht: neue Karten = erste Bewertung heute; Wiederholungen =
 * heute bewertete Karten, die schon vor heute gelernt wurden. Gezählt werden
 * Karten, nicht Tastendrücke (eine Karte zweimal wiederholen zählt einmal).
 */
export const todayUsage = (decks: Pick<FlashcardDeck, 'cards'>[], now: number = Date.now()) => {
  const start = startOfDay(now);
  let newToday = 0;
  let reviewsToday = 0;
  for (const d of decks) {
    for (const c of d.cards) {
      const s = c.srs;
      if (!s?.lastReview || s.lastReview < start) continue;
      if ((s.firstReview ?? 0) >= start) newToday++;
      else reviewsToday++;
    }
  }
  return { newToday, reviewsToday };
};

export const remainingToday = (decks: Pick<FlashcardDeck, 'cards'>[], limits: CardLimits = getCardLimits(), now: number = Date.now()) => {
  const used = todayUsage(decks, now);
  return {
    ...used,
    newLeft: Math.max(0, limits.newPerDay - used.newToday),
    reviewLeft: Math.max(0, limits.reviewsPerDay - used.reviewsToday),
  };
};
