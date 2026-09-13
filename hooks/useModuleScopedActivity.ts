import { useMemo } from 'react';
import type { Collection, ProcessedDocument } from '../types';
import { getAllResults, type QuizResult } from '../services/quizHistoryService';
import { getAllExamResults, type ExamResult } from '../services/examHistoryService';
import { getAllRecallResults, type RecallResult } from '../services/recallHistoryService';
import { buildModuleFilter, filterActivityByModule, type ModuleFilter } from '../services/moduleProgressService';

export interface ModuleScopedActivity {
  quizResults: QuizResult[];
  examResults: ExamResult[];
  recallResults: RecallResult[];
  /** Rohe {ids, names}-Filtermenge des aktiven Fachs, `null` bei "Alle Fächer" — für Konsumenten wie GapRadar. */
  moduleFilter: ModuleFilter | null;
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

  const moduleFilter = useMemo(
    () => (activeModule ? buildModuleFilter(activeModule, documents) : null),
    [activeModule, documents],
  );

  const { quizResults, examResults, recallResults } = useMemo(
    () => filterActivityByModule(
      { quizResults: allQuizResults, examResults: allExamResults, recallResults: allRecallResults },
      moduleFilter,
      dismissedTopics,
    ),
    [allQuizResults, allExamResults, allRecallResults, moduleFilter, dismissedTopics],
  );

  return { quizResults, examResults, recallResults, moduleFilter };
};
