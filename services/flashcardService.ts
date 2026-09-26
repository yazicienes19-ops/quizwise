import { supabase } from './supabaseClient';
import { FlashcardDeck } from '../types';
import { mergeDeck } from './deckMerge';

/**
 * Löschvermerke brauchen die Spalten deleted_card_ids und deleted_at
 * (backend/migration_flashcard_tombstones.sql). Bis die Migration läuft,
 * fällt jede Anfrage einmal auf die alten Spalten zurück und merkt sich das;
 * Vermerke bleiben dann nur lokal (Verhalten wie vor dem 26.09.2026).
 */
let tombstoneColumns = true;
const isMissingColumn = (error: { code?: string; message?: string } | null): boolean =>
  !!error && (error.code === '42703' || error.code === 'PGRST204'
    || /deleted_card_ids|deleted_at/.test(error.message ?? ''));

/** Nur für Tests: Spalten-Erkennung zurücksetzen. */
export const resetTombstoneColumnDetection = (): void => { tombstoneColumns = true; };

interface DeckRow {
  id: string; title: string; cards: FlashcardDeck['cards'];
  source_document_id?: string | null;
  deleted_card_ids?: Record<string, number> | null;
  deleted_at?: string | null;
}

const rowToDeck = (row: DeckRow): FlashcardDeck => {
  const deck: FlashcardDeck = {
    id: row.id,
    title: row.title,
    cards: row.cards ?? [],
    sourceDocumentId: row.source_document_id ?? undefined,
  };
  if (row.deleted_card_ids && Object.keys(row.deleted_card_ids).length > 0) deck.deletedCardIds = row.deleted_card_ids;
  if (row.deleted_at) deck.deletedAt = Date.parse(row.deleted_at);
  return deck;
};

const deckToRow = (deck: FlashcardDeck, userId: string) => ({
  id: deck.id,
  user_id: userId,
  title: deck.title,
  cards: deck.cards,
  source_document_id: deck.sourceDocumentId ?? null,
  updated_at: new Date().toISOString(),
  ...(tombstoneColumns ? { deleted_card_ids: deck.deletedCardIds ?? {} } : {}),
});

/** Alle Stapel inklusive gelöschter (deletedAt gesetzt) — mergeDecks sortiert sie aus. */
export const loadDecksFromSupabase = async (userId: string): Promise<FlashcardDeck[]> => {
  const query = (cols: string) => supabase
    .from('flashcard_decks')
    .select(cols)
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  let result = await query(tombstoneColumns
    ? 'id, title, cards, source_document_id, deleted_card_ids, deleted_at'
    : 'id, title, cards, source_document_id');
  if (tombstoneColumns && isMissingColumn(result.error)) {
    tombstoneColumns = false;
    result = await query('id, title, cards, source_document_id');
  }
  if (result.error) throw result.error;
  return ((result.data ?? []) as unknown as DeckRow[]).map(rowToDeck);
};

const upsertRows = async (rows: ReturnType<typeof deckToRow>[], retryDecks?: () => ReturnType<typeof deckToRow>[]) => {
  const { error } = await supabase.from('flashcard_decks').upsert(rows);
  if (error && tombstoneColumns && isMissingColumn(error) && retryDecks) {
    tombstoneColumns = false;
    const retry = await supabase.from('flashcard_decks').upsert(retryDecks());
    if (retry.error) throw retry.error;
    return;
  }
  if (error) throw error;
};

export const saveDeckToSupabase = async (deck: FlashcardDeck, userId: string): Promise<void> => {
  // Vor dem Upsert mit dem Cloud-Stand mergen — sonst überschreibt ein Gerät
  // per Last-Write-Wins den SRS-Fortschritt eines anderen Geräts.
  let toSave = deck;
  try {
    const { data, error } = await supabase
      .from('flashcard_decks')
      .select(tombstoneColumns ? 'cards, deleted_card_ids, deleted_at' : 'cards')
      .eq('id', deck.id)
      .eq('user_id', userId)
      .maybeSingle();
    if (error && isMissingColumn(error)) tombstoneColumns = false;
    const row = data as unknown as DeckRow | null;
    // Anderswo gelöscht: nicht wieder anlegen.
    if (row?.deleted_at) return;
    if (row && (row.cards?.length || row.deleted_card_ids)) {
      toSave = mergeDeck(deck, { ...deck, cards: row.cards ?? [], deletedCardIds: row.deleted_card_ids ?? undefined });
    }
  } catch { /* Cloud nicht erreichbar → lokalen Stand speichern */ }

  await upsertRows([deckToRow(toSave, userId)], () => [deckToRow(toSave, userId)]);
};

/**
 * Stapel löschen: als gelöscht markieren statt die Zeile zu entfernen, damit
 * andere Geräte die Löschung beim Abgleich sehen und ihn nicht neu hochladen.
 * Ohne die neuen Spalten wie bisher hart löschen.
 */
export const deleteDeckFromSupabase = async (deckId: string, userId: string): Promise<void> => {
  if (tombstoneColumns) {
    const { error } = await supabase
      .from('flashcard_decks')
      .update({ deleted_at: new Date().toISOString(), cards: [], deleted_card_ids: {}, updated_at: new Date().toISOString() })
      .eq('id', deckId)
      .eq('user_id', userId);
    if (!error) return;
    if (!isMissingColumn(error)) throw error;
    tombstoneColumns = false;
  }
  const { error } = await supabase
    .from('flashcard_decks')
    .delete()
    .eq('id', deckId)
    .eq('user_id', userId);
  if (error) throw error;
};

// Für Migration: alle localStorage-Decks auf einmal hochladen
export const uploadAllDecksToSupabase = async (decks: FlashcardDeck[], userId: string): Promise<void> => {
  if (!decks.length) return;
  await upsertRows(decks.map(d => deckToRow(d, userId)), () => decks.map(d => deckToRow(d, userId)));
};
