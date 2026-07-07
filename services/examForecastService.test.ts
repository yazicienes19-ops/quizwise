import { describe, it, expect } from 'vitest';
import { buildExamForecast, FORECAST_CONFIG } from './examForecastService';
import type { ExamResult } from './examHistoryService';
import type { FlashcardDeck, TopicSecurity } from '../types';

const NOW = new Date(2026, 6, 15); // 15.07.2026, injiziert für Determinismus
const daysAgo = (d: number) => NOW.getTime() - d * 86400000;

const mkExam = (score: number, ageDays: number): ExamResult => ({
  id: Math.random().toString(36).slice(2, 9), docName: 'D', timestamp: daysAgo(ageDays),
  score, passed: score >= 50, totalPoints: 100, achievedPoints: score, weakTopics: [],
});

const mkTopics = (sicher: number, unsicher: number): TopicSecurity[] => [
  ...Array.from({ length: sicher }, (_, i) => ({ topic: `S${i}`, confidence: 90, security: 'sicher' as const, weakCount: 0 })),
  ...Array.from({ length: unsicher }, (_, i) => ({ topic: `U${i}`, confidence: 40, security: 'unsicher' as const, weakCount: 1 })),
];

const mkDecks = (stable: number, unstable: number): FlashcardDeck[] => [{
  id: 'd', title: 'T',
  cards: [
    ...Array.from({ length: stable }, (_, i) => ({ id: `s${i}`, front: 'F', back: 'B', level: 2, nextReview: 0, srs: { ease: 2.5, interval: 10, repetitions: 2, nextReview: 0, lastReview: 0 } })),
    ...Array.from({ length: unstable }, (_, i) => ({ id: `u${i}`, front: 'F', back: 'B', level: 1, nextReview: 0, srs: { ease: 2.5, interval: 2, repetitions: 1, nextReview: 0, lastReview: 0 } })),
  ],
}];

const base = { topicMastery: [] as TopicSecurity[], decks: [] as FlashcardDeck[], now: NOW };

describe('buildExamForecast — Stufe 1: zeitlicher Zerfall', () => {
  it('null ohne Klausuren', () => {
    expect(buildExamForecast({ ...base, examResults: [] })).toBeNull();
  });

  it('neue Klausur zählt stärker als alte (Halbwertszeit)', () => {
    // Alt (28 Tage = 2 Halbwertszeiten, Gewicht 0.25) 40% + neu (heute, Gewicht 1) 80%
    const f = buildExamForecast({ ...base, examResults: [mkExam(80, 0), mkExam(40, 28)] })!;
    // Erwartet: (80*1 + 40*0.25) / 1.25 = 72
    expect(f.parts.examScore).toBe(72);
  });

  it('gleiches Alter → einfacher Durchschnitt', () => {
    const f = buildExamForecast({ ...base, examResults: [mkExam(60, 5), mkExam(80, 5)] })!;
    expect(f.parts.examScore).toBe(70);
  });
});

describe('buildExamForecast — Stufe 2: Trend + Projektion', () => {
  const improving = [mkExam(40, 21), mkExam(50, 14), mkExam(60, 7), mkExam(70, 0)];

  it('kein Trend unter 4 Klausuren → vorläufig mit breitem Bereich', () => {
    const f = buildExamForecast({ ...base, examResults: improving.slice(0, 3) })!;
    expect(f.trendAvailable).toBe(false);
    expect(f.preliminary).toBe(true);
    expect(f.range.high - f.range.low).toBeGreaterThanOrEqual(FORECAST_CONFIG.RANGE_HALF_PRELIMINARY * 2 - 1);
    expect(f.projection).toBeNull();
  });

  it('erkennt steigenden Trend ab 4 Klausuren', () => {
    const f = buildExamForecast({ ...base, examResults: improving })!;
    expect(f.trendAvailable).toBe(true);
    expect(f.trend).toBe('steigend');
    expect(f.preliminary).toBe(false);
  });

  it('erkennt fallenden Trend', () => {
    const declining = [mkExam(80, 21), mkExam(70, 14), mkExam(60, 7), mkExam(50, 0)];
    expect(buildExamForecast({ ...base, examResults: declining })!.trend).toBe('fallend');
  });

  it('projiziert auf den Klausurtermin, begrenzt auf MAX_TREND_SHIFT', () => {
    const f = buildExamForecast({ ...base, examResults: improving, nextExamDate: '2026-09-15' })!; // 62 Tage hin
    expect(f.projection).not.toBeNull();
    expect(f.projection!.date).toBe('2026-09-15');
    // Steigung ~10 Punkte/Woche × 62 Tage wäre unrealistisch → auf +15 gedeckelt
    expect(f.projection!.value).toBeLessThanOrEqual(f.parts.examScore! + FORECAST_CONFIG.MAX_TREND_SHIFT);
  });

  it('keine Projektion für Termine in der Vergangenheit', () => {
    const f = buildExamForecast({ ...base, examResults: improving, nextExamDate: '2026-07-01' })!;
    expect(f.projection).toBeNull();
  });
});

describe('buildExamForecast — Stufe 3: Mischprognose', () => {
  const exams = [mkExam(60, 0), mkExam(60, 7), mkExam(60, 14), mkExam(60, 21)];

  it('mischt Klausur + Themen + Karten mit 60/25/15', () => {
    const f = buildExamForecast({
      ...base, examResults: exams,
      topicMastery: mkTopics(8, 2),   // 80% sicher
      decks: mkDecks(10, 0),           // 100% stabil
    })!;
    // 0.6*60 + 0.25*80 + 0.15*100 = 71
    expect(f.expected).toBe(71);
    expect(f.parts.topicShare).toBe(80);
    expect(f.parts.retentionShare).toBe(100);
  });

  it('renormalisiert Gewichte wenn Quellen fehlen', () => {
    const f = buildExamForecast({ ...base, examResults: exams })!;
    expect(f.expected).toBe(60); // nur Klausur-Quelle → 100% deren Wert
    expect(f.parts.topicShare).toBeNull();
    expect(f.parts.retentionShare).toBeNull();
  });

  it('Vertrauen: hoch braucht >= 4 Klausuren UND zweite Quelle', () => {
    expect(buildExamForecast({ ...base, examResults: exams })!.confidence).toBe('mittel');
    expect(buildExamForecast({ ...base, examResults: exams, topicMastery: mkTopics(3, 1) })!.confidence).toBe('hoch');
    expect(buildExamForecast({ ...base, examResults: [mkExam(50, 0)] })!.confidence).toBe('gering');
  });

  it('ist deterministisch', () => {
    const input = { ...base, examResults: exams, topicMastery: mkTopics(2, 2), decks: mkDecks(5, 5) };
    expect(buildExamForecast(input)).toEqual(buildExamForecast(input));
  });
});
