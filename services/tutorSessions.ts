/**
 * Sitzungs-Persistenz für den Tutor: Gespräche (Nachrichten, Modus, Quelle)
 * bleiben über Neuladen erhalten und sind von der Startseite fortsetzbar.
 * Nur Metadaten + Text — die eigentliche GenerationSource (Base64-PDF!)
 * wird NICHT gespeichert, sondern beim Fortsetzen über die Quellen-Referenz
 * (docId/Ordner-Id) neu aufgelöst.
 */

export type TutorMode = 'explain' | 'socratic' | 'quiz';

export interface StoredTutorMessage {
  id: string;
  role: 'user' | 'tutor';
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

export function loadTutorSessions(): StoredTutorSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s): s is StoredTutorSession =>
      !!s && typeof s.id === 'string' && Array.isArray(s.messages) &&
      (s.mode === 'explain' || s.mode === 'socratic' || s.mode === 'quiz'));
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
  return next;
}

export function deleteTutorSession(id: string): StoredTutorSession[] {
  const next = loadTutorSessions().filter(s => s.id !== id);
  persist(next);
  return next;
}

/** Anzeigetitel einer Sitzung: erste Nutzer-Nachricht, gekürzt. */
export function tutorSessionTitle(session: StoredTutorSession, fallback: string): string {
  const firstUser = session.messages.find(m => m.role === 'user');
  const title = firstUser?.content.trim() ?? '';
  if (!title) return fallback;
  return title.length > 60 ? `${title.slice(0, 60).trimEnd()}…` : title;
}
