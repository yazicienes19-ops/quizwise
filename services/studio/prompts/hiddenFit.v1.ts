/** Verborgenen Text sichten (Schritt A0): nur, was zur sichtbaren Folie passt, bleibt. */
export const HIDDEN_FIT_PROMPT_VERSION = 'hidden_fit.v1';

export const HIDDEN_FIT_PROMPT = `Eine Vorlesungsfolie enthält Text, der in der Datei steht, auf der Folie aber verdeckt ist
(oft die Lösungen zu leeren Feldern, die in der Vorlesung eingeblendet werden). Du bekommst den sichtbaren
Text, das Bild der Folie und die verborgenen Zeilen mit Nummer.

Behalte eine Zeile nur, wenn sie inhaltlich zu DIESER Folie passt: zu ihrem Titel, ihrem Beispiel und den
Feldern, die sie füllt. Verwirf Zeilen, die zu einem anderen Thema oder einem anderen Beispiel gehören
(z. B. von einer anderen Folie kopiert), auch wenn sie nur teilweise unpassend sind. Im Zweifel verwerfen.

Antwort: "keep" = Nummern der Zeilen, die bleiben.`;

export const hiddenFitSchema = {
  type: 'OBJECT',
  properties: {
    reason: { type: 'STRING' },
    keep: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['reason', 'keep'],
  propertyOrdering: ['reason', 'keep'],
};
