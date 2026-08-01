import { generateGraphId } from './id';
import type {
  GraphState, GraphNode, GraphEdge, GraphRelationType, GraphNodeDocumentRef,
  CreateNodeInput, UpdateNodeInput, CreateEdgeInput, UpdateEdgeInput,
  CreateRelationTypeInput, UpdateRelationTypeInput, CreateNodeDocumentRefInput,
  MutationResult,
} from './types';
import { buildGraphIndex } from './graphIndex';
import {
  validateCreateNode, validateUpdateNode, validateCreateEdge, validateRetypeEdge, validateRestoreEdge,
  validateCreateRelationType, validateRelationTypeLabelUnique, validateRelationTypeDeletable,
} from './graphValidationService';

/**
 * Reine Reducer-Funktionen auf GraphState — kein I/O, keine React-Abhängigkeit.
 * Jede Funktion validiert selbst (über GraphValidationService) und gibt bei
 * Ablehnung den State UNVERÄNDERT zurück (Konvention wie mindmapTree.ts'
 * moveNode) statt eine Exception zu werfen — eine abgelehnte Mutation ist ein
 * normaler, erwartbarer Ausgang, keine Ausnahmesituation.
 *
 * Das ist zugleich die technische Grenze für die KI-Schreibregel: eine
 * künftige KI-Vorschlagsfunktion (Phase 4) darf nur die Typen aus types.ts
 * importieren, um einen Vorschlag zu formulieren — nicht diese Datei, um ihn
 * selbst anzuwenden. Der Vorschlag muss durch dieselbe Bestätigung laufen wie
 * jede manuelle Aktion, die dann ganz normal eine dieser Funktionen aufruft.
 *
 * version/updatedAt werden hier optimistisch lokal hochgezählt (Date.now()
 * bzw. +1) — das ist NUR ein lokaler Platzhalter für sofortiges UI-Feedback.
 * Die autoritative Version setzt ausschließlich der DB-Trigger; GraphSyncService
 * überschreibt diese lokalen Werte nach einer erfolgreichen Synchronisation
 * mit dem tatsächlichen Server-Stand (Details: GraphSyncService).
 */

const reject = <T>(state: GraphState, reason: string): MutationResult<T> => ({ state, error: reason });

const withNode = (state: GraphState, node: GraphNode): GraphState => {
  const nodesById = new Map(state.nodesById);
  nodesById.set(node.id, node);
  return { ...state, nodesById };
};

const withoutNode = (state: GraphState, nodeId: string): GraphState => {
  const nodesById = new Map(state.nodesById);
  nodesById.delete(nodeId);
  return { ...state, nodesById };
};

const withEdge = (state: GraphState, edge: GraphEdge): GraphState => {
  const edgesById = new Map(state.edgesById);
  edgesById.set(edge.id, edge);
  return { ...state, edgesById };
};

const withRelationType = (state: GraphState, relationType: GraphRelationType): GraphState => {
  const relationTypesById = new Map(state.relationTypesById);
  relationTypesById.set(relationType.id, relationType);
  return { ...state, relationTypesById };
};

const withoutRelationType = (state: GraphState, relationTypeId: string): GraphState => {
  const relationTypesById = new Map(state.relationTypesById);
  relationTypesById.delete(relationTypeId);
  return { ...state, relationTypesById };
};

const withNodeDocumentRef = (state: GraphState, ref: GraphNodeDocumentRef): GraphState => {
  const nodeDocumentsById = new Map(state.nodeDocumentsById);
  nodeDocumentsById.set(ref.id, ref);
  return { ...state, nodeDocumentsById };
};

const withoutNodeDocumentRef = (state: GraphState, refId: string): GraphState => {
  const nodeDocumentsById = new Map(state.nodeDocumentsById);
  nodeDocumentsById.delete(refId);
  return { ...state, nodeDocumentsById };
};

// ─── Nodes ────────────────────────────────────────────────────────────────────

export function createNode(state: GraphState, input: CreateNodeInput): MutationResult<GraphNode> {
  const check = validateCreateNode(input);
  if (check.valid === false) return reject(state, check.reason);

  const now = Date.now();
  const node: GraphNode = {
    id: generateGraphId(),
    collectionId: input.collectionId,
    type: input.type ?? 'begriff',
    title: input.title.trim(),
    description: input.description ?? '',
    notes: input.notes ?? '',
    color: input.color,
    icon: input.icon,
    tags: input.tags ?? [],
    position: input.position,
    pinned: false,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
  return { state: withNode(state, node), entity: node };
}

export function updateNode(state: GraphState, nodeId: string, patch: UpdateNodeInput): MutationResult<GraphNode> {
  const existing = state.nodesById.get(nodeId);
  if (!existing || existing.archivedAt !== undefined) {
    return reject(state, 'Dieser Node existiert nicht oder ist archiviert.');
  }
  const check = validateUpdateNode(patch);
  if (check.valid === false) return reject(state, check.reason);

  const updated: GraphNode = {
    ...existing,
    ...patch,
    title: patch.title !== undefined ? patch.title.trim() : existing.title,
    version: existing.version + 1,
    updatedAt: Date.now(),
  };
  return { state: withNode(state, updated), entity: updated };
}

/** Soft Delete + Sync-Tombstone in einem (archivedAt), s. Datenmodell.
 *  Bereits archivierte Nodes: idempotent, kein Fehler. */
export function archiveNode(state: GraphState, nodeId: string): MutationResult<GraphNode> {
  const existing = state.nodesById.get(nodeId);
  if (!existing) return reject(state, 'Dieser Node existiert nicht.');
  if (existing.archivedAt !== undefined) return { state, entity: existing };

  const updated: GraphNode = { ...existing, archivedAt: Date.now(), updatedAt: Date.now(), version: existing.version + 1 };
  return { state: withNode(state, updated), entity: updated };
}

export function restoreNode(state: GraphState, nodeId: string): MutationResult<GraphNode> {
  const existing = state.nodesById.get(nodeId);
  if (!existing) return reject(state, 'Dieser Node existiert nicht.');
  if (existing.archivedAt === undefined) return { state, entity: existing };

  const updated: GraphNode = { ...existing, archivedAt: undefined, updatedAt: Date.now(), version: existing.version + 1 };
  return { state: withNode(state, updated), entity: updated };
}

/**
 * Endgültiges Löschen — bewusst nur als Zweitaktion aus dem bereits
 * archivierten Zustand heraus (kein automatischer Purge, s. Sync-Strategie).
 * Mirrort im In-Memory-State dieselben ON DELETE CASCADE-Regeln, die die
 * Datenbank für Kanten und Dokument-Verknüpfungen anwendet.
 */
export function purgeNode(state: GraphState, nodeId: string): MutationResult<GraphNode> {
  const existing = state.nodesById.get(nodeId);
  if (!existing) return reject(state, 'Dieser Node existiert nicht.');
  if (existing.archivedAt === undefined) {
    return reject(state, 'Nur bereits archivierte Nodes können endgültig gelöscht werden.');
  }

  let next = withoutNode(state, nodeId);

  const edgesById = new Map(next.edgesById);
  for (const edge of next.edgesById.values()) {
    if (edge.sourceNodeId === nodeId || edge.targetNodeId === nodeId) edgesById.delete(edge.id);
  }

  const nodeDocumentsById = new Map(next.nodeDocumentsById);
  for (const ref of next.nodeDocumentsById.values()) {
    if (ref.nodeId === nodeId) nodeDocumentsById.delete(ref.id);
  }

  next = { ...next, edgesById, nodeDocumentsById };
  return { state: next, entity: existing };
}

// ─── Edges ────────────────────────────────────────────────────────────────────

export function createEdge(state: GraphState, input: CreateEdgeInput): MutationResult<GraphEdge> {
  const index = buildGraphIndex(state);
  const check = validateCreateEdge(state, index, input);
  if (check.valid === false) return reject(state, check.reason);

  const now = Date.now();
  const edge: GraphEdge = {
    id: generateGraphId(),
    sourceNodeId: input.sourceNodeId,
    targetNodeId: input.targetNodeId,
    relationTypeId: input.relationTypeId,
    label: input.label,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
  return { state: withEdge(state, edge), entity: edge };
}

/** Ändert `label` und/oder `relationTypeId`. Ein Typwechsel (Retype) wird
 *  erneut gegen Duplikate geprüft — Quelle/Ziel bleiben dabei unverändert. */
export function updateEdge(state: GraphState, edgeId: string, patch: UpdateEdgeInput): MutationResult<GraphEdge> {
  const existing = state.edgesById.get(edgeId);
  if (!existing || existing.archivedAt !== undefined) {
    return reject(state, 'Diese Kante existiert nicht oder ist archiviert.');
  }

  if (patch.relationTypeId !== undefined && patch.relationTypeId !== existing.relationTypeId) {
    const index = buildGraphIndex(state);
    const check = validateRetypeEdge(state, index, edgeId, existing.sourceNodeId, existing.targetNodeId, patch.relationTypeId);
    if (check.valid === false) return reject(state, check.reason);
  }

  const updated: GraphEdge = { ...existing, ...patch, version: existing.version + 1, updatedAt: Date.now() };
  return { state: withEdge(state, updated), entity: updated };
}

export function archiveEdge(state: GraphState, edgeId: string): MutationResult<GraphEdge> {
  const existing = state.edgesById.get(edgeId);
  if (!existing) return reject(state, 'Diese Kante existiert nicht.');
  if (existing.archivedAt !== undefined) return { state, entity: existing };

  const updated: GraphEdge = { ...existing, archivedAt: Date.now(), updatedAt: Date.now(), version: existing.version + 1 };
  return { state: withEdge(state, updated), entity: updated };
}

/** Prüft erneut Endpunkte/Beziehungstyp/Duplikate — zwischen Archivierung und
 *  Wiederherstellung kann sich der Rest des Graphen verändert haben. */
export function restoreEdge(state: GraphState, edgeId: string): MutationResult<GraphEdge> {
  const existing = state.edgesById.get(edgeId);
  if (!existing) return reject(state, 'Diese Kante existiert nicht.');
  if (existing.archivedAt === undefined) return { state, entity: existing };

  const index = buildGraphIndex(state);
  const check = validateRestoreEdge(state, index, existing);
  if (check.valid === false) return reject(state, check.reason);

  const updated: GraphEdge = { ...existing, archivedAt: undefined, updatedAt: Date.now(), version: existing.version + 1 };
  return { state: withEdge(state, updated), entity: updated };
}

// ─── Beziehungstypen ────────────────────────────────────────────────────────

export function createRelationType(state: GraphState, input: CreateRelationTypeInput): MutationResult<GraphRelationType> {
  const check = validateCreateRelationType(state, input);
  if (check.valid === false) return reject(state, check.reason);

  const relationType: GraphRelationType = {
    id: generateGraphId(),
    label: input.label.trim(),
    inverseLabel: input.inverseLabel,
    symmetric: input.symmetric ?? false,
    color: input.color,
    icon: input.icon,
    isBuiltIn: false,
    sortOrder: input.sortOrder ?? 0,
    createdAt: Date.now(),
  };
  return { state: withRelationType(state, relationType), entity: relationType };
}

export function updateRelationType(state: GraphState, relationTypeId: string, patch: UpdateRelationTypeInput): MutationResult<GraphRelationType> {
  const existing = state.relationTypesById.get(relationTypeId);
  if (!existing) return reject(state, 'Dieser Beziehungstyp existiert nicht.');
  // Spiegelt die RLS-Realität: auth.uid() = user_id ist bei eingebauten
  // (user_id IS NULL) Typen nie wahr, die DB würde ein Update ohnehin nie
  // durchlassen — dieselbe Regel gilt hier schon in der Domain-Schicht.
  if (existing.isBuiltIn) return reject(state, 'Eingebaute Beziehungstypen können nicht geändert werden.');

  if (patch.label !== undefined) {
    const check = validateRelationTypeLabelUnique(state, patch.label, relationTypeId);
    if (check.valid === false) return reject(state, check.reason);
  }

  const updated: GraphRelationType = {
    ...existing,
    ...patch,
    label: patch.label !== undefined ? patch.label.trim() : existing.label,
  };
  return { state: withRelationType(state, updated), entity: updated };
}

export function deleteRelationType(state: GraphState, relationTypeId: string): MutationResult<GraphRelationType> {
  const index = buildGraphIndex(state);
  const check = validateRelationTypeDeletable(state, index, relationTypeId);
  if (check.valid === false) return reject(state, check.reason);

  const existing = state.relationTypesById.get(relationTypeId)!;
  return { state: withoutRelationType(state, relationTypeId), entity: existing };
}

// ─── Dokument-Verknüpfungen ─────────────────────────────────────────────────

export function createNodeDocumentRef(state: GraphState, input: CreateNodeDocumentRefInput): MutationResult<GraphNodeDocumentRef> {
  const node = state.nodesById.get(input.nodeId);
  if (!node || node.archivedAt !== undefined) {
    return reject(state, 'Der Node existiert nicht oder ist archiviert.');
  }
  // documentId wird hier bewusst NICHT geprüft — GraphState kennt keine
  // Dokumente (die leben in useDocuments/documentService, einem komplett
  // anderen Teil der App). Referenzielle Absicherung übernimmt beim Sync
  // der DB-Trigger assert_graph_node_document_ownership.

  const ref: GraphNodeDocumentRef = {
    id: generateGraphId(),
    nodeId: input.nodeId,
    documentId: input.documentId,
    excerpt: input.excerpt,
    page: input.page,
    createdAt: Date.now(),
  };
  return { state: withNodeDocumentRef(state, ref), entity: ref };
}

export function removeNodeDocumentRef(state: GraphState, refId: string): MutationResult<GraphNodeDocumentRef> {
  const existing = state.nodeDocumentsById.get(refId);
  if (!existing) return reject(state, 'Diese Dokument-Verknüpfung existiert nicht.');
  return { state: withoutNodeDocumentRef(state, refId), entity: existing };
}
