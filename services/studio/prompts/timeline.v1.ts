/** Zeitleiste (Schritt C2): Themenstrang wählen, je Eintrag einen kurzen Satz schreiben. */
export const TIMELINE_PROMPT_VERSION = 'timeline.v1';

export const TIMELINE_PROMPT = `Du baust die Zeitleiste einer Lernzusammenfassung. Du bekommst datierte Quellenangaben
(ID | Autor | Jahr | Thema der Folie | Text der Einheit).

Aufgabe:
- Wähle EINEN Themenstrang: die Entwicklung der Theorien und Kernbefunde des Hauptthemas, um das sich die
  meisten Einträge drehen. Lass Beispielstudien zur Illustration einer Methode, Studien zu Urteilsfehlern
  oder Effekten als bloße Beispiele und Literaturhinweise weg, wenn sie nicht zu diesem Strang gehören.
- Für jeden gewählten Eintrag: "id" und "what": EIN kurzer Satz (höchstens 15 Wörter), was diese Arbeit
  zum Strang beiträgt. Ohne Autor und Jahr (die stehen schon davor), nur aus dem Text der Einheit,
  nichts ergänzen. Kein roher Folientext, keine Stichpunkte.
- "topic": der Themenstrang in höchstens 5 Wörtern.`;

export const timelineSchema = {
  type: 'OBJECT',
  properties: {
    topic: { type: 'STRING' },
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { id: { type: 'STRING' }, what: { type: 'STRING' } },
        required: ['id', 'what'],
        propertyOrdering: ['id', 'what'],
      },
    },
  },
  required: ['topic', 'items'],
  propertyOrdering: ['topic', 'items'],
};
