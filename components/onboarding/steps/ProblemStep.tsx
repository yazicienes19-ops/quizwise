import React from 'react';
import type { OnboardingChallenge } from '../../../types';
import type { TKey } from '../../../i18n';
import { useTranslation } from '../../../i18n/I18nProvider';
import { SelectCard } from '../SelectCard';
import { ONBOARDING_PROBLEMS } from '../../../services/onboardingFirstMoment';

const PROBLEM_META: Record<string, { icon: string; labelKey: TKey; descKey: TKey }> = {
  exam_confidence: { icon: '😰', labelKey: 'onboarding.v2.problem.exam_confidence.label', descKey: 'onboarding.v2.problem.exam_confidence.desc' },
  retention: { icon: '🔄', labelKey: 'onboarding.v2.problem.retention.label', descKey: 'onboarding.v2.problem.retention.desc' },
  understanding: { icon: '🧠', labelKey: 'onboarding.v2.problem.understanding.label', descKey: 'onboarding.v2.problem.understanding.desc' },
  knowledge_gaps: { icon: '❓', labelKey: 'onboarding.v2.problem.knowledge_gaps.label', descKey: 'onboarding.v2.problem.knowledge_gaps.desc' },
  structure: { icon: '🗂️', labelKey: 'onboarding.v2.problem.structure.label', descKey: 'onboarding.v2.problem.structure.desc' },
  motivation: { icon: '🚀', labelKey: 'onboarding.v2.problem.motivation.label', descKey: 'onboarding.v2.problem.motivation.desc' },
};

interface ProblemStepProps {
  value: OnboardingChallenge | undefined;
  onChange: (c: OnboardingChallenge) => void;
}

/** Frage 2 von 2: "Was ist dein größtes Problem?" Genau eine Antwort. */
export const ProblemStep: React.FC<ProblemStepProps> = ({ value, onChange }) => {
  const { t } = useTranslation();

  return (
    <>
      <h2 className="text-lg font-semibold tracking-tight mb-1.5" style={{ color: 'var(--text-main)' }}>
        {t('onboarding.v2.problem.title')}
      </h2>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">{t('onboarding.v2.problem.subtitle')}</p>
      <div className="space-y-2.5">
        {ONBOARDING_PROBLEMS.map(c => {
          const meta = PROBLEM_META[c];
          return (
            <SelectCard
              key={c}
              layout="list"
              selected={value === c}
              onClick={() => onChange(c)}
              icon={meta.icon}
              label={t(meta.labelKey)}
              description={t(meta.descKey)}
            />
          );
        })}
      </div>
    </>
  );
};
