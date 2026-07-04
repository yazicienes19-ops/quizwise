import { supabase } from './supabaseClient';
import { FlashcardDeck } from '../types';
import { mergeDeck } from './deckMerge';

export const loadDecksFromSupabase = async (userId: string): Promise<FlashcardDeck[]> => {
  const { data, error } = await supabase
    .from('flashcard_decks')
    .select('id, title, cards, source_document_id')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(row => ({
    id: row.id,
    title: row.title,
    cards: row.cards,
    sourceDocumentId: row.source_document_id ?? undefined,
  }));
};

export const saveDeckToSupabase = async (deck: FlashcardDeck, userId: string): Promise<void> => {
  // Vor dem Upsert mit dem Cloud-Stand mergen — sonst überschreibt ein Gerät
  // per Last-Write-Wins den SRS-Fortschritt eines anderen Geräts.
  let toSave = deck;
  try {
    const { data } = await supabase
      .from('flashcard_decks')
      .select('cards')
      .eq('id', deck.id)
      .eq('user_id', userId)
      .maybeSingle();
    if (data?.cards?.length) {
      toSave = mergeDeck(deck, { ...deck, cards: data.cards });
    }
  } catch { /* Cloud nicht erreichbar → lokalen Stand speichern */ }

  const { error } = await supabase.from('flashcard_decks').upsert({
    id: toSave.id,
    user_id: userId,
    title: toSave.title,
    cards: toSave.cards,
    source_document_id: toSave.sourceDocumentId ?? null,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
};

export const deleteDeckFromSupabase = async (deckId: string, userId: string): Promise<void> => {
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
  const rows = decks.map(deck => ({
    id: deck.id,
    user_id: userId,
    title: deck.title,
    cards: deck.cards,
    source_document_id: deck.sourceDocumentId ?? null,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase.from('flashcard_decks').upsert(rows);
  if (error) throw error;
};
