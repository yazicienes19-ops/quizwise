import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createEmptyGraphState, type GraphNode } from './types';
import * as sync from './graphSyncService';
import {
  commitNode, commitPurgeNode, commitDeleteRelationType, flushPendingCommit, flushAllPendingCommits, hasPendingCommit,
  initAutoFlush,
} from './graphPersistenceService';

const makeNode = (id: string, overrides: Partial<GraphNode> = {}): GraphNode => ({
  id, type: 'begriff', title: id, description: '', notes: '', tags: [],
  position: { x: 0, y: 0 }, pinned: false, version: 1, createdAt: 0, updatedAt: 0,
  ...overrides,
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(sync, 'saveCachedState').mockImplementation(() => {});
  vi.spyOn(sync, 'pushNode').mockResolvedValue(makeNode('irrelevant'));
  vi.spyOn(sync, 'pushDeleteNode').mockResolvedValue(undefined);
  vi.spyOn(sync, 'pushDeleteRelationType').mockResolvedValue(undefined);
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('commitNode (Debounce pro Entität)', () => {
  it('schreibt NICHT synchron — vor Ablauf der Debounce-Zeit passiert nichts', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    commitNode(makeNode('n1'), state, { userId: 'user-1' });

    expect(sync.saveCachedState).not.toHaveBeenCalled();
    expect(sync.pushNode).not.toHaveBeenCalled();
    expect(hasPendingCommit('node:n1')).toBe(true);
  });

  it('committet lokal und pusht nach Ablauf der Debounce-Zeit (Default 400ms)', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    const node = makeNode('n1');
    commitNode(node, state, { userId: 'user-1' });

    vi.advanceTimersByTime(400);

    expect(sync.saveCachedState).toHaveBeenCalledWith(state);
    expect(sync.pushNode).toHaveBeenCalledWith(node, 'user-1');
  });

  it('fasst mehrere schnelle Änderungen an DERSELBEN Entität zu genau einem Commit zusammen', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    commitNode(makeNode('n1', { title: 'v1' }), state, { userId: 'user-1' });
    vi.advanceTimersByTime(200);
    commitNode(makeNode('n1', { title: 'v2' }), state, { userId: 'user-1' });
    vi.advanceTimersByTime(200);
    commitNode(makeNode('n1', { title: 'v3 (final)' }), state, { userId: 'user-1' });
    vi.advanceTimersByTime(400);

    expect(sync.pushNode).toHaveBeenCalledTimes(1);
    expect(sync.pushNode).toHaveBeenCalledWith(expect.objectContaining({ title: 'v3 (final)' }), 'user-1');
  });

  it('blockiert Commits an unterschiedlichen Entitäten nicht gegenseitig', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    commitNode(makeNode('n1'), state, { userId: 'user-1' });
    commitNode(makeNode('n2'), state, { userId: 'user-1' });
    vi.advanceTimersByTime(400);

    expect(sync.pushNode).toHaveBeenCalledTimes(2);
  });

  it('debounceMs: 0 committet sofort, synchron', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    commitNode(makeNode('n1'), state, { userId: 'user-1', debounceMs: 0 });
    expect(sync.saveCachedState).toHaveBeenCalledTimes(1);
    expect(sync.pushNode).toHaveBeenCalledTimes(1);
  });

  it('pusht NICHT ohne userId, cached aber weiterhin lokal (Offline-/Nicht-eingeloggt-Fall)', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    commitNode(makeNode('n1'), state, {});
    vi.advanceTimersByTime(400);

    expect(sync.saveCachedState).toHaveBeenCalled();
    expect(sync.pushNode).not.toHaveBeenCalled();
  });
});

describe('flushPendingCommit / flushAllPendingCommits', () => {
  it('führt einen ausstehenden Commit sofort aus, ohne auf die Debounce-Zeit zu warten', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    commitNode(makeNode('n1'), state, { userId: 'user-1' });
    expect(sync.pushNode).not.toHaveBeenCalled();

    flushPendingCommit('node:n1');
    expect(sync.pushNode).toHaveBeenCalledTimes(1);
    expect(hasPendingCommit('node:n1')).toBe(false);
  });

  it('ist ein No-Op für einen Key ohne ausstehenden Commit', () => {
    expect(() => flushPendingCommit('node:ghost')).not.toThrow();
  });

  it('flushAllPendingCommits leert alle offenen Commits über mehrere Entitäten hinweg', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    commitNode(makeNode('n1'), state, { userId: 'user-1' });
    commitNode(makeNode('n2'), state, { userId: 'user-1' });

    flushAllPendingCommits();
    expect(sync.pushNode).toHaveBeenCalledTimes(2);
  });
});

describe('commitDeleteRelationType', () => {
  it('committet standardmäßig sofort (debounceMs default 0 bei Löschaktionen)', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    commitDeleteRelationType('rel-1', state, { userId: 'user-1' });
    expect(sync.pushDeleteRelationType).toHaveBeenCalledWith('rel-1', 'user-1');
  });
});

describe('commitPurgeNode', () => {
  it('committet standardmäßig sofort und ruft den echten Hard-Delete-Push auf (Fix des purgeNode-Bugs)', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    commitPurgeNode('n1', state, { userId: 'user-1' });

    expect(sync.saveCachedState).toHaveBeenCalledWith(state);
    expect(sync.pushDeleteNode).toHaveBeenCalledWith('n1', 'user-1');
  });

  it('pusht nicht ohne userId, cached aber weiterhin lokal', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    commitPurgeNode('n1', state, {});

    expect(sync.saveCachedState).toHaveBeenCalled();
    expect(sync.pushDeleteNode).not.toHaveBeenCalled();
  });
});

describe('initAutoFlush', () => {
  const setVisibilityState = (value: DocumentVisibilityState) => {
    Object.defineProperty(document, 'visibilityState', { value, configurable: true });
  };

  it('flusht einen ausstehenden Commit, wenn der Tab in den Hintergrund wechselt (visibilitychange)', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    const cleanup = initAutoFlush();
    commitNode(makeNode('n1'), state, { userId: 'user-1' });
    expect(sync.pushNode).not.toHaveBeenCalled();

    setVisibilityState('hidden');
    document.dispatchEvent(new Event('visibilitychange'));

    expect(sync.pushNode).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it('flusht NICHT, wenn der Tab wieder sichtbar wird (nur "hidden" ist relevant)', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    const cleanup = initAutoFlush();
    commitNode(makeNode('n1'), state, { userId: 'user-1' });

    setVisibilityState('visible');
    document.dispatchEvent(new Event('visibilitychange'));

    expect(sync.pushNode).not.toHaveBeenCalled();
    cleanup();
  });

  it('flusht bei pagehide', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    const cleanup = initAutoFlush();
    commitNode(makeNode('n1'), state, { userId: 'user-1' });

    window.dispatchEvent(new Event('pagehide'));

    expect(sync.pushNode).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it('flusht bei beforeunload', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    const cleanup = initAutoFlush();
    commitNode(makeNode('n1'), state, { userId: 'user-1' });

    window.dispatchEvent(new Event('beforeunload'));

    expect(sync.pushNode).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it('cleanup entfernt die Listener — danach löst kein Event mehr einen Flush aus', () => {
    const state = createEmptyGraphState({ kind: 'all' });
    const cleanup = initAutoFlush();
    cleanup();

    commitNode(makeNode('n1'), state, { userId: 'user-1' });
    window.dispatchEvent(new Event('pagehide'));

    expect(sync.pushNode).not.toHaveBeenCalled();
  });
});
