import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readLocalDecks, writeLocalDecks, upsertLocalDeck, subscribeLocalDecks, claimLocalDecks, DECKS_KEY, DECKS_OWNER_KEY } from './deckStore';
import type { FlashcardDeck } from '../types';

const deck = (id: string, cards = 1): FlashcardDeck => ({
  id,
  title: `Deck ${id}`,
  cards: Array.from({ length: cards }, (_, i) => ({ id: `${id}-${i}`, front: 'F', back: 'B', level: 0, nextReview: 0 })),
});

describe('deckStore', () => {
  beforeEach(() => localStorage.clear());

  it('liest kaputte oder fremde Einträge robust als leere/bereinigte Liste', () => {
    localStorage.setItem(DECKS_KEY, '{kaputt');
    expect(readLocalDecks()).toEqual([]);
    localStorage.setItem(DECKS_KEY, JSON.stringify([deck('a'), { title: 'ohne id' }, null]));
    expect(readLocalDecks().map(d => d.id)).toEqual(['a']);
  });

  it('upsert baut auf dem AKTUELLEN Speicherstand auf, nicht auf einer alten Kopie', () => {
    // Szenario des Bugs: App hielt beim Start nur Deck a. Danach legt die
    // Karteikarten-Ansicht Deck b an. Ein Tutor-Deck c darf b nicht löschen.
    const staleAppCopy = [deck('a')];
    writeLocalDecks([...staleAppCopy, deck('b')]);
    upsertLocalDeck(deck('c'));
    expect(readLocalDecks().map(d => d.id)).toEqual(['a', 'b', 'c']);
  });

  it('upsert ersetzt ein vorhandenes Deck statt es doppelt anzulegen', () => {
    writeLocalDecks([deck('a', 1), deck('b', 1)]);
    upsertLocalDeck(deck('a', 3));
    const decks = readLocalDecks();
    expect(decks.map(d => d.id)).toEqual(['a', 'b']);
    expect(decks[0].cards).toHaveLength(3);
  });

  it('claimLocalDecks verwirft Decks eines anderen Kontos, übernimmt aber besitzerlosen Altbestand', () => {
    writeLocalDecks([deck('a')]);
    claimLocalDecks('user-1');                 // Altbestand ohne Besitzer: bleibt
    expect(readLocalDecks().map(d => d.id)).toEqual(['a']);
    claimLocalDecks('user-1');                 // gleiches Konto: bleibt
    expect(readLocalDecks()).toHaveLength(1);
    claimLocalDecks('user-2');                 // anderes Konto: weg
    expect(readLocalDecks()).toEqual([]);
    expect(localStorage.getItem(DECKS_OWNER_KEY)).toBe('user-2');
  });

  it('benachrichtigt Abonnenten bei jeder Änderung und lässt sich abmelden', () => {
    const spy = vi.fn();
    const off = subscribeLocalDecks(spy);
    writeLocalDecks([deck('a')]);
    upsertLocalDeck(deck('b'));
    expect(spy).toHaveBeenCalledTimes(2);
    off();
    writeLocalDecks([]);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
