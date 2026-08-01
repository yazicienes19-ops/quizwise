import { describe, it, expect } from 'vitest';
import { createEmptyGraphState, type GraphNode, type GraphRelationType } from './types';
import {
  createNode, updateNode, archiveNode, restoreNode, purgeNode,
  createEdge, updateEdge, archiveEdge, restoreEdge,
  createRelationType, updateRelationType, deleteRelationType,
  createNodeDocumentRef, removeNodeDocumentRef,
} from './graphMutationService';

const withRelationType = (state: ReturnType<typeof createEmptyGraphState>, rt: Partial<GraphRelationType> & { id: string }) => {
  const full: GraphRelationType = { label: rt.id, symmetric: false, isBuiltIn: false, sortOrder: 0, createdAt: 0, ...rt };
  state.relationTypesById.set(full.id, full);
  return state;
};

describe('createNode', () => {
  it('lehnt einen leeren Titel ab und lässt den State unverändert', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    const result = createNode(state, { title: '   ', position: { x: 0, y: 0 } });
    expect(result.error).toBeDefined();
    expect(result.entity).toBeUndefined();
    expect(result.state).toBe(state); // exakt derselbe State, keine Kopie
  });

  it('legt einen Node mit sinnvollen Defaults an', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    const result = createNode(state, { title: '  Falsifikationsprinzip  ', position: { x: 10, y: 20 } });

    expect(result.error).toBeUndefined();
    expect(result.entity?.title).toBe('Falsifikationsprinzip'); // getrimmt
    expect(result.entity?.type).toBe('begriff');
    expect(result.entity?.tags).toEqual([]);
    expect(result.entity?.pinned).toBe(false);
    expect(result.entity?.archivedAt).toBeUndefined();
    expect(result.entity?.version).toBe(1);
    expect(result.state.nodesById.size).toBe(1);
    expect(state.nodesById.size).toBe(0); // Original-State bleibt unangetastet (Immutabilität)
  });
});

describe('updateNode', () => {
  it('lehnt ab, wenn der Node nicht existiert', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    const result = updateNode(state, 'ghost', { title: 'X' });
    expect(result.error).toBeDefined();
  });

  it('lehnt ab, wenn der Node archiviert ist', () => {
    let state = createEmptyGraphState({ kind: 'all' });
    const created = createNode(state, { title: 'A', position: { x: 0, y: 0 } });
    state = created.state;
    state = archiveNode(state, created.entity!.id).state;

    const result = updateNode(state, created.entity!.id, { title: 'B' });
    expect(result.error).toBeDefined();
  });

  it('aktualisiert Felder, trimmt den Titel und erhöht version', () => {
    let state = createEmptyGraphState({ kind: 'all' });
    const created = createNode(state, { title: 'A', position: { x: 0, y: 0 } });
    state = created.state;

    const result = updateNode(state, created.entity!.id, { title: '  Neuer Titel  ', tags: ['statistik'] });
    expect(result.entity?.title).toBe('Neuer Titel');
    expect(result.entity?.tags).toEqual(['statistik']);
    expect(result.entity?.version).toBe(2);
  });

  it('lehnt einen leeren Titel beim Update ab', () => {
    let state = createEmptyGraphState({ kind: 'all' });
    const created = createNode(state, { title: 'A', position: { x: 0, y: 0 } });
    state = created.state;

    const result = updateNode(state, created.entity!.id, { title: '  ' });
    expect(result.error).toBeDefined();
  });
});

describe('archiveNode / restoreNode', () => {
  it('setzt archivedAt beim Archivieren und löscht es beim Wiederherstellen', () => {
    let state = createEmptyGraphState({ kind: 'all' });
    const created = createNode(state, { title: 'A', position: { x: 0, y: 0 } });
    state = created.state;
    const id = created.entity!.id;

    const archived = archiveNode(state, id);
    expect(archived.entity?.archivedAt).toBeDefined();
    state = archived.state;

    const restored = restoreNode(state, id);
    expect(restored.entity?.archivedAt).toBeUndefined();
  });

  it('ist idempotent: doppeltes Archivieren ist kein Fehler', () => {
    let state = createEmptyGraphState({ kind: 'all' });
    const created = createNode(state, { title: 'A', position: { x: 0, y: 0 } });
    state = archiveNode(created.state, created.entity!.id).state;

    const result = archiveNode(state, created.entity!.id);
    expect(result.error).toBeUndefined();
  });
});

describe('purgeNode', () => {
  it('lehnt das Löschen eines noch aktiven (nicht archivierten) Nodes ab', () => {
    let state = createEmptyGraphState({ kind: 'all' });
    const created = createNode(state, { title: 'A', position: { x: 0, y: 0 } });
    state = created.state;

    const result = purgeNode(state, created.entity!.id);
    expect(result.error).toBeDefined();
    expect(state.nodesById.has(created.entity!.id)).toBe(true);
  });

  it('entfernt einen archivierten Node vollständig, inklusive anhängender Kanten und Dokument-Verknüpfungen (Cascade)', () => {
    let state = createEmptyGraphState({ kind: 'all' });
    withRelationType(state, { id: 'rel-1' });
    const a = createNode(state, { title: 'A', position: { x: 0, y: 0 } });
    state = a.state;
    const b = createNode(state, { title: 'B', position: { x: 0, y: 0 } });
    state = b.state;
    state = createEdge(state, { sourceNodeId: a.entity!.id, targetNodeId: b.entity!.id, relationTypeId: 'rel-1' }).state;
    state = createNodeDocumentRef(state, { nodeId: a.entity!.id, documentId: 'doc-1' }).state;
    state = archiveNode(state, a.entity!.id).state;

    const result = purgeNode(state, a.entity!.id);
    expect(result.error).toBeUndefined();
    expect(result.state.nodesById.has(a.entity!.id)).toBe(false);
    expect(result.state.edgesById.size).toBe(0);
    expect(result.state.nodeDocumentsById.size).toBe(0);
    expect(result.state.nodesById.has(b.entity!.id)).toBe(true); // B bleibt unberührt
  });
});

describe('createEdge', () => {
  const setup = () => {
    let state = createEmptyGraphState({ kind: 'all' });
    withRelationType(state, { id: 'rel-1' });
    const a = createNode(state, { title: 'A', position: { x: 0, y: 0 } });
    state = a.state;
    const b = createNode(state, { title: 'B', position: { x: 0, y: 0 } });
    state = b.state;
    return { state, aId: a.entity!.id, bId: b.entity!.id };
  };

  it('lehnt eine Selbstschleife ab', () => {
    const { state, aId } = setup();
    const result = createEdge(state, { sourceNodeId: aId, targetNodeId: aId, relationTypeId: 'rel-1' });
    expect(result.error).toBeDefined();
  });

  it('legt eine gültige Kante an', () => {
    const { state, aId, bId } = setup();
    const result = createEdge(state, { sourceNodeId: aId, targetNodeId: bId, relationTypeId: 'rel-1' });
    expect(result.error).toBeUndefined();
    expect(result.entity?.sourceNodeId).toBe(aId);
    expect(result.entity?.targetNodeId).toBe(bId);
  });

  it('lehnt eine inhaltlich doppelte Kante ab', () => {
    const { state, aId, bId } = setup();
    const first = createEdge(state, { sourceNodeId: aId, targetNodeId: bId, relationTypeId: 'rel-1' });
    const second = createEdge(first.state, { sourceNodeId: aId, targetNodeId: bId, relationTypeId: 'rel-1' });
    expect(second.error).toBeDefined();
  });
});

describe('updateEdge (Retype)', () => {
  it('erlaubt das Umtypen ohne Duplikat-Konflikt', () => {
    let state = createEmptyGraphState({ kind: 'all' });
    withRelationType(state, { id: 'rel-alt' });
    withRelationType(state, { id: 'rel-neu' });
    const a = createNode(state, { title: 'A', position: { x: 0, y: 0 } });
    state = a.state;
    const b = createNode(state, { title: 'B', position: { x: 0, y: 0 } });
    state = b.state;
    const edge = createEdge(state, { sourceNodeId: a.entity!.id, targetNodeId: b.entity!.id, relationTypeId: 'rel-alt' });
    state = edge.state;

    const result = updateEdge(state, edge.entity!.id, { relationTypeId: 'rel-neu' });
    expect(result.error).toBeUndefined();
    expect(result.entity?.relationTypeId).toBe('rel-neu');
    expect(result.entity?.version).toBe(2);
  });

  it('lehnt das Umtypen ab, wenn dadurch ein Duplikat zu einer anderen Kante entstünde', () => {
    let state = createEmptyGraphState({ kind: 'all' });
    withRelationType(state, { id: 'rel-alt' });
    withRelationType(state, { id: 'rel-ziel' });
    const a = createNode(state, { title: 'A', position: { x: 0, y: 0 } });
    state = a.state;
    const b = createNode(state, { title: 'B', position: { x: 0, y: 0 } });
    state = b.state;
    const e1 = createEdge(state, { sourceNodeId: a.entity!.id, targetNodeId: b.entity!.id, relationTypeId: 'rel-alt' });
    state = e1.state;
    const e2 = createEdge(state, { sourceNodeId: a.entity!.id, targetNodeId: b.entity!.id, relationTypeId: 'rel-ziel' });
    state = e2.state;

    const result = updateEdge(state, e1.entity!.id, { relationTypeId: 'rel-ziel' });
    expect(result.error).toBeDefined();
  });

  it('ändert nur das Label ohne erneute Duplikat-Prüfung', () => {
    let state = createEmptyGraphState({ kind: 'all' });
    withRelationType(state, { id: 'rel-1' });
    const a = createNode(state, { title: 'A', position: { x: 0, y: 0 } });
    state = a.state;
    const b = createNode(state, { title: 'B', position: { x: 0, y: 0 } });
    state = b.state;
    const edge = createEdge(state, { sourceNodeId: a.entity!.id, targetNodeId: b.entity!.id, relationTypeId: 'rel-1' });
    state = edge.state;

    const result = updateEdge(state, edge.entity!.id, { label: 'Sonderfall' });
    expect(result.entity?.label).toBe('Sonderfall');
    expect(result.entity?.relationTypeId).toBe('rel-1');
  });
});

describe('archiveEdge / restoreEdge', () => {
  const setup = () => {
    let state = createEmptyGraphState({ kind: 'all' });
    withRelationType(state, { id: 'rel-1' });
    const a = createNode(state, { title: 'A', position: { x: 0, y: 0 } });
    state = a.state;
    const b = createNode(state, { title: 'B', position: { x: 0, y: 0 } });
    state = b.state;
    const edge = createEdge(state, { sourceNodeId: a.entity!.id, targetNodeId: b.entity!.id, relationTypeId: 'rel-1' });
    return { state: edge.state, edgeId: edge.entity!.id, aId: a.entity!.id, bId: b.entity!.id };
  };

  it('archiviert und stellt wieder her', () => {
    const { state, edgeId } = setup();
    const archived = archiveEdge(state, edgeId);
    expect(archived.entity?.archivedAt).toBeDefined();

    const restored = restoreEdge(archived.state, edgeId);
    expect(restored.entity?.archivedAt).toBeUndefined();
  });

  it('lehnt die Wiederherstellung ab, wenn inzwischen ein Duplikat entstanden ist', () => {
    const { state, edgeId, aId, bId } = setup();
    const archived = archiveEdge(state, edgeId);
    const recreated = createEdge(archived.state, { sourceNodeId: aId, targetNodeId: bId, relationTypeId: 'rel-1' });
    expect(recreated.error).toBeUndefined(); // die archivierte Kante blockiert das Neuanlegen nicht

    const result = restoreEdge(recreated.state, edgeId);
    expect(result.error).toBeDefined();
  });

  it('lehnt die Wiederherstellung ab, wenn ein Endpunkt inzwischen archiviert wurde', () => {
    const { state, edgeId, aId } = setup();
    const archivedEdge = archiveEdge(state, edgeId);
    const archivedNode = archiveNode(archivedEdge.state, aId);

    const result = restoreEdge(archivedNode.state, edgeId);
    expect(result.error).toBeDefined();
  });
});

describe('createRelationType / updateRelationType / deleteRelationType', () => {
  it('legt einen eigenen Beziehungstyp an', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    const result = createRelationType(state, { label: 'Analogie zu' });
    expect(result.entity?.isBuiltIn).toBe(false);
    expect(result.entity?.symmetric).toBe(false);
  });

  it('lehnt ein Label ab, das bereits als eigener Typ existiert', () => {
    let state = createEmptyGraphState({ kind: 'all' });
    state = createRelationType(state, { label: 'Analogie zu' }).state;
    const result = createRelationType(state, { label: 'analogie zu' });
    expect(result.error).toBeDefined();
  });

  it('lehnt das Ändern eines eingebauten Typs ab', () => {
    let state = createEmptyGraphState({ kind: 'all' });
    withRelationType(state, { id: 'rel-built-in', isBuiltIn: true, label: 'Ursache von' });
    const result = updateRelationType(state, 'rel-built-in', { label: 'Anders' });
    expect(result.error).toBeDefined();
  });

  it('lehnt das Löschen eines noch benutzten Typs ab, erlaubt es danach', () => {
    let state = createEmptyGraphState({ kind: 'all' });
    const created = createRelationType(state, { label: 'Analogie zu' });
    state = created.state;
    const a = createNode(state, { title: 'A', position: { x: 0, y: 0 } });
    state = a.state;
    const b = createNode(state, { title: 'B', position: { x: 0, y: 0 } });
    state = b.state;
    state = createEdge(state, { sourceNodeId: a.entity!.id, targetNodeId: b.entity!.id, relationTypeId: created.entity!.id }).state;

    const blocked = deleteRelationType(state, created.entity!.id);
    expect(blocked.error).toBeDefined();

    state = archiveEdge(state, [...state.edgesById.values()][0].id).state;
    const allowed = deleteRelationType(state, created.entity!.id);
    expect(allowed.error).toBeUndefined();
    expect(allowed.state.relationTypesById.has(created.entity!.id)).toBe(false);
  });
});

describe('createNodeDocumentRef / removeNodeDocumentRef', () => {
  it('verknüpft einen Node mit einem Dokument und kann es wieder entfernen', () => {
    let state = createEmptyGraphState({ kind: 'all' });
    const a = createNode(state, { title: 'A', position: { x: 0, y: 0 } });
    state = a.state;

    const created = createNodeDocumentRef(state, { nodeId: a.entity!.id, documentId: 'doc-1', excerpt: 'Zitat' });
    expect(created.error).toBeUndefined();
    state = created.state;

    const removed = removeNodeDocumentRef(state, created.entity!.id);
    expect(removed.error).toBeUndefined();
    expect(removed.state.nodeDocumentsById.size).toBe(0);
  });

  it('lehnt eine Verknüpfung zu einem archivierten Node ab', () => {
    let state = createEmptyGraphState({ kind: 'all' });
    const a = createNode(state, { title: 'A', position: { x: 0, y: 0 } });
    state = archiveNode(a.state, a.entity!.id).state;

    const result = createNodeDocumentRef(state, { nodeId: a.entity!.id, documentId: 'doc-1' });
    expect(result.error).toBeDefined();
  });
});
