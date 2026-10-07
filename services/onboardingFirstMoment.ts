import type { OnboardingChallenge } from '../types';

/**
 * Der erste Moment im Onboarding ist echtes Lernen aus dem gerade hochgeladenen
 * Skript, zugeschnitten auf das größte Problem des Nutzers:
 * - Prüfungsangst → Mini-Klausur mit Note (erst am Ende Auflösung, wie in echt)
 * - Vergessen → Karteikarten, die direkt als Stapel in seinen Karten landen
 * - alles andere → drei Fragen mit sofortiger Rückmeldung
 */
export type FirstMomentMode = 'exam' | 'cards' | 'quiz';

export interface FirstMomentPlan {
  mode: FirstMomentMode;
  count: number;
}

export const getFirstMomentPlan = (challenge: OnboardingChallenge | undefined): FirstMomentPlan => {
  if (challenge === 'exam_confidence') return { mode: 'exam', count: 5 };
  if (challenge === 'retention') return { mode: 'cards', count: 5 };
  return { mode: 'quiz', count: 3 };
};

/** Die Probleme, die das Onboarding zur Auswahl stellt (Reihenfolge = Anzeige). */
export const ONBOARDING_PROBLEMS: OnboardingChallenge[] = [
  'exam_confidence', 'retention', 'understanding', 'knowledge_gaps', 'structure', 'motivation',
];
