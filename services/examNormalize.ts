// Pendant zu quizNormalize für die Klausur: unspielbare bzw. unbewertbare
// Aufgaben fliegen VOR der Klausur raus, statt dem Nutzer 0 Punkte auf eine
// kaputte Frage zu geben (die trotzdem in die Gesamtwertung zählen würde).
import type { ExamQuestion } from '../types';

const KNOWN_TYPES: ExamQuestion['type'][] = ['mc', 'open', 'matching', 'truefalse', 'fillblank', 'ranking', 'numeric'];

const isStrArr = (v: unknown, min: number): v is string[] =>
  Array.isArray(v) && v.length >= min && v.every(x => typeof x === 'string' && x.trim().length > 0);

const isIdx = (n: unknown, len: number): n is number =>
  Number.isInteger(n) && (n as number) >= 0 && (n as number) < len;

export function normalizeExamQuestions(raw: unknown): ExamQuestion[] {
  if (!Array.isArray(raw)) return [];
  const out: ExamQuestion[] = [];

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
        out.push({ ...base, correctIndices: ci });
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
        out.push({
          ...base,
          numericTolerance: typeof q.numericTolerance === 'number' && q.numericTolerance >= 0 ? q.numericTolerance : 0,
        });
        return;
      }
      case 'open': {
        // Ohne Musterlösung kann die Rubrik-Bewertung nichts prüfen
        if (!base.solution.trim()) return;
        out.push(base);
        return;
      }
    }
  });

  return out;
}
