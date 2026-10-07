import { describe, it, expect, afterEach } from 'vitest';
import { buildCollectionSource, collectionDocs, allCollectionDocs } from './collectionSource';
import {
  setRunFolderScope, isDocInScope, groupDocsByFolder, excludedFolderNames,
  withFolderAdded, withFolderExcluded, withFolderRemoved, withFolderRenamed,
} from './moduleFolders';
import type { Collection, ProcessedDocument } from '../types';

const base: Collection = {
  id: 'c1', name: 'Statistik', emoji: '📊', color: 'bg-blue-500',
  folders: [{ id: 'fA', name: 'Prof. A' }, { id: 'fB', name: 'Prof. B' }],
};

const mkDoc = (name: string, over: Partial<ProcessedDocument> = {}): ProcessedDocument => ({
  id: name, name: `${name}.txt`, content: `Inhalt ${name}`, type: 'text',
  uploadDate: 0, collectionId: 'c1', ...over,
});

const docs = [
  mkDoc('lose'),
  mkDoc('a1', { folderId: 'fA' }),
  mkDoc('b1', { folderId: 'fB' }),
  mkDoc('fremd', { collectionId: 'c2' }),
];

afterEach(() => setRunFolderScope('c1', null));

describe('Wissensbasis eines Fachs mit Unterordnern', () => {
  it('nimmt ohne Abwahl das ganze Fach', () => {
    expect(collectionDocs(base, docs).map(d => d.id)).toEqual(['lose', 'a1', 'b1']);
    expect(buildCollectionSource(base, docs)!.includedCount).toBe(3);
  });

  it('lässt dauerhaft abgewählte Unterordner weg, die Bibliothek sieht weiter alles', () => {
    const col = withFolderExcluded(base, 'fA', true);
    expect(collectionDocs(col, docs).map(d => d.id)).toEqual(['lose', 'b1']);
    expect(allCollectionDocs(col, docs)).toHaveLength(3);
    const text = buildCollectionSource(col, docs)!.source.text!;
    expect(text).not.toContain('Inhalt a1');
    expect(text).toContain('Inhalt b1');
    expect(excludedFolderNames(col)).toEqual(['Prof. A']);
  });

  it('Auswahl für den Durchgang schlägt die dauerhafte Einstellung und lässt sich zurücksetzen', () => {
    const col = withFolderExcluded(base, 'fA', true);
    setRunFolderScope('c1', new Set(['fB']));
    expect(collectionDocs(col, docs).map(d => d.id)).toEqual(['lose', 'a1']);
    setRunFolderScope('c1', null);
    expect(collectionDocs(col, docs).map(d => d.id)).toEqual(['lose', 'b1']);
  });

  it('behandelt Dokumente mit gelöschtem Unterordner als lose', () => {
    const col = withFolderExcluded(withFolderRemoved(base, 'fA'), 'fB', true);
    expect(isDocInScope(col, docs[1])).toBe(true);
    expect(groupDocsByFolder(col, docs.slice(0, 3)).map(g => [g.folder?.id ?? null, g.docs.map(d => d.id)]))
      .toEqual([[null, ['lose', 'a1']], ['fB', ['b1']]]);
  });

  it('Quellenname bleibt "Ordner: <Fach>" (Lernverläufe hängen daran)', () => {
    const col = withFolderExcluded(base, 'fA', true);
    expect(buildCollectionSource(col, docs)!.name).toBe('Ordner: Statistik');
  });
});

describe('Unterordner bearbeiten', () => {
  it('anlegen, umbenennen, wieder einschalten', () => {
    let col = withFolderAdded({ ...base, folders: undefined }, '  Prof. C ', 'fC');
    expect(col.folders).toEqual([{ id: 'fC', name: 'Prof. C' }]);
    col = withFolderRenamed(col, 'fC', 'Prof. D');
    col = withFolderExcluded(col, 'fC', true);
    expect(col.folders).toEqual([{ id: 'fC', name: 'Prof. D', excluded: true }]);
    col = withFolderExcluded(col, 'fC', false);
    expect(col.folders).toEqual([{ id: 'fC', name: 'Prof. D' }]);
  });
});
