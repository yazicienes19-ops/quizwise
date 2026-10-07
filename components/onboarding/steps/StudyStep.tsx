import React from 'react';
import { useTranslation } from '../../../i18n/I18nProvider';

const SUGGESTIONS = ['Psychologie', 'BWL', 'Medizin', 'Jura', 'Informatik', 'Lehramt', 'Maschinenbau', 'Soziale Arbeit'];

interface StudyStepProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
}

/** Frage 1 von 2: "Was studierst du?" Freitext mit Vorschlägen zum Antippen. */
export const StudyStep: React.FC<StudyStepProps> = ({ value, onChange, onSubmit }) => {
  const { t } = useTranslation();

  return (
    <>
      <h2 className="text-lg font-semibold tracking-tight mb-1.5" style={{ color: 'var(--text-main)' }}>
        {t('onboarding.v2.study.title')}
      </h2>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">{t('onboarding.v2.study.subtitle')}</p>
      <input
        type="text"
        autoFocus
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && value.trim()) onSubmit(); }}
        placeholder={t('onboarding.v2.study.placeholder')}
        maxLength={80}
        className="w-full px-4 py-3 rounded-[14px] text-sm font-medium outline-none transition-colors focus:border-[var(--primary)]"
        style={{ background: 'var(--bg-main)', color: 'var(--text-main)', border: '2px solid var(--border-color)' }}
      />
      <div className="flex flex-wrap gap-2 mt-4">
        {SUGGESTIONS.map(s => {
          const active = value.trim() === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => onChange(s)}
              className="px-3 py-1.5 rounded-full text-[13px] font-semibold transition-all active:scale-[0.97]"
              style={active
                ? { background: 'color-mix(in srgb, var(--primary) 14%, var(--bg-main))', color: 'var(--text-main)', border: '1.5px solid var(--primary)' }
                : { background: 'var(--bg-main)', color: 'var(--text-secondary)', border: '1.5px solid var(--border-color)' }}
            >
              {s}
            </button>
          );
        })}
      </div>
    </>
  );
};
