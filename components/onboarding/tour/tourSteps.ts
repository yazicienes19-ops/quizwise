import type React from 'react';
import { ActiveTab, type OnboardingChallenge } from '../../../types';
import type { TKey } from '../../../i18n';
import { LearnOverviewPreview } from './previews/LearnOverviewPreview';
import { QuizPreview } from './previews/QuizPreview';
import { CardsPreview } from './previews/CardsPreview';
import { FeynmanPreview } from './previews/FeynmanPreview';
import { SplitScreenReaderPreview } from './previews/SplitScreenReaderPreview';
import { ExamPreview } from './previews/ExamPreview';
import { AnalysisPreview } from './previews/AnalysisPreview';
import { CoachPreview } from './previews/CoachPreview';
import { PlannerPreview } from './previews/PlannerPreview';

export type TourStepId =
  | 'tour_library' | 'tour_learn' | 'tour_quiz' | 'tour_cards'
  | 'tour_feynman' | 'tour_explainer' | 'tour_exam' | 'tour_analysis' | 'tour_coach' | 'tour_planner';

export interface TourStepConfig {
  id: TourStepId;
  tab: ActiveTab;
  titleKey: TKey;
  bodyKey: TKey;
  /** Fehlt bei "Bibliothek" (echte Navigation genügt, echter Empty-State ist
   *  bereits aussagekräftig) — überall sonst kuratiertes Beispiel-Panel, weil
   *  ein frischer Account dort nichts Sinnvolles zu zeigen hätte (Onboarding-
   *  Plan, User-Entscheidung "Hybrid, keine Fake-Daten im echten Account"). */
  Preview?: React.FC;
}

/** Alle bekannten Tour-Schritte als benannte Bausteine — die tatsächliche
 *  Reihenfolge je Nutzer entsteht daraus in OnboardingFlow.tsx (Phase 3: eine
 *  feste Default-Reihenfolge; Phase 4: personalisiert nach primaryChallenge). */
export const TOUR_STEP_LIBRARY: Record<TourStepId, TourStepConfig> = {
  tour_library: {
    id: 'tour_library', tab: ActiveTab.LIBRARY,
    titleKey: 'onboarding.tour.library.title', bodyKey: 'onboarding.tour.library.body',
  },
  tour_learn: {
    id: 'tour_learn', tab: ActiveTab.QUIZ,
    titleKey: 'onboarding.tour.learn.title', bodyKey: 'onboarding.tour.learn.body',
    Preview: LearnOverviewPreview,
  },
  tour_quiz: {
    id: 'tour_quiz', tab: ActiveTab.QUIZ,
    titleKey: 'onboarding.tour.quiz.title', bodyKey: 'onboarding.tour.quiz.body',
    Preview: QuizPreview,
  },
  tour_cards: {
    id: 'tour_cards', tab: ActiveTab.CARDS,
    titleKey: 'onboarding.tour.cards.title', bodyKey: 'onboarding.tour.cards.body',
    Preview: CardsPreview,
  },
  tour_feynman: {
    id: 'tour_feynman', tab: ActiveTab.RECALL,
    titleKey: 'onboarding.tour.feynman.title', bodyKey: 'onboarding.tour.feynman.body',
    Preview: FeynmanPreview,
  },
  tour_explainer: {
    id: 'tour_explainer', tab: ActiveTab.EXPLAINER,
    titleKey: 'onboarding.tour.explainer.title', bodyKey: 'onboarding.tour.explainer.body',
    Preview: SplitScreenReaderPreview,
  },
  tour_exam: {
    id: 'tour_exam', tab: ActiveTab.EXAM,
    titleKey: 'onboarding.tour.exam.title', bodyKey: 'onboarding.tour.exam.body',
    Preview: ExamPreview,
  },
  tour_analysis: {
    id: 'tour_analysis', tab: ActiveTab.RADAR,
    titleKey: 'onboarding.tour.analysis.title', bodyKey: 'onboarding.tour.analysis.body',
    Preview: AnalysisPreview,
  },
  tour_coach: {
    id: 'tour_coach', tab: ActiveTab.RADAR,
    titleKey: 'onboarding.tour.coach.title', bodyKey: 'onboarding.tour.coach.body',
    Preview: CoachPreview,
  },
  tour_planner: {
    id: 'tour_planner', tab: ActiveTab.PLANNER,
    titleKey: 'onboarding.tour.planner.title', bodyKey: 'onboarding.tour.planner.body',
    Preview: PlannerPreview,
  },
};

/** Default-Reihenfolge — greift, wenn (noch) kein primaryChallenge bekannt ist
 *  (z. B. Draft-Wiederherstellung ohne gespeicherte Lernprobleme). Entspricht
 *  inhaltlich dem "Verstehen"-Pfad. */
export const DEFAULT_TOUR_SEQUENCE: TourStepId[] = [
  'tour_library', 'tour_learn', 'tour_feynman', 'tour_explainer', 'tour_quiz', 'tour_exam', 'tour_analysis', 'tour_coach',
];

/**
 * Personalisierte Reihenfolge je Hauptlernproblem (Onboarding-Plan Abschnitt 3).
 * 5 Pfade direkt aus der Spec übernommen (understanding/exam_confidence/
 * structure/knowledge_gaps/motivation), 3 Ergänzungen von mir nach demselben
 * Muster (retention/effectiveness/unsure — als "eigene Ergänzung" im Plan
 * markiert). "Heute solltest du" und "Lernfortschritt" aus der Spec-Prosa
 * bilden sich auf die bereits vorhandenen tour_coach/tour_analysis-Schritte ab
 * (beide leben ohnehin auf demselben RADAR-Tab), kein neuer Baustein nötig.
 */
const CHALLENGE_TOUR_SEQUENCE: Record<OnboardingChallenge, TourStepId[]> = {
  understanding: ['tour_library', 'tour_feynman', 'tour_explainer', 'tour_quiz', 'tour_analysis', 'tour_coach'],
  exam_confidence: ['tour_library', 'tour_quiz', 'tour_exam', 'tour_analysis'],
  structure: ['tour_library', 'tour_planner', 'tour_coach', 'tour_analysis'],
  knowledge_gaps: ['tour_library', 'tour_quiz', 'tour_analysis', 'tour_coach', 'tour_exam'],
  motivation: ['tour_library', 'tour_coach', 'tour_analysis'],
  retention: ['tour_library', 'tour_cards', 'tour_quiz', 'tour_analysis'],
  effectiveness: ['tour_library', 'tour_analysis', 'tour_coach'],
  unsure: ['tour_library', 'tour_quiz', 'tour_analysis', 'tour_coach', 'tour_exam'],
};

export function getTourSequence(primaryChallenge?: OnboardingChallenge): TourStepId[] {
  if (primaryChallenge && CHALLENGE_TOUR_SEQUENCE[primaryChallenge]) return CHALLENGE_TOUR_SEQUENCE[primaryChallenge];
  return DEFAULT_TOUR_SEQUENCE;
}
