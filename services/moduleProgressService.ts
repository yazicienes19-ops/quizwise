import type { Collection, FlashcardDeck, ProcessedDocument } from '../types';
import { collectionDocs } from './collectionSource';
import { documentDisplayName } from './libraryService';
import type { QuizResult } from './quizHistoryService';
import type { ExamResult } from './examHistoryService';
import type { RecallResult } from './recallHistoryService';
import { buildLearningScore } from './learningScoreService';
import { gradeFromPercentage } from './learningProfileService';

/** {ids, names}-Filtermenge eines Fachs: Ergebnisse tragen je nach Quelle nur docId oder nur den Anzeigenamen. */
export interface ModuleFilter {
  ids: Set<string>;
  names: Set<string>;
}

export interface ActivityResults {
  quizResults: QuizResult[];
  examResults: ExamResult[];
  recallResults: RecallResult[];
}

export const buildModuleFilter = (module: Collection, documents: ProcessedDocument[]): ModuleFilter => {
  const docs = collectionDocs(module, documents);
  return {
    ids: new Set(docs.map(d => d.id)),
    names: new Set([...docs.map(d => documentDisplayName(d)), `Ordner: ${module.name}`]),
  };
};

/** Filtert die Aktivitätshistorie auf ein Fach (`filter === null` = alle Fächer) und entfernt ausgeblendete Themen. */
export const filterActivityByModule = (
  all: ActivityResults,
  filter: ModuleFilter | null,
  dismissedTopics: Set<string>,
): ActivityResults => {
  const quizScoped = filter ? all.quizResults.filter(r => filter.ids.has(r.docId) || filter.names.has(r.docName)) : all.quizResults;
  const examScoped = filter ? all.examResults.filter(r => filter.names.has(r.docName)) : all.examResults;
  const recallScoped = filter ? all.recallResults.filter(r => filter.names.has(r.docName) || filter.names.has(r.topic)) : all.recallResults;
  return {
    quizResults: quizScoped
      .filter(r => !dismissedTopics.has(r.docName))
      .map(r => r.weakTopics.some(t => dismissedTopics.has(t)) ? { ...r, weakTopics: r.weakTopics.filter(t => !dismissedTopics.has(t)) } : r),
    examResults: examScoped
      .filter(r => !dismissedTopics.has(r.docName))
      .map(r => r.weakTopics.some(t => dismissedTopics.has(t)) ? { ...r, weakTopics: r.weakTopics.filter(t => !dismissedTopics.has(t)) } : r),
    recallResults: recallScoped.filter(r => !dismissedTopics.has(r.docName) && !dismissedTopics.has(r.topic)),
  };
};

export const decksOfModule = (decks: FlashcardDeck[], filter: ModuleFilter): FlashcardDeck[] =>
  decks.filter(d => d.sourceDocumentId && filter.ids.has(d.sourceDocumentId));

export interface ModuleProgress {
  id: string;
  name: string;
  /** Lernfortschritt 0–100; null, solange kein Lernbereich genug Daten hat. */
  percent: number | null;
  /** Note der Account-Notenskala (DE 1.0–5.0, TR AA–FF); null wie `percent`. */
  grade: string | null;
}

/**
 * Kompakte Fächer-Übersicht fürs Dashboard bei "Alle Fächer": pro Fach derselbe
 * Lernfortschritt, den die Fach-Detailansicht (und der Lern-Coach) für dieses
 * Fach zeigt, als Note. Fächer mit Daten zuerst, sonst in Sidebar-Reihenfolge.
 */
export const buildModuleProgressList = (input: {
  collections: Collection[];
  documents: ProcessedDocument[];
  decks: FlashcardDeck[];
  activity: ActivityResults;
}): ModuleProgress[] => {
  const rows = input.collections.map((c): ModuleProgress => {
    const filter = buildModuleFilter(c, input.documents);
    const scoped = filterActivityByModule(input.activity, filter, new Set());
    // Themen-Metriken tragen keine Fach-Zuordnung, daher wie im Lern-Coach in der Fach-Sicht weggelassen.
    const { overall } = buildLearningScore({ ...scoped, metrics: [], decks: decksOfModule(input.decks, filter), streakCurrent: 0 });
    return { id: c.id, name: c.name, percent: overall, grade: overall != null ? gradeFromPercentage(overall).grade : null };
  });
  return [...rows.filter(r => r.percent != null), ...rows.filter(r => r.percent == null)];
};
