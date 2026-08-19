import React from 'react';
import { createPortal } from 'react-dom';
import { X, AlertTriangle, Loader2 } from 'lucide-react';
import { useTranslation } from '../i18n/I18nProvider';
import { formatDate } from '../i18n/dates';
import { useModalA11y } from '../hooks/useModalA11y';

interface CancellationConfirmModalProps {
  email: string;
  isCancelling: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * Eigenständige Bestätigungsseite für die Abo-Kündigung (§ 312k Abs. 3 BGB) —
 * ersetzt den vorherigen nativen confirm()-Dialog. Zeigt Identifizierung,
 * Vertragsangabe, Kündigungsart und Erklärungsdatum vor dem verbindlichen
 * Bestätigungs-Button.
 */
export const CancellationConfirmModal: React.FC<CancellationConfirmModalProps> = ({ email, isCancelling, onConfirm, onClose }) => {
  const { t } = useTranslation();
  const { dialogProps, titleId, descriptionId } = useModalA11y(onClose);

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        {...dialogProps}
        aria-describedby={descriptionId}
        className="w-full max-w-md rounded-[32px] shadow-3d-deep animate-in zoom-in-95 duration-300 overflow-hidden"
        style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}
      >
        <div className="flex items-center justify-between p-8 pb-0">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" strokeWidth={2} />
            <h2 id={titleId} className="text-lg font-black dark:text-white uppercase tracking-tight">{t('settings.cancel.pageTitle')}</h2>
          </div>
          <button aria-label={t('common.close')} onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white transition-all" style={{ background: 'color-mix(in srgb, var(--border-color) 60%, var(--bg-sidebar))' }}>
            <X className="w-[18px] h-[18px]" strokeWidth={2} />
          </button>
        </div>

        <div id={descriptionId} className="p-8 space-y-4">
          <div className="p-4 rounded-2xl space-y-2" style={{ background: 'color-mix(in srgb, var(--border-color) 30%, var(--bg-main))', border: '1px solid var(--border-color)' }}>
            <p className="text-[11px] font-bold dark:text-white">{t('settings.cancel.identification', { email })}</p>
            <p className="text-[11px] font-bold dark:text-white">{t('settings.cancel.contract')}</p>
            <p className="text-[11px] font-bold dark:text-white">{t('settings.cancel.type')}</p>
            <p className="text-[11px] font-bold dark:text-white">{t('settings.cancel.declarationDate', { date: formatDate(new Date()) })}</p>
          </div>

          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">{t('settings.cancel.notice')}</p>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              onClick={onClose}
              disabled={isCancelling}
              className="flex-1 py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all disabled:opacity-40"
              style={{ background: 'color-mix(in srgb, var(--border-color) 40%, var(--bg-main))', color: 'var(--text-main)' }}
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={onConfirm}
              disabled={isCancelling}
              className="flex-1 py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest text-white bg-rose-500 hover:bg-rose-600 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {isCancelling ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {t('settings.cancel.confirmButton')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};
