import { describe, it, expect } from 'vitest';
import { createEmptyGraphState } from './types';
import { createNode, createEdge, createRelationType } from './graphMutationService';
import {
  createEmptyHistory, canUndo, canRedo, undo, redo,
  recordCreateNode, recordUpdateNode, recordArchiveNode, recordRestoreNode,
  recordCreateEdge, recordUpdateEdge, recordArchiveEdge, recordRestoreEdge,
} from './graphHistoryService';

describe('createEmptyHistory / canUndo / canRedo', () => {
  it('ist leer und weder undo- noch redo-fähig', () => {
    const history = createEmptyHistory();
    expect(canUndo(history)).toBe(false);
    expect(canRedo(history)).toBe(false);
  });
});

describe('recordCreateNode + undo/redo', () => {
  it('undo archiviert den erstellten Node, redo stellt exakt DENSELBEN Node wieder her (gleiche ID)', () => {
    let state = createEmptyGraphState({ kind: 'all' });
    let history = createEmptyHistory();

    const created = recordCreateNode(history, state, { title: 'Falsifikation', position: { x: 0, y: 0 } });
    state = created.state;
    history = created.history;
    const nodeId = created.entity!.id;
    expect(canUndo(history)).toBe(true);

    const afterUndo = undo(history, state);
    expect(afterUndo.state.nodesById.get(nodeId)?.archivedAt).toBeDefined();
    expect(canRedo(afterUndo.history)).toBe(true);

    const afterRedo = redo(afterUndo.history, afterUndo.state);
    expect(afterRedo.state.nodesById.get(nodeId)?.id).toBe(nodeId);
    expect(afterRedo.state.nodesById.get(nodeId)?.archivedAt).toBeUndefined();
  });

  it('gibt bei ungültigem Titel einen Fehler zurück, ohne die History zu verändern', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    const history = createEmptyHistory();
    const result = recordCreateNode(history, state, { title: '  ', position: { x: 0, y: 0 } });
    expect(result.error).toBeDefined();
    expect(canUndo(result.history)).toBe(false);
  });
});

describe('recordUpdateNode + undo/redo', () => {
  it('undo stellt NUR die im patch geänderten Felder wieder her, nicht den ganzen Node', () => {
    let state = createEmptyGraphState({ kind: 'all' });
    let history = createEmptyHistory();

    const created = recordCreateNode(history, state, { title: 'Alt', position: { x: 0, y: 0 }, tags: ['bio'] });
    state = created.state;
    history = created.history;
    const nodeId = created.entity!.id;

    const updated = recordUpdateNode(history, state, nodeId, { title: 'Neu' });
    state = updated.state;
    history = updated.history;
    expect(state.nodesById.get(nodeId)?.title).toBe('Neu');
    expect(state.nodesById.get(nodeId)?.tags).toEqual(['bio']); // unberührt

    const afterUndo = undo(history, state);
    expect(afterUndo.state.nodesById.get(nodeId)?.title).toBe('Alt');
    expect(afterUndo.state.nodesById.get(nodeId)?.tags).toEqual(['bio']); // weiterhin unberührt

    const afterRedo = redo(afterUndo.history, afterUndo.state);
    expect(afterRedo.state.nodesById.get(nodeId)?.title).toBe('Neu');
  });

  it('lehnt eine Änderung an einem nicht existierenden Node ab, ohne die History zu verändern', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    const history = createEmptyHistory();
    const result = recordUpdateNode(history, state, 'ghost', { title: 'X' });
    expect(result.error).toBeDefined();
    expect(canUndo(result.history)).toBe(false);
  });
});

describe('recordArchiveNode / recordRestoreNode', () => {
  it('sind zueinander inverse Aufzeichnungen', () => {
    let state = createEmptyGraphState({ kind: 'all' });
    let history = createEmptyHistory();
    const created = recordCreateNode(history, state, { title: 'A', position: { x: 0, y: 0 } });
    state = created.state;
    history = createEmptyHistory(); // Erstellung selbst nicht Teil dieser Prüfung
    const nodeId = created.entity!.id;

    const archived = recordArchiveNode(history, state, nodeId);
    state = archived.state;
    history = archived.history;
    expect(state.nodesById.get(nodeId)?.archivedAt).toBeDefined();

    const afterUndo = undo(history, state);
    expect(afterUndo.state.nodesById.get(nodeId)?.archivedAt).toBeUndefined();
  });
});

describe('Redo-Zweig wird durch eine neue Aktion verworfen', () => {
  it('nach undo + neuer Aktion ist redo nicht mehr möglich', () => {
    let state = createEmptyGraphState({ kind: 'all' });
    let history = createEmptyHistory();

    const a = recordCreateNode(history, state, { title: 'A', position: { x: 0, y: 0 } });
    state = a.state; history = a.history;
    const b = recordCreateNode(history, state, { title: 'B', position: { x: 0, y: 0 } });
    state = b.state; history = b.history;

    const afterUndo = undo(history, state);
    expect(canRedo(afterUndo.history)).toBe(true);

    const c = recordCreateNode(afterUndo.history, afterUndo.state, { title: 'C', position: { x: 0, y: 0 } });
    expect(canRedo(c.history)).toBe(false);
  });
});

describe('Undo-Stack ist auf 50 Einträge gedeckelt', () => {
  it('verwirft die ältesten Einträge, wenn mehr als 50 Aktionen ausgeführt wurden', () => {
    let state = createEmptyGraphState({ kind: 'all' });
    let history = createEmptyHistory();

    for (let i = 0; i < 55; i++) {
      const result = recordCreateNode(history, state, { title: `Node ${i}`, position: { x: 0, y: 0 } });
      state = result.state;
      history = result.history;
    }

    expect(history.undoStack.length).toBe(50);
  });
});

describe('Edges: recordCreateEdge / recordUpdateEdge / recordArchiveEdge / recordRestoreEdge', () => {
  const setup = () => {
    let state = createEmptyGraphState({ kind: 'all' });
    state = createRelationType(state, { label: 'rel-alt' }).state;
    state = createRelationType(state, { label: 'rel-neu' }).state;
    const relAltId = [...state.relationTypesById.values()].find(r => r.label === 'rel-alt')!.id;
    const relNeuId = [...state.relationTypesById.values()].find(r => r.label === 'rel-neu')!.id;
    const a = createNode(state, { title: 'A', position: { x: 0, y: 0 } });
    state = a.state;
    const b = createNode(state, { title: 'B', position: { x: 0, y: 0 } });
    state = b.state;
    return { state, aId: a.entity!.id, bId: b.entity!.id, relAltId, relNeuId };
  };

  it('Kante erstellen/undo/redo bringt exakt dieselbe Kanten-ID zurück', () => {
    const { state: initial, aId, bId, relAltId } = setup();
    let state = initial;
    let history = createEmptyHistory();

    const created = recordCreateEdge(history, state, { sourceNodeId: aId, targetNodeId: bId, relationTypeId: relAltId });
    state = created.state;
    history = created.history;
    const edgeId = created.entity!.id;

    const afterUndo = undo(history, state);
    expect(afterUndo.state.edgesById.get(edgeId)?.archivedAt).toBeDefined();

    const afterRedo = redo(afterUndo.history, afterUndo.state);
    expect(afterRedo.state.edgesById.get(edgeId)?.id).toBe(edgeId);
    expect(afterRedo.state.edgesById.get(edgeId)?.archivedAt).toBeUndefined();
  });

  it('Retype einer Kante: undo stellt den alten Beziehungstyp wieder her', () => {
    const { state: initial, aId, bId, relAltId, relNeuId } = setup();
    let state = initial;
    let history = createEmptyHistory();

    const created = recordCreateEdge(history, state, { sourceNodeId: aId, targetNodeId: bId, relationTypeId: relAltId });
    state = created.state;
    history = created.history;
    const edgeId = created.entity!.id;

    const retyped = recordUpdateEdge(history, state, edgeId, { relationTypeId: relNeuId });
    state = retyped.state;
    history = retyped.history;
    expect(state.edgesById.get(edgeId)?.relationTypeId).toBe(relNeuId);

    const afterUndo = undo(history, state);
    expect(afterUndo.state.edgesById.get(edgeId)?.relationTypeId).toBe(relAltId);
  });

  it('archiveEdge/restoreEdge sind zueinander inverse Aufzeichnungen', () => {
    const { state: initial, aId, bId, relAltId } = setup();
    let state = initial;
    const created = createEdge(state, { sourceNodeId: aId, targetNodeId: bId, relationTypeId: relAltId });
    state = created.state;
    const edgeId = created.entity!.id;

    let history = createEmptyHistory();
    const archived = recordArchiveEdge(history, state, edgeId);
    state = archived.state;
    history = archived.history;

    const afterUndo = undo(history, state);
    expect(afterUndo.state.edgesById.get(edgeId)?.archivedAt).toBeUndefined();

    const restored = recordRestoreEdge(createEmptyHistory(), afterUndo.state, edgeId);
    // restoreEdge auf einer bereits aktiven Kante: idempotent, kein Fehler, keine neue History nötig
    expect(restored.error).toBeUndefined();
  });
});
