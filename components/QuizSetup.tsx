import React, { useState, useMemo } from 'react';
import type { ProcessedDocument, QuizConfig } from '../types';
import { getDocStats } from '../services/quizHistoryService';
import { detectChapters, extractChapterText, getTextForChapterDetection, Chapter } from '../services/chapterService';
import { documentDisplayName } from '../services/libraryService';
import { useTranslation } from '../i18n/I18nProvider';
import { formatDate } from '../i18n/dates';
import type { TKey } from '../i18n';

interface QuizSetupProps {
  doc: ProcessedDocument;
  availableDocs?: ProcessedDocument[];
  onStart: (config: QuizConfig, docIds: string[]) => void;
  onBack: () => void;
  initialFocus?: QuizConfig['focus'];
}

const QUESTION_TYPES: { value: QuizConfig['questionType']; labelKey: TKey; descKey: TKey }[] = [
  { value: 'mixed',    labelKey: 'qType.mixed',     descKey: 'qType.mixed.desc' },
  { value: 'mc',       labelKey: 'qType.mc',        descKey: 'qType.mc.desc' },
  { value: 'truefalse',labelKey: 'qType.truefalse', descKey: 'qType.truefalse.desc' },
  { value: 'open',     labelKey: 'qType.open',      descKey: 'qType.open.desc' },
];

const DIFFICULTIES: { value: QuizConfig['difficulty']; labelKey: TKey; color: string }[] = [
  { value: 'leicht',    labelKey: 'diff.leicht',     color: 'text-emerald-600 dark:text-emerald-400' },
  { value: 'mittel',    labelKey: 'diff.mittel',     color: 'text-amber-600 dark:text-amber-400' },
  { value: 'schwer',    labelKey: 'diff.schwer',     color: 'text-rose-600 dark:text-rose-400' },
  { value: 'klausurnah',labelKey: 'diff.klausurnah', color: 'text-indigo-600 dark:text-indigo-400' },
];

const COUNTS = [5, 10, 20] as const;

const Chip: React.FC<{ selected: boolean; onClick: () => void; label: string; desc?: string; accent?: boolean }> = ({
  selected, onClick, label, desc, accent
}) => (
  <button
    onClick={onClick}
    className={`
      rounded-[20px] px-4 py-3 text-left transition-all border-2 w-full
      ${selected
        ? accent
          ? 'bg-indigo-600 border-indigo-600 text-white shadow-3d-deep'
          : 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-500 text-indigo-700 dark:text-indigo-300 shadow-3d-raised'
        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-indigo-300'
      }
    `}
  >
    <p className="text-[11px] font-black">{label}</p>
    {desc && <p className={`text-[9px] mt-0.5 ${selected && !accent ? 'text-indigo-500' : selected && accent ? 'text-white/70' : 'text-slate-400'}`}>{desc}</p>}
  </button>
);

export const QuizSetup: React.FC<QuizSetupProps> = ({ doc, availableDocs, onStart, onBack, initialFocus }) => {
  const { t } = useTranslation();
  const [questionType, setQuestionType] = useState<QuizConfig['questionType']>('mixed');
  const [difficulty, setDifficulty]     = useState<QuizConfig['difficulty']>('mittel');
  const [questionCount, setQuestionCount] = useState(10);
  const [customCount, setCustomCount]   = useState('');
  const [showCustom, setShowCustom]     = useState(false);
  const [examMode, setExamMode]         = useState(false);
  const [focus, setFocus]               = useState<QuizConfig['focus']>(initialFocus ?? 'all');
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([doc.id]);
  const [selectedChapterIndices, setSelectedChapterIndices] = useState<Set<number> | null>(null); // null = all

  const chapters = useMemo(() => {
    if (selectedDocIds.length > 1) return []; // chapter selection disabled for multi-doc
    return detectChapters(getTextForChapterDetection(doc));
  }, [doc, selectedDocIds.length]);

  const toggleChapter = (idx: number) =>
    setSelectedChapterIndices(prev => {
      const base = prev ?? new Set(chapters.map(c => c.index));
      const next = new Set(base);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });

  const chapterSelectionActive = chapters.length >= 2;
  const effectiveChapterIndices = selectedChapterIndices ?? new Set(chapters.map(c => c.index));
  const selectedChapters = chapters.filter(c => effectiveChapterIndices.has(c.index));

  const toggleDoc = (id: string) => {
    setSelectedDocIds(prev =>
      prev.includes(id) ? (prev.length > 1 ? prev.filter(d => d !== id) : prev) : [...prev, id]
    );
  };

  const otherDocs = availableDocs?.filter(d => d.id !== doc.id) ?? [];

  const stats = useMemo(() => getDocStats(doc.id), [doc.id]);
  const docTitle = documentDisplayName(doc);
  const effectiveCount = showCustom ? Math.min(50, Math.max(3, parseInt(customCount) || 10)) : questionCount;

  return (
    <div className="max-w-2xl mx-auto py-6 lg:py-10 px-4 space-y-6 animate-in fade-in slide-in-from-right-8 duration-500 pb-20">
      {/* Back */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-slate-400 hover:text-indigo-600 transition-colors text-[10px] font-black uppercase tracking-widest"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        {t('quizSetup.backToLibrary')}
      </button>

      {/* Source header */}
      <div className="rounded-[28px] p-6 shadow-3d-deep" style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}>
        <p className="text-[9px] font-black uppercase tracking-[0.3em] opacity-60 mb-1">{t('quizSetup.quizFrom')}</p>
        <p className="text-xl font-black leading-tight">{docTitle}</p>
        {stats.count > 0 && (
          <div className="flex gap-4 mt-3 pt-3 border-t border-white/20">
            <div>
              <p className="text-[8px] uppercase tracking-widest opacity-60">{t('quizSetup.quizzes')}</p>
              <p className="text-sm font-black">{stats.count}</p>
            </div>
            <div>
              <p className="text-[8px] uppercase tracking-widest opacity-60">{t('quizSetup.avgAccuracy')}</p>
              <p className="text-sm font-black">{stats.avgAccuracy}%</p>
            </div>
            {stats.lastAt && (
              <div>
                <p className="text-[8px] uppercase tracking-widest opacity-60">{t('quizSetup.last')}</p>
                <p className="text-sm font-black">{formatDate(stats.lastAt, { day: '2-digit', month: 'short' })}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Multi-Dokument Auswahl */}
      {otherDocs.length > 0 && (
        <div className="space-y-2">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{t('quizSetup.includeDocs')}</p>
          {[doc, ...otherDocs].map(d => (
            <button
              key={d.id}
              onClick={() => toggleDoc(d.id)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-[18px] border-2 transition-all text-left"
              style={selectedDocIds.includes(d.id)
                ? { borderColor: 'var(--primary)', background: 'color-mix(in srgb, var(--primary) 8%, var(--bg-sidebar))' }
                : { borderColor: 'var(--border-color)', background: 'var(--bg-sidebar)' }
              }
            >
              <div
                className="w-4 h-4 rounded flex items-center justify-center shrink-0 border-2 transition-all"
                style={selectedDocIds.includes(d.id)
                  ? { background: 'var(--primary)', borderColor: 'var(--primary)' }
                  : { borderColor: '#94a3b8' }
                }
              >
                {selectedDocIds.includes(d.id) && (
                  <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                    <polyline points="1.5,5 4,7.5 8.5,2.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>
              <span className="text-[10px] font-black break-words dark:text-white">{documentDisplayName(d)}</span>
              {d.id === doc.id && <span className="text-[8px] font-black text-slate-400 shrink-0">{t('quizSetup.primary')}</span>}
            </button>
          ))}
        </div>
      )}

      {/* Question type */}
      <div className="space-y-3">
        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{t('quizSetup.questionType')}</p>
        <div className="grid grid-cols-2 gap-2">
          {QUESTION_TYPES.map(({ value, labelKey, descKey }) => (
            <Chip key={value} selected={questionType === value} onClick={() => setQuestionType(value)} label={t(labelKey)} desc={t(descKey)} />
          ))}
        </div>
      </div>

      {/* Difficulty */}
      <div className="space-y-3">
        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{t('quizSetup.difficulty')}</p>
        <div className="grid grid-cols-4 gap-2">
          {DIFFICULTIES.map(({ value, labelKey }) => (
            <Chip key={value} selected={difficulty === value} onClick={() => setDifficulty(value)} label={t(labelKey)} accent={value === 'klausurnah' && difficulty === 'klausurnah'} />
          ))}
        </div>
      </div>

      {/* Count */}
      <div className="space-y-3">
        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{t('quizSetup.count')}</p>
        <div className="grid grid-cols-4 gap-2">
          {COUNTS.map(n => (
            <Chip key={n} selected={!showCustom && questionCount === n} onClick={() => { setShowCustom(false); setQuestionCount(n); }} label={String(n)} />
          ))}
          <Chip selected={showCustom} onClick={() => setShowCustom(true)} label={t('quizSetup.custom')} desc={t('quizSetup.customRange')} />
        </div>
        {showCustom && (
          <input
            autoFocus
            type="number"
            min="3"
            max="50"
            value={customCount}
            onChange={e => setCustomCount(e.target.value)}
            placeholder={t('quizSetup.customPlaceholder')}
            className="w-full px-5 py-4 bg-white dark:bg-slate-900 border-2 border-indigo-400 rounded-2xl text-lg font-black dark:text-white outline-none focus:border-indigo-600 transition-colors"
          />
        )}
      </div>

      {/* Focus (only if weak topics exist) */}
      {stats.weakTopics.length > 0 && (
        <div className="space-y-3">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{t('quizSetup.focus')}</p>
          <div className="grid grid-cols-2 gap-2">
            <Chip selected={focus === 'all'} onClick={() => setFocus('all')} label={t('quizSetup.focusAll')} desc={t('quizSetup.focusAllDesc')} />
            <Chip selected={focus === 'weak'} onClick={() => setFocus('weak')} label={t('quizSetup.focusWeak')} desc={stats.weakTopics.slice(0, 2).join(', ')} />
          </div>
        </div>
      )}

      {/* Exam mode toggle */}
      <div className="flex items-center justify-between p-5 bg-white dark:bg-slate-900 rounded-[24px] border border-slate-200 dark:border-slate-800 shadow-3d-raised">
        <div>
          <p className="text-sm font-black dark:text-white">{t('quizSetup.examMode')}</p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{t('quizSetup.examModeDesc')}</p>
        </div>
        <button
          onClick={() => setExamMode(v => !v)}
          aria-label={t('quizSetup.examModeToggle')}
          className={`relative w-12 h-6 rounded-full transition-colors ${examMode ? '' : 'bg-slate-200 dark:bg-slate-700'}`}
          style={examMode ? { background: 'var(--primary)' } : undefined}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${examMode ? 'translate-x-6' : 'translate-x-0'}`} />
        </button>
      </div>

      {/* CTA */}
      <button
        onClick={() => onStart({ questionType, difficulty, questionCount: effectiveCount, focus, examMode }, selectedDocIds)}
        className="w-full py-5 rounded-[24px] font-black uppercase tracking-widest text-[11px] shadow-3d-deep hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3"
        style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
      >
        <span>{t('quizSetup.generate', { n: effectiveCount })}</span>
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
        </svg>
      </button>
    </div>
  );
};
