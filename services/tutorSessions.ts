/**
 * Sitzungs-Persistenz für den Tutor: Gespräche (Nachrichten, Modus, Quelle)
 * bleiben über Neuladen erhalten und sind von der Startseite fortsetzbar.
 * Nur Metadaten + Text — die eigentliche GenerationSource (Base64-PDF!)
 * wird NICHT gespeichert, sondern beim Fortsetzen über die Quellen-Referenz
 * (docId/Ordner-Id) neu aufgelöst. Cloud-Sync über syncOptionalSavedField.
 */

export type TutorMode = 'explain' | 'socratic' | 'quiz';

export interface StoredTutorMessage {
  id: string;
  /** 'system' = Moduswechsel-Pille im Verlauf (Redesign 2026-09-10) — Text der
   *  Pille steht in `content` (z.B. der Zielmodus). Ältere gespeicherte
   *  Sitzungen enthalten diese Rolle nie, laden aber unverändert weiter. */
  role: 'user' | 'tutor' | 'system';
  content: string;
  followUps?: string[];
  quote?: string | null;
  ts: number;
}

/** Verweis auf die Wissensquelle einer Sitzung — nach Neuladen neu auflösbar. */
export type TutorSourceRef =
  | { kind: 'doc'; id: string }
  | { kind: 'collection'; id: string }
  | null;

export interface StoredTutorSession {
  id: string;
  mode: TutorMode;
  sourceName: string;
  sourceRef: TutorSourceRef;
  useExternal: boolean;
  messages: StoredTutorMessage[];
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = 'studearc_tutor_sessions_v1';
const MAX_SESSIONS = 10;
const MAX_MESSAGES_PER_SESSION = 40;

const isValidSession = (s: any): s is StoredTutorSession =>
  !!s && typeof s.id === 'string' && Array.isArray(s.messages) &&
  (s.mode === 'explain' || s.mode === 'socratic' || s.mode === 'quiz');

export function loadTutorSessions(): StoredTutorSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidSession);
  } catch {
    return [];
  }
}

function persist(sessions: StoredTutorSession[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch {
    // Quota überschritten (alte Sitzungen mit vielen Nachrichten): älteste
    // Sitzungen nach und nach opfern, bis es wieder passt.
    if (sessions.length > 1) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.slice(0, Math.ceil(sessions.length / 2))));
      } catch {}
    }
  }
}

const syncToCloud = (): void => {
  import('./syncService')
    .then(({ syncOptionalSavedField }) => syncOptionalSavedField('tutor_sessions', loadTutorSessions))
    .catch(() => {});
};

/**
 * Legt eine Sitzung an oder aktualisiert sie (upsert by id). Nachrichten
 * werden auf die letzten MAX_MESSAGES_PER_SESSION gekappt, das Array auf
 * MAX_SESSIONS Sitzungen (älteste fliegen raus).
 */
export function saveTutorSession(session: StoredTutorSession): StoredTutorSession[] {
  const capped: StoredTutorSession = {
    ...session,
    messages: session.messages.slice(-MAX_MESSAGES_PER_SESSION),
    updatedAt: Date.now(),
  };
  const rest = loadTutorSessions().filter(s => s.id !== capped.id);
  const next = [capped, ...rest]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_SESSIONS);
  persist(next);
  syncToCloud();
  return next;
}

export function deleteTutorSession(id: string): StoredTutorSession[] {
  const next = loadTutorSessions().filter(s => s.id !== id);
  persist(next);
  syncToCloud();
  return next;
}

/**
 * Cloud-Pull: pro Sitzung gewinnt der neuere Stand (updatedAt). Hat das Gerät
 * Sitzungen, die in der Cloud fehlen, wird der vereinigte Stand zurückgeschrieben.
 * Wie beim Karteikarten-Merge ohne Tombstones: eine auf einem anderen Gerät
 * gelöschte Sitzung kann von hier aus wieder auftauchen.
 */
export function mergeCloudTutorSessions(cloud: unknown): StoredTutorSession[] {
  const cloudSessions = Array.isArray(cloud) ? cloud.filter(isValidSession) : [];
  const byId = new Map(loadTutorSessions().map(s => [s.id, s]));
  for (const s of cloudSessions) {
    const local = byId.get(s.id);
    if (!local || (s.updatedAt ?? 0) > (local.updatedAt ?? 0)) byId.set(s.id, s);
  }
  const merged = [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_SESSIONS);
  persist(merged);
  if (JSON.stringify(merged) !== JSON.stringify(cloudSessions)) syncToCloud();
  return merged;
}

/** Anzeigetitel einer Sitzung: erste Nutzer-Nachricht, gekürzt. */
export function tutorSessionTitle(session: StoredTutorSession, fallback: string): string {
  const firstUser = session.messages.find(m => m.role === 'user');
  const title = firstUser?.content.trim() ?? '';
  if (!title) return fallback;
  return title.length > 60 ? `${title.slice(0, 60).trimEnd()}…` : title;
}
