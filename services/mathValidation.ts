import { create, all } from 'mathjs';
import type { ExamQuestion } from '../types';

/**
 * mathValidation.ts — Quantitativer Klausurmodus Phase 1: mathematische
 * Äquivalenzprüfung + deterministischer CAS-Selbstcheck.
 *
 * Ersetzt den bisherigen reinen `Math.abs(user - correct) <= tolerance`-Vergleich
 * (ExamSystem.tsx autoEvaluate / ExamView.tsx) durch eine Prüfung, die Brüche,
 * Dezimalzahlen und gerundete Dezimalzahlen als gleichwertig erkennt (8/3 ≡
 * 2.6666667 ≡ 2.6667), und liefert für den neuen Fragetyp "expression" eine
 * Äquivalenzprüfung per numerischem Sampling statt Stringvergleich (3x²+4x-5
 * ≡ -5+4x+3x²).
 *
 * KEIN zusätzlicher Gemini-Call: alles hier ist deterministisch und läuft
 * lokal, direkt im Anschluss an die Normalisierung (services/examNormalize.ts)
 * bzw. bei der Auswertung (ExamSystem.tsx).
 */

const math = create(all, {});

// Format-Toleranz für "dieselbe Zahl, anders geschrieben" (Bruch vs. Dezimalzahl
// vs. gerundete Dezimalzahl) — bewusst KLEIN und getrennt von der pädagogischen
// numericTolerance der Frage (die deckt "nah genug dran" ab, das hier deckt nur
// "ist mathematisch dieselbe Zahl" ab). Die tatsächlich verwendete Toleranz ist
// immer das Maximum aus beidem (s. checkNumericEquivalence).
const DEFAULT_ABS_TOLERANCE = 1e-4;
const DEFAULT_REL_TOLERANCE = 1e-3;

const SUPERSCRIPT_MAP: Record<string, string> = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
  '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
};

/**
 * Normalisiert typografische Schreibweisen auf mathjs-Syntax, bevor geparst
 * wird: hochgestellte Exponenten (x² → x^2, auch mehrstellig x¹² → x^12),
 * Malzeichen (× / ·) → *, Geteiltzeichen (÷) → /, Dezimalkomma → Punkt
 * (nur zwischen zwei Ziffern, um Funktionsargument-Kommas wie in "max(1,2)"
 * nicht zu zerstören).
 */
export function preprocessExpression(raw: string): string {
  let s = (raw ?? '').trim();
  s = s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (m) => '^' + m.split('').map(c => SUPERSCRIPT_MAP[c] ?? '').join(''));
  s = s.replace(/×/g, '*').replace(/÷/g, '/').replace(/·/g, '*');
  s = s.replace(/(\d),(\d)/g, '$1.$2');
  return s;
}

/** Parst eine Zahl ODER einen numerischen Ausdruck (Bruch, Wurzel, ...) zu einer JS-number. */
export function parseNumeric(raw: string | number | undefined | null): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const val = math.evaluate(preprocessExpression(raw));
    const num = typeof val === 'object' && val !== null && typeof (val as any).toNumber === 'function'
      ? (val as any).toNumber()
      : Number(val);
    return Number.isFinite(num) ? num : null;
  } catch {
    return null;
  }
}

export interface NumericEquivalenceOptions {
  /** Pädagogische Toleranz der Frage (ExamQuestion.numericTolerance) — fließt als
   *  zusätzlicher, additiver Spielraum ein, ersetzt aber nie die Format-Mindesttoleranz. */
  tolerance?: number;
}

/**
 * Zwei Zahlen/Zahl-Ausdrücke gelten als äquivalent, wenn sie innerhalb der
 * größeren aus (a) expliziter Fragetoleranz, (b) absoluter Format-Toleranz,
 * (c) relativer Format-Toleranz liegen. Deckt Bruch/Dezimalzahl/gerundete
 * Dezimalzahl als "dieselbe Antwort" ab, ohne eine echt falsche Antwort
 * innerhalb einer großzügigen Fragetoleranz plötzlich strenger zu machen.
 */
export function checkNumericEquivalence(
  a: string | number, b: string | number, opts: NumericEquivalenceOptions = {}
): boolean {
  const av = parseNumeric(a);
  const bv = parseNumeric(b);
  if (av === null || bv === null) return false;
  const explicit = opts.tolerance ?? 0;
  const effectiveTolerance = Math.max(
    explicit,
    DEFAULT_ABS_TOLERANCE,
    DEFAULT_REL_TOLERANCE * Math.max(Math.abs(av), Math.abs(bv))
  );
  return Math.abs(av - bv) <= effectiveTolerance;
}

function isBuiltinSymbol(name: string): boolean {
  try { math.evaluate(name); return true; } catch { return false; }
}

/** Freie Variablen (einzelne Symbole, die keine mathjs-Konstante/-Funktion sind) in einem Ausdruck. */
export function detectVariables(expr: string): string[] {
  try {
    const node = math.parse(preprocessExpression(expr));
    const names = new Set<string>();
    node.traverse((n: any) => { if (n.isSymbolNode && !isBuiltinSymbol(n.name)) names.add(n.name); });
    return [...names].sort();
  } catch {
    return [];
  }
}

const SAMPLE_TARGET = 5;
const SAMPLE_MIN_VALID = 3;
const SAMPLE_MAX_ATTEMPTS = SAMPLE_TARGET * 5;

/** Zufälliger Stichprobenwert, der 0 und sehr kleine Beträge meidet (Division-durch-0-
 *  bzw. Rundungsartefakte bei Ausdrücken mit der Variable im Nenner). */
function randomSample(): number {
  let v = 0;
  while (Math.abs(v) < 0.25) v = Math.random() * 16 - 8;
  return Math.round(v * 100) / 100;
}

/**
 * Mathematische/symbolische Äquivalenz zweier Ausdrücke per numerischem Sampling:
 * beide Ausdrücke werden an mehreren zufälligen Punkten (für jede erkannte Variable
 * gemeinsam substituiert) ausgewertet — stimmen sie an genügend gültigen Punkten
 * überein, gelten sie als äquivalent. Erkennt z.B. "3x²+4x-5" ≡ "-5+4x+3x²"
 * (nur umsortiert) und lehnt echte Rechenfehler (Vorzeichen-, Klammer-, Faktorfehler)
 * korrekt ab, weil sie an mindestens einem Punkt einen anderen Wert ergeben.
 */
export function checkExpressionEquivalence(exprA: string, exprB: string, variables?: string[]): boolean {
  const normA = preprocessExpression(exprA);
  const normB = preprocessExpression(exprB);
  let nodeA, nodeB;
  try {
    nodeA = math.parse(normA);
    nodeB = math.parse(normB);
  } catch {
    return false;
  }
  const varNames = variables && variables.length > 0
    ? variables
    : [...new Set([...detectVariables(normA), ...detectVariables(normB)])];

  let validSamples = 0;
  for (let attempt = 0; attempt < SAMPLE_MAX_ATTEMPTS && validSamples < SAMPLE_TARGET; attempt++) {
    const scope: Record<string, number> = {};
    varNames.forEach(v => { scope[v] = randomSample(); });
    let va: unknown, vb: unknown;
    try {
      va = nodeA.evaluate(scope);
      vb = nodeB.evaluate(scope);
    } catch {
      continue; // z.B. Division durch 0 an diesem Punkt — anderen Punkt versuchen
    }
    const na = typeof va === 'number' ? va : Number(va);
    const nb = typeof vb === 'number' ? vb : Number(vb);
    if (!Number.isFinite(na) || !Number.isFinite(nb)) continue;
    const tol = Math.max(DEFAULT_ABS_TOLERANCE, DEFAULT_REL_TOLERANCE * Math.max(Math.abs(na), Math.abs(nb), 1));
    if (Math.abs(na - nb) > tol) return false; // an diesem Punkt eindeutig unterschiedlich → nicht äquivalent
    validSamples++;
  }
  return validSamples >= SAMPLE_MIN_VALID;
}

export interface QuantValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * CAS-Selbstcheck vor Aufnahme in die assemblierte Klausur (kein zusätzlicher
 * Gemini-Call): validiert strukturell, dass eine generierte numeric-/expression-
 * Frage überhaupt auswertbar ist, und prüft bei Rechnungs-MC (category "rechnung"),
 * dass genau eine Option korrekt ist und keine der übrigen Optionen numerisch
 * äquivalent zur korrekten ist (sonst hätte die Frage mehr als eine "richtige"
 * Antwort). Fragen, die hier durchfallen, werden von examNormalize.ts verworfen.
 */
export function validateQuantQuestion(q: ExamQuestion): QuantValidationResult {
  if (q.type === 'numeric') {
    if (typeof q.numericAnswer !== 'number' || !Number.isFinite(q.numericAnswer)) {
      return { valid: false, reason: 'numericAnswer fehlt oder ist keine gültige Zahl' };
    }
    if (q.numericTolerance !== undefined && (typeof q.numericTolerance !== 'number' || q.numericTolerance < 0)) {
      return { valid: false, reason: 'numericTolerance ist ungültig (negativ oder kein number)' };
    }
    return { valid: true };
  }

  if (q.type === 'expression') {
    if (!q.expressionAnswer || !q.expressionAnswer.trim()) {
      return { valid: false, reason: 'expressionAnswer fehlt' };
    }
    try {
      math.parse(preprocessExpression(q.expressionAnswer));
    } catch {
      return { valid: false, reason: 'expressionAnswer ist kein gültiger mathematischer Ausdruck' };
    }
    return { valid: true };
  }

  if (q.type === 'step_by_step') {
    if (!Array.isArray(q.expectedSteps) || q.expectedSteps.length === 0
        || !q.expectedSteps.every(s => typeof s === 'string' && s.trim().length > 0)) {
      return { valid: false, reason: 'expectedSteps fehlt oder ist keine nicht-leere Liste von Schritt-Strings' };
    }
    return { valid: true };
  }

  if (q.type === 'mc' && q.category === 'rechnung') {
    if (!q.options || q.options.length < 2) {
      return { valid: false, reason: 'Rechnungs-MC hat zu wenige Optionen' };
    }
    const correct = q.correctIndices ?? [];
    if (correct.length !== 1) {
      return { valid: false, reason: 'Rechnungs-MC muss genau eine korrekte Option haben (Single-Choice)' };
    }
    const correctIdx = correct[0];
    const correctValue = parseNumeric(q.options[correctIdx]);
    if (correctValue === null) {
      // Korrekte Option ist nicht numerisch parsbar (z.B. Formel/Text trotz
      // "rechnung"-Kategorie) — keine Äquivalenzprüfung möglich, aber kein
      // Grund die Frage strukturell zu verwerfen.
      return { valid: true };
    }
    for (let i = 0; i < q.options.length; i++) {
      if (i === correctIdx) continue;
      const v = parseNumeric(q.options[i]);
      if (v !== null && checkNumericEquivalence(v, correctValue)) {
        return { valid: false, reason: `Option ${i + 1} ist numerisch äquivalent zur korrekten Option` };
      }
    }
    return { valid: true };
  }

  return { valid: true };
}
