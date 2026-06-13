
import React, { useState, useMemo, useCallback } from 'react';
import { ProcessedDocument, ActiveTab, Collection } from '../types';
import { getAllMeta, saveMeta, deleteMeta } from '../services/libraryService';
import type { SourceMeta } from '../services/libraryService';
import { SourceCard } from './SourceCard';
import { SourceDetailPage } from './SourceDetailPage';
import { UploadSourceModal } from './UploadSourceModal';
import { EmojiImage } from './EmojiImage';

interface LibrarySystemProps {
  documents: ProcessedDocument[];
  collections: Collection[];
  onUpload: (file: File, collectionId?: string) => Promise<string | null>;
  onDelete: (id: string) => void;
  onAction: (tab: ActiveTab, doc: ProcessedDocument) => void;
  onAddCollection: (collection: Collection) => void;
  onDeleteCollection: (id: string) => void;
  onMoveDocument: (docId: string, collectionId: string | undefined) => void;
  isLoading: boolean;
}

type SortKey   = 'recent' | 'name' | 'type';
type ViewMode  = 'grid' | 'list';
type FilterType = 'all' | 'pdf' | 'docx' | 'text';

const IconGrid = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
    <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
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
  documents, collections, onUpload, onDelete, onAction,
  onAddCollection, onDeleteCollection, onMoveDocument, isLoading,
}) => {
  const [allMeta, setAllMeta]           = useState<Record<string, SourceMeta>>(() => getAllMeta());
  const [viewDocId, setViewDocId]       = useState<string | null>(null);
  const [showUpload, setShowUpload]     = useState(false);
  const [search, setSearch]             = useState('');
  const [filterType, setFilterType]     = useState<FilterType>('all');
  const [filterModule, setFilterModule] = useState('');
  const [sortBy, setSortBy]             = useState<SortKey>('recent');
  const [viewMode, setViewMode]         = useState<ViewMode>('grid');
  const [activeColId, setActiveColId]   = useState<string | 'all' | 'uncategorized'>('all');
  const [isAddingCol, setIsAddingCol]   = useState(false);
  const [newColName, setNewColName]     = useState('');

  const refreshMeta = useCallback(() => setAllMeta(getAllMeta()), []);

  const modules = useMemo(() => {
    const set = new Set<string>();
    Object.values(allMeta).forEach(m => { if (m.module) set.add(m.module); });
    return Array.from(set).sort();
  }, [allMeta]);

  const filtered = useMemo(() => {
    let list = [...documents];
    if (activeColId === 'uncategorized') list = list.filter(d => !d.collectionId);
    else if (activeColId !== 'all') list = list.filter(d => d.collectionId === activeColId);
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
    if (filterType !== 'all') list = list.filter(d => d.type === filterType);
    if (filterModule) list = list.filter(d => allMeta[d.id]?.module === filterModule);
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
    if (docId) { saveMeta(docId, meta); refreshMeta(); }
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

  const viewDoc = viewDocId ? documents.find(d => d.id === viewDocId) : null;
  if (viewDoc) {
    return (
      <>
        {showUpload && <UploadSourceModal onClose={() => setShowUpload(false)} onUpload={handleUpload} />}
        <SourceDetailPage
          doc={viewDoc}
          meta={allMeta[viewDoc.id] ?? {}}
          onBack={() => setViewDocId(null)}
          onAction={onAction}
        />
      </>
    );
  }

  const colBtn = (id: string | 'all' | 'uncategorized', emoji: string, label: string, count: number) => {
    const isActive = activeColId === id;
    return (
      <button
        onClick={() => setActiveColId(id)}
        className={`w-full flex justify-between items-center px-3 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${
          isActive ? 'text-white' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
        }`}
        style={isActive ? { background: 'var(--accent)' } : {}}
      >
        <span className="flex items-center gap-2 truncate pr-2">
          <EmojiImage emoji={emoji} size={14} />{label}
        </span>
        <span className={isActive ? 'opacity-70' : 'opacity-40'}>{count}</span>
      </button>
    );
  };

  return (
    <>
      {showUpload && <UploadSourceModal onClose={() => setShowUpload(false)} onUpload={handleUpload} />}

      <div className="max-w-[900px] mx-auto space-y-6 animate-in fade-in duration-700 py-6">

        {/* Page header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-[22px] font-extrabold tracking-tight text-slate-900 dark:text-white">
              Bibliothek
            </h1>
            <p className="text-[13px] text-slate-400 mt-0.5">
              {documents.length} {documents.length === 1 ? 'Quelle' : 'Quellen'} · Dein persönliches Lernsystem
            </p>
          </div>
          <button
            onClick={() => !isLoading && setShowUpload(true)}
            disabled={isLoading}
            className="flex items-center gap-2 text-white text-[10px] font-black uppercase tracking-widest rounded-[14px] transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 disabled:scale-100 shrink-0"
            style={{ background: 'var(--accent)', padding: '11px 20px' }}
          >
            {isLoading
              ? <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Lädt…</>
              : <><IconUpload /> Quelle hinzufügen</>
            }
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Sidebar */}
          <div className="lg:col-span-3 space-y-4">

            {/* Sammlungen */}
            <div className="rounded-[18px] border p-4 space-y-3"
              style={{ background: 'var(--bg-sidebar)', borderColor: 'var(--border)' }}>
              <div className="flex justify-between items-center px-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Sammlungen
                </span>
                {!isAddingCol && (
                  <button
                    onClick={() => setIsAddingCol(true)}
                    className="w-6 h-6 rounded-lg flex items-center justify-center text-sm font-black transition-opacity hover:opacity-80"
                    style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
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
                    className="w-full rounded-xl text-xs font-bold outline-none"
                    style={{
                      padding: '10px 12px',
                      background: 'var(--bg-main)',
                      color: 'var(--text-main)',
                      border: '2px solid var(--accent)',
                    }}
                  />
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      className="flex-1 rounded-xl text-[9px] font-black uppercase tracking-widest text-white"
                      style={{ padding: '8px', background: 'var(--accent)' }}
                    >
                      Erstellen
                    </button>
                    <button
                      type="button"
                      onClick={() => { setIsAddingCol(false); setNewColName(''); }}
                      className="px-3 rounded-xl text-[9px] font-black uppercase text-slate-400"
                      style={{ padding: '8px 12px', background: 'var(--bg-main)' }}
                    >✕</button>
                  </div>
                </form>
              )}

              <nav className="space-y-0.5">
                {colBtn('all',           '🌐', 'Alle',       documents.length)}
                {colBtn('uncategorized', '📥', 'Unsortiert', documents.filter(d => !d.collectionId).length)}
                {collections.length > 0 && (
                  <div className="pt-2 space-y-0.5" style={{ borderTop: '1px solid var(--border)' }}>
                    {collections.map(col => (
                      <div key={col.id} className="group relative">
                        {colBtn(col.id, col.emoji, col.name, documents.filter(d => d.collectionId === col.id).length)}
                        <button
                          onClick={() => onDeleteCollection(col.id)}
                          className="absolute right-[-8px] top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 bg-rose-500 text-white p-1 rounded-full shadow transition-all hover:scale-125 z-10"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </nav>
            </div>

            {/* Module filter */}
            {modules.length > 0 && (
              <div className="rounded-[18px] border p-4 space-y-2"
                style={{ background: 'var(--bg-sidebar)', borderColor: 'var(--border)' }}>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1 block">
                  Module
                </span>
                <div className="space-y-0.5">
                  {[{ value: '', label: 'Alle Module' }, ...modules.map(m => ({ value: m, label: m }))].map(({ value, label }) => {
                    const isActive = filterModule === value;
                    return (
                      <button
                        key={value}
                        onClick={() => setFilterModule(isActive && value !== '' ? '' : value)}
                        className={`w-full text-left px-3 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all truncate ${
                          isActive ? 'text-white' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                        style={isActive ? { background: 'var(--accent)' } : {}}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Main area */}
          <div className="lg:col-span-9 space-y-4">
            {/* Toolbar */}
            <div className="space-y-2">
              {/* Search */}
              <div className="relative">
                <svg className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 dark:text-slate-600"
                  xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Quelle suchen…"
                  className="w-full pl-10 pr-4 py-3 rounded-[14px] text-sm font-medium outline-none"
                  style={{
                    background: 'var(--bg-sidebar)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-main)',
                  }}
                />
              </div>

              {/* Filters + View toggle */}
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={filterType}
                  onChange={e => setFilterType(e.target.value as FilterType)}
                  className="flex-1 min-w-[100px] px-3 py-2.5 rounded-[14px] text-[10px] font-black uppercase tracking-widest outline-none"
                  style={{
                    background: 'var(--bg-sidebar)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-main)',
                  }}
                >
                  <option value="all">Alle Typen</option>
                  <option value="pdf">PDF</option>
                  <option value="docx">DOCX</option>
                  <option value="text">Text</option>
                </select>

                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value as SortKey)}
                  className="flex-1 min-w-[100px] px-3 py-2.5 rounded-[14px] text-[10px] font-black uppercase tracking-widest outline-none"
                  style={{
                    background: 'var(--bg-sidebar)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-main)',
                  }}
                >
                  <option value="recent">Neueste</option>
                  <option value="name">Name</option>
                  <option value="type">Typ</option>
                </select>

                <div className="flex rounded-[14px] p-1 shrink-0"
                  style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border)' }}>
                  {([['grid', <IconGrid />], ['list', <IconList />]] as const).map(([mode, icon]) => (
                    <button
                      key={mode}
                      onClick={() => setViewMode(mode as ViewMode)}
                      className={`p-2 rounded-xl transition-all ${viewMode === mode ? 'text-white' : 'text-slate-400 hover:text-slate-600'}`}
                      style={viewMode === mode ? { background: 'var(--accent)' } : {}}
                    >{icon}</button>
                  ))}
                </div>
              </div>
            </div>

            {/* Results count + reset */}
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

            {/* Content */}
            {documents.length === 0 ? (
              <EmptyLibrary onUpload={() => setShowUpload(true)} />
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center space-y-4">
                <EmojiImage emoji="🔍" size={48} />
                <p className="text-sm font-black uppercase tracking-widest text-slate-400">Keine Treffer</p>
                <p className="text-xs text-slate-400">Versuche einen anderen Suchbegriff oder entferne Filter.</p>
              </div>
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filtered.map(doc => (
                  <SourceCard
                    key={doc.id} doc={doc} meta={allMeta[doc.id] ?? {}} view="grid"
                    onOpen={() => handleOpen(doc)} onDelete={() => handleDelete(doc)}
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map(doc => (
                  <SourceCard
                    key={doc.id} doc={doc} meta={allMeta[doc.id] ?? {}} view="list"
                    onOpen={() => handleOpen(doc)} onDelete={() => handleDelete(doc)}
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
  <div className="flex flex-col items-center justify-center py-24 text-center space-y-6 animate-in fade-in duration-500">
    <div
      className="w-[52px] h-[52px] rounded-[16px] flex items-center justify-center"
      style={{ background: 'var(--icon-box)' }}
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
        fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
      </svg>
    </div>
    <div className="space-y-2 max-w-sm">
      <p className="text-[17px] font-extrabold tracking-tight text-slate-900 dark:text-white">
        Noch keine Lernunterlagen
      </p>
      <p className="text-[13px] text-slate-400 leading-relaxed">
        Lade dein erstes Skript hoch. QuizWise erstellt daraus Quiz, Karteikarten und Klausuren — direkt aus deinen echten Unterlagen.
      </p>
    </div>
    <button
      onClick={onUpload}
      className="flex items-center gap-2 text-white text-[11px] font-black uppercase tracking-widest rounded-[14px] transition-transform hover:scale-[1.02] active:scale-[0.98]"
      style={{ background: 'var(--accent)', padding: '12px 28px' }}
    >
      <IconUpload /> Erste Quelle hochladen
    </button>
    <div className="flex gap-5 pt-2">
      {['PDF', 'DOCX', 'TXT', 'MD'].map(f => (
        <span key={f} className="text-[9px] font-black uppercase tracking-widest text-slate-300 dark:text-slate-600">{f}</span>
      ))}
    </div>
  </div>
);
