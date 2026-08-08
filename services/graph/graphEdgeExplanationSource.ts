import type { GraphState, GraphEdge } from './types';
import type { GenerationSource } from '../geminiService';
import { buildNodeLearningText } from './graphLearningSource';

/**
 * Wissensnetz-Coach, Baustein 2 ("Beziehungen erklären", s. Memory
 * project_quizwise_wissensnetz_coach.md, Punkt 5). Bewusst NUR Graph-interner
 * Text (Titel/Beschreibung/Notizen beider Nodes + die vom Nutzer vergebene
 * Beziehung) — anders als der Node-Erklärer (generateExplanation mit
 * useExternalKnowledge=true) KEINE Allgemeinwissen-Vermischung, da dieser
 * Anwendungsfall ausschließlich erklärt, was der Nutzer selbst bereits im
 * Graphen formuliert hat (strikte Stoffbindung ab V1, User-Vorgabe).
 */

export interface EdgeExplanationContext {
  source: GenerationSource;
  nodeATitle: string;
  nodeBTitle: string;
}

const FALLBACK_LABEL = 'ohne Bezeichnung';

export function buildEdgeExplanationSource(state: GraphState, edge: GraphEdge): EdgeExplanationContext | null {
  const nodeA = state.nodesById.get(edge.sourceNodeId);
  const nodeB = state.nodesById.get(edge.targetNodeId);
  if (!nodeA || !nodeB) return null;

  const relationType = edge.relationTypeId ? state.relationTypesById.get(edge.relationTypeId) : undefined;
  const relationLabel = edge.label || relationType?.label || FALLBACK_LABEL;

  const text = [
    `Konzept A: ${buildNodeLearningText(nodeA)}`,
    `Konzept B: ${buildNodeLearningText(nodeB)}`,
    `Beziehung (vom Nutzer vergeben): ${nodeA.title} → ${relationLabel} → ${nodeB.title}`,
  ].join('\n\n');

  return { source: { text }, nodeATitle: nodeA.title, nodeBTitle: nodeB.title };
}
