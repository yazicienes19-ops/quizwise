import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, Zap } from 'lucide-react';
import { useTranslation } from '../i18n/I18nProvider';
import { useModalA11y } from '../hooks/useModalA11y';

interface WiderrufConsentModalProps {
  isLoading: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * Holt vor dem Weiterleiten zu Stripe die nach § 356 Abs. 4 BGB erforderliche
 * ausdrückliche Zustimmung zum vorzeitigen Vertragsbeginn samt Kenntnisnahme
 * des dadurch eintretenden Erlöschens des Widerrufsrechts ein. Ohne diese
 * Bestätigung bleibt das Widerrufsrecht die vollen vierzehn Tage bestehen,
 * unabhängig von der AGB-Klausel — s. § 4 AGB.
 */
export const WiderrufConsentModal: React.FC<WiderrufConsentModalProps> = ({ isLoading, onConfirm, onClose }) => {
  const { t } = useTranslation();
  const { dialogProps, titleId, descriptionId } = useModalA11y(onClose);
  const [checked, setChecked] = useState(false);

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        {...dialogProps}
        aria-describedby={descriptionId}
        className="w-full max-w-md rounded-[32px] shadow-3d-deep animate-in zoom-in-95 duration-300 overflow-hidden"
        style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}
      >
        <div className="flex items-center justify-between p-8 pb-0">
          <h2 id={titleId} className="text-lg font-black dark:text-white uppercase tracking-tight">{t('checkout.consent.title')}</h2>
          <button aria-label={t('common.close')} onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white transition-all" style={{ background: 'color-mix(in srgb, var(--border-color) 60%, var(--bg-sidebar))' }}>
            <X className="w-[18px] h-[18px]" strokeWidth={2} />
          </button>
        </div>

        <div id={descriptionId} className="p-8 space-y-4">
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">{t('checkout.consent.text')}</p>

          <label className="flex items-start gap-3 p-4 rounded-2xl cursor-pointer" style={{ background: 'color-mix(in srgb, var(--border-color) 30%, var(--bg-main))', border: '1px solid var(--border-color)' }}>
            <input
              type="checkbox"
              checked={checked}
              onChange={e => setChecked(e.target.checked)}
              className="w-4 h-4 mt-0.5 rounded accent-[var(--primary)] shrink-0"
            />
            <span className="text-[11px] font-bold dark:text-white leading-relaxed">{t('checkout.consent.checkbox')}</span>
          </label>

          <button
            onClick={onConfirm}
            disabled={!checked || isLoading}
            className="w-full py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest text-white transition-all hover:scale-[1.02] disabled:opacity-40 disabled:hover:scale-100 flex items-center justify-center gap-2"
            style={{ background: 'var(--primary)' }}
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" strokeWidth={2} />}
            {t('checkout.consent.confirmButton')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
