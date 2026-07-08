import type { UserAnswer } from '../types';

/**
 * calibration.ts — Auswertung der metakognitiven Kalibrierung (Baustein 2).
 *
 * Vergleicht die Selbsteinschätzung vor der Antwort (UserAnswer.confidence)
 * mit dem tatsächlichen Ergebnis (isCorrect). Als eigenes, testbares Modul
 * ausgelagert statt inline in ResultView — sonst lässt sich die Logik nur
 * per UI-Blick, nicht per Test verifizieren.
 */

export interface CalibrationStats {
  /** Anzahl Antworten mit gesetzter Selbsteinschätzung. */
  total: number;
  /** sicher+richtig ODER unsicher+falsch. */
  wellCalibrated: number;
  /** sicher+falsch — Selbstüberschätzung. */
  overconfident: number;
  /** unsicher+richtig — Selbstunterschätzung. */
  underconfident: number;
}

export const computeCalibration = (answers: UserAnswer[]): CalibrationStats => {
  const calibrated = answers.filter(a => a.confidence);
  return {
    total: calibrated.length,
    wellCalibrated: calibrated.filter(a => (a.confidence === 'sicher') === a.isCorrect).length,
    overconfident: calibrated.filter(a => a.confidence === 'sicher' && !a.isCorrect).length,
    underconfident: calibrated.filter(a => a.confidence === 'unsicher' && a.isCorrect).length,
  };
};

/** Rundet einen Teilwert als Prozent der kalibrierten Antworten. Division durch 0 → 0. */
export const calibrationPct = (n: number, total: number): number =>
  total > 0 ? Math.round((n / total) * 100) : 0;

/** Ab wie vielen kalibrierten Antworten die Auswertung in der UI erscheint. */
export const MIN_CALIBRATED_FOR_DISPLAY = 2;
