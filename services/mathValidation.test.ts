import { describe, it, expect } from 'vitest';
import {
  checkNumericEquivalence,
  checkExpressionEquivalence,
  validateQuantQuestion,
  parseNumeric,
  detectVariables,
} from './mathValidation';
import type { ExamQuestion } from '../types';

describe('parseNumeric', () => {
  it('parst Brüche', () => {
    expect(parseNumeric('8/3')).toBeCloseTo(2.6666666666666665);
  });
  it('parst Dezimalzahlen', () => {
    expect(parseNumeric('2.6667')).toBeCloseTo(2.6667);
  });
  it('parst Zahlen mit Dezimalkomma', () => {
    expect(parseNumeric('2,5')).toBeCloseTo(2.5);
  });
  it('gibt null bei unparsbaren Strings zurück', () => {
    expect(parseNumeric('kein-ausdruck-$$')).toBeNull();
    expect(parseNumeric('')).toBeNull();
    expect(parseNumeric(undefined)).toBeNull();
  });
  it('lässt reine Zahlen unverändert', () => {
    expect(parseNumeric(4)).toBe(4);
    expect(parseNumeric(NaN)).toBeNull();
  });
});

describe('checkNumericEquivalence', () => {
  it('Bruch, exakte und gerundete Dezimalzahl gelten alle als gleich (8/3)', () => {
    expect(checkNumericEquivalence('8/3', '2.6666667')).toBe(true);
    expect(checkNumericEquivalence('8/3', '2.6667')).toBe(true);
    expect(checkNumericEquivalence('2.6666667', '2.6667')).toBe(true);
  });

  it('deutlich verschiedene Zahlen sind nicht äquivalent', () => {
    expect(checkNumericEquivalence('8/3', '2.75')).toBe(false);
    expect(checkNumericEquivalence(5, 6)).toBe(false);
  });

  it('respektiert eine größere explizite Fragetoleranz zusätzlich', () => {
    expect(checkNumericEquivalence(10, 10.4, { tolerance: 0.5 })).toBe(true);
    expect(checkNumericEquivalence(10, 10.6, { tolerance: 0.5 })).toBe(false);
  });

  it('reine Zahlen ohne String-Parsing funktionieren identisch', () => {
    expect(checkNumericEquivalence(2.6666666666666665, 2.6667)).toBe(true);
  });

  it('nicht-numerische Eingabe ist nie äquivalent', () => {
    expect(checkNumericEquivalence('abc', '5')).toBe(false);
  });
});

describe('detectVariables', () => {
  it('erkennt einzelne Variablen, aber keine Konstanten/Funktionen', () => {
    expect(detectVariables('3x^2+4x-5')).toEqual(['x']);
    expect(detectVariables('pi*r^2')).toEqual(['r']);
    expect(detectVariables('sin(x)+cos(y)')).toEqual(['x', 'y']);
  });
});

describe('checkExpressionEquivalence', () => {
  it('erkennt umsortierte, aber äquivalente Terme (Spec-Beispiel)', () => {
    expect(checkExpressionEquivalence('3x^2+4x-5', '-5+4x+3x^2')).toBe(true);
  });

  it('erkennt dieselbe Äquivalenz mit echtem Hochstellungszeichen (x²)', () => {
    expect(checkExpressionEquivalence('3x^2+4x-5', '-5+4x+3x²')).toBe(true);
  });

  it('lehnt einen Vorzeichenfehler ab', () => {
    expect(checkExpressionEquivalence('3x^2+4x-5', '3x^2+4x+5')).toBe(false);
  });

  it('erkennt eine korrekt ausmultiplizierte Klammer als äquivalent', () => {
    expect(checkExpressionEquivalence('(x+2)*(x-3)', 'x^2-x-6')).toBe(true);
  });

  it('lehnt einen Klammer-/Vorzeichenfehler bei der Ausmultiplikation ab', () => {
    expect(checkExpressionEquivalence('(x+2)*(x-3)', 'x^2+x-6')).toBe(false);
  });

  it('lehnt einen Faktorfehler ab (fehlende Distribution)', () => {
    expect(checkExpressionEquivalence('2*(x+3)', '2x+3')).toBe(false);
  });

  it('erkennt Äquivalenz bei mehreren Variablen', () => {
    expect(checkExpressionEquivalence('x*y + 2*x', 'x*(y+2)')).toBe(true);
    expect(checkExpressionEquivalence('x*y + 2*x', 'x*(y+3)')).toBe(false);
  });

  it('lehnt strukturell ungültige Ausdrücke ab statt zu crashen', () => {
    expect(checkExpressionEquivalence('3x^2+', 'x')).toBe(false);
  });

  it('reine Zahlenausdrücke ohne Variablen', () => {
    expect(checkExpressionEquivalence('2+2', '4')).toBe(true);
    expect(checkExpressionEquivalence('2+2', '5')).toBe(false);
  });
});

describe('validateQuantQuestion', () => {
  const base: Partial<ExamQuestion> = { id: 'q1', question: 'x?', solution: 'y', points: 2 };

  it('numeric: gültige Zahl ist valide', () => {
    const q = { ...base, type: 'numeric', numericAnswer: 4.5, numericTolerance: 0.1 } as ExamQuestion;
    expect(validateQuantQuestion(q).valid).toBe(true);
  });

  it('numeric: fehlende/ungültige numericAnswer wird verworfen', () => {
    const q = { ...base, type: 'numeric', numericAnswer: NaN } as ExamQuestion;
    expect(validateQuantQuestion(q).valid).toBe(false);
  });

  it('numeric: negative Toleranz wird verworfen', () => {
    const q = { ...base, type: 'numeric', numericAnswer: 4, numericTolerance: -1 } as ExamQuestion;
    expect(validateQuantQuestion(q).valid).toBe(false);
  });

  it('expression: gültiger Ausdruck ist valide', () => {
    const q = { ...base, type: 'expression', expressionAnswer: '3x^2+4x-5' } as ExamQuestion;
    expect(validateQuantQuestion(q).valid).toBe(true);
  });

  it('expression: leerer/kaputter Ausdruck wird verworfen', () => {
    expect(validateQuantQuestion({ ...base, type: 'expression', expressionAnswer: '' } as ExamQuestion).valid).toBe(false);
    expect(validateQuantQuestion({ ...base, type: 'expression', expressionAnswer: '3x^2+' } as ExamQuestion).valid).toBe(false);
  });

  it('mc + category "rechnung": genau eine korrekte Option und valide → gültig', () => {
    const q = {
      ...base, type: 'mc', category: 'rechnung',
      options: ['4', '7', '10', '13'], correctIndices: [1],
    } as ExamQuestion;
    expect(validateQuantQuestion(q).valid).toBe(true);
  });

  it('mc + category "rechnung": keine korrekte Option wird verworfen', () => {
    const q = {
      ...base, type: 'mc', category: 'rechnung',
      options: ['4', '7', '10', '13'], correctIndices: [],
    } as ExamQuestion;
    expect(validateQuantQuestion(q).valid).toBe(false);
  });

  it('mc + category "rechnung": mehr als eine korrekte Option wird verworfen (Single-Choice-Pflicht)', () => {
    const q = {
      ...base, type: 'mc', category: 'rechnung',
      options: ['4', '7', '10', '13'], correctIndices: [1, 2],
    } as ExamQuestion;
    expect(validateQuantQuestion(q).valid).toBe(false);
  });

  it('mc + category "rechnung": eine numerisch gleichwertige Distraktor-Option wird verworfen', () => {
    const q = {
      ...base, type: 'mc', category: 'rechnung',
      options: ['8/3', '2.6667', '10', '13'], correctIndices: [0],
    } as ExamQuestion;
    expect(validateQuantQuestion(q).valid).toBe(false);
  });

  it('mc + category "rechnung": echte, verschiedene Distraktoren bleiben gültig', () => {
    const q = {
      ...base, type: 'mc', category: 'rechnung',
      options: ['8/3', '3', '-8/3', '4'], correctIndices: [0],
    } as ExamQuestion;
    expect(validateQuantQuestion(q).valid).toBe(true);
  });

  it('mc ohne category "rechnung" wird nicht der Rechnungs-Prüfung unterzogen (mehrere korrekte Optionen erlaubt)', () => {
    const q = {
      ...base, type: 'mc', category: 'verstaendnis',
      options: ['a', 'b', 'c', 'd'], correctIndices: [0, 2],
    } as ExamQuestion;
    expect(validateQuantQuestion(q).valid).toBe(true);
  });

  it('andere Fragetypen sind per Default valide (keine quant-Prüfung nötig)', () => {
    const q = { ...base, type: 'open' } as ExamQuestion;
    expect(validateQuantQuestion(q).valid).toBe(true);
  });
});
