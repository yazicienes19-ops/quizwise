import type { GraphState, GraphNode } from './types';
import type { ProcessedDocument } from '../../types';
import type { GenerationSource } from '../geminiService';
import { documentDisplayName } from '../libraryService';

/**
 * Wissensnetz-Coach, Baustein 6 ("Fehlende Konzepte erkennen", s. Memory
 * project_quizwise_wissensnetz_coach.md, Punkt 2) — letzter Baustein der
 * Roadmap. Bewusst NUR die Dokumente, die der Nutzer explizit über "Eigene
 * Unterlagen" (GraphNodeDocumentRef) mit Nodes DIESES Graphen verknüpft hat
 * (User-Entscheidung 2026-08-09) — kein Abgleich gegen den gesamten
 * Dokumentbestand des Fachs, keine Abhängigkeit von der zurückgestellten
 * ConceptNode-Architekturentscheidung.
 *
 * Anders als die bisherigen Bausteine sind Vorschläge hier NEUE Entitäten,
 * keine Referenzen auf existierende IDs — die Anti-Halluzinations-Prüfung
 * (validateMissingConceptSuggestions) prüft deshalb auf Titel-Duplikate
 * statt auf ID-Existenz.
 */

export interface MissingConceptSuggestion {
  title: string;
  description: string;
}

/** Gleicher Deckel wie services/collectionSource.ts (dortiges Vorbild für
 *  Digest-vor-Volltext-Priorität und Quellen-Label). */
const MAX_TOTAL_CHARS = 80_000;

const activeNodes = (state: GraphState): GraphNode[] =>
  [...state.nodesById.values()].filter(n => n.archivedAt === undefined);

/** Lesbarer Text eines Dokuments: Digest (kompakt) vor Volltext — identische
 *  Priorität wie collectionSource.ts. PDFs/Bilder ohne fertigen Digest sind
 *  hier nicht lesbar (keine Backend-Extraktion für eine Vorschlagsfunktion). */
const readableText = (d: ProcessedDocument): string | null => {
  if (d.digestText && d.digestStatus === 'ready') return d.digestText;
  if ((d.type === 'text' || d.type === 'docx') && d.content) return d.content;
  return null;
};

export function buildMissingConceptSource(
  state: GraphState,
  documents: ProcessedDocument[],
): { source: GenerationSource; existingTitles: Set<string> } | null {
  const nodes = activeNodes(state);
  const activeNodeIds = new Set(nodes.map(n => n.id));

  const linkedDocumentIds = new Set(
    [...state.nodeDocumentsById.values()]
      .filter(ref => activeNodeIds.has(ref.nodeId))
      .map(ref => ref.documentId),
  );
  if (linkedDocumentIds.size === 0) return null;

  const parts: string[] = [];
  let totalChars = 0;
  for (const documentId of linkedDocumentIds) {
    const doc = documents.find(d => d.id === documentId);
    if (!doc) continue;
    const text = readableText(doc);
    if (!text) continue;
    const chunk = `[Quelle: ${documentDisplayName(doc)}]\n${text.trim()}`;
    if (totalChars + chunk.length > MAX_TOTAL_CHARS) continue;
    parts.push(chunk);
    totalChars += chunk.length;
  }
  if (parts.length === 0) return null;

  const existingTitles = new Set(nodes.map(n => n.title.trim().toLowerCase()));
  const existingTitlesBlock = nodes.length > 0
    ? `\n\nBereits vorhandene Konzepte im Wissensnetz (NICHT erneut vorschlagen):\n${nodes.map(n => n.title).join('\n')}`
    : '';

  const text = `Material:\n${parts.join('\n\n---\n\n')}${existingTitlesBlock}`;
  return { source: { text }, existingTitles };
}

export function validateMissingConceptSuggestions(
  state: GraphState,
  raw: MissingConceptSuggestion[],
): MissingConceptSuggestion[] {
  const existingTitles = new Set(activeNodes(state).map(n => n.title.trim().toLowerCase()));
  const seenTitles = new Set<string>();
  const result: MissingConceptSuggestion[] = [];

  for (const s of raw) {
    if (!s || typeof s.title !== 'string' || typeof s.description !== 'string') continue;
    const title = s.title.trim();
    if (title.length === 0) continue;

    const normalized = title.toLowerCase();
    if (existingTitles.has(normalized)) continue;
    if (seenTitles.has(normalized)) continue;
    seenTitles.add(normalized);

    result.push({ title, description: s.description.trim() });
  }

  return result;
}
