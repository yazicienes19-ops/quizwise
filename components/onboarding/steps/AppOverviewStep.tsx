import React from 'react';
import { useTranslation } from '../../../i18n/I18nProvider';
import type { TKey } from '../../../i18n';

const AREAS: { icon: string; titleKey: TKey; descKey: TKey }[] = [
  { icon: '📚', titleKey: 'onboarding.flow.overview.library.title', descKey: 'onboarding.flow.overview.library.desc' },
  { icon: '🎯', titleKey: 'onboarding.flow.overview.learn.title', descKey: 'onboarding.flow.overview.learn.desc' },
  { icon: '🎓', titleKey: 'onboarding.flow.overview.exam.title', descKey: 'onboarding.flow.overview.exam.desc' },
  { icon: '📊', titleKey: 'onboarding.flow.overview.analysis.title', descKey: 'onboarding.flow.overview.analysis.desc' },
  { icon: '🧭', titleKey: 'onboarding.flow.overview.coach.title', descKey: 'onboarding.flow.overview.coach.desc' },
];

/**
 * "Das ist dein StudeArc" (Onboarding-Plan Abschnitt 3, letzter Screen vor dem
 * Material-Import) — Kurzüberblick + die zentrale Botschaft, dass nichts davon
 * gleichzeitig genutzt werden muss.
 */
export const AppOverviewStep: React.FC = () => {
  const { t } = useTranslation();
  return (
    <>
      <h2 className="text-lg font-black tracking-tight mb-4" style={{ color: 'var(--text-main)' }}>
        {t('onboarding.flow.overview.title')}
      </h2>
      <div className="space-y-2.5 mb-4">
        {AREAS.map((area, i) => (
          <div
            key={area.titleKey}
            className="flex items-center gap-3 px-4 py-3 rounded-[14px] animate-card-enter"
            style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)', ['--stagger-i' as string]: i }}
          >
            <span className="text-lg leading-none shrink-0">{area.icon}</span>
            <div className="min-w-0">
              <p className="text-sm font-black" style={{ color: 'var(--text-main)' }}>{t(area.titleKey)}</p>
              <p className="text-xs opacity-60" style={{ color: 'var(--text-main)' }}>{t(area.descKey)}</p>
            </div>
          </div>
        ))}
      </div>
      <p
        className="text-xs leading-relaxed px-4 py-3 rounded-[14px] font-bold"
        style={{ background: 'color-mix(in srgb, var(--primary) 10%, var(--bg-main))', color: 'var(--text-main)' }}
      >
        {t('onboarding.flow.overview.footer')}
      </p>
    </>
  );
};
