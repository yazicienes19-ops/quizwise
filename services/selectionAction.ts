// Welche Aktion die Textauswahl-Leiste im PDF-Reader vorschlägt, rein aus dem
// Umfang der Markierung abgeleitet — der Nutzer soll nie selbst wählen müssen:
// ein einzelner Begriff will erklärt werden, ein Satz/Abschnitt eine Antwort,
// eine lange Passage eine Zusammenfassung.
export type SelectionAction = 'term' | 'ask' | 'summarize';

export const SELECTION_TERM_MAX_WORDS = 3;
export const SELECTION_ASK_MAX_WORDS = 50;

export function detectSelectionAction(text: string): SelectionAction {
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount <= SELECTION_TERM_MAX_WORDS) return 'term';
  if (wordCount <= SELECTION_ASK_MAX_WORDS) return 'ask';
  return 'summarize';
}
