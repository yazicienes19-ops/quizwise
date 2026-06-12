/**
 * errorMessages.ts — Zentrale, konkrete Fehlermeldungen.
 * Ersetzt generische "Unbekannter Fehler" Texte durch hilfreiche Hinweise.
 *
 * Verwendung in App.tsx:
 *   import { resolveErrorMessage } from './services/errorMessages';
 *   toast.error(resolveErrorMessage(e));
 */

interface ErrorMapping {
  match: (msg: string) => boolean;
  message: string;
}

const ERROR_MAP: ErrorMapping[] = [
  {
    match: m => m.includes('LIMIT_REACHED'),
    message: 'Tageslimit erreicht (20 Anfragen). Morgen geht es weiter — oder upgrade auf Pro für unbegrenztes Lernen.',
  },
  {
    match: m => m.includes('einloggen') || m.includes('not authenticated') || m.includes('JWT'),
    message: 'Bitte melde dich an, um diese Funktion zu nutzen.',
  },
  {
    match: m => m.includes('nicht verfügbar') || m.includes('storage'),
    message: 'Dokument nicht mehr verfügbar. Bitte lade es erneut hoch.',
  },
  {
    match: m => m.includes('quota') || m.includes('429') || m.includes('RESOURCE_EXHAUSTED'),
    message: 'Die KI ist gerade stark ausgelastet. Bitte versuche es in einer Minute erneut.',
  },
  {
    match: m => m.includes('network') || m.includes('fetch') || m.includes('Failed to fetch'),
    message: 'Keine Verbindung zum Server. Prüfe deine Internetverbindung und versuche es erneut.',
  },
  {
    match: m => m.includes('timeout') || m.includes('DEADLINE'),
    message: 'Die Anfrage hat zu lange gedauert. Bei großen Dokumenten kann das passieren — versuche es noch einmal.',
  },
  {
    match: m => m.includes('SAFETY') || m.includes('blocked'),
    message: 'Die KI konnte diesen Inhalt nicht verarbeiten. Versuche einen anderen Abschnitt des Dokuments.',
  },
  {
    match: m => m.includes('JSON') || m.includes('parse'),
    message: 'Die KI-Antwort war fehlerhaft. Einfach nochmal versuchen — das passiert selten zweimal.',
  },
];

export const resolveErrorMessage = (error: unknown): string => {
  const msg = error instanceof Error ? error.message : String(error ?? '');
  const found = ERROR_MAP.find(e => e.match(msg));
  if (found) return found.message;
  // Fallback: konkreter als "Unbekannter Fehler"
  return msg.length > 0 && msg.length < 120
    ? msg
    : 'Etwas ist schiefgelaufen. Lade die Seite neu und versuche es erneut.';
};
