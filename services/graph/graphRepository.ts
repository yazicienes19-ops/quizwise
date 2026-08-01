import { supabase } from '../supabaseClient';
import type { GraphNode, GraphEdge, GraphRelationType, GraphNodeDocumentRef } from './types';

/**
 * Reine Supabase-CRUD pro Entität — einzige Datei im Graph-Feature, die
 * `supabase` importiert. Kein Merge/Cursor/Debounce (das ist GraphSyncService/
 * GraphPersistenceService), keine Geschäftsregeln (das ist GraphValidationService/
 * GraphMutationService) — nur Lesen/Schreiben + DB-Spalten↔Domain-Feld-Mapping.
 *
 * updated_at/version werden NIE in ein Insert/Update-Payload aufgenommen —
 * die Datenbank setzt sie exklusiv selbst (Spalten-Default beim Insert,
 * touch_graph_row-Trigger beim Update, s. migration_graph_v1.sql). Der
 * zurückgegebene Datensatz nach einem upsert() trägt deshalb IMMER den
 * autoritativen Server-Stand, nie den lokal-optimistischen Wert, den
 * GraphMutationService vergeben hatte.
 *
 * Unit-Tests decken hier bewusst nur die reinen Mapping-Funktionen ab (rowToX/
 * xToRow) — die eigentlichen Supabase-Aufrufe sind ungetestet, konsistent mit
 * der bestehenden Praxis dieser Codebase (mindmapService.ts/flashcardService.ts/
 * documentService.ts haben ebenfalls keine Tests; Verifikation läuft dort wie
 * hier über Live-E2E statt gemockte Unit-Tests).
 */

// ─── Mapping: graph_nodes ────────────────────────────────────────────────────

export function rowToNode(row: any): GraphNode {
  return {
    id: row.id,
    collectionId: row.collection_id ?? undefined,
    type: row.type,
    title: row.title,
    description: row.description,
    notes: row.notes,
    color: row.color ?? undefined,
    icon: row.icon ?? undefined,
    tags: row.tags ?? [],
    position: { x: row.position_x, y: row.position_y },
    pinned: row.pinned,
    archivedAt: row.archived_at ? new Date(row.archived_at).getTime() : undefined,
    version: row.version,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

/** Bewusst OHNE created_at/updated_at/version — s. Datei-Kommentar oben. */
export function nodeToRow(node: GraphNode, userId: string): Record<string, unknown> {
  return {
    id: node.id,
    user_id: userId,
    collection_id: node.collectionId ?? null,
    type: node.type,
    title: node.title,
    description: node.description,
    notes: node.notes,
    color: node.color ?? null,
    icon: node.icon ?? null,
    tags: node.tags,
    position_x: node.position.x,
    position_y: node.position.y,
    pinned: node.pinned,
    archived_at: node.archivedAt ? new Date(node.archivedAt).toISOString() : null,
  };
}

export interface FetchNodesOptions {
  /** undefined = alle Fächer (Gesamtansicht). */
  collectionId?: string;
  /** Nur Zeilen, die NACH diesem ms-Timestamp geändert wurden — Grundlage für
   *  den inkrementellen Sync-Cursor (GraphSyncService). */
  updatedAfter?: number;
  /** Default false — archivierte Nodes werden normalerweise nicht geladen. */
  includeArchived?: boolean;
}

export async function fetchNodes(userId: string, opts: FetchNodesOptions = {}): Promise<GraphNode[]> {
  let query = supabase.from('graph_nodes').select('*').eq('user_id', userId);
  if (opts.collectionId !== undefined) query = query.eq('collection_id', opts.collectionId);
  if (opts.updatedAfter !== undefined) query = query.gt('updated_at', new Date(opts.updatedAfter).toISOString());
  if (!opts.includeArchived) query = query.is('archived_at', null);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(rowToNode);
}

export async function upsertNode(node: GraphNode, userId: string): Promise<GraphNode> {
  const { data, error } = await supabase
    .from('graph_nodes')
    .upsert(nodeToRow(node, userId), { onConflict: 'id' })
    .select()
    .single();
  if (error) throw error;
  return rowToNode(data);
}

// ─── Mapping: graph_edges ────────────────────────────────────────────────────

export function rowToEdge(row: any): GraphEdge {
  return {
    id: row.id,
    sourceNodeId: row.source_node_id,
    targetNodeId: row.target_node_id,
    relationTypeId: row.relation_type_id,
    label: row.label ?? undefined,
    archivedAt: row.archived_at ? new Date(row.archived_at).getTime() : undefined,
    version: row.version,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

export function edgeToRow(edge: GraphEdge, userId: string): Record<string, unknown> {
  return {
    id: edge.id,
    user_id: userId,
    source_node_id: edge.sourceNodeId,
    target_node_id: edge.targetNodeId,
    relation_type_id: edge.relationTypeId,
    label: edge.label ?? null,
    archived_at: edge.archivedAt ? new Date(edge.archivedAt).toISOString() : null,
  };
}

export interface FetchEdgesOptions {
  updatedAfter?: number;
  includeArchived?: boolean;
}

export async function fetchEdges(userId: string, opts: FetchEdgesOptions = {}): Promise<GraphEdge[]> {
  let query = supabase.from('graph_edges').select('*').eq('user_id', userId);
  if (opts.updatedAfter !== undefined) query = query.gt('updated_at', new Date(opts.updatedAfter).toISOString());
  if (!opts.includeArchived) query = query.is('archived_at', null);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(rowToEdge);
}

export async function upsertEdge(edge: GraphEdge, userId: string): Promise<GraphEdge> {
  const { data, error } = await supabase
    .from('graph_edges')
    .upsert(edgeToRow(edge, userId), { onConflict: 'id' })
    .select()
    .single();
  if (error) throw error;
  return rowToEdge(data);
}

// ─── Mapping: graph_relation_types ──────────────────────────────────────────

export function rowToRelationType(row: any): GraphRelationType {
  return {
    id: row.id,
    userId: row.user_id ?? undefined,
    label: row.label,
    inverseLabel: row.inverse_label ?? undefined,
    symmetric: row.symmetric,
    color: row.color ?? undefined,
    icon: row.icon ?? undefined,
    isBuiltIn: row.is_built_in,
    sortOrder: row.sort_order,
    createdAt: new Date(row.created_at).getTime(),
  };
}

/** Nur für eigene (nicht eingebaute) Typen gedacht — GraphMutationService
 *  verhindert bereits, dass ein eingebauter Typ hier landet; das erneut zu
 *  prüfen wäre eine Geschäftsregel und gehört nicht in dieses reine I/O. */
export function relationTypeToRow(relationType: GraphRelationType, userId: string): Record<string, unknown> {
  return {
    id: relationType.id,
    user_id: userId,
    label: relationType.label,
    inverse_label: relationType.inverseLabel ?? null,
    symmetric: relationType.symmetric,
    color: relationType.color ?? null,
    icon: relationType.icon ?? null,
    is_built_in: false,
    sort_order: relationType.sortOrder,
  };
}

/** RLS liefert ohnehin nur global + eigene Zeilen zurück — der explizite
 *  .or()-Filter ist Verteidigung in der Tiefe (dasselbe Prinzip wie das
 *  bestehende .eq('user_id', userId) bei anderen fetch-Funktionen dieser
 *  App, die sich ebenfalls nicht ausschließlich auf RLS verlassen). */
export async function fetchRelationTypes(userId: string): Promise<GraphRelationType[]> {
  const { data, error } = await supabase
    .from('graph_relation_types')
    .select('*')
    .or(`user_id.eq.${userId},user_id.is.null`)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data || []).map(rowToRelationType);
}

export async function upsertRelationType(relationType: GraphRelationType, userId: string): Promise<GraphRelationType> {
  const { data, error } = await supabase
    .from('graph_relation_types')
    .upsert(relationTypeToRow(relationType, userId), { onConflict: 'id' })
    .select()
    .single();
  if (error) throw error;
  return rowToRelationType(data);
}

/** Hard Delete (Beziehungstypen haben keinen Archiv-Zustand). Die DB lehnt
 *  das per ON DELETE RESTRICT ab, falls noch Kanten den Typ referenzieren —
 *  GraphValidationService prüft das vorher, hier nur als zusätzliches Netz. */
export async function deleteRelationType(relationTypeId: string, userId: string): Promise<void> {
  const { error } = await supabase.from('graph_relation_types').delete().eq('id', relationTypeId).eq('user_id', userId);
  if (error) throw error;
}

// ─── Mapping: graph_node_documents ──────────────────────────────────────────

export function rowToNodeDocumentRef(row: any): GraphNodeDocumentRef {
  return {
    id: row.id,
    nodeId: row.node_id,
    documentId: row.document_id,
    excerpt: row.excerpt ?? undefined,
    page: row.page ?? undefined,
    createdAt: new Date(row.created_at).getTime(),
  };
}

export function nodeDocumentRefToRow(ref: GraphNodeDocumentRef, userId: string): Record<string, unknown> {
  return {
    id: ref.id,
    user_id: userId,
    node_id: ref.nodeId,
    document_id: ref.documentId,
    excerpt: ref.excerpt ?? null,
    page: ref.page ?? null,
  };
}

export async function fetchNodeDocumentRefs(userId: string, nodeId?: string): Promise<GraphNodeDocumentRef[]> {
  let query = supabase.from('graph_node_documents').select('*').eq('user_id', userId);
  if (nodeId !== undefined) query = query.eq('node_id', nodeId);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(rowToNodeDocumentRef);
}

/** Kein updateNodeDocumentRef — die Verknüpfung ist unveränderlich (neu
 *  anlegen + alte entfernen statt bearbeiten), es gibt keinen sinnvollen
 *  "Update"-Anwendungsfall für ein Zitat/eine Seitenzahl im Nachhinein. */
export async function createNodeDocumentRef(ref: GraphNodeDocumentRef, userId: string): Promise<GraphNodeDocumentRef> {
  const { data, error } = await supabase
    .from('graph_node_documents')
    .insert(nodeDocumentRefToRow(ref, userId))
    .select()
    .single();
  if (error) throw error;
  return rowToNodeDocumentRef(data);
}

export async function deleteNodeDocumentRef(refId: string, userId: string): Promise<void> {
  const { error } = await supabase.from('graph_node_documents').delete().eq('id', refId).eq('user_id', userId);
  if (error) throw error;
}
