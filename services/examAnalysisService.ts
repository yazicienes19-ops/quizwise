/**
 * examAnalysisService — deterministische Klausur-Analyse.
 *
 * Ersetzt den bisherigen Gemini-Call (analyzeExamResults): topicPerformance,
 * Stärken/Schwächen und Empfehlungen sind vollständig aus den bereits
 * bewerteten Fragen berechenbar (topic, category, points, achievedPoints,
 * bloomLevel, fatigue). Ein LLM fügt hier über die echten Zahlen hinaus nur
 * Sprachrisiko, Wartezeit und Kosten hinzu — die Kern-Zahlen (categoryBreakdown,
 * weakTopics, fatigue) wurden ohnehin schon deterministisch in ExamSystem
 * berechnet. Empfehlungen folgen festen Regeln über definierten Schwellen,
 * dieselben wie im Lern-Coach (score < 60 = schwach).
 */

import type { ExamAnalysis, ExamQuestion } from '../types';
import { t } from '../i18n';
import type { TKey } from '../i18n';

interface TopicAgg {
  topic: string;
  achieved: number;
  total: number;
}

export const buildExamAnalysis = (
  questions: ExamQuestion[],
  fatigue?: { earlyScore: number; lateScore: number },
): ExamAnalysis => {
  // ── topicPerformance: Punkte je Thema, nur Themen mit Wertung ──
  const byTopic = new Map<string, TopicAgg>();
  questions.forEach(q => {
    if (!q.topic || q.points <= 0) return;
    const agg = byTopic.get(q.topic) ?? { topic: q.topic, achieved: 0, total: 0 };
    agg.achieved += q.achievedPoints ?? 0;
    agg.total += q.points;
    byTopic.set(q.topic, agg);
  });
  const topicPerformance = [...byTopic.values()]
    .map(({ topic, achieved, total }) => ({ topic, score: total > 0 ? Math.round((achieved / total) * 100) : 0 }))
    .sort((a, b) => a.score - b.score);

  // ── Stärken: Themen ab 75% mit mindestens 3 Punkten Basis ──
  const strengths = topicPerformance
    .filter(tp => tp.score >= 75 && (byTopic.get(tp.topic)?.total ?? 0) >= 3)
    .slice(0, 3)
    .map(tp => t('es.an.strengthTopic', { topic: tp.topic, pct: tp.score }));

  // ── Schwächen: Themen unter 50% ──
  const weaknesses = topicPerformance
    .filter(tp => tp.score < 50)
    .slice(0, 4)
    .map(tp => t('es.an.weakTopic', { topic: tp.topic, pct: tp.score }));

  // ── Empfehlungen: feste Regeln, jede datenbegründet ──
  const recommendations: string[] = [];
  const weakest = topicPerformance[0];
  if (weakest && weakest.score < 60) {
    recommendations.push(t('es.an.recWeakest', { topic: weakest.topic, pct: weakest.score }));
  }
  // Open-Fragen-Score niedrig → Feynman/Erklären üben statt mehr Fakten
  const openQs = questions.filter(q => q.type === 'open' && q.points > 0);
  if (openQs.length >= 2) {
    const openScore = Math.round(
      (openQs.reduce((s, q) => s + (q.achievedPoints ?? 0), 0) / openQs.reduce((s, q) => s + q.points, 0)) * 100,
    );
    if (openScore < 60) recommendations.push(t('es.an.recOpen', { pct: openScore }));
  }
  // Transfer-Kategorie schwach → Transferfragen gezielt üben
  const transferQs = questions.filter(q => q.category === 'transfer' && q.points > 0);
  if (transferQs.length >= 2) {
    const transferScore = Math.round(
      (transferQs.reduce((s, q) => s + (q.achievedPoints ?? 0), 0) / transferQs.reduce((s, q) => s + q.points, 0)) * 100,
    );
    if (transferScore < 60) recommendations.push(t('es.an.recTransfer', { pct: transferScore }));
  }
  // Fatigue: deutlicher Abfall zweite Hälfte → kürzere Sessions/Pausen
  if (fatigue && fatigue.lateScore < fatigue.earlyScore - 15) {
    recommendations.push(t('es.an.recFatigue', { early: fatigue.earlyScore, late: fatigue.lateScore }));
  }
  // Fallback, wenn alles solide ist
  if (recommendations.length === 0) {
    recommendations.push(t('es.an.recSolid'));
  }

  return { strengths, weaknesses, recommendations, topicPerformance };
};

/** Type-Helper für i18n-Keys (verhindert Tippfehler in den TKey-Strings oben). */
export const EXAM_ANALYSIS_KEYS: TKey[] = [
  'es.an.strengthTopic', 'es.an.weakTopic', 'es.an.recWeakest',
  'es.an.recOpen', 'es.an.recTransfer', 'es.an.recFatigue', 'es.an.recSolid',
];
