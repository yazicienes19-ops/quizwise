// Ausgabesprache für KI-Texte, die das Backend selbst erzeugt (Lerndigest,
// YouTube-Skript). Das Frontend schickt seine Oberflächensprache mit
// (getLocale(): 'de' | 'en' | 'tr'). Bis 23.09.2026 kannte das Backend nur
// de/tr, englische Nutzer bekamen ihre Analysen auf Deutsch.
const LANG_LINES = { de: 'auf Deutsch', en: 'auf Englisch', tr: 'auf Türkisch' };

const normalizeLanguage = (value) => (Object.hasOwn(LANG_LINES, value) ? value : 'de');

const languageLine = (language) => LANG_LINES[normalizeLanguage(language)];

module.exports = { normalizeLanguage, languageLine };
