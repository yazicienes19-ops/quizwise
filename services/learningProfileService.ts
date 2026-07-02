import type {
  TopicMetric, LearningProfile, MethodStat, TopicSecurity, ForgettingItem,
  TimeOfDayStat, ExamPrognosis, FlashcardDeck, LearnMethod,
} from '../types';
import type { QuizResult } from './quizHistoryService';
import type { ExamResult } from './examHistoryService';
import type { RecallResult } from './recallHistoryService';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Deutsche Notenskala (Standard-Notenschlüssel), aus ExamView.tsx extrahiert
 * damit sie auch für die Klausurprognose des Lern-Coaches wiederverwendbar ist.
 */
export const germanGradeFromPercentage = (p: number): { grade: string; label: string } => {
  if (p >= 95) return { grade: '1.0', label: 'Sehr Gut' };
  if (p >= 90) return { grade: '1.3', label: 'Sehr Gut' };
  if (p >= 85) return { grade: '1.7', label: 'Gut' };
  if (p >= 80) return { grade: '2.0', label: 'Gut' };
  if (p >= 75) return { grade: '2.3', label: 'Gut' };
  if (p >= 70) return { grade: '2.7', label: 'Befriedigend' };
  if (p >= 65) return { grade: '3.0', label: 'Befriedigend' };
  if (p >= 60) return { grade: '3.3', label: 'Befriedigend' };
  if (p >= 55) return { grade: '3.7', label: 'Ausreichend' };
  if (p >= 50) return { grade: '4.0', label: 'Ausreichend' };
  return { grade: '5.0', label: 'Nicht Bestanden' };
};

const trendOf = (scoresNewestFirst: number[]): 'up' | 'down' | 'stable' => {
  if (scoresNewestFirst.length < 4) return 'stable';
  const last = scoresNewestFirst.slice(0, 3);
  const prev = scoresNewestFirst.slice(3, 6);
  if (!prev.length) return 'stable';
  const lastAvg = last.reduce((s, v) => s + v, 0) / last.length;
  const prevAvg = prev.reduce((s, v) => s + v, 0) / prev.length;
  if (lastAvg >= prevAvg + 5) return 'up';
  if (lastAvg <= prevAvg - 5) return 'down';
  return 'stable';
};

const avg = (nums: number[]): number => nums.length ? Math.round(nums.reduce((s, v) => s + v, 0) / nums.length) : 0;

// ─── Methodenvergleich ─────────────────────────────────────────────────────────

const buildPerMethod = (
  quizResults: QuizResult[], recallResults: RecallResult[], examResults: ExamResult[], metrics: TopicMetric[],
): MethodStat[] => {
  const stats: MethodStat[] = [];

  if (metrics.length > 0) {
    stats.push({ method: 'anki', avgScore: avg(metrics.map(m => m.confidence)), sessions: metrics.reduce((s, m) => s + m.totalAttempts, 0), trend: 'stable' });
  }
  if (quizResults.length > 0) {
    stats.push({ method: 'quiz', avgScore: avg(quizResults.map(r => r.score)), sessions: quizResults.length, trend: trendOf(quizResults.map(r => r.score)) });
  }
  const feynman = recallResults.filter(r => r.method !== 'explainer');
  if (feynman.length > 0) {
    stats.push({ method: 'feynman', avgScore: avg(feynman.map(r => r.score)), sessions: feynman.length, trend: trendOf(feynman.map(r => r.score)) });
  }
  const explainer = recallResults.filter(r => r.method === 'explainer');
  if (explainer.length > 0) {
    stats.push({ method: 'explainer', avgScore: avg(explainer.map(r => r.score)), sessions: explainer.length, trend: trendOf(explainer.map(r => r.score)) });
  }
  if (examResults.length > 0) {
    stats.push({ method: 'exam', avgScore: avg(examResults.map(r => r.score)), sessions: examResults.length, trend: trendOf(examResults.map(r => r.score)) });
  }
  return stats;
};

// ─── Themen-Sicherheit ──────────────────────────────────────────────────────────

const securityOf = (confidence: number, weakCount: number): TopicSecurity['security'] => {
  if (confidence < 40 || weakCount >= 3) return 'kritisch';
  if (confidence < 70 || weakCount >= 1) return 'unsicher';
  return 'sicher';
};

const buildTopicMastery = (metrics: TopicMetric[], quizResults: QuizResult[], examResults: ExamResult[]): TopicSecurity[] => {
  const weakCounts: Record<string, number> = {};
  quizResults.slice(0, 15).forEach(r => r.weakTopics.forEach(t => { weakCounts[t] = (weakCounts[t] || 0) + 1; }));
  examResults.slice(0, 15).forEach(r => r.weakTopics.forEach(t => { weakCounts[t] = (weakCounts[t] || 0) + 1; }));

  const byTopic = new Map<string, TopicSecurity>();
  metrics.forEach(m => {
    const weakCount = weakCounts[m.topic] || 0;
    byTopic.set(m.topic, { topic: m.topic, confidence: m.confidence, security: securityOf(m.confidence, weakCount), weakCount });
  });
  // Themen, die nur über weakTopics bekannt sind (noch keine TopicMetric)
  Object.entries(weakCounts).forEach(([topic, weakCount]) => {
    if (!byTopic.has(topic)) {
      byTopic.set(topic, { topic, confidence: 0, security: securityOf(0, weakCount), weakCount });
    }
  });

  return [...byTopic.values()].sort((a, b) => a.confidence - b.confidence || b.weakCount - a.weakCount);
};

// ─── Vergessensanalyse (aus SRS-Fälligkeit) ─────────────────────────────────────

const buildForgetting = (decks: FlashcardDeck[]): ForgettingItem[] => {
  const now = Date.now();
  const items: ForgettingItem[] = [];
  decks.forEach(deck => {
    const established = deck.cards.filter(c => c.srs && c.srs.repetitions > 0);
    // "wird bald wieder vergessen" = Fälligkeit in den nächsten 5 Tagen (noch nicht überfällig)
    const upcoming = established.filter(c => {
      const days = Math.ceil(((c.srs?.nextReview ?? now) - now) / DAY_MS);
      return days >= 0 && days <= 5;
    });
    if (upcoming.length === 0) return;
    const dueInDays = Math.min(...upcoming.map(c => Math.ceil(((c.srs?.nextReview ?? now) - now) / DAY_MS)));
    items.push({ topic: deck.title, dueInDays, cardCount: upcoming.length });
  });
  return items.sort((a, b) => a.dueInDays - b.dueInDays).slice(0, 8);
};

// ─── Tageszeit-Insight ──────────────────────────────────────────────────────────

const partOfDay = (hour: number): TimeOfDayStat['part'] => {
  if (hour >= 5 && hour < 12) return 'Morgen';
  if (hour >= 12 && hour < 17) return 'Mittag';
  if (hour >= 17 && hour < 22) return 'Abend';
  return 'Nacht';
};

const buildTimeOfDay = (allTimestampedScores: { timestamp: number; score: number }[]): LearningProfile['timeOfDay'] => {
  const buckets: Record<TimeOfDayStat['part'], number[]> = { Morgen: [], Mittag: [], Abend: [], Nacht: [] };
  allTimestampedScores.forEach(({ timestamp, score }) => {
    buckets[partOfDay(new Date(timestamp).getHours())].push(score);
  });
  const byPart = (Object.keys(buckets) as TimeOfDayStat['part'][])
    .filter(part => buckets[part].length >= 2) // zu wenig Daten sind nicht aussagekräftig
    .map(part => ({ part, avgScore: avg(buckets[part]), sessions: buckets[part].length }));

  const bestPart = byPart.length > 0
    ? byPart.reduce((best, cur) => cur.avgScore > best.avgScore ? cur : best).part
    : null;

  return { bestPart, byPart };
};

// ─── Klausurprognose ─────────────────────────────────────────────────────────────

const buildExamPrognosis = (examResults: ExamResult[]): ExamPrognosis | null => {
  if (examResults.length === 0) return null;
  const recent = examResults.slice(0, 5); // neueste zuerst (Speicherreihenfolge)
  const weights = recent.map((_, i) => recent.length - i); // aktuellste am stärksten gewichtet
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  const weightedScore = recent.reduce((s, r, i) => s + r.score * weights[i], 0) / totalWeight;
  const passedShare = (recent.filter(r => r.passed).length / recent.length) * 100;
  const passProbability = Math.round(weightedScore * 0.7 + passedShare * 0.3);
  return { grade: germanGradeFromPercentage(weightedScore).grade, passProbability, basis: recent.length };
};

// ─── Hauptfunktion ────────────────────────────────────────────────────────────────

export interface LearningProfileInput {
  metrics: TopicMetric[];
  quizResults: QuizResult[];
  recallResults: RecallResult[];
  examResults: ExamResult[];
  decks: FlashcardDeck[];
  streak: { current: number; best: number };
}

export const buildLearningProfile = ({
  metrics, quizResults, recallResults, examResults, decks, streak,
}: LearningProfileInput): LearningProfile => {
  const timestamped = [
    ...quizResults.map(r => ({ timestamp: r.timestamp, score: r.score })),
    ...recallResults.map(r => ({ timestamp: r.timestamp, score: r.score })),
    ...examResults.map(r => ({ timestamp: r.timestamp, score: r.score })),
  ];

  const totalSessions = quizResults.length + recallResults.length + examResults.length
    + metrics.reduce((s, m) => s + m.totalAttempts, 0);

  const oldestTimestamp = timestamped.length ? Math.min(...timestamped.map(t => t.timestamp)) : Date.now();
  const weeksSpan = Math.max(1, (Date.now() - oldestTimestamp) / (7 * DAY_MS));
  const sessionsPerWeek = Math.round((quizResults.length + recallResults.length + examResults.length) / weeksSpan);

  return {
    perMethod: buildPerMethod(quizResults, recallResults, examResults, metrics),
    topicMastery: buildTopicMastery(metrics, quizResults, examResults),
    forgetting: buildForgetting(decks),
    timeOfDay: buildTimeOfDay(timestamped),
    examPrognosis: buildExamPrognosis(examResults),
    volume: { streakCurrent: streak.current, streakBest: streak.best, sessionsPerWeek, totalSessions },
  };
};

export type { LearnMethod };
