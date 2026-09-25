import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Download, Check } from 'lucide-react';
import { useModalA11y } from '../hooks/useModalA11y';
import { ModalCloseButton } from './ModalCloseButton';
import { renderMarkdown } from './markdownRenderer';
import { useTranslation } from '../i18n/I18nProvider';
import { toast } from '../services/toast';
import { buildSubjectSummary, summaryFileName } from '../services/subjectSummary';
import type { ProcessedDocument } from '../types';
import { getHighlights } from '../services/userHighlights';

interface Props {
  subjectName: string;
  docs: ProcessedDocument[];
  onClose: () => void;
}

/** Alle Zusammenfassungen eines Fachs auf einer Seite (services/subjectSummary.ts). */
export const SubjectSummaryModal: React.FC<Props> = ({ subjectName, docs, onClose }) => {
  const { t, tp } = useTranslation();
  const { titleId, dialogProps } = useModalA11y(onClose);
  const [copied, setCopied] = useState(false);
  const summary = useMemo(
    () => buildSubjectSummary(
      subjectName, docs,
      { missing: t('sum.missing'), truncated: t('sum.truncated'), highlights: t('sum.myHighlights'), page: n => t('hl.page', { n }) },
      getHighlights,
    ),
    [subjectName, docs, t],
  );
  // Der Fachname steht schon im Kopf, im Lesebereich daher ohne erste Zeile.
  const body = summary.markdown.replace(/^# .*\n+/, '');

  const handleCopy = () => {
    if (!navigator.clipboard?.writeText) { toast.error(t('share.copyFailed')); return; }
    navigator.clipboard.writeText(summary.markdown)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500); })
      .catch(() => toast.error(t('share.copyFailed')));
  };

  const handleDownload = () => {
    const blob = new Blob([summary.markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = summaryFileName(subjectName);
    a.click();
    URL.revokeObjectURL(url);
  };

  const btn = 'flex-1 sm:flex-none justify-center flex items-center gap-2 px-4 py-2.5 rounded-2xl text-[13px] font-semibold transition-all hover:opacity-90';

  return createPortal(
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={onClose}>
      <div
        {...dialogProps}
        className="w-full max-w-3xl max-h-[88vh] flex flex-col rounded-[24px] shadow-3d-deep overflow-hidden animate-in zoom-in-95 duration-300"
        style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-start gap-4 px-6 sm:px-8 py-5" style={{ borderBottom: '1px solid var(--border-color)' }}>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] mb-1" style={{ color: 'var(--primary-ink)' }}>{t('sum.eyebrow')}</p>
            <h2 id={titleId} className="text-xl font-semibold break-words" style={{ color: 'var(--text-main)' }}>{subjectName}</h2>
            <p className="text-[12.5px] mt-1" style={{ color: 'var(--text-secondary)' }}>
              {tp('sum.included', summary.included)}
              {summary.missing > 0 && ` · ${tp('sum.missingN', summary.missing)}`}
            </p>
          </div>
          <ModalCloseButton onClick={onClose} label={t('common.close')} />
        </div>

        <div className="flex-1 overflow-y-auto px-6 sm:px-8 py-6 text-[15px] leading-relaxed" style={{ color: 'var(--text-main)' }}>
          {renderMarkdown(body)}
        </div>

        <div className="flex flex-wrap justify-end gap-2 px-6 sm:px-8 py-4" style={{ borderTop: '1px solid var(--border-color)' }}>
          <button onClick={handleCopy} className={btn} style={{ background: 'var(--bg-main)', color: 'var(--text-main)', border: '1px solid var(--border-color)' }}>
            {copied ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : <Copy className="w-3.5 h-3.5" strokeWidth={2.5} />}
            {copied ? t('sum.copied') : t('sum.copy')}
          </button>
          <button onClick={handleDownload} className={btn} style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}>
            <Download className="w-3.5 h-3.5" strokeWidth={2.5} />
            {t('sum.download')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
