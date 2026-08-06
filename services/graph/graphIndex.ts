import type { GraphState, GraphEdge } from './types';

export interface RelatedConceptEntry {
  key: string;
  otherNodeId: string;
  otherTitle: string;
  text: string;
}

/**
 * Internes Hilfsmodul (kein eigener Top-Level-Service, User-Entscheidung
 * 2026-08-01) — Adjazenz-Struktur für GraphMutationService/GraphValidationService.
 * Wird bei Bedarf auslagerbar, sobald Suche/Rendering/KI sie ebenfalls brauchen
 * (dann eigener GraphIndexService, s. KNOWLEDGE_GRAPH_PHASE1_PLAN.md).
 *
 * Nur AKTIVE Kanten zwischen AKTIVEN Nodes werden indiziert — exakt das
 * Lese-Zeit-Filterprinzip aus der Planung: Node-Archivierung schreibt bewusst
 * NICHT in die Kanten selbst (vermeidet Schreib-Amplifikation bei stark
 * vernetzten Nodes), stattdessen blendet der Index eine Kante aus, sobald
 * einer ihrer beiden Endpunkte nicht mehr existiert oder archiviert ist.
 */
export interface GraphIndex {
  edgesBySource: Map<string, GraphEdge[]>;
  edgesByTarget: Map<string, GraphEdge[]>;
}

const isActiveEdge = (e: GraphEdge): boolean => e.archivedAt === undefined;

const pushInto = (map: Map<string, GraphEdge[]>, key: string, edge: GraphEdge): void => {
  const list = map.get(key);
  if (list) list.push(edge); else map.set(key, [edge]);
};

export function buildGraphIndex(state: GraphState): GraphIndex {
  const edgesBySource = new Map<string, GraphEdge[]>();
  const edgesByTarget = new Map<string, GraphEdge[]>();

  for (const edge of state.edgesById.values()) {
    if (!isActiveEdge(edge)) continue;
    const source = state.nodesById.get(edge.sourceNodeId);
    const target = state.nodesById.get(edge.targetNodeId);
    if (!source || source.archivedAt !== undefined) continue;
    if (!target || target.archivedAt !== undefined) continue;
    pushInto(edgesBySource, edge.sourceNodeId, edge);
    pushInto(edgesByTarget, edge.targetNodeId, edge);
  }

  return { edgesBySource, edgesByTarget };
}

export const outgoingEdges = (index: GraphIndex, nodeId: string): GraphEdge[] =>
  index.edgesBySource.get(nodeId) ?? [];

export const incomingEdges = (index: GraphIndex, nodeId: string): GraphEdge[] =>
  index.edgesByTarget.get(nodeId) ?? [];

export function neighborIds(index: GraphIndex, nodeId: string): Set<string> {
  const ids = new Set<string>();
  outgoingEdges(index, nodeId).forEach(e => ids.add(e.targetNodeId));
  incomingEdges(index, nodeId).forEach(e => ids.add(e.sourceNodeId));
  return ids;
}

/** Grundlage für die DB-seitige Regel "keine doppelte aktive Kante mit
 *  identischem Beziehungstyp zwischen denselben zwei Nodes in derselben
 *  Richtung" — hier clientseitig gespiegelt für sofortiges Feedback ohne
 *  Round-Trip (GraphValidationService). */
export const hasActiveEdgeBetween = (
  index: GraphIndex,
  sourceNodeId: string,
  targetNodeId: string,
  relationTypeId: string,
): boolean =>
  outgoingEdges(index, sourceNodeId).some(
    e => e.targetNodeId === targetNodeId && e.relationTypeId === relationTypeId,
  );

/** Für symmetrische Beziehungstypen: A→B und B→A mit demselben Typ sind
 *  dieselbe Aussage, nur mit vertauschter Richtung — das kann kein
 *  DB-CHECK-Constraint prüfen (keine Subquery gegen relation_types möglich),
 *  deshalb hier UND in GraphValidationService. */
export const hasActiveEdgeBetweenEitherDirection = (
  index: GraphIndex,
  aNodeId: string,
  bNodeId: string,
  relationTypeId: string,
): boolean =>
  hasActiveEdgeBetween(index, aNodeId, bNodeId, relationTypeId) ||
  hasActiveEdgeBetween(index, bNodeId, aNodeId, relationTypeId);

/** Grundlage für den künftigen Fokus-Modus (Phase 2 der Produkt-Roadmap) —
 *  Nachbarschaft bis zu `hops` Schritten, ungerichtet (Kanten zählen in
 *  beide Richtungen als Nachbarschaft, unabhängig vom Beziehungstyp). */
/** Menschlich lesbare Beschreibung einer Kante aus Sicht EINES ihrer beiden
 *  Nodes ("Wie hängt das mit anderem Wissen zusammen?", nicht "welche Kanten
 *  existieren?") — von GraphNodeDetailPanel (Verwandte Konzepte) UND der
 *  Node-Dialog-KI-Schicht (GraphLearningOverlay) gemeinsam genutzt, damit
 *  beide Stellen dieselbe Beziehung identisch in Worte fassen. Gibt `null`
 *  zurück, wenn der andere Node nicht (mehr) geladen ist — kann durch den
 *  Lese-Zeit-Filter oben eigentlich nicht vorkommen, hier trotzdem defensiv
 *  statt eine Zeile mit "undefined" zu zeigen. */
export function describeRelatedEntry(
  state: GraphState, edge: GraphEdge, isSource: boolean,
): RelatedConceptEntry | null {
  const otherNodeId = isSource ? edge.targetNodeId : edge.sourceNodeId;
  const otherNode = state.nodesById.get(otherNodeId);
  if (!otherNode) return null;
  const relationType = edge.relationTypeId ? state.relationTypesById.get(edge.relationTypeId) : undefined;

  let text: string;
  if (!relationType) {
    // Beziehungstyp ist optional (User-Vorgabe 2026-08-04) — die Verbindung
    // bleibt trotzdem sichtbar, nur ohne Beziehungsphrase dazwischen.
    text = `${isSource ? '→' : '←'} ${otherNode.title}`;
  } else if (relationType.symmetric) {
    text = `↔ ${relationType.label} ${otherNode.title}`;
  } else if (isSource) {
    text = `→ ${relationType.label} ${otherNode.title}`;
  } else if (relationType.inverseLabel) {
    const filled = relationType.inverseLabel.includes('…')
      ? relationType.inverseLabel.replace('…', otherNode.title)
      : `${relationType.inverseLabel} ${otherNode.title}`;
    text = `→ ${filled}`;
  } else {
    text = `← ${relationType.label} ${otherNode.title}`;
  }
  return { key: edge.id, otherNodeId, otherTitle: otherNode.title, text };
}

export function subgraph(
  index: GraphIndex,
  centerNodeId: string,
  hops: number,
): { nodeIds: Set<string>; edgeIds: Set<string> } {
  const nodeIds = new Set<string>([centerNodeId]);
  const edgeIds = new Set<string>();
  let frontier = new Set<string>([centerNodeId]);

  for (let step = 0; step < hops && frontier.size > 0; step++) {
    const nextFrontier = new Set<string>();
    for (const id of frontier) {
      for (const edge of [...outgoingEdges(index, id), ...incomingEdges(index, id)]) {
        edgeIds.add(edge.id);
        const otherId = edge.sourceNodeId === id ? edge.targetNodeId : edge.sourceNodeId;
        if (!nodeIds.has(otherId)) {
          nodeIds.add(otherId);
          nextFrontier.add(otherId);
        }
      }
    }
    frontier = nextFrontier;
  }

  return { nodeIds, edgeIds };
}
