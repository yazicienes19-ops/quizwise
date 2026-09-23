import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link2, Share2 } from 'lucide-react';
import { useModalA11y } from '../hooks/useModalA11y';
import { ModalCloseButton } from './ModalCloseButton';
import { useTranslation } from '../i18n/I18nProvider';
import { toast } from '../services/toast';

interface ShareLinkModalProps {
  url: string;
  title: string;
  onClose: () => void;
}

/**
 * Zeigt einen Teilen-Link sichtbar an, statt nur still in die Zwischenablage
 * zu schreiben: Safari (Mac/iPad) verweigert clipboard.writeText nach einem
 * await außerhalb der Klick-Geste, der Link wäre dann erzeugt, aber für den
 * Nutzer verloren. Der Kopieren-Button ruft die Zwischenablage synchron im
 * Klick auf, mit execCommand-Fallback über das Eingabefeld.
 */
export const ShareLinkModal: React.FC<ShareLinkModalProps> = ({ url, title, onClose }) => {
  const { t } = useTranslation();
  const { titleId, dialogProps } = useModalA11y(onClose);
  const inputRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const handleCopy = () => {
    const markCopied = () => { setCopied(true); setTimeout(() => setCopied(false), 2500); };
    const fallback = () => {
      try {
        inputRef.current?.focus();
        inputRef.current?.select();
        if (document.execCommand('copy')) { markCopied(); return; }
      } catch {}
      toast.error(t('share.copyFailed'));
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(markCopied).catch(fallback);
    } else {
      fallback();
    }
  };

  const handleNativeShare = () => {
    navigator.share({ title, url }).catch(() => {});
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={onClose}>
      <div
        {...dialogProps}
        className="w-full max-w-md rounded-[32px] shadow-3d-deep overflow-hidden animate-in zoom-in-95 duration-300"
        style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-start px-8 py-6" style={{ borderBottom: '1px solid var(--border-color)' }}>
          <div className="min-w-0 flex-1 pr-4">
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-1">{t('share.eyebrow')}</p>
            <h2 id={titleId} className="text-xl font-black break-words" style={{ color: 'var(--text-main)' }}>{title}</h2>
          </div>
          <ModalCloseButton onClick={onClose} label={t('common.close')} />
        </div>

        <div className="px-8 py-6 space-y-4">
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{t('share.subtitle')}</p>
          <div className="flex items-center gap-2 rounded-2xl px-4 py-3" style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)' }}>
            <Link2 className="w-4 h-4 shrink-0 text-slate-400" strokeWidth={2.5} />
            <input
              ref={inputRef}
              readOnly
              value={url}
              onFocus={e => e.currentTarget.select()}
              aria-label={t('share.eyebrow')}
              className="flex-1 min-w-0 bg-transparent outline-none text-sm font-medium"
              style={{ color: 'var(--text-main)' }}
            />
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleCopy}
              className="flex-1 py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all hover:scale-[1.02]"
              style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
            >
              {copied ? `${t('share.copied')} ✓` : t('share.copy')}
            </button>
            {canNativeShare && (
              <button
                type="button"
                onClick={handleNativeShare}
                aria-label={t('share.native')}
                className="w-14 rounded-2xl flex items-center justify-center transition-all hover:scale-[1.02]"
                style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)', color: 'var(--text-main)' }}
              >
                <Share2 className="w-4 h-4" strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
