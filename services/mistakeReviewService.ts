import type { QuizQuestion, ExamQuestion } from '../types';
import { SrsState, createSrsState, reviewCard, getDueCards, ReviewQuality } from './spacedRepetition';
import { t } from '../i18n';

/**
 * mistakeReviewService — SM-2-geplante Wiederholung falsch beantworteter Quizfragen.
 *
 * Falsche Fragen landen sofort fällig in der Queue. Richtig beantwortet →
 * Intervall wächst (GOOD), falsch → Reset (BLACKOUT). Nach 3 richtigen
 * Wiederholungen in Folge (oder Intervall > 30 Tage) gilt die Frage als
 * gemeistert und wird entfernt.
 */

export interface MistakeItem {
  id: string;
  /** Volle Frage eingebettet — replaybar ohne Zugriff auf das Ursprungsdokument. */
  question: QuizQuestion;
  docId: string;
  docName: string;
  addedAt: number;
  /** Wie oft die Frage erneut falsch beantwortet wurde. */
  lapses: number;
  srs: SrsState;
}

const STORAGE_KEY = 'quizwise_mistake_queue';
const MAX_ITEMS = 200;
const GRADUATE_REPETITIONS = 3;
const GRADUATE_INTERVAL_DAYS = 30;

/** Identität einer Frage: normalisierter Fragetext (Dedupe über Quiz-Läufe hinweg). */
const normalizeQuestion = (text: string): string =>
  text.trim().toLowerCase().replace(/\s+/g, ' ');

const readAll = (): MistakeItem[] => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
};

const write = (items: MistakeItem[], userId?: string | null): void => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch {}
  if (userId) {
    import('./syncService').then(({ syncLearningField }) => syncLearningField(userId, 'mistake_queue', items)).catch(() => {});
  }
};

export const getMistakeQueue = (): MistakeItem[] => readAll();

/** Entfernt alle Queue-Einträge eines Dokuments (Kaskade beim Löschen der letzten Session). */
export const removeMistakesByDocName = (docName: string, userId?: string | null): void => {
  const remaining = readAll().filter(m => m.docName !== docName);
  write(remaining, userId);
};

export const getDueMistakes = (): MistakeItem[] => getDueCards(readAll());

export const countDueMistakes = (): number => getDueMistakes().length;

/**
 * Reiht falsch beantwortete Fragen ein. Bereits bekannte Fragen (gleicher
 * normalisierter Text) werden nicht dupliziert, sondern zurückgesetzt
 * (SRS-Reset + lapses++). Rückgabe: Anzahl betroffener Items.
 */
export const addMistakes = (
  wrongQuestions: QuizQuestion[],
  meta: { docId: string; docName: string },
  userId?: string | null
): number => {
  if (!wrongQuestions.length) return 0;
  const items = readAll();
  const byText = new Map(items.map(i => [normalizeQuestion(i.question.question), i]));
  let affected = 0;

  for (const q of wrongQuestions) {
    const key = normalizeQuestion(q.question);
    if (!key) continue;
    const existing = byText.get(key);
    if (existing) {
      existing.srs = reviewCard(existing.srs, ReviewQuality.BLACKOUT);
      existing.lapses += 1;
      existing.question = q; // frische Erklärung/Optionen übernehmen
    } else {
      const item: MistakeItem = {
        id: Math.random().toString(36).slice(2, 9),
        question: q,
        docId: meta.docId,
        docName: meta.docName,
        addedAt: Date.now(),
        lapses: 0,
        srs: createSrsState(), // sofort fällig
      };
      items.push(item);
      byText.set(key, item);
    }
    affected += 1;
  }

  // Cap: älteste Items verwerfen
  items.sort((a, b) => a.addedAt - b.addedAt);
  const capped = items.slice(Math.max(0, items.length - MAX_ITEMS));

  write(capped, userId);
  return affected;
};

/**
 * Bewertet ein Item nach einer Review-Antwort. Richtig → GOOD, falsch →
 * BLACKOUT (Reset). Graduierte Items (>= 3 Wiederholungen oder Intervall
 * > 30 Tage) werden entfernt.
 */
export const rateMistake = (id: string, correct: boolean, userId?: string | null): void => {
  const items = readAll();
  const item = items.find(i => i.id === id);
  if (!item) return;

  item.srs = reviewCard(item.srs, correct ? ReviewQuality.GOOD : ReviewQuality.BLACKOUT);
  if (!correct) item.lapses += 1;

  const graduated = item.srs.repetitions >= GRADUATE_REPETITIONS || item.srs.interval > GRADUATE_INTERVAL_DAYS;
  write(graduated ? items.filter(i => i.id !== id) : items, userId);
};

export const removeMistake = (id: string, userId?: string | null): void => {
  const items = readAll();
  const next = items.filter(i => i.id !== id);
  if (next.length !== items.length) write(next, userId);
};

// ─── Klausur-Fehler → Wiederholungs-Queue ────────────────────────────────────

/**
 * Wandelt eine Klausurfrage in eine replaybare QuizQuestion um — für ALLE 7
 * Klausur-Fragetypen (Phase 4 Klausursimulator 2.0; vorher nur mc und
 * reduktionsfreies truefalse). QuizPlayer.tsx unterstützt matching/cloze/
 * ranking/numeric/open bereits vollständig (eigenständiges Multi-Typ-Quiz-
 * Feature), diese Funktion nutzt exakt dieselben Feldformen.
 */
export const examQuestionToQuizQuestion = (q: ExamQuestion): QuizQuestion | null => {
  if (q.type === 'mc' && q.options?.length && q.correctIndices?.length) {
    return {
      question: q.question,
      options: q.options,
      correctAnswerIndices: q.correctIndices,
      isMultipleChoice: q.correctIndices.length > 1,
      explanation: q.solution || '',
      distractorExplanations: [],
      sourceReference: '',
      topic: q.topic,
      questionType: 'mc',
      ...(q.scenarioText ? { scenarioText: q.scenarioText } : {}),
    };
  }
  if (q.type === 'truefalse' && typeof q.tfCorrect === 'boolean') {
    // TF-mit-Begründung: nur die Kernaussage requeuen, Begründungsoptionen
    // bewusst fallenlassen — die Wiederholung prüft den Fakt, nicht die
    // ursprüngliche Mehrfachauswahl-Begründung.
    return {
      question: q.question,
      options: [t('tf.true'), t('tf.false')],
      correctAnswerIndices: [q.tfCorrect ? 0 : 1],
      isMultipleChoice: false,
      explanation: q.solution || '',
      distractorExplanations: [],
      sourceReference: '',
      topic: q.topic,
      questionType: 'truefalse',
    };
  }
  if (q.type === 'matching' && q.matchLeft?.length && q.matchRight?.length && q.matchCorrect?.length) {
    const matchPairs = q.matchLeft
      .map((left, i) => ({ left, right: q.matchRight![q.matchCorrect![i]] }))
      .filter(p => typeof p.right === 'string');
    if (matchPairs.length !== q.matchLeft.length) return null;
    return {
      question: q.question,
      options: [],
      correctAnswerIndices: [],
      isMultipleChoice: false,
      explanation: q.solution || '',
      distractorExplanations: [],
      sourceReference: '',
      topic: q.topic,
      questionType: 'matching',
      matchPairs,
    };
  }
  if (q.type === 'fillblank' && q.blankText && q.blanks?.length) {
    return {
      question: q.question,
      options: [],
      correctAnswerIndices: [],
      isMultipleChoice: false,
      explanation: q.solution || '',
      distractorExplanations: [],
      sourceReference: '',
      topic: q.topic,
      questionType: 'cloze',
      clozeText: q.blankText.split('[LÜCKE]').join('__LÜCKE__'),
      clozeAnswers: q.blanks,
    };
  }
  if (q.type === 'ranking' && q.rankingItems?.length) {
    return {
      question: q.question,
      options: [],
      correctAnswerIndices: [],
      isMultipleChoice: false,
      explanation: q.solution || '',
      distractorExplanations: [],
      sourceReference: '',
      topic: q.topic,
      questionType: 'ranking',
      rankingItems: q.rankingItems,
    };
  }
  if (q.type === 'numeric' && typeof q.numericAnswer === 'number') {
    return {
      question: q.question,
      options: [],
      correctAnswerIndices: [],
      isMultipleChoice: false,
      explanation: q.solution || '',
      distractorExplanations: [],
      sourceReference: '',
      topic: q.topic,
      questionType: 'numeric',
      numericAnswer: q.numericAnswer,
      numericTolerance: q.numericTolerance ?? 0,
    };
  }
  if (q.type === 'open' && q.solution?.trim()) {
    // Selbsteinschätzung wie beim regulären Multi-Typ-Quiz (QuizPlayer.tsx
    // isOpen-Zweig) — keine automatische Bewertung bei der Wiederholung.
    return {
      question: q.question,
      options: [],
      correctAnswerIndices: [],
      isMultipleChoice: false,
      explanation: q.solution,
      distractorExplanations: [],
      sourceReference: '',
      topic: q.topic,
      questionType: 'open',
    };
  }
  return null;
};

/**
 * Reiht falsch beantwortete Klausurfragen (unter 50% der Punkte) ein,
 * soweit sie als QuizQuestion abbildbar sind. Rückgabe: Anzahl eingereiht.
 */
export const addExamMistakes = (
  examQuestions: ExamQuestion[],
  meta: { docId: string; docName: string },
  userId?: string | null
): number => {
  const wrong = examQuestions.filter(q => q.points > 0 && (q.achievedPoints ?? 0) / q.points < 0.5);
  const mapped = wrong.map(examQuestionToQuizQuestion).filter((q): q is QuizQuestion => q !== null);
  return addMistakes(mapped, meta, userId);
};
