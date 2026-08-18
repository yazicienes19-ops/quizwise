import React from 'react';
import { useTranslation } from '../../../i18n/I18nProvider';

/**
 * Screen vor der App-Tour (Onboarding-Plan Abschnitt 20) — Tour ist optional,
 * "Später ansehen" überspringt Tour + Abschluss-Screens direkt zum Material-
 * Import (Verdrahtung dieses Skip-Sprungs lebt in OnboardingFlow.tsx).
 */
export const TourIntroStep: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center text-center py-2">
      <div
        className="w-14 h-14 rounded-[18px] flex items-center justify-center mb-5 text-2xl"
        style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
      >
        🧭
      </div>
      <h2 className="text-lg font-black tracking-tight mb-2" style={{ color: 'var(--text-main)' }}>
        {t('onboarding.flow.tourIntro.title')}
      </h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
        {t('onboarding.flow.tourIntro.subtitle')}
      </p>
    </div>
  );
};
