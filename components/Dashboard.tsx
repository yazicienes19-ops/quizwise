
import React, { useEffect, useMemo, useState } from 'react';
import { ActiveTab, LearningFlowResult, FlashcardDeck, ProcessedDocument, TopicMetric, Collection, ExamTerm } from '../types';
import { CheckCircle2, ChevronRight } from 'lucide-react';
import { countDueCards, migrateLegacyCard } from '../services/spacedRepetition';
import { getDueMistakes } from '../services/mistakeReviewService';
import { getStreak } from '../services/streakService';
import { collectionDocs } from '../services/collectionSource';
import { useModuleScopedActivity } from '../hooks/useModuleScopedActivity';
import {
  buildModuleRows, sortModuleRows, buildHomeKpis, formatPercent,
  type ModuleRow, type ModuleSort, type ModuleNextStep,
} from '../services/homeOverviewService';
import { upcomingExamTerms } from '../services/examTermService';
import { buildStudyGuide, selectGuideModuleId, GUIDE_PHASE_TAB, type GuidePhase } from '../services/studyGuideService';
import { formatGrade } from '../services/gradeScale';
import { ExamGradeDialog } from './ExamGradeDialog';
import { useTranslation } from '../i18n/I18nProvider';
import { getLocale } from '../i18n';
import type { TKey } from '../i18n';
import { formatDate } from '../i18n/dates';
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
  /** Klausurtermine aus dem Kalender — Kennzahl "Nächste Klausur", Termin-Spalte, eingetragene Noten. */
  examTerms?: ExamTerm[];
  /** Speichert Klausurtermine (hier: eingetragene Note). */
  onUpdateExamTerms?: (terms: ExamTerm[]) => void;
  /** Wählt ein Fach aus (null = Alle Fächer), wie der Fach-Wähler in der Sidebar. */
  onModuleChange?: (id: string | null) => void;
  /** Startet die Wiederholungs-Session fälliger Fehlerfragen (Quiz-Tab). */
  onStartMistakeReview?: () => void;
  user?: { email?: string | null; user_metadata?: { full_name?: string } } | null;
}

const withSrs = (cards: FlashcardDeck['cards']) => cards.map(c => (c.srs ? c : { ...c, srs: migrateLegacyCard(c) }));

// Farbrollen aus dem Startseiten-Handoff (2026-09), auf die App-Tokens abgebildet,
// damit Hell- und Dunkelmodus ohne eigene Varianten funktionieren.
const C = {
  ink: 'var(--text-main)',
  mute: 'color-mix(in srgb, var(--text-main) 68%, transparent)',
  soft: 'color-mix(in srgb, var(--text-main) 60%, transparent)',
  faint: 'color-mix(in srgb, var(--text-main) 55%, transparent)',
  chevron: 'color-mix(in srgb, var(--text-main) 45%, transparent)',
  line: 'color-mix(in srgb, var(--text-main) 10%, transparent)',
  hair: 'color-mix(in srgb, var(--text-main) 6%, transparent)',
  card: 'var(--card)',
  gold: 'var(--primary)',
  /** Gold als Text auf Cream nie heller als das Handoff-#8e6716 (Kontrast 4.5:1). */
  goldText: 'color-mix(in srgb, var(--primary) 55%, var(--text-main))',
  red: '#c2543f',
  green: '#4a8a5c',
};

type Severity = 'gold' | 'green' | 'red';
const SEVERITY_COLOR: Record<Severity, string> = { gold: C.gold, green: C.green, red: C.red };

interface Recommendation {
  key: string;
  severity: Severity;
  title: string;
  /** Datenbegründung — jede Empfehlung muss nachvollziehbar sein. */
  reason: string;
  minutes?: number;
  onClick: () => void;
}

const SORTS: { key: ModuleSort; label: TKey }[] = [
  { key: 'urgency', label: 'home.sort.urgency' },
  { key: 'grade', label: 'home.sort.grade' },
  { key: 'date', label: 'home.sort.date' },
  { key: 'alpha', label: 'home.sort.alpha' },
];
const SORT_STORAGE_KEY = 'studearc_home_module_sort';
const readStoredSort = (): ModuleSort => {
  try {
    const v = localStorage.getItem(SORT_STORAGE_KEY);
    return v === 'grade' || v === 'date' || v === 'alpha' ? v : 'urgency';
  } catch { return 'urgency'; }
};

const ACTION_LABEL: Record<ModuleNextStep, TKey> = {
  enterGrade: 'home.act.enterGrade',
  mistakes: 'home.act.mistakes',
  review: 'home.act.review',
  rebuild: 'home.act.rebuild',
  placement: 'home.act.placement',
  cleanup: 'home.act.cleanup',
};

/** Handoff: nur so viele Zeilen wie vollständig auf die Seite passen, der Rest hinter "Alle anzeigen". */
const VISIBLE_ROWS = 6;
const GRID_COLUMNS = 'minmax(0,1fr) 138px 58px 116px 118px';
const SHORT_DATE: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: '2-digit' };
const termDate = (date: string) => `${date}T00:00:00`;

/** Grobe Zeitschätzung: Antwortzeiten werden nicht gespeichert, daher Pauschalwerte je Fehlerfrage bzw. Karte. */
const estimateMinutes = (count: number, minutesPerItem: number) => Math.max(1, Math.round(count * minutesPerItem));

const MICRO_LABEL = 'text-[9.5px] font-semibold uppercase tracking-[0.18em]';

export const Dashboard: React.FC<DashboardProps> = ({
  onTabChange, documents = [], decks = [], collections = [], activeModuleId = null, examTerms = [],
  onUpdateExamTerms, onModuleChange, onStartMistakeReview, user = null,
}) => {
  const { t, tp } = useTranslation();
  const locale = getLocale();

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

  // Kennzahlen und Modultabelle zeigen immer alle Fächer, unabhängig vom aktiven Fach.
  const noDismissed = useMemo(() => new Set<string>(), []);
  const { quizResults, examResults, recallResults } = useModuleScopedActivity(null, documents, noDismissed);
  const activity = useMemo(() => ({ quizResults, examResults, recallResults }), [quizResults, examResults, recallResults]);

  const dueCardsCount = useMemo(
    () => countDueCards(scopedDecks.flatMap(d => withSrs(d.cards))),
    [scopedDecks],
  );
  const dueMistakes = useMemo(() => getDueMistakes(), []);
  const streak = useMemo(() => getStreak(), []);

  const rows = useMemo(
    () => buildModuleRows({ collections, documents, decks, activity, dueMistakes, examTerms, now: new Date() }),
    [collections, documents, decks, activity, dueMistakes, examTerms],
  );
  const kpis = useMemo(() => buildHomeKpis({ rows, examTerms, activity, now: new Date() }), [rows, examTerms, activity]);
  const nextExam = useMemo(() => upcomingExamTerms(examTerms, new Date())[0] ?? null, [examTerms]);

  // Leitfaden: der Weg durch EIN Fach (aktives Fach, sonst das dringendste).
  const guide = useMemo(() => {
    const id = selectGuideModuleId(rows, activeModuleId);
    const module = collections.find(c => c.id === id);
    return module ? buildStudyGuide({ module, documents, decks, activity, examTerms, now: new Date() }) : null;
  }, [rows, activeModuleId, collections, documents, decks, activity, examTerms]);

  const openGuidePhase = (tab: ActiveTab) => {
    if (guide) onModuleChange?.(guide.moduleId);
    onTabChange(tab);
  };

  const [sort, setSort] = useState<ModuleSort>(readStoredSort);
  const changeSort = (next: ModuleSort) => {
    setSort(next);
    try { localStorage.setItem(SORT_STORAGE_KEY, next); } catch { /* ignore */ }
  };
  const sortedRows = useMemo(() => sortModuleRows(rows, sort), [rows, sort]);
  const [showAllRows, setShowAllRows] = useState(false);
  const visibleRows = showAllRows ? sortedRows : sortedRows.slice(0, VISIBLE_ROWS);
  const hiddenRows = sortedRows.slice(VISIBLE_ROWS);

  // Echte Note eintragen (Dialog) — nur möglich, wenn der Aufrufer speichern kann.
  const [gradeTerm, setGradeTerm] = useState<ExamTerm | null>(null);
  const saveGrade = (grade: string | undefined) => {
    if (!gradeTerm || !onUpdateExamTerms) return;
    onUpdateExamTerms(examTerms.map(term => (term.id === gradeTerm.id ? { ...term, grade, updatedAt: Date.now() } : term)));
    setGradeTerm(null);
  };

  const fmtGrade = (grade: string) => formatGrade(grade, locale);

  const phaseCount = (phase: GuidePhase) =>
    t(phase.unit === 'sources' ? 'guide.count.sources' : 'guide.count.simulations', { done: phase.done, total: phase.total });

  const openModule = (id: string) => {
    onModuleChange?.(id);
    onTabChange(ActiveTab.RADAR);
  };
  const runModuleAction = (row: ModuleRow) => {
    switch (row.nextStep) {
      case 'enterGrade':
        if (row.writtenTerm && onUpdateExamTerms) setGradeTerm(row.writtenTerm);
        else onTabChange(ActiveTab.PLANNER);
        return;
      case 'mistakes':
        if (onStartMistakeReview) onStartMistakeReview();
        else onTabChange(ActiveTab.QUIZ);
        return;
      case 'cleanup':
        onTabChange(ActiveTab.LIBRARY);
        return;
      case 'placement':
        onModuleChange?.(row.id);
        onTabChange(ActiveTab.EXAM);
        return;
      default:
        onModuleChange?.(row.id);
        onTabChange(ActiveTab.QUIZ);
    }
  };

  // Höchstens drei Empfehlungen, nach Dringlichkeit; fällt eine weg, rückt die nächste nach.
  const recommendations = useMemo((): Recommendation[] => {
    const recs: Recommendation[] = [];
    if (nextExam && nextExam.days <= 7) {
      recs.push({
        key: 'exam', severity: 'red',
        title: t('dashboardV2.today.examSoon', { title: nextExam.title }),
        reason: tp('dashboardV2.today.examReason', nextExam.days),
        onClick: () => onTabChange(ActiveTab.EXAM),
      });
    }
    const awaitingGrade = onUpdateExamTerms ? rows.find(r => r.nextStep === 'enterGrade' && r.writtenTerm)?.writtenTerm : undefined;
    if (awaitingGrade) {
      recs.push({
        key: 'grade', severity: 'gold',
        title: t('home.rec.enterGrade', { title: awaitingGrade.title }),
        reason: t('home.rec.enterGradeReason', { date: formatDate(termDate(awaitingGrade.date), { day: 'numeric', month: 'long' }) }),
        minutes: 1,
        onClick: () => setGradeTerm(awaitingGrade),
      });
    }
    if (dueMistakes.length > 0) {
      recs.push({
        key: 'mistakes', severity: 'gold',
        title: tp('dashboardV2.today.mistakes', dueMistakes.length),
        reason: t('dashboardV2.today.mistakesReason'),
        minutes: estimateMinutes(dueMistakes.length, 0.3),
        onClick: () => (onStartMistakeReview ? onStartMistakeReview() : onTabChange(ActiveTab.QUIZ)),
      });
    }
    if (streak.current > 0 && !streak.todayDone) {
      recs.push({
        key: 'streak', severity: 'green',
        title: t('dashboardV2.today.streak'),
        reason: tp('dashboardV2.today.streakReason', streak.current),
        minutes: 5,
        onClick: () => onTabChange(dueCardsCount > 0 ? ActiveTab.CARDS : ActiveTab.QUIZ),
      });
    }
    const weakest = rows
      .filter(r => r.weak && !r.duplicate && r.grade)
      .sort((a, b) => (a.examPercent ?? 0) - (b.examPercent ?? 0))[0];
    if (weakest?.grade) {
      const grade = formatGrade(weakest.grade, locale);
      const fromExam = weakest.gradeSource === 'exam';
      recs.push({
        key: 'rebuild', severity: 'red',
        title: t('home.rec.rebuild', { name: weakest.name }),
        reason: weakest.learningPercent != null
          ? t(fromExam ? 'home.rec.rebuildReasonExam' : 'home.rec.rebuildReason', { grade, pct: weakest.learningPercent })
          : t(fromExam ? 'home.rec.rebuildReasonExamNoLevel' : 'home.rec.rebuildReasonNoLevel', { grade }),
        onClick: () => { onModuleChange?.(weakest.id); onTabChange(ActiveTab.QUIZ); },
      });
    }
    if (dueCardsCount > 0) {
      const decksDue = scopedDecks.filter(d => countDueCards(withSrs(d.cards)) > 0).length;
      recs.push({
        key: 'cards', severity: 'gold',
        title: tp('dashboardV2.today.cards', dueCardsCount),
        reason: tp('dashboardV2.today.cardsReason', decksDue),
        minutes: estimateMinutes(dueCardsCount, 0.2),
        onClick: () => onTabChange(ActiveTab.CARDS),
      });
    }
    return recs.slice(0, 3);
  }, [nextExam, dueMistakes, streak.current, streak.todayDone, rows, dueCardsCount, scopedDecks, locale, t, tp, onTabChange, onModuleChange, onStartMistakeReview, onUpdateExamTerms]);

  const kpiItems: { key: string; label: string; value: string | number; unit?: string; title?: string; onClick: () => void }[] = [];
  if (kpis.nextExamDays != null) {
    kpiItems.push({ key: 'exam', label: t('home.kpi.nextExam'), value: kpis.nextExamDays, unit: tp('home.unit.days', kpis.nextExamDays), onClick: () => onTabChange(ActiveTab.PLANNER) });
  }
  if (kpis.gradeAverage != null) {
    const simulated = kpis.gradeSource === 'simulator';
    kpiItems.push({
      key: 'grade', label: t('home.kpi.gradeAvg'), value: fmtGrade(kpis.gradeAverage),
      unit: simulated ? t('home.grade.simShort') : undefined,
      title: t(simulated ? 'home.kpi.gradeAvgSim' : 'home.kpi.gradeAvgExam'),
      onClick: () => onTabChange(simulated ? ActiveTab.EXAM : ActiveTab.PLANNER),
    });
  }
  if (kpis.examsTotal > 0) {
    kpiItems.push({ key: 'exams', label: t('home.kpi.exams'), value: kpis.examsWritten, unit: `/ ${kpis.examsTotal}`, onClick: () => onTabChange(ActiveTab.PLANNER) });
  }
  kpiItems.push({ key: 'streak', label: t('home.kpi.streak'), value: streak.current, unit: tp('home.unit.days', streak.current), onClick: () => onTabChange(ActiveTab.RADAR) });
  kpiItems.push({ key: 'week', label: t('home.kpi.week'), value: kpis.weeklyQuestions, unit: tp('home.unit.questions', kpis.weeklyQuestions), onClick: () => onTabChange(ActiveTab.RADAR) });

  const gradedCount = rows.filter(r => r.grade != null).length;
  const moduleSummary = [
    tp('home.mod.count', rows.length),
    t('home.mod.graded', { n: gradedCount }),
    kpis.gradeAverage ? `Ø ${fmtGrade(kpis.gradeAverage)}` : null,
  ].filter(Boolean).join(' · ');
  const hiddenGraded = hiddenRows.filter(r => r.grade != null).length;

  const rowNote = (row: ModuleRow): string | null =>
    row.duplicate ? t('home.row.duplicate')
      : row.nextStep === 'enterGrade' ? t('home.row.awaitingGrade')
      : row.openErrors > 0 ? tp('home.row.openErrors', row.openErrors)
      : row.weak ? t('home.row.retake')
      : null;

  const examStatus = (row: ModuleRow): { status: string; detail: string; upcoming: boolean } => {
    if (row.nextTerm) {
      return {
        status: row.nextTerm.days === 0 ? t('home.row.today') : tp('home.row.inDays', row.nextTerm.days),
        detail: formatDate(termDate(row.nextTerm.date), SHORT_DATE),
        upcoming: true,
      };
    }
    if (row.writtenTerm) {
      return { status: t('home.row.written'), detail: formatDate(termDate(row.writtenTerm.date), SHORT_DATE), upcoming: false };
    }
    if (row.lastExamAt != null) {
      return { status: t('home.row.simulated'), detail: formatDate(row.lastExamAt, SHORT_DATE), upcoming: false };
    }
    return { status: t('home.row.noTerm'), detail: t('home.row.notScheduled'), upcoming: false };
  };

  const levelCell = (row: ModuleRow) => (row.learningPercent != null ? (
    <div className="flex items-center gap-[9px]">
      <div className="flex-1 h-1 rounded-full" style={{ background: C.line }}>
        <div className="h-1 rounded-full" style={{ width: `${row.learningPercent}%`, background: row.learningPercent < 50 ? C.red : C.gold }} />
      </div>
      <span className="text-[11px] font-medium whitespace-nowrap tabular-nums" style={{ color: 'color-mix(in srgb, var(--text-main) 72%, transparent)' }}>
        {formatPercent(row.learningPercent, locale)}
      </span>
    </div>
  ) : (
    <span className="text-[11px]" style={{ color: C.faint }}>{t('home.row.noData')}</span>
  ));

  // Simulator-Noten sichtbar als solche markieren ("Sim."), echte Noten ohne Zusatz.
  const gradeBadge = (row: ModuleRow) => row.grade != null && (
    <span
      title={t(row.gradeSource === 'exam' ? 'home.grade.examTitle' : 'home.grade.simTitle')}
      className="leading-none tabular-nums whitespace-nowrap"
      style={{ color: row.weak ? C.red : C.ink }}
    >
      {fmtGrade(row.grade)}
      {row.gradeSource === 'simulator' && (
        <span className="ml-0.5 align-top text-[8.5px] font-semibold" style={{ color: C.faint }}>{t('home.grade.simShort')}</span>
      )}
    </span>
  );

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
          className="w-full mt-2 px-8 py-4 rounded-[24px] font-black uppercase text-[11px] tracking-widest shadow-3d-deep hover:scale-[1.02] transition-all flex items-center justify-center gap-3 animate-card-enter"
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
    <div className="flex flex-col gap-[18px] animate-in fade-in duration-700 pb-10">

      {/* Kopfzeile: Begrüßung + Kennzahlen */}
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 animate-card-enter" style={{ ['--stagger-i' as string]: 0 }}>
        <h1 className="min-w-0 text-[28px] sm:text-[32px] leading-[1.1] font-normal" style={{ color: C.ink }}>{greeting}</h1>
        <div className="flex items-end gap-[22px] max-w-full overflow-x-auto scrollbar-hide">
          {kpiItems.map((k, i) => (
            <React.Fragment key={k.key}>
              {i > 0 && <span aria-hidden className="w-px h-[30px] shrink-0" style={{ background: 'color-mix(in srgb, var(--text-main) 14%, transparent)' }} />}
              <button onClick={k.onClick} title={k.title} className="shrink-0 text-right transition-opacity hover:opacity-75">
                <span className="block text-[8.5px] font-semibold uppercase tracking-[0.15em] whitespace-nowrap" style={{ color: C.faint }}>{k.label}</span>
                <span className="block mt-[5px] text-[21px] leading-none whitespace-nowrap tabular-nums" style={{ color: C.ink }}>
                  {k.value}
                  {k.unit && <span className="text-[12px]" style={{ color: C.faint }}> {k.unit}</span>}
                </span>
              </button>
            </React.Fragment>
          ))}
        </div>
      </header>

      {/* Empfehlungen */}
      <section className="flex flex-col gap-[9px] animate-card-enter" style={{ ['--stagger-i' as string]: 1 }}>
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <span className={MICRO_LABEL} style={{ color: C.goldText }}>{t('dashboardV2.today.title')}</span>
          <span className="text-[11.5px]" style={{ color: C.mute }}>{t('home.rec.sub')}</span>
        </div>
        {recommendations.length > 0 ? recommendations.map(rec => (
          <button
            key={rec.key}
            onClick={rec.onClick}
            className="w-full flex items-center gap-3.5 px-[18px] py-[13px] rounded-[11px] text-left transition-transform hover:-translate-y-px"
            style={{ background: C.card, border: `1px solid ${C.line}` }}
          >
            <span className="w-[7px] h-[7px] rounded-full shrink-0" style={{ background: SEVERITY_COLOR[rec.severity] }} />
            <span className="flex-1 min-w-0">
              <span className="block text-[15.5px] leading-[1.25] font-semibold" style={{ color: C.ink }}>{rec.title}</span>
              <span className="block mt-[3px] text-[12.5px] leading-[1.4]" style={{ color: C.mute }}>{rec.reason}</span>
            </span>
            {rec.minutes != null && (
              <span className="shrink-0 text-[11px] font-medium whitespace-nowrap" style={{ color: C.soft }}>{t('home.rec.minutes', { n: rec.minutes })}</span>
            )}
            <ChevronRight size={14} className="shrink-0" style={{ color: C.chevron }} />
          </button>
        )) : (
          <div className="flex items-center gap-3.5 px-[18px] py-[13px] rounded-[11px]" style={{ background: C.card, border: `1px solid ${C.line}` }}>
            <CheckCircle2 size={16} className="shrink-0" style={{ color: C.green }} />
            <span className="text-[14px]" style={{ color: C.ink }}>{t('dashboardV2.today.allDone')}</span>
          </div>
        )}
      </section>

      {/* Dein Weg: die vier Phasen des Fachs, an dem gerade gearbeitet wird */}
      {guide && (
        <section className="flex flex-col gap-[9px] animate-card-enter" style={{ ['--stagger-i' as string]: 2 }}>
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span className={MICRO_LABEL} style={{ color: C.goldText }}>{t('guide.title')}</span>
            <span className="text-[11.5px]" style={{ color: C.mute }}>
              {guide.moduleName} · {guide.daysUntilExam != null ? tp('guide.sub.exam', guide.daysUntilExam) : t('guide.sub.noExam')}
            </span>
          </div>

          <div className="rounded-xl overflow-hidden" style={{ background: C.card, border: `1px solid ${C.line}` }}>
            <div className="grid sm:grid-cols-4">
              {guide.phases.map((phase, i) => {
                const current = phase.state === 'current';
                const done = phase.state === 'done';
                const color = done ? C.green : current ? C.gold : C.chevron;
                return (
                  <button
                    key={phase.key}
                    onClick={() => openGuidePhase(GUIDE_PHASE_TAB[phase.key])}
                    className={`px-[17px] py-[13px] text-left transition-colors hover:bg-[color-mix(in_srgb,var(--text-main)_3%,transparent)] ${
                      i > 0 ? 'border-t sm:border-t-0 sm:border-l' : ''
                    }`}
                    style={{ borderColor: C.hair }}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="w-[18px] h-[18px] rounded-full shrink-0 flex items-center justify-center text-[10px] font-semibold tabular-nums"
                        style={done
                          ? { background: C.green, color: 'var(--card)' }
                          : { border: `1.5px solid ${color}`, color }}
                      >
                        {done ? <CheckCircle2 size={12} strokeWidth={3} /> : i + 1}
                      </span>
                      <span className="text-[13.5px] font-semibold truncate" style={{ color: current || done ? C.ink : C.soft }}>
                        {t(`guide.phase.${phase.key}` as TKey)}
                      </span>
                    </span>
                    <span className="block mt-[7px] text-[11px]" style={{ color: current ? C.goldText : C.soft }}>
                      {done ? t('guide.state.done') : current ? t('guide.state.here') : phaseCount(phase)}
                    </span>
                    <span className="mt-[6px] block h-[3px] rounded-full overflow-hidden" style={{ background: C.line }}>
                      <span
                        className="block h-full rounded-full"
                        style={{ width: `${phase.total > 0 ? Math.round((phase.done / phase.total) * 100) : 0}%`, background: color }}
                      />
                    </span>
                    {!done && (
                      <span className="block mt-[5px] text-[10.5px] tabular-nums" style={{ color: C.faint }}>{phaseCount(phase)}</span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-3.5 px-[17px] py-[11px]" style={{ borderTop: `1px solid ${C.line}` }}>
              {guide.next ? (
                <>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] shrink-0" style={{ color: C.faint }}>
                    {t('guide.next.label')}
                  </span>
                  <button
                    onClick={() => openGuidePhase(guide.next!.tab)}
                    className="flex-1 min-w-0 flex items-center gap-2 text-left hover:underline"
                    style={{ color: C.ink }}
                  >
                    <span className="flex-1 min-w-0 truncate text-[14px] font-semibold">
                      {t(`guide.next.${guide.next.phase}` as TKey, { source: guide.next.sourceName ?? guide.moduleName })}
                    </span>
                    <ChevronRight size={14} className="shrink-0" style={{ color: C.chevron }} />
                  </button>
                </>
              ) : (
                <>
                  <CheckCircle2 size={16} className="shrink-0" style={{ color: C.green }} />
                  <span className="text-[13.5px]" style={{ color: C.ink }}>{t('guide.allDone')}</span>
                </>
              )}
            </div>
          </div>

          <p className="text-[10.5px]" style={{ color: C.faint }}>{t('guide.basis')}</p>
        </section>
      )}

      {/* Alle Module */}
      {rows.length > 0 && (
        <section className="flex flex-col gap-[9px] animate-card-enter" style={{ ['--stagger-i' as string]: 3 }}>
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-2">
            <span className={MICRO_LABEL} style={{ color: C.goldText }}>{t('home.mod.title')}</span>
            <span className="text-[11.5px]" style={{ color: C.mute }}>{moduleSummary}</span>
            <div role="tablist" className="ml-auto flex items-center gap-[3px] p-[3px] rounded-lg" style={{ background: 'color-mix(in srgb, var(--text-main) 5%, transparent)' }}>
              {SORTS.map(s => (
                <button
                  key={s.key}
                  role="tab"
                  aria-selected={sort === s.key}
                  onClick={() => changeSort(s.key)}
                  className="px-[11px] py-[5px] rounded-md text-[10.5px] font-semibold transition-colors"
                  style={sort === s.key ? { background: C.card, color: C.ink } : { color: C.soft }}
                >
                  {t(s.label)}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl overflow-hidden" style={{ background: C.card, border: `1px solid ${C.line}` }}>
            <div className="hidden lg:grid gap-3.5 px-[17px] py-[9px]" style={{ gridTemplateColumns: GRID_COLUMNS, borderBottom: `1px solid ${C.line}` }}>
              {([
                ['home.col.module', ''],
                ['home.col.level', ''],
                ['home.col.grade', 'text-right'],
                ['home.col.exam', ''],
              ] as [TKey, string][]).map(([key, align]) => (
                <span
                  key={key}
                  title={key === 'home.col.grade' ? t('home.col.gradeHint') : undefined}
                  className={`text-[8.5px] font-semibold uppercase tracking-[0.14em] ${align}`}
                  style={{ color: 'color-mix(in srgb, var(--text-main) 50%, transparent)' }}
                >
                  {t(key)}
                </span>
              ))}
              <span />
            </div>

            {visibleRows.map((row, i) => {
              const exam = examStatus(row);
              const note = rowNote(row);
              const muted = row.nextStep === 'review';
              const actionButton = (
                <button
                  onClick={e => { e.stopPropagation(); runModuleAction(row); }}
                  className="text-[11px] font-semibold whitespace-nowrap hover:underline"
                  style={{ color: muted ? C.chevron : C.goldText }}
                >
                  {t(ACTION_LABEL[row.nextStep])}
                </button>
              );
              return (
                <div
                  key={row.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openModule(row.id)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModule(row.id); } }}
                  className="cursor-pointer px-[17px] py-2 transition-colors hover:bg-[color-mix(in_srgb,var(--text-main)_3%,transparent)] focus-visible:outline-none focus-visible:bg-[color-mix(in_srgb,var(--text-main)_5%,transparent)]"
                  style={{ borderTop: i > 0 ? `1px solid ${C.hair}` : undefined }}
                >
                  {/* Desktop: Tabellenzeile */}
                  <div className="hidden lg:grid items-center gap-3.5" style={{ gridTemplateColumns: GRID_COLUMNS }}>
                    <div className="min-w-0">
                      <p className="text-[14px] leading-[1.25] font-semibold truncate" style={{ color: C.ink }}>{row.name}</p>
                      {note && <p className="mt-0.5 text-[10.5px] truncate" style={{ color: C.soft }}>{note}</p>}
                    </div>
                    <div>{levelCell(row)}</div>
                    <div className="text-right text-[18px]">{gradeBadge(row)}</div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold whitespace-nowrap" style={{ color: exam.upcoming ? C.goldText : 'color-mix(in srgb, var(--text-main) 75%, transparent)' }}>{exam.status}</p>
                      <p className="mt-0.5 text-[10px] whitespace-nowrap" style={{ color: C.soft }}>{exam.detail}</p>
                    </div>
                    <div className="text-right">{actionButton}</div>
                  </div>

                  {/* Mobil: Name + Note, darunter Lernstand + Termin */}
                  <div className="lg:hidden flex items-center gap-3">
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-baseline gap-3">
                        <p className="flex-1 min-w-0 text-[14px] font-semibold truncate" style={{ color: C.ink }}>{row.name}</p>
                        <span className="text-[17px]">{gradeBadge(row)}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-28 shrink-0">{levelCell(row)}</div>
                        <p className="min-w-0 text-[11px] truncate" style={{ color: exam.upcoming ? C.goldText : C.soft }}>{exam.status} · {exam.detail}</p>
                      </div>
                      {(note || row.nextStep === 'enterGrade') && (
                        <div className="flex items-center gap-3">
                          {note && <p className="flex-1 min-w-0 text-[10.5px] truncate" style={{ color: C.soft }}>{note}</p>}
                          {row.nextStep === 'enterGrade' && actionButton}
                        </div>
                      )}
                    </div>
                    <ChevronRight size={16} className="shrink-0" style={{ color: C.chevron }} />
                  </div>
                </div>
              );
            })}

            {hiddenRows.length > 0 && (
              <div className="flex items-center gap-2.5 px-[17px] py-[9px]" style={{ borderTop: `1px solid ${C.line}` }}>
                {!showAllRows && (
                  <span className="text-[11.5px]" style={{ color: 'color-mix(in srgb, var(--text-main) 65%, transparent)' }}>
                    {[tp('home.mod.more', hiddenRows.length), hiddenGraded > 0 ? t('home.mod.moreGraded', { n: hiddenGraded }) : null].filter(Boolean).join(' · ')}
                  </span>
                )}
                <button onClick={() => setShowAllRows(v => !v)} className="ml-auto text-[11px] font-semibold hover:underline" style={{ color: C.goldText }}>
                  {showAllRows ? t('home.mod.showLess') : `${t('home.mod.showAll')} →`}
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {gradeTerm && <ExamGradeDialog term={gradeTerm} onSave={saveGrade} onClose={() => setGradeTerm(null)} />}
    </div>
  );
};
