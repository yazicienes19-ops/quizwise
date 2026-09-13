import { describe, it, expect, beforeEach } from 'vitest';
import { buildModuleProgressList } from './moduleProgressService';
import { setLocale } from '../i18n';
import type { QuizResult } from './quizHistoryService';
import type { RecallResult } from './recallHistoryService';
import type { Collection, ProcessedDocument } from '../types';

const col = (id: string, name: string): Collection => ({ id, name, emoji: '📘', color: '#000' });
const doc = (id: string, name: string, collectionId?: string) => ({ id, name, collectionId }) as unknown as ProcessedDocument;
const quiz = (docId: string, docName: string, score: number): QuizResult => ({
  id: `${docId}-${score}-${Math.random()}`, docId, docName, timestamp: Date.now(), score,
  correctCount: 0, totalCount: 10, weakTopics: [], questions: [], answers: [],
});
const recall = (docName: string, score: number): RecallResult => ({
  id: `${docName}-${score}-${Math.random()}`, docName, topic: 'Thema', timestamp: Date.now(), score, missingPoints: [],
});

describe('buildModuleProgressList', () => {
  beforeEach(() => setLocale('de'));

  const collections = [col('stat', 'Statistik'), col('bio', 'Biopsychologie'), col('leer', 'Sozialpsychologie')];
  const documents = [
    doc('d1', 'Statistik VL1.pdf', 'stat'),
    doc('d2', 'Bio VL1.pdf', 'bio'),
    doc('d3', 'Lose Datei.pdf'),
  ];

  it('bewertet jedes Fach nur mit den eigenen Ergebnissen und rechnet in eine Note um', () => {
    const list = buildModuleProgressList({
      collections, documents, decks: [],
      activity: {
        quizResults: [quiz('d1', 'Statistik VL1', 80), quiz('d1', 'Statistik VL1', 80), quiz('d2', 'Bio VL1', 40), quiz('d2', 'Bio VL1', 40), quiz('d3', 'Lose Datei', 100), quiz('d3', 'Lose Datei', 100)],
        examResults: [],
        recallResults: [],
      },
    });
    const byId = Object.fromEntries(list.map(m => [m.id, m]));
    expect(byId.stat).toMatchObject({ percent: 80, grade: '2.0' });
    expect(byId.bio).toMatchObject({ percent: 40, grade: '5.0' });
  });

  it('Fächer ohne ausreichende Daten haben keine Note und stehen hinten', () => {
    const list = buildModuleProgressList({
      collections: [col('leer', 'Sozialpsychologie'), ...collections.slice(0, 2)],
      documents, decks: [],
      activity: {
        quizResults: [quiz('d2', 'Bio VL1', 90), quiz('d2', 'Bio VL1', 90)],
        examResults: [],
        recallResults: [recall('Statistik VL1', 70), recall('Statistik VL1', 70)],
      },
    });
    expect(list.map(m => m.id)).toEqual(['stat', 'bio', 'leer']);
    expect(list[2]).toMatchObject({ percent: null, grade: null });
    expect(list[0]).toMatchObject({ percent: 70, grade: '2.7' });
  });
});
