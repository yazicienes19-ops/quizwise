
import React, { useEffect, useMemo, useState } from 'react';
import { ActiveTab, LearningFlowResult, StudyEntry, FlashcardDeck, ProcessedDocument, TopicMetric, Collection } from '../types';
import { toast } from '../services/toast';
import { HelpCircle, Lightbulb, BookOpen, Layers, GraduationCap, Brain, Network, Sparkles, Play, CheckCircle2 } from 'lucide-react';
import { countDueCards, migrateLegacyCard } from '../services/spacedRepetition';
import { countDueMistakes } from '../services/mistakeReviewService';
import { getStreak } from '../services/streakService';
import { daysUntilDate } from '../services/calendarSessions';
import { collectionDocs } from '../services/collectionSource';
import { buildLearningScore } from '../services/learningScoreService';
import { useModuleScopedActivity } from '../hooks/useModuleScopedActivity';
import { AnimatedBar } from './AnimatedBar';
import { CountUp } from './CountUp';
import { useTranslation } from '../i18n/I18nProvider';
import type { TKey } from '../i18n';
import { greetingKind } from '../services/dashboardService';

interface DashboardProps {
  onTabChange: (tab: ActiveTab) => void;
  flowResult: LearningFlowResult | null;
  onAcceptFlow: (res: LearningFlowResult) => void;
  documents?: ProcessedDocument[];
  decks?: FlashcardDeck[];
  metrics?: TopicMetric[];
  collections?: Collection[];
  activeModuleId?: string | null;
  /** Startet die Wiederholungs-Session fälliger Fehlerfragen (Quiz-Tab). */
  onStartMistakeReview?: () => void;
  user?: { email?: string | null; user_metadata?: { full_name?: string } } | null;
}

interface ActionCard {
  id: ActiveTab;
  titleKey: TKey;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
}

/** Fixe Priorität statt Sortierung nach Nutzungshäufigkeit — entspricht dem
 *  freigegebenen Dashboard-Redesign (Quiz, Tutor, Karteikarten, Simulator,
 *  Feynman, Mindmaps, Bibliothek). Bibliothek steht bewusst zuletzt: bei
 *  ungerader Kartenzahl (7) bekommt die letzte Karte die volle Zeilenbreite
 *  (siehe isLast im Grid unten), das passt gut als größte/unterste Karte. */
const ACTION_CARDS: ActionCard[] = [
  { id: ActiveTab.QUIZ, titleKey: 'nav.quiz', Icon: HelpCircle },
  { id: ActiveTab.EXPLAINER, titleKey: 'nav.explainer', Icon: Lightbulb },
  { id: ActiveTab.CARDS, titleKey: 'nav.cards', Icon: Layers },
  { id: ActiveTab.EXAM, titleKey: 'nav.exam', Icon: GraduationCap },
  { id: ActiveTab.RECALL, titleKey: 'nav.recall', Icon: Brain },
  { id: ActiveTab.MINDMAP, titleKey: 'nav.mindmap', Icon: Network },
  { id: ActiveTab.LIBRARY, titleKey: 'nav.library', Icon: BookOpen },
];

type Priority = 'red' | 'yellow' | 'green';
const PRIORITY_COLOR: Record<Priority, string> = { red: '#f43f5e', yellow: '#f59e0b', green: '#22c55e' };

interface TodayTask {
  priority: Priority;
  text: string;
  meta?: string;
  onClick: () => void;
}

const withSrs = (cards: FlashcardDeck['cards']) => cards.map(c => (c.srs ? c : { ...c, srs: migrateLegacyCard(c) }));

export const Dashboard: React.FC<DashboardProps> = ({
  onTabChange, flowResult, documents = [], decks = [], metrics = [], collections = [], activeModuleId = null,
  onStartMistakeReview, user = null,
}) => {
  const { t, tp } = useTranslation();

  // Läuft weiter, solange das Dashboard offen ist — die Begrüßung passt sich
  // so auch ohne Tab-Wechsel/Reload an, sobald eine Tageszeit-Grenze (5/11/17/22 Uhr) überschritten wird.
  const [currentHour, setCurrentHour] = useState(() => new Date().getHours());
  useEffect(() => {
    const id = setInterval(() => setCurrentHour(new Date().getHours()), 60_000);
    return () => clearInterval(id);
  }, []);

  const firstName = user?.user_metadata?.full_name?.trim().split(/\s+/)[0] || user?.email?.split('@')[0] || null;
  const greetingBase = t(`dashboard.greeting.${greetingKind(currentHour)}` as TKey);
  const greeting = firstName ? `${greetingBase}, ${firstName}` : greetingBase;

  const activeModule = useMemo(() => collections.find(c => c.id === activeModuleId) ?? null, [collections, activeModuleId]);

  const scopedDecks = useMemo(() => {
    if (!activeModule) return decks;
    const docIds = new Set(collectionDocs(activeModule, documents).map(d => d.id));
    return decks.filter(d => d.sourceDocumentId && docIds.has(d.sourceDocumentId));
  }, [decks, documents, activeModule]);

  const dismissedTopics = useMemo(() => new Set<string>(), []);
  const { quizResults, examResults, recallResults } = useModuleScopedActivity(activeModule, documents, dismissedTopics);

  const dueCardsCount = useMemo(
    () => countDueCards(scopedDecks.flatMap(d => withSrs(d.cards))),
    [scopedDecks],
  );

  const dueMistakesCount = useMemo(() => countDueMistakes(), []);
  const streak = useMemo(() => getStreak(), []);

  const nextExam = useMemo(() => {
    try {
      const terms: Array<{ date: string; title: string }> = JSON.parse(localStorage.getItem('studearc_exam_terms') || '[]');
      const now = new Date();
      const future = terms
        .map(term => ({ ...term, days: daysUntilDate(term.date, now) }))
        .filter(term => term.days >= 0)
        .sort((a, b) => a.days - b.days);
      return future.length ? { title: future[0].title, days: future[0].days } : null;
    } catch { return null; }
  }, []);

  const learningScore = useMemo(
    () => buildLearningScore({ quizResults, examResults, recallResults, metrics, decks: scopedDecks, streakCurrent: streak.current }),
    [quizResults, examResults, recallResults, metrics, scopedDecks, streak.current],
  );

  const weiterlernCard = useMemo(() => {
    try {
      const raw = localStorage.getItem('studearc_quiz_progress');
      if (raw) {
        const progress = JSON.parse(raw);
        const total = progress?.questions?.length ?? 0;
        if (progress?.meta && progress?.timestamp && total > 0 && Date.now() - progress.timestamp < 7 * 24 * 60 * 60 * 1000) {
          const answered = progress.answers?.length ?? 0;
          return {
            subject: progress.meta.docName || t('dashboard.quizResume'),
            meta: t('dashboard.quizResume'),
            tab: ActiveTab.QUIZ,
            pct: Math.round((answered / total) * 100),
          };
        }
      }
    } catch { /* ignore */ }
    if (scopedDecks.length > 0) {
      const deck = scopedDecks[scopedDecks.length - 1];
      const due = countDueCards(withSrs(deck.cards));
      const total = deck.cards.length || 1;
      return {
        subject: deck.title,
        meta: tp('dashboardV2.continue.cardsWaiting', due),
        tab: ActiveTab.CARDS,
        pct: Math.max(0, Math.round((1 - due / total) * 100)),
      };
    }
    return null;
  }, [scopedDecks, t, tp]);

  const todayTasks = useMemo(() => {
    const tasks: TodayTask[] = [];
    if (nextExam && nextExam.days <= 7) {
      tasks.push({ priority: 'red', text: t('dashboardV2.today.examSoon', { title: nextExam.title }), onClick: () => onTabChange(ActiveTab.EXAM) });
    }
    if (dueCardsCount > 0) {
      tasks.push({ priority: 'red', text: tp('dashboardV2.today.cards', dueCardsCount), onClick: () => onTabChange(ActiveTab.CARDS) });
    }
    if (dueMistakesCount > 0 && onStartMistakeReview) {
      tasks.push({ priority: 'yellow', text: tp('dashboardV2.today.mistakes', dueMistakesCount), onClick: onStartMistakeReview });
    }
    if (streak.current > 0 && !streak.todayDone) {
      tasks.push({ priority: 'green', text: t('dashboardV2.today.streak'), onClick: () => onTabChange(dueCardsCount > 0 ? ActiveTab.CARDS : ActiveTab.QUIZ) });
    }
    return tasks;
  }, [nextExam, dueCardsCount, dueMistakesCount, onStartMistakeReview, streak.current, streak.todayDone, t, tp, onTabChange]);

  const statCards = useMemo(() => {
    const cards = [
      { label: t('dashboardV2.stat.dueCards'), value: dueCardsCount },
      { label: t('dashboardV2.stat.streak'), value: streak.current },
    ];
    if (nextExam) cards.push({ label: t('dashboardV2.stat.examDays'), value: nextExam.days });
    else cards.push({ label: t('dashboardV2.stat.progress'), value: learningScore.overall ?? 0 });
    return cards;
  }, [t, dueCardsCount, streak.current, nextExam, learningScore.overall]);

  const handleAcceptSuggestion = (suggestion: any) => {
    let plan: unknown[];
    try {
      plan = JSON.parse(localStorage.getItem('study_plan') || '[]');
      if (!Array.isArray(plan)) plan = [];
    } catch {
      plan = [];
    }
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
      <div className="max-w-xl mx-auto py-12 px-4 space-y-3 animate-in fade-in duration-700">
        <div
          className="p-6 sm:p-8 rounded-[24px] space-y-2 animate-card-enter"
          style={{ background: 'var(--primary-soft)', border: '1px solid color-mix(in srgb, var(--primary) 30%, transparent)' }}
        >
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight" style={{ color: 'var(--text-main)' }}>{t('dashboard.empty.welcome')}</h2>
          <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>{t('dashboard.empty.subtitle')}</p>
        </div>
        {([
          { n: '1', labelKey: 'dashboard.empty.step1.label', descKey: 'dashboard.empty.step1.desc' },
          { n: '2', labelKey: 'dashboard.empty.step2.label', descKey: 'dashboard.empty.step2.desc' },
          { n: '3', labelKey: 'dashboard.empty.step3.label', descKey: 'dashboard.empty.step3.desc' },
        ] as { n: string; labelKey: TKey; descKey: TKey }[]).map(({ n, labelKey, descKey }, i) => (
          <div
            key={n}
            className="p-4 rounded-[16px] flex items-center gap-3 animate-card-enter"
            style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)', ['--stagger-i' as string]: i + 1 }}
          >
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-[11px] font-black"
              style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
            >{n}</div>
            <div className="min-w-0">
              <p className="text-sm font-black" style={{ color: 'var(--text-main)' }}>{t(labelKey)}</p>
              <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{t(descKey)}</p>
            </div>
          </div>
        ))}
        <button
          onClick={() => onTabChange(ActiveTab.LIBRARY)}
          className="w-full mt-2 px-8 py-4 rounded-[20px] font-black uppercase text-[11px] tracking-widest shadow-3d-deep hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3 animate-card-enter"
          style={{ background: 'var(--primary)', color: 'var(--primary-text)', ['--stagger-i' as string]: 4 }}
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
    <div className="max-w-3xl mx-auto space-y-4 py-8 px-4 animate-in fade-in duration-700">

      {/* Begrüßungs-Hero + Tagesliste */}
      <div className="animate-card-enter" style={{ ['--stagger-i' as string]: 0 }}>
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight mb-1" style={{ color: 'var(--text-main)' }}>{greeting}</h1>
        {nextExam && (
          <p className="text-[13px] font-semibold mb-3" style={{ color: nextExam.days <= 7 ? '#f43f5e' : 'var(--text-secondary)' }}>
            {tp('dashboardV2.examCountdown', nextExam.days, { title: nextExam.title })}
          </p>
        )}
        {!nextExam && <div className="mb-3" />}
        {todayTasks.length > 0 ? (
          <>
            <p className="text-[10px] font-black uppercase tracking-[0.15em] mb-2" style={{ color: 'var(--text-secondary)' }}>{t('dashboardV2.today.title')}</p>
            <div className="space-y-1.5">
              {todayTasks.map((task, i) => (
                <button
                  key={i}
                  onClick={task.onClick}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-[14px] text-left transition-transform hover:scale-[1.015] active:scale-[0.99]"
                  style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: PRIORITY_COLOR[task.priority] }} />
                  <span className="flex-1 text-[13px] font-semibold" style={{ color: 'var(--text-main)' }}>{task.text}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-[14px]" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}>
            <CheckCircle2 size={16} style={{ color: '#22c55e' }} />
            <span className="text-[13px] font-semibold" style={{ color: 'var(--text-secondary)' }}>{t('dashboardV2.today.allDone')}</span>
          </div>
        )}
      </div>

      {/* Stat-Zeile */}
      <div className="grid grid-cols-3 gap-2 animate-card-enter" style={{ ['--stagger-i' as string]: 1 }}>
        {statCards.map((s, i) => (
          <div key={i} className="text-center px-2 py-3 rounded-[14px]" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}>
            <p className="text-lg font-black" style={{ color: 'var(--text-main)' }}><CountUp value={s.value} /></p>
            <p className="text-[9px] font-medium mt-0.5 truncate" style={{ color: 'var(--text-secondary)' }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Weiterlernen */}
      {weiterlernCard && (
        <button
          onClick={() => onTabChange(weiterlernCard.tab)}
          className="w-full text-left p-5 rounded-[20px] shadow-3d-raised hover:scale-[1.01] active:scale-[0.99] transition-transform animate-card-enter"
          style={{ background: 'var(--primary)', color: 'var(--primary-text)', ['--stagger-i' as string]: 2 }}
        >
          <div className="flex items-center gap-1.5 mb-1.5">
            <Play size={12} fill="currentColor" />
            <span className="text-[10px] font-black uppercase tracking-widest">{t('dashboard.continue')}</span>
          </div>
          <p className="text-lg font-black mb-1">{weiterlernCard.subject}</p>
          <p className="text-[11px] opacity-75 mb-2">{weiterlernCard.meta}</p>
          <div className="h-[5px] rounded-full overflow-hidden mb-2" style={{ background: 'rgba(255,255,255,0.25)' }}>
            <AnimatedBar percent={weiterlernCard.pct} className="h-full rounded-full" style={{ background: 'var(--primary-text)' }} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] opacity-80">{weiterlernCard.pct}%</span>
            <span className="text-[10px] font-black uppercase tracking-widest">{t('dashboard.resume')}</span>
          </div>
        </button>
      )}

      {/* Lernfortschritt */}
      {learningScore.overall != null && (
        <div className="p-4 rounded-[16px] animate-card-enter" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)', ['--stagger-i' as string]: 3 }}>
          <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: 'var(--text-secondary)' }}>{t('dashboardV2.progress.title')}</p>
          <div className="h-[7px] rounded-full overflow-hidden mb-2" style={{ background: 'var(--border-color)' }}>
            <AnimatedBar percent={learningScore.overall} className="h-full rounded-full" style={{ background: 'var(--primary)' }} />
          </div>
          <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            {t('dashboardV2.progress.detail', { pct: learningScore.overall, left: 100 - learningScore.overall })}
          </p>
        </div>
      )}

      {/* Nächste Schritte (KI-Empfehlung) */}
      {flowResult && (
        <div className="space-y-3 animate-card-enter" style={{ ['--stagger-i' as string]: 4 }}>
          <h2 className="text-[11px] font-black uppercase tracking-[0.3em] flex items-center gap-2" style={{ color: 'var(--primary)' }}>
            {t('dashboard.nextSteps')}
            <Sparkles size={14} />
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {flowResult.next_actions.map((action, i) => (
              <button
                key={i}
                onClick={() => {
                  const moduleToTab: Record<string, ActiveTab> = {
                    analyse: ActiveTab.RADAR, quiz: ActiveTab.QUIZ, cards: ActiveTab.CARDS,
                    explain: ActiveTab.EXPLAINER, calendar: ActiveTab.PLANNER, exam: ActiveTab.EXAM,
                  };
                  onTabChange(moduleToTab[action.module] ?? ActiveTab.QUIZ);
                }}
                className="p-5 rounded-[20px] text-left hover:scale-[1.02] transition-all"
                style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
              >
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[9px] font-black uppercase tracking-widest opacity-70">{t('dashboard.minFocus', { n: action.timebox_minutes })}</span>
                  <span className="text-xs">→</span>
                </div>
                <h3 className="text-base font-black leading-tight mb-1">{action.title}</h3>
                <p className="text-[11px] font-medium opacity-80 italic">"{action.why}"</p>
              </button>
            ))}
            {flowResult.calendar_suggestion.should_schedule && flowResult.calendar_suggestion.suggested_blocks.map((block, i) => (
              <div
                key={i}
                className="p-5 rounded-[20px] flex flex-col justify-between"
                style={{ background: 'var(--bg-sidebar)', border: `1px dashed color-mix(in srgb, var(--primary) 40%, transparent)` }}
              >
                <div>
                  <span className="text-[9px] font-black uppercase tracking-widest mb-1 block" style={{ color: 'var(--primary)' }}>{t('dashboard.planSuggestion')}</span>
                  <h3 className="text-sm font-black" style={{ color: 'var(--text-main)' }}>{t('dashboard.blockTime', { day: block.day, time: block.start_time })}</h3>
                  <p className="text-[11px] mt-1" style={{ color: 'var(--text-secondary)' }}>{block.focus_topics.join(', ')}</p>
                </div>
                <button
                  onClick={() => handleAcceptSuggestion(block)}
                  className="mt-4 w-full py-2.5 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-[var(--primary)] hover:text-[var(--primary-text)] transition-all"
                  style={{ background: 'var(--bg-main)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}
                >{t('dashboard.addToCalendar')}</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Prioritäts-Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 animate-card-enter" style={{ ['--stagger-i' as string]: 5 }}>
        {ACTION_CARDS.map((card, i) => {
          const Icon = card.Icon;
          // Ungerade Kartenzahl (7): letzte Karte bekommt die volle Zeilenbreite,
          // statt allein und verwaist in der letzten Reihe zu stehen.
          const isLast = i === ACTION_CARDS.length - 1;
          return (
            <button
              key={card.id}
              onClick={() => onTabChange(card.id)}
              className={`flex items-center gap-2.5 px-3.5 py-3 rounded-[14px] text-left hover:scale-[1.03] active:scale-[0.98] transition-transform ${isLast ? 'sm:col-span-2 lg:col-span-3 sm:justify-center' : ''}`}
              style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}
            >
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
                <Icon size={16} />
              </div>
              <p className="text-sm font-black" style={{ color: 'var(--text-main)' }}>{t(card.titleKey)}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
};
