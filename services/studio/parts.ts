import type { SourcePart } from './types';

/**
 * Vorlesungen einer zusammengefügten PDF: zu welcher eine Seite gehört und
 * welche Folie sie dort ist (für Fußnoten wie "Aufmerksamkeit_1, Folie 12
 * (gesamt S. 94)", damit man die Stelle auch im einzelnen PDF findet).
 */
export const partOf = (parts: SourcePart[] | undefined, page: number): SourcePart | undefined =>
  parts?.find(p => page >= p.from && page <= p.to);

export const slideIn = (part: SourcePart, page: number): number => page - part.from + 1;

/** Seiten einer Fußnote je Vorlesung gruppiert (Reihenfolge der Seiten bleibt). */
export const groupByPart = (parts: SourcePart[], pages: number[]): { part?: SourcePart; pages: number[] }[] => {
  const groups: { part?: SourcePart; pages: number[] }[] = [];
  for (const p of pages) {
    const part = partOf(parts, p);
    const g = groups.find(x => x.part === part);
    if (g) g.pages.push(p); else groups.push({ part, pages: [p] });
  }
  return groups;
};
