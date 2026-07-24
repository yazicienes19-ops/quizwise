import { describe, it, expect, beforeEach } from 'vitest';
import type { QuizQuestion } from '../types';
import { getMistakeQueue, getDueMistakes, countDueMistakes, addMistakes, rateMistake, removeMistake, examQuestionToQuizQuestion, addExamMistakes } from './mistakeReviewService';
import type { ExamQuestion } from '../types';

const mkQ = (text: string): QuizQuestion => ({
  question: text,
  options: ['A', 'B', 'C', 'D'],
  correctAnswerIndices: [0],
  isMultipleChoice: false,
  explanation: 'Erklärung',
  distractorExplanations: [],
  sourceReference: '',
  topic: 'Testthema',
});

const META = { docId: 'doc1', docName: 'Skript 1' };

describe('mistakeReviewService', () => {
  beforeEach(() => localStorage.clear());

  it('addMistakes legt Items sofort fällig an', () => {
    const n = addMistakes([mkQ('Was ist Mitose?')], META);
    expect(n).toBe(1);
    expect(getMistakeQueue()).toHaveLength(1);
    expect(getDueMistakes()).toHaveLength(1);
    expect(countDueMistakes()).toBe(1);
  });

  it('dedupet gleiche Frage (normalisierter Text) und erhöht lapses', () => {
    addMistakes([mkQ('Was ist Mitose?')], META);
    addMistakes([mkQ('  was ist   MITOSE? ')], META);
    const queue = getMistakeQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].lapses).toBe(1);
  });

  it('rateMistake(true) x3 graduiert das Item (entfernt)', () => {
    addMistakes([mkQ('Frage')], META);
    const id = getMistakeQueue()[0].id;
    rateMistake(id, true);
    rateMistake(id, true);
    expect(getMistakeQueue()).toHaveLength(1);
    rateMistake(id, true);
    expect(getMistakeQueue()).toHaveLength(0);
  });

  it('rateMistake(false) resettet Repetitions und zählt lapses', () => {
    addMistakes([mkQ('Frage')], META);
    const id = getMistakeQueue()[0].id;
    rateMistake(id, true);
    rateMistake(id, false);
    const item = getMistakeQueue()[0];
    expect(item.srs.repetitions).toBe(0);
    expect(item.lapses).toBe(1);
  });

  it('richtig beantwortete Items sind nicht mehr sofort fällig', () => {
    addMistakes([mkQ('Frage')], META);
    const id = getMistakeQueue()[0].id;
    rateMistake(id, true);
    expect(getDueMistakes()).toHaveLength(0);
    expect(getMistakeQueue()).toHaveLength(1);
  });

  it('Cap 200: älteste Items werden verworfen', () => {
    const many = Array.from({ length: 205 }, (_, i) => mkQ(`Frage Nr. ${i}`));
    addMistakes(many, META);
    expect(getMistakeQueue()).toHaveLength(200);
    // die ersten (ältesten per Insertion) 5 sind raus
    const texts = getMistakeQueue().map(i => i.question.question);
    expect(texts).not.toContain('Frage Nr. 0');
    expect(texts).toContain('Frage Nr. 204');
  });

  it('removeMistake entfernt gezielt', () => {
    addMistakes([mkQ('A'), mkQ('B')], META);
    const id = getMistakeQueue()[0].id;
    removeMistake(id);
    expect(getMistakeQueue()).toHaveLength(1);
  });

  it('kaputtes JSON im Storage → leere Queue', () => {
    localStorage.setItem('quizwise_mistake_queue', '{nicht-json');
    expect(getMistakeQueue()).toEqual([]);
  });

  it('leere Fragetexte werden übersprungen', () => {
    const n = addMistakes([mkQ('   ')], META);
    expect(n).toBe(0);
    expect(getMistakeQueue()).toHaveLength(0);
  });
});

describe('Klausur-Fehler → Queue', () => {
  beforeEach(() => localStorage.clear());

  const mcQ = (achieved: number): ExamQuestion => ({
    id: 'e1', question: 'Was ist Mitose?', type: 'mc',
    options: ['A', 'B', 'C', 'D'], correctIndices: [1],
    solution: 'B ist richtig weil …', points: 3, achievedPoints: achieved, topic: 'Zellbiologie',
  });

  it('mappt mc-Klausurfragen auf QuizQuestion', () => {
    const q = examQuestionToQuizQuestion(mcQ(0))!;
    expect(q.options).toHaveLength(4);
    expect(q.correctAnswerIndices).toEqual([1]);
    expect(q.explanation).toContain('richtig');
    expect(q.topic).toBe('Zellbiologie');
  });

  it('mappt einfaches truefalse; TF mit Begründungsoptionen requeued nur die Kernaussage (Phase 4)', () => {
    const tf: ExamQuestion = { id: 'e2', question: 'Aussage X', type: 'truefalse', tfCorrect: false, solution: '', points: 2 };
    expect(examQuestionToQuizQuestion(tf)?.correctAnswerIndices).toEqual([1]);
    const tfReason: ExamQuestion = { ...tf, tfReasonOptions: ['Weil A', 'Weil B'] };
    const mapped = examQuestionToQuizQuestion(tfReason);
    expect(mapped?.correctAnswerIndices).toEqual([1]);
    expect(mapped?.questionType).toBe('truefalse');
  });

  it('mappt matching auf matchPairs', () => {
    const matching: ExamQuestion = {
      id: 'e3', question: 'Ordne zu', type: 'matching',
      matchLeft: ['Pawlow', 'Skinner'], matchRight: ['Operante Konditionierung', 'Klassische Konditionierung'],
      matchCorrect: [1, 0], solution: '', points: 4,
    };
    const q = examQuestionToQuizQuestion(matching)!;
    expect(q.questionType).toBe('matching');
    expect(q.matchPairs).toEqual([
      { left: 'Pawlow', right: 'Klassische Konditionierung' },
      { left: 'Skinner', right: 'Operante Konditionierung' },
    ]);
  });

  it('mappt fillblank auf cloze ([LÜCKE] → __LÜCKE__)', () => {
    const fillblank: ExamQuestion = {
      id: 'e4', question: 'Vervollständige', type: 'fillblank',
      blankText: 'Ein [LÜCKE] löst eine [LÜCKE] aus.', blanks: ['Reiz', 'Reaktion'],
      solution: '', points: 4,
    };
    const q = examQuestionToQuizQuestion(fillblank)!;
    expect(q.questionType).toBe('cloze');
    expect(q.clozeText).toBe('Ein __LÜCKE__ löst eine __LÜCKE__ aus.');
    expect(q.clozeAnswers).toEqual(['Reiz', 'Reaktion']);
  });

  it('mappt ranking direkt (gleiche Feldform)', () => {
    const ranking: ExamQuestion = { id: 'e5', question: 'Sortiere', type: 'ranking', rankingItems: ['A', 'B', 'C'], solution: '', points: 3 };
    expect(examQuestionToQuizQuestion(ranking)?.rankingItems).toEqual(['A', 'B', 'C']);
    expect(examQuestionToQuizQuestion(ranking)?.questionType).toBe('ranking');
  });

  it('mappt numeric direkt (gleiche Feldform)', () => {
    const numeric: ExamQuestion = { id: 'e6', question: 'Wie viel?', type: 'numeric', numericAnswer: 42, numericTolerance: 2, solution: '', points: 2 };
    const q = examQuestionToQuizQuestion(numeric)!;
    expect(q.numericAnswer).toBe(42);
    expect(q.numericTolerance).toBe(2);
    expect(q.questionType).toBe('numeric');
  });

  it('mappt open als Selbsteinschätzungs-Frage (kein Bewertungs-Call bei Wiederholung)', () => {
    const open: ExamQuestion = { id: 'e7', question: 'Erkläre …', type: 'open', solution: 'Musterantwort', points: 5 };
    const q = examQuestionToQuizQuestion(open)!;
    expect(q.questionType).toBe('open');
    expect(q.explanation).toBe('Musterantwort');
    expect(q.options).toEqual([]);
  });

  it('unvollständige Daten liefern weiterhin null statt kaputter Objekte', () => {
    expect(examQuestionToQuizQuestion({ id: 'x', question: 'Q', type: 'matching', solution: '', points: 4 })).toBeNull();
    expect(examQuestionToQuizQuestion({ id: 'x', question: 'Q', type: 'fillblank', solution: '', points: 4 })).toBeNull();
    expect(examQuestionToQuizQuestion({ id: 'x', question: 'Q', type: 'ranking', solution: '', points: 4 })).toBeNull();
    expect(examQuestionToQuizQuestion({ id: 'x', question: 'Q', type: 'numeric', solution: '', points: 4 })).toBeNull();
    expect(examQuestionToQuizQuestion({ id: 'x', question: 'Q', type: 'open', solution: '', points: 4 })).toBeNull();
  });

  it('addExamMistakes reiht jetzt auch nicht-mc-Fragen unter 50% der Punkte ein', () => {
    const n = addExamMistakes([mcQ(0), mcQ(3), { id: 'e8', question: 'Offen', type: 'open', solution: 'Antwort', points: 5, achievedPoints: 0 }], { docId: 'x', docName: 'Klausur' });
    expect(n).toBe(2); // falsche mc-Frage + offene Frage; volle Punkte fallen raus
    expect(getMistakeQueue()).toHaveLength(2);
  });
});
