import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act, cleanup } from '@testing-library/react';
import * as sync from '../services/graph/graphSyncService';
import * as persistence from '../services/graph/graphPersistenceService';
import { createEmptyGraphState, type GraphNode, type GraphScope } from '../services/graph/types';
import { createNode } from '../services/graph/graphMutationService';
import { createEmptyHistory, recordCreateNode } from '../services/graph/graphHistoryService';
import { useKnowledgeGraph } from './useKnowledgeGraph';

const ALL: GraphScope = { kind: 'all' };
const COLLECTION_A: GraphScope = { kind: 'collection', collectionId: 'a' };

const makeNode = (id: string): GraphNode => ({
  id, type: 'begriff', title: id, description: '', notes: '', tags: [],
  position: { x: 0, y: 0 }, pinned: false, version: 1, createdAt: 0, updatedAt: 0,
});

// Dieses Projekt setzt `test.globals` in vite.config.ts nicht — Testing
// Librarys automatische afterEach(cleanup)-Registrierung greift dadurch
// nicht. Ohne expliziten Unmount bleiben renderHook-Instanzen früherer Tests
// aktiv (eigene Effekte inkl. Cleanup-Timing bleiben unbeeinflusst, aber der
// jsdom-Dokumentzustand wird zwischen Tests nicht zurückgesetzt) — deshalb
// hier manuell.
afterEach(() => cleanup());

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(sync, 'loadCachedState').mockReturnValue(createEmptyGraphState(ALL));
  vi.spyOn(persistence, 'commitNode').mockImplementation(() => {});
  vi.spyOn(persistence, 'commitEdge').mockImplementation(() => {});
  vi.spyOn(persistence, 'initAutoFlush').mockReturnValue(() => {});
  vi.spyOn(persistence, 'flushAllPendingCommits').mockImplementation(() => {});
});

describe('useKnowledgeGraph — initiales Laden', () => {
  it('lädt sofort den lokalen Cache und beendet das Laden ohne Pull, wenn kein userId vorhanden ist', async () => {
    const cached = createEmptyGraphState(ALL);
    cached.nodesById.set('n1', makeNode('n1'));
    vi.spyOn(sync, 'loadCachedState').mockReturnValue(cached);
    const pullSpy = vi.spyOn(sync, 'pullSince');

    const { result } = renderHook(() => useKnowledgeGraph({ scope: ALL }));

    expect(result.current.state.nodesById.has('n1')).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(pullSpy).not.toHaveBeenCalled();
    expect(result.current.error).toBeUndefined();
  });

  it('pullt im Hintergrund und übernimmt den gemergten Stand, wenn ein userId vorhanden ist', async () => {
    const pulled = createEmptyGraphState(ALL);
    pulled.nodesById.set('remote', makeNode('remote'));
    vi.spyOn(sync, 'pullSince').mockResolvedValue(pulled);

    const { result } = renderHook(() => useKnowledgeGraph({ scope: ALL, userId: 'user-1' }));

    expect(result.current.loading).toBe(true); // synchron zunächst true
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.state.nodesById.has('remote')).toBe(true);
    expect(result.current.error).toBeUndefined();
  });

  it('setzt error bei fehlgeschlagenem initialen Pull, behält aber den lokalen Cache als state', async () => {
    const cached = createEmptyGraphState(ALL);
    cached.nodesById.set('lokal', makeNode('lokal'));
    vi.spyOn(sync, 'loadCachedState').mockReturnValue(cached);
    vi.spyOn(sync, 'pullSince').mockRejectedValue(new Error('offline'));

    const { result } = renderHook(() => useKnowledgeGraph({ scope: ALL, userId: 'user-1' }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('offline');
    expect(result.current.state.nodesById.has('lokal')).toBe(true); // kein Datenverlust durch den Fehler
  });

  it('lädt neu und setzt Selection/History zurück, wenn sich der Scope ändert', async () => {
    vi.spyOn(sync, 'loadCachedState').mockReturnValue(createEmptyGraphState(ALL));
    const { result, rerender } = renderHook(
      ({ scope }: { scope: GraphScope }) => useKnowledgeGraph({ scope }),
      { initialProps: { scope: ALL } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => { result.current.onSelectionChange({ selectedNodeId: 'n1' }); });
    expect(result.current.selection.selectedNodeId).toBe('n1');

    // Ohne userId läuft der Effekt (setLoading(true) → sofortiges Settle)
    // komplett synchron innerhalb desselben act()-Flushs — ein Zwischenstand
    // "loading: true" ist hier nicht beobachtbar, deshalb direkt auf den
    // Endzustand nach dem Scope-Wechsel prüfen statt auf einen Zwischenschritt.
    rerender({ scope: COLLECTION_A });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.selection.selectedNodeId).toBeUndefined();
    expect(sync.loadCachedState).toHaveBeenCalledWith(COLLECTION_A);
  });
});

describe('useKnowledgeGraph — onChange / onSelectionChange', () => {
  it('onChange übernimmt state und history', async () => {
    const { result } = renderHook(() => useKnowledgeGraph({ scope: ALL }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const created = createNode(result.current.state, { title: 'Neu', position: { x: 0, y: 0 } });
    act(() => { result.current.onChange({ state: created.state, history: createEmptyHistory() }); });

    expect(result.current.state.nodesById.get(created.entity!.id)?.title).toBe('Neu');
  });
});

describe('useKnowledgeGraph — onEntityChanged (Autosave)', () => {
  it('committet einen Node über GraphPersistenceService.commitNode mit dem aktuellen State', async () => {
    const { result } = renderHook(() => useKnowledgeGraph({ scope: ALL, userId: 'user-1' }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const created = createNode(result.current.state, { title: 'Neu', position: { x: 0, y: 0 } });
    act(() => {
      result.current.onChange({ state: created.state, history: createEmptyHistory() });
      result.current.onEntityChanged({ kind: 'node', entity: created.entity! });
    });

    expect(persistence.commitNode).toHaveBeenCalledWith(created.entity, created.state, { userId: 'user-1' });
  });

  it('verwendet den GERADE ERST per onChange gesetzten State, nicht einen veralteten (stateRef-Fix)', async () => {
    const { result } = renderHook(() => useKnowledgeGraph({ scope: ALL, userId: 'user-1' }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // onChange und onEntityChanged werden synchron nacheinander aufgerufen,
    // wie GraphCanvas es tatsächlich tut (z.B. in handleBackgroundDoubleClick).
    const created = createNode(result.current.state, { title: 'Neu', position: { x: 5, y: 9 } });
    act(() => {
      result.current.onChange({ state: created.state, history: createEmptyHistory() });
      result.current.onEntityChanged({ kind: 'node', entity: created.entity! });
    });

    const passedState = vi.mocked(persistence.commitNode).mock.calls[0][1];
    expect(passedState.nodesById.has(created.entity!.id)).toBe(true); // NICHT der leere Ausgangsstand
  });

  it('committet eine Kante über GraphPersistenceService.commitEdge', async () => {
    const { result } = renderHook(() => useKnowledgeGraph({ scope: ALL, userId: 'user-1' }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const edge = { id: 'e1', sourceNodeId: 'a', targetNodeId: 'b', relationTypeId: 'rel-1', version: 1, createdAt: 0, updatedAt: 0 };
    act(() => { result.current.onEntityChanged({ kind: 'edge', entity: edge }); });

    expect(persistence.commitEdge).toHaveBeenCalledWith(edge, result.current.state, { userId: 'user-1' });
  });

  it('committet ohne userId weiterhin (nur lokaler Cache, kein Push — Entscheidung liegt in GraphPersistenceService)', async () => {
    const { result } = renderHook(() => useKnowledgeGraph({ scope: ALL }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const created = createNode(result.current.state, { title: 'Neu', position: { x: 0, y: 0 } });
    act(() => { result.current.onEntityChanged({ kind: 'node', entity: created.entity! }); });

    expect(persistence.commitNode).toHaveBeenCalledWith(created.entity, expect.anything(), { userId: undefined });
  });
});

describe('useKnowledgeGraph — undo/redo', () => {
  it('macht eine über die History aufgezeichnete Aktion rückgängig und wieder her', async () => {
    const { result } = renderHook(() => useKnowledgeGraph({ scope: ALL }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const recorded = recordCreateNode(createEmptyHistory(), result.current.state, { title: 'X', position: { x: 0, y: 0 } });
    act(() => { result.current.onChange({ state: recorded.state, history: recorded.history }); });
    const nodeId = recorded.entity!.id;
    expect(result.current.state.nodesById.get(nodeId)?.archivedAt).toBeUndefined();

    act(() => { result.current.undo(); });
    expect(result.current.state.nodesById.get(nodeId)?.archivedAt).toBeDefined();

    act(() => { result.current.redo(); });
    expect(result.current.state.nodesById.get(nodeId)?.archivedAt).toBeUndefined();
  });
});

describe('useKnowledgeGraph — Persistence-Lifecycle', () => {
  it('registriert initAutoFlush einmalig beim Mount und ruft dessen Cleanup beim Unmount auf', async () => {
    const cleanup = vi.fn();
    vi.spyOn(persistence, 'initAutoFlush').mockReturnValue(cleanup);

    const { unmount } = renderHook(() => useKnowledgeGraph({ scope: ALL }));
    expect(persistence.initAutoFlush).toHaveBeenCalledTimes(1);
    expect(cleanup).not.toHaveBeenCalled();

    unmount();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('flusht ausstehende Commits, wenn sich der Scope ändert', async () => {
    const { rerender } = renderHook(
      ({ scope }: { scope: GraphScope }) => useKnowledgeGraph({ scope }),
      { initialProps: { scope: ALL } },
    );
    expect(persistence.flushAllPendingCommits).not.toHaveBeenCalled();

    rerender({ scope: COLLECTION_A });
    await waitFor(() => expect(persistence.flushAllPendingCommits).toHaveBeenCalledTimes(1));
  });
});
