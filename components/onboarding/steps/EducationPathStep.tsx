import React from 'react';
import type { EducationPath } from '../../../types';
import { useTranslation } from '../../../i18n/I18nProvider';
import { SelectCard } from '../SelectCard';

const PATHS: { path: EducationPath; icon: string; labelKey: 'onboarding.flow.path.university' | 'onboarding.flow.path.school' | 'onboarding.flow.path.apprenticeship' | 'onboarding.flow.path.continuing' | 'onboarding.flow.path.self' | 'onboarding.flow.path.other' }[] = [
  { path: 'university', icon: '🎓', labelKey: 'onboarding.flow.path.university' },
  { path: 'school', icon: '🏫', labelKey: 'onboarding.flow.path.school' },
  { path: 'apprenticeship', icon: '🔧', labelKey: 'onboarding.flow.path.apprenticeship' },
  { path: 'continuing_education', icon: '📚', labelKey: 'onboarding.flow.path.continuing' },
  { path: 'self_directed', icon: '🧠', labelKey: 'onboarding.flow.path.self' },
  { path: 'other', icon: '✨', labelKey: 'onboarding.flow.path.other' },
];

interface EducationPathStepProps {
  value: EducationPath | undefined;
  onChange: (path: EducationPath) => void;
}

/**
 * Keine der 6 Optionen ist optisch/inhaltlich hervorgehoben (gleiches Grid,
 * gleiche Kartengröße für alle) — bewusste Umsetzung von "Universität darf
 * nicht wichtiger wirken als Ausbildung oder Schule".
 */
export const EducationPathStep: React.FC<EducationPathStepProps> = ({ value, onChange }) => {
  const { t } = useTranslation();

  return (
    <>
      <h2 className="text-lg font-black tracking-tight mb-5" style={{ color: 'var(--text-main)' }}>
        {t('onboarding.flow.path.title')}
      </h2>
      <div className="grid grid-cols-2 gap-3">
        {PATHS.map(({ path, icon, labelKey }) => (
          <SelectCard key={path} selected={value === path} onClick={() => onChange(path)} icon={icon} label={t(labelKey)} />
        ))}
      </div>
    </>
  );
};
