import { supabase } from './supabaseClient';
import { Flashcard } from '../types';
import { isMissingRpc } from './sharedLinkRpc';

export interface SharedDeck {
  id: string;
  owner_name: string | null;
  name: string;
  cards: Flashcard[];
  created_at: string;
}

/** Upsert statt Insert: erneutes Teilen (z.B. nach neuen/bearbeiteten Karten)
 *  aktualisiert die bestehende Zeile unter demselben Link, statt am
 *  Unique-Constraint zu scheitern und den Link stumm auf einem veralteten
 *  Stand einzufrieren. Braucht die UPDATE-Policy aus
 *  migration_shared_decks_update.sql (nur INSERT existierte bisher).
 *  `ownerName` = Vorname des Teilenden (clientseitig aus user_metadata
 *  abgeleitet, s. Dashboard.tsx-Muster) — zeigt die Vorschau-Seite
 *  ("{Name} hat ein Deck mit dir geteilt", s. migration_shared_owner_name.sql). */
export const shareDeck = async (
  deckId: string,
  name: string,
  cards: Flashcard[],
  userId: string,
  ownerName?: string | null
): Promise<string> => {
  const cleanCards = cards.map(({ id, front, back }) => ({ id, front, back }));
  const { data, error } = await supabase
    .from('shared_decks')
    .upsert({ id: deckId, owner_id: userId, owner_name: ownerName ?? null, name, cards: cleanCards }, { onConflict: 'id' })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
};

export const getSharedDeck = async (id: string): Promise<SharedDeck | null> => {
  // Genau ein Deck per Link-ID (migration_security_2026_09_28.sql). Die
  // Tabelle selbst ist nur noch für den Besitzer lesbar.
  const { data, error } = await supabase.rpc('get_shared_deck', { p_id: id }).maybeSingle();
  if (!error) return (data as SharedDeck | null) ?? null;
  if (!isMissingRpc(error)) return null;
  // Übergang, solange die Migration noch nicht ausgeführt ist.
  const legacy = await supabase
    .from('shared_decks')
    .select('id, owner_name, name, cards, created_at')
    .eq('id', id)
    .maybeSingle();
  if (legacy.error || !legacy.data) return null;
  return legacy.data as SharedDeck;
};
