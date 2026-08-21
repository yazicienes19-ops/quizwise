/**
 * analyticsService — minimale, datensparsame Produkt-Analytics.
 *
 * Local-first: Events landen in einem localStorage-Ring (kein Netzwerk, keine
 * Dritt-Anbieter, keine personenbezogenen Daten). Ziel ist allein, den Funnel
 * nach dem Launch nachvollziehen zu können (Wo verlieren wir Nutzer? Welche
 * Features erzeugen Retention?). Der Sink ist bewusst austauschbar — ein späterer
 * Wechsel auf einen Backend-Endpoint ist eine Änderung in `persist()`, ohne die
 * Call-Stellen anzufassen.
 *
 * Einmal-Events (first_*, day_1_return, …) werden dedupliziert.
 */

export type AnalyticsEvent =
  | 'session_start'
  | 'signup'
  | 'onboarding_complete'
  | 'first_upload'
  | 'first_quiz'
  | 'first_exam'
  | 'first_recall'
  | 'first_cards'
  | 'quiz_complete'
  | 'exam_complete'
  | 'recall_complete'
  | 'cards_complete'
  | 'paywall_view'
  | 'upgrade_checkout_started'
  | 'exam_generated'
  | 'day_1_return'
  | 'day_7_return';

export interface AnalyticsEntry {
  event: AnalyticsEvent;
  timestamp: number;
  props?: Record<string, string | number | boolean>;
}

const EVENTS_KEY = 'studearc_analytics_events';
const ONCE_KEY = 'studearc_analytics_once';
const FIRST_SEEN_KEY = 'studearc_analytics_first_seen';
const MAX_ENTRIES = 500;
const DAY_MS = 24 * 60 * 60 * 1000;

const readEvents = (): AnalyticsEntry[] => {
  try { return JSON.parse(localStorage.getItem(EVENTS_KEY) || '[]'); } catch { return []; }
};

const persist = (events: AnalyticsEntry[]): void => {
  try { localStorage.setItem(EVENTS_KEY, JSON.stringify(events.slice(-MAX_ENTRIES))); } catch {}
};

const readOnce = (): string[] => {
  try { return JSON.parse(localStorage.getItem(ONCE_KEY) || '[]'); } catch { return []; }
};

const markOnce = (key: string): void => {
  try { localStorage.setItem(ONCE_KEY, JSON.stringify([...readOnce(), key])); } catch {}
};

/** Ein Event aufzeichnen. `once: true` = nur das erste Mal (für Funnel-Marker). */
export const track = (event: AnalyticsEvent, props?: AnalyticsEntry['props'], once = false): void => {
  if (once && readOnce().includes(event)) return;
  if (once) markOnce(event);
  const events = readEvents();
  events.push({ event, timestamp: Date.now(), ...(props ? { props } : {}) });
  persist(events);
};

/** Alle aufgezeichneten Events — für Export/Auswertung. */
export const getAnalyticsEvents = (): AnalyticsEntry[] => readEvents();

/**
 * Bei jedem App-Start aufrufen: zählt session_start und leitet aus dem
 * Erstnutzungs-Datum die Retention-Marker day_1_return / day_7_return ab
 * (einmalig, nur wenn der Nutzer tatsächlich am Tag 1/7 zurückkehrt).
 */
export const trackSessionStart = (): void => {
  let firstSeen = Number(localStorage.getItem(FIRST_SEEN_KEY) || 0);
  if (!firstSeen) {
    firstSeen = Date.now();
    try { localStorage.setItem(FIRST_SEEN_KEY, String(firstSeen)); } catch {}
  }
  track('session_start');
  const days = Math.floor((Date.now() - firstSeen) / DAY_MS);
  if (days >= 1) track('day_1_return', { days }, true);
  if (days >= 7) track('day_7_return', { days }, true);
};
