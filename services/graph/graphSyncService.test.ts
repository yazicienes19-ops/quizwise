import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createEmptyGraphState, type GraphNode, type GraphRelationType, type GraphScope } from './types';
import * as repo from './graphRepository';
import {
  scopeKey, serializeGraphState, deserializeGraphState,
  loadCachedState, saveCachedState, getLastSyncedAt, setLastSyncedAt,
  mergeIncoming, mergeIncomingServerWins,
  markPending, clearPending, loadPendingWrites, hasPendingWrites, retryPendingWrites,
} from './graphSyncService';

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

const makeNode = (id: string, updatedAt: number, overrides: Partial<GraphNode> = {}): GraphNode => ({
  id, type: 'begriff', title: id, description: '', notes: '', tags: [],
  position: { x: 0, y: 0 }, pinned: false, version: 1, createdAt: 0, updatedAt,
  ...overrides,
});

describe('scopeKey', () => {
  it('unterscheidet Fach-Scope und Gesamtansicht', () => {
    expect(scopeKey({ kind: 'all' })).toBe('all');
    expect(scopeKey({ kind: 'collection', collectionId: 'col-1' })).toBe('collection:col-1');
  });
});

describe('serializeGraphState / deserializeGraphState', () => {
  it('Rundreise erhält alle vier Maps inhaltlich', () => {
    const state = createEmptyGraphState({ kind: 'collection', collectionId: 'col-1' });
    state.nodesById.set('n1', makeNode('n1', 100));
    const roundTripped = deserializeGraphState(serializeGraphState(state));

    expect(roundTripped.scope).toEqual(state.scope);
    expect(roundTripped.nodesById.get('n1')).toEqual(state.nodesById.get('n1'));
    expect(roundTripped.edgesById.size).toBe(0);
  });
});

describe('loadCachedState / saveCachedState', () => {
  it('liefert einen leeren State, wenn noch kein Cache existiert', () => {
    const state = loadCachedState({ kind: 'all' });
    expect(state.nodesById.size).toBe(0);
  });

  it('liefert einen leeren State bei kaputtem/nicht parsbarem Cache-Inhalt (kein Crash)', () => {
    localStorage.setItem('studearc_graph_cache_all', '{invalid json');
    const state = loadCachedState({ kind: 'all' });
    expect(state.nodesById.size).toBe(0);
  });

  it('speichert und lädt denselben Inhalt unter dem scope-spezifischen Key', () => {
    const state = createEmptyGraphState({ kind: 'collection', collectionId: 'col-1' });
    state.nodesById.set('n1', makeNode('n1', 100));
    saveCachedState(state);

    const loadedSameScope = loadCachedState({ kind: 'collection', collectionId: 'col-1' });
    expect(loadedSameScope.nodesById.get('n1')?.title).toBe('n1');

    const loadedOtherScope = loadCachedState({ kind: 'collection', collectionId: 'col-2' });
    expect(loadedOtherScope.nodesById.size).toBe(0); // eigener Cache-Key, keine Vermischung zwischen Fächern
  });
});

describe('getLastSyncedAt / setLastSyncedAt', () => {
  it('liefert undefined, solange noch nie synchronisiert wurde', () => {
    expect(getLastSyncedAt({ kind: 'all' })).toBeUndefined();
  });

  it('speichert und liest den Cursor pro Scope getrennt', () => {
    setLastSyncedAt({ kind: 'collection', collectionId: 'col-1' }, 12345);
    expect(getLastSyncedAt({ kind: 'collection', collectionId: 'col-1' })).toBe(12345);
    expect(getLastSyncedAt({ kind: 'collection', collectionId: 'col-2' })).toBeUndefined();
  });
});

describe('mergeIncoming (Last-Write-Wins anhand updatedAt)', () => {
  it('übernimmt eine neue, bisher unbekannte Entität', () => {
    const local = new Map<string, GraphNode>();
    const merged = mergeIncoming(local, [makeNode('n1', 100)]);
    expect(merged.get('n1')?.updatedAt).toBe(100);
  });

  it('übernimmt eine eingehende Entität, die neuer ist als der lokale Stand', () => {
    const local = new Map([['n1', makeNode('n1', 100, { title: 'alt' })]]);
    const merged = mergeIncoming(local, [makeNode('n1', 200, { title: 'neu' })]);
    expect(merged.get('n1')?.title).toBe('neu');
  });

  it('behält den lokalen Stand, wenn er NEUER ist als das eingehende (noch nicht bestätigter lokaler Push)', () => {
    const local = new Map([['n1', makeNode('n1', 300, { title: 'lokal-neuer' })]]);
    const merged = mergeIncoming(local, [makeNode('n1', 200, { title: 'server-alt' })]);
    expect(merged.get('n1')?.title).toBe('lokal-neuer');
  });

  it('lässt lokale Entitäten unangetastet, die im (partiellen, inkrementellen) Pull gar nicht vorkommen', () => {
    const local = new Map([['n1', makeNode('n1', 100)], ['n2', makeNode('n2', 100)]]);
    const merged = mergeIncoming(local, [makeNode('n1', 200)]); // n2 nicht Teil des inkrementellen Pulls
    expect(merged.has('n2')).toBe(true);
    expect(merged.get('n2')?.updatedAt).toBe(100);
  });
});

describe('mergeIncomingServerWins', () => {
  it('überschreibt den lokalen Stand immer mit dem Server-Stand', () => {
    const rt: GraphRelationType = { id: 'rel-1', label: 'Alt', symmetric: false, isBuiltIn: false, sortOrder: 0, createdAt: 0 };
    const local = new Map([['rel-1', rt]]);
    const merged = mergeIncomingServerWins(local, [{ ...rt, label: 'Neu (vom Server)' }]);
    expect(merged.get('rel-1')?.label).toBe('Neu (vom Server)');
  });
});

// ─── Pending Writes (Fix vom 2026-08-02, s. Architektur-Review) ─────────────

const ALL: GraphScope = { kind: 'all' };

describe('markPending / clearPending / loadPendingWrites / hasPendingWrites', () => {
  it('ist anfangs leer', () => {
    expect(loadPendingWrites(ALL)).toEqual([]);
    expect(hasPendingWrites(ALL)).toBe(false);
  });

  it('markiert und liest eine Entität als pending', () => {
    markPending(ALL, 'node', 'n1', 'upsert');
    expect(loadPendingWrites(ALL)).toEqual([{ kind: 'node', id: 'n1', op: 'upsert' }]);
    expect(hasPendingWrites(ALL)).toBe(true);
  });

  it('ersetzt einen bestehenden Eintrag für dieselbe (kind, id) statt zu duplizieren', () => {
    markPending(ALL, 'node', 'n1', 'upsert');
    markPending(ALL, 'node', 'n1', 'delete'); // z.B. archiviert, dann direkt gelöscht
    expect(loadPendingWrites(ALL)).toEqual([{ kind: 'node', id: 'n1', op: 'delete' }]);
  });

  it('führt mehrere unterschiedliche Entitäten unabhängig voneinander', () => {
    markPending(ALL, 'node', 'n1', 'upsert');
    markPending(ALL, 'edge', 'e1', 'upsert');
    expect(loadPendingWrites(ALL)).toHaveLength(2);
  });

  it('clearPending entfernt nur den betroffenen Eintrag', () => {
    markPending(ALL, 'node', 'n1', 'upsert');
    markPending(ALL, 'node', 'n2', 'upsert');
    clearPending(ALL, 'node', 'n1');
    expect(loadPendingWrites(ALL)).toEqual([{ kind: 'node', id: 'n2', op: 'upsert' }]);
  });

  it('hält Scopes getrennt (kein Durchsickern zwischen Fächern)', () => {
    const colA: GraphScope = { kind: 'collection', collectionId: 'a' };
    const colB: GraphScope = { kind: 'collection', collectionId: 'b' };
    markPending(colA, 'node', 'n1', 'upsert');
    expect(loadPendingWrites(colB)).toEqual([]);
  });
});

describe('retryPendingWrites', () => {
  it('versucht ein ausstehendes upsert erneut und löscht es bei Erfolg aus der Pending-Liste', async () => {
    const node = { id: 'n1', type: 'begriff', title: 'X', description: '', notes: '', tags: [], position: { x: 0, y: 0 }, pinned: false, version: 1, createdAt: 0, updatedAt: 0 } as GraphNode;
    const state = createEmptyGraphState(ALL);
    state.nodesById.set('n1', node);
    markPending(ALL, 'node', 'n1', 'upsert');

    vi.spyOn(repo, 'upsertNode').mockResolvedValue(node);
    await retryPendingWrites('user-1', state);

    expect(repo.upsertNode).toHaveBeenCalledWith(node, 'user-1');
    expect(loadPendingWrites(ALL)).toEqual([]);
  });

  it('behält einen fehlschlagenden Retry als weiterhin pending', async () => {
    const node = { id: 'n1', type: 'begriff', title: 'X', description: '', notes: '', tags: [], position: { x: 0, y: 0 }, pinned: false, version: 1, createdAt: 0, updatedAt: 0 } as GraphNode;
    const state = createEmptyGraphState(ALL);
    state.nodesById.set('n1', node);
    markPending(ALL, 'node', 'n1', 'upsert');

    vi.spyOn(repo, 'upsertNode').mockRejectedValue(new Error('offline'));
    await retryPendingWrites('user-1', state);

    expect(loadPendingWrites(ALL)).toEqual([{ kind: 'node', id: 'n1', op: 'upsert' }]);
  });

  it('versucht ein ausstehendes Node-Delete erneut (Kern des purgeNode-Fixes)', async () => {
    const state = createEmptyGraphState(ALL); // Node existiert im State schon nicht mehr (bereits lokal gepurged)
    markPending(ALL, 'node', 'n1', 'delete');

    vi.spyOn(repo, 'deleteNode').mockResolvedValue(undefined);
    await retryPendingWrites('user-1', state);

    expect(repo.deleteNode).toHaveBeenCalledWith('n1', 'user-1');
    expect(loadPendingWrites(ALL)).toEqual([]);
  });

  it('überspringt ein upsert, dessen Entität lokal gar nicht mehr existiert, ohne zu werfen', async () => {
    const state = createEmptyGraphState(ALL); // n1 existiert nicht (mehr) im State
    markPending(ALL, 'node', 'n1', 'upsert');
    vi.spyOn(repo, 'upsertNode');

    await expect(retryPendingWrites('user-1', state)).resolves.toBeUndefined();
    expect(repo.upsertNode).not.toHaveBeenCalled();
  });

  it('verarbeitet mehrere unterschiedliche Pending-Writes unabhängig voneinander', async () => {
    const state = createEmptyGraphState(ALL);
    markPending(ALL, 'relationType', 'rel-1', 'delete');
    markPending(ALL, 'nodeDocumentRef', 'ref-1', 'delete');

    vi.spyOn(repo, 'deleteRelationType').mockResolvedValue(undefined);
    vi.spyOn(repo, 'deleteNodeDocumentRef').mockResolvedValue(undefined);
    await retryPendingWrites('user-1', state);

    expect(repo.deleteRelationType).toHaveBeenCalledWith('rel-1', 'user-1');
    expect(repo.deleteNodeDocumentRef).toHaveBeenCalledWith('ref-1', 'user-1');
    expect(loadPendingWrites(ALL)).toEqual([]);
  });
});
