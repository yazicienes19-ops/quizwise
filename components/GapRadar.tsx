
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { TopicMetric, LearningAnalysis, ActiveTab } from '../types';
import { EmojiImage } from './EmojiImage';
import { analyzeLearningProgress, WrongAnswerContext } from '../services/geminiService';
import { buildRealTopicMastery } from '../services/learningProfileService';
import { getAllResults } from '../services/quizHistoryService';
import { getAllRecallResults } from '../services/recallHistoryService';
import { getAllExamResults } from '../services/examHistoryService';
import { toast } from '../services/toast';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer,
} from 'recharts';

// ─── Types ────────────────────────────────────────────────────────────────────

type LearnMode = 'all' | 'anki' | 'feynman' | 'quiz' | 'exam';

const MODE_LABELS: Record<LearnMode, string> = {
  all: 'Alle',
  anki: 'Anki',
  feynman: 'Feynman',
  quiz: 'Quiz',
  exam: 'Klausur',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const scoreColor = (s: number) => s >= 70 ? '#22c55e' : s >= 50 ? '#f59e0b' : '#f43f5e';
const scoreBg = (s: number) =>
  s >= 70 ? 'color-mix(in srgb, #22c55e 12%, transparent)' :
  s >= 50 ? 'color-mix(in srgb, #f59e0b 12%, transparent)' :
  'color-mix(in srgb, #f43f5e 12%, transparent)';

const confidenceLabel = (v: number) => {
  if (v >= 85) return 'Meister-Niveau';
  if (v >= 70) return 'Experte';
  if (v >= 50) return 'Fortgeschritten';
  if (v >= 30) return 'Lernender';
  return 'Anfänger';
};

const fmtDate = (ts: number) =>
  new Date(ts).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });

const fmtDateShort = (ts: number) =>
  new Date(ts).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' });

// ─── Recharts Progress Chart ───────────────────────────────────────────────────

interface ChartDataPoint {
  ts: number;
  quiz?: number;
  feynman?: number;
  exam?: number;
}

// Tooltip: erscheint beim Hover über einen Datenpunkt
const ChartTooltip: React.FC<{ active?: boolean; payload?: any[]; label?: number }> = ({
  active, payload, label,
}) => {
  if (!active || !payload?.length || !label) return null;
  return (
    <div style={{
      background: 'var(--card)',
      border: '1px solid var(--border-color)',
      borderRadius: 14,
      padding: '10px 14px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
      minWidth: 170,
    }}>
      <p style={{
        color: 'var(--mute)', fontSize: 9, fontWeight: 800,
        textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8,
      }}>
        {fmtDate(label)}
      </p>
      {payload.map((entry: any) => (
        <div key={entry.dataKey} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: entry.color, flexShrink: 0 }} />
          <span style={{ color: 'var(--ink)', fontSize: 12, fontWeight: 700 }}>{entry.name}</span>
          <span style={{ color: entry.color, fontSize: 13, fontWeight: 900, marginLeft: 'auto', paddingLeft: 8 }}>
            {entry.value}%
          </span>
        </div>
      ))}
    </div>
  );
};

// Hauptchart: mergt alle 3 Zeitreihen in ein Array für Recharts
const ProgressChart: React.FC<{
  quizPts: { ts: number; score: number }[];
  feynmanPts: { ts: number; score: number }[];
  examPts: { ts: number; score: number }[];
  ankiAvg: number | null;
  showAnki: boolean;
  selectedMode: LearnMode;
}> = ({ quizPts, feynmanPts, examPts, ankiAvg, showAnki, selectedMode }) => {
  // Alle Zeitreihenpunkte in ein einziges Array mergen (Recharts braucht das)
  const data = useMemo((): ChartDataPoint[] => {
    const map = new Map<number, ChartDataPoint>();
    const add = (pts: { ts: number; score: number }[], key: keyof Omit<ChartDataPoint, 'ts'>) =>
      pts.forEach(p => map.set(p.ts, { ...(map.get(p.ts) || { ts: p.ts }), [key]: p.score }));
    add(quizPts, 'quiz');
    add(feynmanPts, 'feynman');
    add(examPts, 'exam');
    return [...map.values()].sort((a, b) => a.ts - b.ts);
  }, [quizPts, feynmanPts, examPts]);

  const hasTimeSeries = data.length > 0;
  const showAnkiRef = showAnki && ankiAvg !== null;

  // Nur Anki-Modus ohne Zeitverlauf → einfache Zahl-Anzeige
  if (!hasTimeSeries && showAnkiRef) {
    return (
      <div style={{
        height: 200, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg-sidebar)', borderRadius: 16,
        border: '1px solid var(--border-color)',
      }}>
        <p style={{ fontSize: 36, fontWeight: 900, color: 'var(--primary)' }}>{ankiAvg}%</p>
        <p style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--mute)', marginTop: 4 }}>
          Anki Ø · Kein Zeitverlauf verfügbar
        </p>
      </div>
    );
  }

  if (!hasTimeSeries) return null;

  return (
    <div style={{
      background: 'var(--bg-sidebar)', borderRadius: 16,
      border: '1px solid var(--border-color)', padding: '16px 8px 8px 0',
    }}>
      <ResponsiveContainer width="100%" height={210}>
        <LineChart data={data} margin={{ top: 4, right: 36, bottom: 4, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
          <XAxis
            dataKey="ts"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            tickFormatter={(ts: number) => fmtDateShort(ts)}
            tick={{ fontSize: 9, fontWeight: 700, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
            tickCount={5}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 9, fontWeight: 700, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => `${v}%`}
          />
          <Tooltip
            content={<ChartTooltip />}
            cursor={{ stroke: 'var(--border-color)', strokeWidth: 1 }}
          />

          {/* Anki als gestrichelte Referenzlinie (kein Zeitverlauf → horizontale Linie) */}
          {showAnkiRef && (
            <ReferenceLine
              y={ankiAvg!}
              stroke="var(--primary)"
              strokeDasharray="5 3"
              strokeWidth={1.5}
              strokeOpacity={0.7}
              label={{
                value: `Anki Ø ${ankiAvg}%`,
                position: 'insideTopRight',
                fontSize: 8, fontWeight: 800,
                fill: 'var(--primary)', opacity: 0.8,
              }}
            />
          )}

          {/* Quiz-Linie (amber) */}
          {(selectedMode === 'all' || selectedMode === 'quiz') && quizPts.length > 0 && (
            <Line type="monotone" dataKey="quiz" name="Quiz" stroke="#f59e0b" strokeWidth={2.5}
              dot={{ r: 3.5, fill: '#f59e0b', stroke: 'white', strokeWidth: 1.5 }}
              activeDot={{ r: 6, fill: '#f59e0b', stroke: 'white', strokeWidth: 2 }}
              connectNulls={false}
            />
          )}

          {/* Feynman-Linie (grün) */}
          {(selectedMode === 'all' || selectedMode === 'feynman') && feynmanPts.length > 0 && (
            <Line type="monotone" dataKey="feynman" name="Feynman" stroke="#22c55e" strokeWidth={2.5}
              dot={{ r: 3.5, fill: '#22c55e', stroke: 'white', strokeWidth: 1.5 }}
              activeDot={{ r: 6, fill: '#22c55e', stroke: 'white', strokeWidth: 2 }}
              connectNulls={false}
            />
          )}

          {/* Klausur-Linie (rot) */}
          {(selectedMode === 'all' || selectedMode === 'exam') && examPts.length > 0 && (
            <Line type="monotone" dataKey="exam" name="Klausur" stroke="#f43f5e" strokeWidth={2.5}
              dot={{ r: 3.5, fill: '#f43f5e', stroke: 'white', strokeWidth: 1.5 }}
              activeDot={{ r: 6, fill: '#f43f5e', stroke: 'white', strokeWidth: 2 }}
              connectNulls={false}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

const LegendDot: React.FC<{ color: string; label: string }> = ({ color, label }) => (
  <div className="flex items-center gap-1.5">
    <div className="w-6 h-[3px] rounded-full" style={{ background: color }} />
    <span className="text-[9px] font-black uppercase" style={{ color: 'var(--mute)' }}>{label}</span>
  </div>
);

// ─── Main Component ────────────────────────────────────────────────────────────

/** Routing der KI-Fehleranalyse-Empfehlung auf die passende Lernaktion. */
const ERROR_ACTION_TARGET: Record<string, { mode?: 'quiz' | 'cards' | 'recall'; tab: ActiveTab }> = {
  'kurze Erklärung':                     { tab: ActiveTab.EXPLAINER },
  '3 gezielte Übungsfragen':             { mode: 'quiz', tab: ActiveTab.QUIZ },
  'Erstellung von Karteikarten':         { mode: 'cards', tab: ActiveTab.CARDS },
  'Start einer geführten Study-Session': { mode: 'recall', tab: ActiveTab.RECALL },
};

interface GapRadarProps {
  metrics: TopicMetric[];
  onNavigate: (tab: ActiveTab) => void;
  onAction?: (topic: string, mode: 'cards' | 'recall' | 'quiz') => void;
  /** Header ausblenden, wenn GapRadar unterhalb eines eigenen Titels eingebettet wird (z.B. LearningCoach). */
  hideHeader?: boolean;
}

export const GapRadar: React.FC<GapRadarProps> = ({ metrics, onNavigate, onAction, hideHeader }) => {
  const [selectedMode, setSelectedMode] = useState<LearnMode>('all');
  const [selectedDoc, setSelectedDoc] = useState('');
  const [analysis, setAnalysis] = useState<LearningAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [openTopic, setOpenTopic] = useState<string | null>(null);
  const weakTopicsRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!openTopic) return;
    const handler = (e: MouseEvent) => {
      if (weakTopicsRef.current && !weakTopicsRef.current.contains(e.target as Node)) {
        setOpenTopic(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openTopic]);

  // ── Raw data ────────────────────────────────────────────────────────────────
  const allQuiz   = useMemo(() => getAllResults(), []);
  const allRecall = useMemo(() => getAllRecallResults(), []);
  const allExam   = useMemo(() => getAllExamResults(), []);

  // ── All unique doc names ────────────────────────────────────────────────────
  const allDocNames = useMemo(() => {
    const names = new Set<string>();
    allQuiz.forEach(r => names.add(r.docName));
    allRecall.forEach(r => names.add(r.docName));
    allExam.forEach(r => names.add(r.docName));
    return [...names].sort();
  }, [allQuiz, allRecall, allExam]);

  // ── Filtered data ───────────────────────────────────────────────────────────
  const filteredQuiz = useMemo(() =>
    allQuiz.filter(r => !selectedDoc || r.docName === selectedDoc),
  [allQuiz, selectedDoc]);

  const filteredRecall = useMemo(() =>
    allRecall.filter(r => !selectedDoc || r.docName === selectedDoc),
  [allRecall, selectedDoc]);

  const filteredExam = useMemo(() =>
    allExam.filter(r => !selectedDoc || r.docName === selectedDoc),
  [allExam, selectedDoc]);

  // Anki metrics are not filtered by doc (no docId link available)
  const filteredMetrics = useMemo(() => metrics, [metrics]);

  // ── Global trend ────────────────────────────────────────────────────────────
  const trend = useMemo((): 'up' | 'down' | 'stable' => {
    const scores = filteredQuiz.map(r => r.score);
    if (scores.length < 4) return 'stable';
    const last = scores.slice(0, 3);
    const prev = scores.slice(3, 6);
    const lastAvg = last.reduce((s, v) => s + v, 0) / last.length;
    const prevAvg = prev.reduce((s, v) => s + v, 0) / prev.length;
    if (lastAvg >= prevAvg + 5) return 'up';
    if (lastAvg <= prevAvg - 5) return 'down';
    return 'stable';
  }, [filteredQuiz]);

  // ── Omnivore overall score ───────────────────────────────────────────────────
  const overallScore = useMemo((): number | null => {
    const values: number[] = [];
    if (selectedMode === 'all' || selectedMode === 'anki') {
      if (filteredMetrics.length > 0) {
        values.push(filteredMetrics.reduce((s, m) => s + m.confidence, 0) / filteredMetrics.length);
      }
    }
    if (selectedMode === 'all' || selectedMode === 'quiz') {
      if (filteredQuiz.length > 0) {
        values.push(filteredQuiz.reduce((s, r) => s + r.score, 0) / filteredQuiz.length);
      }
    }
    if (selectedMode === 'all' || selectedMode === 'feynman') {
      if (filteredRecall.length > 0) {
        values.push(filteredRecall.reduce((s, r) => s + r.score, 0) / filteredRecall.length);
      }
    }
    if (selectedMode === 'all' || selectedMode === 'exam') {
      if (filteredExam.length > 0) {
        values.push(filteredExam.reduce((s, r) => s + r.score, 0) / filteredExam.length);
      }
    }
    return values.length > 0
      ? Math.round(values.reduce((s, v) => s + v, 0) / values.length)
      : null;
  }, [selectedMode, filteredMetrics, filteredQuiz, filteredRecall, filteredExam]);

  const ankiAvg = useMemo(() =>
    filteredMetrics.length > 0
      ? Math.round(filteredMetrics.reduce((s, m) => s + m.confidence, 0) / filteredMetrics.length)
      : null,
  [filteredMetrics]);

  // Echte KI-Subthemen (respektiert den Dokument-Filter automatisch)
  const realTopics = useMemo(
    () => buildRealTopicMastery(filteredQuiz, filteredExam, filteredRecall),
    [filteredQuiz, filteredExam, filteredRecall],
  );

  // ── Biggest gap (priority: failed exam > schwächstes echtes Thema > low anki > quiz weakTopic) ───
  const biggestGap = useMemo((): {
    topic: string; score: number; action: 'exam' | 'anki' | 'quiz';
  } | null => {
    if (selectedMode === 'all' || selectedMode === 'exam') {
      const failed = [...filteredExam].sort((a, b) => a.score - b.score).filter(r => !r.passed);
      if (failed.length > 0) {
        // Echtes Thema der Klausur statt Dokumentname (Fallback bleibt)
        return { topic: failed[0].weakTopics?.[0] ?? failed[0].docName, score: failed[0].score, action: 'exam' };
      }
    }
    // Schwächstes echtes Thema aus der Quiz-/Recall-History
    const weakestReal = realTopics.find(t => t.security !== 'sicher');
    if (weakestReal && (selectedMode === 'all' || selectedMode === 'quiz')) {
      return { topic: weakestReal.topic, score: weakestReal.confidence, action: 'quiz' };
    }
    if (selectedMode === 'all' || selectedMode === 'anki') {
      const sorted = [...filteredMetrics].sort((a, b) => a.confidence - b.confidence);
      if (sorted.length > 0 && sorted[0].confidence < 70) {
        return { topic: sorted[0].topic, score: sorted[0].confidence, action: 'anki' };
      }
    }
    if (selectedMode === 'all' || selectedMode === 'quiz') {
      const counts: Record<string, number> = {};
      filteredQuiz.slice(0, 10).forEach(r =>
        r.weakTopics.forEach(t => { counts[t] = (counts[t] || 0) + 1; })
      );
      const entries = Object.entries(counts).sort(([, a], [, b]) => b - a);
      if (entries.length > 0) {
        const last = filteredQuiz.find(r => r.weakTopics.includes(entries[0][0]));
        return { topic: entries[0][0], score: last?.score ?? 0, action: 'quiz' };
      }
    }
    if (selectedMode === 'all' || selectedMode === 'feynman') {
      const weak = [...filteredRecall].filter(r => r.score < 70).sort((a, b) => a.score - b.score);
      if (weak.length > 0) {
        return { topic: weak[0].topic || weak[0].docName, score: weak[0].score, action: 'quiz' };
      }
    }
    return null;
  }, [selectedMode, filteredExam, filteredMetrics, filteredQuiz, filteredRecall, realTopics]);

  // ── Today learn: priority order ──────────────────────────────────────────────
  const todayLearn = useMemo(() => {
    const items: { topic: string; mode: string; score: number }[] = [];
    const now = Date.now();

    if (selectedMode === 'all' || selectedMode === 'exam') {
      filteredExam.filter(r => r.score < 70).slice(0, 2).forEach(r =>
        items.push({ topic: r.docName, mode: 'Klausur', score: r.score })
      );
    }
    if (selectedMode === 'all' || selectedMode === 'anki') {
      [...filteredMetrics]
        .filter(m => m.confidence < 70 || now - m.lastReviewed > 3 * 86400000)
        .sort((a, b) => a.confidence - b.confidence)
        .slice(0, 3)
        .forEach(m => items.push({ topic: m.topic, mode: 'Anki', score: m.confidence }));
    }
    if (selectedMode === 'all' || selectedMode === 'feynman') {
      filteredRecall.filter(r => r.score < 70).slice(0, 1).forEach(r =>
        items.push({ topic: r.topic || r.docName, mode: 'Feynman', score: r.score })
      );
    }

    return items.slice(0, 3);
  }, [selectedMode, filteredExam, filteredMetrics, filteredRecall]);

  // ── Next session recommendation ──────────────────────────────────────────────
  const recommendation = useMemo(() => {
    if (!biggestGap) {
      return { text: 'Gute Performance! Starte ein Quiz zum Auffrischen.', tab: ActiveTab.QUIZ };
    }
    if (biggestGap.action === 'exam') {
      return {
        text: `Klausur zu „${biggestGap.topic}" wiederholen — Simulation starten.`,
        tab: ActiveTab.EXAM,
      };
    }
    if (biggestGap.action === 'anki') {
      return {
        text: `Anki-Deck zu „${biggestGap.topic}" abfragen (Confidence: ${biggestGap.score}%).`,
        tab: ActiveTab.CARDS,
      };
    }
    return {
      text: `Quiz zu „${biggestGap.topic}" starten — schwache Themen gezielt üben.`,
      tab: ActiveTab.QUIZ,
    };
  }, [biggestGap]);

  // ── Aggregated weak topics ────────────────────────────────────────────────────
  const weakTopics = useMemo(() => {
    const counts: Record<string, number> = {};
    if (selectedMode === 'all' || selectedMode === 'quiz') {
      filteredQuiz.slice(0, 10).forEach(r =>
        r.weakTopics.forEach(t => { counts[t] = (counts[t] || 0) + 1; })
      );
    }
    if (selectedMode === 'all' || selectedMode === 'exam') {
      filteredExam.filter(r => !r.passed).forEach(r => {
        // Echte Themen der Klausur zählen; Dokumentname nur wenn keine erkannt wurden
        const topics = r.weakTopics?.length ? r.weakTopics : [r.docName];
        topics.forEach(t => { counts[t] = (counts[t] || 0) + 1; });
      });
    }
    if (selectedMode === 'all' || selectedMode === 'feynman') {
      filteredRecall.filter(r => r.score < 70).forEach(r => {
        const key = r.topic || r.docName;
        counts[key] = (counts[key] || 0) + 1;
      });
    }
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([topic, count]) => ({ topic, count }));
  }, [selectedMode, filteredQuiz, filteredExam, filteredRecall]);

  // ── Combined history for history list ────────────────────────────────────────
  const combinedHistory = useMemo(() => {
    type Entry = { id: string; docName: string; timestamp: number; score: number; mode: string; detail: string };
    const entries: Entry[] = [];

    if (selectedMode === 'all' || selectedMode === 'quiz') {
      filteredQuiz.slice(0, 8).forEach(r =>
        entries.push({
          id: r.id, docName: r.docName, timestamp: r.timestamp,
          score: r.score, mode: 'Quiz', detail: `${r.correctCount}/${r.totalCount} richtig`,
        })
      );
    }
    if (selectedMode === 'all' || selectedMode === 'feynman') {
      filteredRecall.slice(0, 4).forEach(r =>
        entries.push({
          id: r.id, docName: r.topic || r.docName, timestamp: r.timestamp,
          score: r.score, mode: 'Feynman', detail: r.docName,
        })
      );
    }
    if (selectedMode === 'all' || selectedMode === 'exam') {
      filteredExam.slice(0, 4).forEach(r =>
        entries.push({
          id: r.id, docName: r.docName, timestamp: r.timestamp,
          score: r.score, mode: 'Klausur', detail: r.passed ? '✓ Bestanden' : '✗ Nicht bestanden',
        })
      );
    }

    return entries.sort((a, b) => b.timestamp - a.timestamp).slice(0, 8);
  }, [selectedMode, filteredQuiz, filteredRecall, filteredExam]);

  // ── Chart data (separate Arrays pro Modus für ProgressChart) ─────────────────
  const chartQuizPts = useMemo(() =>
    (selectedMode === 'all' || selectedMode === 'quiz')
      ? [...filteredQuiz].sort((a, b) => a.timestamp - b.timestamp).slice(-20)
          .map(r => ({ ts: r.timestamp, score: r.score }))
      : [],
  [selectedMode, filteredQuiz]);

  const chartFeynmanPts = useMemo(() =>
    (selectedMode === 'all' || selectedMode === 'feynman')
      ? [...filteredRecall].sort((a, b) => a.timestamp - b.timestamp).slice(-20)
          .map(r => ({ ts: r.timestamp, score: r.score }))
      : [],
  [selectedMode, filteredRecall]);

  const chartExamPts = useMemo(() =>
    (selectedMode === 'all' || selectedMode === 'exam')
      ? [...filteredExam].sort((a, b) => a.timestamp - b.timestamp).slice(-20)
          .map(r => ({ ts: r.timestamp, score: r.score }))
      : [],
  [selectedMode, filteredExam]);

  const hasChartData = chartQuizPts.length > 0 || chartFeynmanPts.length > 0 || chartExamPts.length > 0;

  // ── AI analysis context ──────────────────────────────────────────────────────
  const wrongAnswersCtx = useMemo((): WrongAnswerContext[] =>
    allQuiz.slice(0, 5).flatMap(result =>
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
  [allQuiz]);

  const hasAnyData = overallScore !== null || combinedHistory.length > 0;

  const handleRunAnalysis = async () => {
    if (!hasAnyData) return;
    setIsAnalyzing(true);
    try {
      setAnalysis(await analyzeLearningProgress(metrics, wrongAnswersCtx));
    } catch (e: any) {
      toast.error(`Analyse fehlgeschlagen: ${e?.message || 'Unbekannter Fehler'}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // ── Empty state ──────────────────────────────────────────────────────────────
  if (!hasAnyData && metrics.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32 space-y-6 opacity-30">
        <EmojiImage emoji="📊" size={64} />
        <div className="text-center space-y-2">
          <p className="font-black text-slate-400 uppercase text-xs tracking-widest">Noch keine Daten</p>
          <p className="text-sm text-slate-500 max-w-xs mx-auto">
            Absolviere ein Quiz, eine Klausur oder eine Feynman-Runde, um die Analyse zu starten.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10 lg:space-y-12 animate-in fade-in duration-700 pb-20">

      {/* ── Header ── */}
      {!hideHeader && (
        <div className="text-center space-y-3">
          <h1 className="text-4xl lg:text-7xl font-black text-slate-900 dark:text-white tracking-tighter">
            Lern <span className="text-indigo-600">Radar</span> <EmojiImage emoji="📡" size={36} />
          </h1>
          <p className="text-base text-slate-500 dark:text-slate-400 font-medium opacity-80">
            Alle Lernmodi auf einen Blick — Quiz, Anki, Feynman & Klausur.
          </p>
        </div>
      )}

      {/* ── Filter Bar ── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Mode pills */}
        <div
          className="flex gap-1 p-1 rounded-xl"
          style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}
        >
          {(Object.keys(MODE_LABELS) as LearnMode[]).map(m => (
            <button
              key={m}
              onClick={() => setSelectedMode(m)}
              className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all"
              style={
                selectedMode === m
                  ? { background: 'var(--primary)', color: 'var(--primary-text)' }
                  : { color: 'var(--ink2)' }
              }
            >
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>

        {/* Doc selector */}
        {allDocNames.length > 0 && (
          <select
            value={selectedDoc}
            onChange={e => setSelectedDoc(e.target.value)}
            className="px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border"
            style={{
              background: 'var(--bg-sidebar)',
              borderColor: 'var(--border-color)',
              color: 'var(--ink)',
            }}
          >
            <option value="">Alle Dokumente</option>
            {allDocNames.map(n => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        )}

        {(selectedDoc || selectedMode !== 'all') && (
          <button
            onClick={() => { setSelectedDoc(''); setSelectedMode('all'); }}
            className="text-[10px] font-black uppercase tracking-wider text-rose-500 hover:text-rose-700 transition-colors"
          >
            Filter zurücksetzen ✕
          </button>
        )}
      </div>

      {/* ── Bento Grid ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">

        {/* Kachel 1: Gesamtfortschritt */}
        <div
          className="bg-white dark:bg-slate-900 p-5 lg:p-8 rounded-[24px] lg:rounded-[32px] border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col"
          style={{ background: 'var(--card)' }}
        >
          <h3 className="text-[9px] font-black uppercase tracking-widest mb-4" style={{ color: 'var(--mute)' }}>
            Gesamtfortschritt
          </h3>
          {overallScore !== null ? (
            <>
              <div className="relative w-20 h-20 lg:w-24 lg:h-24 mx-auto mb-3">
                <svg className="w-full h-full -rotate-90">
                  <circle cx="50%" cy="50%" r="38%" stroke="currentColor" strokeWidth="8" fill="transparent"
                    className="text-slate-100 dark:text-slate-800" />
                  <circle cx="50%" cy="50%" r="38%" stroke="currentColor" strokeWidth="8" fill="transparent"
                    strokeDasharray={251.2}
                    strokeDashoffset={251.2 - (251.2 * overallScore) / 100}
                    style={{ stroke: scoreColor(overallScore), transition: 'stroke-dashoffset 1s ease' }}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center font-black text-xl dark:text-white"
                  style={{ color: 'var(--ink)' }}>
                  {overallScore}%
                </div>
              </div>
              <p className="text-[9px] text-center font-bold uppercase" style={{ color: 'var(--mute)' }}>
                {confidenceLabel(overallScore)}
              </p>
              <div className="mt-2 flex justify-center">
                {trend === 'up'     && <span className="text-[9px] font-black text-emerald-500">↑ Verbesserung</span>}
                {trend === 'down'   && <span className="text-[9px] font-black text-rose-500">↓ Rückgang</span>}
                {trend === 'stable' && <span className="text-[9px] font-black" style={{ color: 'var(--mute)' }}>→ Stabil</span>}
              </div>
            </>
          ) : (
            <p className="text-[10px] font-bold mt-4" style={{ color: 'var(--mute)' }}>Noch keine Daten</p>
          )}
        </div>

        {/* Kachel 2: Größte Lücke */}
        <div
          className="p-5 lg:p-8 rounded-[24px] lg:rounded-[32px] border border-l-4 border-l-rose-500 border-slate-200 dark:border-slate-800 shadow-sm"
          style={{ background: 'var(--card)' }}
        >
          <h3 className="text-[9px] font-black uppercase tracking-widest text-rose-500 mb-3">Größte Lücke</h3>
          {biggestGap ? (
            <>
              <p className="text-sm lg:text-lg font-black leading-tight mb-1" style={{ color: 'var(--ink)' }}>
                {biggestGap.topic}
              </p>
              <p className="text-[10px] font-bold uppercase" style={{ color: 'var(--mute)' }}>
                {biggestGap.score}% Score
              </p>
              <button
                onClick={() => {
                  const tabMap = { exam: ActiveTab.EXAM, anki: ActiveTab.CARDS, quiz: ActiveTab.QUIZ };
                  onNavigate(tabMap[biggestGap.action]);
                }}
                className="mt-4 w-full py-2.5 rounded-xl text-[8px] font-black uppercase tracking-widest transition-all hover:opacity-80"
                style={{ background: 'color-mix(in srgb, #f43f5e 12%, var(--bg-sidebar))', color: '#f43f5e', border: '1px solid color-mix(in srgb, #f43f5e 25%, transparent)' }}
              >
                {biggestGap.action === 'exam' ? 'Klausur starten →' :
                 biggestGap.action === 'anki' ? 'Anki-Deck lernen →' : 'Quiz starten →'}
              </button>
            </>
          ) : (
            <p className="text-[10px] font-bold mt-3 text-emerald-500">Keine kritischen Lücken! ✓</p>
          )}
        </div>

        {/* Kachel 3: Heute lernen */}
        <div
          className="p-5 lg:p-8 rounded-[24px] lg:rounded-[32px] border border-slate-200 dark:border-slate-800 shadow-sm"
          style={{ background: 'var(--card)' }}
        >
          <h3 className="text-[9px] font-black uppercase tracking-widest mb-3" style={{ color: 'var(--primary)' }}>
            Heute lernen
          </h3>
          <div className="space-y-2">
            {todayLearn.length > 0 ? (
              todayLearn.map((item, i) => (
                <div key={i} className="flex justify-between items-center">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black truncate pr-1" style={{ color: 'var(--ink)' }}>
                      {item.topic}
                    </p>
                    <p className="text-[8px] uppercase font-bold" style={{ color: 'var(--mute)' }}>
                      {item.mode}
                    </p>
                  </div>
                  <span className="text-xs font-black shrink-0" style={{ color: scoreColor(item.score) }}>
                    {item.score}%
                  </span>
                </div>
              ))
            ) : (
              <p className="text-[10px] font-bold text-emerald-500">Alles im grünen Bereich ✓</p>
            )}
          </div>
        </div>

        {/* Kachel 4: Nächste Session */}
        <div
          className="p-5 lg:p-8 rounded-[24px] lg:rounded-[32px] shadow-sm text-white flex flex-col justify-between"
          style={{ background: 'var(--primary)' }}
        >
          <h3 className="text-[9px] font-black uppercase tracking-widest opacity-60 mb-3">
            Nächste Session
          </h3>
          <p className="text-[11px] font-bold leading-snug mb-4" style={{ color: 'var(--primary-text)' }}>
            {recommendation.text}
          </p>
          <button
            onClick={() => onNavigate(recommendation.tab)}
            className="w-full py-2.5 rounded-xl text-[8px] font-black uppercase tracking-widest transition-all hover:opacity-80 active:scale-95"
            style={{ background: 'rgba(255,255,255,0.2)', color: 'var(--primary-text)' }}
          >
            Jetzt starten →
          </button>
        </div>
      </div>

      {/* ── Progress Chart ── */}
      {(hasChartData || (ankiAvg !== null && (selectedMode === 'all' || selectedMode === 'anki'))) && (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-black" style={{ color: 'var(--ink)' }}>Verlauf</h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--mute)' }}>
              Hover über einen Punkt für Details · Score-Entwicklung über Zeit.
            </p>
          </div>

          {/* Legende */}
          <div className="flex flex-wrap items-center gap-4">
            {chartQuizPts.length > 0    && <LegendDot color="#f59e0b" label="Quiz" />}
            {chartFeynmanPts.length > 0 && <LegendDot color="#22c55e" label="Feynman" />}
            {chartExamPts.length > 0    && <LegendDot color="#f43f5e" label="Klausur" />}
            {ankiAvg !== null && (selectedMode === 'all' || selectedMode === 'anki') && (
              <div className="flex items-center gap-1.5">
                <svg width="24" height="4"><line x1="0" y1="2" x2="24" y2="2" stroke="var(--primary)" strokeWidth="2" strokeDasharray="5,3" /></svg>
                <span className="text-[9px] font-black uppercase" style={{ color: 'var(--mute)' }}>Anki Ø</span>
              </div>
            )}
          </div>

          <ProgressChart
            quizPts={chartQuizPts}
            feynmanPts={chartFeynmanPts}
            examPts={chartExamPts}
            ankiAvg={ankiAvg}
            showAnki={selectedMode === 'all' || selectedMode === 'anki'}
            selectedMode={selectedMode}
          />
        </div>
      )}

      {/* ── Weak Topics with dropdown ── */}
      {weakTopics.length > 0 && (
        <div className="space-y-4" ref={weakTopicsRef}>
          <div>
            <h3 className="text-lg font-black" style={{ color: 'var(--ink)' }}>Häufige Schwachstellen</h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--mute)' }}>
              Klick auf ein Thema, um direkt eine Lern-Aktion zu starten.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {weakTopics.map(({ topic, count }) => (
              <div key={topic} className="relative">
                <button
                  onClick={() => setOpenTopic(openTopic === topic ? null : topic)}
                  className="px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all hover:opacity-80"
                  style={{
                    background: 'color-mix(in srgb, #f43f5e 10%, var(--bg-sidebar))',
                    color: '#f43f5e',
                    border: '1px solid color-mix(in srgb, #f43f5e 22%, transparent)',
                  }}
                >
                  {topic} · {count}×
                  <span className="ml-1 opacity-50">{openTopic === topic ? '▲' : '▼'}</span>
                </button>

                {/* Dropdown */}
                {openTopic === topic && (
                  <div
                    className="absolute top-full left-0 mt-1.5 rounded-2xl overflow-hidden shadow-xl z-50 min-w-[200px]"
                    style={{
                      background: 'var(--card)',
                      border: '1px solid var(--border-color)',
                    }}
                  >
                    <p className="px-4 pt-3 pb-1 text-[8px] font-black uppercase tracking-widest" style={{ color: 'var(--mute)' }}>
                      {topic}
                    </p>
                    {[
                      { label: 'Anki-Karten abfragen', mode: 'cards' as const, icon: '🃏' },
                      { label: 'Feynman-Erklärung', mode: 'recall' as const, icon: '🧠' },
                      { label: 'Schnelles Quiz', mode: 'quiz' as const, icon: '⚡' },
                    ].map(({ label, mode, icon }) => (
                      <button
                        key={mode}
                        onClick={() => {
                          setOpenTopic(null);
                          if (onAction) {
                            onAction(topic, mode);
                          } else {
                            const tabMap = { cards: ActiveTab.CARDS, recall: ActiveTab.RECALL, quiz: ActiveTab.QUIZ };
                            onNavigate(tabMap[mode]);
                          }
                        }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left text-[11px] font-bold transition-all hover:opacity-80"
                        style={{
                          color: 'var(--ink)',
                          borderTop: '1px solid var(--border-soft)',
                        }}
                      >
                        <span>{icon}</span>
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── History List ── */}
      {combinedHistory.length > 0 && (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-black" style={{ color: 'var(--ink)' }}>Lern-Verlauf</h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--mute)' }}>
              Letzte {combinedHistory.length} Sessions — chronologisch.
            </p>
          </div>
          <div className="space-y-2">
            {combinedHistory.map(entry => (
              <div
                key={entry.id}
                className="flex items-center gap-3 p-4 rounded-2xl border"
                style={{
                  background: 'color-mix(in srgb, var(--border-color) 20%, var(--bg-sidebar))',
                  borderColor: 'var(--border-color)',
                }}
              >
                {/* Mode badge */}
                <span
                  className="shrink-0 px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-wider"
                  style={{
                    background: scoreBg(entry.score),
                    color: scoreColor(entry.score),
                  }}
                >
                  {entry.mode}
                </span>

                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-black truncate" style={{ color: 'var(--ink)' }}>
                    {entry.docName}
                  </p>
                  <p className="text-[9px] mt-0.5" style={{ color: 'var(--mute)' }}>
                    {fmtDate(entry.timestamp)} · {entry.detail}
                  </p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border-color)' }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${entry.score}%`, background: scoreColor(entry.score) }}
                    />
                  </div>
                  <span className="text-sm font-black w-10 text-right" style={{ color: scoreColor(entry.score) }}>
                    {entry.score}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── KI Deep Analysis ── */}
      <div className="pt-8 border-t space-y-6" style={{ borderColor: 'var(--border-color)' }}>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h3 className="text-xl font-black" style={{ color: 'var(--ink)' }}>KI Fehleranalyse</h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--mute)' }}>
              {wrongAnswersCtx.length > 0
                ? `KI analysiert ${wrongAnswersCtx.length} echte Fehlantworten aus deinen Quizzen.`
                : 'Spiele mehr Quizze für eine fundierte Analyse.'}
            </p>
          </div>
          <button
            onClick={handleRunAnalysis}
            disabled={isAnalyzing || !hasAnyData}
            className="w-full sm:w-auto px-8 py-4 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] shadow-xl hover:scale-105 active:scale-95 transition-all disabled:opacity-40 shrink-0"
            style={{ background: 'var(--ink)', color: 'var(--bg-main)' }}
          >
            {isAnalyzing ? 'KI analysiert...' : <>Tiefenanalyse <EmojiImage emoji="✨" size={13} /></>}
          </button>
        </div>

        {analysis && (
          <div className="space-y-10">
            <section
              className="p-8 lg:p-10 rounded-[32px] shadow-lg"
              style={{ background: 'var(--ink)', color: 'var(--bg-main)' }}
            >
              <h2 className="text-[9px] font-black uppercase tracking-widest opacity-50 mb-3">
                Psychologische Synthese
              </h2>
              <p className="text-lg lg:text-xl font-medium leading-relaxed italic opacity-90">
                "{analysis.overallHealth}"
              </p>
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {analysis.errorPatterns.map((error, idx) => {
                const target = ERROR_ACTION_TARGET[error.recommendedAction.type] ?? { tab: ActiveTab.QUIZ };
                const handleLearn = () => {
                  if (target.mode && onAction && error.concepts?.[0]) onAction(error.concepts[0], target.mode);
                  else onNavigate(target.tab);
                };
                return (
                  <div
                    key={idx}
                    className="p-6 lg:p-8 rounded-[24px] lg:rounded-[32px] border shadow-sm space-y-4 flex flex-col"
                    style={{ background: 'var(--card)', borderColor: 'var(--border-color)' }}
                  >
                    <div>
                      <div className="flex flex-wrap justify-between items-start gap-2">
                        <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: '#f43f5e' }}>Hauptproblem</p>
                        <span
                          className="text-[8px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest shrink-0"
                          style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
                        >
                          {error.count}× aufgetreten
                        </span>
                      </div>
                      <h4 className="text-base font-black mt-1" style={{ color: 'var(--ink)' }}>{error.pattern}</h4>
                      <p className="text-[11px] font-medium mt-1 leading-relaxed" style={{ color: 'var(--ink2)' }}>{error.description}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: 'var(--mute)' }}>Vermutete Ursache</p>
                      <p className="text-[11px] font-medium mt-1 leading-relaxed" style={{ color: 'var(--ink2)' }}>{error.probableCause}</p>
                    </div>
                    <div className="flex-1">
                      <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: 'var(--primary)' }}>Empfehlung</p>
                      <p className="text-sm font-black mt-1" style={{ color: 'var(--ink)' }}>{error.recommendedAction.type}</p>
                      <p className="text-[10px] italic mt-1 leading-relaxed" style={{ color: 'var(--ink2)' }}>{error.recommendedAction.reasoning}</p>
                    </div>
                    <button
                      onClick={handleLearn}
                      className="w-full py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-[0.98]"
                      style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
                    >
                      Jetzt lernen →
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
