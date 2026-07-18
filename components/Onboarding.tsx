import React, { useState } from 'react';
import { useTranslation } from '../i18n/I18nProvider';
import type { TKey, Locale } from '../i18n';

const ONBOARDING_KEY = 'quizwise_onboarding_done';

export const isOnboardingDone = () => localStorage.getItem(ONBOARDING_KEY) === 'true';
export const resetOnboarding = () => localStorage.removeItem(ONBOARDING_KEY);

interface OnboardingProps {
  onComplete: () => void;
  /** Optional: direkt zum Upload navigieren nach Abschluss */
  onStartUpload?: () => void;
}

interface Step {
  icon: React.ReactNode;
  titleKey: TKey;
  descKey: TKey;
  highlightKey: TKey;
}

const ICON_PROPS = {
  xmlns: 'http://www.w3.org/2000/svg', width: 30, height: 30, viewBox: '0 0 24 24',
  fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round',
} as const;

const STEPS: Step[] = [
  {
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>
    ),
    titleKey: 'onboarding.step1.title',
    descKey: 'onboarding.step1.desc',
    highlightKey: 'onboarding.step1.highlight',
  },
  {
    icon: (
      <svg {...ICON_PROPS}>
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="6" />
        <circle cx="12" cy="12" r="2" />
      </svg>
    ),
    titleKey: 'onboarding.step2.title',
    descKey: 'onboarding.step2.desc',
    highlightKey: 'onboarding.step2.highlight',
  },
  {
    icon: (
      <svg {...ICON_PROPS}>
        <polyline points="23 4 23 10 17 10" />
        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
      </svg>
    ),
    titleKey: 'onboarding.step3.title',
    descKey: 'onboarding.step3.desc',
    highlightKey: 'onboarding.step3.highlight',
  },
  {
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    ),
    titleKey: 'onboarding.step4.title',
    descKey: 'onboarding.step4.desc',
    highlightKey: 'onboarding.step4.highlight',
  },
];

// Gesamt = 1 Sprachschritt + 4 Inhaltsschritte
const TOTAL = STEPS.length + 1;

export const Onboarding: React.FC<OnboardingProps> = ({ onComplete, onStartUpload }) => {
  const { t, locale, changeLocale } = useTranslation();
  const [step, setStep] = useState(0);
  const isLangStep = step === 0;
  const isLast = step === TOTAL - 1;
  const content = isLangStep ? null : STEPS[step - 1];

  const finish = (startUpload: boolean) => {
    localStorage.setItem(ONBOARDING_KEY, 'true');
    onComplete();
    if (startUpload && onStartUpload) onStartUpload();
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
      <div
        className="w-full max-w-md rounded-[28px] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-300"
        style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}
      >

        {/* Fortschritts-Balken: zurückliegende Schritte sind anklickbar */}
        <div className="flex gap-1.5 p-5 pb-0">
          {Array.from({ length: TOTAL }).map((_, i) => (
            <button
              key={i}
              aria-label={t('onboarding.step', { n: i + 1, total: TOTAL })}
              onClick={() => i < step && setStep(i)}
              className="h-1 flex-1 rounded-full transition-all duration-300"
              style={{
                background: i <= step ? 'var(--primary)' : 'var(--border-color)',
                opacity: i <= step ? 1 : 0.5,
                cursor: i < step ? 'pointer' : 'default',
              }}
            />
          ))}
        </div>

        {isLangStep ? (
          <div className="p-8 pt-10 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-[20px] flex items-center justify-center mb-6 text-3xl" style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}>
              🌍
            </div>
            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400 mb-2">
              {t('onboarding.step', { n: 1, total: TOTAL })}
            </p>
            <h2 className="text-xl font-black tracking-tight mb-3" style={{ color: 'var(--text-main)' }}>
              Wähle deine Sprache · Dilini seç
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-6">
              In welcher Sprache möchtest du lernen?<br />
              Hangi dilde öğrenmek istersin?
            </p>
            <div className="grid grid-cols-2 gap-3 w-full">
              {(['de', 'tr'] as Locale[]).map(l => (
                <button
                  key={l}
                  onClick={() => changeLocale(l)}
                  className="py-4 rounded-[16px] text-sm font-black uppercase tracking-widest transition-all hover:scale-[1.02]"
                  style={locale === l
                    ? { background: 'var(--primary)', color: 'var(--primary-text)', border: '2px solid var(--primary)' }
                    : { background: 'var(--bg-main)', color: 'var(--text-main)', border: '2px solid var(--border-color)' }}
                >
                  {l === 'de' ? '🇩🇪 Deutsch' : '🇹🇷 Türkçe'}
                </button>
              ))}
            </div>
          </div>
        ) : content && (
          <div className="p-8 pt-10 flex flex-col items-center text-center">
            <div
              className="w-16 h-16 rounded-[20px] flex items-center justify-center mb-6"
              style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
            >
              {content.icon}
            </div>

            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400 mb-2">
              {t('onboarding.step', { n: step + 1, total: TOTAL })}
            </p>

            <h2 className="text-xl font-black tracking-tight mb-3" style={{ color: 'var(--text-main)' }}>
              {t(content.titleKey)}
            </h2>

            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-4">
              {t(content.descKey)}
            </p>

            <p
              className="text-[10px] font-bold uppercase tracking-widest px-4 py-2 rounded-xl"
              style={{
                background: 'color-mix(in srgb, var(--primary) 10%, transparent)',
                color: 'var(--primary)',
                border: '1px solid color-mix(in srgb, var(--primary) 20%, transparent)',
              }}
            >
              {t(content.highlightKey)}
            </p>
          </div>
        )}

        {/* Aktionen */}
        <div className="px-8 pb-8 space-y-3">
          {isLast ? (
            <>
              <button
                onClick={() => finish(true)}
                className="w-full py-3.5 rounded-[16px] text-[11px] font-black uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all"
                style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
              >
                {t('onboarding.uploadFirst')}
              </button>
              <button
                onClick={() => finish(false)}
                className="w-full py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
              >
                {t('onboarding.lookAround')}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setStep(step + 1)}
                className="w-full py-3.5 rounded-[16px] text-[11px] font-black uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all"
                style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
              >
                {t('common.next')}
              </button>
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setStep(Math.max(0, step - 1))}
                  disabled={step === 0}
                  className="py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors disabled:opacity-0"
                >
                  ← {t('common.back')}
                </button>
                <button
                  onClick={() => finish(false)}
                  className="py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                >
                  {t('onboarding.skip')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
