import React from 'react';
import { useTranslation } from '../i18n/I18nProvider';

interface CookieBannerProps {
  onAccept: () => void;
  onShowPrivacy: () => void;
}

export const CookieBanner: React.FC<CookieBannerProps> = ({ onAccept, onShowPrivacy }) => {
  const { t } = useTranslation();
  return (
  <div className="fixed bottom-0 left-0 right-0 z-[9999] p-4 md:p-6 animate-in fade-in duration-500">
    <div
      className="max-w-2xl mx-auto rounded-2xl border shadow-3d-deep p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4"
      style={{ background: 'var(--bg-sidebar)', borderColor: 'var(--border-color)' }}
    >
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: 'var(--primary)' }}>
          {t('cookie.title')}
        </p>
        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
          {t('cookie.text')}{' '}
          <button onClick={onShowPrivacy} className="underline hover:no-underline font-semibold" style={{ color: 'var(--primary)' }}>
            {t('cookie.privacyLink')}
          </button>
        </p>
      </div>
      <button
        onClick={onAccept}
        className="px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-white shrink-0 hover:scale-105 active:scale-95 transition-transform"
        style={{ background: 'var(--primary)' }}
      >
        {t('cookie.accept')}
      </button>
    </div>
  </div>
  );
};
