import type { Flashcard, FlashcardDeck } from '../types';

/**
 * Doppelte Karteikarten-Stapel erkennen und zusammenführen (Audit 23.09.2026:
 * z. B. zwei Stapel "Halo Effekt" mit denselben Karten nebeneinander).
 *
 * Anders als deckMerge.ts (Sync desselben Stapels über Geräte, Abgleich per
 * Karten-ID) werden hier verschiedene Stapel über ihren Inhalt abgeglichen:
 * gleiche Vorder- und Rückseite = dieselbe Karte.
 */

const norm = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ');
// Verdeckte Bilder: gleicher Text, aber andere Stelle; Bild und Stelle gehören zum Schlüssel.
const cardKey = (c: Flashcard): string =>
  `${norm(c.front)}\u0000${norm(c.back)}${c.occlusion ? `\u0000${c.occlusion.image}#${c.occlusion.index}` : ''}`;
const progress = (c: Flashcard): number => c.srs?.repetitions ?? 0;

/** Gruppen gleich benannter Stapel (mind. 2), Reihenfolge wie in der Liste. */
export const findDuplicateDeckGroups = (decks: FlashcardDeck[]): FlashcardDeck[][] => {
  const byTitle = new Map<string, FlashcardDeck[]>();
  for (const d of decks) {
    const key = norm(d.title);
    if (!key) continue;
    byTitle.set(key, [...(byTitle.get(key) ?? []), d]);
  }
  return [...byTitle.values()].filter(g => g.length > 1);
};

/**
 * Führt eine Gruppe zu einem Stapel zusammen. Basis ist der Stapel mit dem
 * meisten Lernfortschritt (seine ID, sein Titel, seine Quelle bleiben).
 * Doppelte Karten fallen weg; von zwei gleichen Karten bleibt die mit mehr
 * Wiederholungen, bei Gleichstand die zuletzt gelernte.
 */
export const mergeDuplicateDecks = (group: FlashcardDeck[]): FlashcardDeck => {
  const deckProgress = (d: FlashcardDeck) => d.cards.reduce((s, c) => s + progress(c), 0);
  const base = [...group].sort((a, b) => deckProgress(b) - deckProgress(a))[0];
  const ordered = [base, ...group.filter(d => d !== base)];
  const byKey = new Map<string, Flashcard>();
  const order: string[] = [];
  for (const deck of ordered) {
    for (const card of deck.cards) {
      const key = cardKey(card);
      const existing = byKey.get(key);
      if (!existing) { byKey.set(key, card); order.push(key); continue; }
      const better = progress(card) > progress(existing)
        || (progress(card) === progress(existing) && (card.srs?.lastReview ?? 0) > (existing.srs?.lastReview ?? 0));
      if (better) byKey.set(key, card);
    }
  }
  return { ...base, cards: order.map(k => byKey.get(k)!) };
};
