import { de } from './locales/de';
import { tr } from './locales/tr';

export type Locale = 'de' | 'tr';
export type TKey = keyof typeof de;
export type Translations = Record<TKey, string>;

const DICTS: Record<Locale, Translations> = { de, tr };

// --- Modul-State: von React UND von Services (ohne React) geteilt ---
function detectInitial(): Locale {
  try {
    const stored = localStorage.getItem('quizwise_language');
    if (stored === 'de' || stored === 'tr') return stored;
    const detected: Locale = navigator.language?.toLowerCase().startsWith('tr') ? 'tr' : 'de';
    localStorage.setItem('quizwise_language', detected);
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

export const localeTag = (): string => (current === 'tr' ? 'tr-TR' : 'de-DE');

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
