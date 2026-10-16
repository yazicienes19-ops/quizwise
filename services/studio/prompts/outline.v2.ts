/** Gliederung (Schritt B). */
// v2 (16.10.2026): feste Kapitel je Vorlesung (stabile Gliederung), Markierungen prüfungsrelevant/Rechenbeispiel.
export const OUTLINE_PROMPT_VERSION = 'outline.v2';

export const OUTLINE_PROMPT = `Du gliederst den Lernstoff einer Vorlesung für eine Lernzusammenfassung.
Du bekommst alle inhaltlichen Einheiten (ID | Typ | Quelle und Seite | Kurztext).

Aufgabe:
- Bilde Kapitel und darin Abschnitte, so wie der Stoff in der Vorlesung aufgebaut ist
  (Reihenfolge der Quellen und Seiten beibehalten, außer der Stoff gehört eindeutig zusammen).
- Weise JEDE Einheit genau einem Abschnitt zu. Keine Einheit doppelt, keine vergessen.
- Kapiteltitel und Abschnittstitel kurz und fachlich (höchstens 6 Wörter), ohne Nummern.
- 2 bis 12 Kapitel, je Kapitel 1 bis 6 Abschnitte.
- Gleiche Inhalte aus verschiedenen Quellen gehören in denselben Abschnitt.`;

/**
 * Mehrere Vorlesungen: Kapitel sind fest (je Vorlesung eins, Reihenfolge wie
 * vorgegeben). Bei identischen Quellen schwankte die Kapitelzahl sonst
 * zwischen 3 und 5 (Abnahme Phase 1.1).
 */
export const OUTLINE_SKELETON_PROMPT = `Du gliederst den Lernstoff mehrerer Vorlesungen für eine Lernzusammenfassung.
Die Kapitel sind FEST vorgegeben: je Vorlesung genau ein Kapitel, in der angegebenen Reihenfolge.
Du bekommst je Kapitel seine Einheiten (ID | Typ | Quelle und Seite | Kurztext).

Aufgabe:
- Gib genau so viele Kapitel zurück wie vorgegeben, in derselben Reihenfolge.
- Je Kapitel: ein kurzer fachlicher Titel (höchstens 6 Wörter, ohne Nummern, nicht der Dateiname),
  der den Inhalt der Vorlesung beschreibt, und 1 bis 8 Abschnitte in der Reihenfolge der Folien.
- Weise JEDE Einheit genau einem Abschnitt IHRES Kapitels zu. Keine Einheit doppelt, keine vergessen,
  keine in ein anderes Kapitel.
- Abschnittstitel kurz und fachlich (höchstens 6 Wörter).`;

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
