import type { GraphState, GraphNode } from './types';
import type { GenerationSource } from '../geminiService';
import { buildGraphIndex, neighborIds } from './graphIndex';

/**
 * Wissensnetz-Coach, Baustein 5 ("Doppelte Konzepte erkennen", s. Memory
 * project_quizwise_wissensnetz_coach.md, Punkt 6) — graphweite KI-Aktion,
 * gleiches Muster wie graphRelationSuggestionSource.ts (Baustein 4). Anders
 * als dort: verbundene Paare werden NICHT hart ausgeschlossen (zwei Nodes
 * können verbunden UND Duplikate sein, wenn auch selten) — nur als weicher
 * Prompt-Hinweis. Bewusst nur Graph-interner Text, kein Dokumentabgleich
 * (strikte Stoffbindung ab V1, wie bei allen bisherigen Bausteinen).
 */

export interface DuplicateSuggestion {
  nodeAId: string;
  nodeBId: string;
  reason: string;
}

/** Gleicher Kosten-/Kontext-Deckel wie graphRelationSuggestionSource.ts. */
const MAX_CANDIDATE_NODES = 60;

const activeNodes = (state: GraphState): GraphNode[] =>
  [...state.nodesById.values()].filter(n => n.archivedAt === undefined);

export function buildDuplicateSuggestionSource(state: GraphState): { source: GenerationSource; candidateIds: Set<string> } | null {
  const nodes = activeNodes(state).slice(0, MAX_CANDIDATE_NODES);
  if (nodes.length < 2) return null;

  const candidateIds = new Set(nodes.map(n => n.id));
  const index = buildGraphIndex(state);

  const nodeLines = nodes
    .map(n => `ID: ${n.id} | Titel: ${n.title} | Beschreibung: ${n.description.trim()} | Notizen: ${n.notes.trim()}`)
    .join('\n');

  const connectedPairs = new Set<string>();
  for (const node of nodes) {
    for (const otherId of neighborIds(index, node.id)) {
      if (!candidateIds.has(otherId)) continue;
      connectedPairs.add([node.id, otherId].sort().join(' <-> '));
    }
  }
  const connectedBlock = connectedPairs.size > 0
    ? `\n\nBereits verbundene Paare (meist verschiedene, aber verwandte Konzepte, keine Duplikate — trotzdem mit Vorsicht behandeln):\n${[...connectedPairs].join('\n')}`
    : '';

  const text = `Konzepte im Wissensnetz:\n${nodeLines}${connectedBlock}`;
  return { source: { text }, candidateIds };
}

export function validateDuplicateSuggestions(state: GraphState, raw: DuplicateSuggestion[]): DuplicateSuggestion[] {
  const seenPairs = new Set<string>();
  const result: DuplicateSuggestion[] = [];

  for (const s of raw) {
    if (!s || typeof s.nodeAId !== 'string' || typeof s.nodeBId !== 'string') continue;
    if (s.nodeAId === s.nodeBId) continue;

    const nodeA = state.nodesById.get(s.nodeAId);
    const nodeB = state.nodesById.get(s.nodeBId);
    if (!nodeA || nodeA.archivedAt !== undefined) continue;
    if (!nodeB || nodeB.archivedAt !== undefined) continue;

    const pairKey = [s.nodeAId, s.nodeBId].sort().join('|');
    if (seenPairs.has(pairKey)) continue;
    seenPairs.add(pairKey);

    result.push(s);
  }

  return result;
}
