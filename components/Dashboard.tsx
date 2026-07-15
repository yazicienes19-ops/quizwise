
import React, { useState, useMemo } from 'react';
import { ActiveTab, LearningFlowResult, StudyEntry, FlashcardDeck, ProcessedDocument } from '../types';
import { GeneratedImage } from './GeneratedImage';
import { toast } from '../services/toast';
import { Layers, Flame } from 'lucide-react';
import { countDueCards, migrateLegacyCard } from '../services/spacedRepetition';
import { countDueMistakes } from '../services/mistakeReviewService';
import { getStreak } from '../services/streakService';
import { useTranslation } from '../i18n/I18nProvider';
import type { TKey } from '../i18n';

const USAGE_KEY = 'quizwise_feature_usage';

function getUsageCounts(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(USAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function trackUsage(id: ActiveTab) {
  const counts = getUsageCounts();
  counts[id] = (counts[id] || 0) + 1;
  localStorage.setItem(USAGE_KEY, JSON.stringify(counts));
}

interface DashboardProps {
  onTabChange: (tab: ActiveTab) => void;
  flowResult: LearningFlowResult | null;
  onAcceptFlow: (res: LearningFlowResult) => void;
  documents?: ProcessedDocument[];
  /** Startet die Wiederholungs-Session fälliger Fehlerfragen (Quiz-Tab). */
  onStartMistakeReview?: () => void;
}

interface ActionCard {
  id: ActiveTab;
  titleKey: TKey;
  descKey: TKey;
  prompt: string;
  color: string;
  badgeKey?: TKey;
}

const BASE_CARDS: ActionCard[] = [
  { id: ActiveTab.RECALL, titleKey: 'nav.recall', descKey: 'dashboard.card.recall.desc', prompt: 'Human brain active recall, academic illustration', color: 'text-indigo-600', badgeKey: 'dashboard.card.recall.badge' },
  { id: ActiveTab.LIBRARY, titleKey: 'nav.library', descKey: 'dashboard.card.library.desc', prompt: 'Academic library books, minimalist illustration', color: 'text-blue-500' },
  { id: ActiveTab.QUIZ, titleKey: 'nav.quiz', descKey: 'dashboard.card.quiz.desc', prompt: 'Target bullseye icon, academic minimalist illustration', color: 'text-indigo-500', badgeKey: 'dashboard.card.quiz.badge' },
  { id: ActiveTab.EXAM, titleKey: 'nav.exam', descKey: 'dashboard.card.exam.desc', prompt: 'Exam paper graduation cap, academic illustration', color: 'text-rose-500', badgeKey: 'dashboard.card.exam.badge' },
  { id: ActiveTab.CARDS, titleKey: 'nav.cards', descKey: 'dashboard.card.cards.desc', prompt: 'Flashcards study deck, minimalist illustration', color: 'text-violet-500' },
  { id: ActiveTab.RADAR, titleKey: 'nav.radar', descKey: 'dashboard.card.radar.desc', prompt: 'Data analysis radar chart, academic illustration', color: 'text-emerald-500' }
];

export const Dashboard: React.FC<DashboardProps> = ({ onTabChange, flowResult, documents = [], onStartMistakeReview }) => {
  const { t, tp } = useTranslation();
  const [hovered, setHovered] = useState<ActiveTab | null>(null);
  const [usageCounts, setUsageCounts] = useState<Record<string, number>>(getUsageCounts);

  const dueCardsCount = useMemo(() => {
    try {
      const decks: FlashcardDeck[] = JSON.parse(localStorage.getItem('flashcard_decks') || '[]');
      const allCards = decks.flatMap(d => d.cards.map(c => c.srs ? c : { ...c, srs: migrateLegacyCard(c) }));
      return countDueCards(allCards);
    } catch { return 0; }
  }, []);

  const dueMistakesCount = useMemo(() => countDueMistakes(), []);

  const streak = useMemo(() => getStreak(), []);

  const weiterlernCard = useMemo(() => {
    // Last saved quiz progress
    try {
      const raw = localStorage.getItem('quizwise_quiz_progress');
      if (raw) {
        const { meta, timestamp } = JSON.parse(raw);
        if (meta && timestamp && Date.now() - timestamp < 7 * 24 * 60 * 60 * 1000) {
          return { type: 'quiz' as const, label: meta.docName || t('dashboard.quizResume'), tab: ActiveTab.QUIZ };
        }
      }
    } catch {}
    // Last used deck
    try {
      const decks: FlashcardDeck[] = JSON.parse(localStorage.getItem('flashcard_decks') || '[]');
      if (decks.length > 0) {
        return { type: 'deck' as const, label: decks[decks.length - 1].title, tab: ActiveTab.CARDS };
      }
    } catch {}
    return null;
  }, []);

  const nextExam = useMemo(() => {
    try {
      const terms: Array<{ date: string; subject: string }> = JSON.parse(localStorage.getItem('quizwise_exam_terms') || '[]');
      const future = terms
        .map(t => ({ ...t, ms: new Date(t.date).getTime() }))
        .filter(t => t.ms > Date.now())
        .sort((a, b) => a.ms - b.ms);
      if (!future.length) return null;
      const days = Math.ceil((future[0].ms - Date.now()) / (1000 * 60 * 60 * 24));
      return { subject: future[0].subject, days };
    } catch { return null; }
  }, []);


  const cards = useMemo(() => {
    return [...BASE_CARDS].sort((a, b) => (usageCounts[b.id] || 0) - (usageCounts[a.id] || 0));
  }, [usageCounts]);

  const handleCardClick = (id: ActiveTab) => {
    trackUsage(id);
    setUsageCounts(getUsageCounts());
    onTabChange(id);
  };

  const handleAcceptSuggestion = (suggestion: any) => {
    const plan = JSON.parse(localStorage.getItem('study_plan') || '[]');
    const [h, m] = (suggestion.start_time as string).split(':').map(Number);
    const endTotalMin = h * 60 + m + (suggestion.duration_minutes || 60);
    const endTime = `${String(Math.floor(endTotalMin / 60) % 24).padStart(2, '0')}:${String(endTotalMin % 60).padStart(2, '0')}`;
    const newEntry: StudyEntry = {
      id: Math.random().toString(36).substr(2, 9),
      day: suggestion.day,
      startTime: suggestion.start_time,
      endTime,
      subject: suggestion.module,
      topic: suggestion.focus_topics.join(', '),
      completed: false,
      isAutoGenerated: true,
      color: 'indigo'
    };
    localStorage.setItem('study_plan', JSON.stringify([...plan, newEntry]));
    toast.success(t('dashboard.addedToPlan'));
    onTabChange(ActiveTab.PLANNER);
  };

  if (documents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 space-y-10 animate-in fade-in duration-700 min-h-[60vh]">
        <div className="text-center space-y-4 max-w-md">
          <div className="text-7xl mb-2">📚</div>
          <h2 className="text-3xl font-black tracking-tighter dark:text-white">{t('dashboard.empty.welcome')}</h2>
          <p className="text-slate-500 dark:text-slate-400 font-medium">{t('dashboard.empty.subtitle')}</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl w-full">
          {([
            { n: '1', labelKey: 'dashboard.empty.step1.label', descKey: 'dashboard.empty.step1.desc' },
            { n: '2', labelKey: 'dashboard.empty.step2.label', descKey: 'dashboard.empty.step2.desc' },
            { n: '3', labelKey: 'dashboard.empty.step3.label', descKey: 'dashboard.empty.step3.desc' },
          ] as { n: string; labelKey: TKey; descKey: TKey }[]).map(({ n, labelKey, descKey }) => (
            <div key={n} className="p-5 rounded-[24px] space-y-2" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}>
              <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: 'var(--primary)' }}>{t('dashboard.stepLabel', { n })}</p>
              <p className="text-sm font-black dark:text-white">{t(labelKey)}</p>
              <p className="text-[10px] text-slate-400">{t(descKey)}</p>
            </div>
          ))}
        </div>
        <button
          onClick={() => onTabChange(ActiveTab.LIBRARY)}
          className="px-8 py-4 rounded-[20px] font-black uppercase text-[11px] tracking-widest shadow-3d-deep hover:scale-105 transition-all flex items-center gap-3"
          style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          {t('dashboard.empty.cta')}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-12 lg:space-y-24 py-12 px-4 animate-in fade-in duration-1000">
      {/* Hero Section */}
      <div className="text-center space-y-6">
        <div className="space-y-2">
            <h1 className="text-5xl sm:text-7xl lg:text-9xl font-light tracking-tighter leading-none" style={{ color: 'var(--text-main)' }}>
                Quiz<span className="font-bold" style={{ color: 'var(--primary)' }}>Wise</span>
            </h1>
            <p className="text-[9px] sm:text-xs font-black uppercase tracking-[0.3em] sm:tracking-[1em] text-slate-400 dark:text-white/30 sm:pl-4 text-center break-words">
                {t('splash.tagline')}
            </p>
        </div>
      </div>

      {/* Top-Banner: Heute fällig (Karten + Fehlerfragen) + Streak + Exam Countdown */}
      {(dueCardsCount > 0 || dueMistakesCount > 0 || streak.current > 0 || nextExam) && (
        <div className="max-w-6xl mx-auto w-full grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(dueCardsCount > 0 || dueMistakesCount > 0) && (
            <div
              className="px-5 py-4 rounded-[20px] space-y-3"
              style={{ background: 'color-mix(in srgb, var(--primary) 10%, var(--bg-sidebar))', border: '1px solid color-mix(in srgb, var(--primary) 25%, transparent)' }}
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--primary)' }}>
                  <Layers size={16} style={{ color: 'var(--primary-text)' }} />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-black uppercase tracking-widest" style={{ color: 'var(--primary)' }}>{t('dashboard.dueToday')}</p>
                  <p className="text-[9px] text-slate-400 break-words">
                    {[
                      dueCardsCount > 0 ? tp('dashboard.cardsN', dueCardsCount) : null,
                      dueMistakesCount > 0 ? tp('dashboard.questionsN', dueMistakesCount) : null,
                    ].filter(Boolean).join(' · ')}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                {dueCardsCount > 0 && (
                  <button
                    onClick={() => onTabChange(ActiveTab.CARDS)}
                    className="flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest text-white hover:scale-[1.03] active:scale-95 transition-all"
                    style={{ background: 'var(--primary)' }}
                  >
                    {t('dashboard.reviewCards')}
                  </button>
                )}
                {dueMistakesCount > 0 && onStartMistakeReview && (
                  <button
                    onClick={onStartMistakeReview}
                    className="flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all hover:scale-[1.03] active:scale-95"
                    style={{
                      background: 'color-mix(in srgb, var(--primary) 12%, transparent)',
                      color: 'var(--primary)',
                      border: '1px solid color-mix(in srgb, var(--primary) 30%, transparent)',
                    }}
                  >
                    {t('dashboard.reviewQuestions')}
                  </button>
                )}
              </div>
            </div>
          )}
          {streak.current > 0 && (
            <div
              className="flex items-center gap-3 px-5 py-4 rounded-[20px]"
              style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}
            >
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: streak.todayDone ? 'color-mix(in srgb, var(--primary) 15%, transparent)' : 'var(--bg-main)' }}>
                <Flame size={16} style={{ color: streak.todayDone ? 'var(--primary)' : '#94a3b8' }} fill={streak.todayDone ? 'var(--primary)' : 'none'} strokeWidth={2} />
              </div>
              <div>
                <p className="text-[11px] font-black uppercase tracking-widest" style={{ color: streak.todayDone ? 'var(--primary)' : undefined }}>{t('layout.streakTitle', { n: streak.current })}</p>
                <p className="text-[9px] text-slate-400">{streak.todayDone ? t('dashboard.recordDone', { best: streak.best }) : t('dashboard.recordOpen', { best: streak.best })}</p>
              </div>
            </div>
          )}
          {nextExam && (
            <div
              className="flex items-center gap-3 px-5 py-4 rounded-[20px]"
              style={{ background: 'var(--bg-sidebar)', border: `1px solid ${nextExam.days <= 7 ? '#f43f5e' : nextExam.days <= 14 ? '#f59e0b' : 'var(--border-color)'}` }}
            >
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: nextExam.days <= 7 ? 'rgba(244,63,94,0.1)' : 'var(--bg-main)' }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={nextExam.days <= 7 ? '#f43f5e' : '#94a3b8'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
              </div>
              <div>
                <p className="text-[11px] font-black uppercase tracking-widest" style={{ color: nextExam.days <= 7 ? '#f43f5e' : undefined }}>{tp('dashboard.daysLeft', nextExam.days)}</p>
                <p className="text-[9px] text-slate-400 break-words max-w-[140px]">{nextExam.subject}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Weiterlernen */}
      {weiterlernCard && (
        <div className="max-w-6xl mx-auto w-full">
          <button
            onClick={() => onTabChange(weiterlernCard.tab)}
            className="w-full flex items-center justify-between px-6 py-4 rounded-[20px] transition-all hover:scale-[1.01] active:scale-[0.99] text-left"
            style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'color-mix(in srgb, var(--primary) 12%, transparent)' }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--primary)' }}>
                  <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
              </div>
              <div>
                <p className="text-[11px] font-black uppercase tracking-widest" style={{ color: 'var(--primary)' }}>{t('dashboard.continue')}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 break-words max-w-[220px]">{weiterlernCard.label}</p>
              </div>
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest shrink-0" style={{ color: 'var(--primary)' }}>{t('dashboard.resume')}</span>
          </button>
        </div>
      )}

      {/* Intelligence Insights */}
      {flowResult && (
        <div className="max-w-6xl mx-auto space-y-8 animate-in slide-in-from-bottom-8 duration-700">
          <div className="flex justify-between items-center px-4">
            <h2 className="text-[11px] font-black uppercase tracking-[0.4em] text-indigo-500 flex items-center gap-2">
              {t('dashboard.nextSteps')}
              <GeneratedImage prompt="Sparkles icon, academic minimalist" className="w-4 h-4 rounded-full" />
            </h2>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {flowResult.next_actions.map((action, i) => (
              <button 
                key={i}
                onClick={() => {
                  const moduleToTab: Record<string, ActiveTab> = {
                    analyse: ActiveTab.RADAR,
                    quiz: ActiveTab.QUIZ,
                    cards: ActiveTab.CARDS,
                    explain: ActiveTab.EXPLAINER,
                    calendar: ActiveTab.PLANNER,
                    exam: ActiveTab.EXAM,
                  };
                  onTabChange(moduleToTab[action.module] ?? ActiveTab.QUIZ);
                }}
                className="bg-indigo-600 p-6 sm:p-8 rounded-[24px] sm:rounded-[32px] text-white text-left shadow-3d-deep hover:scale-105 transition-all group overflow-hidden relative"
              >
                <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 blur-2xl rounded-full translate-x-8 -translate-y-8"></div>
                <div className="relative z-10 space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] font-black uppercase tracking-widest opacity-60">{t('dashboard.minFocus', { n: action.timebox_minutes })}</span>
                    <span className="text-xs">➔</span>
                  </div>
                  <h3 className="text-xl font-black leading-tight">{action.title}</h3>
                  <p className="text-[11px] font-medium opacity-80 italic">"{action.why}"</p>
                </div>
              </button>
            ))}

            {flowResult.calendar_suggestion.should_schedule && flowResult.calendar_suggestion.suggested_blocks.map((block, i) => (
               <div key={i} className="p-8 rounded-[32px] flex flex-col justify-between group border-2 border-dashed border-indigo-200 dark:border-indigo-900" style={{ background: 'var(--bg-sidebar)' }}>
                  <div>
                    <span className="text-[9px] font-black uppercase text-indigo-500 tracking-widest mb-2 block">{t('dashboard.planSuggestion')}</span>
                    <h3 className="text-lg font-black dark:text-white">{t('dashboard.blockTime', { day: block.day, time: block.start_time })}</h3>
                    <p className="text-[11px] text-slate-500 mt-1">{block.focus_topics.join(', ')}</p>
                  </div>
                  <button
                    onClick={() => handleAcceptSuggestion(block)}
                    className="mt-6 w-full py-3 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-indigo-600 hover:text-white transition-all"
                    style={{ background: 'var(--bg-main)', color: 'var(--text-secondary, #64748b)', border: '1px solid var(--border-color)' }}
                  >{t('dashboard.addToCalendar')}</button>
               </div>
            ))}
          </div>
        </div>
      )}

      {/* Standard Navigation Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8 max-w-6xl mx-auto w-full">
        {cards.map((card) => {
          const isHovered = hovered === card.id;
          return (
            <button
              key={card.id}
              onClick={() => handleCardClick(card.id)}
              onMouseEnter={() => setHovered(card.id)}
              onMouseLeave={() => setHovered(null)}
              className="group relative rounded-[28px] lg:rounded-[48px] p-6 sm:p-8 lg:p-12 text-left shadow-3d-raised hover:shadow-3d-deep hover:-translate-y-2 transition-all duration-300 overflow-hidden active:scale-[0.98]"
              style={isHovered
                ? { background: 'var(--primary)', border: '1px solid var(--primary)', boxShadow: '0 20px 40px color-mix(in srgb, var(--primary) 35%, transparent)' }
                : { background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }
              }
            >
              <div className="absolute top-0 right-0 w-40 h-40 rounded-full blur-3xl transition-opacity duration-300 pointer-events-none"
                style={{ background: isHovered ? 'rgba(255,255,255,0.15)' : 'transparent', opacity: isHovered ? 1 : 0 }}
              />
              <div className="relative z-10 space-y-6">
                <div className="flex justify-between items-start">
                  <div
                    className="w-12 h-12 lg:w-16 lg:h-16 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-all duration-300"
                    style={isHovered
                      ? { background: 'rgba(255,255,255,0.2)', color: 'var(--primary-text)' }
                      : { background: 'color-mix(in srgb, var(--primary) 12%, var(--bg-sidebar))', color: 'var(--primary)' }
                    }
                  >
                    <GeneratedImage prompt={card.prompt} className="w-7 h-7 lg:w-9 lg:h-9" />
                  </div>
                  {card.badgeKey && (
                    <span
                      className="text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full transition-colors duration-300"
                      style={isHovered
                        ? { background: 'rgba(255,255,255,0.2)', color: 'var(--primary-text)', border: '1px solid rgba(255,255,255,0.3)' }
                        : { background: 'var(--p50)', color: 'var(--primary)', border: '1px solid var(--p100)' }
                      }
                    >
                      {t(card.badgeKey)}
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  <h3
                    className="text-2xl lg:text-3xl font-black tracking-tight transition-colors duration-300"
                    style={{ color: isHovered ? 'var(--primary-text)' : undefined }}
                  >
                    {t(card.titleKey)}
                  </h3>
                  <p
                    className="text-sm lg:text-base leading-relaxed font-medium transition-colors duration-300"
                    style={{ color: isHovered ? 'color-mix(in srgb, var(--primary-text) 75%, transparent)' : undefined }}
                  >
                    {t(card.descKey)}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
