import type {
  TopicMetric, LearningProfile, MethodStat, TopicSecurity, ForgettingItem,
  TimeOfDayStat, ExamPrognosis, FlashcardDeck, LearnMethod, CategoryMastery, ExamCategory,
  TypeMastery, CauseAnalysisItem, LongTermTrendItem, DayOfWeekStat, LearningFlowResult,
} from '../types';
import { ActiveTab } from '../types';
import type { QuizResult } from './quizHistoryService';
import type { ExamResult } from './examHistoryService';
import type { RecallResult } from './recallHistoryService';
import { t, tp } from '../i18n';
import type { TKey } from '../i18n';

const DAY_MS = 24 * 60 * 60 * 1000;

// Kategorie-/Methoden-/Typ-Enums → Übersetzungsschlüssel. Die Enum-Werte selbst
// bleiben sprachneutrale Protokoll-Tokens; nur die Anzeige wird lokalisiert.
const CATEGORY_KEYS: Record<string, TKey> = {
  definition: 'lp.cat.definition', verstaendnis: 'lp.cat.verstaendnis', transfer: 'lp.cat.transfer',
  beispiel: 'lp.cat.beispiel', rechnung: 'lp.cat.rechnung', fachbegriff: 'lp.cat.fachbegriff',
};
const METHOD_KEYS: Record<LearnMethod, TKey> = {
  anki: 'lp.method.anki', quiz: 'lp.method.quiz', feynman: 'lp.method.feynman', explainer: 'lp.method.explainer', exam: 'lp.method.exam',
};
const TYPE_KEYS: Record<string, TKey> = {
  mc: 'lp.type.mc', single: 'lp.type.mc', truefalse: 'lp.type.truefalse', matching: 'lp.type.matching',
  cloze: 'lp.type.cloze', fillblank: 'lp.type.cloze', ranking: 'lp.type.ranking', numeric: 'lp.type.numeric',
  open: 'lp.type.open', scenario: 'lp.type.scenario',
};

/** Locale-abhängige Anzeige-Labels (zur Aufrufzeit übersetzt). */
export const getCategoryLabel = (c: string): string => (CATEGORY_KEYS[c] ? t(CATEGORY_KEYS[c]) : c);
export const getMethodLabel = (m: LearnMethod): string => (METHOD_KEYS[m] ? t(METHOD_KEYS[m]) : m);
export const getTypeLabel = (ty: string): string => (TYPE_KEYS[ty] ? t(TYPE_KEYS[ty]) : ty);

/**
 * Deutsche Notenskala (Standard-Notenschlüssel), aus ExamView.tsx extrahiert
 * damit sie auch für die Klausurprognose des Lern-Coaches wiederverwendbar ist.
 * Die Note (1.0–5.0) bleibt sprachneutral, nur das Label wird lokalisiert.
 */
export const germanGradeFromPercentage = (p: number): { grade: string; label: string } => {
  if (p >= 95) return { grade: '1.0', label: t('lp.grade.sehrGut') };
  if (p >= 90) return { grade: '1.3', label: t('lp.grade.sehrGut') };
  if (p >= 85) return { grade: '1.7', label: t('lp.grade.gut') };
  if (p >= 80) return { grade: '2.0', label: t('lp.grade.gut') };
  if (p >= 75) return { grade: '2.3', label: t('lp.grade.gut') };
  if (p >= 70) return { grade: '2.7', label: t('lp.grade.befriedigend') };
  if (p >= 65) return { grade: '3.0', label: t('lp.grade.befriedigend') };
  if (p >= 60) return { grade: '3.3', label: t('lp.grade.befriedigend') };
  if (p >= 55) return { grade: '3.7', label: t('lp.grade.ausreichend') };
  if (p >= 50) return { grade: '4.0', label: t('lp.grade.ausreichend') };
  return { grade: '5.0', label: t('lp.grade.nichtBestanden') };
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

/** Ø erste 3 vs. letzte 3 Sessions (chronologisch), Differenz normiert auf Session-Anzahl. 0 unter der Mindestmenge. */
const improvementPerSession = (scoresNewestFirst: number[]): number => {
  if (scoresNewestFirst.length < 4) return 0;
  const chronological = [...scoresNewestFirst].reverse();
  const firstAvg = avg(chronological.slice(0, 3));
  const lastAvg = avg(chronological.slice(-3));
  return Math.round((lastAvg - firstAvg) / scoresNewestFirst.length);
};

const avg = (nums: number[]): number => nums.length ? Math.round(nums.reduce((s, v) => s + v, 0) / nums.length) : 0;

// ─── Methodenvergleich ─────────────────────────────────────────────────────────

const buildPerMethod = (
  quizResults: QuizResult[], recallResults: RecallResult[], examResults: ExamResult[], metrics: TopicMetric[],
): MethodStat[] => {
  const stats: MethodStat[] = [];

  if (metrics.length > 0) {
    stats.push({ method: 'anki', avgScore: avg(metrics.map(m => m.confidence)), sessions: metrics.reduce((s, m) => s + m.totalAttempts, 0), trend: 'stable', improvementPerSession: 0 });
  }
  if (quizResults.length > 0) {
    const scores = quizResults.map(r => r.score);
    stats.push({ method: 'quiz', avgScore: avg(scores), sessions: quizResults.length, trend: trendOf(scores), improvementPerSession: improvementPerSession(scores) });
  }
  const feynman = recallResults.filter(r => r.method !== 'explainer');
  if (feynman.length > 0) {
    const scores = feynman.map(r => r.score);
    stats.push({ method: 'feynman', avgScore: avg(scores), sessions: feynman.length, trend: trendOf(scores), improvementPerSession: improvementPerSession(scores) });
  }
  const explainer = recallResults.filter(r => r.method === 'explainer');
  if (explainer.length > 0) {
    const scores = explainer.map(r => r.score);
    stats.push({ method: 'explainer', avgScore: avg(scores), sessions: explainer.length, trend: trendOf(scores), improvementPerSession: improvementPerSession(scores) });
  }
  if (examResults.length > 0) {
    const scores = examResults.map(r => r.score);
    stats.push({ method: 'exam', avgScore: avg(scores), sessions: examResults.length, trend: trendOf(scores), improvementPerSession: improvementPerSession(scores) });
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

/**
 * Themen-Sicherheit aus ECHTEN KI-Subthemen (statt Dokumentnamen).
 *
 * Quelle: gespeicherte Quiz-Fragen (`questions[].topic`) × Antworten (`isCorrect`)
 * — deterministisch, keine Datenmigration. `weakTopics` aus Quiz+Klausur
 * verschärfen die Einstufung. Recall-Scores fließen nur in bereits bekannte
 * Themen ein (Recall-`topic` kann auch ein Dokumentname sein).
 *
 * Liefert [] wenn keine echten Themen existieren — der Aufrufer fällt dann auf
 * `profile.topicMastery` (Dokumentnamen) zurück. `buildTopicMastery` und der
 * LearningProfile-Typ bleiben unverändert (Coach-Prompt + ExamGenerator
 * adaptive Gewichtung hängen daran).
 */
export const buildRealTopicMastery = (
  quizResults: QuizResult[],
  examResults: ExamResult[],
  recallResults: RecallResult[],
): TopicSecurity[] => {
  const acc = new Map<string, { correct: number; total: number; samples: number[] }>();
  quizResults.slice(0, 30).forEach(r => {
    (r.answers || []).forEach(a => {
      const topic = r.questions?.[a.questionIndex]?.topic?.trim();
      if (!topic) return;
      const e = acc.get(topic) ?? { correct: 0, total: 0, samples: [] };
      e.total += 1;
      if (a.isCorrect) e.correct += 1;
      acc.set(topic, e);
    });
  });

  const weakCounts: Record<string, number> = {};
  quizResults.slice(0, 15).forEach(r => r.weakTopics.forEach(t => { weakCounts[t] = (weakCounts[t] || 0) + 1; }));
  examResults.slice(0, 15).forEach(r => r.weakTopics.forEach(t => { weakCounts[t] = (weakCounts[t] || 0) + 1; }));

  recallResults.slice(0, 15).forEach(r => {
    const topic = r.topic?.trim();
    if (!topic) return;
    const e = acc.get(topic);
    if (e) e.samples.push(r.score);
    else if (weakCounts[topic]) acc.set(topic, { correct: 0, total: 0, samples: [r.score] });
  });

  const byTopic = new Map<string, TopicSecurity>();
  acc.forEach((e, topic) => {
    // Mindestschwelle gegen 1-Frage-Rauschen
    if (e.total < 2 && e.samples.length === 0 && !weakCounts[topic]) return;
    const pcts: number[] = [];
    if (e.total > 0) pcts.push(Math.round((e.correct / e.total) * 100));
    pcts.push(...e.samples);
    const confidence = avg(pcts);
    const weakCount = weakCounts[topic] || 0;
    byTopic.set(topic, { topic, confidence, security: securityOf(confidence, weakCount), weakCount });
  });
  Object.entries(weakCounts).forEach(([topic, weakCount]) => {
    if (!byTopic.has(topic)) {
      byTopic.set(topic, { topic, confidence: 0, security: securityOf(0, weakCount), weakCount });
    }
  });

  return [...byTopic.values()].sort((a, b) => a.confidence - b.confidence || b.weakCount - a.weakCount);
};

// ─── Kategorie-Sicherheit (aus Klausur-Kategorie-Aufschlüsselung) ──────────────────

const buildCategoryMastery = (examResults: ExamResult[]): CategoryMastery[] => {
  const scoresByCategory: Record<string, number[]> = {};
  examResults.forEach(r => {
    (r.categoryBreakdown || []).forEach(({ category, score }) => {
      (scoresByCategory[category] ??= []).push(score);
    });
  });
  return Object.entries(scoresByCategory)
    .map(([category, scores]) => ({
      category: category as ExamCategory,
      avgScore: avg(scores),
      weakCount: scores.filter(s => s < 60).length,
    }))
    .sort((a, b) => a.avgScore - b.avgScore);
};

// ─── Wissensprofil nach Fragetyp (Klausur-typeBreakdown + Quiz-Antworten) ──────────

const buildTypeMastery = (quizResults: QuizResult[], examResults: ExamResult[]): TypeMastery[] => {
  const scoresByLabel: Record<string, number[]> = {};
  const addScore = (rawType: string, score: number) => {
    const label = getTypeLabel(rawType);
    (scoresByLabel[label] ??= []).push(score);
  };

  examResults.forEach(r => (r.typeBreakdown || []).forEach(({ type, score }) => addScore(type, score)));

  quizResults.forEach(r => {
    const byType: Record<string, { correct: number; total: number }> = {};
    (r.answers || []).forEach(a => {
      const rawType = r.questions?.[a.questionIndex]?.questionType || 'mc';
      const entry = byType[rawType] ?? { correct: 0, total: 0 };
      entry.total += 1;
      if (a.isCorrect) entry.correct += 1;
      byType[rawType] = entry;
    });
    Object.entries(byType).forEach(([rawType, { correct, total }]) => {
      if (total > 0) addScore(rawType, Math.round((correct / total) * 100));
    });
  });

  return Object.entries(scoresByLabel)
    .map(([label, scores]) => ({ type: label, label, avgScore: avg(scores), weakCount: scores.filter(s => s < 60).length }))
    .sort((a, b) => a.avgScore - b.avgScore);
};

// ─── Ursachenanalyse (nur wirklich belegbare Signale) ──────────────────────────────

const buildCauseAnalysis = (
  categoryMastery: CategoryMastery[], topicMastery: TopicSecurity[], examResults: ExamResult[],
): CauseAnalysisItem[] => {
  const items: CauseAnalysisItem[] = [];

  const definition = categoryMastery.find(c => c.category === 'definition');
  if (definition && definition.avgScore < 60) {
    items.push({ cause: t('lp.cause.definition'), description: t('lp.cause.definition.desc', { n: definition.avgScore }) });
  }
  const transfer = categoryMastery.find(c => c.category === 'transfer');
  if (transfer && transfer.avgScore < 60) {
    items.push({ cause: t('lp.cause.transfer'), description: t('lp.cause.transfer.desc', { n: transfer.avgScore }) });
  }
  if (topicMastery.length > 0) {
    const kritischShare = topicMastery.filter(t => t.security === 'kritisch').length / topicMastery.length;
    if (kritischShare > 0.5) {
      items.push({ cause: t('lp.cause.basics'), description: t('lp.cause.basics.desc') });
    }
  }
  const fatigueExams = examResults.filter(r => r.fatigue && r.fatigue.earlyScore - r.fatigue.lateScore >= 15);
  if (fatigueExams.length >= 2) {
    items.push({ cause: t('lp.cause.fatigue'), description: t('lp.cause.fatigue.desc', { n: fatigueExams.length }) });
  }

  return items;
};

// ─── Langzeit-Entwicklung (früheste vs. neueste Klausur-Hälfte) ────────────────────

const buildLongTermTrend = (examResults: ExamResult[]): LongTermTrendItem[] | null => {
  if (examResults.length < 4) return null;
  const chronological = [...examResults].reverse(); // älteste zuerst (Speicherreihenfolge ist neueste zuerst)
  const mid = Math.floor(chronological.length / 2);
  const earlyHalf = chronological.slice(0, mid);
  const lateHalf = chronological.slice(mid);

  // items[0] ist immer der Klausur-Gesamttrend (wird intern über Index 0 erkannt,
  // nicht über das Anzeige-Label — das darf lokalisiert werden).
  const items: LongTermTrendItem[] = [
    { label: t('lp.trend.examResults'), delta: avg(lateHalf.map(r => r.score)) - avg(earlyHalf.map(r => r.score)) },
  ];

  const earlyByCategory: Record<string, number[]> = {};
  earlyHalf.forEach(r => (r.categoryBreakdown || []).forEach(({ category, score }) => { (earlyByCategory[category] ??= []).push(score); }));
  const lateByCategory: Record<string, number[]> = {};
  lateHalf.forEach(r => (r.categoryBreakdown || []).forEach(({ category, score }) => { (lateByCategory[category] ??= []).push(score); }));

  Object.keys(lateByCategory).forEach(category => {
    if (!earlyByCategory[category]) return; // nur Kategorien, die in beiden Hälften vorkommen
    const delta = avg(lateByCategory[category]) - avg(earlyByCategory[category]);
    items.push({ label: getCategoryLabel(category), delta });
  });

  return items;
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

// ─── Wochentag-Insight ──────────────────────────────────────────────────────────────

const DAY_NAMES: DayOfWeekStat['day'][] = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

const buildDayOfWeek = (allTimestampedScores: { timestamp: number; score: number }[]): LearningProfile['dayOfWeek'] => {
  const buckets: Record<string, number[]> = {};
  allTimestampedScores.forEach(({ timestamp, score }) => {
    const day = DAY_NAMES[new Date(timestamp).getDay()];
    (buckets[day] ??= []).push(score);
  });
  const byDay = Object.entries(buckets)
    .filter(([, scores]) => scores.length >= 2)
    .map(([day, scores]) => ({ day: day as DayOfWeekStat['day'], avgScore: avg(scores), sessions: scores.length }));

  const bestDay = byDay.length > 0
    ? byDay.reduce((best, cur) => cur.avgScore > best.avgScore ? cur : best).day
    : null;

  return { bestDay, byDay };
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

// ─── Motivations-Banner (regelbasiert, kein KI-Call) ───────────────────────────────

const buildMotivationLine = (
  timestamped: { timestamp: number; score: number }[],
  examPrognosis: ExamPrognosis | null,
  streakCurrent: number,
): string => {
  const now = Date.now();
  const recent = timestamped.filter(t => now - t.timestamp <= 7 * DAY_MS);
  const prior = timestamped.filter(t => now - t.timestamp > 7 * DAY_MS && now - t.timestamp <= 21 * DAY_MS);
  if (recent.length >= 2 && prior.length >= 2 && avg(recent.map(t => t.score)) >= avg(prior.map(t => t.score)) + 8) {
    return t('lp.mot.betterPrepared');
  }

  if (examPrognosis && examPrognosis.passProbability >= 80 && examPrognosis.passProbability < 90) {
    return t('lp.mot.passProb', { n: examPrognosis.passProbability });
  }

  const overallTrend = trendOf([...timestamped].sort((a, b) => b.timestamp - a.timestamp).map(t => t.score));
  if (overallTrend === 'up' || streakCurrent >= 3) {
    return t('lp.mot.improving');
  }

  return t('lp.mot.keepGoing');
};

// ─── Methodenkommentar (deterministischer Fallback ohne KI) ──────────────────────

/**
 * Kurzer Kommentar (max. 2 Sätze) zum Methodenvergleich — rein aus den
 * vorhandenen Werten, kein KI-Call. Wird nur genutzt, wenn kein
 * insights.methodInsight aus dem Coach-Lauf vorliegt.
 */
export const buildMethodCommentary = (perMethod: MethodStat[]): string | null => {
  if (perMethod.length === 0) return null;
  if (perMethod.length === 1) {
    return t('lp.mc.single', { method: getMethodLabel(perMethod[0].method) });
  }
  const sorted = [...perMethod].sort((a, b) => b.avgScore - a.avgScore);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const first = t('lp.mc.best', { method: getMethodLabel(best.method), score: best.avgScore });
  if (best.avgScore - worst.avgScore >= 15) {
    return t('lp.mc.mostRoom', { first, method: getMethodLabel(worst.method) });
  }
  if (best.trend === 'up') {
    return t('lp.mc.trendUp', { first });
  }
  return t('lp.mc.mixWorks', { first });
};

// ─── Tagesplan („Heute solltest du") ────────────────────────────────────────────

export interface DailyPlanStep {
  title: string;
  why?: string;
  /** Geschätzte Dauer in Minuten. */
  minutes: number;
  target:
    | { kind: 'action'; topic: string; mode: 'quiz' | 'cards' | 'recall' }
    | { kind: 'tab'; tab: ActiveTab };
}

const FLOW_MODULE_TO_TAB: Record<string, ActiveTab> = {
  analyse: ActiveTab.RADAR,
  quiz: ActiveTab.QUIZ,
  cards: ActiveTab.CARDS,
  explain: ActiveTab.EXPLAINER,
  calendar: ActiveTab.PLANNER,
  exam: ActiveTab.EXAM,
};

/**
 * Priorisierte nächste Lernschritte für die „Heute solltest du"-Karte.
 * Primärquelle: persistierte KI-Empfehlungen (flowResult.next_actions,
 * werden nach jeder Session berechnet — kein neuer API-Call). Fallback:
 * deterministische Kette aus fälligen Karten, schwächstem Thema und
 * Klausur-/Vergessens-Signalen. Garantiert mindestens einen Schritt.
 */
export const buildDailyPlan = (input: {
  flowResult: LearningFlowResult | null;
  realTopics: TopicSecurity[];
  decks: FlashcardDeck[];
  profile: LearningProfile;
}): DailyPlanStep[] => {
  const { flowResult, realTopics, decks, profile } = input;

  if (flowResult?.next_actions?.length) {
    return flowResult.next_actions.slice(0, 3).map(a => {
      const focusTopic = a.focus_topics?.[0];
      const target: DailyPlanStep['target'] =
        focusTopic && (a.module === 'quiz' || a.module === 'cards')
          ? { kind: 'action', topic: focusTopic, mode: a.module }
          : { kind: 'tab', tab: FLOW_MODULE_TO_TAB[a.module] ?? ActiveTab.QUIZ };
      return { title: a.title, why: a.why, minutes: a.timebox_minutes || 10, target };
    });
  }

  const steps: DailyPlanStep[] = [];
  const now = Date.now();

  const dueCount = decks.reduce((sum, d) =>
    sum + d.cards.filter(c => !c.srs || c.srs.nextReview <= now).length, 0);
  if (dueCount > 0) {
    steps.push({
      title: tp('lp.dp.dueCards', dueCount),
      why: t('lp.dp.dueCardsWhy'),
      minutes: Math.min(20, Math.max(5, Math.round(dueCount / 2))),
      target: { kind: 'tab', tab: ActiveTab.CARDS },
    });
  }

  const weakest = realTopics.find(t => t.security !== 'sicher');
  if (weakest) {
    steps.push({
      title: t('lp.dp.solidifyTopic', { topic: weakest.topic }),
      why: weakest.security === 'kritisch' ? t('lp.dp.criticalTopic') : t('lp.dp.stillUnsure'),
      minutes: 10,
      target: { kind: 'action', topic: weakest.topic, mode: 'quiz' },
    });
  }

  if (profile.examPrognosis === null) {
    steps.push({
      title: t('lp.dp.firstExam'),
      why: t('lp.dp.firstExamWhy'),
      minutes: 25,
      target: { kind: 'tab', tab: ActiveTab.EXAM },
    });
  } else if (profile.forgetting.length > 0) {
    const f = profile.forgetting[0];
    steps.push({
      title: t('lp.dp.refresh', { topic: f.topic }),
      why: f.dueInDays <= 0 ? t('lp.dp.dueToday') : tp('lp.dp.dueInDays', f.dueInDays),
      minutes: 10,
      target: { kind: 'tab', tab: ActiveTab.CARDS },
    });
  }

  if (steps.length === 0) {
    steps.push({
      title: t('lp.dp.shortQuiz'),
      why: t('lp.dp.shortQuizWhy'),
      minutes: 10,
      target: { kind: 'tab', tab: ActiveTab.QUIZ },
    });
  }

  return steps.slice(0, 3);
};

// ─── Datenbasierte Motivation (unter der Klausurprognose) ────────────────────────

/**
 * Kurzer motivierender Satz, aus den aktuellen Lerndaten abgeleitet — NICHT
 * zufällig, keine Erfolgsversprechen. Prioritäten: Inaktivität > positiver
 * Trend > viele kritische Themen > gute Prognose > realistischer Fallback.
 */
export const buildContextMotivation = (profile: LearningProfile, lastActivityTs: number | null): string => {
  if (lastActivityTs !== null && Date.now() - lastActivityTs > 3 * DAY_MS) {
    return t('lp.cm.inactive');
  }
  // longTermTrend[0] ist per Konstruktion immer der Klausur-Gesamttrend (siehe buildLongTermTrend)
  const examTrendUp = (profile.longTermTrend?.[0]?.delta ?? 0) > 0;
  const anyMethodUp = profile.perMethod.some(m => m.trend === 'up');
  if (examTrendUp || anyMethodUp) {
    return t('lp.cm.positiveTrend');
  }
  if (profile.topicMastery.filter(t => t.security === 'kritisch').length >= 3) {
    return t('lp.cm.oneTopic');
  }
  if (profile.examPrognosis && profile.examPrognosis.passProbability >= 70) {
    return t('lp.cm.rightDirection');
  }
  return t('lp.cm.smallProgress');
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

  const categoryMastery = buildCategoryMastery(examResults);
  const topicMastery = buildTopicMastery(metrics, quizResults, examResults);
  const examPrognosis = buildExamPrognosis(examResults);

  return {
    perMethod: buildPerMethod(quizResults, recallResults, examResults, metrics),
    topicMastery,
    categoryMastery,
    typeMastery: buildTypeMastery(quizResults, examResults),
    forgetting: buildForgetting(decks),
    timeOfDay: buildTimeOfDay(timestamped),
    dayOfWeek: buildDayOfWeek(timestamped),
    examPrognosis,
    causeAnalysis: buildCauseAnalysis(categoryMastery, topicMastery, examResults),
    longTermTrend: buildLongTermTrend(examResults),
    motivationLine: buildMotivationLine(timestamped, examPrognosis, streak.current),
    volume: { streakCurrent: streak.current, streakBest: streak.best, sessionsPerWeek, totalSessions },
  };
};

export type { LearnMethod };
