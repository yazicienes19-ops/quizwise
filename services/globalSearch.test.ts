import { describe, it, expect } from 'vitest';
import { searchAll, titleScore, snippetAround, normalize } from './globalSearch';
import { ActiveTab, type FlashcardDeck, type ProcessedDocument } from '../types';

const labels = { cardsN: (n: number) => `${n} Karten`, docsN: (n: number) => `${n} Dok`, noSubject: 'Ohne Fach' };
const doc = (p: Partial<ProcessedDocument>): ProcessedDocument => ({ id: 'd', name: 'Dok', content: '', type: 'pdf', uploadDate: 0, ...p });
const deck: FlashcardDeck = {
  id: 'k1', title: 'Halo Effekt',
  cards: [
    { id: 'c1', front: 'Was ist der Halo-Effekt?', back: 'Ein Urteilsfehler', level: 0, nextReview: 0 },
    { id: 'c2', front: 'Definition Konformität', back: 'Anpassung an die Gruppe (Asch)', level: 0, nextReview: 0 },
  ],
};
const input = {
  documents: [
    doc({ id: 'a', name: 'Sozialpsychologie Folien.pdf', collectionId: 'col1' }),
    doc({ id: 'b', name: 'Skript.pdf', digestStatus: 'ready', digestText: '## Kapitel 3\nDas Experiment von Asch zeigte **Konformität** in Gruppen.' }),
  ],
  decks: [deck],
  collections: [{ id: 'col1', name: 'Sozialpsychologie', emoji: '🧠', color: '' } as any],
  pages: [{ tab: ActiveTab.CARDS, title: 'Karteikarten' }, { tab: ActiveTab.EXAM, title: 'Klausur-Simulator' }],
  labels,
};

describe('globalSearch', () => {
  it('normalisiert Groß/Klein, Akzente und Leerraum', () => {
    expect(normalize('  Konformität  IM   Test ')).toBe('konformitat im test');
  });

  it('bewertet exakt > Anfang > Wortanfang > irgendwo, alle Wörter nötig', () => {
    expect(titleScore('Halo Effekt', ['halo', 'effekt'])).toBe(100);
    expect(titleScore('Halo Effekt Übung', ['halo'])).toBe(80);
    expect(titleScore('Der Halo Effekt', ['halo'])).toBe(60);
    expect(titleScore('Rehalo', ['halo'])).toBe(40);
    expect(titleScore('Halo', ['halo', 'asch'])).toBe(0);
  });

  it('findet Fächer, Dokumente, Stapel und Karten', () => {
    const r = searchAll('sozial', input);
    expect(r.map(x => x.kind)).toEqual(['collection', 'document']);
    expect(r[1]).toMatchObject({ subtitle: 'Sozialpsychologie' });
    const k = searchAll('halo', input);
    expect(k.map(x => x.kind)).toEqual(['deck', 'card']);
  });

  it('durchsucht Zusammenfassungen und liefert einen Ausschnitt ohne Markdown', () => {
    const r = searchAll('asch', input);
    const d = r.find(x => x.kind === 'document');
    expect(d).toBeTruthy();
    expect(d && 'snippet' in d ? d.snippet : '').toContain('Experiment von Asch');
    expect(d && 'snippet' in d ? d.snippet : '').not.toContain('**');
    // Rückseite einer Karte zählt auch
    expect(r.some(x => x.kind === 'card' && x.id === 'k1:c2')).toBe(true);
  });

  it('findet Bereiche über ihren Namen', () => {
    expect(searchAll('klausur', input)[0]).toMatchObject({ kind: 'page', tab: ActiveTab.EXAM });
  });

  it('ignoriert zu kurze Anfragen', () => {
    expect(searchAll('h', input)).toEqual([]);
  });

  it('Ausschnitt setzt Auslassungszeichen nur wenn gekürzt', () => {
    expect(snippetAround('kurz asch text', ['asch'])).toBe('kurz asch text');
    expect(snippetAround('x'.repeat(200) + ' asch ' + 'y'.repeat(300), ['asch'])).toMatch(/^… .* …$/);
  });
});

describe('globalSearch Schlagwörter', () => {
  it('findet Karten über ihre Schlagwörter', () => {
    const tagged = { ...deck, cards: [{ ...deck.cards[0], tags: ['Wahrnehmung'] }] };
    const r = searchAll('wahrnehmung', { ...input, decks: [tagged] });
    expect(r[0]).toMatchObject({ kind: 'card', subtitle: 'Halo Effekt · #Wahrnehmung' });
  });
});
