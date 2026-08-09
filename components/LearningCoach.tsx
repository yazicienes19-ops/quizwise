
import React, { useState, useMemo, useEffect } from 'react';
import { TopicMetric, ActiveTab, CoachInsights, FlashcardDeck, LearningFlowResult, ExamTerm, Collection, ProcessedDocument } from '../types';
import { EmojiImage } from './EmojiImage';
import { GapRadar } from './GapRadar';
import { CountUp } from './CountUp';
import { generateCoachInsights, WrongAnswerContext } from '../services/geminiService';
import { buildLearningProfile, buildRealTopicMastery, buildDailyPlan, buildMethodCommentary, buildContextMotivation, getCategoryLabel, getMethodLabel } from '../services/learningProfileService';
import { buildLearningScore } from '../services/learningScoreService';
import { buildExamForecast } from '../services/examForecastService';
import type { DailyPlanStep } from '../services/learningProfileService';
import { useModuleScopedActivity } from '../hooks/useModuleScopedActivity';
import { getStreak } from '../services/streakService';
import { getDismissedTopics, dismissTopic } from '../services/dismissedTopicsService';
import { toast } from '../services/toast';
import { useTranslation } from '../i18n/I18nProvider';
import { formatDate } from '../i18n/dates';
import { t as translate } from '../i18n';
import type { TKey } from '../i18n';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const scoreColor = (s: number) => s >= 70 ? '#22c55e' : s >= 50 ? '#f59e0b' : '#f43f5e';

const securityColor = (s: 'sicher' | 'unsicher' | 'kritisch') =>
  s === 'sicher' ? '#22c55e' : s === 'unsicher' ? '#f59e0b' : '#f43f5e';

const priorityColor = (p: 'hoch' | 'mittel' | 'niedrig') =>
  p === 'hoch' ? '#f43f5e' : p === 'mittel' ? '#f59e0b' : '#94a3b8';

const priorityEmoji = (p: 'hoch' | 'mittel' | 'niedrig') =>
  p === 'hoch' ? '🔴' : p === 'mittel' ? '🟡' : '🟢';

/** Mindestmenge an Sessions, ab der eine Dein Coach-Analyse tatsächlich Substanz hat statt zu raten. */
const MIN_SESSIONS_FOR_COACH = 5;

/** Coach-Ergebnis überlebt Tab-Wechsel; wird ungültig sobald neue Sessions dazukommen. */
const INSIGHTS_CACHE_KEY = 'studearc_coach_insights_v1';

/** Cache pro Fach (Variante C) getrennt — sonst würde nach einem Reload die
 *  Analyse eines anderen Fachs geladen, sobald zufällig dieselbe Session-Anzahl
 *  vorliegt. `undefined`/`null` = "Alle Fächer". */
const insightsCacheKey = (moduleId: string | null | undefined): string =>
  `${INSIGHTS_CACHE_KEY}:${moduleId ?? 'all'}`;

const getTabActionLabel = (tab: string): string => {
  const map: Record<string, TKey> = {
    QUIZ: 'lc.tabQuiz', CARDS: 'lc.tabCards', RECALL: 'lc.tabRecall',
    EXAM: 'lc.tabExam', EXPLAINER: 'lc.tabExplainer',
  };
  return map[tab] ? translate(map[tab]) : translate('lc.start');
};

// ─── Main Component ────────────────────────────────────────────────────────────

interface LearningCoachProps {
  metrics: TopicMetric[];
  decks: FlashcardDeck[];
  onNavigate: (tab: ActiveTab) => void;
  onAction?: (topic: string, mode: 'cards' | 'recall' | 'quiz') => void;
  flowResult?: LearningFlowResult | null;
  examTerms?: ExamTerm[];
  /** Variante C: aktives Fach — Auswertungen werden darauf gefiltert */
  activeModule?: Collection | null;
  documents?: ProcessedDocument[];
  userId?: string | null;
}

export const LearningCoach: React.FC<LearningCoachProps> = ({ metrics, decks, onNavigate, onAction, flowResult = null, examTerms = [], activeModule = null, documents = [], userId }) => {
  const { t, tp } = useTranslation();
  const [insights, setInsights] = useState<CoachInsights | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPrognosisInfo, setShowPrognosisInfo] = useState(false);
  const [dismissBump, setDismissBump] = useState(0);
  const dismissedTopics = useMemo(() => getDismissedTopics(), [dismissBump]);
  const handleDismissTopic = (topic: string) => {
    dismissTopic(topic);
    setDismissBump(b => b + 1);
  };

  const streak = useMemo(() => getStreak(), []);

  // Variante C: bei aktivem Fach zählen nur Ergebnisse aus diesem Ordner
  // (per Dokument-ID, Anzeigename oder Ordner-Quelle "Ordner: <Name>") —
  // gemeinsame Logik mit dem Dashboard, s. hooks/useModuleScopedActivity.
  const { quizResults, examResults, recallResults, moduleFilter } = useModuleScopedActivity(activeModule, documents, dismissedTopics);

  // Anki-Konfidenz (TopicMetric) hat keine Dokument-/Modul-Zuordnung (siehe
  // services/topicConfidence.ts). Bei aktivem Fach lässt sie sich also nicht
  // korrekt zuordnen — statt sie fälschlich als "für dieses Fach" auszugeben
  // (z.B. Themen eines ganz anderen Fachs als "kritisch" zeigen), blenden wir
  // sie dort lieber ganz aus: keine Werte statt falscher Werte. Zusätzlich um
  // manuell ausgeblendete Themen bereinigt.
  const moduleScopedMetrics = useMemo(
    () => (activeModule ? [] : metrics).filter(m => !dismissedTopics.has(m.topic)),
    [activeModule, metrics, dismissedTopics],
  );

  const profile = useMemo(() => buildLearningProfile({
    metrics: moduleScopedMetrics, quizResults, recallResults, examResults, decks,
    streak: { current: streak.current, best: streak.best },
  }), [moduleScopedMetrics, quizResults, recallResults, examResults, decks, streak]);

  // Echte KI-Subthemen (z.B. "Klassische Konditionierung") statt Dokumentnamen;
  // Fallback auf die docname-basierten Metriken wenn noch keine Themen erkannt wurden.
  const realTopics = useMemo(
    () => buildRealTopicMastery(quizResults, examResults, recallResults),
    [quizResults, examResults, recallResults],
  );
  const displayTopics = (realTopics.length > 0 ? realTopics : profile.topicMastery)
    .filter(dt => !dismissedTopics.has(dt.topic));

  const dailyPlan = useMemo(
    () => buildDailyPlan({ flowResult, realTopics, decks, profile }),
    [flowResult, realTopics, decks, profile],
  );

  const runPlanStep = (step: DailyPlanStep) => {
    if (step.target.kind === 'action' && onAction) onAction(step.target.topic, step.target.mode);
    else onNavigate(step.target.kind === 'tab' ? step.target.tab : ActiveTab.QUIZ);
  };

  const wrongAnswersCtx = useMemo((): WrongAnswerContext[] =>
    quizResults.slice(0, 5).flatMap(result =>
      (result.answers || [])
        .filter(a => !a.isCorrect)
        .slice(0, 4)
        .map((a): WrongAnswerContext | null => {
          const q = result.questions?.[a.questionIndex];
          if (!q) return null;
          return { id: `${result.id}:q${a.questionIndex}`, sessionId: result.id, question: q.question, topic: q.topic, explanation: q.explanation, docName: result.docName };
        })
        .filter((x): x is WrongAnswerContext => x !== null)
    ).slice(0, 15),
  [quizResults]);

  const hasAnyData = profile.perMethod.length > 0;
  const hasEnoughForCoach = profile.volume.totalSessions >= MIN_SESSIONS_FOR_COACH;

  // Trivial aus perMethod abgeleitet — kein eigenes Service-Feld nötig
  const strongestMethod = profile.perMethod.length > 0
    ? profile.perMethod.reduce((best, cur) => cur.avgScore > best.avgScore ? cur : best)
    : null;
  const methodCommentary = insights?.methodInsight ?? buildMethodCommentary(profile.perMethod);

  const learningScore = useMemo(
    () => buildLearningScore({ quizResults, examResults, recallResults, metrics: moduleScopedMetrics, decks, streakCurrent: streak.current }),
    [quizResults, examResults, recallResults, moduleScopedMetrics, decks, streak],
  );

  // Datenbasierte Motivation (unter der Prognose) + Datenbasis für die Transparenz-Aufklappung
  const lastActivityTs = useMemo(() => {
    const ts = [...quizResults, ...examResults, ...recallResults].map(r => r.timestamp);
    return ts.length ? Math.max(...ts) : null;
  }, [quizResults, examResults, recallResults]);
  const contextMotivation = useMemo(
    () => buildContextMotivation(profile, lastActivityTs),
    [profile, lastActivityTs],
  );
  const learnedCardsCount = useMemo(
    () => decks.reduce((sum, d) => sum + d.cards.filter(c => c.srs && c.srs.repetitions > 0).length, 0),
    [decks],
  );

  // Klausurprognose: Zerfall + Trend + Mischwert (services/examForecastService)
  const forecast = useMemo(() => {
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const nextExam = [...examTerms].filter(t => t.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
    return buildExamForecast({
      examResults,
      topicMastery: displayTopics,
      decks,
      nextExamDate: nextExam?.date ?? null,
    });
  }, [examResults, displayTopics, decks, examTerms]);

  // Fach-Wechsel (Variante C) invalidiert eine ggf. angezeigte Coach-Analyse des
  // vorherigen Fachs sofort — sonst bliebe die Analyse von Fach A stehen, während
  // die restlichen Panels schon Fach B zeigen. Danach wird — falls vorhanden — die
  // zum neuen Fach passende, gecachte Analyse geladen (nur wenn seitdem keine
  // neuen Sessions dazukamen).
  useEffect(() => {
    setInsights(null);
    try {
      const raw = localStorage.getItem(insightsCacheKey(activeModule?.id));
      if (!raw) return;
      const cached = JSON.parse(raw) as { insights: CoachInsights; totalSessions: number };
      if (cached?.insights && cached.totalSessions === profile.volume.totalSessions) {
        setInsights(cached.insights);
      }
    } catch {}
  // profile ändert sich bei jeder neuen Session — das soll für sich genommen
  // NICHT zurücksetzen (nur ein Fach-Wechsel soll das), daher bewusst nicht in
  // den Deps.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeModule?.id]);

  const wissensprofilItems = [
    ...profile.categoryMastery.map(c => ({ key: `cat-${c.category}`, label: getCategoryLabel(c.category), avgScore: c.avgScore })),
    ...profile.typeMastery.map(t => ({ key: `type-${t.type}`, label: t.label, avgScore: t.avgScore })),
  ].sort((a, b) => a.avgScore - b.avgScore);

  // Erklärt, warum bestimmte Panels noch nicht erscheinen, statt sie kommentarlos zu verstecken —
  // nur Panels mit einer klaren, festen Datenschwelle (keine Platzhalter für "einfach noch leer").
  const lockedPanels = [
    profile.longTermTrend === null && {
      label: t('lc.developmentSince'),
      reason: t('lc.reasonExams', { n: examResults.length }),
    },
    !hasEnoughForCoach && {
      label: t('lc.coach'),
      reason: t('lc.reasonSessions', { min: MIN_SESSIONS_FOR_COACH, n: profile.volume.totalSessions }),
    },
    displayTopics.length === 0 && {
      label: t('lc.topicSecurity'),
      reason: t('lc.reasonTopics'),
    },
    wissensprofilItems.length === 0 && {
      label: t('lc.knowledgeProfile'),
      reason: t('lc.reasonKnowledge'),
    },
    learningScore.overall === null && {
      label: t('lc.learningScore'),
      reason: t('lc.reasonScore'),
    },
  ].filter((x): x is { label: string; reason: string } => Boolean(x));

  const handleRunCoach = async () => {
    if (!hasAnyData || !hasEnoughForCoach) return;
    setIsLoading(true);
    try {
      // Echte Subthemen (inkl. hergeleitetem bloomLevel, s. learningProfileService.ts)
      // statt der doc-name-basierten profile.topicMastery an die KI geben, falls
      // vorhanden — profile selbst bleibt unangetastet (ExamGenerator hängt daran).
      const coachProfile = realTopics.length > 0 ? { ...profile, topicMastery: realTopics } : profile;
      const result = await generateCoachInsights(coachProfile, wrongAnswersCtx);
      setInsights(result);
      try {
        localStorage.setItem(insightsCacheKey(activeModule?.id), JSON.stringify({
          insights: result, totalSessions: profile.volume.totalSessions, savedAt: Date.now(),
        }));
      } catch {}
    } catch (e: any) {
      toast.error(t('lc.coachFailed', { msg: e?.message || translate('es.unknownError') }));
    } finally {
      setIsLoading(false);
    }
  };

  const tabFromKey = (key: string): ActiveTab =>
    (ActiveTab as Record<string, ActiveTab>)[key] ?? ActiveTab.DASHBOARD;

  if (!hasAnyData) {
    return (
      <div className="space-y-10">
        <div className="text-center space-y-3">
          <h1 className="text-4xl lg:text-6xl font-black tracking-tighter" style={{ color: 'var(--ink)' }}>
            {t('lc.titlePre')} <span style={{ color: 'var(--primary)' }}>{t('lc.titleAccent')}</span> <EmojiImage emoji="🧭" size={36} />
          </h1>
        </div>
        <div className="flex flex-col items-center justify-center py-32 space-y-6 opacity-30">
          <EmojiImage emoji="📊" size={64} />
          <div className="text-center space-y-2">
            <p className="font-black text-slate-400 uppercase text-xs tracking-widest">{t('gr.noData')}</p>
            <p className="text-sm text-slate-500 max-w-xs mx-auto">
              {t('lc.emptyHint')}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10 lg:space-y-12 animate-in fade-in duration-700 pb-20">

      {/* ── Header ── */}
      <div className="text-center space-y-3">
        <h1 className="text-4xl lg:text-6xl font-black tracking-tighter" style={{ color: 'var(--ink)' }}>
          {t('lc.titlePre')} <span style={{ color: 'var(--primary)' }}>{t('lc.titleAccent')}</span> <EmojiImage emoji="🧭" size={36} />
        </h1>
        <p className="text-base font-medium opacity-80" style={{ color: 'var(--mute)' }}>
          {t('lc.subtitle')}
        </p>
        {activeModule && (
          <p
            className="inline-block px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest mr-2"
            style={{ background: 'color-mix(in srgb, var(--primary) 12%, transparent)', color: 'var(--primary)', border: '1px solid color-mix(in srgb, var(--primary) 30%, transparent)' }}
          >
            {t('lc.moduleOnly', { emoji: activeModule.emoji, name: activeModule.name })}
          </p>
        )}
        <p
          className="inline-block px-5 py-2.5 rounded-2xl text-sm font-black"
          style={{ background: 'color-mix(in srgb, var(--primary) 10%, transparent)', color: 'var(--primary)' }}
        >
          {profile.motivationLine}
        </p>
      </div>

      {/* ── Heute solltest du — priorisierte nächste Schritte ── */}
      {dailyPlan.length > 0 && (
        <div
          className="p-6 lg:p-8 rounded-[24px] lg:rounded-[32px] border shadow-3d-raised space-y-4"
          style={{ background: 'var(--card)', borderColor: 'color-mix(in srgb, var(--primary) 25%, var(--border-color))' }}
        >
          <h3 className="text-[9px] font-black uppercase tracking-widest" style={{ color: 'var(--primary)' }}>
            {t('lc.todayYouShould')}
          </h3>
          <div className="space-y-3">
            {dailyPlan.map((step, i) => (
              <button
                key={i}
                onClick={() => runPlanStep(step)}
                className="w-full flex items-start gap-3 text-left transition-all hover:opacity-75"
              >
                <span
                  className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0 mt-0.5"
                  style={{ background: 'color-mix(in srgb, var(--primary) 12%, transparent)', color: 'var(--primary)' }}
                >
                  {i + 1}
                </span>
                <span className="min-w-0">
                  <span className="text-sm font-black flex items-center gap-2 flex-wrap" style={{ color: 'var(--ink)' }}>
                    {step.title}
                    <span
                      className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest shrink-0"
                      style={{ background: 'color-mix(in srgb, var(--primary) 8%, transparent)', color: 'var(--primary)' }}
                    >
                      {t('lc.minShort', { n: step.minutes })}
                    </span>
                  </span>
                  {step.why && (
                    <span className="block text-[11px] font-medium mt-0.5" style={{ color: 'var(--mute)' }}>{step.why}</span>
                  )}
                </span>
              </button>
            ))}
          </div>
          <button
            onClick={() => runPlanStep(dailyPlan[0])}
            className="px-8 py-4 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] shadow-xl hover:scale-105 transition-all"
            style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
          >
            {t('lc.startNow')}
          </button>
        </div>
      )}

      {/* ── Coach-Hero: Klausurprognose + Top-Empfehlung ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        <div
          className="lg:col-span-1 p-6 lg:p-8 rounded-[24px] lg:rounded-[32px] border shadow-3d-raised flex flex-col items-center justify-center text-center"
          style={{ background: 'var(--card)', borderColor: 'var(--border-color)' }}
        >
          <h3 className="text-[9px] font-black uppercase tracking-widest mb-4" style={{ color: 'var(--mute)' }}>
            {t('lc.examPrognosis')}
          </h3>
          {forecast ? (
            <>
              {forecast.preliminary && (
                <span className="text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full mb-2"
                  style={{ background: 'color-mix(in srgb, #f59e0b 15%, transparent)', color: '#f59e0b' }}>
                  {t('lc.preliminary')}
                </span>
              )}
              <p className="text-5xl font-black" style={{ color: 'var(--primary)' }}>
                <CountUp value={parseFloat(forecast.grade)} from={5} decimals={1} finalText={forecast.grade} />
              </p>
              <p className="text-sm font-black mt-2" style={{ color: 'var(--ink)' }}>
                {forecast.preliminary
                  ? t('lc.expectedRange', { low: forecast.range.low, high: forecast.range.high })
                  : t('lc.expectedApprox', { n: forecast.expected })}
              </p>
              <p className="text-[10px] font-bold uppercase mt-1" style={{ color: 'var(--mute)' }}>
                {t('lc.rangeConfidence', { low: forecast.range.low, high: forecast.range.high, conf: forecast.confidence })}
              </p>
              <p className="text-[10px] font-bold uppercase mt-0.5" style={{ color: 'var(--mute)' }}>
                {t('lc.passProb', { n: forecast.passProbability })}
              </p>
              <div className="w-full mt-3 space-y-1 text-left">
                <p className="text-[10px] font-medium" style={{ color: 'var(--ink2)' }}>
                  {t('lc.learnTrendLabel')}<strong>{forecast.trendAvailable ? forecast.trend : (4 - forecast.basis.exams === 1 ? t('lc.trendVisibleOne') : t('lc.trendVisibleN', { n: 4 - forecast.basis.exams }))}</strong>
                </p>
                {forecast.projection && (
                  <p className="text-[10px] font-medium" style={{ color: 'var(--ink2)' }}>
                    {t('lc.projection', { date: formatDate(`${forecast.projection.date}T12:00:00`, { day: '2-digit', month: '2-digit' }), value: forecast.projection.value })}
                  </p>
                )}
              </div>
              <button
                onClick={() => setShowPrognosisInfo(v => !v)}
                className="text-[9px] font-black uppercase tracking-widest mt-3 underline decoration-dotted underline-offset-2 transition-opacity hover:opacity-70"
                style={{ color: 'var(--mute)' }}
              >
                {t('lc.howCalculated')}
              </button>
              {showPrognosisInfo && (
                <div className="text-[10px] font-medium mt-2 leading-relaxed text-left space-y-2" style={{ color: 'var(--mute)' }}>
                  <p><strong style={{ color: 'var(--ink2)' }}>{t('lc.currentForm')}</strong> {t('lc.currentFormDesc')}</p>
                  <p><strong style={{ color: 'var(--ink2)' }}>{t('lc.yourTrend')}</strong> {t('lc.yourTrendDesc')}</p>
                  <p><strong style={{ color: 'var(--ink2)' }}>{t('lc.honestUncertainty')}</strong> {t('lc.honestUncertaintyDesc')}</p>
                  <p><strong style={{ color: 'var(--ink2)' }}>{t('lc.whatCounts')}</strong> {t('lc.whatCountsBase')}{forecast.parts.topicShare !== null ? t('lc.topicShare', { n: forecast.parts.topicShare }) : ''}{forecast.parts.retentionShare !== null ? t('lc.retentionShare', { n: forecast.parts.retentionShare }) : ''}{t('lc.basisLine', { exams: tp('lc.examsN', forecast.basis.exams), quizzes: quizResults.length, cards: learnedCardsCount })}</p>
                </div>
              )}
            </>
          ) : (
            <p className="text-[10px] font-bold" style={{ color: 'var(--mute)' }}>
              {t('lc.noExamYet')}
            </p>
          )}
          <div className="w-full mt-4 pt-3 border-t" style={{ borderColor: 'var(--border-soft)' }}>
            <p className="text-[9px] font-black uppercase tracking-widest mb-1" style={{ color: 'var(--primary)' }}>{t('lc.coachSays')}</p>
            <p className="text-[11px] font-medium italic leading-relaxed" style={{ color: 'var(--mute)' }}>{contextMotivation}</p>
          </div>
        </div>

        <div
          className="lg:col-span-2 p-6 lg:p-8 rounded-[24px] lg:rounded-[32px] border shadow-3d-raised flex flex-col justify-center"
          style={{ background: 'var(--card)', borderColor: 'color-mix(in srgb, var(--primary) 25%, var(--border-color))' }}
        >
          <h3 className="text-[9px] font-black uppercase tracking-widest mb-3" style={{ color: 'var(--mute)' }}>
            {t('lc.coach')}
          </h3>
          {!hasEnoughForCoach ? (
            <p className="text-sm font-medium leading-relaxed" style={{ color: 'var(--ink2)' }}>
              {t('lc.notEnoughData')}
            </p>
          ) : !insights ? (
            <>
              <p className="text-sm font-medium mb-4" style={{ color: 'var(--ink2)' }}>
                {t('lc.analyzeProfile')}
              </p>
              <button
                onClick={handleRunCoach}
                disabled={isLoading}
                className="self-start px-8 py-4 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] shadow-xl hover:scale-105 transition-all disabled:opacity-40"
                style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
              >
                {isLoading ? t('gr.analyzing') : <>{t('lc.startCoach')} <EmojiImage emoji="✨" size={13} /></>}
              </button>
            </>
          ) : (
            <div className="space-y-2">
              {insights.synthesis.map((s, i) => (
                <p key={i} className="text-sm font-medium leading-relaxed" style={{ color: 'var(--ink)' }}>
                  {s}
                </p>
              ))}
              <button
                onClick={handleRunCoach}
                disabled={isLoading}
                className="text-[9px] font-black uppercase tracking-widest hover:opacity-80 transition-opacity disabled:opacity-40 mt-1"
                style={{ color: 'var(--mute)' }}
              >
                {isLoading ? t('lc.analyzingShort') : t('lc.reanalyze')}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Deterministische Panels ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">

        {/* Methodenvergleich */}
        {profile.perMethod.length > 0 && (
          <div className="p-6 lg:p-8 rounded-[24px] lg:rounded-[32px] border shadow-3d-raised space-y-4" style={{ background: 'var(--card)', borderColor: 'var(--border-color)' }}>
            <h3 className="text-[9px] font-black uppercase tracking-widest" style={{ color: 'var(--mute)' }}>{t('lc.methodComparison')}</h3>
            <div className="space-y-3">
              {profile.perMethod.map(m => (
                <div key={m.method} className="space-y-1">
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs font-black flex items-center gap-1" style={{ color: 'var(--ink)' }}>
                      {getMethodLabel(m.method)}
                      {strongestMethod?.method === m.method && <EmojiImage emoji="👑" size={11} />}
                    </span>
                    <span className="flex items-center gap-2">
                      {m.improvementPerSession !== 0 && (
                        <span className="text-[9px] font-black" style={{ color: m.improvementPerSession > 0 ? '#22c55e' : '#f43f5e' }}>
                          {t('lc.perSession', { sign: m.improvementPerSession > 0 ? '+' : '', n: m.improvementPerSession })}
                        </span>
                      )}
                      <span className="text-xs font-black" style={{ color: scoreColor(m.avgScore) }}>
                        {m.avgScore}% {m.trend === 'up' ? '↑' : m.trend === 'down' ? '↓' : ''}
                      </span>
                    </span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--border-color)' }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${m.avgScore}%`, background: scoreColor(m.avgScore) }} />
                  </div>
                </div>
              ))}
            </div>
            {methodCommentary && (
              <p className="text-[11px] font-medium pt-2 border-t italic" style={{ color: 'var(--ink2)', borderColor: 'var(--border-soft)' }}>
                {methodCommentary}
              </p>
            )}
          </div>
        )}

        {/* Learning Score — 5 Lernbereiche, deterministisch berechnet */}
        {learningScore.overall !== null && (
          <div className="p-6 lg:p-8 rounded-[24px] lg:rounded-[32px] border shadow-3d-raised space-y-4" style={{ background: 'var(--card)', borderColor: 'var(--border-color)' }}>
            <div className="flex items-baseline justify-between">
              <h3 className="text-[9px] font-black uppercase tracking-widest" style={{ color: 'var(--mute)' }}>{t('lc.learningScore')}</h3>
              <span className="text-3xl font-black" style={{ color: 'var(--primary)' }}>{learningScore.overall}</span>
            </div>
            <div className="space-y-3">
              {learningScore.dimensions.map(d => (
                <div key={d.key} className="space-y-1">
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs font-black flex items-center gap-1.5" style={{ color: 'var(--ink)' }}>
                      <EmojiImage emoji={d.emoji} size={12} /> {d.label}
                    </span>
                    <span className="text-xs font-black" style={{ color: d.score !== null ? scoreColor(d.score) : 'var(--mute)' }}>
                      {d.score !== null ? `${d.score}` : '—'}
                    </span>
                  </div>
                  {d.score !== null ? (
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--border-color)' }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${d.score}%`, background: scoreColor(d.score) }} />
                    </div>
                  ) : (
                    <p className="text-[9px] font-medium" style={{ color: 'var(--mute)' }}>{d.hint}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Themen-Sicherheit — echte Themen, Dokumentnamen nur als Fallback */}
        {displayTopics.length > 0 && (
          <div className="p-6 lg:p-8 rounded-[24px] lg:rounded-[32px] border shadow-3d-raised space-y-4" style={{ background: 'var(--card)', borderColor: 'var(--border-color)' }}>
            <h3 className="text-[9px] font-black uppercase tracking-widest" style={{ color: 'var(--mute)' }}>{t('lc.topicSecurity')}</h3>
            <div className="flex flex-wrap gap-2">
              {displayTopics.slice(0, 10).map(dt => (
                <div key={dt.topic} className="relative group">
                  <button
                    onClick={() => onAction?.(dt.topic, 'quiz')}
                    className="px-3 py-2 pr-6 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all hover:opacity-80"
                    style={{
                      background: `color-mix(in srgb, ${securityColor(dt.security)} 10%, var(--bg-sidebar))`,
                      color: securityColor(dt.security),
                      border: `1px solid color-mix(in srgb, ${securityColor(dt.security)} 25%, transparent)`,
                    }}
                  >
                    {dt.topic} · {t((`sec.${dt.security}`) as TKey)}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDismissTopic(dt.topic); }}
                    aria-label={t('lc.dismissTopic')}
                    title={t('lc.dismissTopic')}
                    className="absolute top-1/2 right-1.5 -translate-y-1/2 w-3.5 h-3.5 flex items-center justify-center rounded-full text-[10px] font-black leading-none opacity-70 hover:opacity-100 transition-opacity"
                    style={{ color: securityColor(dt.security) }}
                  >×</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Vergessensplan */}
        {profile.forgetting.length > 0 && (
          <div className="p-6 lg:p-8 rounded-[24px] lg:rounded-[32px] border shadow-3d-raised space-y-4" style={{ background: 'var(--card)', borderColor: 'var(--border-color)' }}>
            <h3 className="text-[9px] font-black uppercase tracking-widest" style={{ color: 'var(--mute)' }}>{t('lc.forgettingPlan')}</h3>
            <div className="space-y-2">
              {profile.forgetting.map(f => (
                <div key={f.topic} className="flex justify-between items-center">
                  <span className="text-xs font-bold" style={{ color: 'var(--ink)' }}>{f.topic}</span>
                  <span className="text-[10px] font-black uppercase" style={{ color: 'var(--primary)' }}>
                    {f.dueInDays <= 0 ? t('lc.reviewToday') : tp('lc.inDaysN', f.dueInDays)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tageszeit + Lernvolumen */}
        <div className="p-6 lg:p-8 rounded-[24px] lg:rounded-[32px] border shadow-3d-raised space-y-4" style={{ background: 'var(--card)', borderColor: 'var(--border-color)' }}>
          <h3 className="text-[9px] font-black uppercase tracking-widest" style={{ color: 'var(--mute)' }}>{t('lc.rhythm')}</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[9px] font-bold uppercase" style={{ color: 'var(--mute)' }}>{t('lc.bestTime')}</p>
              <p className="text-lg font-black" style={{ color: 'var(--ink)' }}>{profile.timeOfDay.bestPart ? t((`tod.${profile.timeOfDay.bestPart}`) as TKey) : '—'}</p>
            </div>
            <div>
              <p className="text-[9px] font-bold uppercase" style={{ color: 'var(--mute)' }}>{t('lc.mostProductiveDay')}</p>
              <p className="text-lg font-black" style={{ color: 'var(--ink)' }}>{profile.dayOfWeek.bestDay ? t((`dow.${profile.dayOfWeek.bestDay}`) as TKey) : '—'}</p>
            </div>
            <div>
              <p className="text-[9px] font-bold uppercase" style={{ color: 'var(--mute)' }}>{t('lc.streak')}</p>
              <p className="text-lg font-black" style={{ color: 'var(--ink)' }}>{t('lc.daysN', { n: profile.volume.streakCurrent })}</p>
              <p className="text-[9px] font-medium" style={{ color: 'var(--mute)' }}>{t('lc.recordDays', { n: profile.volume.streakBest })}</p>
            </div>
            <div>
              <p className="text-[9px] font-bold uppercase" style={{ color: 'var(--mute)' }}>{t('lc.sessionsPerWeek')}</p>
              <p className="text-lg font-black" style={{ color: 'var(--ink)' }}>{profile.volume.sessionsPerWeek}</p>
            </div>
            <div>
              <p className="text-[9px] font-bold uppercase" style={{ color: 'var(--mute)' }}>{t('lc.totalSessions')}</p>
              <p className="text-lg font-black" style={{ color: 'var(--ink)' }}>{profile.volume.totalSessions}</p>
            </div>
          </div>
        </div>

        {/* Wissensprofil — Kategorien + Fragetypen vereint */}
        {wissensprofilItems.length > 0 && (
          <div className="p-6 lg:p-8 rounded-[24px] lg:rounded-[32px] border shadow-3d-raised space-y-4" style={{ background: 'var(--card)', borderColor: 'var(--border-color)' }}>
            <h3 className="text-[9px] font-black uppercase tracking-widest" style={{ color: 'var(--mute)' }}>{t('lc.knowledgeProfile')}</h3>
            <div className="flex flex-wrap gap-2">
              {wissensprofilItems.map(item => (
                <button
                  key={item.key}
                  onClick={() => onNavigate(ActiveTab.QUIZ)}
                  className="px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all hover:opacity-80"
                  style={{
                    background: `color-mix(in srgb, ${scoreColor(item.avgScore)} 10%, var(--bg-sidebar))`,
                    color: scoreColor(item.avgScore),
                    border: `1px solid color-mix(in srgb, ${scoreColor(item.avgScore)} 25%, transparent)`,
                  }}
                >
                  {item.label} · {item.avgScore}%
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Ursachenanalyse — nur wirklich ausgelöste Ursachen */}
        {profile.causeAnalysis.length > 0 && (
          <div className="p-6 lg:p-8 rounded-[24px] lg:rounded-[32px] border shadow-3d-raised space-y-4" style={{ background: 'var(--card)', borderColor: 'var(--border-color)' }}>
            <h3 className="text-[9px] font-black uppercase tracking-widest" style={{ color: 'var(--mute)' }}>{t('lc.whyLosePoints')}</h3>
            <div className="space-y-3">
              {profile.causeAnalysis.map(c => (
                <div key={c.cause}>
                  <p className="text-xs font-black" style={{ color: '#f43f5e' }}>{c.cause}</p>
                  <p className="text-[11px] font-medium mt-0.5" style={{ color: 'var(--ink2)' }}>{c.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Langzeit-Entwicklung */}
        {profile.longTermTrend && (
          <div className="p-6 lg:p-8 rounded-[24px] lg:rounded-[32px] border shadow-3d-raised space-y-4" style={{ background: 'var(--card)', borderColor: 'var(--border-color)' }}>
            <h3 className="text-[9px] font-black uppercase tracking-widest" style={{ color: 'var(--mute)' }}>{t('lc.developmentSince')}</h3>
            <div className="flex flex-wrap gap-2">
              {profile.longTermTrend.map(t => (
                <span
                  key={t.label}
                  className="px-3 py-2 rounded-xl text-[10px] font-black"
                  style={{
                    background: `color-mix(in srgb, ${t.delta >= 0 ? '#22c55e' : '#f43f5e'} 12%, var(--bg-sidebar))`,
                    color: t.delta >= 0 ? '#22c55e' : '#f43f5e',
                  }}
                >
                  {t.label} {t.delta >= 0 ? '+' : ''}{t.delta}%
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Bald verfügbar — erklärt fehlende Panels statt sie kommentarlos zu verstecken ── */}
      {lockedPanels.length > 0 && (
        <div className="p-5 lg:p-6 rounded-[20px] border border-dashed space-y-2" style={{ borderColor: 'var(--border-color)' }}>
          <p className="text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5" style={{ color: 'var(--mute)' }}>
            <EmojiImage emoji="🔒" size={11} /> {t('lc.comingSoon')}
          </p>
          {lockedPanels.map(l => (
            <p key={l.label} className="text-[11px] font-medium" style={{ color: 'var(--mute)' }}>
              <strong style={{ color: 'var(--ink2)' }}>{l.label}:</strong> {l.reason}
            </p>
          ))}
        </div>
      )}

      {/* ── Dein Coach-Ergebnis (Verbindungen, Prognose, Empfehlungen) ── */}
      {insights && (
        <div className="space-y-6">
          {insights.connections.length > 0 && (
            <div className="p-6 lg:p-8 rounded-[24px] lg:rounded-[32px] border shadow-3d-raised space-y-3" style={{ background: 'var(--card)', borderColor: 'var(--border-color)' }}>
              <h3 className="text-[9px] font-black uppercase tracking-widest" style={{ color: 'var(--mute)' }}>{t('lc.connectionsFound')}</h3>
              {insights.connections.map((c, i) => (
                <p key={i} className="text-sm font-medium leading-relaxed" style={{ color: 'var(--ink2)' }}>
                  <strong style={{ color: 'var(--ink)' }}>{c.a}</strong> ↔ <strong style={{ color: 'var(--ink)' }}>{c.b}</strong>: {c.reasoning}
                </p>
              ))}
            </div>
          )}

          {insights.forwardPrediction && (
            <div
              className="p-6 rounded-[24px] flex items-start gap-3"
              style={{ background: 'color-mix(in srgb, var(--primary) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--primary) 20%, transparent)' }}
            >
              <EmojiImage emoji="🔮" size={20} />
              <p className="text-sm font-medium leading-relaxed" style={{ color: 'var(--ink)' }}>{insights.forwardPrediction}</p>
            </div>
          )}

          {insights.recommendations.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-lg font-black" style={{ color: 'var(--ink)' }}>{t('ev.recommendations')}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[...insights.recommendations]
                  .sort((a, b) => (a.priority === 'hoch' ? 0 : a.priority === 'mittel' ? 1 : 2) - (b.priority === 'hoch' ? 0 : b.priority === 'mittel' ? 1 : 2))
                  .slice(0, 3)
                  .map((r, i) => (
                  <button
                    key={i}
                    onClick={() => onNavigate(tabFromKey(r.tab))}
                    className="text-left p-5 rounded-[20px] border transition-all hover:opacity-80"
                    style={{ background: 'var(--bg-sidebar)', borderColor: 'var(--border-color)', borderLeftWidth: 4, borderLeftColor: priorityColor(r.priority) }}
                  >
                    <p className="text-[9px] font-black uppercase tracking-widest mb-1" style={{ color: priorityColor(r.priority) }}>
                      {priorityEmoji(r.priority)} {t((`prio.${r.priority}`) as TKey)}
                    </p>
                    <p className="text-sm font-black mb-1" style={{ color: 'var(--ink)' }}>{r.action}</p>
                    <p className="text-[11px] font-medium mb-2" style={{ color: 'var(--mute)' }}>
                      <strong style={{ color: 'var(--ink2)' }}>{t('lc.reason')}</strong> {r.reasoning}
                    </p>
                    <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--primary)' }}>
                      ➡ {getTabActionLabel(r.tab)}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Bestehende Verlaufs-/Fehleranalyse, respektiert dieselbe Modul-Filterung wie der Rest der Seite ── */}
      <div className="pt-8 border-t" style={{ borderColor: 'var(--border-color)' }}>
        <GapRadar
          key={activeModule?.id ?? 'all'}
          metrics={moduleScopedMetrics}
          onNavigate={onNavigate}
          onAction={onAction}
          hideHeader
          userId={userId}
          moduleFilter={moduleFilter}
          moduleId={activeModule?.id ?? null}
          dismissedTopics={dismissedTopics}
        />
      </div>
    </div>
  );
};
