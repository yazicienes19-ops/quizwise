/**
 * errorMessages.ts — Zentrale, konkrete Fehlermeldungen.
 * Ersetzt generische "Unbekannter Fehler" Texte durch hilfreiche Hinweise.
 *
 * Verwendung in App.tsx:
 *   import { resolveErrorMessage } from './services/errorMessages';
 *   toast.error(resolveErrorMessage(e));
 */

import { t } from '../i18n';
import type { TKey } from '../i18n';

interface ErrorMapping {
  match: (msg: string) => boolean;
  key: TKey;
}

const ERROR_MAP: ErrorMapping[] = [
  { match: m => m.includes('LIMIT_REACHED'), key: 'errors.limitReached' },
  { match: m => m.includes('einloggen') || m.includes('not authenticated') || m.includes('JWT'), key: 'errors.notAuthenticated' },
  { match: m => m.includes('nicht verfügbar') || m.includes('storage'), key: 'errors.docUnavailable' },
  { match: m => m.includes('quota') || m.includes('429') || m.includes('RESOURCE_EXHAUSTED'), key: 'errors.quota' },
  { match: m => m.includes('network') || m.includes('fetch') || m.includes('Failed to fetch'), key: 'errors.network' },
  { match: m => m.includes('timeout') || m.includes('DEADLINE'), key: 'errors.timeout' },
  { match: m => m.includes('SAFETY') || m.includes('blocked'), key: 'errors.safety' },
  { match: m => m.includes('JSON') || m.includes('parse'), key: 'errors.badJson' },
];

export const resolveErrorMessage = (error: unknown): string => {
  const msg = error instanceof Error ? error.message : String(error ?? '');
  const found = ERROR_MAP.find(e => e.match(msg));
  if (found) return t(found.key);
  // Fallback: konkreter als "Unbekannter Fehler"
  return msg.length > 0 && msg.length < 120
    ? msg
    : t('errors.generic');
};
