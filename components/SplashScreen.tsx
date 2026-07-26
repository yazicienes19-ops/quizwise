import React from 'react';
import { useTranslation } from '../i18n/I18nProvider';
import { BrandMark } from './BrandMark';

/**
 * SplashScreen — ersetzt das `return null` während des Auth-Checks.
 * Zeigt das StudeArc-Branding statt eines weißen Bildschirms.
 */
export const SplashScreen: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-white dark:bg-slate-950">
      <div className="flex flex-col items-center gap-6 animate-in fade-in zoom-in-95 duration-500">
        {/* Logo */}
        <div className="relative">
          <div
            className="w-20 h-20 rounded-[24px] flex items-center justify-center shadow-lg"
            style={{ background: 'var(--mark-bg)', border: '1px solid var(--border-color)' }}
          >
            <BrandMark size={44} strokeColor="var(--mark-stroke)" peakColor="var(--mark-peak)" />
          </div>
          {/* Puls-Ring */}
          <div
            className="absolute inset-0 rounded-[24px] animate-ping opacity-20"
            style={{ background: 'var(--mark-peak)' }}
          />
        </div>

        <div className="text-center space-y-1">
          <p className="text-xl font-black uppercase tracking-tighter text-slate-900 dark:text-white">
            Stude<span style={{ color: 'var(--mark-peak)' }}>Arc</span>
          </p>
          <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-slate-400">
            {t('splash.tagline')}
          </p>
        </div>

        {/* Lade-Indikator */}
        <div className="flex gap-1.5 mt-2">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className="w-1.5 h-1.5 rounded-full animate-bounce"
              style={{
                background: 'var(--mark-peak)',
                animationDelay: `${i * 150}ms`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
