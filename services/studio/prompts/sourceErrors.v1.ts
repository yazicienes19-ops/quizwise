/** Folienfehler suchen (Schritt A2, über den Rohtext der Seiten). */
// v2: neutrales Beispiel (nicht aus den Testfolien), nur sichtbarer Text.
export const SOURCE_ERRORS_PROMPT_VERSION = 'source_errors.v2';

export const SOURCE_ERRORS_PROMPT = `Du prüfst Vorlesungsfolien auf offensichtliche Fehler der Folie selbst. Du bekommst den
Rohtext der Seiten mit Seitennummer.

Melde nur:
- einen Satz, der nicht zum Thema oder Beispiel der Folie passt, weil er offenbar von einer anderen
  Folie kopiert wurde (z. B. die Hypothese eines anderen Beispiels),
- einen Widerspruch innerhalb derselben Folie,
- einen offensichtlichen Fehler bei Zahl, Name oder Jahr, der der Folie selbst widerspricht.

Nicht melden: Stil, Tippfehler und Buchstabendreher, Kürzel, unvollständige Stichpunkte, inhaltliche Kritik
an Theorien, Inhalte, die nur auf einer anderen Folie stehen.

Je Fehler: "page" (Nummer aus der Marke [Seite p]) und "text": ein vollständiger Satz für Studierende,
z. B. „Auf Folie 12 steht vermutlich versehentlich die Hypothese aus einem anderen Beispiel statt der zum Folientitel passenden.“ Leere Liste, wenn es keine gibt.`;

export const sourceErrorsSchema = {
  type: 'OBJECT',
  properties: {
    errors: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { page: { type: 'INTEGER' }, text: { type: 'STRING' } },
        required: ['page', 'text'],
        propertyOrdering: ['page', 'text'],
      },
    },
  },
  required: ['errors'],
};
