import { getLocale } from '../i18n';

/**
 * KI-Ausgabesprache. Das Prompt-Gerüst bleibt deutsch — nur die Sprache der
 * für den Nutzer sichtbaren Ausgabe wird umgeschaltet. Gemini folgt der
 * Anweisung zuverlässig, deshalb müssen die ~19 Prompts nicht dupliziert werden.
 *
 * WICHTIG: Struktur-Tokens (__LÜCKE__, [LÜCKE], Kategorie-Enums, **Quelle:**,
 * Allgemeinwissen:) bleiben sprachunabhängig — sie sind Protokoll, keine UI.
 */
const LANGUAGE_NAMES: Record<string, string> = { tr: 'Türkisch', en: 'Englisch' };
export const outputLanguageName = (): string => LANGUAGE_NAMES[getLocale()] ?? 'Deutsch';

/** Anweisung, die an einen Prompt angehängt wird. Für Deutsch leer (Default-Verhalten). */
export const outputLangDirective = (): string => {
  const lang = LANGUAGE_NAMES[getLocale()];
  return lang
    ? `\n\nWICHTIG: Alle für den Nutzer sichtbaren Texte (Fragen, Antworten, Erklärungen, Feedback, Titel, Zusammenfassungen) auf ${lang} verfassen. Alle Struktur-Tokens, JSON-Schlüssel und vorgegebenen Kategorie-Werte bleiben exakt unverändert wie vorgegeben.`
    : '';
};

/**
 * Erklärer-Abschnittsüberschriften je Sprache. Der markdownRenderer erkennt alle
 * Varianten; der Prompt gibt der KI die passende Menge vor.
 */
const EXPLAINER_HEADINGS: Record<string, string> = {
  tr: 'Temel Bilgiler, Derinlemesine ve Bağlam',
  en: 'Basics, Deep Dive and Context',
};
export const explainerHeadings = (): string => EXPLAINER_HEADINGS[getLocale()] ?? 'Grundlagen, Vertiefung und Kontext';
