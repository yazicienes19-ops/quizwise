import type { Flashcard } from '../types';

/**
 * Schlagwörter für Karteikarten (Audit 23.09.2026): Karten eines Stapels
 * ließen sich nicht nach Thema ordnen oder gezielt lernen.
 */
export const MAX_TAGS = 10;
const MAX_TAG_LENGTH = 30;

/** "Halo, #Wahrnehmung,  halo" → ["Halo", "Wahrnehmung"] (Groß/Klein nur einmal). */
export const parseTags = (input: string): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input.split(/[,;\n]/)) {
    const tag = raw.trim().replace(/^#+/, '').replace(/\s+/g, ' ').trim().slice(0, MAX_TAG_LENGTH);
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
};

export const formatTags = (tags: string[] | undefined): string => (tags ?? []).join(', ');

/** Alle Schlagwörter eines Stapels mit Anzahl, häufigste zuerst, dann alphabetisch. */
export const collectTags = (cards: Pick<Flashcard, 'tags'>[]): { tag: string; count: number }[] => {
  const counts = new Map<string, { tag: string; count: number }>();
  for (const c of cards) {
    for (const tag of c.tags ?? []) {
      const key = tag.toLowerCase();
      const hit = counts.get(key);
      if (hit) hit.count += 1; else counts.set(key, { tag, count: 1 });
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'de'));
};

export const hasTag = (card: Pick<Flashcard, 'tags'>, tag: string): boolean =>
  (card.tags ?? []).some(t => t.toLowerCase() === tag.toLowerCase());
