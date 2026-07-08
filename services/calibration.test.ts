import { describe, it, expect } from 'vitest';
import { computeCalibration, calibrationPct, MIN_CALIBRATED_FOR_DISPLAY } from './calibration';
import type { UserAnswer } from '../types';

const ans = (confidence: UserAnswer['confidence'], isCorrect: boolean): UserAnswer =>
  ({ questionIndex: 0, selectedOptionIndices: [0], isCorrect, confidence });

describe('computeCalibration — alle vier Kombinationen einzeln', () => {
  it('Sicher + richtig → gut kalibriert, weder über- noch unterschätzt', () => {
    const c = computeCalibration([ans('sicher', true)]);
    expect(c).toEqual({ total: 1, wellCalibrated: 1, overconfident: 0, underconfident: 0 });
  });

  it('Sicher + falsch → Überschätzung, NICHT gut kalibriert', () => {
    const c = computeCalibration([ans('sicher', false)]);
    expect(c).toEqual({ total: 1, wellCalibrated: 0, overconfident: 1, underconfident: 0 });
  });

  it('Unsicher + richtig → Unterschätzung, NICHT gut kalibriert', () => {
    const c = computeCalibration([ans('unsicher', true)]);
    expect(c).toEqual({ total: 1, wellCalibrated: 0, overconfident: 0, underconfident: 1 });
  });

  it('Unsicher + falsch → gut kalibriert (zurecht unsicher)', () => {
    const c = computeCalibration([ans('unsicher', false)]);
    expect(c).toEqual({ total: 1, wellCalibrated: 1, overconfident: 0, underconfident: 0 });
  });

  it('Mix aller vier Kombinationen — jede Kategorie zählt genau einmal, keine Überlappung', () => {
    const c = computeCalibration([
      ans('sicher', true),    // gut kalibriert
      ans('sicher', false),   // überschätzt
      ans('unsicher', true),  // unterschätzt
      ans('unsicher', false), // gut kalibriert
    ]);
    expect(c).toEqual({ total: 4, wellCalibrated: 2, overconfident: 1, underconfident: 1 });
    // Kategorien dürfen sich nicht überschneiden — Summe muss total ergeben
    expect(c.wellCalibrated + c.overconfident + c.underconfident).toBe(c.total);
  });

  it('Antworten ohne confidence (andere Fragetypen) werden ignoriert, nicht als falsch gezählt', () => {
    const c = computeCalibration([
      ans('sicher', true),
      { questionIndex: 1, selectedOptionIndices: [], isCorrect: false }, // z.B. Matching, keine Kalibrierung
    ]);
    expect(c.total).toBe(1);
  });

  it('leeres Array → alle Werte 0, keine Division durch 0', () => {
    expect(computeCalibration([])).toEqual({ total: 0, wellCalibrated: 0, overconfident: 0, underconfident: 0 });
  });
});

describe('calibrationPct', () => {
  it('rundet korrekt', () => {
    expect(calibrationPct(1, 3)).toBe(33);
    expect(calibrationPct(2, 3)).toBe(67);
  });

  it('total=0 → 0 statt NaN/Infinity', () => {
    expect(calibrationPct(0, 0)).toBe(0);
  });
});

describe('Anzeige-Schwelle (UI verwendet total >= MIN_CALIBRATED_FOR_DISPLAY)', () => {
  it('Schwelle ist exakt 2', () => {
    expect(MIN_CALIBRATED_FOR_DISPLAY).toBe(2);
  });

  it('genau 1 kalibrierte Antwort → unter der Schwelle (Kachel darf nicht erscheinen)', () => {
    const c = computeCalibration([ans('sicher', true)]);
    expect(c.total >= MIN_CALIBRATED_FOR_DISPLAY).toBe(false);
  });

  it('genau 2 kalibrierte Antworten → erreicht die Schwelle (Kachel muss erscheinen)', () => {
    const c = computeCalibration([ans('sicher', true), ans('unsicher', false)]);
    expect(c.total >= MIN_CALIBRATED_FOR_DISPLAY).toBe(true);
  });
});
