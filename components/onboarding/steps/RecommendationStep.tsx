import React, { useMemo } from 'react';
import { ActiveTab, type OnboardingChallenge } from '../../../types';
import { useTranslation } from '../../../i18n/I18nProvider';
import { getRecommendation, buildCombinedRecommendation } from '../../../services/onboardingRecommendation';
import { TAB_LABEL_KEY, TAB_ICON } from '../tabLabels';
import { HOW_IT_WORKS_BY_TAB } from '../tour/uspContent';
import { CHALLENGES } from './ChallengesStep';

interface RecommendationStepProps {
  challenges: OnboardingChallenge[];
}

/**
 * USP-Reveal-Screen (Onboarding-Überarbeitung Abschnitt 2, "Das ist dein
 * persönlicher Einstieg"): inszeniert das vom Nutzer gewählte Hauptlernproblem
 * als eigenen Moment, statt direkt in die allgemeine Feature-Tour zu springen.
 * Drei gestaffelte Blöcke — DEIN LERNPROBLEM (Zitat der Top-Priorität-Challenge)
 * → DEINE LÖSUNG (die dazu passende Kernfunktion + kurze "So funktioniert das").
 * Der numerierte Lernweg (01/02/03) lebt bewusst NICHT mehr hier, sondern auf
 * dem eigenen Folge-Screen `PersonalPathStep.tsx` — "jeder Screen hat eine
 * klare Kernbotschaft" (User-Vorgabe), Reveal und Lernweg sind zwei verschiedene.
 *
 * `lead` ist bei 1 UND bei 2-3 gewählten Challenges dieselbe Datenquelle
 * (`buildCombinedRecommendation().lead` = `getRecommendation(challenges[0])`),
 * dadurch kein Fallunterschied im UI nötig — der Hauptschmerzpunkt wird immer
 * gleich stark hervorgehoben, ein zweiter/dritter fließt erst in den Lernweg ein.
 */
export const RecommendationStep: React.FC<RecommendationStepProps> = ({ challenges }) => {
  const { t } = useTranslation();
  const tabLabel = (tab: ActiveTab) => {
    const key = TAB_LABEL_KEY[tab];
    return key ? t(key) : '';
  };

  const lead = useMemo(
    () => (challenges.length >= 2 ? buildCombinedRecommendation(challenges).lead : getRecommendation(challenges[0] ?? 'unsure')),
    [challenges]
  );
  const problemLabelKey = CHALLENGES.find(c => c.challenge === challenges[0])?.labelKey;
  const howItWorks = HOW_IT_WORKS_BY_TAB[lead.primaryTab];

  return (
    <>
      <div className="mb-6 animate-card-enter" style={{ ['--stagger-i' as string]: 0 }}>
        <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: 'var(--text-secondary)' }}>
          {t('onboarding.usp.problemLabel')}
        </p>
        <p className="text-lg font-black tracking-tight" style={{ color: 'var(--text-main)' }}>
          "{t('onboarding.usp.problemQuote', { label: problemLabelKey ? t(problemLabelKey) : '' })}"
        </p>
      </div>

      <div className="mb-5 animate-card-enter" style={{ ['--stagger-i' as string]: 1 }}>
        <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: 'var(--primary)' }}>
          {t('onboarding.usp.solutionLabel')}
        </p>
        <div className="flex items-start gap-3 mb-3">
          <span
            className="shrink-0 w-11 h-11 rounded-[14px] flex items-center justify-center text-xl"
            style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
          >
            {TAB_ICON[lead.primaryTab] ?? '✨'}
          </span>
          <h2 className="text-lg font-black tracking-tight pt-1.5" style={{ color: 'var(--text-main)' }}>
            {t('onboarding.usp.solutionHeadline', { feature: tabLabel(lead.primaryTab) })}
          </h2>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{t(lead.bodyKey)}</p>
      </div>

      {howItWorks && (
        <div className="animate-card-enter" style={{ ['--stagger-i' as string]: 2 }}>
          <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: 'var(--text-secondary)' }}>
            {t('onboarding.usp.howItWorksLabel')}
          </p>
          <ol className="space-y-2">
            {howItWorks.map((key, i) => (
              <li key={key} className="flex items-start gap-2.5 text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                <span
                  className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black mt-0.5"
                  style={{ background: 'color-mix(in srgb, var(--primary) 14%, var(--bg-main))', color: 'var(--primary)' }}
                >
                  {i + 1}
                </span>
                <span>{t(key)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </>
  );
};
