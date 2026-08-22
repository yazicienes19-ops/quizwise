import { describe, it, expect } from 'vitest';
import { createEmptyGraphState, type GraphState } from './types';
import { createNode, createEdge } from './graphMutationService';
import { createEmptyHistory, undo, type GraphHistory } from './graphHistoryService';
import { previewMergeNodes, mergeNodes } from './graphMergeService';

interface Fixture {
  state: GraphState;
  history: GraphHistory;
  ids: Record<string, string>;
}

/** Standard-Fixture: Keep "Konditionierung", Remove "Konditionierung (Duplikat)",
 *  zwei weitere Nodes, eine unique Kante am Remove, eine Duplikat-Kante. */
function buildFixture(): Fixture {
  let state = createEmptyGraphState({ kind: 'all' });
  const history = createEmptyHistory();
  const mk = (title: string, extra: { notes?: string; description?: string } = {}) => {
    const r = createNode(state, { title, position: { x: 0, y: 0 }, ...extra });
    if (r.error || !r.entity) throw new Error(`fixture node "${title}": ${r.error}`);
    state = r.state;
    return r.entity.id;
  };
  const keepId = mk('Konditionierung', { notes: 'Behalten-Notiz', description: 'Lerntheorie.' });
  const removeId = mk('Konditionierung (Duplikat)', { notes: 'Notiz aus Duplikat' });
  const pawlowId = mk('Pawlow');
  const bellId = mk('Glocke');

  // createEdge validiert relationTypeId gegen den State — Typen vorher anlegen
  for (const id of ['rt-1', 'rt-2', 'rt-3']) {
    state.relationTypesById.set(id, { id, label: id, symmetric: false, isBuiltIn: false, sortOrder: 0, createdAt: 0 });
  }

  const edge = (sourceNodeId: string, targetNodeId: string, relationTypeId?: string) => {
    const r = createEdge(state, { sourceNodeId, targetNodeId, relationTypeId });
    if (r.error || !r.entity) throw new Error(`fixture edge: ${r.error}`);
    state = r.state;
    return r.entity.id;
  };
  edge(removeId, pawlowId, 'rt-1');        // unique → soll umziehen
  edge(keepId, bellId, 'rt-2');            // Kante am Keep (bleibt)
  edge(removeId, keepId, 'rt-3');          // wird Self-Loop → übersprungen

  return { state, history, ids: { keepId, removeId, pawlowId, bellId } };
}

describe('previewMergeNodes', () => {
  it('zählt umziehende/überspringende Kanten korrekt', () => {
    const { state, ids } = buildFixture();
    const preview = previewMergeNodes(state, ids.keepId, ids.removeId);
    expect(preview).not.toHaveProperty('error');
    expect((preview as any).movedEdges).toBe(1);
    expect((preview as any).skippedEdges).toBe(1); // Self-Loop keep↔remove
    expect((preview as any).hasNotes).toBe(true);
    expect((preview as any).hasDescription).toBe(false); // Remove hat keine
  });

  it('meldet Duplikat-Kanten als übersprungen (gleicher Beziehungstyp)', () => {
    const { state, ids } = buildFixture();
    // keep↔pawlow mit GLEICHEM Typ wie remove↔pawlow → Duplikat
    const r = createEdge(state, { sourceNodeId: ids.keepId, targetNodeId: ids.pawlowId, relationTypeId: 'rt-1' });
    expect(r.error).toBeUndefined();
    const preview = previewMergeNodes(r.state, ids.keepId, ids.removeId);
    expect((preview as any).movedEdges).toBe(0);
    expect((preview as any).skippedEdges).toBe(2);
  });

  it('lehnt unbekannte/archivierte Nodes ab', () => {
    const { state, ids } = buildFixture();
    expect(previewMergeNodes(state, ids.keepId, 'ghost')).toHaveProperty('error');
  });
});

describe('mergeNodes', () => {
  it('zieht unique Kanten um, archiviert den Remove-Node, übernimmt Notizen', () => {
    const { state, history, ids } = buildFixture();
    const result = mergeNodes(history, state, ids.keepId, ids.removeId);

    expect(result.error).toBeUndefined();
    expect(result.movedEdges).toBe(1);
    expect(result.skippedEdges).toBe(1);
    expect(result.notesAppended).toBe(true);

    // Remove-Node archiviert, Keep aktiv
    expect(result.state.nodesById.get(ids.removeId)?.archivedAt).toBeDefined();
    expect(result.state.nodesById.get(ids.keepId)?.archivedAt).toBeUndefined();

    // Neue Kante keep→pawlow aktiv, alte remove→pawlow archiviert
    const activePairs = [...result.state.edgesById.values()]
      .filter(e => e.archivedAt === undefined)
      .map(e => [e.sourceNodeId, e.targetNodeId].sort().join('|'));
    expect(activePairs).toContain([ids.keepId, ids.pawlowId].sort().join('|'));
    expect(activePairs).toContain([ids.keepId, ids.bellId].sort().join('|'));
    expect(activePairs).toHaveLength(2);

    // Notizen kombiniert
    expect(result.state.nodesById.get(ids.keepId)?.notes).toBe('Behalten-Notiz\n\nNotiz aus Duplikat');
  });

  it('erzeugt KEINE Doppelkante, wenn keep↔other mit gleichem Typ schon existiert', () => {
    const { state, history, ids } = buildFixture();
    const r = createEdge(state, { sourceNodeId: ids.keepId, targetNodeId: ids.pawlowId, relationTypeId: 'rt-1' });
    const result = mergeNodes(history, r.state, ids.keepId, ids.removeId);

    expect(result.movedEdges).toBe(0);
    expect(result.skippedEdges).toBe(2);
    const activeKeepPawlow = [...result.state.edgesById.values()].filter(e =>
      e.archivedAt === undefined &&
      ((e.sourceNodeId === ids.keepId && e.targetNodeId === ids.pawlowId) ||
       (e.sourceNodeId === ids.pawlowId && e.targetNodeId === ids.keepId)));
    expect(activeKeepPawlow).toHaveLength(1);
  });

  it('übernimmt die Beschreibung nur, wenn der Keep-Node keine hat', () => {
    let state = createEmptyGraphState({ kind: 'all' });
    const a = createNode(state, { title: 'A', position: { x: 0, y: 0 } });
    state = a!.state;
    const b = createNode(state, { title: 'B', position: { x: 0, y: 0 }, description: 'Beschreibung aus B' });
    state = b!.state;
    const result = mergeNodes(createEmptyHistory(), state, a!.entity!.id, b!.entity!.id);
    expect(result.state.nodesById.get(a!.entity!.id)?.description).toBe('Beschreibung aus B');
  });

  it('ist über Rückgängig vollständig wiederherstellbar', () => {
    const { state, history, ids } = buildFixture();
    const result = mergeNodes(history, state, ids.keepId, ids.removeId);

    // Alles wieder rückgängig machen, bis der Undo-Stack leer ist
    let current = { state: result.state, history: result.history };
    while (current.history.undoStack.length > 0) {
      current = undo(current.history, current.state);
    }

    // Remove-Node wieder aktiv, Kantenanzahl wie im Original
    expect(current.state.nodesById.get(ids.removeId)?.archivedAt).toBeUndefined();
    const activeCount = (s: GraphState) => [...s.edgesById.values()].filter(e => e.archivedAt === undefined).length;
    expect(activeCount(current.state)).toBe(activeCount(state));
  });
});
