import type { FlashcardDeck, TopicSecurity } from '../types';
import type { ExamResult } from './examHistoryService';
import { germanGradeFromPercentage } from './learningProfileService';

/**
 * examForecastService — faire, transparente Klausurprognose in drei Stufen.
 *
 * Stufe 1: Zeitlicher Zerfall — jedes Klausurergebnis verliert alle
 *          HALF_LIFE_DAYS die Hälfte seines Gewichts (0,5^(Alter/Halbwertszeit)).
 * Stufe 2: Trendprojektion — gewichtete lineare Trendlinie, ab
 *          MIN_EXAMS_FOR_TREND Klausuren auf den Klausurtermin projiziert
 *          (begrenzt auf realistische Veränderung).
 * Stufe 3: Mischprognose — Klausurleistung + Themensicherheit + Abrufstabilität.
 *
 * Alles deterministisch und in einfachen Worten erklärbar — die Formeln hier
 * müssen zum Transparenz-Text in der UI passen.
 */

// ─── Konfiguration (keine Magic Numbers im Code) ─────────────────────────────

export const FORECAST_CONFIG = {
  /** Halbwertszeit des Klausur-Gewichts in Tagen. */
  HALF_LIFE_DAYS: 14,
  /** Ab so vielen Klausuren gibt es Trend + punktgenaue Prognose. */
  MIN_EXAMS_FOR_TREND: 4,
  /** Mischgewichte der Endprognose (werden bei fehlenden Quellen renormalisiert). */
  MIX_WEIGHTS: { exam: 0.6, topics: 0.25, retention: 0.15 },
  /** Trend-Projektion darf das aktuelle Niveau um max. so viele Punkte verschieben. */
  MAX_TREND_SHIFT: 15,
  /** Trend-Einstufung: ± so viele Punkte pro Woche gelten als steigend/fallend. */
  TREND_PER_WEEK_THRESHOLD: 2,
  /** Prognosebereich: minimale/maximale halbe Breite in Punkten. */
  RANGE_HALF_MIN: 3,
  RANGE_HALF_MAX: 15,
  /** Vorläufige Prognosen (wenig Daten) bekommen mindestens diese halbe Breite. */
  RANGE_HALF_PRELIMINARY: 8,
  /** Karten gelten als stabil abrufbar ab diesem SRS-Intervall (Tage). */
  RETENTION_STABLE_INTERVAL: 7,
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;

// ─── Ergebnis-Typ ─────────────────────────────────────────────────────────────

export interface ExamForecast {
  /** Endprognose 0–100 (Mischwert aus allen Quellen). */
  expected: number;
  /** Ehrlicher Prognosebereich. */
  range: { low: number; high: number };
  confidence: 'hoch' | 'mittel' | 'gering';
  /** true bei weniger als MIN_EXAMS_FOR_TREND Klausuren. */
  preliminary: boolean;
  trend: 'steigend' | 'stabil' | 'fallend';
  trendAvailable: boolean;
  /** Projektion auf den nächsten Klausurtermin (falls vorhanden + Trend verfügbar). */
  projection: { date: string; value: number } | null;
  grade: string;
  passProbability: number;
  /** Teilwerte für den Transparenz-Text (null = Quelle nicht verfügbar). */
  parts: { examScore: number | null; topicShare: number | null; retentionShare: number | null };
  basis: { exams: number; topics: number; establishedCards: number };
}

export interface ForecastInput {
  examResults: ExamResult[];
  /** Themen-Sicherheit (echte Themen bevorzugt). */
  topicMastery: TopicSecurity[];
  decks: FlashcardDeck[];
  /** Nächster Klausurtermin YYYY-MM-DD (aus dem Kalender), falls vorhanden. */
  nextExamDate?: string | null;
  /** Injizierbar für deterministische Tests. */
  now?: Date;
}

// ─── Berechnung ───────────────────────────────────────────────────────────────

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export const buildExamForecast = (input: ForecastInput): ExamForecast | null => {
  const { examResults, topicMastery, decks } = input;
  const now = (input.now ?? new Date()).getTime();
  const C = FORECAST_CONFIG;

  if (examResults.length === 0) return null;

  // ── Stufe 1: zeitlich zerfallende Gewichte ──
  // Gewicht = 0,5^(Alter in Tagen / Halbwertszeit) — neu zählt stark, alt verblasst.
  const weighted = examResults.map(r => {
    const ageDays = Math.max(0, (now - r.timestamp) / DAY_MS);
    return { score: r.score, passed: r.passed, ageDays, weight: Math.pow(0.5, ageDays / C.HALF_LIFE_DAYS) };
  });
  const totalWeight = weighted.reduce((s, w) => s + w.weight, 0);
  const examScore = weighted.reduce((s, w) => s + w.score * w.weight, 0) / totalWeight;
  const passShare = (weighted.reduce((s, w) => s + (w.passed ? w.weight : 0), 0) / totalWeight) * 100;

  // ── Stufe 2: gewichteter linearer Trend (Punkte pro Tag) ──
  const trendAvailable = examResults.length >= C.MIN_EXAMS_FOR_TREND;
  let slopePerDay = 0;
  if (trendAvailable) {
    // t = Tage relativ zu heute (Vergangenheit negativ), gewichtete Regression
    const tMean = weighted.reduce((s, w) => s + -w.ageDays * w.weight, 0) / totalWeight;
    const yMean = examScore;
    let num = 0, den = 0;
    for (const w of weighted) {
      const t = -w.ageDays;
      num += w.weight * (t - tMean) * (w.score - yMean);
      den += w.weight * (t - tMean) * (t - tMean);
    }
    slopePerDay = den > 0 ? num / den : 0;
  }
  const perWeek = slopePerDay * 7;
  const trend: ExamForecast['trend'] = !trendAvailable ? 'stabil'
    : perWeek >= C.TREND_PER_WEEK_THRESHOLD ? 'steigend'
    : perWeek <= -C.TREND_PER_WEEK_THRESHOLD ? 'fallend'
    : 'stabil';

  // Projektion auf den Klausurtermin — begrenzt auf realistische Veränderung
  let projection: ExamForecast['projection'] = null;
  if (trendAvailable && input.nextExamDate) {
    const examTime = new Date(`${input.nextExamDate}T12:00:00`).getTime();
    const daysUntil = (examTime - now) / DAY_MS;
    if (!isNaN(examTime) && daysUntil > 0) {
      const raw = examScore + slopePerDay * daysUntil;
      const value = clamp(raw, examScore - C.MAX_TREND_SHIFT, examScore + C.MAX_TREND_SHIFT);
      projection = { date: input.nextExamDate, value: Math.round(clamp(value, 0, 100)) };
    }
  }

  // ── Stufe 3: Mischprognose ──
  const secureTopics = topicMastery.filter(t => t.security === 'sicher').length;
  const topicShare = topicMastery.length > 0 ? (secureTopics / topicMastery.length) * 100 : null;

  const established = decks.flatMap(d => d.cards).filter(c => c.srs && c.srs.repetitions > 0);
  const stable = established.filter(c => (c.srs?.interval ?? 0) >= C.RETENTION_STABLE_INTERVAL).length;
  const retentionShare = established.length > 0 ? (stable / established.length) * 100 : null;

  // Fehlende Quellen: Gewichte renormalisieren, damit die Summe wieder 1 ergibt
  const mixParts: { value: number; weight: number }[] = [{ value: examScore, weight: C.MIX_WEIGHTS.exam }];
  if (topicShare !== null) mixParts.push({ value: topicShare, weight: C.MIX_WEIGHTS.topics });
  if (retentionShare !== null) mixParts.push({ value: retentionShare, weight: C.MIX_WEIGHTS.retention });
  const mixWeight = mixParts.reduce((s, p) => s + p.weight, 0);
  const expected = Math.round(mixParts.reduce((s, p) => s + p.value * (p.weight / mixWeight), 0));

  // ── Ehrliche Unsicherheit: Bereich aus gewichteter Streuung ──
  const variance = weighted.reduce((s, w) => s + w.weight * (w.score - examScore) ** 2, 0) / totalWeight;
  const preliminary = examResults.length < C.MIN_EXAMS_FOR_TREND;
  let half = clamp(Math.sqrt(variance), C.RANGE_HALF_MIN, C.RANGE_HALF_MAX);
  if (preliminary) half = Math.max(half, C.RANGE_HALF_PRELIMINARY);
  const range = {
    low: Math.round(clamp(expected - half, 0, 100)),
    high: Math.round(clamp(expected + half, 0, 100)),
  };

  const sourceCount = 1 + (topicShare !== null ? 1 : 0) + (retentionShare !== null ? 1 : 0);
  const confidence: ExamForecast['confidence'] =
    !preliminary && sourceCount >= 2 ? 'hoch'
    : examResults.length >= 2 ? 'mittel'
    : 'gering';

  return {
    expected,
    range,
    confidence,
    preliminary,
    trend,
    trendAvailable,
    projection,
    grade: germanGradeFromPercentage(expected).grade,
    passProbability: Math.round(clamp(expected * 0.7 + passShare * 0.3, 0, 100)),
    parts: {
      examScore: Math.round(examScore),
      topicShare: topicShare !== null ? Math.round(topicShare) : null,
      retentionShare: retentionShare !== null ? Math.round(retentionShare) : null,
    },
    basis: { exams: examResults.length, topics: topicMastery.length, establishedCards: established.length },
  };
};
