import { ActiveTab, type OnboardingChallenge } from '../types';

/**
 * Der erste Moment im Onboarding ist echtes Lernen aus dem gerade hochgeladenen
 * Skript, zugeschnitten auf das wichtigste (zuerst gewählte) Problem:
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

/** Höchstens so viele Probleme sind im Onboarding wählbar. Reihenfolge = Priorität. */
export const MAX_PROBLEMS = 3;

/** Die Probleme, die das Onboarding zur Auswahl stellt (Reihenfolge = Anzeige). */
export const ONBOARDING_PROBLEMS = [
  'exam_confidence', 'retention', 'understanding', 'knowledge_gaps', 'structure', 'motivation',
] as const satisfies readonly OnboardingChallenge[];

export type OnboardingProblem = typeof ONBOARDING_PROBLEMS[number];

const isProblem = (c: OnboardingChallenge): c is OnboardingProblem =>
  (ONBOARDING_PROBLEMS as readonly OnboardingChallenge[]).includes(c);

/**
 * Lernweg: welche Funktion gegen welches Problem hilft. Wird am Ende des
 * Onboardings gezeigt ("Dein Lernweg"), und der erste Eintrag ist der Tab,
 * in dem der Nutzer danach landet.
 */
export const PATH_TAB: Record<OnboardingProblem, ActiveTab> = {
  exam_confidence: ActiveTab.EXAM,
  retention: ActiveTab.CARDS,
  understanding: ActiveTab.RECALL,
  knowledge_gaps: ActiveTab.QUIZ,
  structure: ActiveTab.PLANNER,
  motivation: ActiveTab.DASHBOARD,
};

/** Einträge des Lernwegs in Prioritätsreihenfolge, ohne doppelte Funktionen. */
export const buildLearningPath = (problems: OnboardingChallenge[]): { problem: OnboardingProblem; tab: ActiveTab }[] => {
  const seen = new Set<ActiveTab>();
  return problems.filter(isProblem).flatMap(problem => {
    const tab = PATH_TAB[problem];
    if (seen.has(tab)) return [];
    seen.add(tab);
    return [{ problem, tab }];
  });
};

/** Tab, in dem der Nutzer nach dem Onboarding landet. */
export const getStartTab = (problems: OnboardingChallenge[]): ActiveTab =>
  buildLearningPath(problems)[0]?.tab ?? ActiveTab.QUIZ;
