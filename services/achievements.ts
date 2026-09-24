import type { FlashcardDeck } from '../types';

/**
 * Abzeichen für Meilensteine (Audit 24.09.2026: Motivation hing allein an der
 * Lernserie). Alles wird aus vorhandenen Daten abgeleitet, nichts gespeichert:
 * so gibt es keine Sync-Konflikte, und gelöschte Daten ziehen die Stufe mit.
 * Jede Kategorie hat drei Stufen (Bronze, Silber, Gold).
 */

export type AchievementId = 'streak' | 'cards' | 'quiz' | 'feynman' | 'exam' | 'library';

export interface AchievementInput {
  bestStreak: number;
  decks: FlashcardDeck[];
  quizResults: { totalCount: number }[];
  recallResults: { method?: 'recall' | 'explainer' }[];
  examResults: { passed: boolean }[];
  documentCount: number;
}

export interface Achievement {
  id: AchievementId;
  /** Erreichte Stufe: 0 = noch keine, 1 bis 3. */
  tier: 0 | 1 | 2 | 3;
  value: number;
  /** Schwellen der drei Stufen. */
  thresholds: readonly [number, number, number];
  /** Ziel der nächsten Stufe, null wenn Gold erreicht. */
  next: number | null;
}

export const ACHIEVEMENT_THRESHOLDS: Record<AchievementId, readonly [number, number, number]> = {
  streak: [3, 7, 30],
  cards: [50, 250, 1000],
  quiz: [50, 250, 1000],
  feynman: [1, 10, 50],
  exam: [1, 5, 20],
  library: [1, 10, 25],
};

const ORDER: AchievementId[] = ['streak', 'cards', 'quiz', 'feynman', 'exam', 'library'];

export const achievementValues = (input: AchievementInput): Record<AchievementId, number> => ({
  streak: input.bestStreak,
  cards: input.decks.reduce((sum, d) => sum + d.cards.reduce((s, c) => s + (c.srs?.repetitions ?? 0), 0), 0),
  quiz: input.quizResults.reduce((sum, r) => sum + (r.totalCount || 0), 0),
  feynman: input.recallResults.filter(r => r.method !== 'explainer').length,
  exam: input.examResults.filter(r => r.passed).length,
  library: input.documentCount,
});

export const computeAchievements = (input: AchievementInput): Achievement[] => {
  const values = achievementValues(input);
  return ORDER.map(id => {
    const thresholds = ACHIEVEMENT_THRESHOLDS[id];
    const value = values[id];
    const tier = thresholds.filter(t => value >= t).length as Achievement['tier'];
    return { id, tier, value, thresholds, next: tier < 3 ? (thresholds as readonly number[])[tier] : null };
  });
};
