import { supabase } from './supabaseClient';

/**
 * Eigene Lernzeit und Tagesziel (Audit 23.09.2026: die Lernzeit sah bisher nur
 * der Admin, ein Tagesziel gab es nicht).
 *
 * Quelle ist daily_activity (migration_admin_activity.sql), gefüllt vom
 * Heartbeat alle 60 s, solange StudeArc sichtbar geöffnet ist. Die Tabelle
 * zählt nach Datenbankdatum (UTC), deshalb rechnet auch diese Datei in UTC.
 */
export const DAILY_GOAL_KEY = 'studearc_daily_goal_min';
export const DAILY_GOAL_OPTIONS = [15, 30, 45, 60, 90] as const;
const DEFAULT_GOAL = 30;

/** Feuert nach jedem gesendeten Heartbeat, damit Anzeigen nachladen. */
export const STUDY_TIME_EVENT = 'studearc:study-time';

export interface StudyDay {
  /** YYYY-MM-DD (UTC) */
  date: string;
  minutes: number;
}

export const getDailyGoal = (): number => {
  try {
    const v = parseInt(localStorage.getItem(DAILY_GOAL_KEY) || '', 10);
    return (DAILY_GOAL_OPTIONS as readonly number[]).includes(v) ? v : DEFAULT_GOAL;
  } catch {
    return DEFAULT_GOAL;
  }
};

export const setDailyGoal = (minutes: number, userId?: string | null): void => {
  try { localStorage.setItem(DAILY_GOAL_KEY, String(minutes)); } catch { /* Speicher gesperrt */ }
  if (userId) {
    import('./syncService').then(({ syncPreferences }) => syncPreferences(userId, { daily_goal_minutes: minutes })).catch(() => {});
  }
};

const utcDay = (d: Date): string => d.toISOString().slice(0, 10);

/** Die letzten `days` Tage inkl. heute, ältester zuerst; Tage ohne Aktivität mit 0. */
export const buildStudyDays = (rows: { activity_date: string; active_seconds: number }[], days: number, now = new Date()): StudyDay[] => {
  const byDate = new Map(rows.map(r => [r.activity_date, r.active_seconds]));
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - (days - 1 - i));
    const date = utcDay(d);
    return { date, minutes: Math.round((byDate.get(date) ?? 0) / 60) };
  });
};

export const loadRecentStudyTime = async (userId: string, days = 7): Promise<StudyDay[]> => {
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - (days - 1));
  const { data, error } = await supabase
    .from('daily_activity')
    .select('activity_date, active_seconds')
    .eq('user_id', userId)
    .gte('activity_date', utcDay(from));
  if (error) throw error;
  return buildStudyDays(data ?? [], days);
};
