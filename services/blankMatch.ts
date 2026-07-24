// ─── Lückentext: Levenshtein-Toleranz statt Exaktvergleich ──────────────────
// Ein einzelner Tippfehler soll nicht als komplett falsch zählen — die
// zulässige Fehlerzahl skaliert mit der Wortlänge, sonst würde ein kurzes
// 3-Zeichen-Wort schon bei 1 erlaubtem Fehler praktisch beliebig werden.
// Gemeinsame Utility für Klausur-Bewertung (examScoring.ts) UND Quiz-Cloze
// (QuizPlayer.tsx) — dieselbe Toleranzregel soll an beiden Stellen gelten.
export type BlankMatch = 'exact' | 'tolerant' | 'none';

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = new Array(n + 1);
  const curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

/** Erlaubte Fehleranzahl anhand der Länge des korrekten Worts (Groß-/Klein-
 *  schreibung ist an dieser Stelle bereits ignoriert). */
function maxAllowedErrors(correctLength: number): number {
  if (correctLength <= 4) return 0;
  if (correctLength <= 8) return 1;
  return 2;
}

export function matchBlank(userAnswer: string, correctAnswer: string): BlankMatch {
  const user = userAnswer.trim().toLowerCase();
  const correct = correctAnswer.trim().toLowerCase();
  if (!user) return 'none';
  if (user === correct) return 'exact';
  const dist = levenshtein(user, correct);
  return dist > 0 && dist <= maxAllowedErrors(correct.length) ? 'tolerant' : 'none';
}
