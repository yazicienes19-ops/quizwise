/** Extraktion je Quelle (Schritt A). Die Version fließt in den Cache-Schlüssel ein. */
// v2 (16.10.2026): year als Text statt Zahl (Ziffernschleifen im Zahlenfeld), feste Feldreihenfolge.
export const EXTRACT_PROMPT_VERSION = 'extract.v2';

export const EXTRACT_PROMPT = `Du extrahierst Lernstoff aus einer Vorlesungsquelle. Du bekommst Seiten mit Seitennummer
(Text und ggf. Bildbeschreibung). Gib pro Seite alle inhaltlichen Einheiten zurück.

Typen:
- definition | concept | study | finding | example | list | comparison
- task        (Aufgaben, Übungen, Selbststudium, Rechercheaufträge)
- exam_info   (Klausurformat, Bewertung, Learning Outcomes, Aufgabentypen)
- organizational (Termine, Räume, Vorstellungsrunde, Literaturlisten; wird später verworfen)
- figure      (Diagramm/Modell: was es zeigt; Werte nur, wenn eindeutig beschriftet)
- source_error (offensichtlicher Fehler oder Widerspruch auf der Folie, z. B. falsch
               kopierter Text, der nicht zum Folientitel passt)

Regeln:
- Nur was auf der Seite steht. Nichts ergänzen, nichts aus Allgemeinwissen.
- Zahlen exakt mit Einheit übernehmen.
- Studien: authors, year (vier Ziffern als Text, z. B. "1999"), design, result, conclusion, soweit auf der
  Seite vorhanden. Nennt eine Einheit mehrere Studien, gehört in authors/year nur die Hauptstudie.
- Seiten ohne Inhalt (Titel, Literaturliste, leere Folie) liefern keine Einheiten.
- Text knapp, aber vollständig; nie mitten im Satz abbrechen.
- "page" ist immer die Nummer aus der Marke [Seite p] der Seite, von der die Einheit stammt.
- "title": kurzes Stichwort (höchstens 8 Wörter), z. B. der Begriff oder "Simons & Chabris (1999)".`;

const S = { type: 'STRING' } as const;

const UNIT_PROPS = {
  page: { type: 'INTEGER' },
  type: {
    type: 'STRING',
    enum: ['definition', 'concept', 'study', 'finding', 'example', 'list', 'comparison', 'task', 'exam_info', 'organizational', 'figure', 'source_error'],
  },
  title: S,
  text: S,
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
