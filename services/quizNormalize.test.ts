import { describe, it, expect } from 'vitest';
import { normalizeQuizQuestions, parseQuizQuestions, quizMcNeedsRepair } from './quizNormalize';

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

  it('verwirft Matching-Fragen mit leerem matchPairs-Array', () => {
    const result = normalizeQuizQuestions([
      { question: 'Ordne zu.', questionType: 'matching', matchPairs: [] },
    ]);
    expect(result).toEqual([]);
  });

  it('verwirft Matching-Fragen ohne matchPairs-Feld', () => {
    const result = normalizeQuizQuestions([
      { question: 'Ordne zu.', questionType: 'matching' },
    ]);
    expect(result).toEqual([]);
  });

  it('behält eine vollständige Matching-Frage', () => {
    const [q] = normalizeQuizQuestions([
      { question: 'Ordne zu.', questionType: 'matching', matchPairs: [{ left: 'A', right: 'B' }] },
    ]);
    expect(q.matchPairs).toEqual([{ left: 'A', right: 'B' }]);
  });

  it('verwirft Ranking-Fragen mit leerem rankingItems-Array', () => {
    const result = normalizeQuizQuestions([
      { question: 'Sortiere.', questionType: 'ranking', rankingItems: [] },
    ]);
    expect(result).toEqual([]);
  });

  it('behält eine vollständige Ranking-Frage', () => {
    const [q] = normalizeQuizQuestions([
      { question: 'Sortiere.', questionType: 'ranking', rankingItems: ['1', '2', '3'] },
    ]);
    expect(q.rankingItems).toEqual(['1', '2', '3']);
  });

  it('verwirft Numeric-Fragen ohne numericAnswer-Feld', () => {
    const result = normalizeQuizQuestions([
      { question: 'Wie viele?', questionType: 'numeric' },
    ]);
    expect(result).toEqual([]);
  });

  it('behält eine Numeric-Frage mit numericAnswer 0 (echte valide Antwort, kein Fallback-Verwechsler)', () => {
    const [q] = normalizeQuizQuestions([
      { question: 'Wie viele Fehler?', questionType: 'numeric', numericAnswer: 0 },
    ]);
    expect(q.numericAnswer).toBe(0);
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

describe('normalizeQuizQuestions — Benchmark-Befunde 08.10.2026', () => {
  const mc = (over: object = {}) => ({ question: 'Was misst das EEG?', questionType: 'mc', options: ['Hirnaktivität', 'Puls', 'Muskeltonus', 'Augenbewegung'], correctAnswerIndices: [0], explanation: 'Hirnaktivität', ...over });

  it('erfundene Typnamen werden auf echte abgebildet', () => {
    const [single] = normalizeQuizQuestions([mc({ questionType: 'single-choice' })]);
    expect(single.questionType).toBe('mc');
    expect(single.isMultipleChoice).toBe(false);
    const [multi] = normalizeQuizQuestions([mc({ questionType: 'multiple-choice', correctAnswerIndices: [0, 1] })]);
    expect(multi.questionType).toBe('mc');
    expect(multi.isMultipleChoice).toBe(true);
  });

  it('unbekannte Typen fliegen raus statt kaputt angezeigt zu werden', () => {
    expect(normalizeQuizQuestions([mc({ questionType: 'essay' })])).toHaveLength(0);
  });

  it('Lückentext: ohne Lücke raus, Lücke aus der Frage wird übernommen', () => {
    expect(normalizeQuizQuestions([{ question: 'Ergänze den Satz.', questionType: 'cloze', clozeAnswers: ['Wundt'] }])).toHaveLength(0);
    const [ok] = normalizeQuizQuestions([{ question: '__LÜCKE__ gründete 1879 das Labor.', questionType: 'cloze', clozeAnswers: ['Wundt'] }]);
    expect(ok.clozeText).toBe('__LÜCKE__ gründete 1879 das Labor.');
    expect(normalizeQuizQuestions([{ question: 'x', questionType: 'cloze', clozeText: '__LÜCKE__ und __LÜCKE__', clozeAnswers: ['a'] }])).toHaveLength(0);
  });

  it('Platzhalter-Optionen gelten nicht, Wahr/Falsch bleibt erlaubt', () => {
    expect(normalizeQuizQuestions([mc({ options: ['Option A', 'Option B', 'Option C', 'Option D'] })])).toHaveLength(0);
    expect(normalizeQuizQuestions([mc({ questionType: 'truefalse', options: ['Wahr', 'Falsch'], correctAnswerIndices: [0] })])).toHaveLength(1);
  });

  it('quizMcNeedsRepair: fehlende Lösung oder Optionen, nicht bei anderen Typen', () => {
    expect(quizMcNeedsRepair(mc())).toBe(false);
    expect(quizMcNeedsRepair(mc({ correctAnswerIndices: [] }))).toBe(true);
    expect(quizMcNeedsRepair(mc({ questionType: 'single-choice', correctAnswerIndices: undefined }))).toBe(true);
    expect(quizMcNeedsRepair(mc({ options: [] }))).toBe(true);
    expect(quizMcNeedsRepair({ question: 'x', questionType: 'open' })).toBe(false);
  });
});
