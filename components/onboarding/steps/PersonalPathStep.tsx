import React, { useMemo } from 'react';
import { type OnboardingChallenge, type ActiveTab } from '../../../types';
import { useTranslation } from '../../../i18n/I18nProvider';
import { getRecommendation, buildCombinedRecommendation } from '../../../services/onboardingRecommendation';
import { TAB_LABEL_KEY, TAB_ICON } from '../tabLabels';

interface PersonalPathStepProps {
  challenges: OnboardingChallenge[];
}

/**
 * "DEIN LERNWEG" (Onboarding-Überarbeitung Abschnitt 2, zweiter Screen des
 * USP-Moments, direkt nach RecommendationStep): nummerierte 01/02/03-Liste,
 * abgeleitet aus derselben, bereits getesteten Empfehlungs-Logik wie überall
 * sonst im Flow — keine neue Algorithmik:
 * - 1 Challenge: [primaryTab, ...secondaryTabs] der Einzel-Empfehlung
 * - 2-3 Challenges: buildCombinedRecommendation().steps (Phasen-Sortierung +
 *   Brücken-Schritt bereits vorhanden — entscheidet automatisch, wie der
 *   zweite Schmerzpunkt eingebaut wird)
 * Auf max. 3 Zeilen gekappt, damit der Screen kurz bleibt.
 */
export const PersonalPathStep: React.FC<PersonalPathStepProps> = ({ challenges }) => {
  const { t } = useTranslation();

  const pathTabs: ActiveTab[] = useMemo(() => {
    if (challenges.length >= 2) {
      return buildCombinedRecommendation(challenges).steps.slice(0, 3).map(s => s.tab);
    }
    const rec = getRecommendation(challenges[0] ?? 'unsure');
    return [rec.primaryTab, ...rec.secondaryTabs].slice(0, 3);
  }, [challenges]);

  return (
    <>
      <h2 className="text-lg font-black tracking-tight mb-1.5" style={{ color: 'var(--text-main)' }}>
        {t('onboarding.rec.combined.title')}
      </h2>
      <p className="text-[10px] font-black uppercase tracking-widest mb-5" style={{ color: 'var(--text-secondary)' }}>
        {t('onboarding.usp.pathLabel')}
      </p>
      <div className="space-y-2.5 mb-4">
        {pathTabs.map((tab, i) => {
          const labelKey = TAB_LABEL_KEY[tab];
          return (
            <div
              key={`${tab}-${i}`}
              className="flex items-center gap-3 p-4 rounded-[16px] animate-card-enter"
              style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)', ['--stagger-i' as string]: i }}
            >
              <span className="shrink-0 text-[11px] font-black tabular-nums" style={{ color: 'var(--primary)' }}>
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="shrink-0 text-lg leading-none">{TAB_ICON[tab] ?? '✨'}</span>
              <p className="text-sm font-black" style={{ color: 'var(--text-main)' }}>
                {labelKey ? t(labelKey) : ''}
              </p>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
        {t('onboarding.usp.path.footer')}
      </p>
    </>
  );
};
