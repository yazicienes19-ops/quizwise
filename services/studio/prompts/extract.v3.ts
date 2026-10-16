/** Extraktion je Quelle (Schritt A). Die Version fließt in den Cache-Schlüssel ein. */
// v2 (16.10.2026): year als Text statt Zahl (Ziffernschleifen im Zahlenfeld), feste Feldreihenfolge.
// v3 (16.10.2026): practice_question, illustrative (Rechenbeispiele sind keine Befunde), Definitionen je
// Autor getrennt, schärfere Aufgaben-Definition, Folienfehler nie stillschweigend korrigieren.
export const EXTRACT_PROMPT_VERSION = 'extract.v3';

export const EXTRACT_PROMPT = `Du extrahierst Lernstoff aus einer Vorlesungsquelle. Du bekommst Seiten mit Seitennummer
(Text und ggf. Bildbeschreibung). Gib pro Seite alle inhaltlichen Einheiten zurück.

Typen:
- definition | concept | study | finding | example | list | comparison
- task        Arbeitsauftrag an die Studierenden, den sie selbst erledigen sollen (Übung, Selbststudium,
              Recherche, Gruppenarbeit, Folie hochladen). KEINE Aufgabe: Anweisungen für eine Demo im
              Hörsaal ("Zählen Sie, wie oft …" beim Video), die Beschreibung eines Experiments oder
              einer Versuchsaufgabe aus einer Studie (das ist study).
- practice_question  Frage zum Selbsttest von einer Quiz- oder Wiederholungsfolie ("Was sind die Ziele
              der Psychologie?", "Welcher Effekt trifft hier zu?"). Frage in "text", die Antwort in
              "answer", wenn sie auf der Folie steht. Nie als exam_info.
- exam_info   Klausurformat, Bewertung, Learning Outcomes, Aufgabentypen der Prüfung
- organizational (Termine, Räume, Vorstellungsrunde, Literaturlisten; wird später verworfen)
- figure      (Diagramm/Modell: was es zeigt; Werte nur, wenn eindeutig beschriftet)
- source_error offensichtlicher Fehler auf der Folie, z. B. ein Satz, der zu einem anderen Beispiel
              gehört als der Folientitel (kopierte Hypothese), oder ein Widerspruch auf derselben Folie.

Regeln:
- Nur was auf der Seite steht. Nichts ergänzen, nichts aus Allgemeinwissen.
- Folienfehler NIE stillschweigend korrigieren oder weglassen: den Inhalt so übernehmen, wie er dasteht,
  und zusätzlich eine Einheit source_error, die den Fehler beschreibt.
- Zahlen exakt mit Einheit übernehmen.
- Ausgedachte Werte (Szenarien, Rechenbeispiele, "angenommen …", Illustrationen einer Methode wie
  "M = 40 vs. M = 55" zur Erklärung einer Methode) sind type "example" mit "illustrative": true,
  nie finding und nie das Ergebnis einer Studie. finding nur für echte, berichtete Befunde.
- Studien: authors, year (vier Ziffern als Text, z. B. "1999"), design, result, conclusion, soweit auf der
  Seite vorhanden. Nennt eine Einheit mehrere Studien, gehört in authors/year nur die Hauptstudie.
- Ordnet die Folie verschiedenen Autoren je eine eigene Definition zu (z. B. "… (Myers, 2008)",
  "… (Zimbardo, 1988)"), dann je Autor eine eigene definition mit authors und year. Nie verschmelzen.
- Seiten ohne Inhalt (Titel, Literaturliste, leere Folie) liefern keine Einheiten.
- Text knapp, aber vollständig; nie mitten im Satz abbrechen.
- "page" ist immer die Nummer aus der Marke [Seite p] der Seite, von der die Einheit stammt.
- "title": kurzes Stichwort (höchstens 8 Wörter), z. B. der Begriff oder "Simons & Chabris (1999)".`;

const S = { type: 'STRING' } as const;

const UNIT_PROPS = {
  page: { type: 'INTEGER' },
  type: {
    type: 'STRING',
    enum: ['definition', 'concept', 'study', 'finding', 'example', 'list', 'comparison', 'task', 'practice_question', 'exam_info', 'organizational', 'figure', 'source_error'],
  },
  title: S,
  text: S,
  illustrative: { type: 'BOOLEAN' },
  answer: S,
  authors: S,
  year: { type: 'STRING', description: 'Jahr mit vier Ziffern, z. B. "1999"; leer lassen, wenn die Seite keins nennt' },
  design: S,
  result: S,
  conclusion: S,
};

export const extractSchema = {
  type: 'OBJECT',
  properties: {
    units: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: UNIT_PROPS,
        required: ['page', 'type', 'text'],
        propertyOrdering: Object.keys(UNIT_PROPS),
      },
    },
  },
  required: ['units'],
};
