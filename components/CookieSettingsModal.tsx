import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Lock } from 'lucide-react';
import { useTranslation } from '../i18n/I18nProvider';
import { useModalA11y } from '../hooks/useModalA11y';
import { getCookieConsent, setCookieConsent } from '../services/cookieConsent';

interface CookieSettingsModalProps {
  onClose: () => void;
  onShowPrivacy: () => void;
}

export const CookieSettingsModal: React.FC<CookieSettingsModalProps> = ({ onClose, onShowPrivacy }) => {
  const { t } = useTranslation();
  const { dialogProps, titleId } = useModalA11y(onClose);
  const current = getCookieConsent();
  const [functional, setFunctional] = useState(current?.functional ?? true);
  const [analytics, setAnalytics] = useState(current?.analytics ?? false);

  const save = (prefs: { functional: boolean; analytics: boolean }) => {
    setCookieConsent(prefs);
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        {...dialogProps}
        className="w-full max-w-lg max-h-[85vh] flex flex-col rounded-[32px] shadow-3d-deep animate-in zoom-in-95 duration-300 overflow-hidden"
        style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}
      >
        <div className="flex items-center justify-between p-8 pb-0 shrink-0">
          <h2 id={titleId} className="text-lg font-black dark:text-white uppercase tracking-tight">{t('cookie.settings.title')}</h2>
          <button aria-label={t('common.close')} onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white transition-all" style={{ background: 'color-mix(in srgb, var(--border-color) 60%, var(--bg-sidebar))' }}>
            <X className="w-[18px] h-[18px]" strokeWidth={2} />
          </button>
        </div>

        <div className="p-8 space-y-4 overflow-y-auto">
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            {t('cookie.settings.intro')}{' '}
            <button onClick={onShowPrivacy} className="underline hover:no-underline font-semibold" style={{ color: 'var(--primary)' }}>
              {t('cookie.privacyLink')}
            </button>
          </p>

          {/* Essenziell */}
          <div className="p-4 rounded-2xl space-y-2" style={{ background: 'color-mix(in srgb, var(--border-color) 30%, var(--bg-main))', border: '1px solid var(--border-color)' }}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-black uppercase tracking-widest dark:text-white">{t('cookie.settings.essential.title')}</p>
              <span className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-slate-400">
                <Lock className="w-3 h-3" strokeWidth={2.5} /> {t('cookie.settings.essential.always')}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">{t('cookie.settings.essential.desc')}</p>
          </div>

          {/* Funktional */}
          <label className="flex items-start gap-3 p-4 rounded-2xl cursor-pointer" style={{ background: 'color-mix(in srgb, var(--border-color) 30%, var(--bg-main))', border: '1px solid var(--border-color)' }}>
            <input
              type="checkbox"
              checked={functional}
              onChange={e => setFunctional(e.target.checked)}
              className="w-4 h-4 mt-0.5 rounded accent-[var(--primary)] shrink-0"
            />
            <span>
              <span className="block text-[11px] font-black uppercase tracking-widest dark:text-white mb-1">{t('cookie.settings.functional.title')}</span>
              <span className="block text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">{t('cookie.settings.functional.desc')}</span>
            </span>
          </label>

          {/* Analyse */}
          <label className="flex items-start gap-3 p-4 rounded-2xl cursor-pointer" style={{ background: 'color-mix(in srgb, var(--border-color) 30%, var(--bg-main))', border: '1px solid var(--border-color)' }}>
            <input
              type="checkbox"
              checked={analytics}
              onChange={e => setAnalytics(e.target.checked)}
              className="w-4 h-4 mt-0.5 rounded accent-[var(--primary)] shrink-0"
            />
            <span>
              <span className="block text-[11px] font-black uppercase tracking-widest dark:text-white mb-1">{t('cookie.settings.analytics.title')}</span>
              <span className="block text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">{t('cookie.settings.analytics.desc')}</span>
            </span>
          </label>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              onClick={() => save({ functional: false, analytics: false })}
              className="flex-1 py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all"
              style={{ background: 'color-mix(in srgb, var(--border-color) 40%, var(--bg-main))', color: 'var(--text-main)' }}
            >
              {t('cookie.settings.essentialOnly')}
            </button>
            <button
              onClick={() => save({ functional: true, analytics: true })}
              className="flex-1 py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all"
              style={{ background: 'color-mix(in srgb, var(--border-color) 40%, var(--bg-main))', color: 'var(--text-main)' }}
            >
              {t('cookie.settings.acceptAll')}
            </button>
            <button
              onClick={() => save({ functional, analytics })}
              className="flex-1 py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest text-white transition-all hover:scale-[1.02]"
              style={{ background: 'var(--primary)' }}
            >
              {t('cookie.settings.save')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};
