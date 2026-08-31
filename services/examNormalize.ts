// Pendant zu quizNormalize für die Klausur: unspielbare bzw. unbewertbare
// Aufgaben fliegen VOR der Klausur raus, statt dem Nutzer 0 Punkte auf eine
// kaputte Frage zu geben (die trotzdem in die Gesamtwertung zählen würde).
//
// Quantitativer Modus (Phase 1 Mathe-Ausbau): zusätzlich zur strukturellen
// Prüfung läuft hier der deterministische CAS-Selbstcheck aus mathValidation.ts
// (validateQuantQuestion) für numeric/expression/Rechnungs-MC — KEIN zusätzlicher
// Gemini-Call, rein lokale mathjs-Auswertung. Fragen, die durchfallen, werden
// verworfen wie jede andere strukturell kaputte Frage; wie viele das waren wird
// geloggt (nicht stillschweigend geschluckt), ohne den Vorgang abzubrechen.
import type { ExamQuestion, DistractorErrorType } from '../types';
import { validateQuantQuestion } from './mathValidation';

const KNOWN_TYPES: ExamQuestion['type'][] = ['mc', 'open', 'matching', 'truefalse', 'fillblank', 'ranking', 'numeric', 'expression', 'step_by_step'];

const isStrArr = (v: unknown, min: number): v is string[] =>
  Array.isArray(v) && v.length >= min && v.every(x => typeof x === 'string' && x.trim().length > 0);

const isIdx = (n: unknown, len: number): n is number =>
  Number.isInteger(n) && (n as number) >= 0 && (n as number) < len;

const DISTRACTOR_ERROR_TYPES: DistractorErrorType[] = ['sign_error', 'calc_error', 'formula_error', 'wrong_operation', 'other'];

/** Optionale distractorErrorTypes[] nur behalten, wenn sie parallel zu options[]
 *  passt (gleiche Länge) — sonst lieber weglassen als eine falsch ausgerichtete
 *  Zuordnung anzuzeigen. Unbekannte Tokens werden zu null statt die ganze Klausur-
 *  Generierung an einem einzigen unerwarteten String scheitern zu lassen. */
const cleanDistractorErrorTypes = (v: unknown, optionsLength: number): (DistractorErrorType | null)[] | undefined => {
  if (!Array.isArray(v) || v.length !== optionsLength) return undefined;
  return v.map(x => {
    if (typeof x !== 'string') return null;
    const trimmed = x.trim();
    return (DISTRACTOR_ERROR_TYPES as string[]).includes(trimmed) ? trimmed as DistractorErrorType : null;
  });
};

export function normalizeExamQuestions(raw: unknown): ExamQuestion[] {
  if (!Array.isArray(raw)) return [];
  const out: ExamQuestion[] = [];
  // Nur zu Diagnosezwecken gezählt/geloggt (Phase 1 CAS-Selbstcheck) — reduziert die
  // Klausur bewusst NICHT künstlich weiter, verwirft nur echt kaputte Quant-Fragen.
  let quantDropped = 0;

  raw.forEach((q: any, i: number) => {
    if (!q || typeof q !== 'object') return;
    if (typeof q.question !== 'string' || !q.question.trim()) return;
    if (!KNOWN_TYPES.includes(q.type)) return;

    const base: ExamQuestion = {
      ...q,
      id: typeof q.id === 'string' && q.id.trim() ? q.id : `q${i + 1}`,
      points: typeof q.points === 'number' && q.points > 0 ? Math.round(q.points) : 2,
      solution: typeof q.solution === 'string' ? q.solution : '',
    };

    switch (base.type) {
      case 'mc': {
        if (!isStrArr(q.options, 2)) return;
        const ci = Array.isArray(q.correctIndices)
          ? [...new Set(q.correctIndices.filter((n: unknown) => isIdx(n, q.options.length)))] as number[]
          : [];
        if (ci.length === 0) return;
        const candidate: ExamQuestion = {
          ...base,
          correctIndices: ci,
          distractorErrorTypes: cleanDistractorErrorTypes(q.distractorErrorTypes, q.options.length),
        };
        // CAS-Selbstcheck NUR für Rechnungs-MC (category "rechnung", s. mathValidation.ts) —
        // reguläre MC-Fragen sind von der Single-Choice-Pflicht/Äquivalenzprüfung nicht betroffen.
        if (candidate.category === 'rechnung') {
          const result = validateQuantQuestion(candidate);
          if (!result.valid) { quantDropped++; return; }
        }
        out.push(candidate);
        return;
      }
      case 'truefalse': {
        if (typeof q.tfCorrect !== 'boolean') return;
        // Begründungsschritt nur behalten, wenn er vollständig ist — sonst einfache W/F-Frage
        const reasons = isStrArr(q.tfReasonOptions, 2) ? q.tfReasonOptions : [];
        const hasValidReason = reasons.length > 0 && isIdx(q.tfCorrectReasonIndex, reasons.length);
        out.push({
          ...base,
          tfReasonOptions: hasValidReason ? reasons : [],
          tfCorrectReasonIndex: hasValidReason ? q.tfCorrectReasonIndex : undefined,
        });
        return;
      }
      case 'matching': {
        if (!isStrArr(q.matchLeft, 2) || !isStrArr(q.matchRight, 2)) return;
        const mc = Array.isArray(q.matchCorrect) ? q.matchCorrect : [];
        if (mc.length !== q.matchLeft.length || !mc.every((n: unknown) => isIdx(n, q.matchRight.length))) return;
        out.push(base);
        return;
      }
      case 'fillblank': {
        if (typeof q.blankText !== 'string' || !q.blankText.trim() || !isStrArr(q.blanks, 1)) return;
        out.push(base);
        return;
      }
      case 'ranking': {
        if (!isStrArr(q.rankingItems, 2)) return;
        out.push(base);
        return;
      }
      case 'numeric': {
        if (typeof q.numericAnswer !== 'number' || Number.isNaN(q.numericAnswer)) return;
        const candidate: ExamQuestion = {
          ...base,
          numericTolerance: typeof q.numericTolerance === 'number' && q.numericTolerance >= 0 ? q.numericTolerance : 0,
        };
        const result = validateQuantQuestion(candidate);
        if (!result.valid) { quantDropped++; return; }
        out.push(candidate);
        return;
      }
      case 'expression': {
        if (typeof q.expressionAnswer !== 'string' || !q.expressionAnswer.trim()) return;
        const candidate: ExamQuestion = {
          ...base,
          expressionAnswer: q.expressionAnswer.trim(),
          expressionVariables: isStrArr(q.expressionVariables, 1) ? q.expressionVariables : undefined,
        };
        const result = validateQuantQuestion(candidate);
        if (!result.valid) { quantDropped++; return; }
        out.push(candidate);
        return;
      }
      case 'step_by_step': {
        // Strukturell identisch zum expression-Fall: ohne brauchbare Musterlösung
        // (mind. 1 nicht-leerer Schritt) gibt es nichts, wogegen evaluateStepByStep
        // später bewerten könnte — Frage lieber verwerfen als 0 Punkte auf eine
        // unbewertbare Aufgabe zu geben.
        if (!isStrArr(q.expectedSteps, 1)) return;
        const candidate: ExamQuestion = {
          ...base,
          expectedSteps: q.expectedSteps.map((s: string) => s.trim()),
        };
        const result = validateQuantQuestion(candidate);
        if (!result.valid) { quantDropped++; return; }
        out.push(candidate);
        return;
      }
      case 'open': {
        // Ohne Musterlösung kann die Rubrik-Bewertung nichts prüfen
        if (!base.solution.trim()) return;
        // Erwartungshorizont validieren; ist er brauchbar, ist seine Punktsumme
        // die Autorität (points wird angeglichen — Kriterien und Gesamtpunkte
        // dürfen nie auseinanderlaufen). Unbrauchbare Rubrik → ad-hoc-Korrektur.
        const rubric = (Array.isArray(q.rubricCriteria) ? q.rubricCriteria : [])
          .filter((c: any) => c && typeof c.name === 'string' && c.name.trim() && typeof c.maxPoints === 'number' && c.maxPoints > 0)
          .slice(0, 4)
          .map((c: any) => ({
            name: c.name.trim(),
            maxPoints: Math.round(c.maxPoints),
            ...(typeof c.sourceReference === 'string' && c.sourceReference.trim() ? { sourceReference: c.sourceReference.trim() } : {}),
          }));
        const rubricSum = rubric.reduce((s: number, c: { maxPoints: number }) => s + c.maxPoints, 0);
        if (rubric.length >= 2 && rubricSum > 0 && rubricSum <= 20) {
          out.push({ ...base, rubricCriteria: rubric, points: rubricSum });
        } else {
          out.push({ ...base, rubricCriteria: undefined });
        }
        return;
      }
    }
  });

  if (quantDropped > 0 && typeof console !== 'undefined') {
    console.warn(`[examNormalize] CAS-Selbstcheck: ${quantDropped} quantitative Aufgabe(n) wegen fehlgeschlagener Validierung verworfen.`);
  }

  return out;
}
