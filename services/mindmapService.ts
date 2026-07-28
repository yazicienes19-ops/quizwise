import { supabase } from './supabaseClient';
import { MindmapItem } from '../types';

export const loadMindmapsFromSupabase = async (userId: string): Promise<MindmapItem[]> => {
  const { data, error } = await supabase
    .from('mindmaps')
    .select('id, title, markdown, source_document_id, collection_id, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(row => ({
    id: row.id,
    title: row.title,
    markdown: row.markdown,
    sourceDocumentId: row.source_document_id ?? undefined,
    collectionId: row.collection_id ?? undefined,
    updatedAt: new Date(row.updated_at).getTime(),
  }));
};

export const saveMindmapToSupabase = async (item: MindmapItem, userId: string): Promise<void> => {
  const { error } = await supabase.from('mindmaps').upsert({
    id: item.id,
    user_id: userId,
    title: item.title,
    markdown: item.markdown,
    source_document_id: item.sourceDocumentId ?? null,
    collection_id: item.collectionId ?? null,
    updated_at: new Date(item.updatedAt).toISOString(),
  });
  if (error) throw error;
};

export const deleteMindmapFromSupabase = async (id: string, userId: string): Promise<void> => {
  const { error } = await supabase
    .from('mindmaps')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw error;
};

// Für Migration: alle localStorage-Mindmaps auf einmal hochladen
export const uploadAllMindmapsToSupabase = async (items: MindmapItem[], userId: string): Promise<void> => {
  if (!items.length) return;
  const rows = items.map(item => ({
    id: item.id,
    user_id: userId,
    title: item.title,
    markdown: item.markdown,
    source_document_id: item.sourceDocumentId ?? null,
    collection_id: item.collectionId ?? null,
    updated_at: new Date(item.updatedAt).toISOString(),
  }));
  const { error } = await supabase.from('mindmaps').upsert(rows);
  if (error) throw error;
};
