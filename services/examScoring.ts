// Faire MC-Teilpunktformel: falsche Kreuze ziehen ab (Hochschul-üblich).
// Verhindert den Exploit „alle Optionen ankreuzen = garantiert halbe Punkte"
// und belohnt gleichzeitig Teilwissen (2 von 3 richtigen erkannt statt 0 Punkte).
export interface McScore {
  /** Punktanteil 0–1: max(0, (richtig gewählt − falsch gewählt) / Anzahl richtiger) */
  fraction: number;
  hits: number;
  wrong: number;
  totalCorrect: number;
}

export function scoreMc(user: number[], correct: number[]): McScore {
  const cSet = new Set(correct);
  const uSet = new Set(user);
  const hits = correct.filter(i => uSet.has(i)).length;
  const wrong = [...uSet].filter(i => !cSet.has(i)).length;
  const fraction = correct.length > 0 ? Math.max(0, (hits - wrong) / correct.length) : 0;
  return { fraction, hits, wrong, totalCorrect: correct.length };
}

// ─── Lückentext: Levenshtein-Toleranz statt Exaktvergleich ──────────────────
// Ein einzelner Tippfehler soll nicht 0 Punkte für die ganze Lücke bedeuten —
// die zulässige Fehlerzahl skaliert mit der Wortlänge, sonst würde ein kurzes
// 3-Zeichen-Wort schon bei 1 erlaubtem Fehler praktisch beliebig werden.
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

export interface FillblankScore {
  results: BlankMatch[];
  hits: number;
  fraction: number;
}

export function scoreFillblank(userAnswers: string[], correctBlanks: string[]): FillblankScore {
  const results = correctBlanks.map((c, i) => matchBlank(userAnswers[i] || '', c));
  const hits = results.filter(r => r !== 'none').length;
  const fraction = correctBlanks.length > 0 ? hits / correctBlanks.length : 0;
  return { results, hits, fraction };
}

// ─── Sortierung: Kendall-Tau (Paar-Konkordanz) statt exakter Positionsprüfung ─
// Eine Reihenfolge, die nur zwei benachbarte Elemente vertauscht hat, soll nicht
// dieselben (fast) 0 Punkte bekommen wie eine komplett falsche Reihenfolge —
// gezählt wird der Anteil der Paare, deren relative Reihenfolge stimmt.
export interface RankingScore {
  concordantPairs: number;
  totalPairs: number;
  fraction: number;
}

export function scoreRanking(userOrder: string[], correctOrder: string[]): RankingScore {
  const n = correctOrder.length;
  const totalPairs = (n * (n - 1)) / 2;
  if (totalPairs === 0) return { concordantPairs: 0, totalPairs: 0, fraction: 0 };
  const userPos = new Map(userOrder.map((item, idx) => [item, idx]));
  let concordant = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const posA = userPos.get(correctOrder[i]);
      const posB = userPos.get(correctOrder[j]);
      if (posA !== undefined && posB !== undefined && posA < posB) concordant++;
    }
  }
  return { concordantPairs: concordant, totalPairs, fraction: concordant / totalPairs };
}
