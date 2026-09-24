/**
 * Lückentext-Karten (Cloze) in Ankis Schreibweise: {{c1::Antwort}} oder
 * {{c1::Antwort::Hinweis}}; {{Antwort}} ohne Nummer geht auch. Beim Lernen
 * steht an der Stelle eine Lücke, beim Aufdecken die Antwort. Anki-Exporte
 * mit Lückentext lassen sich damit unverändert importieren.
 */

export type ClozeSegment =
  | { kind: 'text'; text: string }
  | { kind: 'cloze'; answer: string; hint?: string };

const CLOZE_RE = /\{\{(?:c\d+::)?([^{}]+?)(?:::([^{}]+?))?\}\}/g;

export const hasCloze = (text: string): boolean => {
  CLOZE_RE.lastIndex = 0;
  const found = CLOZE_RE.test(text);
  CLOZE_RE.lastIndex = 0;
  return found;
};

export const parseCloze = (text: string): ClozeSegment[] => {
  const segments: ClozeSegment[] = [];
  let last = 0;
  for (const m of text.matchAll(CLOZE_RE)) {
    const start = m.index ?? 0;
    if (start > last) segments.push({ kind: 'text', text: text.slice(last, start) });
    const answer = m[1].trim();
    const hint = m[2]?.trim();
    segments.push(hint ? { kind: 'cloze', answer, hint } : { kind: 'cloze', answer });
    last = start + m[0].length;
  }
  if (last < text.length) segments.push({ kind: 'text', text: text.slice(last) });
  return segments;
};

/** Klartext mit ausgefüllten Lücken, z. B. für Suche, Quiz aus Stapel und Zusammenfassungen. */
export const clozeToPlain = (text: string): string =>
  parseCloze(text).map(s => (s.kind === 'text' ? s.text : s.answer)).join('');

/** Nächste freie Lücken-Nummer im Text (c1, c2, ...). */
export const nextClozeNumber = (text: string): number => {
  const nums = [...text.matchAll(/\{\{c(\d+)::/g)].map(m => Number(m[1]));
  return nums.length ? Math.max(...nums) + 1 : 1;
};

/** Markierten Bereich [start, end) in eine Lücke verwandeln. Leere Auswahl: Platzhalter einfügen. */
export const wrapCloze = (text: string, start: number, end: number): { text: string; cursor: number } => {
  const n = nextClozeNumber(text);
  const selected = text.slice(start, end);
  const inner = selected.trim() ? selected : '…';
  const inserted = `{{c${n}::${inner}}}`;
  return { text: text.slice(0, start) + inserted + text.slice(end), cursor: start + inserted.length };
};

/**
 * Text-Seiten einer Karte für Ausgaben ohne Aufdecken (PDF, Druck, Quiz aus
 * Stapel): Vorderseite mit "[…]", Rückseite mit ausgefülltem Text plus Zusatz.
 */
export const textSides = (card: { front: string; back: string }): { front: string; back: string } => {
  if (!hasCloze(card.front)) return { front: card.front, back: card.back };
  const masked = parseCloze(card.front).map(s => (s.kind === 'text' ? s.text : `[${s.hint ?? '…'}]`)).join('');
  const plain = clozeToPlain(card.front);
  return { front: masked, back: card.back.trim() ? `${plain}\n${card.back}` : plain };
};
