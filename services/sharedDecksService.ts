import { supabase } from './supabaseClient';
import { Flashcard } from '../types';

export interface SharedDeck {
  id: string;
  owner_id: string;
  name: string;
  cards: Flashcard[];
  created_at: string;
}

/** Upsert statt Insert: erneutes Teilen (z.B. nach neuen/bearbeiteten Karten)
 *  aktualisiert die bestehende Zeile unter demselben Link, statt am
 *  Unique-Constraint zu scheitern und den Link stumm auf einem veralteten
 *  Stand einzufrieren. Braucht die UPDATE-Policy aus
 *  migration_shared_decks_update.sql (nur INSERT existierte bisher). */
export const shareDeck = async (
  deckId: string,
  name: string,
  cards: Flashcard[],
  userId: string
): Promise<string> => {
  const cleanCards = cards.map(({ id, front, back }) => ({ id, front, back }));
  const { data, error } = await supabase
    .from('shared_decks')
    .upsert({ id: deckId, owner_id: userId, name, cards: cleanCards }, { onConflict: 'id' })
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
