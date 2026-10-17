/** Übungsfragen aus der Vorlesung aufbereiten (nach Schritt C, für alle Formate). */
// v1 (17.10.2026): Teilfragen bündeln, jede Frage mit Antwort, Lückentexte beschriftet, Folienfehler raus.
export const PRACTICE_PROMPT_VERSION = 'practice.v1';

export const PRACTICE_PROMPT = `Du bereitest die Übungsfragen einer Vorlesung für Studierende auf. Du bekommst die Fragen
(ID, Seite, Text, Antwort der Folie falls vorhanden), den Stoff der Folien rund um jede Frage und bestätigte
Folienfehler. Gib die fertige Liste zurück.

Regeln:
1. Übungsfragen sind Fragen oder Aufgaben, mit denen man den Stoff prüft oder anwendet. Rhetorische
   Einstiegsfragen, die nur zum Thema hinführen und sich ohne den Stoff beantworten lassen, sind KEINE
   Übungsfragen: lass sie weg.
2. Mehrere Teilfragen, die denselben Fall aus verschiedenen Perspektiven, Theorien oder Ansätzen betrachten
   (je Ansatz eine Frage), werden EINE Frage: „Wie erklären die Ansätze … den Fall?“. Die Antwort ordnet
   jedem Ansatz seine Leitfrage oder Erklärung zu, im Format „Ansatz: Erklärung“ je Zeile.
3. Jede Frage bekommt eine Antwort.
   - Steht die Antwort auf der Folie (Feld „Antwort“ oder im Stoff), übernimm sie sinngemäß vollständig:
     answerFromSlide = true.
   - Sonst schreibe eine kurze Antwort NUR aus dem mitgelieferten Stoff, ohne neue Fakten, Zahlen,
     Autoren oder Jahre: answerFromSlide = false.
   - Die Antwort wiederholt nie die Frage. Eine Antwort wie „Ja Nein“ ohne Begründung reicht nicht.
4. Lückentexte und Ergänzungsaufgaben (z. B. „Ergänze A, B und C“): Die Antwort nennt jedes Feld
   beschriftet („A: …“, je Feld eine Zeile). Steht die Lösung auf einer Folie danach (z. B. die
   Hypothese im Stoff), nimm genau diese Formulierung.
5. Bestätigte Folienfehler: Textteile, die ein Folienfehler als versehentlich übernommen beschreibt,
   gehören weder in die Frage noch in die Antwort. Lass sie weg; ist die Frage ohne sie sinnlos, lass
   die ganze Frage weg.
6. Frage und Antwort in ganzen Sätzen, Deutsch, Fachbegriffe wie auf der Folie. Kein Markdown außer **…**.
7. "units": die IDs der Fragen, aus denen der Eintrag entsteht (bei gebündelten Fragen alle).
8. Reihenfolge wie in der Vorlesung.`;

export const practiceSchema = {
  type: 'OBJECT',
  properties: {
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          units: { type: 'ARRAY', items: { type: 'STRING' } },
          question: { type: 'STRING' },
          answer: { type: 'STRING' },
          answerFromSlide: { type: 'BOOLEAN' },
        },
        required: ['units', 'question', 'answer', 'answerFromSlide'],
      },
    },
  },
  required: ['items'],
};
