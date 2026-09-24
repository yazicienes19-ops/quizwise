/**
 * Lernrichtung für Karteikarten (Audit 23.09.2026: Karten ließen sich nur
 * von vorne nach hinten lernen). Gilt als persönliche Einstellung für alle
 * Stapel. Die Wiederholungsplanung bleibt pro Karte gemeinsam, die Richtung
 * ändert nur, welche Seite zuerst erscheint.
 */
export type CardDirection = 'normal' | 'reverse' | 'mixed';
export const CARD_DIRECTIONS: CardDirection[] = ['normal', 'reverse', 'mixed'];
const KEY = 'studearc_card_direction';

export const getCardDirection = (): CardDirection => {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'reverse' || v === 'mixed' ? v : 'normal';
  } catch {
    return 'normal';
  }
};

export const setCardDirection = (d: CardDirection): void => {
  try { localStorage.setItem(KEY, d); } catch { /* Speicher gesperrt */ }
};

/** Gemischt: fest je Karte (gleiche Karte, gleiche Richtung), etwa halb/halb. */
export const isReversed = (cardId: string, direction: CardDirection): boolean => {
  if (direction === 'normal') return false;
  if (direction === 'reverse') return true;
  let h = 0;
  for (let i = 0; i < cardId.length; i++) h = (h * 31 + cardId.charCodeAt(i)) | 0;
  return (h & 1) === 1;
};
