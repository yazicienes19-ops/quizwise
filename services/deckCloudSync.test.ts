import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { FlashcardDeck } from '../types';

const loadDecksFromSupabase = vi.fn();
const uploadAllDecksToSupabase = vi.fn();
vi.mock('./flashcardService', () => ({
  loadDecksFromSupabase: (...a: unknown[]) => loadDecksFromSupabase(...a),
  uploadAllDecksToSupabase: (...a: unknown[]) => uploadAllDecksToSupabase(...a),
}));

import { syncDecksWithCloud } from './deckCloudSync';
import { readLocalDecks, writeLocalDecks, DECKS_CHANGED_EVENT } from './deckStore';

const deck = (id: string, cards = 1): FlashcardDeck => ({
  id,
  title: `Deck ${id}`,
  cards: Array.from({ length: cards }, (_, i) => ({ id: `${id}-${i}`, front: 'F', back: 'B', level: 0, nextReview: 0 })),
});

describe('syncDecksWithCloud', () => {
  beforeEach(() => {
    localStorage.clear();
    loadDecksFromSupabase.mockReset();
    uploadAllDecksToSupabase.mockReset().mockResolvedValue(undefined);
  });

  it('übernimmt Cloud-Stapel auf einem leeren Gerät und meldet die Änderung', async () => {
    // Szenario des Audit-Befunds: neues Gerät, lokal nichts, Cloud hat Stapel.
    loadDecksFromSupabase.mockResolvedValue([deck('a', 3), deck('b')]);
    const changed = vi.fn();
    window.addEventListener(DECKS_CHANGED_EVENT, changed);
    await syncDecksWithCloud('u1');
    window.removeEventListener(DECKS_CHANGED_EVENT, changed);
    expect(readLocalDecks().map(d => d.id).sort()).toEqual(['a', 'b']);
    expect(changed).toHaveBeenCalled();
  });

  it('lädt rein lokale Stapel hoch, wenn die Cloud leer ist', async () => {
    writeLocalDecks([deck('lokal')]);
    loadDecksFromSupabase.mockResolvedValue([]);
    await syncDecksWithCloud('u1');
    expect(uploadAllDecksToSupabase).toHaveBeenCalledWith([expect.objectContaining({ id: 'lokal' })], 'u1');
  });

  it('teilt sich bei gleichzeitigem Aufruf (App + Karteikarten) einen Abgleich', async () => {
    let resolve!: (d: FlashcardDeck[]) => void;
    loadDecksFromSupabase.mockReturnValue(new Promise<FlashcardDeck[]>(r => { resolve = r; }));
    const first = syncDecksWithCloud('u1');
    const second = syncDecksWithCloud('u1');
    resolve([deck('a')]);
    await Promise.all([first, second]);
    expect(loadDecksFromSupabase).toHaveBeenCalledTimes(1);
  });

  it('startet nach Abschluss wieder einen neuen Abgleich', async () => {
    loadDecksFromSupabase.mockResolvedValue([]);
    await syncDecksWithCloud('u1');
    await syncDecksWithCloud('u1');
    expect(loadDecksFromSupabase).toHaveBeenCalledTimes(2);
  });
});
