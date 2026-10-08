// Die gebenchmarkten App-Funktionen und ihre Testfall-Struktur.

export const FEATURES = [
  'quiz', 'karten', 'tutor', 'feynman_frage', 'feynman_bewertung',
  'klausur', 'korrektur', 'rechenweg', 'leser', 'studio', 'selbsttest',
] as const;
export type Feature = typeof FEATURES[number];

export const FEATURE_INFO: Record<Feature, { label: string; appFunction: string; prodModel: string }> = {
  quiz: { label: 'Quiz erstellen', appFunction: 'generateQuizFromDocument', prodModel: 'Lite (Free + Pro)' },
  karten: { label: 'Karten erstellen', appFunction: 'generateFlashcardsFromDocument', prodModel: 'Lite (Free + Pro)' },
  tutor: { label: 'Tutor-Chat', appFunction: 'chatWithTutor', prodModel: 'Free Lite / Pro Flash' },
  feynman_frage: { label: 'Feynman-Frage', appFunction: 'generateRecallChallenge', prodModel: 'Free Lite / Pro Flash' },
  feynman_bewertung: { label: 'Feynman-Bewertung', appFunction: 'evaluateRecallResponse', prodModel: 'Free Lite / Pro Flash' },
  klausur: { label: 'Klausur erstellen', appFunction: 'generateFullExam', prodModel: 'Lite (ohne Quant-Modus)' },
  korrektur: { label: 'Klausur-Korrektur', appFunction: 'evaluateWithRubric', prodModel: 'Flash (grading, alle Pläne)' },
  rechenweg: { label: 'Rechenweg-Bewertung', appFunction: 'evaluateStepByStep', prodModel: 'Flash (grading, alle Pläne)' },
  leser: { label: 'Erklärung im Leser', appFunction: 'generateGroundedExplanation', prodModel: 'Lite (Free + Pro)' },
  studio: { label: 'Lernstudio', appFunction: 'generateStudioOutput', prodModel: 'Free Lite / Pro Flash' },
  selbsttest: { label: 'Selbsttest', appFunction: 'evaluateSelfCheck', prodModel: 'Lite (Free + Pro)' },
};

export type Difficulty = 'easy' | 'normal' | 'hard' | 'edge';
export type ContextSize = 'short' | 'medium' | 'long';

/** Quelle: Dateien aus datasets/sources, optional nur Abschnitte (Zeilen, die mit dem Marker beginnen). */
export interface SourceRef {
  files: string[];
  /** Nur der Teil ab der ersten Zeile, die mit `from` beginnt, bis vor die erste mit `to`. */
  from?: string;
  to?: string;
  /** Eigener Quelltext statt Datei (z. B. absichtlich unvollständige Quelle). */
  inline?: string;
}

export interface TestCase {
  id: string;
  feature: Feature;
  difficulty: Difficulty;
  contextSize: ContextSize;
  /** z. B. not_in_source, incomplete_source, partially_correct, multiple_errors, similar_concepts, ambiguous */
  edgeType?: string;
  source?: SourceRef;
  /** Funktionsspezifische Eingaben (siehe capture.test.ts). */
  input: Record<string, any>;
  /** Goldstandard (siehe evaluators/). */
  expected: Record<string, any>;
  notes?: string;
}
