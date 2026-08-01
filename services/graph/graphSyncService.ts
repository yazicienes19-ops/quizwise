import type { GraphState, GraphScope, GraphNode, GraphEdge, GraphRelationType, GraphNodeDocumentRef } from './types';
import { createEmptyGraphState } from './types';
import * as repo from './graphRepository';

/**
 * Local-First-Ladezyklus, Sync-Cursor pro Scope, Last-Write-Wins-Merge und
 * dünne Push-Wrapper um GraphRepository. Bewusst GETRENNT von
 * GraphPersistenceService (s. KNOWLEDGE_GRAPH_PHASE1_PLAN.md): Persistence
 * muss synchron/sofort lokal schreiben können, unabhängig von Netzwerk —
 * Sync ist von Natur aus asynchron/netzwerkabhängig (Pull, Merge, Cursor).
 *
 * Stand dieser Phase: die öffentliche API ist vollständig nutzbar (jede
 * Funktion funktioniert isoliert und ist unten dokumentiert), aber NOCH VON
 * NIEMANDEM AUFGERUFEN — die Verdrahtung in einen Lade-Lebenszyklus (z.B.
 * einen künftigen useKnowledgeGraph-Hook) folgt erst in der UI-Phase. Das ist
 * eine ausdrückliche User-Entscheidung, keine Auslassung.
 *
 * Push-Funktionen werfen bei einem Fehler (kein try/catch hier) — ob ein
 * Fehlschlag geschluckt/wiederholt wird, entscheidet der Aufrufer
 * (GraphPersistenceService), exakt wie im Rest der App üblich
 * (z.B. `saveDeckToSupabase(...).catch(() => {})` am Aufrufort, nicht im
 * Service selbst).
 */

// ─── Scope → Storage-Key ─────────────────────────────────────────────────────

export const scopeKey = (scope: GraphScope): string =>
  scope.kind === 'all' ? 'all' : `collection:${scope.collectionId}`;

const cacheStorageKey = (scope: GraphScope): string => `studearc_graph_cache_${scopeKey(scope)}`;
const cursorStorageKey = (scope: GraphScope): string => `studearc_graph_cursor_${scopeKey(scope)}`;

// ─── Lokaler Cache (localStorage) ────────────────────────────────────────────
//
// Maps sind nicht direkt JSON-serialisierbar — Serialisierung in ein flaches,
// array-basiertes Zwischenformat, konsistent mit dem Rundreise-Muster, das
// GraphState an anderer Stelle bereits über Arrays aufbaut.

interface SerializedGraphState {
  scope: GraphScope;
  nodes: GraphNode[];
  edges: GraphEdge[];
  relationTypes: GraphRelationType[];
  nodeDocuments: GraphNodeDocumentRef[];
}

export function serializeGraphState(state: GraphState): SerializedGraphState {
  return {
    scope: state.scope,
    nodes: [...state.nodesById.values()],
    edges: [...state.edgesById.values()],
    relationTypes: [...state.relationTypesById.values()],
    nodeDocuments: [...state.nodeDocumentsById.values()],
  };
}

export function deserializeGraphState(serialized: SerializedGraphState): GraphState {
  return {
    scope: serialized.scope,
    nodesById: new Map(serialized.nodes.map(n => [n.id, n])),
    edgesById: new Map(serialized.edges.map(e => [e.id, e])),
    relationTypesById: new Map(serialized.relationTypes.map(rt => [rt.id, rt])),
    nodeDocumentsById: new Map(serialized.nodeDocuments.map(r => [r.id, r])),
  };
}

/** Liefert einen leeren State für den Scope, falls noch kein Cache existiert
 *  oder er beschädigt ist — niemals eine Exception für einen fehlenden/
 *  kaputten Cache, ein leerer Graph ist ein gültiger Startzustand. */
export function loadCachedState(scope: GraphScope): GraphState {
  try {
    const raw = localStorage.getItem(cacheStorageKey(scope));
    if (!raw) return createEmptyGraphState(scope);
    return deserializeGraphState(JSON.parse(raw));
  } catch {
    return createEmptyGraphState(scope);
  }
}

export function saveCachedState(state: GraphState): void {
  localStorage.setItem(cacheStorageKey(state.scope), JSON.stringify(serializeGraphState(state)));
}

export function getLastSyncedAt(scope: GraphScope): number | undefined {
  const raw = localStorage.getItem(cursorStorageKey(scope));
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function setLastSyncedAt(scope: GraphScope, timestamp: number): void {
  localStorage.setItem(cursorStorageKey(scope), String(timestamp));
}

// ─── Merge (Last-Write-Wins) ─────────────────────────────────────────────────
//
// WICHTIG: Ein inkrementeller Pull (updatedAfter=cursor) liefert nur die SEIT
// dem letzten Sync geänderten Zeilen, nicht den vollständigen Bestand — anders
// als das bestehende "lade alles, filtere lokal nach"-Muster in useDocuments.ts.
// mergeIncoming wendet deshalb Änderungen AUF einen bestehenden lokalen Stand
// AN, statt zwei komplette Listen gegeneinander abzugleichen.

/**
 * Für jede eingehende (vom Server neu geladene) Entität: übernehmen, außer der
 * lokale Stand ist NEUER (ein Fall, der nur auftritt, wenn ein lokaler Push
 * noch nicht bestätigt wurde, während gleichzeitig ein Pull hereinkommt).
 * Bei exakt gleichem updatedAt gewinnt der Server (er ist nach einem
 * erfolgreichen Push ohnehin die Quelle der Wahrheit für dieses Feld).
 */
export function mergeIncoming<T extends { id: string; updatedAt: number }>(
  localById: Map<string, T>,
  incoming: T[],
): Map<string, T> {
  const merged = new Map(localById);
  for (const item of incoming) {
    const existing = merged.get(item.id);
    if (!existing || item.updatedAt >= existing.updatedAt) {
      merged.set(item.id, item);
    }
  }
  return merged;
}

/** Wie mergeIncoming, aber für Entitäten ohne updatedAt (graph_relation_types,
 *  graph_node_documents — beide haben laut Datenmodell bewusst kein
 *  updated_at/version, s. KNOWLEDGE_GRAPH_PHASE1_PLAN.md). Hier ist Last-
 *  Write-Wins nicht anwendbar; der Server gewinnt immer, weil diese beiden
 *  Tabellen keinen sinnvollen Bearbeitungskonflikt kennen (Beziehungstypen
 *  sind selten geändert, Dokument-Refs sind unveränderlich). */
export function mergeIncomingServerWins<T extends { id: string }>(
  localById: Map<string, T>,
  incoming: T[],
): Map<string, T> {
  const merged = new Map(localById);
  for (const item of incoming) merged.set(item.id, item);
  return merged;
}

// ─── Pending Writes (Local-First-Durabilität) ───────────────────────────────
//
// Schließt die im Architektur-Review vom 2026-08-02 gefundene Lücke: ohne
// diese Liste verschwindet eine Änderung, deren Push fehlschlägt (echtes
// Offline, nicht nur Tab-Hintergrund), nach einem Reload spurlos — der lokale
// Cache sieht "normal" aus, nichts hält fest, dass er vom Server abweicht.
//
// markPending/clearPending laufen SYNCHRON und werden von
// GraphPersistenceService SOFORT bei jedem Commit aufgerufen — nicht erst
// nach Ablauf des Debounce. Das ist bewusst anders als saveCachedState
// (dort gilt der 400ms-Kompromiss aus graphPersistenceService.ts): ein
// Pending-Write-Eintrag ist ein einzelner kleiner Datensatz, keine
// Vollzustands-Serialisierung — seine Kosten sind vernachlässigbar, der
// Nutzen (Überleben eines Crashs MITTEN im Debounce-Fenster) ist es nicht.

export type PendingWriteKind = 'node' | 'edge' | 'relationType' | 'nodeDocumentRef';
export type PendingWriteOp = 'upsert' | 'delete';

export interface PendingWrite {
  kind: PendingWriteKind;
  id: string;
  op: PendingWriteOp;
}

const pendingWritesStorageKey = (scope: GraphScope): string => `studearc_graph_pending_${scopeKey(scope)}`;

export function loadPendingWrites(scope: GraphScope): PendingWrite[] {
  try {
    const raw = localStorage.getItem(pendingWritesStorageKey(scope));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function savePendingWrites(scope: GraphScope, writes: PendingWrite[]): void {
  localStorage.setItem(pendingWritesStorageKey(scope), JSON.stringify(writes));
}

/** Ersetzt einen ggf. bestehenden Eintrag für dieselbe (kind, id) — es zählt
 *  immer nur die zuletzt gewollte Aktion (z.B. überschreibt ein neues
 *  "upsert" ein älteres "delete", falls der Node zwischenzeitlich doch
 *  wiederhergestellt wurde, bevor die Löschung überhaupt bestätigt war). */
export function markPending(scope: GraphScope, kind: PendingWriteKind, id: string, op: PendingWriteOp): void {
  const writes = loadPendingWrites(scope).filter(w => !(w.kind === kind && w.id === id));
  writes.push({ kind, id, op });
  savePendingWrites(scope, writes);
}

export function clearPending(scope: GraphScope, kind: PendingWriteKind, id: string): void {
  const writes = loadPendingWrites(scope).filter(w => !(w.kind === kind && w.id === id));
  savePendingWrites(scope, writes);
}

export function hasPendingWrites(scope: GraphScope): boolean {
  return loadPendingWrites(scope).length > 0;
}

async function retryOne(write: PendingWrite, userId: string, state: GraphState): Promise<void> {
  if (write.op === 'delete') {
    if (write.kind === 'node') { await repo.deleteNode(write.id, userId); return; }
    if (write.kind === 'relationType') { await repo.deleteRelationType(write.id, userId); return; }
    if (write.kind === 'nodeDocumentRef') { await repo.deleteNodeDocumentRef(write.id, userId); return; }
    return; // 'edge': kein Hard-Delete vorgesehen (Scope-Entscheidung, s. graphMutationService.ts)
  }
  if (write.kind === 'node') {
    const node = state.nodesById.get(write.id);
    if (node) await repo.upsertNode(node, userId);
    return;
  }
  if (write.kind === 'edge') {
    const edge = state.edgesById.get(write.id);
    if (edge) await repo.upsertEdge(edge, userId);
    return;
  }
  if (write.kind === 'relationType') {
    const relationType = state.relationTypesById.get(write.id);
    if (relationType) await repo.upsertRelationType(relationType, userId);
    return;
  }
  if (write.kind === 'nodeDocumentRef') {
    const ref = state.nodeDocumentsById.get(write.id);
    if (ref) await repo.createNodeDocumentRef(ref, userId);
  }
}

/**
 * Versucht jede noch offene lokale Änderung erneut zu übertragen — macht aus
 * "Local-First hofft, dass der Debounce-Push durchkam" ein "Local-First
 * garantiert irgendwann Konsistenz". Wird von pullSince VOR dem eigentlichen
 * Pull aufgerufen (s. dort): ein zwischenzeitlicher Pull soll eine gerade
 * erst lokal gelöschte/geänderte Entität nicht mit einem veralteten
 * Server-Stand überschreiben bzw. fälschlich wiederherstellen.
 *
 * Fehlschläge bleiben stillschweigend pending (kein Retry-Backoff/Limit in
 * dieser Phase) — der nächste Aufruf (nächster App-Start, nächster
 * pullSince) versucht es erneut.
 *
 * Bekannte, bewusst akzeptierte Lücke: purgeNode löscht kaskadierend
 * anhängende Kanten/Dokument-Refs bereits lokal aus dem State (s.
 * graphMutationService.ts) — dafür wird NUR für den Node selbst ein
 * Pending-Delete geführt, nicht für jede kaskadierte Kante/jeden Ref. Der
 * DB-seitige ON DELETE CASCADE erledigt das automatisch, SOBALD der
 * Node-Delete durchkommt. Hängt der Node-Delete während dieser Zeit offline
 * fest, könnte ein zwischenzeitlicher Pull diese (serverseitig noch
 * existierenden) Kanten/Refs erneut in den lokalen Cache holen. Seltener,
 * zusammengesetzter Fall (offline + Purge + gleichzeitiger Pull) — nicht
 * gesondert abgesichert, da eine vollständige Lösung eine kaskadierende
 * Pending-Delete-Markierung für jede betroffene Kante/jeden Ref bräuchte.
 */
export async function retryPendingWrites(userId: string, state: GraphState): Promise<void> {
  for (const write of loadPendingWrites(state.scope)) {
    try {
      await retryOne(write, userId, state);
      clearPending(state.scope, write.kind, write.id);
    } catch {
      // bleibt pending — nächster Versuch beim nächsten Aufruf
    }
  }
}

// ─── Pull (inkrementell, gemergt, cache-aktualisierend) ─────────────────────

export async function pullSince(userId: string, scope: GraphScope): Promise<GraphState> {
  const cached = loadCachedState(scope);

  // Erst offene lokale Änderungen bestätigen — sonst könnte der direkt
  // anschließende Pull eine gerade erst lokal gelöschte/geänderte Entität
  // fälschlich mit einem veralteten Server-Stand überschreiben bzw.
  // wiederherstellen (s. retryPendingWrites).
  await retryPendingWrites(userId, cached);

  const cursor = getLastSyncedAt(scope);
  const collectionId = scope.kind === 'collection' ? scope.collectionId : undefined;
  const pullStartedAt = Date.now();

  const [nodes, edges, relationTypes, nodeDocuments] = await Promise.all([
    repo.fetchNodes(userId, { collectionId, updatedAfter: cursor, includeArchived: true }),
    repo.fetchEdges(userId, { updatedAfter: cursor, includeArchived: true }),
    repo.fetchRelationTypes(userId),
    repo.fetchNodeDocumentRefs(userId),
  ]);

  // Falls ein Node-Delete trotz retryPendingWrites weiterhin offline hängt:
  // nicht aus einer (noch veralteten) Cloud-Antwort wiederbeleben.
  const pendingDeletedNodeIds = new Set(
    loadPendingWrites(scope).filter(w => w.kind === 'node' && w.op === 'delete').map(w => w.id),
  );
  const incomingNodes = nodes.filter(n => !pendingDeletedNodeIds.has(n.id));

  const merged: GraphState = {
    scope,
    nodesById: mergeIncoming(cached.nodesById, incomingNodes),
    edgesById: mergeIncoming(cached.edgesById, edges),
    relationTypesById: mergeIncomingServerWins(cached.relationTypesById, relationTypes),
    nodeDocumentsById: mergeIncomingServerWins(cached.nodeDocumentsById, nodeDocuments),
  };

  saveCachedState(merged);
  // Cursor auf den Zeitpunkt VOR dem Request setzen, nicht "jetzt" nach
  // Abschluss — sonst könnte eine Änderung, die serverseitig exakt während
  // des Requests committet wurde, beim nächsten inkrementellen Pull verpasst
  // werden (Race zwischen Uhr des Servers und Laufzeit des Requests).
  setLastSyncedAt(scope, pullStartedAt);

  return merged;
}

// ─── Push (dünne Wrapper, kein Fehler-Schlucken) ────────────────────────────

export const pushNode = (node: GraphNode, userId: string): Promise<GraphNode> => repo.upsertNode(node, userId);
export const pushDeleteNode = (nodeId: string, userId: string): Promise<void> => repo.deleteNode(nodeId, userId);
export const pushEdge = (edge: GraphEdge, userId: string): Promise<GraphEdge> => repo.upsertEdge(edge, userId);
export const pushRelationType = (relationType: GraphRelationType, userId: string): Promise<GraphRelationType> =>
  repo.upsertRelationType(relationType, userId);
export const pushDeleteRelationType = (relationTypeId: string, userId: string): Promise<void> =>
  repo.deleteRelationType(relationTypeId, userId);
export const pushNodeDocumentRef = (ref: GraphNodeDocumentRef, userId: string): Promise<GraphNodeDocumentRef> =>
  repo.createNodeDocumentRef(ref, userId);
export const pushDeleteNodeDocumentRef = (refId: string, userId: string): Promise<void> =>
  repo.deleteNodeDocumentRef(refId, userId);
