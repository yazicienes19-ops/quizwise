import { describe, it, expect } from 'vitest';
import { normalizeQuizQuestions, parseQuizQuestions } from './quizNormalize';

describe('normalizeQuizQuestions', () => {
  it('füllt fehlende correctAnswerIndices statt zu crashen (der heutige Bug)', () => {
    const result = normalizeQuizQuestions([
      { question: 'Was ist 1+1?', options: ['1', '2', '3'], isMultipleChoice: false },
    ]);
    // Frage hat keine gültige Antwort → wird als nicht spielbar entfernt, nicht undefined
    expect(result).toEqual([]);
  });

  it('behält eine vollständige MC-Frage und ergänzt fehlende optionale Felder', () => {
    const [q] = normalizeQuizQuestions([
      {
        question: 'Hauptstadt von Frankreich?',
        options: ['Berlin', 'Paris', 'Rom'],
        correctAnswerIndices: [1],
        isMultipleChoice: false,
        explanation: 'Paris ist die Hauptstadt.',
        sourceReference: 'S. 1',
      },
    ]);
    expect(q.correctAnswerIndices).toEqual([1]);
    expect(q.distractorExplanations).toEqual([]); // fehlte → sicherer Default
    expect(Array.isArray(q.options)).toBe(true);
  });

  it('entfernt Antwort-Indizes, die außerhalb der Optionen liegen', () => {
    const [q] = normalizeQuizQuestions([
      {
        question: 'Test?',
        options: ['A', 'B'],
        correctAnswerIndices: [0, 5, -1], // 5 und -1 sind ungültig
        isMultipleChoice: true,
      },
    ]);
    expect(q.correctAnswerIndices).toEqual([0]);
  });

  it('erlaubt offene Fragen ohne Optionen', () => {
    const [q] = normalizeQuizQuestions([
      { question: 'Erkläre Klassische Konditionierung.', questionType: 'open', explanation: 'Musterantwort' },
    ]);
    expect(q.questionType).toBe('open');
    expect(q.options).toEqual([]);
  });

  it('verwirft Einträge ohne Fragetext und Nicht-Objekte', () => {
    const result = normalizeQuizQuestions([
      null,
      'kaputt',
      { options: ['A', 'B'], correctAnswerIndices: [0] }, // keine question
    ]);
    expect(result).toEqual([]);
  });

  it('gibt bei Nicht-Arrays ein leeres Array zurück', () => {
    expect(normalizeQuizQuestions(null)).toEqual([]);
    expect(normalizeQuizQuestions({})).toEqual([]);
    expect(normalizeQuizQuestions(undefined)).toEqual([]);
  });
});

describe('parseQuizQuestions', () => {
  it('parst gültiges JSON', () => {
    const json = JSON.stringify([
      { question: 'Q?', options: ['A', 'B'], correctAnswerIndices: [0], isMultipleChoice: false },
    ]);
    expect(parseQuizQuestions(json)).toHaveLength(1);
  });

  it('gibt bei kaputtem JSON ein leeres Array zurück statt zu werfen', () => {
    expect(parseQuizQuestions('{nicht: valide')).toEqual([]);
    expect(parseQuizQuestions('')).toEqual([]);
  });
});
