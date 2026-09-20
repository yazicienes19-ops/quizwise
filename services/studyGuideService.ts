import { ActiveTab } from '../types';
import type { Collection, ExamTerm, FlashcardDeck, ProcessedDocument } from '../types';
import { collectionDocs, isDocumentReadable } from './collectionSource';
import { documentDisplayName } from './libraryService';
import { passThresholdPercent } from './learningProfileService';
import { nextExamForModule } from './examTermService';
import { sortModuleRows, type ModuleRow } from './homeOverviewService';
import type { ActivityResults } from './moduleProgressService';

/**
 * studyGuideService — der Leitfaden eines Fachs: die vier Phasen eines
 * Lernwegs (Überblick, Verstehen, Üben, Prüfen), wo der Nutzer darin steht
 * und was als Nächstes dran ist.
 *
 * Der Leitfaden RECHNET NICHTS NEU: er ordnet die Daten, die Startseite,
 * Lern-Coach und Planer ohnehin führen, entlang eines Wegs an. Jede Zahl ist
 * abzählbar und benennbar ("3 von 7 Quellen erklärt") — nichts wird geschätzt
 * und nichts erfunden. Ohne Quellen im Fach gibt es keinen Leitfaden (null).
 *
 * Zuordnung der Sessions: Ergebnisse tragen je nach Quelle die docId oder nur
 * den Anzeigenamen. Eine Session auf den GANZEN Ordner ("Ordner: <Fach>", s.
 * collectionSource.ts) zählt für alle lesbaren Quellen des Fachs, weil genau
 * die zusammen ihre Wissensbasis gebildet haben.
 */

export type GuidePhaseKey = 'ueberblick' | 'verstehen' | 'ueben' | 'pruefen';
export type GuidePhaseState = 'done' | 'current' | 'open';
/** Was die Zahlen einer Phase zählen. */
export type GuideUnit = 'sources' | 'simulations';

export interface GuidePhase {
  key: GuidePhaseKey;
  state: GuidePhaseState;
  done: number;
  total: number;
  unit: GuideUnit;
}

export interface GuideNextStep {
  phase: GuidePhaseKey;
  tab: ActiveTab;
  /** Konkrete Quelle, an der es weitergeht; null wenn die Phase am ganzen Fach hängt. */
  sourceName: string | null;
  sourceId: string | null;
}

export interface StudyGuide {
  moduleId: string;
  moduleName: string;
  phases: GuidePhase[];
  /** null = alle vier Phasen abgeschlossen. */
  next: GuideNextStep | null;
  daysUntilExam: number | null;
  examTitle: string | null;
}

/** Bestandene Simulationen, ab denen die Phase „Prüfen" als abgeschlossen gilt (wie der Lern-Coach ab 2 Klausuren wertet). */
const REQUIRED_SIMULATIONS = 2;

/** Bereich, in dem eine Phase bearbeitet wird. */
export const GUIDE_PHASE_TAB: Record<GuidePhaseKey, ActiveTab> = {
  ueberblick: ActiveTab.LIBRARY,
  verstehen: ActiveTab.RECALL,
  ueben: ActiveTab.QUIZ,
  pruefen: ActiveTab.EXAM,
};

/**
 * Wählt das Fach, dessen Leitfaden die Startseite zeigt: das aktive Fach,
 * sonst das dringendste nach der Sortierung der Modultabelle. Doppelt
 * angelegte Fächer bleiben außen vor, sie gehören aufgeräumt statt gelernt.
 */
export const selectGuideModuleId = (rows: ModuleRow[], activeModuleId: string | null): string | null => {
  if (activeModuleId && rows.some(r => r.id === activeModuleId)) return activeModuleId;
  return sortModuleRows(rows.filter(r => !r.duplicate), 'urgency')[0]?.id ?? null;
};

export const buildStudyGuide = (input: {
  module: Collection;
  documents: ProcessedDocument[];
  decks: FlashcardDeck[];
  /** Aktivität ALLER Fächer, wird hier auf das Fach eingegrenzt. */
  activity: ActivityResults;
  examTerms: ExamTerm[];
  now: Date;
}): StudyGuide | null => {
  const { module, documents, decks, activity, examTerms, now } = input;

  const docs = collectionDocs(module, documents);
  if (docs.length === 0) return null;

  const folderName = `Ordner: ${module.name}`;
  const nameOf = new Map(docs.map(d => [d.id, documentDisplayName(d)]));
  const ownName = (name: string | undefined): boolean => !!name && [...nameOf.values()].includes(name);

  // Sessions auf den ganzen Ordner: zählen für jede lesbare Quelle des Fachs.
  const folderQuiz = activity.quizResults.some(r => r.docName === folderName);
  const folderRecall = activity.recallResults.some(r => r.docName === folderName || r.topic === folderName);

  const quizNames = new Set(activity.quizResults.map(r => r.docName));
  const quizIds = new Set(activity.quizResults.map(r => r.docId));
  const recallNames = new Set([...activity.recallResults.map(r => r.docName), ...activity.recallResults.map(r => r.topic)]);

  // Karteikarten zählen erst als geübt, wenn eine Karte des Stapels wirklich wiederholt wurde.
  const practisedCardDocs = new Set(
    decks
      .filter(d => d.sourceDocumentId && d.cards.some(c => (c.srs?.repetitions ?? 0) > 0))
      .map(d => d.sourceDocumentId as string),
  );

  const readable = docs.filter(isDocumentReadable);
  const explained = readable.filter(d => folderRecall || recallNames.has(nameOf.get(d.id) as string));
  const practised = readable.filter(
    d => folderQuiz || quizIds.has(d.id) || quizNames.has(nameOf.get(d.id) as string) || practisedCardDocs.has(d.id),
  );

  // Klausur-Simulationen des Fachs (Ergebnisse tragen nur den Namen, nie die docId).
  const passMark = passThresholdPercent();
  const passedSimulations = activity.examResults.filter(
    r => (r.docName === folderName || ownName(r.docName)) && r.score >= passMark,
  ).length;

  const raw: { key: GuidePhaseKey; done: number; total: number; unit: GuideUnit }[] = [
    { key: 'ueberblick', done: readable.length, total: docs.length, unit: 'sources' },
    { key: 'verstehen', done: explained.length, total: readable.length, unit: 'sources' },
    { key: 'ueben', done: practised.length, total: readable.length, unit: 'sources' },
    { key: 'pruefen', done: Math.min(passedSimulations, REQUIRED_SIMULATIONS), total: REQUIRED_SIMULATIONS, unit: 'simulations' },
  ];

  const complete = (p: { done: number; total: number }) => p.total > 0 && p.done >= p.total;
  const currentIndex = raw.findIndex(p => !complete(p));

  const phases: GuidePhase[] = raw.map((p, i) => ({
    ...p,
    state: complete(p) ? 'done' : i === currentIndex ? 'current' : 'open',
  }));

  const nextSource =
    currentIndex === 0 ? docs.find(d => !isDocumentReadable(d))
      : currentIndex === 1 ? readable.find(d => !explained.includes(d))
      : currentIndex === 2 ? readable.find(d => !practised.includes(d))
      : undefined;

  const currentKey = currentIndex >= 0 ? raw[currentIndex].key : null;
  const term = nextExamForModule(examTerms, module, now);

  return {
    moduleId: module.id,
    moduleName: module.name,
    phases,
    next: currentKey
      ? {
          phase: currentKey,
          tab: GUIDE_PHASE_TAB[currentKey],
          sourceName: nextSource ? (nameOf.get(nextSource.id) as string) : null,
          sourceId: nextSource?.id ?? null,
        }
      : null,
    daysUntilExam: term?.days ?? null,
    examTitle: term?.title ?? null,
  };
};
