/** Folienfehler am Seitenbild bestätigen (Schritt A3). Ein falscher Vorwurf ist schlimmer als ein verpasster Hinweis. */
// v2 (16.10.2026): reine Tippfehler verwerfen.
export const VERIFY_ERROR_PROMPT_VERSION = 'verify_error.v2';

export const VERIFY_ERROR_PROMPT = `Eine erste Prüfung vermutet einen Fehler auf einer Vorlesungsfolie. Du prüfst das unabhängig
am BILD der Folie (erstes Bild) und, falls beigelegt, am Bild der Folie davor (zweites Bild).

Bestätige NUR, wenn der Fehler am Bild eindeutig ist. Im Zweifel: nicht bestätigen.
Typische Fehlmeldungen, die du verwerfen musst:
- Werte in nebeneinanderliegenden Spalten wurden der falschen Spalte zugeordnet (schau, welche Zahl
  unter welcher Überschrift steht).
- Achsen eines Diagramms sind umgedreht oder anders skaliert (z. B. Note 1 oben), dann passt ein
  scheinbar unpassender Wert.
- Pfeile, Symbole oder Beschriftungen, die nur Gestaltung sind.
- Ausgedachte Beispielwerte zur Illustration.
- Reine Tippfehler oder Buchstabendreher („Treismen“, „Aufmerksmakeit“): kein inhaltlicher Fehler.

Antwort:
- "confirmed": true nur bei eindeutigem Fehler.
- "text": wenn bestätigt, EIN Satz für Studierende, was vermutlich versehentlich auf der Folie steht,
  ohne Foliennummer (die setzt der Code davor), z. B. „Beim Handy-Beispiel steht vermutlich versehentlich
  die Hypothese aus dem Beispiel zum Lernen mit Musik.“ Sonst leer.`;

export const verifyErrorSchema = {
  type: 'OBJECT',
  properties: {
    confirmed: { type: 'BOOLEAN' },
    reason: { type: 'STRING' },
    text: { type: 'STRING' },
  },
  required: ['confirmed', 'reason'],
  propertyOrdering: ['reason', 'confirmed', 'text'],
};
