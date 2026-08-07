import { describe, it, expect } from 'vitest';
import { pickNextQuestionIndex, computeTopicStreak } from './adaptiveQuizOrder';
import type { QuizQuestion, UserAnswer } from '../types';

const q = (topic: string, bloomLevel?: QuizQuestion['bloomLevel']): QuizQuestion => ({
  question: `Frage zu ${topic}`,
  options: ['a', 'b'],
  correctAnswerIndices: [0],
  isMultipleChoice: false,
  explanation: '',
  distractorExplanations: [],
  sourceReference: '',
  topic,
  bloomLevel,
});

const ans = (questionIndex: number, isCorrect: boolean): UserAnswer => ({
  questionIndex, selectedOptionIndices: [], isCorrect,
});

describe('pickNextQuestionIndex — Neutralität ohne bloomLevel', () => {
  it('verhält sich exakt sequenziell, wenn keine Frage ein bloomLevel hat (Mistake-Review, Altbestand)', () => {
    const questions = [q('A'), q('B'), q('A'), q('B')];
    expect(pickNextQuestionIndex(questions, [])).toBe(0);
    expect(pickNextQuestionIndex(questions, [ans(0, true)])).toBe(1);
    expect(pickNextQuestionIndex(questions, [ans(0, true), ans(1, true)])).toBe(2);
  });

  it('gibt -1 zurück, wenn alle Fragen beantwortet sind', () => {
    const questions = [q('A'), q('B')];
    expect(pickNextQuestionIndex(questions, [ans(0, true), ans(1, false)])).toBe(-1);
  });
});

describe('pickNextQuestionIndex — Vorziehen bei besserem Fit', () => {
  it('zieht eine spätere, besser passende Frage desselben Themas vor', () => {
    // Thema A: 3 Fragen. Erste unbeantwortete (Index 1, nach Index 0 bereits
    // richtig beantwortet dreimal in Folge -> Ziel-Level "anwenden") ist
    // "erinnern" getaggt, aber Index 3 (später, selbes Thema) ist "anwenden".
    const questions = [
      q('A', 'erinnern'), // 0 - schon beantwortet
      q('A', 'erinnern'), // 1 - schon beantwortet
      q('A', 'erinnern'), // 2 - schon beantwortet -> 3 richtige in Folge, Ziel jetzt "anwenden"
      q('A', 'erinnern'), // 3 - Standard-Kandidat, passt NICHT zum Ziel
      q('A', 'anwenden'), // 4 - passt besser
    ];
    const answers = [ans(0, true), ans(1, true), ans(2, true)];
    expect(pickNextQuestionIndex(questions, answers)).toBe(4);
  });

  it('bleibt beim Standard-Kandidaten, wenn dessen bloomLevel bereits zum Ziel passt', () => {
    const questions = [
      q('A', 'erinnern'),
      q('A', 'erinnern'),
      q('A', 'erinnern'),
      q('A', 'erinnern'), // Ziel nach 3 richtigen bleibt "erinnern" bis Streak=2 -> "verstehen"
    ];
    const answers = [ans(0, true), ans(1, true)];
    // Streak=2 -> Ziel "verstehen", Standard-Kandidat (Index 2) ist "erinnern" -> keine
    // spätere "verstehen"-Frage vorhanden -> bleibt beim Standard-Kandidaten.
    expect(pickNextQuestionIndex(questions, answers)).toBe(2);
  });

  it('wirkt niemals themenübergreifend — ein anderes Thema wird nie vorgezogen', () => {
    const questions = [
      q('A', 'erinnern'), // 0 - beantwortet
      q('A', 'erinnern'), // 1 - beantwortet
      q('A', 'erinnern'), // 2 - beantwortet -> Thema A Streak=3, Ziel "anwenden"
      q('A', 'erinnern'), // 3 - Standard-Kandidat für Thema A, passt nicht
      q('B', 'anwenden'), // 4 - passendes Level, aber ANDERES Thema -> darf nicht gewählt werden
    ];
    const answers = [ans(0, true), ans(1, true), ans(2, true)];
    expect(pickNextQuestionIndex(questions, answers)).toBe(3);
  });
});

describe('computeTopicStreak', () => {
  it('zählt nur aufeinanderfolgende richtige Antworten am Ende, getrennt pro Thema — eine falsche Antwort in einem ANDEREN Thema unterbricht den eigenen Streak nicht', () => {
    const questions = [q('A'), q('B'), q('A'), q('A')];
    const answers = [ans(0, true), ans(1, false), ans(2, true), ans(3, true)];
    expect(computeTopicStreak('A', questions, answers)).toBe(3);
    expect(computeTopicStreak('B', questions, answers)).toBe(0);
  });

  it('ein falsches Ergebnis im eigenen Thema unterbricht den Streak', () => {
    const questions = [q('A'), q('A'), q('A')];
    const answers = [ans(0, true), ans(1, false), ans(2, true)];
    expect(computeTopicStreak('A', questions, answers)).toBe(1);
  });
});
