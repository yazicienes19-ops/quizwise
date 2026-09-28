import { supabase } from './supabaseClient';
import { ProcessedDocument } from '../types';
import { isMissingRpc } from './sharedLinkRpc';

/**
 * Abgespeckte Dokument-Kopie für einen geteilten Fach-Link — analog zu
 * SharedDeck (sharedDecksService.ts), Snapshot statt Live-Zugriff.
 * PDF/Bild tragen bewusst KEINEN storagePath/content (kein Storage-Datei-
 * Kopieren nötig) — der Lerndigest reicht für alle KI-Funktionen aus,
 * s. Kommentar in backend/migration_shared_collections.sql.
 */
export interface SharedDocSnapshot {
  id: string;
  name: string;
  type: ProcessedDocument['type'];
  mimeType?: string;
  /** Nur bei type 'text'/'docx' befüllt — PDF/Bild nutzen ausschließlich digestText. */
  content: string;
  digestText?: string;
  digestStatus?: ProcessedDocument['digestStatus'];
}

export interface SharedLibrary {
  id: string;
  owner_name: string | null;
  name: string;
  emoji: string;
  color: string;
  documents: SharedDocSnapshot[];
  created_at: string;
}

export const toSharedDocSnapshot = (doc: ProcessedDocument): SharedDocSnapshot => ({
  id: doc.id,
  name: doc.name,
  type: doc.type,
  mimeType: doc.mimeType,
  content: doc.type === 'text' || doc.type === 'docx' ? doc.content : '',
  digestText: doc.digestText,
  digestStatus: doc.digestStatus,
});

/** Upsert statt Insert: erneutes Teilen (z.B. nach neuen Dokumenten) aktualisiert
 *  den bestehenden Link, statt am Unique-Constraint zu scheitern. */
export const shareCollection = async (
  collectionId: string,
  name: string,
  emoji: string,
  color: string,
  documents: SharedDocSnapshot[],
  userId: string,
  ownerName?: string | null
): Promise<string> => {
  const { data, error } = await supabase
    .from('shared_collections')
    .upsert({ id: collectionId, owner_id: userId, owner_name: ownerName ?? null, name, emoji, color, documents }, { onConflict: 'id' })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
};

export const getSharedLibrary = async (id: string): Promise<SharedLibrary | null> => {
  // Genau ein Fach per Link-ID (migration_security_2026_09_28.sql). Die
  // Tabelle selbst ist nur noch für den Besitzer lesbar.
  const { data, error } = await supabase.rpc('get_shared_collection', { p_id: id }).maybeSingle();
  if (!error) return (data as SharedLibrary | null) ?? null;
  if (!isMissingRpc(error)) return null;
  // Übergang, solange die Migration noch nicht ausgeführt ist.
  const legacy = await supabase
    .from('shared_collections')
    .select('id, owner_name, name, emoji, color, documents, created_at')
    .eq('id', id)
    .maybeSingle();
  if (legacy.error || !legacy.data) return null;
  return legacy.data as SharedLibrary;
};
