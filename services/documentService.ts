import { supabase } from './supabaseClient';
import { ProcessedDocument, Collection } from '../types';

// ── Collections ───────────────────────────────────────────────────────────────

export const loadCollectionsFromSupabase = async (): Promise<Collection[]> => {
  const { data, error } = await supabase
    .from('collections')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(row => ({
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    color: row.color,
  }));
};

export const saveCollectionToSupabase = async (col: Collection): Promise<void> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase.from('collections').upsert({
    id: col.id,
    user_id: user.id,
    name: col.name,
    emoji: col.emoji,
    color: col.color,
  });
  if (error) throw error;
};

export const deleteCollectionFromSupabase = async (colId: string): Promise<void> => {
  const { error } = await supabase.from('collections').delete().eq('id', colId);
  if (error) throw error;
};

// ── Documents ─────────────────────────────────────────────────────────────────

export const loadDocumentsFromSupabase = async (): Promise<ProcessedDocument[]> => {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .order('upload_date', { ascending: false });
  if (error) throw error;
  return (data || []).map(row => ({
    id: row.id,
    name: row.name,
    type: row.file_type as 'pdf' | 'text' | 'docx',
    collectionId: row.collection_id ?? undefined,
    uploadDate: row.upload_date,
    content: row.content_text || '',   // PDF: leer bis on-demand geladen
    storagePath: row.storage_path ?? undefined,
  }));
};

export const saveDocumentToSupabase = async (
  doc: ProcessedDocument,
  originalFile?: File   // nur bei PDFs nötig für Storage-Upload
): Promise<string | null> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  let storagePath: string | null = null;
  let contentText: string | null = null;

  if (doc.type === 'pdf' && originalFile) {
    storagePath = `${user.id}/${doc.id}/${originalFile.name}`;
    const { error: uploadErr } = await supabase.storage
      .from('document-files')
      .upload(storagePath, originalFile, { upsert: true });
    if (uploadErr) throw uploadErr;
  } else if (doc.type !== 'pdf') {
    // Text/DOCX: extrahierten Text speichern, max. 1 MB
    contentText = doc.content.slice(0, 1_000_000);
  }

  const { error } = await supabase.from('documents').upsert({
    id: doc.id,
    user_id: user.id,
    name: doc.name,
    file_type: doc.type,
    collection_id: doc.collectionId ?? null,
    storage_path: storagePath,
    content_text: contentText,
    upload_date: doc.uploadDate,
    status: 'ready',
  });
  if (error) throw error;
  return storagePath;
};

export const deleteDocumentFromSupabase = async (doc: ProcessedDocument): Promise<void> => {
  if (doc.storagePath) {
    // Storage-Fehler ignorieren — DB-Eintrag trotzdem löschen
    await supabase.storage.from('document-files').remove([doc.storagePath]).catch(() => {});
  }
  const { error } = await supabase.from('documents').delete().eq('id', doc.id);
  if (error) throw error;
};

export const updateDocumentCollectionInSupabase = async (
  docId: string,
  collectionId: string | undefined
): Promise<void> => {
  const { error } = await supabase
    .from('documents')
    .update({ collection_id: collectionId ?? null })
    .eq('id', docId);
  if (error) throw error;
};

// ── PDF on-demand laden ───────────────────────────────────────────────────────
// Lädt die Datei aus Supabase Storage und gibt sie als Base64-String zurück.
// Wird aufgerufen bevor ein PDF an die KI übergeben wird.

export const downloadPdfAsBase64 = async (storagePath: string): Promise<string> => {
  const { data, error } = await supabase.storage
    .from('document-files')
    .download(storagePath);
  if (error) throw error;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(data);
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
  });
};
