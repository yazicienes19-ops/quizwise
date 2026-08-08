import type { GraphState, GraphNode } from './types';
import { buildGraphIndex, outgoingEdges, incomingEdges } from './graphIndex';

/**
 * Wissensnetz-Coach, erster Baustein (rein struktureller Teil, kein KI-Call) —
 * s. Memory project_quizwise_wissensnetz_coach.md für die vollständige
 * Roadmap (Reihenfolge 3→5→4→1→6→2, dies ist Punkt 3).
 *
 * Beobachtet nur, verändert nie etwas am Graphen — dieselbe Schreibgrenze wie
 * überall sonst im Wissensnetz, hier ohnehin trivial eingehalten, weil keine
 * der Prüfungen unten schreibend ist. "Hauptthema enthält viele Unterthemen"
 * und "Bereich wirkt unvollständig" sind bewusst NICHT Teil dieses ersten
 * Bausteins (s. Memory: keine strukturelle Eltern-Kind-Kante im Datenmodell
 * bzw. bräuchte ein Sprachmodell statt reiner Zählung).
 */

export type NodeInsightType = 'no-description' | 'no-notes' | 'many-relationships';

export interface NodeInsight {
  nodeId: string;
  type: NodeInsightType;
}

/** Unterhalb dieser Node-Anzahl ist ein Durchschnittswert für die
 *  Ausreißer-Erkennung zu verrauscht/bedeutungslos (typische kleine
 *  Studenten-Graphen) — dann lieber gar keine "vielen Beziehungen"-Hinweise
 *  zeigen, statt bei 2-3 Kanten schon anzuschlagen. */
const MIN_NODES_FOR_OUTLIER_CHECK = 5;

/** Additiver statt multiplikativer Schwellwert: wie viele Kanten ÜBER dem
 *  Durchschnitt des aktuellen Graphen ein Node haben muss, um als
 *  "ungewöhnlich viele Beziehungen" zu gelten. Additiv, damit es bei
 *  niedrigem Durchschnitt (z.B. 1-2) nicht schon bei jeder dritten Kante
 *  auslöst. */
const RELATIONSHIP_OUTLIER_MARGIN = 4;

const activeNodes = (state: GraphState): GraphNode[] =>
  [...state.nodesById.values()].filter(n => n.archivedAt === undefined);

export function computeNodeInsights(state: GraphState): NodeInsight[] {
  const nodes = activeNodes(state);
  const insights: NodeInsight[] = [];

  for (const node of nodes) {
    if (node.description.trim() === '') insights.push({ nodeId: node.id, type: 'no-description' });
    if (node.notes.trim() === '') insights.push({ nodeId: node.id, type: 'no-notes' });
  }

  if (nodes.length >= MIN_NODES_FOR_OUTLIER_CHECK) {
    const index = buildGraphIndex(state);
    const counts = nodes.map(n => outgoingEdges(index, n.id).length + incomingEdges(index, n.id).length);
    const average = counts.reduce((sum, c) => sum + c, 0) / counts.length;
    nodes.forEach((node, i) => {
      if (counts[i] > average + RELATIONSHIP_OUTLIER_MARGIN) {
        insights.push({ nodeId: node.id, type: 'many-relationships' });
      }
    });
  }

  return insights;
}

/** Für die UI (Canvas-Indikator, Banner) — Insights nach Node gruppiert,
 *  damit Aufrufer nicht selbst filtern müssen. */
export function groupInsightsByNode(insights: NodeInsight[]): Map<string, NodeInsight[]> {
  const map = new Map<string, NodeInsight[]>();
  for (const insight of insights) {
    const list = map.get(insight.nodeId);
    if (list) list.push(insight); else map.set(insight.nodeId, [insight]);
  }
  return map;
}
