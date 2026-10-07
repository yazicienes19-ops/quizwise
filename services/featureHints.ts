/**
 * Kontextuelle Hinweise statt App-Tour: eine Funktion wird genau dann
 * vorgeschlagen, wenn sie zur Situation passt, und nur ein einziges Mal.
 * - mistakeCards: nach dem ersten Quiz mit Fehlern → "Daraus Karteikarten machen?"
 * - practiceExam: ab dem dritten abgeschlossenen Quiz → "Bereit für eine Probeklausur?"
 */
export type FeatureHintId = 'mistakeCards' | 'practiceExam';

const SEEN_KEY = 'studearc_feature_hints_seen';

export const PRACTICE_EXAM_AFTER_QUIZZES = 3;

const readSeen = (): Partial<Record<FeatureHintId, number>> => {
  try {
    const parsed = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

export const isHintSeen = (id: FeatureHintId): boolean => !!readSeen()[id];

export const markHintSeen = (id: FeatureHintId): void => {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify({ ...readSeen(), [id]: Date.now() }));
  } catch {
    // Speicher voll/gesperrt: Hinweis erscheint dann eben noch einmal, kein Blocker.
  }
};

/**
 * Welcher Hinweis passt nach diesem Quiz? Höchstens einer, damit das Ergebnis
 * nicht mit Vorschlägen zugestellt wird. Der Fehler-Hinweis hat Vorrang, weil
 * er sich auf genau dieses Quiz bezieht.
 */
export const pickResultHint = (wrongCount: number, completedQuizzes: number): FeatureHintId | null => {
  if (wrongCount > 0 && !isHintSeen('mistakeCards')) return 'mistakeCards';
  if (completedQuizzes >= PRACTICE_EXAM_AFTER_QUIZZES && !isHintSeen('practiceExam')) return 'practiceExam';
  return null;
};
