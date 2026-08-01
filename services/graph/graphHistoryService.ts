import type { GraphState, GraphNode, GraphEdge, CreateNodeInput, UpdateNodeInput, CreateEdgeInput, UpdateEdgeInput } from './types';
import {
  createNode, updateNode, archiveNode, restoreNode,
  createEdge, updateEdge, archiveEdge, restoreEdge,
} from './graphMutationService';

/**
 * Undo/Redo als Command-Pattern mit INVERSEN OPERATIONEN, bewusst NICHT
 * snapshot-basiert (s. KNOWLEDGE_GRAPH_PHASE1_PLAN.md): ein Undo-Schritt
 * speichert nur, wie die eine betroffene Entität wiederhergestellt wird —
 * nie eine Kopie des gesamten GraphState. Bei tausenden Nodes würde ein
 * Vollzustands-Schnappschuss pro Tastenanschlag den Speicherverbrauch
 * während aktiven Editierens unnötig aufblähen.
 *
 * Bewusst NICHT abgedeckt: purgeNode (endgültiges Löschen) sowie sämtliche
 * RelationType-/NodeDocumentRef-Mutationen. Erstes ist bereits als bewusste
 * Zweitaktion aus dem Papierkorb gestaltet (kein "versehentlich"-Fall, den
 * Undo lösen müsste); zweiteres sind seltene, eher "Einstellungs"-artige
 * Aktionen ohne den typischen Tipp-Fehler-Charakter, für den Undo/Redo primär
 * gedacht ist. Kann bei Bedarf ergänzt werden, ohne den Mechanismus zu ändern.
 *
 * Sessionlokal: GraphHistory wird nicht synchronisiert/persistiert und beim
 * Wechsel des Fach-Scopes verworfen (createEmptyHistory() erneut aufrufen).
 */

export interface HistoryEntry {
  undo: (state: GraphState) => GraphState;
  redo: (state: GraphState) => GraphState;
}

export interface GraphHistory {
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
}

export interface HistoryMutationResult<TEntity> {
  state: GraphState;
  history: GraphHistory;
  entity?: TEntity;
  error?: string;
}

const MAX_HISTORY = 50;

export const createEmptyHistory = (): GraphHistory => ({ undoStack: [], redoStack: [] });

export const canUndo = (history: GraphHistory): boolean => history.undoStack.length > 0;
export const canRedo = (history: GraphHistory): boolean => history.redoStack.length > 0;

/** Eine neue Aktion verwirft immer den Redo-Zweig — Standardverhalten jedes
 *  Undo/Redo-Systems (Editieren nach einem Undo macht das verworfene "Redo"
 *  ungültig). */
const pushEntry = (history: GraphHistory, entry: HistoryEntry): GraphHistory => ({
  undoStack: [...history.undoStack, entry].slice(-MAX_HISTORY),
  redoStack: [],
});

export function undo(history: GraphHistory, state: GraphState): { state: GraphState; history: GraphHistory } {
  const entry = history.undoStack[history.undoStack.length - 1];
  if (!entry) return { state, history };
  return {
    state: entry.undo(state),
    history: { undoStack: history.undoStack.slice(0, -1), redoStack: [...history.redoStack, entry] },
  };
}

export function redo(history: GraphHistory, state: GraphState): { state: GraphState; history: GraphHistory } {
  const entry = history.redoStack[history.redoStack.length - 1];
  if (!entry) return { state, history };
  return {
    state: entry.redo(state),
    history: { undoStack: [...history.undoStack, entry], redoStack: history.redoStack.slice(0, -1) },
  };
}

// ─── Nodes ────────────────────────────────────────────────────────────────────

/** Redo einer Node-Erstellung ist bewusst restoreNode(id), NICHT erneut
 *  createNode(input) — Letzteres würde eine NEUE, zufällige ID erzeugen statt
 *  denselben Node zurückzubringen, den Undo archiviert hatte. */
export function recordCreateNode(history: GraphHistory, state: GraphState, input: CreateNodeInput): HistoryMutationResult<GraphNode> {
  const result = createNode(state, input);
  if (result.error || !result.entity) return { state: result.state, history, error: result.error };

  const nodeId = result.entity.id;
  const entry: HistoryEntry = {
    undo: s => archiveNode(s, nodeId).state,
    redo: s => restoreNode(s, nodeId).state,
  };
  return { state: result.state, history: pushEntry(history, entry), entity: result.entity };
}

/** Speichert nur die VORHER-Werte der tatsächlich im patch enthaltenen
 *  Felder, nicht den kompletten Node — der kleinstmögliche Undo-Schritt. */
export function recordUpdateNode(history: GraphHistory, state: GraphState, nodeId: string, patch: UpdateNodeInput): HistoryMutationResult<GraphNode> {
  const before = state.nodesById.get(nodeId);
  if (!before) return { state, history, error: 'Dieser Node existiert nicht oder ist archiviert.' };

  const result = updateNode(state, nodeId, patch);
  if (result.error || !result.entity) return { state: result.state, history, error: result.error };

  const inversePatch: UpdateNodeInput = {};
  (Object.keys(patch) as (keyof UpdateNodeInput)[]).forEach(key => {
    (inversePatch as Record<string, unknown>)[key] = before[key];
  });

  const entry: HistoryEntry = {
    undo: s => updateNode(s, nodeId, inversePatch).state,
    redo: s => updateNode(s, nodeId, patch).state,
  };
  return { state: result.state, history: pushEntry(history, entry), entity: result.entity };
}

export function recordArchiveNode(history: GraphHistory, state: GraphState, nodeId: string): HistoryMutationResult<GraphNode> {
  const result = archiveNode(state, nodeId);
  if (result.error || !result.entity) return { state: result.state, history, error: result.error };

  const entry: HistoryEntry = {
    undo: s => restoreNode(s, nodeId).state,
    redo: s => archiveNode(s, nodeId).state,
  };
  return { state: result.state, history: pushEntry(history, entry), entity: result.entity };
}

export function recordRestoreNode(history: GraphHistory, state: GraphState, nodeId: string): HistoryMutationResult<GraphNode> {
  const result = restoreNode(state, nodeId);
  if (result.error || !result.entity) return { state: result.state, history, error: result.error };

  const entry: HistoryEntry = {
    undo: s => archiveNode(s, nodeId).state,
    redo: s => restoreNode(s, nodeId).state,
  };
  return { state: result.state, history: pushEntry(history, entry), entity: result.entity };
}

// ─── Edges ────────────────────────────────────────────────────────────────────

export function recordCreateEdge(history: GraphHistory, state: GraphState, input: CreateEdgeInput): HistoryMutationResult<GraphEdge> {
  const result = createEdge(state, input);
  if (result.error || !result.entity) return { state: result.state, history, error: result.error };

  const edgeId = result.entity.id;
  const entry: HistoryEntry = {
    undo: s => archiveEdge(s, edgeId).state,
    redo: s => restoreEdge(s, edgeId).state,
  };
  return { state: result.state, history: pushEntry(history, entry), entity: result.entity };
}

export function recordUpdateEdge(history: GraphHistory, state: GraphState, edgeId: string, patch: UpdateEdgeInput): HistoryMutationResult<GraphEdge> {
  const before = state.edgesById.get(edgeId);
  if (!before) return { state, history, error: 'Diese Kante existiert nicht oder ist archiviert.' };

  const result = updateEdge(state, edgeId, patch);
  if (result.error || !result.entity) return { state: result.state, history, error: result.error };

  const inversePatch: UpdateEdgeInput = {};
  (Object.keys(patch) as (keyof UpdateEdgeInput)[]).forEach(key => {
    (inversePatch as Record<string, unknown>)[key] = before[key];
  });

  const entry: HistoryEntry = {
    undo: s => updateEdge(s, edgeId, inversePatch).state,
    redo: s => updateEdge(s, edgeId, patch).state,
  };
  return { state: result.state, history: pushEntry(history, entry), entity: result.entity };
}

export function recordArchiveEdge(history: GraphHistory, state: GraphState, edgeId: string): HistoryMutationResult<GraphEdge> {
  const result = archiveEdge(state, edgeId);
  if (result.error || !result.entity) return { state: result.state, history, error: result.error };

  const entry: HistoryEntry = {
    undo: s => restoreEdge(s, edgeId).state,
    redo: s => archiveEdge(s, edgeId).state,
  };
  return { state: result.state, history: pushEntry(history, entry), entity: result.entity };
}

export function recordRestoreEdge(history: GraphHistory, state: GraphState, edgeId: string): HistoryMutationResult<GraphEdge> {
  const result = restoreEdge(state, edgeId);
  if (result.error || !result.entity) return { state: result.state, history, error: result.error };

  const entry: HistoryEntry = {
    undo: s => archiveEdge(s, edgeId).state,
    redo: s => restoreEdge(s, edgeId).state,
  };
  return { state: result.state, history: pushEntry(history, entry), entity: result.entity };
}
