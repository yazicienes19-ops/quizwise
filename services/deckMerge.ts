import type { Flashcard, FlashcardDeck } from '../types';

/**
 * deckMerge — konfliktarmer Merge für Karteikarten-Sync.
 *
 * Problem: flashcard_decks synct als ganzer jsonb-Blob (Last-Write-Wins).
 * Wer auf zwei Geräten lernt, verliert den SRS-Fortschritt eines Geräts.
 *
 * Strategie: Union pro Karten-ID; pro Karte gewinnt die Seite mit dem
 * NEUEREN Review (srs.lastReview). Bewusster Trade-off: eine auf Gerät A
 * gelöschte Karte kann durch Gerät B wieder auftauchen — das ist weniger
 * schlimm als verlorener Lernfortschritt (kein Tombstone-Tracking in v1).
 */

const reviewTime = (c: Flashcard): number => c.srs?.lastReview ?? 0;

/** Karte mit dem aktuelleren Lernstand gewinnt; bei Gleichstand lokal. */
export const mergeCard = (local: Flashcard, cloud: Flashcard): Flashcard =>
  reviewTime(cloud) > reviewTime(local) ? cloud : local;

export const mergeDeck = (local: FlashcardDeck, cloud: FlashcardDeck): FlashcardDeck => {
  const byId = new Map<string, Flashcard>();
  cloud.cards.forEach(c => byId.set(c.id, c));
  local.cards.forEach(c => {
    const other = byId.get(c.id);
    byId.set(c.id, other ? mergeCard(c, other) : c);
  });
  // Reihenfolge: lokale Ordnung zuerst, reine Cloud-Karten hinten angehängt
  const localIds = new Set(local.cards.map(c => c.id));
  const cards = [
    ...local.cards.map(c => byId.get(c.id)!),
    ...cloud.cards.filter(c => !localIds.has(c.id)),
  ];
  return { ...local, cards };
};

/** Union pro Deck-ID; beidseitig vorhandene Decks werden pro Karte gemergt. */
export const mergeDecks = (localDecks: FlashcardDeck[], cloudDecks: FlashcardDeck[]): FlashcardDeck[] => {
  const cloudById = new Map(cloudDecks.map(d => [d.id, d]));
  const merged = localDecks.map(d => {
    const cloud = cloudById.get(d.id);
    return cloud ? mergeDeck(d, cloud) : d;
  });
  const localIds = new Set(localDecks.map(d => d.id));
  return [...merged, ...cloudDecks.filter(d => !localIds.has(d.id))];
};
