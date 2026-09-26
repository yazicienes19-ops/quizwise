import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { FlashcardDeck } from '../types';

const loadDecksFromSupabase = vi.fn();
const uploadAllDecksToSupabase = vi.fn();
const deleteDeckFromSupabase = vi.fn();
vi.mock('./flashcardService', () => ({
  loadDecksFromSupabase: (...a: unknown[]) => loadDecksFromSupabase(...a),
  uploadAllDecksToSupabase: (...a: unknown[]) => uploadAllDecksToSupabase(...a),
  deleteDeckFromSupabase: (...a: unknown[]) => deleteDeckFromSupabase(...a),
}));

import { syncDecksWithCloud } from './deckCloudSync';
import { readLocalDecks, writeLocalDecks, DECKS_CHANGED_EVENT, markDecksDeleted, DECKS_OWNER_KEY } from './deckStore';

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
    deleteDeckFromSupabase.mockReset().mockResolvedValue(undefined);
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

  it('trägt eine lokale Stapel-Löschung nach und holt den Stapel nicht zurück (Tab vor Ablauf geschlossen)', async () => {
    localStorage.setItem(DECKS_OWNER_KEY, 'u1');
    writeLocalDecks([deck('b')]);
    markDecksDeleted(['a']);
    loadDecksFromSupabase.mockResolvedValue([deck('a', 2), deck('b')]);
    await syncDecksWithCloud('u1');
    expect(readLocalDecks().map(d => d.id)).toEqual(['b']);
    expect(deleteDeckFromSupabase).toHaveBeenCalledWith('a', 'u1');
  });

  it('eine hier gelöschte Karte kommt nicht zurück und der Vermerk wird hochgeladen', async () => {
    localStorage.setItem(DECKS_OWNER_KEY, 'u1');
    const local = { ...deck('a', 1), deletedCardIds: { 'a-1': Date.now() } };
    writeLocalDecks([local]);
    loadDecksFromSupabase.mockResolvedValue([deck('a', 2)]);
    await syncDecksWithCloud('u1');
    expect(readLocalDecks()[0].cards.map(c => c.id)).toEqual(['a-0']);
    expect(uploadAllDecksToSupabase).toHaveBeenCalled();
    const uploaded = uploadAllDecksToSupabase.mock.calls[0][0][0];
    expect(Object.keys(uploaded.deletedCardIds)).toEqual(['a-1']);
  });
});
