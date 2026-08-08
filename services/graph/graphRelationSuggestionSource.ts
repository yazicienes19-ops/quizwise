import type { GraphState, GraphNode } from './types';
import type { GenerationSource } from '../geminiService';
import { buildGraphIndex, neighborIds } from './graphIndex';

/**
 * Wissensnetz-Coach, Baustein 4 ("Fehlende Beziehungen erkennen", s. Memory
 * project_quizwise_wissensnetz_coach.md, Punkt 1) — die erste graphweite
 * KI-Aktion (bisherige Bausteine betrachten je einen Node/eine Kante).
 * Bewusst nur Graph-interner Text (Titel/Beschreibung/Notizen bestehender
 * Nodes), kein Dokumentabgleich — die KI beobachtet nur, was der Nutzer
 * bereits geschrieben hat, erfindet nichts extern (strikte Stoffbindung ab
 * V1, wie bei den bisherigen Bausteinen).
 */

export interface RelationSuggestion {
  sourceNodeId: string;
  targetNodeId: string;
  reason: string;
}

/** Kosten-/Kontext-Deckel für den Prompt — Präzedenzfälle in geminiService.ts
 *  (z.B. bloomHints.slice(-12)) begrenzen KI-Eingaben grundsätzlich, statt
 *  unbegrenzte Nutzerdaten roh durchzureichen. */
const MAX_CANDIDATE_NODES = 60;

const activeNodes = (state: GraphState): GraphNode[] =>
  [...state.nodesById.values()].filter(n => n.archivedAt === undefined);

export function buildRelationSuggestionSource(state: GraphState): { source: GenerationSource; candidateIds: Set<string> } | null {
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
    ? `\n\nBereits verbundene Paare (NICHT erneut vorschlagen):\n${[...connectedPairs].join('\n')}`
    : '';

  const text = `Konzepte im Wissensnetz:\n${nodeLines}${connectedBlock}`;
  return { source: { text }, candidateIds };
}

export function validateRelationSuggestions(state: GraphState, raw: RelationSuggestion[]): RelationSuggestion[] {
  const index = buildGraphIndex(state);
  const seenPairs = new Set<string>();
  const result: RelationSuggestion[] = [];

  for (const s of raw) {
    if (!s || typeof s.sourceNodeId !== 'string' || typeof s.targetNodeId !== 'string') continue;
    if (s.sourceNodeId === s.targetNodeId) continue;

    const source = state.nodesById.get(s.sourceNodeId);
    const target = state.nodesById.get(s.targetNodeId);
    if (!source || source.archivedAt !== undefined) continue;
    if (!target || target.archivedAt !== undefined) continue;

    if (neighborIds(index, s.sourceNodeId).has(s.targetNodeId)) continue;

    const pairKey = [s.sourceNodeId, s.targetNodeId].sort().join('|');
    if (seenPairs.has(pairKey)) continue;
    seenPairs.add(pairKey);

    result.push(s);
  }

  return result;
}
