import { de } from './locales/de';
import { tr } from './locales/tr';
import { en } from './locales/en';

export type Locale = 'de' | 'tr' | 'en';
export type TKey = keyof typeof de;
export type Translations = Record<TKey, string>;

const DICTS: Record<Locale, Translations> = { de, tr, en };

function isLocale(v: string | null): v is Locale {
  return v === 'de' || v === 'tr' || v === 'en';
}

// Cookie statt localStorage, weil der Cloudflare-Worker (worker/index.js) das
// Land nur SERVERSEITIG kennt (request.cf.country) — er setzt einmalig beim
// allerersten Besuch (noch kein Cookie) diesen Cookie per IP-Geolocation, der
// dann schon im allerersten Response mitkommt (kein Flackern/zweiter Request).
function readLangCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)studearc_language=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

// --- Modul-State: von React UND von Services (ohne React) geteilt ---
function detectInitial(): Locale {
  try {
    const stored = localStorage.getItem('studearc_language');
    if (isLocale(stored)) return stored;

    // Zweite Stufe: vom Worker per IP-Land gesetztes Cookie (nur bei WIRKLICH
    // erstem Besuch überhaupt vorhanden — s. Kommentar in worker/index.js).
    const cookieLang = readLangCookie();
    if (isLocale(cookieLang)) {
      localStorage.setItem('studearc_language', cookieLang);
      return cookieLang;
    }

    // Letzter Fallback (z.B. lokal ohne Worker, oder Cookies blockiert):
    // Browser-Spracheinstellung statt Standort.
    const lang = navigator.language?.toLowerCase();
    const detected: Locale = lang?.startsWith('tr') ? 'tr' : lang?.startsWith('en') ? 'en' : 'de';
    localStorage.setItem('studearc_language', detected);
    return detected;
  } catch {
    return 'de';
  }
}

let current: Locale = detectInitial();
if (typeof document !== 'undefined') document.documentElement.lang = current;

// Der I18nProvider registriert hier seinen React-Setter, damit ein Sprachwechsel
// (auch aus einem Service oder beim Cloud-Login) sofort ein Re-Render auslöst.
type Listener = (l: Locale) => void;
let listener: Listener | null = null;
export const _registerListener = (fn: Listener | null): void => { listener = fn; };

export const getLocale = (): Locale => current;

export const setLocale = (l: Locale): void => {
  current = l;
  if (typeof document !== 'undefined') document.documentElement.lang = l;
  listener?.(l);
};

const LOCALE_TAGS: Record<Locale, string> = { tr: 'tr-TR', en: 'en-US', de: 'de-DE' };
export const localeTag = (): string => LOCALE_TAGS[current];

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, key) => (key in vars ? String(vars[key]) : m));
}

function lookup(key: TKey): string {
  return DICTS[current][key] ?? de[key] ?? (key as string);
}

/** Übersetzt einen Schlüssel, optional mit {name}-Interpolation. */
export function t(key: TKey, vars?: Record<string, string | number>): string {
  return interpolate(lookup(key), vars);
}

/**
 * Plural: Wert ist "Einzahl|Mehrzahl". Deutsch wählt nach n===1;
 * Türkisch nutzt immer die erste (endungslose) Form. {n} wird eingesetzt.
 */
export function tp(key: TKey, n: number, vars?: Record<string, string | number>): string {
  const raw = lookup(key);
  const parts = raw.split('|');
  const chosen = current === 'tr' ? parts[0] : n === 1 ? parts[0] : parts[1] ?? parts[0];
  return interpolate(chosen, { n, ...vars });
}
