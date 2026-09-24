/**
 * Eigene Markierungen und Notizen im PDF (Audit 23.09.2026: markieren ging nur
 * indirekt über Tutor-Zitate).
 *
 * Gespeichert unter dem reservierten Schlüssel `__highlights` im Lesefortschritt
 * (studearc_reading_progress + Cloud-Spalte reading_progress), wie schon
 * `__lastPages` in chapterProgressService.ts: keine eigene Migration nötig.
 * Gelöschte Markierungen bleiben als Grabstein (deleted) stehen, damit der
 * Abgleich zwischen Geräten sie nicht wiederbelebt.
 */
export const HIGHLIGHTS_KEY = '__highlights';
const STORAGE_KEY = 'studearc_reading_progress';
export const HIGHLIGHT_COLORS = ['yellow', 'green', 'blue', 'pink'] as const;
export type HighlightColor = typeof HIGHLIGHT_COLORS[number];

/** Farbwerte für Anzeige; in beiden Themes lesbar, weil nur als Fläche mit Deckkraft genutzt. */
export const HIGHLIGHT_HEX: Record<HighlightColor, string> = {
  yellow: '#F5C84B', green: '#6CC08B', blue: '#6AA8E8', pink: '#E88AB4',
};

export interface UserHighlight {
  id: string;
  /** 1-basiert wie die Seitenanzeige im Leser. */
  page: number;
  quote: string;
  color: HighlightColor;
  note?: string;
  createdAt: number;
  updatedAt: number;
  deleted?: boolean;
}

export type HighlightMap = Record<string, UserHighlight[]>;

const readAll = (): Record<string, unknown> => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
};

const readMap = (): HighlightMap => {
  const v = readAll()[HIGHLIGHTS_KEY];
  return v && typeof v === 'object' ? (v as HighlightMap) : {};
};

const SYNC_DELAY_MS = 1500;
let syncTimer: ReturnType<typeof setTimeout> | null = null;

const writeMap = (map: HighlightMap, userId?: string | null): void => {
  const all = readAll();
  all[HIGHLIGHTS_KEY] = map;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(all)); } catch { /* Speicher voll/gesperrt */ }
  if (!userId) return;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    import('./syncService').then(({ syncSavedField }) => syncSavedField(userId, 'reading_progress', readAll())).catch(() => {});
  }, SYNC_DELAY_MS);
};

const newId = () => `hl_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** Sichtbare Markierungen eines Dokuments, nach Seite und Entstehung sortiert. */
export const getHighlights = (docId: string): UserHighlight[] =>
  (readMap()[docId] ?? [])
    .filter(h => !h.deleted)
    .sort((a, b) => a.page - b.page || a.createdAt - b.createdAt);

export const addHighlight = (
  docId: string,
  input: { page: number; quote: string; color?: HighlightColor; note?: string },
  userId?: string | null,
  now = Date.now(),
): UserHighlight => {
  const map = readMap();
  const h: UserHighlight = {
    id: newId(), page: input.page, quote: input.quote.replace(/\s+/g, ' ').trim(),
    color: input.color ?? 'yellow', note: input.note, createdAt: now, updatedAt: now,
  };
  map[docId] = [...(map[docId] ?? []), h];
  writeMap(map, userId);
  return h;
};

export const updateHighlight = (
  docId: string, id: string, patch: Partial<Pick<UserHighlight, 'color' | 'note' | 'deleted'>>,
  userId?: string | null, now = Date.now(),
): void => {
  const map = readMap();
  map[docId] = (map[docId] ?? []).map(h => (h.id === id ? { ...h, ...patch, updatedAt: now } : h));
  writeMap(map, userId);
};

export const removeHighlight = (docId: string, id: string, userId?: string | null, now = Date.now()): void =>
  updateHighlight(docId, id, { deleted: true }, userId, now);

export const restoreHighlight = (docId: string, id: string, userId?: string | null, now = Date.now()): void =>
  updateHighlight(docId, id, { deleted: false }, userId, now);

/** Abgleich zweier Geräte: Vereinigung nach id, jüngeres updatedAt gewinnt. */
export const mergeHighlightMaps = (local: unknown, cloud: unknown): HighlightMap => {
  const out: HighlightMap = {};
  const add = (map: unknown) => {
    if (!map || typeof map !== 'object') return;
    for (const [docId, list] of Object.entries(map as HighlightMap)) {
      if (!Array.isArray(list)) continue;
      const byId = new Map((out[docId] ?? []).map(h => [h.id, h]));
      for (const h of list) {
        if (!h?.id) continue;
        const prev = byId.get(h.id);
        if (!prev || (h.updatedAt ?? 0) > (prev.updatedAt ?? 0)) byId.set(h.id, h);
      }
      out[docId] = [...byId.values()];
    }
  };
  add(local);
  add(cloud);
  return out;
};
