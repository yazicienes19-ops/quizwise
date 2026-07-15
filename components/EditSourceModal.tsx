import React, { useState } from 'react';
import { saveMeta } from '../services/libraryService';
import type { SourceMeta } from '../services/libraryService';
import { ProcessedDocument } from '../types';
import { useTranslation } from '../i18n/I18nProvider';

interface Props {
  doc: ProcessedDocument;
  meta: SourceMeta;
  onClose: () => void;
  onSaved: () => void;
}

const Field: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  textarea?: boolean;
}> = ({ label, value, onChange, placeholder, type = 'text', textarea }) => (
  <div className="space-y-1">
    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</label>
    {textarea ? (
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 rounded-xl text-sm font-medium outline-none border-2 border-transparent focus:border-indigo-500 dark:text-white resize-none"
      />
    ) : (
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 rounded-xl text-sm font-medium outline-none border-2 border-transparent focus:border-indigo-500 dark:text-white"
      />
    )}
  </div>
);

export const EditSourceModal: React.FC<Props> = ({ doc, meta, onClose, onSaved }) => {
  const { t } = useTranslation();
  const [displayTitle, setDisplayTitle] = useState(meta.displayTitle ?? doc.name.replace(/\.[^/.]+$/, ''));
  const [module, setModule]             = useState(meta.module ?? '');
  const [semester, setSemester]         = useState(meta.semester ?? '');
  const [category, setCategory]         = useState(meta.category ?? '');
  const [tags, setTags]                 = useState(meta.tags?.join(', ') ?? '');
  const [examDate, setExamDate]         = useState(meta.examDate ?? '');
  const [notes, setNotes]               = useState(meta.notes ?? '');
  const [isAltklausur, setIsAltklausur] = useState(meta.isAltklausur ?? false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMeta(doc.id, {
      displayTitle: displayTitle.trim() || undefined,
      module:       module.trim()       || undefined,
      semester:     semester.trim()     || undefined,
      category:     category.trim()     || undefined,
      tags:         tags.trim() ? tags.split(',').map(t => t.trim()).filter(Boolean) : undefined,
      examDate:     examDate             || undefined,
      notes:        notes.trim()         || undefined,
      isAltklausur: isAltklausur         || undefined,
    });
    onSaved();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-[32px] w-full max-w-lg shadow-3d-deep overflow-hidden animate-in zoom-in-95 duration-300"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center px-8 py-6 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-xl font-black dark:text-white">{t('esm.title')}</h2>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-0.5 break-words max-w-[280px]">
              {doc.name}
            </p>
          </div>
          <button aria-label={t('upl.close')} onClick={onClose} className="p-2 text-slate-400 hover:text-rose-500 transition-colors rounded-xl">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-8 py-6 space-y-5 max-h-[70vh] overflow-y-auto">
          <Field
            label={t('esm.titleLabel')}
            value={displayTitle}
            onChange={setDisplayTitle}
            placeholder={t('esm.titlePlaceholder')}
          />
          <div className="grid grid-cols-2 gap-4">
            <Field label={t('upl.moduleLabel')}  value={module}   onChange={setModule}   placeholder={t('upl.modulePlaceholder')} />
            <Field label={t('upl.semesterLabel')}       value={semester} onChange={setSemester} placeholder={t('esm.semesterPlaceholder')} />
          </div>
          <Field
            label={t('upl.tagsLabel')}
            value={tags}
            onChange={setTags}
            placeholder={t('esm.tagsPlaceholder')}
          />
          <div className="grid grid-cols-2 gap-4">
            <Field label={t('upl.categoryLabel')}      value={category} onChange={setCategory} placeholder={t('esm.categoryPlaceholder')} />
            <Field label={t('upl.examDateLabel')} value={examDate} onChange={setExamDate} type="date" />
          </div>
          <Field label={t('esm.notesLabel')} value={notes} onChange={setNotes} placeholder={t('upl.notesPlaceholder')} textarea />

          {/* Altklausur toggle */}
          <button
            type="button"
            onClick={() => setIsAltklausur(v => !v)}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl border-2 transition-all text-left ${
              isAltklausur
                ? 'border-rose-400 bg-rose-50 dark:bg-rose-950/20'
                : 'border-slate-200 dark:border-slate-700 hover:border-rose-300'
            }`}
          >
            <div>
              <p className={`text-[11px] font-black ${isAltklausur ? 'text-rose-600 dark:text-rose-400' : 'dark:text-white'}`}>
                {t('upl.isOldExam')}
              </p>
              <p className="text-[9px] text-slate-400 mt-0.5">{t('esm.oldExamHint')}</p>
            </div>
            <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 border-2 transition-all ${
              isAltklausur ? 'bg-rose-500 border-rose-500' : 'border-slate-300 dark:border-slate-600'
            }`}>
              {isAltklausur && (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <polyline points="1.5,5 4,7.5 8.5,2.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
          </button>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest border-2 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-300 transition-all"
            >
              {t('quiz.cancel')}
            </button>
            <button
              type="submit"
              className="flex-1 py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-lg hover:scale-[1.02] transition-all"
              style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
            >
              {t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
