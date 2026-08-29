import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ResultView } from './ResultView';
import { I18nProvider } from '../i18n/I18nProvider';
import type { QuizQuestion, UserAnswer } from '../types';

const baseQuestion = (overrides: Partial<QuizQuestion>): QuizQuestion => ({
  question: '',
  options: [],
  correctAnswerIndices: [],
  isMultipleChoice: false,
  explanation: '',
  distractorExplanations: [],
  sourceReference: '',
  ...overrides,
});

// Simuliert, was die adaptive Umsortierung (services/adaptiveQuizOrder.ts) live
// erzeugen kann: Frage 1 (Index 0) wird ZULETZT beantwortet, Frage 0 (Index 1)
// ZUERST — answers[] liegt also nicht in questions[]-Reihenfolge vor.
const questions: QuizQuestion[] = [
  baseQuestion({ question: 'Frage A (Index 0)', topic: 'Thema A' }),
  baseQuestion({ question: 'Frage B (Index 1)', topic: 'Thema B' }),
];
const answers: UserAnswer[] = [
  { questionIndex: 1, selectedOptionIndices: [], isCorrect: true, textAnswer: 'Antwort auf B' },
  { questionIndex: 0, selectedOptionIndices: [], isCorrect: false, textAnswer: 'Antwort auf A' },
];

const renderResult = () =>
  render(
    <I18nProvider>
      <ResultView answers={answers} questions={questions} onRestart={() => {}} />
    </I18nProvider>,
  );

describe('ResultView — Frage/Antwort-Zuordnung bei außer der Reihe beantworteten Fragen (regression)', () => {
  it('zeigt bei jeder Frage die zu ihrem eigenen questionIndex gehörende Antwort, nicht die per Array-Position', () => {
    renderResult();

    fireEvent.click(screen.getByText('Frage A (Index 0)'));
    expect(screen.getByText('Antwort auf A')).toBeTruthy();

    fireEvent.click(screen.getByText('Frage B (Index 1)'));
    expect(screen.getByText('Antwort auf B')).toBeTruthy();
  });

  it('ordnet Thema A den Schwächen und Thema B den Stärken zu — trotz vertauschter Array-Position', () => {
    renderResult();
    // Frage A (questions[0]) gehört laut questionIndex zu answers[1] (isCorrect: false),
    // Frage B (questions[1]) zu answers[0] (isCorrect: true). Ein Bug mit answers[i]
    // statt questionIndex-Lookup würde die beiden Themen genau vertauscht einordnen.
    const topicChip = (label: string) => screen.getAllByText(label).find(el => el.className.includes('rounded-full'));
    expect(topicChip('Thema A')?.className).toContain('rose');
    expect(topicChip('Thema B')?.className).toContain('emerald');
  });
});
