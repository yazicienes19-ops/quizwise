// Granulare Cookie-Einwilligung (Essenziell/Funktional/Analyse). Essenziell ist
// immer aktiv und nicht abschaltbar (Auth-Session, Dokumente/Bibliothek lokal —
// Kernfunktion der App, kein Tracking). Funktional (Theme, Sprache, Schriftart
// etc.) ist standardmäßig erlaubt, bis explizit widerrufen. Analyse ist
// standardmäßig AUS und aktuell ungenutzt (kein Analytics-Tool eingebunden),
// die Kategorie existiert für zukünftige Funktionen.

export interface CookieConsent {
  essential: true;
  functional: boolean;
  analytics: boolean;
  decidedAt: string;
}

const STORAGE_KEY = 'cookie_consent_v2';
const LEGACY_KEY = 'cookie_consent';

export const FUNCTIONAL_STORAGE_KEYS = [
  'theme',
  'accent_color',
  'font_choice',
  'line_height',
  'studearc_language',
  'studearc_notification_settings',
] as const;
type FunctionalKey = (typeof FUNCTIONAL_STORAGE_KEYS)[number];

export const getCookieConsent = (): CookieConsent | null => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try { return JSON.parse(raw); } catch { /* fällt durch zur Legacy-Migration */ }
  }
  // Migration von der alten binären Entscheidung (vor den Kategorien)
  const legacy = localStorage.getItem(LEGACY_KEY);
  if (legacy === 'accepted') return { essential: true, functional: true, analytics: false, decidedAt: new Date(0).toISOString() };
  if (legacy === 'declined') return { essential: true, functional: false, analytics: false, decidedAt: new Date(0).toISOString() };
  return null;
};

export const hasDecided = (): boolean => getCookieConsent() !== null;

/** Vor einer Entscheidung erlaubt (reine Komfort-Speicherung, kein Tracking) — erst nach explizitem Widerruf gesperrt. */
export const hasFunctionalConsent = (): boolean => getCookieConsent()?.functional ?? true;

/** Vor einer Entscheidung nicht erlaubt (Opt-in-Kategorie). */
export const hasAnalyticsConsent = (): boolean => getCookieConsent()?.analytics ?? false;

export const setCookieConsent = (prefs: { functional: boolean; analytics: boolean }): void => {
  const consent: CookieConsent = {
    essential: true,
    functional: prefs.functional,
    analytics: prefs.analytics,
    decidedAt: new Date().toISOString(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(consent));
  localStorage.setItem(LEGACY_KEY, prefs.functional ? 'accepted' : 'declined');
  if (!prefs.functional) FUNCTIONAL_STORAGE_KEYS.forEach(k => localStorage.removeItem(k));
};

/** Schreibt einen funktionalen Präferenzwert nur, wenn dafür Einwilligung vorliegt. */
export const setFunctionalPref = (key: FunctionalKey, value: string): void => {
  if (!hasFunctionalConsent()) return;
  localStorage.setItem(key, value);
};
