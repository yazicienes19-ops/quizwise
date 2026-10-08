import type { QuizQuestion, BloomLevel } from '../types';
import { BLOOM_LEVELS } from './bloomPresets';
import { isRealOptions } from './examNormalize';

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
const KNOWN_TYPES = [...MC_LIKE_TYPES, 'open', 'matching', 'cloze', 'ranking', 'numeric'];

// Flash-Lite erfindet Typnamen statt der vorgegebenen Tokens (Benchmark 08.10.2026:
// 33 von 774 Fragen, z. B. "single-choice", "multiple-choice"). Auf die echten abbilden.
const TYPE_ALIASES: Record<string, { type: string; multi?: boolean }> = {
  'single-choice': { type: 'mc', multi: false }, single_choice: { type: 'mc', multi: false }, singlechoice: { type: 'mc', multi: false },
  'multiple-choice': { type: 'mc', multi: true }, multiple_choice: { type: 'mc', multi: true }, multiplechoice: { type: 'mc', multi: true },
  'true-false': { type: 'truefalse' }, true_false: { type: 'truefalse' }, 'wahr-falsch': { type: 'truefalse' },
  fillblank: { type: 'cloze' }, fill_blank: { type: 'cloze' }, 'fill-in-the-blank': { type: 'cloze' }, 'lückentext': { type: 'cloze' },
  short_answer: { type: 'open' }, 'short-answer': { type: 'open' }, offen: { type: 'open' },
};

const GAP = '__LÜCKE__';
const gapCount = (s: unknown) => (typeof s === 'string' ? s.split(GAP).length - 1 : 0);

/** Bildet erfundene Typnamen auf echte ab und holt den Lückentext aus der Frage, wenn clozeText fehlt. */
export const canonicalizeQuizQuestion = (item: unknown): Record<string, any> | null => {
  if (!item || typeof item !== 'object') return null;
  const q = { ...(item as Record<string, any>) };
  const rawType = typeof q.questionType === 'string' ? q.questionType.trim().toLowerCase() : undefined;
  const alias = rawType ? TYPE_ALIASES[rawType] : undefined;
  if (alias) {
    q.questionType = alias.type;
    if (alias.multi !== undefined) q.isMultipleChoice = alias.multi;
  }
  if (q.questionType === 'cloze' && gapCount(q.clozeText) === 0 && gapCount(q.question) > 0) q.clozeText = q.question;
  return q;
};

/** MC-artige Frage, der Optionen oder die richtige Lösung fehlen: Kandidat für den Reparatur-Aufruf
 *  (geminiService). Benchmark 08.10.2026: Flash-Lite lässt sie bei ~13 % aller Quizfragen weg. */
export const quizMcNeedsRepair = (item: unknown): boolean => {
  const q = canonicalizeQuizQuestion(item);
  if (!q || typeof q.question !== 'string' || !q.question.trim()) return false;
  const type = q.questionType;
  if (type !== undefined && !['mc', 'single', 'scenario'].includes(type)) return false;
  if (!isRealOptions(q.options)) return true;
  return !(Array.isArray(q.correctAnswerIndices) && q.correctAnswerIndices.some((i: unknown) => Number.isInteger(i) && (i as number) >= 0 && (i as number) < q.options.length));
};

export const normalizeQuizQuestions = (raw: unknown): QuizQuestion[] => {
  if (!Array.isArray(raw)) return [];

  return raw.reduce<QuizQuestion[]>((acc, item) => {
    const q = canonicalizeQuizQuestion(item);
    if (!q) return acc;

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
    if (questionType && !KNOWN_TYPES.includes(questionType)) return acc; // unbekannter Typ: Spieler kann ihn nicht darstellen
    const isMcLike = !questionType || MC_LIKE_TYPES.includes(questionType);

    // MC-artige Fragen brauchen Optionen + mind. eine korrekte Antwort, sonst nicht spielbar
    if (isMcLike && (options.length < 2 || correctAnswerIndices.length === 0)) return acc;
    // Platzhalter ("Option A", "placeholder 1") sind keine echten Antworten; Wahr/Falsch ist davon ausgenommen.
    if (isMcLike && questionType !== 'truefalse' && !isRealOptions(options)) return acc;
    // Lückentext ohne Lücke zeigt QuizPlayer gar kein Eingabefeld; weniger Antworten als Lücken
    // ließe Lücken ohne Lösung (Benchmark 08.10.2026: 31 von 774 Lite-Fragen kamen so beim Nutzer an).
    if (questionType === 'cloze') {
      const answers = Array.isArray(q.clozeAnswers) ? q.clozeAnswers.filter((a: any) => typeof a === 'string' && a.trim()) : [];
      if (gapCount(q.clozeText) === 0 || answers.length < gapCount(q.clozeText)) return acc;
    }

    // Matching/Ranking/Numeric hatten bisher keinen Vollständigkeits-Schutz:
    // leere matchPairs/rankingItems werten in QuizPlayer.tsx per .every() auf
    // leerem Array fälschlich als "richtig" (Matching) bzw. sperren dort den
    // "Antwort prüfen"-Button dauerhaft (Ranking, kein Cloze-artiger Fallback).
    if (questionType === 'matching') {
      const validPairs = Array.isArray(q.matchPairs)
        ? q.matchPairs.filter((p: any) => p && typeof p.left === 'string' && typeof p.right === 'string')
        : [];
      if (validPairs.length === 0) return acc;
    }
    if (questionType === 'ranking') {
      const validItems = Array.isArray(q.rankingItems) ? q.rankingItems.filter((r: any) => typeof r === 'string') : [];
      if (validItems.length === 0) return acc;
    }
    // typeof-Check statt `?? 0`: 0 ist eine valide echte Antwort, "Feld fehlt"
    // darf damit nicht verwechselt werden.
    if (questionType === 'numeric' && typeof q.numericAnswer !== 'number') return acc;

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
      // Self-gelabelt im selben Generierungs-Call (kein zweiter Klassifikations-Call,
      // s. services/bloomProgression.ts) — nur übernehmen wenn ein gültiger Wert.
      bloomLevel: BLOOM_LEVELS.includes(q.bloomLevel) ? (q.bloomLevel as BloomLevel) : undefined,
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
