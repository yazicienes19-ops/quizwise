/**
 * Extrahiert die "**Weiterfragen:** frage1 | frage2 | frage3"-Zeile, die
 * chatWithTutor (Modus "explain") als eine der letzten Zeilen der Antwort
 * anhängt. Wie beim Quellen-Zitat nur an die letzte nicht-leere Zeile
 * verankert, damit ein "Weiterfragen:" mitten im Fließtext nicht fälschlich
 * als Marker erkannt wird. "Follow-ups"/"Devam" werden zusätzlich akzeptiert,
 * falls das Modell den Marker trotz Anweisung übersetzt.
 */
export function extractFollowUps(markdown: string): string[] | null {
  const lines = markdown.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;
  const lastLine = lines[lines.length - 1];
  const match = lastLine.match(/^\*\*(?:Weiterfragen|Follow-ups|Devam):\*\*\s*(.+)$/);
  if (!match) return null;
  const items = match[1]
    .split('|')
    .map(q => q.replace(/^[-*\d.\s]+/, '').trim())
    .filter(q => q.length > 0)
    .slice(0, 3);
  return items.length > 0 ? items : null;
}

/**
 * Entfernt die "**Weiterfragen:** …"-Zeile aus der Antwort — die Vorschläge
 * werden als eigene Chips unter der Nachricht dargestellt, nicht als Text.
 */
export function stripFollowUpLine(markdown: string): string {
  if (extractFollowUps(markdown) === null) return markdown;
  const lines = markdown.split('\n');
  let last = lines.length - 1;
  while (last >= 0 && !lines[last].trim()) last--;
  return lines.slice(0, last).join('\n').trimEnd();
}

/**
 * Nachbearbeitung einer Tutor-Antwort OHNE Quellen-Zeile (der Aufrufer wendet
 * vorher stripSourceQuoteLine/extractSourceQuote an — die Quelle steht als
 * letzte Zeile, Weiterfragen davor): liefert den bereinigten Fließtext und
 * die Follow-up-Vorschläge getrennt zurück.
 */
export function parseTutorResponse(markdown: string): {
  content: string;
  followUps: string[] | null;
} {
  const followUps = extractFollowUps(markdown);
  const content = stripFollowUpLine(markdown).trim();
  return { content, followUps };
}
