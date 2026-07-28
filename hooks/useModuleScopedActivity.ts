import { useMemo } from 'react';
import type { Collection, ProcessedDocument } from '../types';
import { collectionDocs } from '../services/collectionSource';
import { documentDisplayName } from '../services/libraryService';
import { getAllResults, type QuizResult } from '../services/quizHistoryService';
import { getAllExamResults, type ExamResult } from '../services/examHistoryService';
import { getAllRecallResults, type RecallResult } from '../services/recallHistoryService';

export interface ModuleScopedActivity {
  quizResults: QuizResult[];
  examResults: ExamResult[];
  recallResults: RecallResult[];
  /** Rohe {ids, names}-Filtermenge des aktiven Fachs, `null` bei "Alle Fächer" — für Konsumenten wie GapRadar. */
  moduleFilter: { ids: Set<string>; names: Set<string> } | null;
}

/**
 * Lädt die komplette Aktivitätshistorie (Quiz/Klausur/Erklären) und filtert sie
 * bei aktivem Fach (Variante C) auf dieses Fach + entfernt manuell ausgeblendete
 * Themen (dismissedTopics) — dieselbe Logik wie zuvor im Lern-Coach, jetzt
 * gemeinsam genutzt, damit Coach und Dashboard für dasselbe Fach identische
 * Zahlen zeigen.
 */
export const useModuleScopedActivity = (
  activeModule: Collection | null,
  documents: ProcessedDocument[],
  dismissedTopics: Set<string>,
): ModuleScopedActivity => {
  const allQuizResults = useMemo(() => getAllResults(), []);
  const allExamResults = useMemo(() => getAllExamResults(), []);
  const allRecallResults = useMemo(() => getAllRecallResults(), []);

  const moduleFilter = useMemo(() => {
    if (!activeModule) return null;
    const docs = collectionDocs(activeModule, documents);
    const ids = new Set(docs.map(d => d.id));
    const names = new Set([...docs.map(d => documentDisplayName(d)), `Ordner: ${activeModule.name}`]);
    return { ids, names };
  }, [activeModule, documents]);

  const quizResults = useMemo(() => {
    const scoped = moduleFilter ? allQuizResults.filter(r => moduleFilter.ids.has(r.docId) || moduleFilter.names.has(r.docName)) : allQuizResults;
    return scoped
      .filter(r => !dismissedTopics.has(r.docName))
      .map(r => r.weakTopics.some(t => dismissedTopics.has(t)) ? { ...r, weakTopics: r.weakTopics.filter(t => !dismissedTopics.has(t)) } : r);
  }, [allQuizResults, moduleFilter, dismissedTopics]);

  const examResults = useMemo(() => {
    const scoped = moduleFilter ? allExamResults.filter(r => moduleFilter.names.has(r.docName)) : allExamResults;
    return scoped
      .filter(r => !dismissedTopics.has(r.docName))
      .map(r => r.weakTopics.some(t => dismissedTopics.has(t)) ? { ...r, weakTopics: r.weakTopics.filter(t => !dismissedTopics.has(t)) } : r);
  }, [allExamResults, moduleFilter, dismissedTopics]);

  const recallResults = useMemo(() => {
    const scoped = moduleFilter ? allRecallResults.filter(r => moduleFilter.names.has(r.docName) || moduleFilter.names.has(r.topic)) : allRecallResults;
    return scoped.filter(r => !dismissedTopics.has(r.docName) && !dismissedTopics.has(r.topic));
  }, [allRecallResults, moduleFilter, dismissedTopics]);

  return { quizResults, examResults, recallResults, moduleFilter };
};
