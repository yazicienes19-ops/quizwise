import type { Chapter } from './chapterService';
import type { ReaderLogEntry } from './readerLogService';

export interface FeynmanHandoffInput {
  doneChapterIndices: number[];
  chapters: Chapter[];
  readerLog: ReaderLogEntry[];
}

export interface FeynmanHandoffResult {
  /** Themen mit echter Nachfrage in fertig gelesenen Kapiteln — stärkeres Signal, zuerst priorisiert. */
  primary: string[];
  /** Fertig gelesene Kapitel ohne jede Nachfrage — nur als Fallback, klar niedriger gewichtet. */
  fallback: string[];
}

/**
 * Gewichtungsregel: Fragen aus dem Erklärer-Chat sind ein stärkeres Lücken-Signal
 * als passives Lesen. Nur Fragen in Kapiteln, die auch als "fertig gelesen"
 * markiert wurden, zählen — offene Kapitel dürfen die Feynman-Runde nicht
 * mit noch nicht abgeschlossenem Stoff vorbelegen.
 */
export function buildFeynmanHandoff({ doneChapterIndices, chapters, readerLog }: FeynmanHandoffInput): FeynmanHandoffResult {
  const doneSet = new Set(doneChapterIndices);

  const relevantLog = readerLog
    .filter(e => doneSet.has(e.chapterIndex))
    .sort((a, b) => b.timestamp - a.timestamp);

  const seen = new Set<string>();
  const primary: string[] = [];
  for (const entry of relevantLog) {
    const key = entry.concept.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    primary.push(entry.concept.trim());
  }

  const askedChapterIndices = new Set(relevantLog.map(e => e.chapterIndex));
  const fallback = chapters
    .filter(c => doneSet.has(c.index) && !askedChapterIndices.has(c.index))
    .sort((a, b) => a.index - b.index)
    .map(c => c.title);

  return { primary, fallback };
}

export function pickHandoffTopic(result: FeynmanHandoffResult): string | null {
  return result.primary[0] ?? result.fallback[0] ?? null;
}
