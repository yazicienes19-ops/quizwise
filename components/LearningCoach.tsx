
import React, { useState, useMemo, useEffect } from 'react';
import { TopicMetric, ActiveTab, CoachInsights, FlashcardDeck, LearningFlowResult } from '../types';
import { EmojiImage } from './EmojiImage';
import { GapRadar } from './GapRadar';
import { generateCoachInsights, WrongAnswerContext } from '../services/geminiService';
import { buildLearningProfile, buildRealTopicMastery, buildDailyPlan, buildMethodCommentary, buildContextMotivation, CATEGORY_LABELS, METHOD_LABELS } from '../services/learningProfileService';
import { buildLearningScore } from '../services/learningScoreService';
import type { DailyPlanStep } from '../services/learningProfileService';
import { getAllResults } from '../services/quizHistoryService';
import { getAllRecallResults } from '../services/recallHistoryService';
import { getAllExamResults } from '../services/examHistoryService';
import { getStreak } from '../services/streakService';
import { toast } from '../services/toast';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const scoreColor = (s: number) => s >= 70 ? '#22c55e' : s >= 50 ? '#f59e0b' : '#f43f5e';

const securityColor = (s: 'sicher' | 'unsicher' | 'kritisch') =>
  s === 'sicher' ? '#22c55e' : s === 'unsicher' ? '#f59e0b' : '#f43f5e';

const priorityColor = (p: 'hoch' | 'mittel' | 'niedrig') =>
  p === 'hoch' ? '#f43f5e' : p === 'mittel' ? '#f59e0b' : '#94a3b8';

const priorityEmoji = (p: 'hoch' | 'mittel' | 'niedrig') =>
  p === 'hoch' ? '🔴' : p === 'mittel' ? '🟡' : '🟢';

/** Mindestmenge an Sessions, ab der eine KI-Coach-Analyse tatsächlich Substanz hat statt zu raten. */
const MIN_SESSIONS_FOR_COACH = 5;

/** Coach-Ergebnis überlebt Tab-Wechsel; wird ungültig sobald neue Sessions dazukommen. */
const INSIGHTS_CACHE_KEY = 'quizwise_coach_insights_v1';

const TAB_ACTION_LABELS: Record<string, string> = {
  QUIZ: 'Quiz starten', CARDS: 'Karteikarten üben', RECALL: 'Feynman starten',
  EXAM: 'Klausur starten', EXPLAINER: 'KI-Erklärer starten',
};

// ─── Main Component ────────────────────────────────────────────────────────────

interface LearningCoachProps {
  metrics: TopicMetric[];
  decks: FlashcardDeck[];
  onNavigate: (tab: ActiveTab) => void;
  onAction?: (topic: string, mode: 'cards' | 'recall' | 'quiz') => void;
  flowResult?: LearningFlowResult | null;
}

export const LearningCoach: React.FC<LearningCoachProps> = ({ metrics, decks, onNavigate, onAction, flowResult = null }) => {
  const [insights, setInsights] = useState<CoachInsights | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPrognosisInfo, setShowPrognosisInfo] = useState(false);

  const quizResults   = useMemo(() => getAllResults(), []);
  const recallResults = useMemo(() => getAllRecallResults(), []);
  const examResults    = useMemo(() => getAllExamResults(), []);
  const streak         = useMemo(() => getStreak(), []);

  const profile = useMemo(() => buildLearningProfile({
    metrics, quizResults, recallResults, examResults, decks,
    streak: { current: streak.current, best: streak.best },
  }), [metrics, quizResults, recallResults, examResults, decks, streak]);

  // Echte KI-Subthemen (z.B. "Klassische Konditionierung") statt Dokumentnamen;
  // Fallback auf die docname-basierten Metriken wenn noch keine Themen erkannt wurden.
  const realTopics = useMemo(
    () => buildRealTopicMastery(quizResults, examResults, recallResults),
    [quizResults, examResults, recallResults],
  );
  const displayTopics = realTopics.length > 0 ? realTopics : profile.topicMastery;

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
        .map(a => {
          const q = result.questions?.[a.questionIndex];
          if (!q) return null;
          return { question: q.question, topic: q.topic, explanation: q.explanation, docName: result.docName };
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
    () => buildLearningScore({ quizResults, examResults, recallResults, metrics, decks, streakCurrent: streak.current }),
    [quizResults, examResults, recallResults, metrics, decks, streak],
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

  // Gecachtes Coach-Ergebnis laden — nur wenn seitdem keine neuen Sessions dazukamen
  useEffect(() => {
    try {
      const raw = localStorage.getItem(INSIGHTS_CACHE_KEY);
      if (!raw) return;
      const cached = JSON.parse(raw) as { insights: CoachInsights; totalSessions: number };
      if (cached?.insights && cached.totalSessions === profile.volume.totalSessions) {
        setInsights(cached.insights);
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const wissensprofilItems = [
    ...profile.categoryMastery.map(c => ({ key: `cat-${c.category}`, label: CATEGORY_LABELS[c.category] || c.category, avgScore: c.avgScore })),
    ...profile.typeMastery.map(t => ({ key: `type-${t.type}`, label: t.label, avgScore: t.avgScore })),
  ].sort((a, b) => a.avgScore - b.avgScore);

  // Erklärt, warum bestimmte Panels noch nicht erscheinen, statt sie kommentarlos zu verstecken —
  // nur Panels mit einer klaren, festen Datenschwelle (keine Platzhalter für "einfach noch leer").
  const lockedPanels = [
    profile.longTermTrend === null && {
      label: 'Deine Entwicklung seit Beginn',
      reason: `Braucht mindestens 4 Klausuren, du hast ${examResults.length}.`,
    },
    !hasEnoughForCoach && {
      label: 'KI-Coach',
      reason: `Braucht mindestens ${MIN_SESSIONS_FOR_COACH} Lernsessions, du hast ${profile.volume.totalSessions}.`,
    },
    displayTopics.length === 0 && {
      label: 'Themen-Sicherheit',
      reason: 'Erscheint nach deiner ersten Quiz-, Klausur- oder Karteikarten-Session.',
    },
    wissensprofilItems.length === 0 && {
      label: 'Wissensprofil',
      reason: 'Erscheint nach deiner ersten Klausur oder deinem ersten Quiz.',
    },
    learningScore.overall === null && {
      label: 'Learning Score',
      reason: 'Braucht mehr Daten — z.B. 2 Erklär-Sessions, 10 gelernte Karteikarten oder 2 Klausuren.',
    },
  ].filter((x): x is { label: string; reason: string } => Boolean(x));

  const handleRunCoach = async () => {
    if (!hasAnyData || !hasEnoughForCoach) return;
    setIsLoading(true);
    try {
      const result = await generateCoachInsights(profile, wrongAnswersCtx);
      setInsights(result);
      try {
        localStorage.setItem(INSIGHTS_CACHE_KEY, JSON.stringify({
          insights: result, totalSessions: profile.volume.totalSessions, savedAt: Date.now(),
        }));
      } catch {}
    } catch (e: any) {
      toast.error(`Coach-Analyse fehlgeschlagen: ${e?.message || 'Unbekannter Fehler'}`);
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
          <h1 className="text-4xl lg:text-7xl font-black tracking-tighter" style={{ color: 'var(--ink)' }}>
            Lern <span style={{ color: 'var(--primary)' }}>Coach</span> <EmojiImage emoji="🧭" size={36} />
          </h1>
        </div>
        <div className="flex flex-col items-center justify-center py-32 space-y-6 opacity-30">
          <EmojiImage emoji="📊" size={64} />
          <div className="text-center space-y-2">
            <p className="font-black text-slate-400 uppercase text-xs tracking-widest">Noch keine Daten</p>
            <p className="text-sm text-slate-500 max-w-xs mx-auto">
              Absolviere ein Quiz, eine Klausur, Feynman oder den KI-Erklärer, damit dein Coach loslegen kann.
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
        <h1 className="text-4xl lg:text-7xl font-black tracking-tighter" style={{ color: 'var(--ink)' }}>
          Lern <span style={{ color: 'var(--primary)' }}>Coach</span> <EmojiImage emoji="🧭" size={36} />
        </h1>
        <p className="text-base font-medium opacity-80" style={{ color: 'var(--mute)' }}>
          Dein persönlicher KI-Lerncoach — alle Methoden, ein Überblick.
        </p>
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
          className="p-6 lg:p-8 rounded-[24px] lg:rounded-[32px] border shadow-sm space-y-4"
          style={{ background: 'var(--card)', borderColor: 'color-mix(in srgb, var(--primary) 25%, var(--border-color))' }}
        >
          <h3 className="text-[9px] font-black uppercase tracking-widest" style={{ color: 'var(--primary)' }}>
            Heute solltest du
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
                      className="px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest shrink-0"
                      style={{ background: 'color-mix(in srgb, var(--primary) 8%, transparent)', color: 'var(--primary)' }}
                    >
                      {step.minutes} Min.
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
            className="px-8 py-4 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] shadow-xl hover:scale-105 active:scale-95 transition-all"
            style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
          >
            Jetzt starten →
          </button>
        </div>
      )}

      {/* ── Coach-Hero: Klausurprognose + Top-Empfehlung ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        <div
          className="lg:col-span-1 p-6 lg:p-8 rounded-[24px] lg:rounded-[32px] border shadow-sm flex flex-col items-center justify-center text-center"
          style={{ background: 'var(--card)', borderColor: 'var(--border-color)' }}
        >
          <h3 className="text-[9px] font-black uppercase tracking-widest mb-4" style={{ color: 'var(--mute)' }}>
            Klausurprognose
          </h3>
          {profile.examPrognosis ? (
            <>
              <p className="text-5xl font-black" style={{ color: 'var(--primary)' }}>{profile.examPrognosis.grade}</p>
              <p className="text-[10px] font-bold uppercase mt-2" style={{ color: 'var(--mute)' }}>
                {profile.examPrognosis.passProbability}% Bestehenswahrscheinlichkeit
              </p>
              <button
                onClick={() => setShowPrognosisInfo(v => !v)}
                className="text-[9px] font-black uppercase tracking-widest mt-2 underline decoration-dotted underline-offset-2 transition-opacity hover:opacity-70"
                style={{ color: 'var(--mute)' }}
              >
                Wie wird diese Prognose berechnet?
              </button>
              {showPrognosisInfo && (
                <p className="text-[10px] font-medium mt-2 leading-relaxed text-left" style={{ color: 'var(--mute)' }}>
                  Diese Prognose basiert aktuell auf: {examResults.length} Klausursimulation{examResults.length !== 1 ? 'en' : ''} ·{' '}
                  {quizResults.length} Quiz-Session{quizResults.length !== 1 ? 's' : ''} ·{' '}
                  {recallResults.length} Erklär-Session{recallResults.length !== 1 ? 's' : ''} ·{' '}
                  {learnedCardsCount} gelernte{learnedCardsCount !== 1 ? 'n' : ''} Karteikarte{learnedCardsCount !== 1 ? 'n' : ''}.
                  Gewichtet werden die letzten 5 Klausuren, neuere stärker. Je mehr Lerndaten, desto genauer.
                </p>
              )}
            </>
          ) : (
            <p className="text-[10px] font-bold" style={{ color: 'var(--mute)' }}>
              Noch keine Klausur absolviert — Prognose folgt nach der ersten Simulation.
            </p>
          )}
          <div className="w-full mt-4 pt-3 border-t" style={{ borderColor: 'var(--border-soft)' }}>
            <p className="text-[8px] font-black uppercase tracking-widest mb-1" style={{ color: 'var(--primary)' }}>Dein Coach meint</p>
            <p className="text-[11px] font-medium italic leading-relaxed" style={{ color: 'var(--mute)' }}>{contextMotivation}</p>
          </div>
        </div>

        <div
          className="lg:col-span-2 p-6 lg:p-8 rounded-[24px] lg:rounded-[32px] shadow-sm flex flex-col justify-center"
          style={{ background: 'var(--ink)' }}
        >
          <h3 className="text-[9px] font-black uppercase tracking-widest opacity-50 mb-3" style={{ color: 'var(--bg-main)' }}>
            KI-Coach
          </h3>
          {!hasEnoughForCoach ? (
            <p className="text-sm font-medium leading-relaxed" style={{ color: 'var(--bg-main)', opacity: 0.85 }}>
              Noch nicht genügend Daten vorhanden. Nutze QuizWise weiter, damit dein persönlicher KI-Lerncoach
              fundierte Analysen und Empfehlungen erstellen kann.
            </p>
          ) : !insights ? (
            <>
              <p className="text-sm font-medium mb-4" style={{ color: 'var(--bg-main)', opacity: 0.85 }}>
                Lass die KI dein Lernprofil analysieren: Verbindungen zwischen Themen, eine Prognose und konkrete nächste Schritte.
              </p>
              <button
                onClick={handleRunCoach}
                disabled={isLoading}
                className="self-start px-8 py-4 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] shadow-xl hover:scale-105 active:scale-95 transition-all disabled:opacity-40"
                style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
              >
                {isLoading ? 'Coach analysiert…' : <>Coach starten <EmojiImage emoji="✨" size={13} /></>}
              </button>
            </>
          ) : (
            <div className="space-y-2">
              {insights.synthesis.map((s, i) => (
                <p key={i} className="text-sm font-medium leading-relaxed" style={{ color: 'var(--bg-main)', opacity: 0.9 }}>
                  {s}
                </p>
              ))}
              <button
                onClick={handleRunCoach}
                disabled={isLoading}
                className="text-[9px] font-black uppercase tracking-widest opacity-50 hover:opacity-80 transition-opacity disabled:opacity-30 mt-1"
                style={{ color: 'var(--bg-main)' }}
              >
                {isLoading ? 'Analysiert…' : '↻ Neu analysieren'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Deterministische Panels ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">

        {/* Methodenvergleich */}
        {profile.perMethod.length > 0 && (
          <div className="p-6 lg:p-8 rounded-[24px] lg:rounded-[32px] border shadow-sm space-y-4" style={{ background: 'var(--card)', borderColor: 'var(--border-color)' }}>
            <h3 className="text-[9px] font-black uppercase tracking-widest" style={{ color: 'var(--mute)' }}>Methodenvergleich</h3>
            <div className="space-y-3">
              {profile.perMethod.map(m => (
                <div key={m.method} className="space-y-1">
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs font-black flex items-center gap-1" style={{ color: 'var(--ink)' }}>
                      {METHOD_LABELS[m.method]}
                      {strongestMethod?.method === m.method && <EmojiImage emoji="👑" size={11} />}
                    </span>
                    <span className="flex items-center gap-2">
                      {m.improvementPerSession !== 0 && (
                        <span className="text-[9px] font-black" style={{ color: m.improvementPerSession > 0 ? '#22c55e' : '#f43f5e' }}>
                          {m.improvementPerSession > 0 ? '+' : ''}{m.improvementPerSession}%/Session
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
          <div className="p-6 lg:p-8 rounded-[24px] lg:rounded-[32px] border shadow-sm space-y-4" style={{ background: 'var(--card)', borderColor: 'var(--border-color)' }}>
            <div className="flex items-baseline justify-between">
              <h3 className="text-[9px] font-black uppercase tracking-widest" style={{ color: 'var(--mute)' }}>Learning Score</h3>
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
          <div className="p-6 lg:p-8 rounded-[24px] lg:rounded-[32px] border shadow-sm space-y-4" style={{ background: 'var(--card)', borderColor: 'var(--border-color)' }}>
            <h3 className="text-[9px] font-black uppercase tracking-widest" style={{ color: 'var(--mute)' }}>Themen-Sicherheit</h3>
            <div className="flex flex-wrap gap-2">
              {displayTopics.slice(0, 10).map(t => (
                <button
                  key={t.topic}
                  onClick={() => onAction?.(t.topic, 'quiz')}
                  className="px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all hover:opacity-80"
                  style={{
                    background: `color-mix(in srgb, ${securityColor(t.security)} 10%, var(--bg-sidebar))`,
                    color: securityColor(t.security),
                    border: `1px solid color-mix(in srgb, ${securityColor(t.security)} 25%, transparent)`,
                  }}
                >
                  {t.topic} · {t.security}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Vergessensplan */}
        {profile.forgetting.length > 0 && (
          <div className="p-6 lg:p-8 rounded-[24px] lg:rounded-[32px] border shadow-sm space-y-4" style={{ background: 'var(--card)', borderColor: 'var(--border-color)' }}>
            <h3 className="text-[9px] font-black uppercase tracking-widest" style={{ color: 'var(--mute)' }}>Vergessensplan</h3>
            <div className="space-y-2">
              {profile.forgetting.map(f => (
                <div key={f.topic} className="flex justify-between items-center">
                  <span className="text-xs font-bold" style={{ color: 'var(--ink)' }}>{f.topic}</span>
                  <span className="text-[10px] font-black uppercase" style={{ color: 'var(--primary)' }}>
                    {f.dueInDays <= 0 ? 'Heute wiederholen' : `in ${f.dueInDays} Tag${f.dueInDays !== 1 ? 'en' : ''}`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tageszeit + Lernvolumen */}
        <div className="p-6 lg:p-8 rounded-[24px] lg:rounded-[32px] border shadow-sm space-y-4" style={{ background: 'var(--card)', borderColor: 'var(--border-color)' }}>
          <h3 className="text-[9px] font-black uppercase tracking-widest" style={{ color: 'var(--mute)' }}>Lernrhythmus</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[9px] font-bold uppercase" style={{ color: 'var(--mute)' }}>Beste Tageszeit</p>
              <p className="text-lg font-black" style={{ color: 'var(--ink)' }}>{profile.timeOfDay.bestPart ?? '—'}</p>
            </div>
            <div>
              <p className="text-[9px] font-bold uppercase" style={{ color: 'var(--mute)' }}>Produktivster Tag</p>
              <p className="text-lg font-black" style={{ color: 'var(--ink)' }}>{profile.dayOfWeek.bestDay ?? '—'}</p>
            </div>
            <div>
              <p className="text-[9px] font-bold uppercase" style={{ color: 'var(--mute)' }}>Streak</p>
              <p className="text-lg font-black" style={{ color: 'var(--ink)' }}>{profile.volume.streakCurrent} Tage</p>
              <p className="text-[9px] font-medium" style={{ color: 'var(--mute)' }}>Rekord: {profile.volume.streakBest} Tage</p>
            </div>
            <div>
              <p className="text-[9px] font-bold uppercase" style={{ color: 'var(--mute)' }}>Sessions/Woche</p>
              <p className="text-lg font-black" style={{ color: 'var(--ink)' }}>{profile.volume.sessionsPerWeek}</p>
            </div>
            <div>
              <p className="text-[9px] font-bold uppercase" style={{ color: 'var(--mute)' }}>Sessions gesamt</p>
              <p className="text-lg font-black" style={{ color: 'var(--ink)' }}>{profile.volume.totalSessions}</p>
            </div>
          </div>
        </div>

        {/* Wissensprofil — Kategorien + Fragetypen vereint */}
        {wissensprofilItems.length > 0 && (
          <div className="p-6 lg:p-8 rounded-[24px] lg:rounded-[32px] border shadow-sm space-y-4" style={{ background: 'var(--card)', borderColor: 'var(--border-color)' }}>
            <h3 className="text-[9px] font-black uppercase tracking-widest" style={{ color: 'var(--mute)' }}>Wissensprofil</h3>
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
          <div className="p-6 lg:p-8 rounded-[24px] lg:rounded-[32px] border shadow-sm space-y-4" style={{ background: 'var(--card)', borderColor: 'var(--border-color)' }}>
            <h3 className="text-[9px] font-black uppercase tracking-widest" style={{ color: 'var(--mute)' }}>Warum verlierst du Punkte?</h3>
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
          <div className="p-6 lg:p-8 rounded-[24px] lg:rounded-[32px] border shadow-sm space-y-4" style={{ background: 'var(--card)', borderColor: 'var(--border-color)' }}>
            <h3 className="text-[9px] font-black uppercase tracking-widest" style={{ color: 'var(--mute)' }}>Deine Entwicklung seit Beginn</h3>
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
            <EmojiImage emoji="🔒" size={11} /> Bald verfügbar
          </p>
          {lockedPanels.map(l => (
            <p key={l.label} className="text-[11px] font-medium" style={{ color: 'var(--mute)' }}>
              <strong style={{ color: 'var(--ink2)' }}>{l.label}:</strong> {l.reason}
            </p>
          ))}
        </div>
      )}

      {/* ── KI-Coach-Ergebnis (Verbindungen, Prognose, Empfehlungen) ── */}
      {insights && (
        <div className="space-y-6">
          {insights.connections.length > 0 && (
            <div className="p-6 lg:p-8 rounded-[24px] lg:rounded-[32px] border shadow-sm space-y-3" style={{ background: 'var(--card)', borderColor: 'var(--border-color)' }}>
              <h3 className="text-[9px] font-black uppercase tracking-widest" style={{ color: 'var(--mute)' }}>Verbindungen erkannt</h3>
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
              <h3 className="text-lg font-black" style={{ color: 'var(--ink)' }}>Empfehlungen</h3>
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
                    <p className="text-[8px] font-black uppercase tracking-widest mb-1" style={{ color: priorityColor(r.priority) }}>
                      {priorityEmoji(r.priority)} {r.priority}
                    </p>
                    <p className="text-sm font-black mb-1" style={{ color: 'var(--ink)' }}>{r.action}</p>
                    <p className="text-[11px] font-medium mb-2" style={{ color: 'var(--mute)' }}>
                      <strong style={{ color: 'var(--ink2)' }}>Grund:</strong> {r.reasoning}
                    </p>
                    <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--primary)' }}>
                      ➡ {TAB_ACTION_LABELS[r.tab] || 'Starten'}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Bestehende Verlaufs-/Fehleranalyse (unverändert, ohne eigenen Header) ── */}
      <div className="pt-8 border-t" style={{ borderColor: 'var(--border-color)' }}>
        <GapRadar metrics={metrics} onNavigate={onNavigate} onAction={onAction} hideHeader />
      </div>
    </div>
  );
};
