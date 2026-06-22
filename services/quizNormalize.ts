import type { QuizQuestion } from '../types';

/**
 * Normalisierung von KI-generierten Quiz-Fragen.
 *
 * Gemini lässt trotz responseSchema gelegentlich Felder weg (z. B.
 * correctAnswerIndices, options, distractorExplanations) — das hat in den
 * Spielern zu Abstürzen geführt (undefined.includes(...)). Diese Funktionen
 * füllen fehlende Felder mit sicheren Defaults und entfernen unbrauchbare
 * Fragen, bevor sie das UI erreichen.
 */

const MC_LIKE_TYPES = ['mc', 'single', 'truefalse', 'scenario'];

export const normalizeQuizQuestions = (raw: unknown): QuizQuestion[] => {
  if (!Array.isArray(raw)) return [];

  return raw.reduce<QuizQuestion[]>((acc, item) => {
    if (!item || typeof item !== 'object') return acc;
    const q = item as Record<string, any>;

    const question = typeof q.question === 'string' ? q.question.trim() : '';
    if (!question) return acc; // ohne Fragetext unbrauchbar

    const options = Array.isArray(q.options)
      ? q.options.filter((o: any) => typeof o === 'string')
      : [];

    // Nur gültige Indizes innerhalb der Optionen behalten
    const correctAnswerIndices = Array.isArray(q.correctAnswerIndices)
      ? q.correctAnswerIndices.filter(
          (i: any) => Number.isInteger(i) && i >= 0 && i < options.length
        )
      : [];

    const questionType = typeof q.questionType === 'string' ? q.questionType : undefined;
    const isMcLike = !questionType || MC_LIKE_TYPES.includes(questionType);

    // MC-artige Fragen brauchen Optionen + mind. eine korrekte Antwort, sonst nicht spielbar
    if (isMcLike && (options.length < 2 || correctAnswerIndices.length === 0)) return acc;

    acc.push({
      question,
      options,
      correctAnswerIndices,
      isMultipleChoice: typeof q.isMultipleChoice === 'boolean'
        ? q.isMultipleChoice
        : correctAnswerIndices.length > 1,
      explanation: typeof q.explanation === 'string' ? q.explanation : '',
      distractorExplanations: Array.isArray(q.distractorExplanations)
        ? q.distractorExplanations.filter((d: any) => typeof d === 'string')
        : [],
      sourceReference: typeof q.sourceReference === 'string' ? q.sourceReference : '',
      topic: typeof q.topic === 'string' ? q.topic : undefined,
      difficulty: q.difficulty,
      learningGoal: typeof q.learningGoal === 'string' ? q.learningGoal : undefined,
      questionType: questionType as QuizQuestion['questionType'],
      scenarioText: typeof q.scenarioText === 'string' ? q.scenarioText : undefined,
      matchPairs: Array.isArray(q.matchPairs)
        ? q.matchPairs.filter((p: any) => p && typeof p.left === 'string' && typeof p.right === 'string')
        : undefined,
      clozeText: typeof q.clozeText === 'string' ? q.clozeText : undefined,
      clozeAnswers: Array.isArray(q.clozeAnswers)
        ? q.clozeAnswers.filter((a: any) => typeof a === 'string')
        : undefined,
      rankingItems: Array.isArray(q.rankingItems)
        ? q.rankingItems.filter((r: any) => typeof r === 'string')
        : undefined,
      numericAnswer: typeof q.numericAnswer === 'number' ? q.numericAnswer : undefined,
      numericTolerance: typeof q.numericTolerance === 'number' ? q.numericTolerance : undefined,
    });
    return acc;
  }, []);
};

/** Parst KI-JSON robust und normalisiert es zu sicheren Quiz-Fragen. */
export const parseQuizQuestions = (text: string): QuizQuestion[] => {
  let raw: unknown;
  try { raw = JSON.parse(text || '[]'); }
  catch { return []; }
  return normalizeQuizQuestions(raw);
};
