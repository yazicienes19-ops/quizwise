import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { ExamTerm } from '../types';
import { useTranslation } from '../i18n/I18nProvider';

interface ExamDateDialogProps {
  moduleName: string;
  /** Vorhandener Termin (wird geändert) oder null (neuer Termin für dieses Fach). */
  term: ExamTerm | null;
  onSave: (date: string) => void;
  onRemove?: () => void;
  onClose: () => void;
}

/** Klausurtermin direkt aus der Modultabelle der Startseite eintragen oder ändern. */
export const ExamDateDialog: React.FC<ExamDateDialogProps> = ({ moduleName, term, onSave, onRemove, onClose }) => {
  const { t } = useTranslation();
  const [date, setDate] = useState(term?.date ?? '');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const canSave = /^\d{4}-\d{2}-\d{2}$/.test(date) && date !== term?.date;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(11, 21, 37, 0.45)' }}
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="exam-date-title"
        onClick={e => e.stopPropagation()}
        className="w-full max-w-sm rounded-[20px] p-5 space-y-4 animate-in zoom-in-95 duration-200"
        style={{ background: 'var(--card)', border: '1px solid var(--border-color)', boxShadow: '0 6px 18px rgba(22, 41, 77, 0.3)' }}
      >
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p id="exam-date-title" className="text-[17px] font-semibold" style={{ color: 'var(--text-main)' }}>
              {t(term ? 'examDateDialog.titleEdit' : 'examDateDialog.titleNew')}
            </p>
            <p className="mt-1 text-[12.5px] break-words" style={{ color: 'color-mix(in srgb, var(--text-main) 68%, transparent)' }}>
              {moduleName}
            </p>
          </div>
          <button
            aria-label={t('common.cancel')}
            onClick={onClose}
            className="w-9 h-9 shrink-0 flex items-center justify-center rounded-lg transition-colors hover:bg-[color-mix(in_srgb,var(--text-main)_6%,transparent)]"
            style={{ color: 'var(--text-secondary)' }}
          >
            <X size={14} />
          </button>
        </div>

        <form
          className="space-y-3"
          onSubmit={e => { e.preventDefault(); if (canSave) onSave(date); }}
        >
          <input
            type="date"
            autoFocus
            value={date}
            onChange={e => setDate(e.target.value)}
            aria-label={t('examDateDialog.dateLabel')}
            className="w-full px-4 py-3 rounded-xl text-[15px] tabular-nums outline-none bg-transparent focus:ring-2"
            style={{ border: '1px solid var(--border-color)', color: 'var(--text-main)', ['--tw-ring-color' as string]: 'var(--primary)' }}
          />
          <button
            type="submit"
            disabled={!canSave}
            className="w-full py-2.5 rounded-xl text-[13px] font-semibold transition-opacity disabled:opacity-40"
            style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
          >
            {t('examDateDialog.save')}
          </button>
        </form>

        <div className="flex items-center gap-3">
          <p className="flex-1 text-[11px] leading-snug" style={{ color: 'var(--text-secondary)' }}>{t('examDateDialog.hint')}</p>
          {term && onRemove && (
            <button onClick={onRemove} className="shrink-0 text-[11px] font-semibold hover:underline" style={{ color: 'var(--text-secondary)' }}>
              {t('examDateDialog.remove')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
