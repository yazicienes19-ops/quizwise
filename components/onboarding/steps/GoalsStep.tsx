import React from 'react';
import type { OnboardingGoal } from '../../../types';
import { useTranslation } from '../../../i18n/I18nProvider';
import type { TKey } from '../../../i18n';
import { SelectCard } from '../SelectCard';

const GOALS: { goal: OnboardingGoal; icon: string; labelKey: TKey }[] = [
  { goal: 'exam_prep', icon: '🎯', labelKey: 'onboarding.flow.goals.exam_prep' },
  { goal: 'understand', icon: '🧠', labelKey: 'onboarding.flow.goals.understand' },
  { goal: 'improve_performance', icon: '📈', labelKey: 'onboarding.flow.goals.improve_performance' },
  { goal: 'efficiency', icon: '⏱️', labelKey: 'onboarding.flow.goals.efficiency' },
  { goal: 'retain_long_term', icon: '🧩', labelKey: 'onboarding.flow.goals.retain_long_term' },
  { goal: 'new_skill', icon: '🚀', labelKey: 'onboarding.flow.goals.new_skill' },
  { goal: 'unsure', icon: '🤷', labelKey: 'onboarding.flow.goals.unsure' },
];

interface GoalsStepProps {
  value: OnboardingGoal[];
  onChange: (goals: OnboardingGoal[]) => void;
}

/**
 * Mehrfachauswahl, Reihenfolge = Priorität (erste Auswahl = Hauptziel,
 * sichtbar über die Nummer-Badge). "Weiter" ist immer aktiv — 0 Ziele ist
 * eine valide Antwort, kein separater Skip-Button nötig.
 */
export const GoalsStep: React.FC<GoalsStepProps> = ({ value, onChange }) => {
  const { t } = useTranslation();

  const toggle = (goal: OnboardingGoal) => {
    if (value.includes(goal)) onChange(value.filter(g => g !== goal));
    else onChange([...value, goal]);
  };

  return (
    <>
      <h2 className="text-lg font-black tracking-tight mb-1.5" style={{ color: 'var(--text-main)' }}>
        {t('onboarding.flow.goals.title')}
      </h2>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">{t('onboarding.flow.goals.subtitle')}</p>
      <div className="grid grid-cols-2 gap-3">
        {GOALS.map(({ goal, icon, labelKey }) => {
          const idx = value.indexOf(goal);
          return (
            <SelectCard
              key={goal}
              selected={idx !== -1}
              onClick={() => toggle(goal)}
              icon={icon}
              label={t(labelKey)}
              priority={idx !== -1 ? idx + 1 : undefined}
            />
          );
        })}
      </div>
    </>
  );
};
