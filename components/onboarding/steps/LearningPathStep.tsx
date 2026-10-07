import React from 'react';
import type { OnboardingChallenge } from '../../../types';
import type { TKey } from '../../../i18n';
import { useTranslation } from '../../../i18n/I18nProvider';
import { buildLearningPath, type OnboardingProblem } from '../../../services/onboardingFirstMoment';
import { PROBLEM_META } from './ProblemStep';

export const PATH_COPY: Record<OnboardingProblem, { icon: string; featureKey: TKey; whyKey: TKey }> = {
  exam_confidence: { icon: '🎓', featureKey: 'onboarding.v2.path.exam_confidence.feature', whyKey: 'onboarding.v2.path.exam_confidence.why' },
  retention: { icon: '🔁', featureKey: 'onboarding.v2.path.retention.feature', whyKey: 'onboarding.v2.path.retention.why' },
  understanding: { icon: '🧠', featureKey: 'onboarding.v2.path.understanding.feature', whyKey: 'onboarding.v2.path.understanding.why' },
  knowledge_gaps: { icon: '📝', featureKey: 'onboarding.v2.path.knowledge_gaps.feature', whyKey: 'onboarding.v2.path.knowledge_gaps.why' },
  structure: { icon: '🗓️', featureKey: 'onboarding.v2.path.structure.feature', whyKey: 'onboarding.v2.path.structure.why' },
  motivation: { icon: '🔥', featureKey: 'onboarding.v2.path.motivation.feature', whyKey: 'onboarding.v2.path.motivation.why' },
};

interface LearningPathStepProps {
  problems: OnboardingChallenge[];
}

/**
 * Letzter Schritt: sagt klar, mit welcher Funktion der Nutzer gegen welches
 * seiner Probleme lernt. Der erste Eintrag ist der Startpunkt (CTA in OnboardingFlow).
 */
export const LearningPathStep: React.FC<LearningPathStepProps> = ({ problems }) => {
  const { t } = useTranslation();
  const path = buildLearningPath(problems);

  return (
    <>
      <h2 className="text-lg font-semibold tracking-tight mb-1.5" style={{ color: 'var(--text-main)' }}>
        {t('onboarding.v2.path.title')}
      </h2>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">{t('onboarding.v2.path.subtitle')}</p>
      <ol className="space-y-2.5">
        {path.map(({ problem }, i) => {
          const copy = PATH_COPY[problem];
          const first = i === 0;
          return (
            <li
              key={problem}
              className="flex items-start gap-3 rounded-[16px] p-4 animate-card-enter"
              style={{
                ['--stagger-i' as string]: i,
                background: first ? 'color-mix(in srgb, var(--primary) 12%, var(--bg-main))' : 'var(--bg-main)',
                border: first ? '2px solid var(--primary)' : '2px solid var(--border-color)',
              } as React.CSSProperties}
            >
              <span className="text-2xl leading-none shrink-0 mt-0.5">{copy.icon}</span>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                  {t('onboarding.v2.path.against', { problem: t(PROBLEM_META[problem].labelKey) })}
                </p>
                <p className="text-sm font-semibold mt-0.5" style={{ color: 'var(--text-main)' }}>
                  {t(copy.featureKey)}
                  {first && (
                    <span className="ml-2 align-middle text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}>
                      {t('onboarding.v2.path.startHere')}
                    </span>
                  )}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{t(copy.whyKey)}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
};
