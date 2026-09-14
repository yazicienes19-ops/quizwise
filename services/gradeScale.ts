/**
 * Echte, selbst eingetragene Klausurnoten. Dieselbe Skala je Account-Sprache
 * wie gradeFromPercentage (services/learningProfileService.ts):
 * DE/EN 1.0–5.0 (4.0 = bestanden), TR Bologna-Buchstaben AA–FF (DD = bestanden).
 * Noten werden als String gespeichert, genau wie gradeFromPercentage sie liefert.
 */

export const GRADE_OPTIONS_DE = ['1.0', '1.3', '1.7', '2.0', '2.3', '2.7', '3.0', '3.3', '3.7', '4.0', '5.0'] as const;
export const GRADE_OPTIONS_TR = ['AA', 'BA', 'BB', 'CB', 'CC', 'DC', 'DD', 'FD', 'FF'] as const;

const TR_POINTS = new Map<string, number>([
  ['AA', 4], ['BA', 3.5], ['BB', 3], ['CB', 2.5], ['CC', 2], ['DC', 1.5], ['DD', 1], ['FD', 0.5], ['FF', 0],
]);

const isNumericGrade = (grade: string): boolean => /^\d\.\d$/.test(grade);

export const gradeOptions = (locale: string): readonly string[] =>
  locale === 'tr' ? GRADE_OPTIONS_TR : GRADE_OPTIONS_DE;

/** 4,0 oder schlechter (DE) bzw. DD oder schlechter (TR): knapp oder nicht bestanden. */
export const isWeakGrade = (grade: string): boolean => {
  if (isNumericGrade(grade)) return parseFloat(grade) >= 4.0;
  const points = TR_POINTS.get(grade);
  return points != null && points <= 1;
};

/**
 * Ø mehrerer Noten desselben Systems: DE als Dezimalzahl ("2.6"), TR als
 * nächstliegender Buchstabe. Gemischte oder unbekannte Noten → null.
 */
export const averageGrade = (grades: string[]): string | null => {
  if (grades.length === 0) return null;
  if (grades.every(isNumericGrade)) {
    const mean = grades.reduce((s, g) => s + parseFloat(g), 0) / grades.length;
    return (Math.round(mean * 10) / 10).toFixed(1);
  }
  if (grades.every(g => TR_POINTS.has(g))) {
    const mean = grades.reduce((s, g) => s + (TR_POINTS.get(g) ?? 0), 0) / grades.length;
    let best = 'FF';
    for (const [letter, points] of TR_POINTS) {
      if (Math.abs(points - mean) < Math.abs((TR_POINTS.get(best) ?? 0) - mean)) best = letter;
    }
    return best;
  }
  return null;
};

/** Systemübergreifender Wert 0–100 (höher = besser), z.B. zum Sortieren neben Simulator-Prozenten. */
export const gradeScore = (grade: string): number | null => {
  if (isNumericGrade(grade)) return Math.round((1 - (parseFloat(grade) - 1) / 4) * 100);
  const points = TR_POINTS.get(grade);
  return points == null ? null : Math.round((points / 4) * 100);
};

/** Deutsche Noten mit Dezimalkomma ("2,3"), andere Sprachen unverändert. */
export const formatGrade = (grade: string, locale: string): string =>
  locale === 'de' ? grade.replace('.', ',') : grade;
