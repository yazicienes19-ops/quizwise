import React, { Fragment } from 'react';
import { useTranslation } from '../../../i18n/I18nProvider';
import type { TKey } from '../../../i18n';

const FLOW: { icon: string; labelKey: TKey }[] = [
  { icon: '📚', labelKey: 'onboarding.flow.system.step.library' },
  { icon: '🎯', labelKey: 'onboarding.flow.system.step.learn' },
  { icon: '🔁', labelKey: 'onboarding.flow.system.step.practice' },
  { icon: '📊', labelKey: 'onboarding.flow.system.step.analysis' },
  { icon: '🎓', labelKey: 'onboarding.flow.system.step.exam' },
  { icon: '✨', labelKey: 'onboarding.flow.system.step.recommend' },
];

/**
 * "Alles hängt zusammen" (Onboarding-Plan Abschnitt 3, Verbindungs-Screen nach
 * der Tour) — reine Divs+Pfeile statt einer neuen Chart-Bibliothek, gestaffelt
 * per animate-card-enter (bestehendes Muster, s. Dashboard.tsx).
 */
export const SystemOverviewStep: React.FC = () => {
  const { t } = useTranslation();
  return (
    <>
      <h2 className="text-lg font-black tracking-tight mb-1.5" style={{ color: 'var(--text-main)' }}>
        {t('onboarding.flow.system.title')}
      </h2>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-5 leading-relaxed">
        {t('onboarding.flow.system.subtitle')}
      </p>
      <div>
        {FLOW.map((step, i) => (
          <Fragment key={step.labelKey}>
            <div
              className="flex items-center gap-3 px-4 py-3 rounded-[14px] animate-card-enter"
              style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)', ['--stagger-i' as string]: i }}
            >
              <span className="text-lg leading-none">{step.icon}</span>
              <span className="text-sm font-black" style={{ color: 'var(--text-main)' }}>{t(step.labelKey)}</span>
            </div>
            {i < FLOW.length - 1 && (
              <div className="flex justify-center py-1">
                <span style={{ color: 'var(--primary)' }}>↓</span>
              </div>
            )}
          </Fragment>
        ))}
      </div>
    </>
  );
};
