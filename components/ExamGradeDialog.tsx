import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import type { ExamTerm } from '../types';
import { useTranslation } from '../i18n/I18nProvider';
import { getLocale } from '../i18n';
import { formatDate } from '../i18n/dates';
import { gradeOptions, formatGrade } from '../services/gradeScale';

interface ExamGradeDialogProps {
  term: ExamTerm;
  /** undefined = Note entfernen. */
  onSave: (grade: string | undefined) => void;
  onClose: () => void;
}

/** Echte Klausurnote eintragen: ein Tipp auf die Note speichert sofort. */
export const ExamGradeDialog: React.FC<ExamGradeDialogProps> = ({ term, onSave, onClose }) => {
  const { t } = useTranslation();
  const locale = getLocale();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

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
        aria-labelledby="exam-grade-title"
        onClick={e => e.stopPropagation()}
        className="w-full max-w-sm rounded-[20px] p-5 space-y-4 animate-in zoom-in-95 duration-200"
        style={{ background: 'var(--card)', border: '1px solid var(--border-color)', boxShadow: '0 6px 18px rgba(22, 41, 77, 0.3)' }}
      >
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p id="exam-grade-title" className="text-[17px] font-semibold" style={{ color: 'var(--text-main)' }}>{t('gradeDialog.title')}</p>
            <p className="mt-1 text-[12.5px] break-words" style={{ color: 'color-mix(in srgb, var(--text-main) 68%, transparent)' }}>
              {t('gradeDialog.sub', { title: term.title, date: formatDate(`${term.date}T00:00:00`, { day: 'numeric', month: 'long', year: 'numeric' }) })}
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

        <div className="grid grid-cols-4 gap-2">
          {gradeOptions(locale).map(grade => {
            const selected = term.grade === grade;
            return (
              <button
                key={grade}
                onClick={() => onSave(grade)}
                aria-pressed={selected}
                className="py-2.5 rounded-xl text-[15px] tabular-nums transition-colors"
                style={selected
                  ? { background: 'var(--primary)', color: 'var(--primary-text)' }
                  : { border: '1px solid var(--border-color)', color: 'var(--text-main)' }}
              >
                {formatGrade(grade, locale)}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3">
          <p className="flex-1 text-[11px] leading-snug" style={{ color: 'var(--text-secondary)' }}>{t('gradeDialog.hint')}</p>
          {term.grade && (
            <button onClick={() => onSave(undefined)} className="shrink-0 text-[11px] font-semibold hover:underline" style={{ color: 'var(--text-secondary)' }}>
              {t('gradeDialog.remove')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
