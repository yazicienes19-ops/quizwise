import React from 'react';
import type { OnboardingChallenge } from '../../../types';
import type { TKey } from '../../../i18n';
import { useTranslation } from '../../../i18n/I18nProvider';
import { SelectCard } from '../SelectCard';
import { ONBOARDING_PROBLEMS, MAX_PROBLEMS, type OnboardingProblem } from '../../../services/onboardingFirstMoment';

export const PROBLEM_META: Record<OnboardingProblem, { icon: string; labelKey: TKey; descKey: TKey }> = {
  exam_confidence: { icon: '😰', labelKey: 'onboarding.v2.problem.exam_confidence.label', descKey: 'onboarding.v2.problem.exam_confidence.desc' },
  retention: { icon: '🔄', labelKey: 'onboarding.v2.problem.retention.label', descKey: 'onboarding.v2.problem.retention.desc' },
  understanding: { icon: '🧠', labelKey: 'onboarding.v2.problem.understanding.label', descKey: 'onboarding.v2.problem.understanding.desc' },
  knowledge_gaps: { icon: '❓', labelKey: 'onboarding.v2.problem.knowledge_gaps.label', descKey: 'onboarding.v2.problem.knowledge_gaps.desc' },
  structure: { icon: '🗂️', labelKey: 'onboarding.v2.problem.structure.label', descKey: 'onboarding.v2.problem.structure.desc' },
  motivation: { icon: '🚀', labelKey: 'onboarding.v2.problem.motivation.label', descKey: 'onboarding.v2.problem.motivation.desc' },
};

interface ProblemStepProps {
  value: OnboardingChallenge[];
  onChange: (problems: OnboardingChallenge[]) => void;
}

/**
 * Frage 2 von 2: Was bremst dich beim Lernen? Bis zu MAX_PROBLEMS Antworten,
 * die zuerst gewählte zählt am meisten (bestimmt den ersten Lernmoment).
 */
export const ProblemStep: React.FC<ProblemStepProps> = ({ value, onChange }) => {
  const { t } = useTranslation();

  const toggle = (c: OnboardingChallenge) => {
    if (value.includes(c)) onChange(value.filter(x => x !== c));
    else if (value.length < MAX_PROBLEMS) onChange([...value, c]);
    // Am Maximum weicht die zuletzt gewählte (niedrigste Priorität), die wichtigste bleibt.
    else onChange([...value.slice(0, MAX_PROBLEMS - 1), c]);
  };

  return (
    <>
      <h2 className="text-lg font-semibold tracking-tight mb-1.5" style={{ color: 'var(--text-main)' }}>
        {t('onboarding.v2.problem.title')}
      </h2>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">{t('onboarding.v2.problem.subtitle')}</p>
      <div className="space-y-2.5">
        {ONBOARDING_PROBLEMS.map(c => {
          const meta = PROBLEM_META[c];
          const idx = value.indexOf(c);
          return (
            <SelectCard
              key={c}
              layout="list"
              selected={idx !== -1}
              onClick={() => toggle(c)}
              icon={meta.icon}
              label={t(meta.labelKey)}
              description={t(meta.descKey)}
              priority={value.length > 1 && idx !== -1 ? idx + 1 : undefined}
            />
          );
        })}
      </div>
    </>
  );
};
