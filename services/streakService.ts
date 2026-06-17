/**
 * streakService.ts — Tägliche Lern-Streak. FERTIG IMPLEMENTIERT.
 *
 * Verwendung:
 *   import { recordActivity, getStreak } from './streakService';
 *
 *   // Nach jeder Lernaktivität (Quiz beendet, Karten wiederholt, ...):
 *   recordActivity();
 *
 *   // Im Dashboard/Header:
 *   const { current, best, todayDone } = getStreak();
 */

const STREAK_KEY = 'quizwise_streak';

interface StreakData {
  /** Aktuelle Streak in Tagen */
  current: number;
  /** Beste Streak aller Zeiten */
  best: number;
  /** Letzter Aktivitätstag als YYYY-MM-DD */
  lastDay: string | null;
}

const todayStr = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const yesterdayStr = (): string => {
  const d = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const load = (): StreakData => {
  try {
    const raw = localStorage.getItem(STREAK_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { current: 0, best: 0, lastDay: null };
};

const save = (data: StreakData) => {
  localStorage.setItem(STREAK_KEY, JSON.stringify(data));
};

/** Nach jeder Lernaktivität aufrufen. Idempotent pro Tag. */
export const recordActivity = (userId?: string | null): StreakData => {
  const data = load();
  const today = todayStr();

  if (data.lastDay === today) return data; // heute schon gezählt

  if (data.lastDay === yesterdayStr()) {
    data.current += 1;          // Streak geht weiter
  } else {
    data.current = 1;           // Streak neu gestartet (oder erste Aktivität)
  }
  data.lastDay = today;
  if (data.current > data.best) data.best = data.current;

  save(data);
  if (userId) {
    import('./syncService').then(({ syncLearningField }) => syncLearningField(userId, 'streak', data)).catch(() => {});
  }
  return data;
};

/** Aktuellen Stand lesen, ohne zu verändern. Setzt abgelaufene Streaks auf 0. */
export const getStreak = (): StreakData & { todayDone: boolean } => {
  const data = load();
  const today = todayStr();
  const todayDone = data.lastDay === today;

  // Streak gebrochen? (letzter Tag weder heute noch gestern)
  if (data.lastDay && data.lastDay !== today && data.lastDay !== yesterdayStr()) {
    data.current = 0;
    save(data);
  }

  return { ...data, todayDone };
};

/**
 * Hinweis für späteren Sync: Wenn Streak serverseitig gespeichert werden
 * soll (geräteübergreifend), dieselbe Logik in einer Supabase-Tabelle
 * `user_streaks` (user_id, current, best, last_day) abbilden und diese
 * Datei als Fallback für nicht eingeloggte Nutzer behalten.
 */
