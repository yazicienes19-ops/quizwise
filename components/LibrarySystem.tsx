import React, { useState, useMemo, useCallback } from 'react';
import { ProcessedDocument, ActiveTab, Collection } from '../types';
import { getAllMeta, saveMeta, deleteMeta, documentDisplayName } from '../services/libraryService';
import type { SourceMeta } from '../services/libraryService';
import { SourceCard } from './SourceCard';
import { SourceDetailPage } from './SourceDetailPage';
import { UploadSourceModal } from './UploadSourceModal';
import { EditSourceModal } from './EditSourceModal';
import { DocumentViewerModal } from './DocumentViewerModal';
import { EmojiImage } from './EmojiImage';

interface LibrarySystemProps {
  documents: ProcessedDocument[];
  collections: Collection[];
  onUpload: (file: File, collectionId?: string) => Promise<string | null>;
  onDelete: (id: string) => void;
  onAction: (tab: ActiveTab, doc: ProcessedDocument) => void;
  onAddCollection: (collection: Collection) => void;
  onDeleteCollection: (id: string) => void;
  onUpdateCollection: (collection: Collection) => void;
  onMoveDocument: (docId: string, collectionId: string | undefined) => void;
  isLoading: boolean;
}

type SortKey  = 'recent' | 'name' | 'type';
type ViewMode = 'grid' | 'list';
type FilterType = 'all' | 'pdf' | 'docx' | 'text';

const IconGrid = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
  </svg>
);

const IconList = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
    <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
  </svg>
);

const IconUpload = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="17 8 12 3 7 8"/>
    <line x1="12" y1="3" x2="12" y2="15"/>
  </svg>
);

export const LibrarySystem: React.FC<LibrarySystemProps> = ({
  documents,
  collections,
  onUpload,
  onDelete,
  onAction,
  onAddCollection,
  onDeleteCollection,
  onUpdateCollection,
  onMoveDocument,
  isLoading,
}) => {
  const [allMeta, setAllMeta]           = useState<Record<string, SourceMeta>>(() => getAllMeta());
  const [viewDocId, setViewDocId]       = useState<string | null>(null);
  const [editDocId, setEditDocId]       = useState<string | null>(null);
  const [viewerDocId, setViewerDocId]   = useState<string | null>(null);
  const [showUpload, setShowUpload]     = useState(false);
  const [search, setSearch]             = useState('');
  const [filterType, setFilterType]     = useState<FilterType>('all');
  const [filterModule, setFilterModule] = useState('');
  const [sortBy, setSortBy]             = useState<SortKey>('recent');
  const [viewMode, setViewMode]         = useState<ViewMode>('grid');
  const [activeColId, setActiveColId]   = useState<string | 'all' | 'uncategorized'>('all');
  const [isAddingCol, setIsAddingCol]   = useState(false);
  const [newColName, setNewColName]     = useState('');
  const [showFolderView, setShowFolderView] = useState(true);
  const [editColId, setEditColId]           = useState<string | null>(null);
  const [editColName, setEditColName]       = useState('');
  const [editColEmoji, setEditColEmoji]     = useState('');

  const refreshMeta = useCallback(() => setAllMeta(getAllMeta()), []);

  const modules = useMemo(() => {
    const set = new Set<string>();
    Object.values(allMeta).forEach((m: SourceMeta) => { if (m.module) set.add(m.module); });
    return Array.from(set).sort();
  }, [allMeta]);

  const filtered = useMemo(() => {
    let list = [...documents];

    // Collection filter
    if (activeColId === 'uncategorized') list = list.filter(d => !d.collectionId);
    else if (activeColId !== 'all') list = list.filter(d => d.collectionId === activeColId);

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(d => {
        const meta = allMeta[d.id] ?? {};
        return (
          d.name.toLowerCase().includes(q) ||
          meta.displayTitle?.toLowerCase().includes(q) ||
          meta.module?.toLowerCase().includes(q) ||
          meta.tags?.some(t => t.toLowerCase().includes(q))
        );
      });
    }

    // Type filter
    if (filterType !== 'all') list = list.filter(d => d.type === filterType);

    // Module filter
    if (filterModule) list = list.filter(d => allMeta[d.id]?.module === filterModule);

    // Sort
    list.sort((a, b) => {
      if (sortBy === 'recent') return b.uploadDate - a.uploadDate;
      if (sortBy === 'type')   return a.type.localeCompare(b.type);
      const ta = (allMeta[a.id]?.displayTitle || a.name).toLowerCase();
      const tb = (allMeta[b.id]?.displayTitle || b.name).toLowerCase();
      return ta.localeCompare(tb);
    });

    return list;
  }, [documents, allMeta, search, filterType, filterModule, sortBy, activeColId]);

  const handleUpload = async (file: File, meta: Partial<SourceMeta>) => {
    const targetCol = activeColId !== 'all' && activeColId !== 'uncategorized' ? activeColId : undefined;
    const docId = await onUpload(file, targetCol);
    if (docId) {
      saveMeta(docId, meta);
      refreshMeta();
    }
  };

  const handleOpen = (doc: ProcessedDocument) => {
    saveMeta(doc.id, { lastOpenedAt: Date.now() });
    refreshMeta();
    setViewDocId(doc.id);
  };

  const handleDelete = (doc: ProcessedDocument) => {
    deleteMeta(doc.id);
    refreshMeta();
    onDelete(doc.id);
    if (viewDocId === doc.id) setViewDocId(null);
  };

  const handleCreateCol = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newColName.trim()) return;
    const colors = ['bg-blue-500', 'bg-emerald-500', 'bg-rose-500', 'bg-indigo-500', 'bg-amber-500'];
    const emojis = ['📁', '💡', '🧪', '📚', '🏛️', '🔬', '🎓', '📝'];
    const newId = Math.random().toString(36).substr(2, 9);
    onAddCollection({
      id: newId,
      name: newColName,
      emoji: emojis[Math.floor(Math.random() * emojis.length)],
      color: colors[Math.floor(Math.random() * colors.length)],
    });
    setNewColName('');
    setIsAddingCol(false);
    setActiveColId(newId);
  };

  const editDoc = editDocId ? documents.find(d => d.id === editDocId) : null;
  const viewerDoc = viewerDocId ? documents.find(d => d.id === viewerDocId) : null;

  // — Detail view —
  const viewDoc = viewDocId ? documents.find(d => d.id === viewDocId) : null;
  if (viewDoc) {
    return (
      <>
        {showUpload && <UploadSourceModal onClose={() => setShowUpload(false)} onUpload={handleUpload} />}
        {editDoc && (
          <EditSourceModal
            doc={editDoc}
            meta={allMeta[editDoc.id] ?? {}}
            onClose={() => setEditDocId(null)}
            onSaved={refreshMeta}
          />
        )}
        {viewerDoc && <DocumentViewerModal doc={viewerDoc} onClose={() => setViewerDocId(null)} />}
        <SourceDetailPage
          doc={viewDoc}
          meta={allMeta[viewDoc.id] ?? {}}
          onBack={() => setViewDocId(null)}
          onAction={onAction}
          onViewDocument={(d) => setViewerDocId(d.id)}
        />
      </>
    );
  }

  const openFolder = (id: string | 'all' | 'uncategorized') => {
    setActiveColId(id);
    setShowFolderView(false);
    setSearch('');
    setFilterType('all');
  };

  // — Folder view —
  const uncategorizedCount = documents.filter(d => !d.collectionId).length;
  if (collections.length > 0 && showFolderView && !viewDocId) {
    return (
      <>
        {showUpload && <UploadSourceModal onClose={() => setShowUpload(false)} onUpload={handleUpload} />}
        {editDoc && (
          <EditSourceModal
            doc={editDoc}
            meta={allMeta[editDoc.id] ?? {}}
            onClose={() => setEditDocId(null)}
            onSaved={refreshMeta}
          />
        )}
        <div className="space-y-8 py-6 lg:py-10 px-4 animate-in fade-in duration-500">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-3xl sm:text-4xl lg:text-6xl font-black tracking-tighter" style={{ color: 'var(--text-main)' }}>
                Bibliothek <EmojiImage emoji="📚" size={36} className="inline-block" />
              </h1>
              <p className="text-sm text-slate-400 font-medium mt-1">
                {collections.length} {collections.length === 1 ? 'Ordner' : 'Ordner'} · {documents.length} {documents.length === 1 ? 'Dokument' : 'Dokumente'}
              </p>
            </div>
            <button
              onClick={() => !isLoading && setShowUpload(true)}
              disabled={isLoading}
              className="flex items-center gap-2 px-6 py-3 bg-indigo-600 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:scale-105 active:scale-95 transition-all shrink-0 disabled:opacity-60 disabled:scale-100"
              style={{ color: 'var(--primary-text)' }}
            >
              {isLoading
                ? <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Lädt…</>
                : <><IconUpload /> Quelle hinzufügen</>
              }
            </button>
          </div>

          {/* Folder grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {collections.map(col => {
              const count = documents.filter(d => d.collectionId === col.id).length;
              const recentDoc = documents
                .filter(d => d.collectionId === col.id)
                .sort((a, b) => b.uploadDate - a.uploadDate)[0];
              const isEditing = editColId === col.id;
              return (
                <div
                  key={col.id}
                  className="group relative rounded-[28px] shadow-3d-raised hover:shadow-3d-deep transition-all flex flex-col"
                  style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}
                >
                  {/* Edit / Delete buttons — appear on hover */}
                  {!isEditing && (
                    <div className="absolute top-4 right-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                      <button
                        onClick={e => { e.stopPropagation(); setEditColId(col.id); setEditColName(col.name); setEditColEmoji(col.emoji); }}
                        className="w-8 h-8 rounded-xl flex items-center justify-center bg-white dark:bg-slate-800 shadow text-slate-400 hover:text-indigo-500 transition-colors"
                        title="Ordner bearbeiten"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </button>
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          if (window.confirm(`Ordner „${col.name}" löschen? Die Dokumente bleiben erhalten (werden unsortiert).`)) {
                            onDeleteCollection(col.id);
                          }
                        }}
                        className="w-8 h-8 rounded-xl flex items-center justify-center bg-white dark:bg-slate-800 shadow text-slate-400 hover:text-rose-500 transition-colors"
                        title="Ordner löschen"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                      </button>
                    </div>
                  )}

                  {isEditing ? (
                    /* Inline edit form */
                    <form
                      onSubmit={e => {
                        e.preventDefault();
                        if (editColName.trim()) {
                          onUpdateCollection({ ...col, name: editColName.trim(), emoji: editColEmoji || col.emoji });
                        }
                        setEditColId(null);
                      }}
                      className="p-6 flex flex-col gap-4"
                    >
                      <div className="flex gap-3">
                        <input
                          value={editColEmoji}
                          onChange={e => setEditColEmoji(e.target.value)}
                          placeholder="Emoji"
                          maxLength={4}
                          className="w-14 text-center px-2 py-2 rounded-xl text-xl border-2 border-indigo-500 outline-none"
                          style={{ background: 'var(--bg-main)' }}
                        />
                        <input
                          autoFocus
                          value={editColName}
                          onChange={e => setEditColName(e.target.value)}
                          placeholder="Ordner-Name"
                          className="flex-1 px-3 py-2 rounded-xl text-sm font-bold border-2 border-indigo-500 outline-none"
                          style={{ background: 'var(--bg-main)', color: 'var(--text-main)' }}
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          className="flex-1 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest"
                          style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
                        >Speichern</button>
                        <button
                          type="button"
                          onClick={() => setEditColId(null)}
                          className="px-4 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest text-slate-400 border border-slate-200 dark:border-slate-700"
                        >✕</button>
                      </div>
                    </form>
                  ) : (
                    /* Normal clickable content */
                    <button
                      onClick={() => openFolder(col.id)}
                      className="text-left p-6 flex flex-col gap-4 flex-1 hover:scale-[1.02] active:scale-[0.98] transition-transform rounded-[28px]"
                    >
                      <div className="flex justify-between items-start">
                        <div
                          className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shadow-md"
                          style={{ background: 'color-mix(in srgb, var(--primary) 12%, white)' }}
                        >
                          <EmojiImage emoji={col.emoji} size={28} />
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-full">
                          {count}
                        </span>
                      </div>
                      <div>
                        <h3 className="font-black text-base leading-snug" style={{ color: 'var(--text-main)' }}>{col.name}</h3>
                        {recentDoc && (
                          <p className="text-[10px] text-slate-400 mt-1 truncate">
                            Zuletzt: {documentDisplayName(recentDoc)}
                          </p>
                        )}
                        {count === 0 && (
                          <p className="text-[10px] text-slate-300 dark:text-slate-600 mt-1">Noch leer</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest mt-auto" style={{ color: 'var(--primary)' }}>
                        Öffnen
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                        </svg>
                      </div>
                    </button>
                  )}
                </div>
              );
            })}

            {/* Alle Dokumente card */}
            <button
              onClick={() => openFolder('all')}
              className="group text-left rounded-[28px] p-6 border-2 border-dashed hover:border-indigo-400 dark:hover:border-indigo-600 transition-all flex flex-col gap-4 hover:scale-[1.02] active:scale-[0.98]"
              style={{ borderColor: 'var(--border-color)' }}
            >
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl bg-slate-100 dark:bg-slate-800">
                <EmojiImage emoji="🌐" size={28} />
              </div>
              <div>
                <h3 className="font-black text-base" style={{ color: 'var(--text-main)' }}>Alle Dokumente</h3>
                <p className="text-[10px] text-slate-400 mt-1">{documents.length} gesamt</p>
              </div>
              <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest mt-auto text-slate-400">
                Alle anzeigen
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                </svg>
              </div>
            </button>
          </div>

          {/* Manage collections */}
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={() => setIsAddingCol(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-indigo-600 border border-slate-200 dark:border-slate-700 hover:border-indigo-400 transition-all"
            >
              + Neuer Ordner
            </button>
            {isAddingCol && (
              <form onSubmit={handleCreateCol} className="flex items-center gap-2">
                <input
                  autoFocus
                  value={newColName}
                  onChange={e => setNewColName(e.target.value)}
                  placeholder="Ordner-Name…"
                  className="px-4 py-2.5 rounded-2xl text-xs font-bold outline-none border-2 border-indigo-500"
                  style={{ background: 'var(--bg-main)', color: 'var(--text-main)' }}
                />
                <button type="submit" className="px-4 py-2.5 bg-indigo-600 rounded-2xl text-[9px] font-black uppercase tracking-widest" style={{ color: 'var(--primary-text)' }}>Erstellen</button>
                <button type="button" onClick={() => { setIsAddingCol(false); setNewColName(''); }} className="px-3 py-2.5 text-slate-400 text-[9px] font-black uppercase">✕</button>
              </form>
            )}
          </div>
        </div>
      </>
    );
  }

  const colBtn = (id: string | 'all' | 'uncategorized', emoji: string, label: string, count: number) => (
    <button
      onClick={() => setActiveColId(id)}
      className={`w-full flex justify-between items-center px-4 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all ${
        activeColId === id
          ? 'bg-indigo-600 shadow-lg'
          : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
      }`}
      style={activeColId === id ? { color: 'var(--primary-text)' } : {}}
    >
      <span className="flex items-center gap-2 truncate pr-2"><EmojiImage emoji={emoji} size={14} />{label}</span>
      <span className={activeColId === id ? 'opacity-70' : 'opacity-40'}>{count}</span>
    </button>
  );

  return (
    <>
      {showUpload && <UploadSourceModal onClose={() => setShowUpload(false)} onUpload={handleUpload} />}
      {viewerDoc && <DocumentViewerModal doc={viewerDoc} onClose={() => setViewerDocId(null)} />}
      {editDoc && (
        <EditSourceModal
          doc={editDoc}
          meta={allMeta[editDoc.id] ?? {}}
          onClose={() => setEditDocId(null)}
          onSaved={refreshMeta}
        />
      )}

      <div className="space-y-8 lg:space-y-12 animate-in fade-in duration-700 py-6 lg:py-10">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 px-4">
          <div>
            {collections.length > 0 && (
              <button
                onClick={() => setShowFolderView(true)}
                className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-indigo-500 transition-colors mb-3"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
                </svg>
                Ordner
                {activeColId !== 'all' && activeColId !== 'uncategorized' && (() => {
                  const col = collections.find(c => c.id === activeColId);
                  return col ? <><span className="text-slate-300 dark:text-slate-600 mx-0.5">/</span><span style={{ color: 'var(--primary)' }}>{col.name}</span></> : null;
                })()}
              </button>
            )}
            <h1 className="text-3xl sm:text-4xl lg:text-6xl font-black tracking-tighter" style={{ color: 'var(--text-main)' }}>
              {activeColId !== 'all' && activeColId !== 'uncategorized'
                ? (collections.find(c => c.id === activeColId)?.name ?? 'Bibliothek')
                : 'Bibliothek'
              } <EmojiImage emoji={activeColId !== 'all' && activeColId !== 'uncategorized' ? (collections.find(c => c.id === activeColId)?.emoji ?? '📚') : '📚'} size={36} className="inline-block" />
            </h1>
            <p className="text-sm text-slate-400 font-medium mt-1">
              {filtered.length} {filtered.length === 1 ? 'Dokument' : 'Dokumente'}
              {activeColId === 'all' ? ' · Dein persönliches Lernsystem' : ''}
            </p>
          </div>
          <button
            onClick={() => !isLoading && setShowUpload(true)}
            disabled={isLoading}
            className="flex items-center gap-2 px-6 py-3 bg-indigo-600 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:scale-105 active:scale-95 transition-all shrink-0 disabled:opacity-60 disabled:scale-100"
            style={{ color: 'var(--primary-text)' }}
          >
            {isLoading
              ? <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Lädt…</>
              : <><IconUpload /> Quelle hinzufügen</>
            }
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 px-4">
          {/* Sidebar */}
          <div className="lg:col-span-3 space-y-6">
            <div className="rounded-[28px] shadow-3d-raised p-5 space-y-4" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}>
              <div className="flex justify-between items-center px-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Sammlungen</span>
                {!isAddingCol && (
                  <button
                    onClick={() => setIsAddingCol(true)}
                    className="w-7 h-7 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 flex items-center justify-center hover:scale-110 transition-transform text-sm font-black"
                  >+</button>
                )}
              </div>

              {isAddingCol && (
                <form onSubmit={handleCreateCol} className="animate-in zoom-in-95 space-y-2 px-1">
                  <input
                    autoFocus
                    value={newColName}
                    onChange={e => setNewColName(e.target.value)}
                    placeholder="z.B. Semester 1"
                    className="w-full p-3 rounded-xl text-xs font-bold outline-none border-2 border-indigo-500"
                    style={{ background: 'var(--bg-main)', color: 'var(--text-main)' }}
                  />
                  <div className="flex gap-2">
                    <button type="submit" className="flex-1 bg-indigo-600 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest" style={{ color: 'var(--primary-text)' }}>Erstellen</button>
                    <button type="button" onClick={() => { setIsAddingCol(false); setNewColName(''); }} className="px-3 text-slate-400 py-2 rounded-xl text-[9px] font-black uppercase" style={{ background: 'var(--bg-main)' }}>✕</button>
                  </div>
                </form>
              )}

              <nav className="space-y-1">
                {colBtn('all',           '🌐', 'Alle',       documents.length)}
                {colBtn('uncategorized', '📥', 'Unsortiert', documents.filter(d => !d.collectionId).length)}
                {collections.length > 0 && <div className="pt-2 space-y-1" style={{ borderTop: '1px solid var(--border-color)' }}>
                  {collections.map(col => (
                    <div key={col.id} className="group relative">
                      {colBtn(col.id, col.emoji, col.name, documents.filter(d => d.collectionId === col.id).length)}
                      <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                        <button
                          onClick={() => { setShowFolderView(true); setEditColId(col.id); setEditColName(col.name); setEditColEmoji(col.emoji); }}
                          className="w-6 h-6 rounded-lg flex items-center justify-center bg-white dark:bg-slate-700 shadow text-slate-400 hover:text-indigo-500 transition-colors"
                          title="Bearbeiten"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm(`Ordner „${col.name}" löschen? Dokumente bleiben erhalten.`)) {
                              onDeleteCollection(col.id);
                            }
                          }}
                          className="w-6 h-6 rounded-lg flex items-center justify-center bg-rose-500 text-white shadow transition-all hover:scale-110"
                          title="Löschen"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>}
              </nav>
            </div>

            {/* Module filter */}
            {modules.length > 0 && (
              <div className="rounded-[28px] shadow-3d-raised p-5 space-y-3" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1 block">Module</span>
                <div className="space-y-1">
                  <button
                    onClick={() => setFilterModule('')}
                    className={`w-full text-left px-4 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${!filterModule ? 'bg-indigo-600' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                    style={!filterModule ? { color: 'var(--primary-text)' } : {}}
                  >
                    Alle Module
                  </button>
                  {modules.map(m => (
                    <button
                      key={m}
                      onClick={() => setFilterModule(filterModule === m ? '' : m)}
                      className={`w-full text-left px-4 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all truncate ${filterModule === m ? 'bg-indigo-600' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                      style={filterModule === m ? { color: 'var(--primary-text)' } : {}}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Main area */}
          <div className="lg:col-span-9 space-y-5">
            {/* Toolbar */}
            <div className="space-y-2">
              {/* Search */}
              <div className="relative">
                <svg className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 dark:text-slate-600" xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Quelle suchen…"
                  className="w-full pl-10 pr-4 py-3 rounded-2xl text-sm font-medium outline-none focus:border-indigo-500 shadow-3d-raised"
                  style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)', color: 'var(--text-main)' }}
                />
              </div>

              {/* Filters + View toggle */}
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={filterType}
                  onChange={e => setFilterType(e.target.value as FilterType)}
                  className="flex-1 min-w-[100px] px-3 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest outline-none focus:border-indigo-500 shadow-3d-raised"
                  style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)', color: 'var(--text-main)' }}
                >
                  <option value="all">Alle Typen</option>
                  <option value="pdf">PDF</option>
                  <option value="docx">DOCX</option>
                  <option value="text">Text</option>
                </select>

                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value as SortKey)}
                  className="flex-1 min-w-[100px] px-3 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest outline-none focus:border-indigo-500 shadow-3d-raised"
                  style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)', color: 'var(--text-main)' }}
                >
                  <option value="recent">Neueste</option>
                  <option value="name">Name</option>
                  <option value="type">Typ</option>
                </select>

                <div className="flex rounded-2xl p-1 shadow-3d-raised shrink-0" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}>
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`p-2 rounded-xl transition-all ${viewMode === 'grid' ? 'bg-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                    style={viewMode === 'grid' ? { color: 'var(--primary-text)' } : {}}
                  ><IconGrid /></button>
                  <button
                    onClick={() => setViewMode('list')}
                    className={`p-2 rounded-xl transition-all ${viewMode === 'list' ? 'bg-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                    style={viewMode === 'list' ? { color: 'var(--primary-text)' } : {}}
                  ><IconList /></button>
                </div>
              </div>
            </div>

            {/* Results info */}
            {(search || filterType !== 'all' || filterModule) && (
              <div className="flex items-center justify-between px-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  {filtered.length} {filtered.length === 1 ? 'Ergebnis' : 'Ergebnisse'}
                </p>
                <button
                  onClick={() => { setSearch(''); setFilterType('all'); setFilterModule(''); }}
                  className="text-[10px] font-black uppercase tracking-widest text-rose-500 hover:text-rose-600"
                >
                  Filter zurücksetzen
                </button>
              </div>
            )}

            {/* Empty states */}
            {documents.length === 0 ? (
              <EmptyLibrary onUpload={() => setShowUpload(true)} />
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center space-y-4">
                <EmojiImage emoji="🔍" size={48} />
                <p className="text-sm font-black uppercase tracking-widest text-slate-400">Keine Treffer</p>
                <p className="text-xs text-slate-400">Versuche einen anderen Suchbegriff oder entferne Filter.</p>
              </div>
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {filtered.map(doc => (
                  <SourceCard
                    key={doc.id}
                    doc={doc}
                    meta={allMeta[doc.id] ?? {}}
                    view="grid"
                    onOpen={() => handleOpen(doc)}
                    onView={() => setViewerDocId(doc.id)}
                    onDelete={() => handleDelete(doc)}
                    onEdit={() => setEditDocId(doc.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map(doc => (
                  <SourceCard
                    key={doc.id}
                    doc={doc}
                    meta={allMeta[doc.id] ?? {}}
                    view="list"
                    onOpen={() => handleOpen(doc)}
                    onView={() => setViewerDocId(doc.id)}
                    onDelete={() => handleDelete(doc)}
                    onEdit={() => setEditDocId(doc.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

const EmptyLibrary: React.FC<{ onUpload: () => void }> = ({ onUpload }) => (
  <div className="flex flex-col items-center justify-center py-32 text-center space-y-6 animate-in fade-in duration-500">
    <div className="w-24 h-24 bg-indigo-50 dark:bg-indigo-950/30 rounded-full flex items-center justify-center">
      <EmojiImage emoji="📭" size={48} />
    </div>
    <div className="space-y-3 max-w-sm">
      <p className="text-lg font-black uppercase tracking-widest text-slate-700 dark:text-slate-200">
        Noch keine Lernunterlagen
      </p>
      <p className="text-sm text-slate-400 leading-relaxed">
        Lade dein erstes Skript hoch. QuizWise erstellt daraus Quiz, Karteikarten, Erklärungen und Lernpläne — direkt aus deinen echten Unterlagen.
      </p>
    </div>
    <button
      onClick={onUpload}
      className="flex items-center gap-2 px-8 py-4 bg-indigo-600 rounded-2xl font-black uppercase text-[11px] tracking-widest shadow-lg hover:scale-105 active:scale-95 transition-all"
      style={{ color: 'var(--primary-text)' }}
    >
      <IconUpload /> Erste Quelle hochladen
    </button>
    <div className="flex gap-6 pt-4">
      {['PDF', 'DOCX', 'TXT', 'MD'].map(f => (
        <span key={f} className="text-[9px] font-black uppercase tracking-widest text-slate-300 dark:text-slate-600">{f}</span>
      ))}
    </div>
  </div>
);

