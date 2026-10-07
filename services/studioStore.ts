import { supabase } from './supabaseClient';
import type { StudioFormat } from './subjectStudio';

/**
 * Gespeicherte Lernstudio-Ergebnisse und Notizen je Fach
 * (backend/migration_studio_items.sql). Lokaler Zwischenspeicher je Konto
 * (studearc_-Präfix, getrennt nach userId), die Cloud ist führend. Fehlt die
 * Tabelle noch, bleibt alles lokal statt mit Fehler abzubrechen.
 */

export type StudioKind = StudioFormat | 'note';

export interface StudioSourceRef { n: number; docId: string; name: string }

export interface StudioItem {
  id: string;
  collectionId: string;
  kind: StudioKind;
  title: string;
  markdown: string;
  sources: StudioSourceRef[];
  focus?: string;
  createdAt: number;
  updatedAt: number;
}

const cacheKey = (userId: string | undefined) => `studearc_studio_items_${userId ?? 'local'}`;

const readCache = (userId: string | undefined): StudioItem[] => {
  try {
    const raw = localStorage.getItem(cacheKey(userId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed as StudioItem[] : [];
  } catch { return []; }
};

const writeCache = (userId: string | undefined, items: StudioItem[]) => {
  try { localStorage.setItem(cacheKey(userId), JSON.stringify(items)); } catch { /* Speicher voll: Cloud bleibt Quelle */ }
};

interface StudioRow {
  id: string; collection_id: string; kind: StudioKind; title: string; markdown: string;
  sources: StudioSourceRef[] | null; focus: string | null; created_at: string; updated_at: string;
}

const fromRow = (r: StudioRow): StudioItem => ({
  id: r.id, collectionId: r.collection_id, kind: r.kind, title: r.title, markdown: r.markdown,
  sources: r.sources ?? [], ...(r.focus ? { focus: r.focus } : {}),
  createdAt: Date.parse(r.created_at), updatedAt: Date.parse(r.updated_at),
});

export const newStudioId = (): string => `st_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** Sofort lokal, dann aus der Cloud (ersetzt den lokalen Stand dieses Fachs, behält nicht hochgeladene Einträge). */
export const loadStudioItems = async (userId: string | undefined, collectionId: string): Promise<StudioItem[]> => {
  const local = readCache(userId);
  if (!userId) return local.filter(i => i.collectionId === collectionId);
  const { data, error } = await supabase
    .from('studio_items')
    .select('*')
    .eq('collection_id', collectionId)
    .order('created_at', { ascending: false });
  if (error) return local.filter(i => i.collectionId === collectionId);
  const cloud = (data as StudioRow[]).map(fromRow);
  const cloudIds = new Set(cloud.map(i => i.id));
  const pendingLocal = local.filter(i => i.collectionId === collectionId && !cloudIds.has(i.id));
  // Nur lokal liegende Einträge nachträglich hochladen (z.B. vor der Migration erzeugt).
  for (const item of pendingLocal) void pushItem(userId, item);
  const merged = [...pendingLocal, ...cloud];
  writeCache(userId, [...local.filter(i => i.collectionId !== collectionId), ...merged]);
  return merged.sort((a, b) => b.createdAt - a.createdAt);
};

export const cachedStudioItems = (userId: string | undefined, collectionId: string): StudioItem[] =>
  readCache(userId).filter(i => i.collectionId === collectionId).sort((a, b) => b.createdAt - a.createdAt);

const pushItem = async (userId: string, item: StudioItem): Promise<boolean> => {
  const { error } = await supabase.from('studio_items').upsert({
    id: item.id, user_id: userId, collection_id: item.collectionId, kind: item.kind,
    title: item.title, markdown: item.markdown, sources: item.sources, focus: item.focus ?? null,
    created_at: new Date(item.createdAt).toISOString(), updated_at: new Date(item.updatedAt).toISOString(),
  });
  return !error;
};

export const saveStudioItem = async (userId: string | undefined, item: StudioItem): Promise<void> => {
  const others = readCache(userId).filter(i => i.id !== item.id);
  writeCache(userId, [item, ...others]);
  if (userId) await pushItem(userId, item);
};

export const deleteStudioItem = async (userId: string | undefined, id: string): Promise<void> => {
  writeCache(userId, readCache(userId).filter(i => i.id !== id));
  if (userId) await supabase.from('studio_items').delete().eq('id', id);
};
