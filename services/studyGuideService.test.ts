import { describe, it, expect, beforeEach } from 'vitest';
import { buildStudyGuide, selectGuideModuleId } from './studyGuideService';
import { buildModuleRows } from './homeOverviewService';
import { setLocale } from '../i18n';
import { ActiveTab } from '../types';
import type { Collection, ExamTerm, FlashcardDeck, ProcessedDocument } from '../types';
import type { ExamResult } from './examHistoryService';
import type { QuizResult } from './quizHistoryService';
import type { RecallResult } from './recallHistoryService';

const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-09-20T12:00:00');

const stat: Collection = { id: 'stat', name: 'Statistik I', emoji: '📘', color: '#000' };

/** Lesbare Quelle (Digest fertig) bzw. noch nicht aufbereitete Quelle. */
const doc = (id: string, name: string, ready = true): ProcessedDocument => ({
  id, name, content: '', type: 'pdf', uploadDate: 0, collectionId: 'stat',
  digestText: ready ? 'Inhalt' : undefined, digestStatus: ready ? 'ready' : 'pending',
});
const quiz = (docId: string, docName: string): QuizResult => ({
  id: `q-${docId}-${docName}`, docId, docName, timestamp: now.getTime() - DAY, score: 70,
  correctCount: 7, totalCount: 10, weakTopics: [], questions: [], answers: [],
});
const recall = (docName: string, topic = ''): RecallResult => ({
  id: `r-${docName}-${topic}`, docName, topic, timestamp: now.getTime() - DAY, score: 80, missingPoints: [],
});
const exam = (docName: string, score: number): ExamResult => ({
  id: `e-${docName}-${score}`, docName, timestamp: now.getTime() - DAY, score, passed: score >= 50,
  totalPoints: 100, achievedPoints: score, weakTopics: [],
});
const deck = (sourceDocumentId: string, repetitions: number): FlashcardDeck => ({
  id: `d-${sourceDocumentId}`, title: 'Stapel', sourceDocumentId,
  cards: [{ id: 'c1', front: 'a', back: 'b', level: 0, nextReview: 0, srs: { repetitions, interval: 6, ease: 2.5, nextReview: 0, lastReview: null } }],
});

const documents = [doc('d1', 'VL1.pdf'), doc('d2', 'VL2.pdf')];
const empty = { quizResults: [], examResults: [], recallResults: [] };
const build = (over: Partial<Parameters<typeof buildStudyGuide>[0]> = {}) =>
  buildStudyGuide({ module: stat, documents, decks: [], activity: empty, examTerms: [], now, ...over });

describe('buildStudyGuide', () => {
  beforeEach(() => setLocale('de'));

  it('ohne Quellen im Fach gibt es keinen Leitfaden', () => {
    expect(build({ documents: [] })).toBeNull();
  });

  it('nicht aufbereitete Quellen halten den Weg in Phase 1', () => {
    const guide = build({ documents: [doc('d1', 'VL1.pdf'), doc('d2', 'VL2.pdf', false)] })!;
    expect(guide.phases.map(p => p.state)).toEqual(['current', 'open', 'open', 'open']);
    expect(guide.phases[0]).toMatchObject({ done: 1, total: 2, unit: 'sources' });
    expect(guide.next).toMatchObject({ phase: 'ueberblick', tab: ActiveTab.LIBRARY, sourceName: 'VL2', sourceId: 'd2' });
  });

  it('zählt erklärte Quellen und nennt die nächste offene beim Namen', () => {
    const guide = build({ activity: { ...empty, recallResults: [recall('VL1')] } })!;
    expect(guide.phases[0].state).toBe('done');
    expect(guide.phases[1]).toMatchObject({ state: 'current', done: 1, total: 2 });
    expect(guide.next).toMatchObject({ phase: 'verstehen', tab: ActiveTab.RECALL, sourceName: 'VL2' });
  });

  it('Quiz und wiederholte Karteikarten zählen beide als geübt', () => {
    const activity = { ...empty, recallResults: [recall('VL1'), recall('VL2')], quizResults: [quiz('d1', 'VL1')] };
    expect(build({ activity }).phases[2]).toMatchObject({ state: 'current', done: 1, total: 2 });
    expect(build({ activity, decks: [deck('d2', 3)] }).phases[2]).toMatchObject({ state: 'done', done: 2 });
    // Ein Stapel, der noch nie wiederholt wurde, zählt nicht.
    expect(build({ activity, decks: [deck('d2', 0)] }).phases[2].done).toBe(1);
  });

  it('eine Session auf den ganzen Ordner zählt für alle Quellen des Fachs', () => {
    const guide = build({ activity: { ...empty, recallResults: [recall('Ordner: Statistik I')] } })!;
    expect(guide.phases[1]).toMatchObject({ state: 'done', done: 2, total: 2 });
  });

  it('Prüfen verlangt zwei bestandene Simulationen, durchgefallene zählen nicht', () => {
    const base = { ...empty, recallResults: [recall('VL1'), recall('VL2')], quizResults: [quiz('d1', 'VL1'), quiz('d2', 'VL2')] };
    expect(build({ activity: { ...base, examResults: [exam('VL1', 80), exam('VL2', 40)] } }).phases[3])
      .toMatchObject({ state: 'current', done: 1, total: 2, unit: 'simulations' });

    const done = build({ activity: { ...base, examResults: [exam('VL1', 80), exam('VL2', 60)] } })!;
    expect(done.phases.map(p => p.state)).toEqual(['done', 'done', 'done', 'done']);
    expect(done.next).toBeNull();
  });

  it('eine abgeschlossene spätere Phase bleibt abgeschlossen, auch wenn davor etwas fehlt', () => {
    const guide = build({ activity: { ...empty, quizResults: [quiz('d1', 'VL1'), quiz('d2', 'VL2')] } })!;
    expect(guide.phases.map(p => p.state)).toEqual(['done', 'current', 'done', 'open']);
    expect(guide.next?.phase).toBe('verstehen');
  });

  it('übernimmt den nächsten Klausurtermin des Fachs', () => {
    const terms: ExamTerm[] = [{ id: 't1', title: 'Klausur Statistik I', date: '2026-10-16', topics: [], collectionId: 'stat' }];
    expect(build({ examTerms: terms })).toMatchObject({ daysUntilExam: 26, examTitle: 'Klausur Statistik I' });
    expect(build().daysUntilExam).toBeNull();
  });
});

describe('selectGuideModuleId', () => {
  const collections: Collection[] = [
    { id: 'bio', name: 'Biologische Psychologie', emoji: '🧠', color: '#000' },
    stat,
    { id: 'dup', name: 'Statistik I', emoji: '📘', color: '#000' },
  ];
  const rows = buildModuleRows({
    collections,
    documents: [doc('d1', 'VL1.pdf'), { ...doc('d3', 'Bio.pdf'), collectionId: 'bio' }],
    decks: [], activity: empty, dueMistakes: [], now,
    examTerms: [{ id: 't1', title: 'Klausur Statistik I', date: '2026-10-16', topics: [], collectionId: 'stat' }],
  });

  it('bevorzugt das aktive Fach', () => {
    expect(selectGuideModuleId(rows, 'bio')).toBe('bio');
  });

  it('ohne aktives Fach das dringendste, nie ein doppelt angelegtes', () => {
    expect(selectGuideModuleId(rows, null)).toBe('stat');
    expect(selectGuideModuleId(rows, 'weg')).toBe('stat');
    expect(selectGuideModuleId([], null)).toBeNull();
  });
});
