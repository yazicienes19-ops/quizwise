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

  it('mappt einfaches truefalse; TF mit Begründungsoptionen wird übersprungen', () => {
    const tf: ExamQuestion = { id: 'e2', question: 'Aussage X', type: 'truefalse', tfCorrect: false, solution: '', points: 2 };
    expect(examQuestionToQuizQuestion(tf)?.correctAnswerIndices).toEqual([1]);
    const tfReason: ExamQuestion = { ...tf, tfReasonOptions: ['Weil A', 'Weil B'] };
    expect(examQuestionToQuizQuestion(tfReason)).toBeNull();
  });

  it('open/matching liefern null', () => {
    const open: ExamQuestion = { id: 'e3', question: 'Erkläre …', type: 'open', solution: '', points: 5 };
    expect(examQuestionToQuizQuestion(open)).toBeNull();
  });

  it('addExamMistakes reiht nur Fragen unter 50% der Punkte ein', () => {
    const n = addExamMistakes([mcQ(0), mcQ(3), { id: 'e4', question: 'Offen', type: 'open', solution: '', points: 5, achievedPoints: 0 }], { docId: 'x', docName: 'Klausur' });
    expect(n).toBe(1); // nur die falsche mc-Frage; volle Punkte + open fallen raus
    expect(getMistakeQueue()).toHaveLength(1);
  });
});
