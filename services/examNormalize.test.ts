import { describe, it, expect } from 'vitest';
import { normalizeExamQuestions } from './examNormalize';

const mc = (over: object = {}) => ({
  id: 'q1', question: 'Was ist X?', type: 'mc', solution: 'A', points: 3,
  options: ['A', 'B', 'C', 'D'], correctIndices: [0], ...over,
});

describe('normalizeExamQuestions', () => {
  it('gültige Fragen passieren unverändert', () => {
    const out = normalizeExamQuestions([mc()]);
    expect(out).toHaveLength(1);
    expect(out[0].points).toBe(3);
  });

  it('MC ohne correctIndices fliegt raus statt 0 Punkte zu kosten', () => {
    expect(normalizeExamQuestions([mc({ correctIndices: [] })])).toHaveLength(0);
    expect(normalizeExamQuestions([mc({ correctIndices: undefined })])).toHaveLength(0);
  });

  it('MC mit Index außerhalb der Optionen wird bereinigt bzw. verworfen', () => {
    const out = normalizeExamQuestions([mc({ correctIndices: [0, 9] })]);
    expect(out[0].correctIndices).toEqual([0]);
    expect(normalizeExamQuestions([mc({ correctIndices: [9] })])).toHaveLength(0);
  });

  it('unbekannter Typ und kaputte Einträge fliegen raus', () => {
    expect(normalizeExamQuestions([mc({ type: 'essay' }), null, 'x', { type: 'mc' }])).toHaveLength(0);
    expect(normalizeExamQuestions('kein array' as any)).toEqual([]);
  });

  it('ungültige Punkte bekommen Default 2, fehlende id wird vergeben', () => {
    const out = normalizeExamQuestions([mc({ points: -1, id: '' })]);
    expect(out[0].points).toBe(2);
    expect(out[0].id).toBe('q1');
  });

  it('truefalse: kaputter Begründungsschritt wird gestrippt, Frage bleibt', () => {
    const out = normalizeExamQuestions([{
      id: 'q1', question: 'W/F?', type: 'truefalse', solution: 'x', points: 2,
      tfCorrect: true, tfReasonOptions: ['a', 'b', 'c'], tfCorrectReasonIndex: 7,
    }]);
    expect(out).toHaveLength(1);
    expect(out[0].tfReasonOptions).toEqual([]);
    expect(out[0].tfCorrectReasonIndex).toBeUndefined();
  });

  it('truefalse ohne tfCorrect fliegt raus', () => {
    expect(normalizeExamQuestions([{ id: 'q1', question: 'W/F?', type: 'truefalse', solution: 'x', points: 2 }])).toHaveLength(0);
  });

  it('matching: Länge/Index-Prüfung', () => {
    const ok = { id: 'q1', question: 'Ordne zu', type: 'matching', solution: 'x', points: 4, matchLeft: ['a', 'b'], matchRight: ['1', '2'], matchCorrect: [1, 0] };
    expect(normalizeExamQuestions([ok])).toHaveLength(1);
    expect(normalizeExamQuestions([{ ...ok, matchCorrect: [1] }])).toHaveLength(0);
    expect(normalizeExamQuestions([{ ...ok, matchCorrect: [1, 5] }])).toHaveLength(0);
  });

  it('open ohne Musterlösung fliegt raus (Rubrik hätte keine Basis)', () => {
    expect(normalizeExamQuestions([{ id: 'q1', question: 'Erkläre X', type: 'open', solution: '', points: 8 }])).toHaveLength(0);
    expect(normalizeExamQuestions([{ id: 'q1', question: 'Erkläre X', type: 'open', solution: 'Weil…', points: 8 }])).toHaveLength(1);
  });

  const open = (rubricCriteria: unknown, points = 8) => ({
    id: 'q1', question: 'Erkläre X', type: 'open', solution: 'Weil…', points, rubricCriteria,
  });

  it('Erwartungshorizont: Punktsumme der Kriterien ist die Autorität', () => {
    const out = normalizeExamQuestions([open([{ name: 'Definition', maxPoints: 3 }, { name: 'Beispiel', maxPoints: 3 }], 8)]);
    expect(out[0].rubricCriteria).toHaveLength(2);
    expect(out[0].points).toBe(6);
  });

  it('Erwartungshorizont: kaputte Einträge werden gefiltert, max 4 Kriterien', () => {
    const out = normalizeExamQuestions([open([
      { name: 'A', maxPoints: 2 }, { name: '', maxPoints: 2 }, { name: 'B', maxPoints: 0 },
      { name: 'C', maxPoints: 2 }, { name: 'D', maxPoints: 2 }, { name: 'E', maxPoints: 2 }, { name: 'F', maxPoints: 2 },
    ])]);
    expect(out[0].rubricCriteria!.map(c => c.name)).toEqual(['A', 'C', 'D', 'E']);
    expect(out[0].points).toBe(8);
  });

  it('Erwartungshorizont: unter 2 brauchbaren Kriterien oder absurde Summe → Rubrik weg, Frage bleibt', () => {
    const single = normalizeExamQuestions([open([{ name: 'A', maxPoints: 5 }])]);
    expect(single[0].rubricCriteria).toBeUndefined();
    expect(single[0].points).toBe(8);
    const huge = normalizeExamQuestions([open([{ name: 'A', maxPoints: 50 }, { name: 'B', maxPoints: 50 }])]);
    expect(huge[0].rubricCriteria).toBeUndefined();
    expect(normalizeExamQuestions([open('kein array')])[0].rubricCriteria).toBeUndefined();
  });

  it('Erwartungshorizont: sourceReference bleibt erhalten statt beim Rebuild verworfen zu werden (Phase-3-Regression)', () => {
    const out = normalizeExamQuestions([open([
      { name: 'Definition', maxPoints: 3, sourceReference: 'Kapitel 2, Absatz zur Reizkopplung' },
      { name: 'Beispiel', maxPoints: 3 },
    ], 8)]);
    expect(out[0].rubricCriteria![0].sourceReference).toBe('Kapitel 2, Absatz zur Reizkopplung');
    expect(out[0].rubricCriteria![1].sourceReference).toBeUndefined();
  });

  it('Erwartungshorizont: leerer/blank sourceReference wird zu undefined statt leerem String', () => {
    const out = normalizeExamQuestions([open([
      { name: 'Definition', maxPoints: 3, sourceReference: '   ' },
      { name: 'Beispiel', maxPoints: 3 },
    ], 8)]);
    expect(out[0].rubricCriteria![0].sourceReference).toBeUndefined();
  });

  it('numeric ohne Zahl fliegt raus, Toleranz-Default 0', () => {
    expect(normalizeExamQuestions([{ id: 'q1', question: '2+2?', type: 'numeric', solution: '4', points: 2 }])).toHaveLength(0);
    const out = normalizeExamQuestions([{ id: 'q1', question: '2+2?', type: 'numeric', solution: '4', points: 2, numericAnswer: 4, numericTolerance: -1 }]);
    expect(out[0].numericTolerance).toBe(0);
  });

  it('fillblank/ranking: Mindestanforderungen', () => {
    expect(normalizeExamQuestions([{ id: 'q1', question: 'Fülle', type: 'fillblank', solution: 'x', points: 2, blankText: 'Der ___', blanks: ['Hund'] }])).toHaveLength(1);
    expect(normalizeExamQuestions([{ id: 'q1', question: 'Fülle', type: 'fillblank', solution: 'x', points: 2, blankText: '', blanks: ['Hund'] }])).toHaveLength(0);
    expect(normalizeExamQuestions([{ id: 'q1', question: 'Sortiere', type: 'ranking', solution: 'x', points: 2, rankingItems: ['a'] }])).toHaveLength(0);
  });
});
