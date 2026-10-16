/** Gliederung (Schritt B). */
export const OUTLINE_PROMPT_VERSION = 'outline.v1';

export const OUTLINE_PROMPT = `Du gliederst den Lernstoff einer Vorlesung für eine Lernzusammenfassung.
Du bekommst alle inhaltlichen Einheiten (ID | Typ | Quelle und Seite | Kurztext).

Aufgabe:
- Bilde Kapitel und darin Abschnitte, so wie der Stoff in der Vorlesung aufgebaut ist
  (Reihenfolge der Quellen und Seiten beibehalten, außer der Stoff gehört eindeutig zusammen).
- Weise JEDE Einheit genau einem Abschnitt zu. Keine Einheit doppelt, keine vergessen.
- Kapiteltitel und Abschnittstitel kurz und fachlich (höchstens 6 Wörter), ohne Nummern.
- 2 bis 12 Kapitel, je Kapitel 1 bis 6 Abschnitte.
- Gleiche Inhalte aus verschiedenen Quellen gehören in denselben Abschnitt.`;

export const outlineSchema = {
  type: 'OBJECT',
  properties: {
    chapters: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING' },
          sections: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                title: { type: 'STRING' },
                unitIds: { type: 'ARRAY', items: { type: 'STRING' } },
              },
              required: ['title', 'unitIds'],
            },
          },
        },
        required: ['title', 'sections'],
      },
    },
  },
  required: ['chapters'],
};
