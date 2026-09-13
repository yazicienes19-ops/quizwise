import { describe, it, expect, beforeEach } from 'vitest';
import { buildModuleRows, sortModuleRows, buildHomeKpis, termMatchesModule, formatGrade } from './homeOverviewService';
import { setLocale } from '../i18n';
import type { ExamResult } from './examHistoryService';
import type { QuizResult } from './quizHistoryService';
import type { MistakeItem } from './mistakeReviewService';
import type { Collection, ExamTerm, ProcessedDocument } from '../types';

const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-09-13T12:00:00');

const col = (id: string, name: string): Collection => ({ id, name, emoji: '📘', color: '#000' });
const doc = (id: string, name: string, collectionId?: string) => ({ id, name, collectionId }) as unknown as ProcessedDocument;
const exam = (docName: string, score: number, daysAgo = 1): ExamResult => ({
  id: `${docName}-${score}-${daysAgo}`, docName, timestamp: now.getTime() - daysAgo * DAY, score,
  passed: score >= 50, totalPoints: 100, achievedPoints: score, weakTopics: [],
});
const quiz = (docId: string, docName: string, score: number, totalCount: number, daysAgo = 1): QuizResult => ({
  id: `${docId}-${score}-${totalCount}-${daysAgo}`, docId, docName, timestamp: now.getTime() - daysAgo * DAY, score,
  correctCount: 0, totalCount, weakTopics: [], questions: [], answers: [],
});
const mistake = (docId: string, docName: string, id: string): MistakeItem => ({
  id, question: {} as MistakeItem['question'], docId, docName, addedAt: 0, lapses: 0, srs: {} as MistakeItem['srs'],
});
const term = (title: string, date: string): ExamTerm => ({ id: title, title, date, topics: [] });

const collections = [
  col('stat', 'Statistik I'),
  col('bio', 'Biologische Psychologie'),
  col('allg', 'Allgemeine Psychologie I'),
  col('neu', 'Sozialpsychologie'),
  col('dup', 'Statistik I'),
];
const documents = [doc('d1', 'Statistik VL1.pdf', 'stat'), doc('d2', 'Bio VL1.pdf', 'bio'), doc('d3', 'Allg VL1.pdf', 'allg')];
const empty = { quizResults: [], examResults: [], recallResults: [] };
const examTerms = [term('Klausur Statistik I', '2026-10-07'), term('Alte Klausur', '2026-01-01')];

describe('termMatchesModule', () => {
  it('ordnet nur über ganze Wörter zu', () => {
    expect(termMatchesModule('Klausur Statistik I', 'Statistik I')).toBe(true);
    expect(termMatchesModule('Klausur Statistik II', 'Statistik I')).toBe(false);
    expect(termMatchesModule('Bio', 'Biologische Psychologie')).toBe(false);
  });
});

describe('buildModuleRows', () => {
  beforeEach(() => setLocale('de'));

  const build = () => buildModuleRows({
    collections, documents, decks: [], now, examTerms,
    activity: { ...empty, examResults: [exam('Statistik VL1', 80), exam('Statistik VL1', 70), exam('Bio VL1', 50)] },
    dueMistakes: [mistake('d3', 'Allg VL1', 'm1'), mistake('d3', 'Allg VL1', 'm2')],
  });

  it('Note ist der Ø der Simulator-Ergebnisse je Modul', () => {
    const byId = Object.fromEntries(build().map(r => [r.id, r]));
    expect(byId.stat).toMatchObject({ examPercent: 75, grade: '2.3', weak: false });
    expect(byId.bio).toMatchObject({ examPercent: 50, grade: '4.0', weak: true, nextStep: 'rebuild' });
    expect(byId.neu).toMatchObject({ examPercent: null, grade: null, learningPercent: null, nextStep: 'placement' });
  });

  it('zählt offene Fehlerfragen, ordnet Termine zu und markiert Duplikate', () => {
    const byId = Object.fromEntries(build().map(r => [r.id, r]));
    expect(byId.allg).toMatchObject({ openErrors: 2, nextStep: 'mistakes' });
    expect(byId.stat.nextTerm).toMatchObject({ date: '2026-10-07', days: 24 });
    expect(byId.bio.nextTerm).toBeNull();
    expect(byId.stat.duplicate).toBe(false);
    expect(byId.dup).toMatchObject({ duplicate: true, nextStep: 'cleanup' });
  });

  it('Lernstand je Modul nur aus den eigenen Ergebnissen', () => {
    const rows = buildModuleRows({
      collections, documents, decks: [], now, examTerms: [], dueMistakes: [],
      activity: { ...empty, quizResults: [quiz('d1', 'Statistik VL1', 80, 10), quiz('d1', 'Statistik VL1', 80, 10)] },
    });
    const byId = Object.fromEntries(rows.map(r => [r.id, r]));
    expect(byId.stat.learningPercent).toBe(80);
    expect(byId.bio.learningPercent).toBeNull();
  });

  it('sortiert nach Dringlichkeit, Note und A–Z', () => {
    const rows = build();
    expect(sortModuleRows(rows, 'urgency').map(r => r.id)).toEqual(['stat', 'dup', 'allg', 'bio', 'neu']);
    expect(sortModuleRows(rows, 'grade').map(r => r.id)).toEqual(['stat', 'bio', 'allg', 'neu', 'dup']);
    expect(sortModuleRows(rows, 'alpha').map(r => r.id)).toEqual(['allg', 'bio', 'neu', 'stat', 'dup']);
  });
});

describe('buildHomeKpis', () => {
  beforeEach(() => setLocale('de'));

  it('Kennzahlen aus Terminen, Simulator-Noten und Fragen der letzten 7 Tage', () => {
    const activity = {
      ...empty,
      examResults: [exam('Statistik VL1', 75), exam('Bio VL1', 50)],
      quizResults: [quiz('d1', 'Statistik VL1', 70, 10, 1), quiz('d1', 'Statistik VL1', 70, 20, 9)],
    };
    const rows = buildModuleRows({ collections, documents, decks: [], activity, dueMistakes: [], examTerms, now });
    expect(buildHomeKpis({ rows, examTerms, activity, now })).toEqual({
      nextExamDays: 24,
      gradeAverage: '3.3',
      examsWritten: 2,
      examsTotal: 5,
      weeklyQuestions: 10,
    });
  });

  it('formatiert deutsche Noten mit Komma', () => {
    expect(formatGrade('2.3', 'de')).toBe('2,3');
    expect(formatGrade('2.3', 'en')).toBe('2.3');
  });
});
