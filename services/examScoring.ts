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
