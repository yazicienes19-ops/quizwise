import { getLocale } from '../i18n';

/**
 * KI-Ausgabesprache. Das Prompt-Gerüst bleibt deutsch — nur die Sprache der
 * für den Nutzer sichtbaren Ausgabe wird umgeschaltet. Gemini folgt der
 * Anweisung zuverlässig, deshalb müssen die ~19 Prompts nicht dupliziert werden.
 *
 * WICHTIG: Struktur-Tokens (__LÜCKE__, [LÜCKE], Kategorie-Enums, **Quelle:**,
 * Allgemeinwissen:) bleiben sprachunabhängig — sie sind Protokoll, keine UI.
 */
export const outputLanguageName = (): string => (getLocale() === 'tr' ? 'Türkisch' : 'Deutsch');

/** Anweisung, die an einen Prompt angehängt wird. Für Deutsch leer (Default-Verhalten). */
export const outputLangDirective = (): string =>
  getLocale() === 'tr'
    ? '\n\nWICHTIG: Alle für den Nutzer sichtbaren Texte (Fragen, Antworten, Erklärungen, Feedback, Titel, Zusammenfassungen) auf Türkisch verfassen. Alle Struktur-Tokens, JSON-Schlüssel und vorgegebenen Kategorie-Werte bleiben exakt unverändert wie vorgegeben.'
    : '';

/**
 * Erklärer-Abschnittsüberschriften je Sprache. Der markdownRenderer erkennt beide
 * Varianten; der Prompt gibt der KI die passende Menge vor.
 */
export const explainerHeadings = (): string =>
  getLocale() === 'tr' ? 'Temel Bilgiler, Derinlemesine ve Bağlam' : 'Grundlagen, Vertiefung und Kontext';
