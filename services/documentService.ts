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
    type: row.file_type as 'pdf' | 'text' | 'docx' | 'image',
    mimeType: row.mime_type ?? undefined,
    collectionId: row.collection_id ?? undefined,
    uploadDate: row.upload_date,
    content: row.content_text || '',
    storagePath: row.storage_path ?? undefined,
    digestText: row.digest_text ?? undefined,
    digestStatus: row.digest_status ?? undefined,
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

  if ((doc.type === 'pdf' || doc.type === 'image') && originalFile) {
    // PDFs UND Bilder (Tafelfotos, Notizen) in den Storage — sonst kann das
    // Backend sie nie analysieren und die Ordner-Wissensbasis bleibt leer
    storagePath = `${user.id}/${doc.id}/${originalFile.name}`;
    const { error: uploadErr } = await supabase.storage
      .from('document-files')
      .upload(storagePath, originalFile, { upsert: true });
    if (uploadErr) throw uploadErr;
  } else if (doc.type === 'text' || doc.type === 'docx') {
    // Extrahierten Text speichern, max. 1 MB (Bilder-Base64 gehört NICHT hierher)
    contentText = doc.content.slice(0, 1_000_000);
  }

  const row: Record<string, unknown> = {
    id: doc.id,
    user_id: user.id,
    name: doc.name,
    file_type: doc.type,
    mime_type: doc.mimeType ?? null,
    collection_id: doc.collectionId ?? null,
    storage_path: storagePath,
    content_text: contentText,
    upload_date: doc.uploadDate,
    status: 'ready',
  };
  let { error } = await supabase.from('documents').upsert(row);
  if (error && /mime_type/i.test(error.message)) {
    // Ältere DB ohne mime_type-Spalte: ohne das Feld erneut versuchen
    delete row.mime_type;
    ({ error } = await supabase.from('documents').upsert(row));
  }
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

// ── Dokument-Analyse triggern (fire & forget) ─────────────────────────────────

export const triggerDocumentAnalysis = async (docId: string): Promise<void> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return;
  const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
  fetch(`${backendUrl}/api/documents/${docId}/analyze`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}` },
  }).catch(() => {});
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
