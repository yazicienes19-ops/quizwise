import type { Collection } from '../types';
import type { StudioSourceRef } from './studioStore';

/**
 * Tutor- und Reader-Antworten als Notiz ins Lernstudio des Fachs
 * (components/SaveNoteButton.tsx). Die Frage wird zum Titel, die Antwort zum
 * Inhalt. Stammt die Antwort aus einem Dokument, wird es Quelle 1 der Notiz;
 * mit Seite entsteht eine Fußnote [1:Seite], die im Lernstudio zur Seite springt.
 */

export interface AnswerNoteInput {
  question: string;
  answer: string;
  /** Wörtliches Zitat aus der Quelle, auf das sich die Antwort stützt. */
  quote?: string | null;
  source?: { docId: string; name: string; page?: number } | null;
}

export const NOTE_TITLE_MAX = 90;

export const buildAnswerNote = (input: AnswerNoteInput): { title: string; markdown: string; sources: StudioSourceRef[] } => {
  const question = input.question.replace(/\s+/g, ' ').trim();
  const title = question.length > NOTE_TITLE_MAX ? `${question.slice(0, NOTE_TITLE_MAX - 1).trimEnd()}…` : question;
  const cite = input.source ? (input.source.page ? ` [1:${input.source.page}]` : ' [1]') : '';
  const quote = input.quote?.trim();
  const parts = [input.answer.trim()];
  if (quote) parts.push(`*„${quote.replace(/\*/g, '')}“*${cite}`);
  else if (cite) parts[0] = `${parts[0]}${cite}`;
  return {
    title: title || 'Notiz',
    markdown: parts.join('\n\n'),
    sources: input.source ? [{ n: 1, docId: input.source.docId, name: input.source.name }] : [],
  };
};

/** Fächer aus dem lokalen Zwischenspeicher (hooks/useDocuments.ts), für Ansichten ohne collections-Prop. */
export const cachedCollections = (): Collection[] => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem('studearc_collections') ?? '[]');
    return Array.isArray(parsed) ? parsed as Collection[] : [];
  } catch { return []; }
};

/** Fach für eine Notiz: ausdrücklich gesetzt, sonst das aktive Fach, sonst keins (dann fragt der Knopf). */
export const resolveNoteCollection = (explicitId: string | null | undefined, collections: Collection[]): Collection | null => {
  const byId = (id: string | null | undefined) => (id ? collections.find(c => c.id === id) ?? null : null);
  let active: string | null = null;
  try { active = localStorage.getItem('studearc_active_module'); } catch { /* ohne Speicher kein aktives Fach */ }
  return byId(explicitId) ?? byId(active);
};
