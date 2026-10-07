import type { Collection, ModuleFolder, ProcessedDocument } from '../types';

/**
 * moduleFolders — Ordner innerhalb eines Fachs (eine Ebene), z.B. wenn ein
 * Modul von zwei Dozenten gelesen wird.
 *
 * Grundsatz: Quelle ist immer das GANZE Fach. Ordner trennen nur die Ablage.
 * Ein Ordner fällt aus der Wissensbasis heraus, wenn er
 *   1. dauerhaft abgewählt ist (ModuleFolder.excluded, synchronisiert), oder
 *   2. nur für den laufenden Durchgang abgehakt wurde (Laufzeit-Auswahl unten,
 *      gesetzt von FolderScopeBar, verschwindet beim Verlassen der Funktion).
 *
 * Alle Funktionen, die ein Fach als Quelle nutzen, gehen über
 * collectionDocs()/buildCollectionSource() (services/collectionSource.ts) und
 * damit über activeFolderFilter() hier.
 */

export const folderList = (collection: Collection | null | undefined): ModuleFolder[] =>
  collection?.folders ?? [];

/** Ordner-ID, die im Fach wirklich existiert; verwaiste IDs zählen als "kein Ordner". */
export const effectiveFolderId = (collection: Collection, doc: ProcessedDocument): string | undefined =>
  doc.folderId && folderList(collection).some(f => f.id === doc.folderId) ? doc.folderId : undefined;

// ── Auswahl für den laufenden Durchgang ──────────────────────────────────────

const runScopes = new Map<string, ReadonlySet<string>>();

/** Abgewählte Ordner nur für diesen Durchgang setzen (null = wieder dauerhafte Einstellung). */
export const setRunFolderScope = (collectionId: string, excludedIds: ReadonlySet<string> | null): void => {
  if (excludedIds) runScopes.set(collectionId, new Set(excludedIds));
  else runScopes.delete(collectionId);
};

export const getRunFolderScope = (collectionId: string): ReadonlySet<string> | null =>
  runScopes.get(collectionId) ?? null;

/** Dauerhaft abgewählte Ordner. */
export const persistentExcludedIds = (collection: Collection): Set<string> =>
  new Set(folderList(collection).filter(f => f.excluded).map(f => f.id));

/** Gerade wirksame Abwahl: Laufzeit-Auswahl vor dauerhafter Einstellung. */
export const excludedFolderIds = (collection: Collection): ReadonlySet<string> =>
  getRunFolderScope(collection.id) ?? persistentExcludedIds(collection);

/** Gehört das Dokument zur aktuellen Wissensbasis des Fachs? */
export const isDocInScope = (
  collection: Collection,
  doc: ProcessedDocument,
  excluded: ReadonlySet<string> = excludedFolderIds(collection),
): boolean => {
  const folderId = effectiveFolderId(collection, doc);
  return !folderId || !excluded.has(folderId);
};

/** Namen der gerade abgewählten Ordner, für Hinweise in der Oberfläche. */
export const excludedFolderNames = (collection: Collection): string[] => {
  const excluded = excludedFolderIds(collection);
  return folderList(collection).filter(f => excluded.has(f.id)).map(f => f.name);
};

// ── Bearbeiten (reine Funktionen, Persistenz in hooks/useDocuments.ts) ───────

export const newFolderId = (): string => `f_${Math.random().toString(36).slice(2, 10)}`;

export const withFolderAdded = (collection: Collection, name: string, id = newFolderId()): Collection => ({
  ...collection,
  folders: [...folderList(collection), { id, name: name.trim() }],
});

export const withFolderRenamed = (collection: Collection, folderId: string, name: string): Collection => ({
  ...collection,
  folders: folderList(collection).map(f => f.id === folderId ? { ...f, name: name.trim() } : f),
});

export const withFolderExcluded = (collection: Collection, folderId: string, excluded: boolean): Collection => ({
  ...collection,
  folders: folderList(collection).map(f => {
    if (f.id !== folderId) return f;
    const { excluded: _drop, ...rest } = f;
    return excluded ? { ...rest, excluded: true } : rest;
  }),
});

export const withFolderRemoved = (collection: Collection, folderId: string): Collection => ({
  ...collection,
  folders: folderList(collection).filter(f => f.id !== folderId),
});

/** Dokumente eines Fachs nach Ordnern gruppiert; Dokumente ohne (gültigen) Ordner unter null, zuerst. */
export const groupDocsByFolder = (
  collection: Collection,
  docs: ProcessedDocument[],
): { folder: ModuleFolder | null; docs: ProcessedDocument[] }[] => {
  const loose = docs.filter(d => !effectiveFolderId(collection, d));
  const groups: { folder: ModuleFolder | null; docs: ProcessedDocument[] }[] = [];
  if (loose.length) groups.push({ folder: null, docs: loose });
  for (const f of folderList(collection)) {
    groups.push({ folder: f, docs: docs.filter(d => effectiveFolderId(collection, d) === f.id) });
  }
  return groups;
};

/** Ordner-Aktionen aus hooks/useDocuments.ts, durchgereicht bis in die Bibliothek. */
export interface FolderActions {
  addFolder: (collectionId: string, name: string) => void;
  renameFolder: (collectionId: string, folderId: string, name: string) => void;
  setFolderExcluded: (collectionId: string, folderId: string, excluded: boolean) => void;
  removeFolder: (collectionId: string, folderId: string) => void;
  moveDocToFolder: (docId: string, folderId: string | undefined) => void;
}
