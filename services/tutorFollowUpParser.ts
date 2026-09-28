import { stripSourceQuoteLine } from './sourceQuoteParser';

/**
 * Extrahiert die "**Weiterfragen:** frage1 | frage2 | frage3"-Zeile, die chatWithTutor
 * (Modus "explain") als eine der letzten Zeilen der Antwort anhängt. Robust gegen
 * Formatierungs-Drift: die Zeile muss nicht die LETZTE der Antwort sein (das Modell hängt
 * z.B. gelegentlich noch eine Quelle-Zeile danach an, oder verdoppelt die Marker-Zeile mit
 * der Platzhalter-Anweisung aus dem Prompt selbst — beides real beobachtet, s. Tutor-Eval
 * vom 2026-09-07). Es wird von hinten nach vorne gesucht und die ERSTE (= unterste, damit
 * neueste) Treffer-Zeile verwendet. Nur an eine EIGENE Zeile verankert, damit ein
 * "Weiterfragen:" mitten im Fließtext nicht fälschlich als Marker erkannt wird.
 * "Follow-ups"/"Devam" werden zusätzlich akzeptiert, falls das Modell den Marker trotz
 * Anweisung übersetzt.
 */
const FOLLOWUP_LINE_RE = /^\*{0,2}(?:Weiterfragen|Follow-ups|Devam)\*{0,2}:\*{0,2}\s*(.+)$/;

export function extractFollowUps(markdown: string): string[] | null {
  const lines = markdown.split('\n').map(l => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const match = lines[i].match(FOLLOWUP_LINE_RE);
    if (!match) continue;
    const items = match[1]
      .split('|')
      .map(q => q.replace(/^[-*\d.\s]+/, '').trim())
      .filter(q => q.length > 0)
      .slice(0, 3);
    return items.length > 0 ? items : null;
  }
  return null;
}

/**
 * Entfernt JEDE Zeile, die dem Weiterfragen-Marker entspricht (nicht nur die letzte) —
 * damit eine doppelte/verwaiste Marker-Zeile (z.B. die vom Modell versehentlich mit
 * ausgegebene Platzhalter-Anweisung "frage1 | frage2 | frage3") nie im für den Nutzer
 * sichtbaren Text zurückbleibt. Die Vorschläge werden als eigene Chips unter der
 * Nachricht dargestellt, nicht als Text.
 */
export function stripFollowUpLine(markdown: string): string {
  if (extractFollowUps(markdown) === null) return markdown;
  return markdown
    .split('\n')
    .filter(line => !FOLLOWUP_LINE_RE.test(line.trim()))
    .join('\n')
    // Entfernen einer Zeile MITTEN im Text kann zwei umgebende Leerzeilen zu einer
    // Dreifach-Leerzeile verschmelzen lassen — auf normale Absatztrennung reduzieren.
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * "**Denkweg:** schritt1 | schritt2 | schritt3" — hängt chatWithTutor nur mit dem
 * Schalter "Nachdenken" an. Bewusst eine selbst formulierte Zeile statt Geminis
 * eingebauter Gedanken (includeThoughts): die kommen immer auf Englisch und reden
 * über den Prompt selbst ("the 3-sentence constraint"), getestet 2026-09-28.
 */
const REASONING_LINE_RE = /^\*{0,2}(?:Denkweg|Reasoning|Düşünce yolu)\*{0,2}:\*{0,2}\s*(.+)$/i;

export function extractReasoning(markdown: string): string[] | null {
  const lines = markdown.split('\n').map(l => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const match = lines[i].match(REASONING_LINE_RE);
    if (!match) continue;
    const steps = match[1]
      .split('|')
      .map(q => q.replace(/^[-*\d.\s]+/, '').replace(/\*+$/, '').trim())
      .filter(q => q.length > 0)
      .slice(0, 5);
    return steps.length > 0 ? steps : null;
  }
  return null;
}

export function stripReasoningLine(markdown: string): string {
  if (!markdown.split('\n').some(line => REASONING_LINE_RE.test(line.trim()))) return markdown;
  return markdown
    .split('\n')
    .filter(line => !REASONING_LINE_RE.test(line.trim()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Nachbearbeitung einer rohen Tutor-Antwort: entfernt defensiv zuerst eine eventuell
 * vorhandene Quelle-Zeile (unabhängig davon, ob der Aufrufer includeSourceQuote gesetzt
 * hatte — das Modell hängt sie manchmal auch ungefragt an, s. GraphLearningOverlay-Bug
 * vom 2026-09-07) und extrahiert danach Fließtext und Weiterfragen getrennt. Ruft ein
 * Aufrufer zusätzlich selbst extractSourceQuote/stripSourceQuoteLine vorher auf (wie
 * ExplainerSystem.tsx, um das Zitat separat anzuzeigen), ist das unschädlich — die
 * zweite Anwendung auf bereits quellenfreien Text ist ein No-op.
 */
export function parseTutorResponse(markdown: string): {
  content: string;
  followUps: string[] | null;
  reasoning: string[] | null;
} {
  const withoutQuote = stripSourceQuoteLine(markdown);
  const reasoning = extractReasoning(withoutQuote);
  const withoutReasoning = stripReasoningLine(withoutQuote);
  const followUps = extractFollowUps(withoutReasoning);
  const content = stripFollowUpLine(withoutReasoning).trim();
  return { content, followUps, reasoning };
}
