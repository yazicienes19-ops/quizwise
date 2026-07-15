import React, { useMemo } from 'react';
import { ProcessedDocument, ActiveTab } from '../types';
import type { SourceMeta } from '../services/libraryService';
import { getDocStats } from '../services/quizHistoryService';
import { SourceStatusBadge } from './SourceStatusBadge';
import { EmojiImage } from './EmojiImage';
import { useTranslation } from '../i18n/I18nProvider';
import { formatDate } from '../i18n/dates';
import type { TKey } from '../i18n';

const FILE_EMOJI: Record<string, string> = { pdf: '📕', docx: '📘', text: '📄' };
const SOURCE_KIND_EMOJI: Record<string, string> = { youtube: '📺', web: '🌐' };

interface Action {
  tab: ActiveTab;
  emoji: string;
  titleKey: TKey;
  descKey: TKey;
  ctaKey: TKey;
  directStart: boolean; // true = KI startet sofort mit dieser Quelle
  accent?: boolean;
  danger?: boolean;
  docTypes?: ProcessedDocument['type'][]; // fehlt = für alle Dateitypen sichtbar
}

const ACTIONS: Action[] = [
  { tab: ActiveTab.QUIZ,      emoji: '🎯', titleKey: 'sd.action.quiz.title',      descKey: 'sd.action.quiz.desc',      ctaKey: 'sd.action.quiz.cta',      directStart: true, accent: true },
  { tab: ActiveTab.EXPLAINER, emoji: '💡', titleKey: 'sd.action.explainer.title', descKey: 'sd.action.explainer.desc', ctaKey: 'sd.action.explainer.cta', directStart: true, accent: true },
  { tab: ActiveTab.READER,    emoji: '📖', titleKey: 'sd.action.reader.title',    descKey: 'sd.action.reader.desc',    ctaKey: 'sd.action.reader.cta',    directStart: true },
  { tab: ActiveTab.CARDS,     emoji: '🃏', titleKey: 'sd.action.cards.title',     descKey: 'sd.action.cards.desc',     ctaKey: 'sd.action.cards.cta',     directStart: true },
  { tab: ActiveTab.RECALL,    emoji: '🧠', titleKey: 'sd.action.recall.title',    descKey: 'sd.action.recall.desc',    ctaKey: 'sd.action.recall.cta',    directStart: true },
  { tab: ActiveTab.EXAM,      emoji: '📝', titleKey: 'sd.action.exam.title',      descKey: 'sd.action.exam.desc',      ctaKey: 'sd.action.exam.cta',      directStart: false, danger: true },
  { tab: ActiveTab.PLANNER,   emoji: '📅', titleKey: 'sd.action.planner.title',   descKey: 'sd.action.planner.desc',   ctaKey: 'sd.action.planner.cta',   directStart: false },
  { tab: ActiveTab.RADAR,     emoji: '📊', titleKey: 'sd.action.radar.title',     descKey: 'sd.action.radar.desc',     ctaKey: 'sd.action.radar.cta',     directStart: false },
  { tab: ActiveTab.PAPER,     emoji: '✍️',  titleKey: 'sd.action.paper.title',     descKey: 'sd.action.paper.desc',     ctaKey: 'sd.action.paper.cta',     directStart: false },
];

interface Props {
  doc: ProcessedDocument;
  meta: SourceMeta;
  onBack: () => void;
  onAction: (tab: ActiveTab, doc: ProcessedDocument) => void;
  onViewDocument: (doc: ProcessedDocument) => void;
}

export const SourceDetailPage: React.FC<Props> = ({ doc, meta, onBack, onAction, onViewDocument }) => {
  const { t } = useTranslation();
  const title     = meta.displayTitle || doc.name.replace(/\.[^/.]+$/, '');
  const status    = meta.status ?? 'ready';
  const emoji     = (meta.sourceKind && SOURCE_KIND_EMOJI[meta.sourceKind]) || FILE_EMOJI[doc.type] || '📄';
  const uploadedAt = formatDate(doc.uploadDate, { day: '2-digit', month: 'long', year: 'numeric' });
  const lastOpened = meta.lastOpenedAt
    ? formatDate(meta.lastOpenedAt, { day: '2-digit', month: 'long' })
    : null;

  const quizStats = useMemo(() => getDocStats(doc.id), [doc.id]);

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-right-8 duration-500 py-6 lg:py-10 px-4">
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

      {/* Source Header */}
      <div className="bg-white dark:bg-slate-900 rounded-[32px] border border-slate-200 dark:border-slate-800 shadow-3d-raised p-8">
        <div className="flex flex-col sm:flex-row gap-6 items-start">
          <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl flex items-center justify-center shrink-0">
            <EmojiImage emoji={emoji} size={40} />
          </div>
          <div className="flex-grow min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl lg:text-3xl font-black text-slate-900 dark:text-white leading-tight">{title}</h1>
              <SourceStatusBadge status={status} />
              <button
                onClick={() => onViewDocument(doc)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                </svg>
                {t('sd.viewDocument')}
              </button>
              {meta.sourceUrl && (
                <a
                  href={meta.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-300 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                  {meta.sourceKind === 'youtube' ? t('sd.openVideo') : t('sd.openSource')}
                </a>
              )}
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-1">
              {meta.module && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">{t('sd.module')}</span>
                  <span className="text-[10px] font-black text-indigo-600">{meta.module}</span>
                </div>
              )}
              {meta.semester && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">{t('sd.semester')}</span>
                  <span className="text-[10px] font-black text-slate-600 dark:text-slate-300">{meta.semester}</span>
                </div>
              )}
              {meta.examDate && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">{t('sd.exam')}</span>
                  <span className="text-[10px] font-black text-rose-600">{formatDate(meta.examDate, { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">
                  {lastOpened ? t('sd.lastOpened') : t('sd.uploaded')}
                </span>
                <span className="text-[10px] font-black text-slate-500">{lastOpened ?? uploadedAt}</span>
              </div>
            </div>

            {meta.tags?.length ? (
              <div className="flex gap-1.5 flex-wrap">
                {meta.tags.map(t => (
                  <span key={t} className="bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 text-[8px] font-black px-2.5 py-1 rounded-full uppercase tracking-tight">
                    {t}
                  </span>
                ))}
              </div>
            ) : null}

            {meta.notes && (
              <p className="text-sm text-slate-500 dark:text-slate-400 italic border-l-2 border-indigo-200 pl-3">{meta.notes}</p>
            )}
          </div>

          {/* Quick stats */}
          {(meta.quizCount || meta.flashcardCount || meta.topicCount) ? (
            <div className="flex sm:flex-col gap-4 sm:gap-2 shrink-0 sm:text-right">
              {meta.quizCount      ? <QuickStat label={t('nav.quiz')} value={meta.quizCount} /> : null}
              {meta.flashcardCount ? <QuickStat label={t('sd.cards')} value={meta.flashcardCount} /> : null}
              {meta.topicCount     ? <QuickStat label={t('sd.topics')} value={meta.topicCount} /> : null}
            </div>
          ) : null}
        </div>
      </div>

      {/* Quiz progress card */}
      {quizStats.count > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-[28px] border border-slate-200 dark:border-slate-800 shadow-3d-raised p-6 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400">{t('sd.progress')}</p>
            <button
              onClick={() => onAction(ActiveTab.QUIZ, doc)}
              className="text-[9px] font-black uppercase tracking-widest text-indigo-600 hover:text-indigo-700 transition-colors"
            >
              {t('sd.newQuiz')}
            </button>
          </div>

          <div className="flex gap-6">
            <div>
              <p className="text-2xl font-black text-slate-900 dark:text-white">{quizStats.count}</p>
              <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">{t('quizSetup.quizzes')}</p>
            </div>
            {quizStats.avgAccuracy !== null && (
              <div>
                <p className={`text-2xl font-black ${quizStats.avgAccuracy >= 70 ? 'text-emerald-600' : quizStats.avgAccuracy >= 50 ? 'text-amber-500' : 'text-rose-500'}`}>
                  {quizStats.avgAccuracy}%
                </p>
                <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">{t('quizSetup.avgAccuracy')}</p>
              </div>
            )}
            {quizStats.lastAt && (
              <div>
                <p className="text-2xl font-black text-slate-900 dark:text-white">
                  {formatDate(quizStats.lastAt, { day: '2-digit', month: 'short' })}
                </p>
                <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">{t('quizSetup.last')}</p>
              </div>
            )}
          </div>

          {quizStats.weakTopics.length > 0 && (
            <div>
              <p className="text-[8px] font-black uppercase tracking-widest text-rose-500 mb-2 flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-rose-500" />
                {t('result.weakTopics')}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {quizStats.weakTopics.map(t => (
                  <span key={t} className="text-[8px] font-black px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400">{t}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Action prompt */}
      <div className="space-y-5">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400">{t('sd.whatToDo')}</h2>
          <span className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            {t('sd.startsDirectly')}
          </span>
        </div>

        {status !== 'ready' && (
          <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl">
            <p className="text-[11px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-400 text-center">
              {t('sd.processing')}
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {ACTIONS.filter(a => !a.docTypes || a.docTypes.includes(doc.type)).map(action => (
            <ActionCard
              key={action.tab}
              action={action}
              disabled={status !== 'ready'}
              onAction={() => onAction(action.tab, doc)}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

const QuickStat: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div>
    <p className="font-black text-slate-900 dark:text-white text-xl">{value}</p>
    <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">{label}</p>
  </div>
);

const ActionCard: React.FC<{ action: Action; disabled: boolean; onAction: () => void }> = ({ action, disabled, onAction }) => {
  const { t } = useTranslation();
  const base = 'rounded-[24px] p-5 flex flex-col gap-3 border transition-all group cursor-pointer text-left';

  let cardClass = 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:shadow-3d-raised';
  if (action.accent) cardClass = 'bg-indigo-600 border-indigo-600 dark:border-indigo-600 hover:shadow-3d-deep';
  if (action.danger) cardClass = 'bg-white dark:bg-slate-900 border-rose-200 dark:border-rose-900/40 hover:shadow-3d-raised';

  let btnClass = 'mt-auto w-full py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest';
  if (action.accent) btnClass += ' bg-white/20 hover:bg-white/30 transition-colors';
  else if (action.danger) btnClass += ' bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400';
  else btnClass += ' bg-slate-50 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400';

  const textColor = action.accent ? 'text-white' : 'text-slate-900 dark:text-white';
  const subColor  = action.accent ? 'text-white/75' : 'text-slate-500 dark:text-slate-400';
  const btnText   = action.accent ? 'text-white' : action.danger ? 'text-rose-600 dark:text-rose-400' : 'text-indigo-600 dark:text-indigo-400';

  return (
    <button
      onClick={onAction}
      disabled={disabled}
      className={`${base} ${cardClass} ${disabled ? 'opacity-40 cursor-not-allowed' : 'hover:scale-[1.02] active:scale-[0.98]'}`}
    >
      <div className="flex items-start justify-between">
        <EmojiImage emoji={action.emoji} size={28} className={action.accent ? 'text-white' : 'text-slate-700 dark:text-slate-300'} />
        {action.directStart && (
          <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${action.accent ? 'bg-white/20 text-white' : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400'}`}>
            ⚡ {t('sd.direct')}
          </span>
        )}
      </div>
      <div className="flex-grow">
        <p className={`text-sm font-black leading-snug ${textColor}`}>{t(action.titleKey)}</p>
        <p className={`text-[10px] mt-1 leading-relaxed ${subColor}`}>{t(action.descKey)}</p>
      </div>
      <div className={`${btnClass} ${btnText}`}>{t(action.ctaKey)}</div>
    </button>
  );
};
