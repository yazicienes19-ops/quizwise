import { supabase } from './supabaseClient';
import { Flashcard } from '../types';

export interface SharedDeck {
  id: string;
  owner_id: string;
  name: string;
  cards: Flashcard[];
  created_at: string;
}

export const shareDeck = async (
  deckId: string,
  name: string,
  cards: Flashcard[],
  userId: string
): Promise<string> => {
  const cleanCards = cards.map(({ id, front, back }) => ({ id, front, back }));
  const { data, error } = await supabase
    .from('shared_decks')
    .insert({ id: deckId, owner_id: userId, name, cards: cleanCards })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
};

export const getSharedDeck = async (id: string): Promise<SharedDeck | null> => {
  const { data, error } = await supabase
    .from('shared_decks')
    .select('id, owner_id, name, cards, created_at')
    .eq('id', id)
    .single();
  if (error) return null;
  return data as SharedDeck;
};
