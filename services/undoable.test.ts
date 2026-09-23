import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { toast, type ToastAction } from './toast';
import { runUndoable } from './undoable';

describe('runUndoable', () => {
  let shownAction: ToastAction | undefined;
  beforeEach(() => {
    vi.useFakeTimers();
    shownAction = undefined;
    toast._register((_msg, _type, opts) => { shownAction = opts?.action; });
  });
  afterEach(() => vi.useRealTimers());

  it('löscht endgültig erst nach Ablauf der Frist', () => {
    const commit = vi.fn(); const undo = vi.fn();
    runUndoable({ message: 'x', commit, undo, ms: 8000 });
    vi.advanceTimersByTime(7999);
    expect(commit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(undo).not.toHaveBeenCalled();
  });

  it('"Rückgängig" verhindert die Löschung, auch nach Ablauf der Frist', () => {
    const commit = vi.fn(); const undo = vi.fn();
    runUndoable({ message: 'x', commit, undo, ms: 8000 });
    shownAction!.onClick();
    vi.advanceTimersByTime(20000);
    expect(undo).toHaveBeenCalledTimes(1);
    expect(commit).not.toHaveBeenCalled();
  });

  it('löscht sofort, wenn der Tab geschlossen wird, und nur einmal', () => {
    const commit = vi.fn();
    runUndoable({ message: 'x', commit, undo: vi.fn(), ms: 8000 });
    window.dispatchEvent(new Event('pagehide'));
    vi.advanceTimersByTime(10000);
    shownAction!.onClick();
    expect(commit).toHaveBeenCalledTimes(1);
  });
});
