import { describe, it, expect } from 'vitest';
import { findDuplicateCollectionGroups, pickCollectionToKeep, moveDocumentsToCollection } from './duplicateCollections';
import type { Collection, ProcessedDocument } from '../types';

const col = (id: string, name: string): Collection => ({ id, name, emoji: '📘' } as Collection);
const doc = (id: string, collectionId?: string): ProcessedDocument => ({ id, name: id, collectionId } as ProcessedDocument);

describe('findDuplicateCollectionGroups', () => {
  it('findet gleich benannte Ordner unabhängig von Groß-/Kleinschreibung und Leerzeichen', () => {
    const groups = findDuplicateCollectionGroups([col('a', 'Psychologie SoSe26'), col('b', 'Statistik'), col('c', ' psychologie  sose26 ')]);
    expect(groups).toHaveLength(1);
    expect(groups[0].map(c => c.id)).toEqual(['a', 'c']);
  });

  it('liefert nichts ohne Doppelte', () => {
    expect(findDuplicateCollectionGroups([col('a', 'A'), col('b', 'B')])).toEqual([]);
  });
});

describe('pickCollectionToKeep', () => {
  it('behält den Ordner mit den meisten Dokumenten, bei Gleichstand den ersten', () => {
    const group = [col('a', 'X'), col('b', 'X')];
    expect(pickCollectionToKeep(group, [doc('1', 'b'), doc('2', 'b'), doc('3', 'a')]).id).toBe('b');
    expect(pickCollectionToKeep(group, [doc('1', 'a'), doc('2', 'b')]).id).toBe('a');
  });
});

describe('moveDocumentsToCollection', () => {
  it('verschiebt nur Dokumente aus den aufgelösten Ordnern', () => {
    const moved = moveDocumentsToCollection([doc('1', 'a'), doc('2', 'b'), doc('3'), doc('4', 'z')], 'a', new Set(['b']));
    expect(moved.map(d => d.collectionId)).toEqual(['a', 'a', undefined, 'z']);
  });
});
