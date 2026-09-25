import { supabase } from './supabaseClient';
import type { SrsState } from './spacedRepetition';

/**
 * Wiederholungsprotokoll der Karteikarten (Tabelle card_reviews,
 * backend/migration_card_reviews.sql). Grundlage für Heatmap, Verlauf einer
 * Karte und die Anpassung von FSRS an den eigenen Lernverlauf.
 *
 * Ablauf: jeder Eintrag landet sofort lokal (Warteschlange + Verlauf) und wird
 * gebündelt in die Cloud geschrieben. Fehlt die Tabelle noch, bleibt alles
 * lokal und wird nachgereicht, sobald sie existiert. client_id verhindert
 * doppelte Einträge beim Nachreichen.
 */
export type ReviewRating = 1 | 2 | 3 | 4;

export interface ReviewEntry {
  clientId: string;
  cardId: string;
  deckId?: string;
  reviewedAt: number;
  rating: ReviewRating;
  /** Tage seit der vorigen Wiederholung; null bei neuer Karte. */
  elapsedDays: number | null;
  intervalDays: number;
  stability?: number;
  difficulty?: number;
}

/** Wird nach jedem neuen oder zurückgenommenen Eintrag gesendet (Statistik aktualisiert sich). */
export const REVIEW_EVENT = 'studearc:review-logged';
const notify = () => { try { window.dispatchEvent(new CustomEvent(REVIEW_EVENT)); } catch { /* kein window */ } };

const QUEUE_KEY = 'studearc_review_queue';
const LOCAL_KEY = 'studearc_review_local';
/** Lokaler Verlauf für Anzeige ohne Cloud; ältere Einträge fallen heraus. */
const LOCAL_MAX = 5000;
const FLUSH_DELAY_MS = 4000;
const DAY_MS = 24 * 60 * 60 * 1000;

const read = (key: string): ReviewEntry[] => {
  try { const v = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
};
const write = (key: string, list: ReviewEntry[]) => {
  try { localStorage.setItem(key, JSON.stringify(list)); } catch { /* Speicher voll */ }
};

export const ratingFor = (d: 'again' | 'hard' | 'good' | 'easy'): ReviewRating =>
  d === 'again' ? 1 : d === 'hard' ? 2 : d === 'good' ? 3 : 4;

/** Eintrag aus dem Zustand vor und nach einer Bewertung bauen (reine Funktion). */
export const makeEntry = (
  cardId: string, deckId: string | undefined, rating: ReviewRating,
  before: SrsState | undefined, after: SrsState, now: number = Date.now(),
): ReviewEntry => ({
  clientId: `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  cardId, deckId, reviewedAt: now, rating,
  elapsedDays: before?.lastReview ? Math.max(0, (now - before.lastReview) / DAY_MS) : null,
  intervalDays: after.interval,
  stability: after.stability,
  difficulty: after.difficulty,
});

let userIdForSync: string | null = null;
let tableMissing = false;
let timer: ReturnType<typeof setTimeout> | null = null;

const toRow = (e: ReviewEntry, userId: string) => ({
  user_id: userId, card_id: e.cardId, deck_id: e.deckId ?? null,
  reviewed_at: new Date(e.reviewedAt).toISOString(), rating: e.rating,
  elapsed_days: e.elapsedDays, interval_days: e.intervalDays,
  stability: e.stability ?? null, difficulty: e.difficulty ?? null, client_id: e.clientId,
});

const isMissingTable = (err: { code?: string; message?: string } | null) =>
  !!err && (err.code === '42P01' || err.code === 'PGRST205' || /card_reviews/.test(err.message ?? '') && /exist|find/i.test(err.message ?? ''));

/** Warteschlange in die Cloud schreiben. Gibt die Zahl gesendeter Einträge zurück. */
export const flushReviews = async (): Promise<number> => {
  if (timer) { clearTimeout(timer); timer = null; }
  const userId = userIdForSync;
  const queue = read(QUEUE_KEY);
  if (!userId || !queue.length || tableMissing) return 0;
  const { error } = await supabase.from('card_reviews').upsert(queue.map(e => toRow(e, userId)), { onConflict: 'user_id,client_id', ignoreDuplicates: true });
  if (error) {
    if (isMissingTable(error)) tableMissing = true;
    return 0;
  }
  // Nur die gesendeten entfernen; was inzwischen dazukam, bleibt.
  const sent = new Set(queue.map(e => e.clientId));
  write(QUEUE_KEY, read(QUEUE_KEY).filter(e => !sent.has(e.clientId)));
  return queue.length;
};

const scheduleFlush = () => {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { void flushReviews(); }, FLUSH_DELAY_MS);
};

export const setReviewLogUser = (userId: string | null): void => {
  userIdForSync = userId;
  tableMissing = false;
  if (userId && read(QUEUE_KEY).length) scheduleFlush();
};

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => { void flushReviews(); });
}

export const logReview = (entry: ReviewEntry): void => {
  write(QUEUE_KEY, [...read(QUEUE_KEY), entry]);
  write(LOCAL_KEY, [...read(LOCAL_KEY), entry].slice(-LOCAL_MAX));
  scheduleFlush();
  notify();
};

/** Letzte Wiederholung einer Karte zurücknehmen (Rückgängig im Player). */
export const undoLastReview = async (cardId: string): Promise<void> => {
  const local = read(LOCAL_KEY);
  const idx = local.map(e => e.cardId).lastIndexOf(cardId);
  if (idx < 0) return;
  const entry = local[idx];
  write(LOCAL_KEY, local.filter((_, i) => i !== idx));
  notify();
  const queue = read(QUEUE_KEY);
  if (queue.some(e => e.clientId === entry.clientId)) {
    write(QUEUE_KEY, queue.filter(e => e.clientId !== entry.clientId));
    return;
  }
  if (userIdForSync && !tableMissing) {
    await supabase.from('card_reviews').delete().eq('user_id', userIdForSync).eq('client_id', entry.clientId);
  }
};

const fromRow = (r: Record<string, unknown>): ReviewEntry => ({
  clientId: String(r.client_id ?? r.id),
  cardId: String(r.card_id), deckId: (r.deck_id as string) ?? undefined,
  reviewedAt: new Date(String(r.reviewed_at)).getTime(), rating: Number(r.rating) as ReviewRating,
  elapsedDays: r.elapsed_days == null ? null : Number(r.elapsed_days),
  intervalDays: Number(r.interval_days ?? 0),
  stability: r.stability == null ? undefined : Number(r.stability),
  difficulty: r.difficulty == null ? undefined : Number(r.difficulty),
});

/**
 * Wiederholungen seit einem Zeitpunkt (optional nur einer Karte). Cloud und
 * lokale Einträge werden über client_id zusammengeführt, damit auch noch
 * nicht gesendete und Einträge anderer Geräte erscheinen.
 */
export const loadReviews = async (opts: { since?: number; cardId?: string } = {}): Promise<ReviewEntry[]> => {
  const since = opts.since ?? 0;
  const byId = new Map<string, ReviewEntry>();
  for (const e of [...read(LOCAL_KEY), ...read(QUEUE_KEY)]) {
    if (e.reviewedAt >= since && (!opts.cardId || e.cardId === opts.cardId)) byId.set(e.clientId, e);
  }
  if (userIdForSync && !tableMissing) {
    const PAGE = 1000;
    for (let from = 0; from < 50_000; from += PAGE) {
      let q = supabase.from('card_reviews').select('*').eq('user_id', userIdForSync)
        .gte('reviewed_at', new Date(since).toISOString()).order('reviewed_at', { ascending: true }).range(from, from + PAGE - 1);
      if (opts.cardId) q = q.eq('card_id', opts.cardId);
      const { data, error } = await q;
      if (error) { if (isMissingTable(error)) tableMissing = true; break; }
      (data ?? []).forEach(r => { const e = fromRow(r as Record<string, unknown>); byId.set(e.clientId, e); });
      if (!data || data.length < PAGE) break;
    }
  }
  return [...byId.values()].sort((a, b) => a.reviewedAt - b.reviewedAt);
};

/** Wiederholungen je Kalendertag (lokale Zeit, Schlüssel YYYY-MM-DD). */
export const countByDay = (entries: ReviewEntry[]): Map<string, number> => {
  const m = new Map<string, number>();
  for (const e of entries) {
    const d = new Date(e.reviewedAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    m.set(key, (m.get(key) ?? 0) + 1);
  }
  return m;
};

/** Behaltensrate: Anteil gewusster Wiederholungen bereits gelernter Karten (Anki "true retention"). */
export const trueRetention = (entries: ReviewEntry[]): number | null => {
  const reviews = entries.filter(e => e.elapsedDays !== null && e.elapsedDays >= 1);
  if (!reviews.length) return null;
  return reviews.filter(e => e.rating > 1).length / reviews.length;
};
