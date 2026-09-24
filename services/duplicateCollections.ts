import type { Collection, ProcessedDocument } from '../types';

/**
 * Doppelte Ordner (Fächer) erkennen und zusammenführen (Audit 24.09.2026:
 * zwei Ordner "Psychologie SoSe26" nebeneinander, die Startseite schlug
 * "Aufräumen" vor, die Bibliothek bot aber nichts dafür an).
 * Gegenstück zu duplicateDecks.ts für Stapel.
 */

const norm = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** Gruppen gleich benannter Ordner (mind. 2), Reihenfolge wie in der Liste. */
export const findDuplicateCollectionGroups = (collections: Collection[]): Collection[][] => {
  const byName = new Map<string, Collection[]>();
  for (const c of collections) {
    const key = norm(c.name);
    if (!key) continue;
    byName.set(key, [...(byName.get(key) ?? []), c]);
  }
  return [...byName.values()].filter(g => g.length > 1);
};

/**
 * Welcher Ordner bleibt: der mit den meisten Dokumenten, bei Gleichstand der
 * zuerst angelegte (erste in der Liste). Seine ID, sein Name und sein Symbol
 * bleiben, die Dokumente der anderen ziehen um.
 */
export const pickCollectionToKeep = (group: Collection[], documents: ProcessedDocument[]): Collection => {
  const count = (c: Collection) => documents.filter(d => d.collectionId === c.id).length;
  return group.reduce((best, c) => (count(c) > count(best) ? c : best), group[0]);
};

/** Dokumente der aufgelösten Ordner in den behaltenen Ordner verschieben (rein, ohne Seiteneffekte). */
export const moveDocumentsToCollection = (
  documents: ProcessedDocument[],
  keepId: string,
  dropIds: Set<string>,
): ProcessedDocument[] =>
  documents.map(d => (d.collectionId && dropIds.has(d.collectionId) ? { ...d, collectionId: keepId } : d));
