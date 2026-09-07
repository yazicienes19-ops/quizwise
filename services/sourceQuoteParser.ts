/**
 * Extrahiert das "Quelle: "..."" Zitat, das generateExplanation(..., includeSourceQuote=true)
 * als Schlusszeile der Antwort anhängt. Robust gegen Formatierungs-Drift des Modells:
 * "**Quelle:**", "*Quelle:*", "Quelle:" (ganz ohne Markdown) und "**Quelle**:" werden alle
 * akzeptiert, und die Zeile muss nicht die LETZTE der Antwort sein (das Modell hängt manchmal
 * noch die Weiterfragen-Zeile oder einen weiteren Absatz danach an — s. Bug vom 2026-09-07,
 * Wissensnetz-Coach-Testlauf). Nur an eine EIGENE Zeile verankert (^...$ auf der getrimmten
 * Zeile), damit ein "Quelle:" mitten im Fließtext nicht fälschlich als Marker erkannt wird.
 */
const QUOTE_LINE_RE = /^\*{0,2}(?:Quelle|Kaynak)\*{0,2}:\*{0,2}\s*[""]?(.+?)[""]?$/;

export function extractSourceQuote(markdown: string): string | null {
  const lines = markdown.split('\n').map(l => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const match = lines[i].match(QUOTE_LINE_RE);
    if (match) {
      // Trailing "**" der schließenden Fett-Markierung kann bei leerem Zitat als 1
      // übrig gebliebenes "*" ins Capture-Group rutschen (Regex-Backtracking) — daher
      // führende/schließende Sternchen-Läufe am Rand vor der Leer-Prüfung entfernen.
      const quote = match[1].replace(/^\*+|\*+$/g, '').trim();
      return quote.length > 0 ? quote : null;
    }
  }
  return null;
}

/**
 * Entfernt JEDE Zeile, die dem Quelle-Marker entspricht (nicht nur die letzte) — damit
 * bei einer untypischen Reihenfolge oder einem zusätzlichen Absatz danach keine rohe
 * "Quelle:"-Zeile im für den Nutzer sichtbaren Text zurückbleibt.
 */
export function stripSourceQuoteLine(markdown: string): string {
  if (extractSourceQuote(markdown) === null) return markdown;
  return markdown
    .split('\n')
    .filter(line => !QUOTE_LINE_RE.test(line.trim()))
    .join('\n')
    // Entfernen einer Zeile MITTEN im Text kann zwei umgebende Leerzeilen zu einer
    // Dreifach-Leerzeile verschmelzen lassen — auf normale Absatztrennung reduzieren.
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
