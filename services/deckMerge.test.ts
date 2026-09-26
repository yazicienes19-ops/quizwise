import { describe, it, expect } from 'vitest';
import { mergeCard, mergeDeck, mergeDecks, mergeTombstones } from './deckMerge';
import type { Flashcard, FlashcardDeck } from '../types';

const mkCard = (id: string, lastReview: number | null, front = 'F'): Flashcard => ({
  id, front, back: 'B', level: 1, nextReview: 0,
  srs: { ease: 2.5, interval: 3, repetitions: 1, nextReview: 0, lastReview },
});

const mkDeck = (id: string, cards: Flashcard[]): FlashcardDeck => ({ id, title: `Deck ${id}`, cards });

describe('mergeCard', () => {
  it('Karte mit neuerem Review gewinnt', () => {
    const local = mkCard('c1', 100, 'lokal');
    const cloud = mkCard('c1', 200, 'cloud');
    expect(mergeCard(local, cloud).front).toBe('cloud');
    expect(mergeCard(cloud, local).front).toBe('cloud');
  });

  it('bei Gleichstand gewinnt lokal', () => {
    const local = mkCard('c1', 100, 'lokal');
    const cloud = mkCard('c1', 100, 'cloud');
    expect(mergeCard(local, cloud).front).toBe('lokal');
  });

  it('Karte mit srs schlägt Karte ohne srs', () => {
    const noSrs: Flashcard = { id: 'c1', front: 'alt', back: 'B', level: 0, nextReview: 0 };
    const withSrs = mkCard('c1', 50, 'gelernt');
    expect(mergeCard(noSrs, withSrs).front).toBe('gelernt');
  });
});

describe('mergeDeck', () => {
  it('Union der Karten, pro Karte neuerer Lernstand', () => {
    const local = mkDeck('d1', [mkCard('a', 200, 'a-lokal'), mkCard('b', 100)]);
    const cloud = mkDeck('d1', [mkCard('a', 100, 'a-cloud'), mkCard('c', 300)]);
    const merged = mergeDeck(local, cloud);
    expect(merged.cards.map(c => c.id).sort()).toEqual(['a', 'b', 'c']);
    expect(merged.cards.find(c => c.id === 'a')?.front).toBe('a-lokal');
  });

  it('Deck-Metadaten (Titel) kommen von lokal', () => {
    const local = { ...mkDeck('d1', []), title: 'Lokal umbenannt' };
    const cloud = mkDeck('d1', []);
    expect(mergeDeck(local, cloud).title).toBe('Lokal umbenannt');
  });
});

describe('mergeDecks', () => {
  it('vereint Decks beider Seiten ohne Duplikate', () => {
    const local = [mkDeck('d1', [mkCard('a', 100)]), mkDeck('d2', [])];
    const cloud = [mkDeck('d1', [mkCard('a', 200)]), mkDeck('d3', [])];
    const merged = mergeDecks(local, cloud);
    expect(merged.map(d => d.id).sort()).toEqual(['d1', 'd2', 'd3']);
  });

  it('SRS-Fortschritt beider Geräte bleibt erhalten (Kernszenario)', () => {
    // Gerät A lernte Karte a (neuer), Cloud hat Karte b von Gerät B gelernt
    const local = [mkDeck('d1', [mkCard('a', 500), mkCard('b', 100)])];
    const cloud = [mkDeck('d1', [mkCard('a', 100), mkCard('b', 500)])];
    const merged = mergeDecks(local, cloud);
    const cards = merged[0].cards;
    expect(cards.find(c => c.id === 'a')?.srs?.lastReview).toBe(500);
    expect(cards.find(c => c.id === 'b')?.srs?.lastReview).toBe(500);
  });
});

describe('Löschvermerke', () => {
  const now = Date.now();

  it('eine lokal gelöschte Karte kommt aus der Cloud nicht zurück', () => {
    const local = { ...mkDeck('d', [mkCard('a', 1)]), deletedCardIds: { b: now } };
    const cloud = mkDeck('d', [mkCard('a', 1), mkCard('b', 5)]);
    const merged = mergeDeck(local, cloud);
    expect(merged.cards.map(c => c.id)).toEqual(['a']);
    expect(merged.deletedCardIds).toEqual({ b: now });
  });

  it('ein Löschvermerk aus der Cloud entfernt die Karte auch lokal (anderes Gerät)', () => {
    const local = mkDeck('d', [mkCard('a', 1), mkCard('b', 9)]);
    const cloud = { ...mkDeck('d', [mkCard('a', 1)]), deletedCardIds: { b: now } };
    expect(mergeDeck(local, cloud).cards.map(c => c.id)).toEqual(['a']);
  });

  it('ohne Vermerke bleibt der Stapel ohne deletedCardIds', () => {
    expect(mergeDeck(mkDeck('d', [mkCard('a', 1)]), mkDeck('d', [])).deletedCardIds).toBeUndefined();
  });

  it('vereint Vermerke, nimmt den jüngsten Zeitpunkt und verwirft abgelaufene', () => {
    const old = now - 200 * 24 * 60 * 60 * 1000;
    expect(mergeTombstones({ a: now - 3000, x: old }, { a: now - 2000, b: now - 1000 }, now))
      .toEqual({ a: now - 2000, b: now - 1000 });
  });

  it('ein in der Cloud gelöschter Stapel verschwindet auch lokal', () => {
    const local = [mkDeck('a', [mkCard('1', 1)]), mkDeck('b', [])];
    const cloud = [{ ...mkDeck('a', []), deletedAt: now }];
    expect(mergeDecks(local, cloud).map(d => d.id)).toEqual(['b']);
  });

  it('ein lokal gelöschter Stapel kommt aus der Cloud nicht zurück', () => {
    const cloud = [mkDeck('a', [mkCard('1', 1)]), mkDeck('b', [])];
    expect(mergeDecks([], cloud, ['a']).map(d => d.id)).toEqual(['b']);
  });
});
