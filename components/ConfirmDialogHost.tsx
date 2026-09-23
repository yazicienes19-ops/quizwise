import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { registerConfirmHost, type PendingConfirm } from '../services/confirmDialog';
import { useModalA11y } from '../hooks/useModalA11y';
import { useTranslation } from '../i18n/I18nProvider';

/** Zeigt Anfragen von confirmDialog() an (s. services/confirmDialog.ts). */
export const ConfirmDialogHost: React.FC = () => {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  useEffect(() => registerConfirmHost(setPending), []);
  if (!pending) return null;
  return <ConfirmDialog pending={pending} />;
};

const ConfirmDialog: React.FC<{ pending: PendingConfirm }> = ({ pending }) => {
  const { t } = useTranslation();
  const cancel = () => pending.resolve(false);
  // Fokus startet auf "Abbrechen": Enter bestätigt keine Löschung aus Versehen.
  const cancelRef = useRef<HTMLButtonElement>(null);
  const { titleId, dialogProps } = useModalA11y(cancel, cancelRef);
  const confirmLabel = pending.confirmLabel ?? (pending.danger ? t('common.delete') : t('common.confirm'));

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/50 animate-in fade-in duration-150" onClick={cancel}>
      <div
        {...dialogProps}
        className="w-full max-w-sm rounded-[24px] p-6 space-y-5 shadow-2xl animate-in zoom-in-95 duration-150"
        style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}
        onClick={e => e.stopPropagation()}
      >
        <p id={titleId} className="text-[15px] leading-relaxed" style={{ color: 'var(--text-main)' }}>
          {pending.message}
        </p>
        <div className="flex gap-2.5 justify-end">
          <button
            ref={cancelRef}
            onClick={cancel}
            className="px-4 py-2.5 rounded-xl text-[13px] font-bold transition-colors"
            style={{ color: 'var(--text-main)', border: '1px solid var(--border-color)' }}
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={() => pending.resolve(true)}
            className="px-4 py-2.5 rounded-xl text-[13px] font-bold transition-opacity hover:opacity-90"
            style={pending.danger
              ? { background: '#DC2626', color: '#FFFFFF' }
              : { background: 'var(--primary)', color: 'var(--primary-text)' }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
