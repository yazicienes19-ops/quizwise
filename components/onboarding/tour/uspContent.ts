import { ActiveTab } from '../../../types';
import type { TKey } from '../../../i18n';

/**
 * "So funktioniert das"-Dreizeiler für den USP-Reveal-Screen (RecommendationStep),
 * EIN Set pro `ActiveTab` statt pro Challenge — mehrere Challenges teilen sich
 * denselben `primaryTab` (z. B. RADAR bei knowledge_gaps/effectiveness/motivation),
 * dadurch reichen 6 statt 8 Sätze-Trios.
 */
export const HOW_IT_WORKS_BY_TAB: Partial<Record<ActiveTab, [TKey, TKey, TKey]>> = {
  [ActiveTab.RECALL]: ['onboarding.usp.howItWorks.recall.1', 'onboarding.usp.howItWorks.recall.2', 'onboarding.usp.howItWorks.recall.3'],
  [ActiveTab.PLANNER]: ['onboarding.usp.howItWorks.planner.1', 'onboarding.usp.howItWorks.planner.2', 'onboarding.usp.howItWorks.planner.3'],
  [ActiveTab.RADAR]: ['onboarding.usp.howItWorks.radar.1', 'onboarding.usp.howItWorks.radar.2', 'onboarding.usp.howItWorks.radar.3'],
  [ActiveTab.EXAM]: ['onboarding.usp.howItWorks.exam.1', 'onboarding.usp.howItWorks.exam.2', 'onboarding.usp.howItWorks.exam.3'],
  [ActiveTab.CARDS]: ['onboarding.usp.howItWorks.cards.1', 'onboarding.usp.howItWorks.cards.2', 'onboarding.usp.howItWorks.cards.3'],
  [ActiveTab.QUIZ]: ['onboarding.usp.howItWorks.quiz.1', 'onboarding.usp.howItWorks.quiz.2', 'onboarding.usp.howItWorks.quiz.3'],
};
