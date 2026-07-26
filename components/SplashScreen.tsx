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
        <div className="flex items-center gap-3">
          <BrandMark size={40} strokeColor="var(--mark-stroke)" peakColor="var(--mark-peak)" className="shrink-0" />
          <p className="text-2xl font-black uppercase tracking-tighter text-slate-900 dark:text-white">
            Stude<span style={{ color: 'var(--mark-peak)' }}>Arc</span>
          </p>
        </div>
        <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-slate-400 -mt-4">
          {t('splash.tagline')}
        </p>

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
