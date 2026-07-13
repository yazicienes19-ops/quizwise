export interface PassageMatch {
  start: number;
  end: number;
  text: string;
}

/**
 * Sucht ein Zitat im Kapiteltext. Exakter Substring-Match zuerst; falls das
 * Zitat durch reflowte Zeilenumbrüche/mehrfache Leerzeichen im Original nicht
 * 1:1 vorkommt, ein whitespace-toleranter Regex-Fallback. Kein Treffer ist
 * kein Fehler — das Highlight ist rein kosmetisch, die Antwort bleibt gültig.
 */
export function findQuoteInChapter(quote: string, chapterText: string): PassageMatch | null {
  const trimmedQuote = quote.trim();
  if (!trimmedQuote || !chapterText) return null;

  const exactIndex = chapterText.indexOf(trimmedQuote);
  if (exactIndex !== -1) {
    return { start: exactIndex, end: exactIndex + trimmedQuote.length, text: trimmedQuote };
  }

  const escaped = trimmedQuote.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const flexible = escaped.replace(/\s+/g, '\\s+');
  let match: RegExpExecArray | null;
  try {
    match = new RegExp(flexible).exec(chapterText);
  } catch {
    return null;
  }
  if (!match) return null;
  return { start: match.index, end: match.index + match[0].length, text: match[0] };
}
