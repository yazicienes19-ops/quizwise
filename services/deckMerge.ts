import type { Flashcard, FlashcardDeck } from '../types';

/**
 * deckMerge — konfliktarmer Merge für Karteikarten-Sync.
 *
 * Problem: flashcard_decks synct als ganzer jsonb-Blob (Last-Write-Wins).
 * Wer auf zwei Geräten lernt, verliert den SRS-Fortschritt eines Geräts.
 *
 * Strategie: Union pro Karten-ID; pro Karte gewinnt die Seite mit dem
 * NEUEREN Review (srs.lastReview). Gelöschte Karten stehen als Löschvermerk
 * in deletedCardIds und bleiben weg, egal welche Seite sie noch hat (vorher
 * holte der Abgleich sie zurück, selbst auf demselben Gerät). Gelöschte
 * Stapel kommen als Cloud-Zeile mit deletedAt oder als lokaler Vermerk.
 */

/** Vermerke älter als ein halbes Jahr fallen weg, damit die Liste nicht endlos wächst. */
const TOMBSTONE_TTL_MS = 180 * 24 * 60 * 60 * 1000;

const reviewTime = (c: Flashcard): number => c.srs?.lastReview ?? 0;

/** Karte mit dem aktuelleren Lernstand gewinnt; bei Gleichstand lokal. */
export const mergeCard = (local: Flashcard, cloud: Flashcard): Flashcard =>
  reviewTime(cloud) > reviewTime(local) ? cloud : local;

/** Vereinigt Löschvermerke (jüngster Zeitpunkt je ID) und verwirft abgelaufene. */
export const mergeTombstones = (
  a: Record<string, number> | undefined,
  b: Record<string, number> | undefined,
  now: number = Date.now(),
): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const src of [a, b]) {
    if (!src) continue;
    for (const [id, at] of Object.entries(src)) {
      if (typeof at !== 'number' || now - at > TOMBSTONE_TTL_MS) continue;
      if (!(id in out) || at > out[id]) out[id] = at;
    }
  }
  return out;
};

/** Setzt deletedCardIds nur, wenn es Vermerke gibt (hält alte Stapel unverändert). */
const withTombstones = (deck: FlashcardDeck, tombstones: Record<string, number>): FlashcardDeck => {
  const { deletedCardIds: _drop, ...rest } = deck;
  return Object.keys(tombstones).length > 0 ? { ...rest, deletedCardIds: tombstones } : rest;
};

export const mergeDeck = (local: FlashcardDeck, cloud: FlashcardDeck): FlashcardDeck => {
  const tombstones = mergeTombstones(local.deletedCardIds, cloud.deletedCardIds);
  const alive = (c: Flashcard) => !(c.id in tombstones);
  const byId = new Map<string, Flashcard>();
  cloud.cards.filter(alive).forEach(c => byId.set(c.id, c));
  local.cards.filter(alive).forEach(c => {
    const other = byId.get(c.id);
    byId.set(c.id, other ? mergeCard(c, other) : c);
  });
  // Reihenfolge: lokale Ordnung zuerst, reine Cloud-Karten hinten angehängt
  const localIds = new Set(local.cards.map(c => c.id));
  const cards = [
    ...local.cards.filter(alive).map(c => byId.get(c.id)!),
    ...cloud.cards.filter(c => alive(c) && !localIds.has(c.id)),
  ];
  return withTombstones({ ...local, cards }, tombstones);
};

/**
 * Union pro Deck-ID; beidseitig vorhandene Decks werden pro Karte gemergt.
 * Gelöscht ist ein Stapel, wenn die Cloud-Zeile deletedAt trägt oder seine ID
 * in deletedDeckIds steht (lokaler Vermerk); er fehlt dann im Ergebnis.
 */
export const mergeDecks = (
  localDecks: FlashcardDeck[],
  cloudDecks: FlashcardDeck[],
  deletedDeckIds: Iterable<string> = [],
): FlashcardDeck[] => {
  const deleted = new Set(deletedDeckIds);
  cloudDecks.forEach(d => { if (d.deletedAt) deleted.add(d.id); });
  const cloudById = new Map(cloudDecks.filter(d => !deleted.has(d.id)).map(d => [d.id, d]));
  const merged = localDecks.filter(d => !deleted.has(d.id)).map(d => {
    const cloud = cloudById.get(d.id);
    return cloud ? mergeDeck(d, cloud) : d;
  });
  const localIds = new Set(localDecks.map(d => d.id));
  return [...merged, ...[...cloudById.values()].filter(d => !localIds.has(d.id))];
};
