import type { GraphState } from './types';
import type { GraphHistory } from './graphHistoryService';
import {
  recordUpdateNode, recordArchiveNode, recordCreateEdge, recordArchiveEdge,
} from './graphHistoryService';

/**
 * Geführter Duplikat-Merge für den Wissensnetz-Coach ("Doppelte Konzepte
 * erkennen", Baustein 5): Zwei Nodes, die dasselbe Konzept meinen, zu einem
 * zusammenführen — bisher gab es dafür nur "Ansehen", der Nutzer musste
 * manuell umbenennen/Notizen kopieren/Kanten neu ziehen.
 *
 * Was der Merge tut (alles über die normalen record*-Funktionen, dadurch
 * VOLLSTÄNDIG über Rückgängig wiederherstellbar):
 * 1. Kanten des entfernten Nodes auf den behaltenen Node umziehen — Richtung
 *    bleibt erhalten, außer es entstünde ein Self-Loop oder exakt dieselbe
 *    Verbindung (gleiche Endpunkte + gleicher Beziehungstyp) existiert schon:
 *    dann wird die Kante nur archiviert (gezählt als übersprungen).
 * 2. Eigene Notizen des entfernten Nodes an die des behaltenen anhängen
 *    (falls nicht identisch/already enthalten).
 * 3. Beschreibung übernehmen, falls der behaltene Node keine hat.
 * 4. Entfernten Node archivieren (nicht purge — über Undo + Papierkorb
 *    wiederholbar sicher).
 *
 * Bewusst NICHT übernommen: verknüpfte Unterlagen (GraphNodeDocumentRef) des
 * entfernten Nodes — dafür existiert keine Undo-gedeckte Mutation (s.
 * graphHistoryService.ts), und ein halb-undobarer Merge wäre schlechter als
 * eine ehrliche Lücke. previewMergeNodes meldet die Anzahl, die UI weist
 * darauf hin.
 */

export interface MergeNodesResult {
  state: GraphState;
  history: GraphHistory;
  /** Auf den behaltenen Node umgezogene Kanten. */
  movedEdges: number;
  /** Übersprungene Kanten: exakte Duplikate oder would-be Self-Loops. */
  skippedEdges: number;
  notesAppended: boolean;
  descriptionFilled: boolean;
  error?: string;
}

export interface MergeNodesPreview {
  movedEdges: number;
  skippedEdges: number;
  /** Eigene Notizen des entfernten Nodes würden übernommen. */
  hasNotes: boolean;
  /** Beschreibung des entfernten Nodes würde übernommen. */
  hasDescription: boolean;
  /** Verknüpfte Unterlagen am entfernten Node (werden NICHT übernommen). */
  linkedDocuments: number;
}

/** Kanten des Nodes `removeId`, die den aktiven (nicht archivierten) Bestand
 *  berühren. */
function activeEdgesTouching(state: GraphState, removeId: string) {
  return [...state.edgesById.values()].filter(e =>
    e.archivedAt === undefined && (e.sourceNodeId === removeId || e.targetNodeId === removeId));
}

/** Existiert zwischen `aId` und `bId` bereits eine aktive Kante mit dem
 *  Beziehungstyp `relationTypeId` (Richtung unbetrachtet)? */
function hasActiveEdgeBetween(state: GraphState, aId: string, bId: string, relationTypeId?: string): boolean {
  return [...state.edgesById.values()].some(e =>
    e.archivedAt === undefined &&
    e.relationTypeId === relationTypeId &&
    ((e.sourceNodeId === aId && e.targetNodeId === bId) ||
     (e.sourceNodeId === bId && e.targetNodeId === aId)));
}

/** Rein lesende Vorschau: was würde passieren, ohne etwas zu verändern. */
export function previewMergeNodes(state: GraphState, keepId: string, removeId: string): MergeNodesPreview | { error: string } {
  const keep = state.nodesById.get(keepId);
  const remove = state.nodesById.get(removeId);
  if (!keep || !remove) return { error: 'Einer der Nodes existiert nicht (mehr).' };
  if (keep.archivedAt !== undefined || remove.archivedAt !== undefined) {
    return { error: 'Archivierte Nodes können nicht zusammengeführt werden.' };
  }

  let movedEdges = 0;
  let skippedEdges = 0;
  for (const edge of activeEdgesTouching(state, removeId)) {
    const otherId = edge.sourceNodeId === removeId ? edge.targetNodeId : edge.sourceNodeId;
    if (otherId === keepId || hasActiveEdgeBetween(state, keepId, otherId, edge.relationTypeId)) skippedEdges++;
    else movedEdges++;
  }

  return {
    movedEdges,
    skippedEdges,
    hasNotes: remove.notes.trim().length > 0,
    hasDescription: remove.description.trim().length > 0,
    linkedDocuments: [...state.nodeDocumentsById.values()].filter(r => r.nodeId === removeId).length,
  };
}

/** Führt `removeId` in `keepId` zusammen (Details s. Datei-Kommentar). */
export function mergeNodes(history: GraphHistory, state: GraphState, keepId: string, removeId: string): MergeNodesResult {
  const preview = previewMergeNodes(state, keepId, removeId);
  if ('error' in preview) {
    return { state, history, movedEdges: 0, skippedEdges: 0, notesAppended: false, descriptionFilled: false, error: preview.error };
  }

  let workingState = state;
  let workingHistory = history;
  let movedEdges = 0;
  let skippedEdges = 0;

  for (const edge of activeEdgesTouching(workingState, removeId)) {
    const otherId = edge.sourceNodeId === removeId ? edge.targetNodeId : edge.sourceNodeId;
    if (otherId === keepId || hasActiveEdgeBetween(workingState, keepId, otherId, edge.relationTypeId)) {
      skippedEdges++;
    } else {
      const created = recordCreateEdge(workingHistory, workingState, {
        sourceNodeId: edge.sourceNodeId === removeId ? keepId : edge.sourceNodeId,
        targetNodeId: edge.targetNodeId === removeId ? keepId : edge.targetNodeId,
        relationTypeId: edge.relationTypeId,
      });
      if (!created.error && created.entity) {
        workingState = created.state;
        workingHistory = created.history;
        movedEdges++;
      } else {
        skippedEdges++;
      }
    }
    const archived = recordArchiveEdge(workingHistory, workingState, edge.id);
    if (!archived.error) {
      workingState = archived.state;
      workingHistory = archived.history;
    }
  }

  const remove = state.nodesById.get(removeId)!;
  if (preview.hasNotes) {
    const keepNotes = workingState.nodesById.get(keepId)?.notes.trim() ?? '';
    const removeNotes = remove.notes.trim();
    if (keepNotes !== removeNotes && !keepNotes.includes(removeNotes)) {
      const updated = recordUpdateNode(workingHistory, workingState, keepId, {
        notes: keepNotes ? `${keepNotes}\n\n${removeNotes}` : removeNotes,
      });
      if (!updated.error) {
        workingState = updated.state;
        workingHistory = updated.history;
      }
    }
  }
  if (preview.hasDescription && !(workingState.nodesById.get(keepId)?.description.trim())) {
    const updated = recordUpdateNode(workingHistory, workingState, keepId, { description: remove.description.trim() });
    if (!updated.error) {
      workingState = updated.state;
      workingHistory = updated.history;
    }
  }

  const archivedNode = recordArchiveNode(workingHistory, workingState, removeId);
  if (archivedNode.error) {
    return { state: workingState, history: workingHistory, movedEdges, skippedEdges, notesAppended: preview.hasNotes, descriptionFilled: preview.hasDescription, error: archivedNode.error };
  }
  workingState = archivedNode.state;
  workingHistory = archivedNode.history;

  return {
    state: workingState,
    history: workingHistory,
    movedEdges,
    skippedEdges,
    notesAppended: preview.hasNotes,
    descriptionFilled: preview.hasDescription,
  };
}
