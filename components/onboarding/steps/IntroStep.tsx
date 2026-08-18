import React from 'react';
import { useTranslation } from '../../../i18n/I18nProvider';

export const IntroStep: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center text-center py-4">
      <div
        className="w-16 h-16 rounded-[20px] flex items-center justify-center mb-6 text-3xl"
        style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
      >
        👋
      </div>
      <h2 className="text-xl font-black tracking-tight mb-3" style={{ color: 'var(--text-main)' }}>
        {t('onboarding.flow.intro.title')}
      </h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
        {t('onboarding.flow.intro.subtitle')}
      </p>
    </div>
  );
};
