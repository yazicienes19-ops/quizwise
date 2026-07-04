import { describe, it, expect } from 'vitest';
import { mergeCard, mergeDeck, mergeDecks } from './deckMerge';
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
