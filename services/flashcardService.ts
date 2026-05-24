import { supabase } from './supabaseClient';
import { FlashcardDeck } from '../types';

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
  const { error } = await supabase.from('flashcard_decks').upsert({
    id: deck.id,
    user_id: userId,
    title: deck.title,
    cards: deck.cards,
    source_document_id: deck.sourceDocumentId ?? null,
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
