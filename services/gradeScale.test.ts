import { describe, it, expect } from 'vitest';
import { averageGrade, isWeakGrade, gradeScore, formatGrade, gradeOptions } from './gradeScale';

describe('gradeScale', () => {
  it('bildet den Ø deutscher Noten auf eine Nachkommastelle', () => {
    expect(averageGrade(['1.7', '2.3', '4.0'])).toBe('2.7');
    expect(averageGrade(['1.0', '1.3'])).toBe('1.2');
    expect(averageGrade([])).toBeNull();
  });

  it('bildet den Ø türkischer Noten auf den nächsten Buchstaben', () => {
    expect(averageGrade(['AA', 'BB'])).toBe('BA');
    expect(averageGrade(['DD', 'FF'])).toBe('FD');
  });

  it('gemischte Systeme ergeben keinen Schnitt', () => {
    expect(averageGrade(['1.7', 'BB'])).toBeNull();
  });

  it('markiert 4,0 und schlechter bzw. DD und schlechter als schwach', () => {
    expect(isWeakGrade('3.7')).toBe(false);
    expect(isWeakGrade('4.0')).toBe(true);
    expect(isWeakGrade('5.0')).toBe(true);
    expect(isWeakGrade('DC')).toBe(false);
    expect(isWeakGrade('DD')).toBe(true);
  });

  it('normiert Noten auf 0–100 (höher = besser)', () => {
    expect(gradeScore('1.0')).toBe(100);
    expect(gradeScore('5.0')).toBe(0);
    expect(gradeScore('AA')).toBe(100);
    expect(gradeScore('xyz')).toBeNull();
  });

  it('formatiert und liefert die Skala je Sprache', () => {
    expect(formatGrade('2.3', 'de')).toBe('2,3');
    expect(formatGrade('2.3', 'en')).toBe('2.3');
    expect(gradeOptions('tr')[0]).toBe('AA');
    expect(gradeOptions('de')).toContain('4.0');
  });
});
