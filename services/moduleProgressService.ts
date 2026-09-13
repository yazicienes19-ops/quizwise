import type { Collection, FlashcardDeck, ProcessedDocument } from '../types';
import { collectionDocs } from './collectionSource';
import { documentDisplayName } from './libraryService';
import type { QuizResult } from './quizHistoryService';
import type { ExamResult } from './examHistoryService';
import type { RecallResult } from './recallHistoryService';

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
