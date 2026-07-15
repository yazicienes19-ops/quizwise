/**
 * Extrahiert das "**Quelle:** "..."" Zitat, das generateExplanation(..., includeSourceQuote=true)
 * als letzte Zeile der Antwort anhängt. Nur an die letzte nicht-leere Zeile verankert,
 * damit ein "Quelle:" mitten im Fließtext nicht fälschlich als Marker erkannt wird.
 */
export function extractSourceQuote(markdown: string): string | null {
  const lines = markdown.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;
  const lastLine = lines[lines.length - 1];
  // Der Prompt gibt "**Quelle:**" als stabiles Token vor; "Kaynak" wird zusätzlich
  // akzeptiert, falls das Modell den Marker doch übersetzt.
  const match = lastLine.match(/^\*\*(?:Quelle|Kaynak):\*\*\s*[""]?(.+?)[""]?$/);
  if (!match) return null;
  const quote = match[1].trim();
  return quote.length > 0 ? quote : null;
}

/**
 * Entfernt die "**Quelle:** …"-Schlusszeile aus der Antwort — für Ansichten,
 * die das Zitat separat darstellen (z.B. als Quellen-Karte im PDF-Reader)
 * statt es doppelt im Antworttext zu zeigen.
 */
export function stripSourceQuoteLine(markdown: string): string {
  if (extractSourceQuote(markdown) === null) return markdown;
  const lines = markdown.split('\n');
  let last = lines.length - 1;
  while (last >= 0 && !lines[last].trim()) last--;
  return lines.slice(0, last).join('\n').trimEnd();
}
