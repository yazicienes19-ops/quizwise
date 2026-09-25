/**
 * Getippte Antwort mit der richtigen vergleichen (Anki: "Antwort eintippen").
 * Wortweise statt zeichenweise: bei ganzen Sätzen lesbarer. Groß/Klein,
 * Satzzeichen und Akzente zählen nicht als Fehler.
 */
export type CompareSegment = { text: string; kind: 'ok' | 'missing' | 'extra' };

export interface AnswerComparison {
  /** Die richtige Antwort, Wörter als getroffen oder fehlend markiert. */
  expected: CompareSegment[];
  /** Wörter aus der eigenen Antwort, die in der richtigen nicht vorkommen. */
  extra: string[];
  /** Anteil getroffener Wörter der richtigen Antwort, 0 bis 1. */
  score: number;
  suggestion: 'again' | 'hard' | 'good';
}

const norm = (w: string) => w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, '');
const words = (s: string) => s.split(/\s+/).filter(Boolean);

/** Längste gemeinsame Teilfolge über normalisierte Wörter; liefert getroffene Indizes. */
const lcs = (a: string[], b: string[]): { inA: Set<number>; inB: Set<number> } => {
  const n = a.length; const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
    dp[i][j] = a[i] && a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  }
  const inA = new Set<number>(); const inB = new Set<number>();
  let i = 0; let j = 0;
  while (i < n && j < m) {
    if (a[i] && a[i] === b[j]) { inA.add(i); inB.add(j); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return { inA, inB };
};

export const compareAnswer = (typed: string, correct: string): AnswerComparison => {
  const exp = words(correct); const got = words(typed);
  const expN = exp.map(norm); const gotN = got.map(norm);
  const { inA, inB } = lcs(expN, gotN);
  const expected: CompareSegment[] = exp.map((w, i) => ({ text: w, kind: inA.has(i) || !expN[i] ? 'ok' : 'missing' }));
  const extra = got.filter((w, j) => !inB.has(j) && gotN[j]);
  const countable = expN.filter(Boolean).length;
  const hit = expN.filter((w, i) => w && inA.has(i)).length;
  const score = countable ? hit / countable : 0;
  const suggestion = score >= 0.9 ? 'good' : score >= 0.6 ? 'hard' : 'again';
  return { expected, extra, score, suggestion };
};
