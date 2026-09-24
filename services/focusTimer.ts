/**
 * Fokus-Timer (Pomodoro), Audit 23.09.2026: Die App plant Lernblöcke und
 * schätzt Minuten, bot aber keinen Timer.
 *
 * Zustand liegt in localStorage (Endzeitpunkt statt Restzeit), damit der
 * Timer Seitenwechsel und Neuladen übersteht und in jedem Tab stimmt.
 */
export const FOCUS_KEY = 'studearc_focus_timer';
export const FOCUS_EVENT = 'studearc:focus-timer';
export const FOCUS_OPTIONS = [15, 25, 45] as const;

export type FocusState =
  | { status: 'running'; endsAt: number; minutes: number }
  | { status: 'paused'; remainingMs: number; minutes: number };

const emit = () => { try { window.dispatchEvent(new CustomEvent(FOCUS_EVENT)); } catch { /* kein window */ } };

export const readFocus = (): FocusState | null => {
  try {
    const raw = localStorage.getItem(FOCUS_KEY);
    return raw ? (JSON.parse(raw) as FocusState) : null;
  } catch {
    return null;
  }
};

const write = (s: FocusState | null) => {
  try {
    if (s) localStorage.setItem(FOCUS_KEY, JSON.stringify(s));
    else localStorage.removeItem(FOCUS_KEY);
  } catch { /* Speicher gesperrt */ }
  emit();
};

export const startFocus = (minutes: number, now = Date.now()) =>
  write({ status: 'running', endsAt: now + minutes * 60_000, minutes });

export const pauseFocus = (now = Date.now()) => {
  const s = readFocus();
  if (s?.status === 'running') write({ status: 'paused', remainingMs: Math.max(0, s.endsAt - now), minutes: s.minutes });
};

export const resumeFocus = (now = Date.now()) => {
  const s = readFocus();
  if (s?.status === 'paused') write({ status: 'running', endsAt: now + s.remainingMs, minutes: s.minutes });
};

export const stopFocus = () => write(null);

/** Verbleibende Millisekunden; 0 = abgelaufen. */
export const remainingMs = (s: FocusState, now = Date.now()): number =>
  s.status === 'running' ? Math.max(0, s.endsAt - now) : s.remainingMs;
