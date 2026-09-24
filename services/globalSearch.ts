import type { Collection, FlashcardDeck, ProcessedDocument, ActiveTab } from '../types';

/**
 * Globale Suche (Audit 23.09.2026: Suche gab es nur je Bereich, z. B. in der
 * Bibliothek oder im Stapel). Reine Funktion, durchsucht lokal vorhandene
 * Daten; kein Server, keine KI.
 */
export type SearchResult =
  | { kind: 'page'; id: string; tab: ActiveTab; title: string; score: number }
  | { kind: 'collection'; id: string; title: string; subtitle: string; score: number }
  | { kind: 'document'; id: string; title: string; subtitle: string; snippet?: string; score: number }
  | { kind: 'deck'; id: string; title: string; subtitle: string; score: number }
  | { kind: 'card'; id: string; deckId: string; title: string; subtitle: string; score: number };

export interface SearchInput {
  documents: ProcessedDocument[];
  decks: FlashcardDeck[];
  collections: Collection[];
  pages: { tab: ActiveTab; title: string }[];
  /** Beschriftungen, damit die Funktion sprachneutral bleibt. */
  labels: { cardsN: (n: number) => string; docsN: (n: number) => string; noSubject: string };
}

export const MIN_QUERY = 2;
const LIMIT = { page: 4, collection: 4, document: 8, deck: 6, card: 8 } as const;
const SNIPPET_RADIUS = 60;

/** Kleinschreibung, Akzente weg (ä bleibt ä erkennbar über NFD → a). */
export const normalize = (s: string): string =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();

/**
 * Trefferwert für einen Titel: exakter Treffer > Wortanfang > irgendwo.
 * Alle Suchwörter müssen vorkommen, sonst 0.
 */
export const titleScore = (title: string, terms: string[]): number => {
  const t = normalize(title);
  if (!terms.every(term => t.includes(term))) return 0;
  const q = terms.join(' ');
  if (t === q) return 100;
  if (t.startsWith(q)) return 80;
  const wordStart = terms.every(term => t.startsWith(term) || t.includes(` ${term}`));
  return wordStart ? 60 : 40;
};

/** Ausschnitt um den ersten Treffer im Text (für Dokument-Inhalte). */
export const snippetAround = (text: string, terms: string[]): string | undefined => {
  const norm = normalize(text);
  // normalize() fasst Leerraum zusammen; Positionen daher auf dem ebenso
  // zusammengefassten Original suchen, damit der Ausschnitt passt.
  const flat = text.replace(/\s+/g, ' ').trim();
  const idx = Math.min(...terms.map(term => { const i = norm.indexOf(term); return i < 0 ? Infinity : i; }));
  if (!Number.isFinite(idx)) return undefined;
  const start = Math.max(0, idx - SNIPPET_RADIUS);
  const end = Math.min(flat.length, idx + SNIPPET_RADIUS * 2);
  const cleaned = flat.slice(start, end).replace(/[#*_`>]/g, '').trim();
  return `${start > 0 ? '… ' : ''}${cleaned}${end < flat.length ? ' …' : ''}`;
};

/** Normalisierter Dokumenttext, je Dokument-Objekt nur einmal berechnet (Tippen bleibt flüssig). */
const BODY_LIMIT = 200_000;
const bodyCache = new WeakMap<ProcessedDocument, { raw: string; norm: string }>();
const docBody = (d: ProcessedDocument) => {
  let hit = bodyCache.get(d);
  if (!hit) {
    const raw = (d.digestText || d.content || '').slice(0, BODY_LIMIT);
    hit = { raw, norm: normalize(raw) };
    bodyCache.set(d, hit);
  }
  return hit;
};

/** Gruppen-Bonus nur für echte Treffer. */
const boost = (score: number, bonus: number): number => (score > 0 ? score + bonus : 0);

const top = <T extends { score: number }>(list: T[], n: number): T[] =>
  list.filter(r => r.score > 0).sort((a, b) => b.score - a.score).slice(0, n);

export const searchAll = (query: string, input: SearchInput): SearchResult[] => {
  const terms = normalize(query).split(' ').filter(Boolean);
  if (terms.join(' ').length < MIN_QUERY) return [];
  const colName = new Map(input.collections.map(c => [c.id, c.name]));

  const pages = top(input.pages.map(p => ({
    kind: 'page' as const, id: `page-${p.tab}`, tab: p.tab, title: p.title, score: boost(titleScore(p.title, terms), 5),
  })), LIMIT.page);

  const collections = top(input.collections.map(c => ({
    kind: 'collection' as const, id: c.id, title: c.name,
    subtitle: input.labels.docsN(input.documents.filter(d => d.collectionId === c.id).length),
    score: boost(titleScore(c.name, terms), 3),
  })), LIMIT.collection);

  const documents = top(input.documents.map(d => {
    const subtitle = colName.get(d.collectionId ?? '') ?? input.labels.noSubject;
    const byTitle = titleScore(d.name, terms);
    if (byTitle) return { kind: 'document' as const, id: d.id, title: d.name, subtitle, score: byTitle + 2 };
    const body = docBody(d);
    if (!body.raw || !terms.every(term => body.norm.includes(term))) {
      return { kind: 'document' as const, id: d.id, title: d.name, subtitle, score: 0 };
    }
    return { kind: 'document' as const, id: d.id, title: d.name, subtitle, snippet: snippetAround(body.raw, terms), score: 20 };
  }), LIMIT.document);

  const decks = top(input.decks.map(d => ({
    kind: 'deck' as const, id: d.id, title: d.title, subtitle: input.labels.cardsN(d.cards.length),
    score: boost(titleScore(d.title, terms), 1),
  })), LIMIT.deck);

  const cards = top(input.decks.flatMap(d => d.cards.map(c => {
    const front = titleScore(c.front, terms);
    const back = front ? 0 : titleScore(c.back, terms);
    const tags = front || back ? 0 : titleScore((c.tags ?? []).join(' '), terms);
    return {
      kind: 'card' as const, id: `${d.id}:${c.id}`, deckId: d.id,
      title: c.front, subtitle: c.tags?.length ? `${d.title} · #${c.tags.join(' #')}` : d.title,
      score: front ? front - 10 : back ? back - 25 : tags ? tags - 20 : 0,
    };
  })), LIMIT.card);

  // Reihenfolge der Gruppen bleibt fest, damit die Liste beim Tippen nicht springt.
  return [...pages, ...collections, ...documents, ...decks, ...cards];
};
