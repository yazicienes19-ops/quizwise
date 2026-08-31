import type { ExamQuestion } from '../types';

/**
 * examAnswerFormat.ts — Antworten je Fragetyp als lesbaren Text aufbereiten.
 *
 * Geteilt zwischen Klausur-Archiv (Antwort-Übersicht) und PDF-Export
 * (ExamView): der Export druckte für matching/fillblank/ranking bisher die
 * Rohdaten (`String(array)`), obwohl es dieselbe lesbare Aufbereitung schon
 * im Archiv gab. Jetzt eine Quelle für beide.
 */

const SEPARATOR = ' · ';

/** Antwort des Nutzers je Fragetyp als lesbaren Text. */
export const formatUserAnswer = (q: ExamQuestion, t: (k: any, p?: any) => string): string => {
  const a = q.userAnswer;
  if (a === undefined || a === null || (Array.isArray(a) && a.length === 0) || a === '') return t('ea.noAnswer');
  switch (q.type) {
    case 'mc':
      return (a as number[]).map(i => q.options?.[i] ?? `#${i + 1}`).join(' · ');
    case 'truefalse': {
      const tf = (a as { tf?: boolean; reason?: number });
      if (tf.tf === undefined) return t('ea.noAnswer');
      const base = tf.tf ? t('tf.true') : t('tf.false');
      const reason = tf.reason !== undefined ? q.tfReasonOptions?.[tf.reason] : undefined;
      return reason ? `${base} · ${reason}` : base;
    }
    case 'matching':
      return (a as number[]).map((ri, li) => `${q.matchLeft?.[li] ?? li + 1} → ${q.matchRight?.[ri] ?? '—'}`).join(SEPARATOR);
    case 'fillblank':
      return (a as string[]).map(x => x || '—').join(SEPARATOR);
    case 'ranking':
      return (a as string[]).join(' → ');
    case 'expression':
      return String(a);
    case 'step_by_step':
      // Zeilenweise Schritte wie im ExamSystem.tsx-Splitting, lesbar mit " / " statt
      // Original-Zeilenumbrüchen (PDF/Archiv sind einzeilige Textkontexte).
      return String(a).split('\n').map(s => s.trim()).filter(Boolean).join(' / ') || t('ea.noAnswer');
    default:
      return String(a);
  }
};

/** Korrekte Lösung je Fragetyp als lesbaren Text (PDF "Korrekt:"-Zeile). */
export const formatCorrectAnswer = (q: ExamQuestion, t: (k: any, p?: any) => string): string => {
  switch (q.type) {
    case 'mc':
      return (q.correctIndices || []).map(i => q.options?.[i] ?? `#${i + 1}`).join(SEPARATOR);
    case 'truefalse': {
      if (q.tfCorrect === undefined) return q.solution;
      const base = q.tfCorrect ? t('tf.true') : t('tf.false');
      const reason = q.tfCorrectReasonIndex !== undefined ? q.tfReasonOptions?.[q.tfCorrectReasonIndex] : undefined;
      return reason ? `${base} · ${reason}` : base;
    }
    case 'matching':
      if (!q.matchCorrect?.length) return q.solution;
      return q.matchCorrect.map((ri, li) => `${q.matchLeft?.[li] ?? li + 1} → ${q.matchRight?.[ri] ?? '—'}`).join(SEPARATOR);
    case 'fillblank':
      return q.blanks?.length ? q.blanks.join(SEPARATOR) : q.solution;
    case 'ranking':
      return q.rankingItems?.length ? q.rankingItems.join(' → ') : q.solution;
    case 'numeric':
      return q.numericAnswer !== undefined
        ? `${q.numericAnswer}${q.numericTolerance ? ` ±${q.numericTolerance}` : ''}`
        : q.solution;
    case 'expression':
      return q.expressionAnswer?.trim() ? q.expressionAnswer : q.solution;
    case 'step_by_step':
      return q.expectedSteps?.length ? q.expectedSteps.join(' / ') : q.solution;
    default:
      return q.solution;
  }
};
