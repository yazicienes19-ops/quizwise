
import React, { useRef, useState, useMemo } from 'react';
import { ProcessedDocument, ActiveTab, Collection } from '../types';
import { EmojiImage } from './EmojiImage';

interface LibrarySystemProps {
  documents: ProcessedDocument[];
  collections: Collection[];
  onUpload: (file: File, collectionId?: string) => void;
  onDelete: (id: string) => void;
  onAction: (tab: ActiveTab, doc: ProcessedDocument) => void;
  onAddCollection: (collection: Collection) => void;
  onDeleteCollection: (id: string) => void;
  onMoveDocument: (docId: string, collectionId: string | undefined) => void;
  isLoading: boolean;
}

export const LibrarySystem: React.FC<LibrarySystemProps> = ({ 
  documents, 
  collections,
  onUpload, 
  onDelete, 
  onAction,
  onAddCollection,
  onDeleteCollection,
  onMoveDocument,
  isLoading 
}) => {
  const [activeCollectionId, setActiveCollectionId] = useState<string | 'all' | 'uncategorized'>('all');
  const [isAddingCollection, setIsAddingCollection] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [movingDocId, setMovingDocId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredDocs = useMemo(() => {
    if (activeCollectionId === 'all') return documents;
    if (activeCollectionId === 'uncategorized') return documents.filter(d => !d.collectionId);
    return documents.filter(d => d.collectionId === activeCollectionId);
  }, [documents, activeCollectionId]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const targetCol = activeCollectionId !== 'all' && activeCollectionId !== 'uncategorized' 
        ? activeCollectionId 
        : undefined;
      onUpload(e.target.files[0], targetCol);
    }
  };

  const handleCreateCollection = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newColName.trim()) return;
    
    const colors = ['bg-blue-500', 'bg-emerald-500', 'bg-rose-500', 'bg-indigo-500', 'bg-amber-500'];
    const emojis = ['📁', '💡', '🧪', '📚', '🏛️', '🔬', '🎓', '📝'];
    const newId = Math.random().toString(36).substr(2, 9);
    
    onAddCollection({
      id: newId,
      name: newColName,
      emoji: emojis[Math.floor(Math.random() * emojis.length)],
      color: colors[Math.floor(Math.random() * colors.length)]
    });
    
    setNewColName('');
    setIsAddingCollection(false);
    setActiveCollectionId(newId); // Automatisch in die neue Sammlung wechseln
  };

  const getFileIcon = (type: string) => {
    switch(type) {
      case 'pdf': return <EmojiImage emoji="📕" size={32} />;
      case 'docx': return <EmojiImage emoji="📘" size={32} />;
      default: return <EmojiImage emoji="📄" size={32} />;
    }
  };

  return (
    <div className="space-y-10 lg:space-y-16 animate-in fade-in duration-700 py-6 lg:py-10">
      <div className="text-center space-y-4 px-4">
        <h1 className="text-5xl lg:text-7xl font-black text-slate-900 dark:text-white tracking-tighter">
          Deine <span className="text-indigo-600">Bibliothek</span> <EmojiImage emoji="📚" size={48} />
        </h1>
        <p className="text-lg lg:text-xl text-slate-500 dark:text-slate-400 font-medium opacity-80">
          Strukturiere deine Lerninhalte so, wie du arbeitest.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 px-4">
        {/* Left Sidebar: Collections */}
        <div className="lg:col-span-3 space-y-8">
          <div className="bg-white dark:bg-slate-900 rounded-[32px] border border-slate-200 dark:border-slate-800 shadow-3d-raised p-6 space-y-6">
            <div className="flex justify-between items-center px-2">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Sammlungen</h3>
              {!isAddingCollection && (
                <button 
                  onClick={() => setIsAddingCollection(true)}
                  className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 flex items-center justify-center hover:scale-110 transition-transform"
                  title="Neue Sammlung erstellen"
                >
                  +
                </button>
              )}
            </div>

            {isAddingCollection && (
              <form onSubmit={handleCreateCollection} className="animate-in zoom-in-95 px-2 space-y-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-indigo-600 tracking-widest ml-1">Name der Sammlung</label>
                  <input 
                    autoFocus
                    value={newColName}
                    onChange={e => setNewColName(e.target.value)}
                    placeholder="z.B. Semester 1"
                    className="w-full p-3 bg-slate-50 dark:bg-slate-800 rounded-xl text-xs font-bold outline-none border-2 border-indigo-500 dark:text-white"
                  />
                </div>
                <div className="flex gap-2">
                  <button 
                    type="submit"
                    className="flex-1 bg-indigo-600 text-white py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:brightness-110 transition-all"
                  >
                    Speichern
                  </button>
                  <button 
                    type="button"
                    onClick={() => { setIsAddingCollection(false); setNewColName(''); }}
                    className="px-3 bg-slate-100 dark:bg-slate-800 text-slate-500 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest"
                  >
                    X
                  </button>
                </div>
              </form>
            )}

            <nav className="space-y-1">
              <button 
                onClick={() => setActiveCollectionId('all')}
                className={`w-full flex justify-between items-center px-4 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all ${activeCollectionId === 'all' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
              >
                <EmojiImage emoji="🌐" size={16} /> Alle Dokumente
                <span className="opacity-60">{documents.length}</span>
              </button>
              
              <button 
                onClick={() => setActiveCollectionId('uncategorized')}
                className={`w-full flex justify-between items-center px-4 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all ${activeCollectionId === 'uncategorized' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
              >
                <EmojiImage emoji="📥" size={16} /> Unsortiert
                <span className="opacity-60">{documents.filter(d => !d.collectionId).length}</span>
              </button>

              <div className="pt-4 space-y-1">
                {collections.map(col => (
                  <div key={col.id} className="group relative">
                    <button 
                      onClick={() => setActiveCollectionId(col.id)}
                      className={`w-full flex justify-between items-center px-4 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all ${activeCollectionId === col.id ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                    >
                      <span className="truncate pr-4"><EmojiImage emoji={col.emoji} size={16} /> {col.name}</span>
                      <span className="opacity-60 shrink-0">{documents.filter(d => d.collectionId === col.id).length}</span>
                    </button>
                    <button 
                      onClick={() => onDeleteCollection(col.id)}
                      className="absolute right-[-10px] top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 bg-rose-500 text-white p-1 rounded-full shadow-lg transition-all hover:scale-125 z-10"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                  </div>
                ))}
              </div>
            </nav>
          </div>
          
          <div className="bg-indigo-600 rounded-[32px] p-6 text-white shadow-3d-deep hidden lg:block">
            <h4 className="text-[9px] font-black uppercase tracking-widest opacity-60 mb-2">Pro-Tipp</h4>
            <p className="text-[11px] font-medium leading-relaxed">Wähle links eine Sammlung aus, bevor du hochlädst, um deine Dokumente direkt zu sortieren.</p>
          </div>
        </div>

        {/* Main Area: Document List & Action Bar */}
        <div className="lg:col-span-9 space-y-8">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white dark:bg-slate-900 p-6 rounded-[32px] border border-slate-200 dark:border-slate-800 shadow-3d-raised">
            <div className="flex flex-col">
               <h3 className="text-xl font-black dark:text-white">
                {activeCollectionId === 'all' ? 'Alle Dokumente' : 
                 activeCollectionId === 'uncategorized' ? 'Unsortierte Inhalte' : 
                 collections.find(c => c.id === activeCollectionId)?.name}
               </h3>
               <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">{filteredDocs.length} Einträge</p>
            </div>
            
            <button 
              onClick={() => !isLoading && fileInputRef.current?.click()}
              className="w-full sm:w-auto px-8 py-3 bg-indigo-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg hover:scale-105 transition-all flex items-center justify-center gap-2"
            >
              <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".pdf,.docx,.txt" />
              {isLoading ? '⏳ Verarbeite...' : '+ Dokument hochladen'}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 min-h-[400px]">
            {filteredDocs.length === 0 ? (
              <div className="col-span-full flex flex-col items-center justify-center py-20 opacity-30 text-center space-y-4">
                <EmojiImage emoji="📭" size={64} />
                <p className="text-sm font-black uppercase tracking-widest">Diese Sammlung ist leer</p>
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs font-black uppercase text-indigo-600 hover:underline"
                >
                  Erstes Dokument hinzufügen
                </button>
              </div>
            ) : (
              filteredDocs.sort((a,b) => b.uploadDate - a.uploadDate).map(doc => (
                <div key={doc.id} className="bg-white dark:bg-slate-900 rounded-[32px] border border-slate-200 dark:border-slate-800 p-8 shadow-3d-raised group hover:shadow-3d-deep transition-all relative overflow-hidden flex flex-col">
                  {/* Category Indicator Tag */}
                  {doc.collectionId && (
                    <div className="absolute top-4 left-4">
                      <span className="bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 text-[8px] font-black px-2 py-1 rounded-lg uppercase tracking-widest">
                        {collections.find(c => c.id === doc.collectionId)?.name}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between items-start mb-4 mt-2">
                    <div className="text-4xl">{getFileIcon(doc.type)}</div>
                    <div className="flex gap-1">
                      <button 
                        onClick={() => setMovingDocId(movingDocId === doc.id ? null : doc.id)}
                        className={`p-2 rounded-xl transition-all ${movingDocId === doc.id ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:text-indigo-600'}`}
                        title="In eine andere Sammlung verschieben"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>
                      </button>
                      <button 
                        onClick={() => onDelete(doc.id)}
                        className="text-slate-300 hover:text-rose-500 p-2 transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                      </button>
                    </div>
                  </div>

                  {/* Move Menu Overlay */}
                  {movingDocId === doc.id && (
                    <div className="absolute inset-0 bg-white/95 dark:bg-slate-900/95 z-20 p-6 flex flex-col justify-center animate-in fade-in zoom-in-95">
                      <p className="text-[10px] font-black uppercase text-slate-400 mb-4 text-center">In Sammlung verschieben</p>
                      <div className="grid grid-cols-2 gap-2 overflow-y-auto pr-1">
                        <button 
                          onClick={() => { onMoveDocument(doc.id, undefined); setMovingDocId(null); }}
                          className="p-3 bg-slate-100 dark:bg-slate-800 rounded-xl text-[9px] font-black uppercase dark:text-white hover:bg-indigo-600 hover:text-white"
                        >Unsortiert</button>
                        {collections.map(c => (
                          <button 
                            key={c.id}
                            onClick={() => { onMoveDocument(doc.id, c.id); setMovingDocId(null); }}
                            className="p-3 bg-slate-100 dark:bg-slate-800 rounded-xl text-[9px] font-black uppercase dark:text-white hover:bg-indigo-600 hover:text-white truncate"
                          >{c.name}</button>
                        ))}
                      </div>
                      <button onClick={() => setMovingDocId(null)} className="mt-6 text-[9px] font-black uppercase text-rose-500">Abbrechen</button>
                    </div>
                  )}

                  <div className="flex-grow space-y-1">
                    <h3 className="text-xl font-black text-slate-900 dark:text-white leading-tight line-clamp-2">{doc.name}</h3>
                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Material • {new Date(doc.uploadDate).toLocaleDateString()}</p>
                  </div>

                  <div className="mt-8 pt-6 border-t border-slate-50 dark:border-slate-800 grid grid-cols-3 gap-2 shrink-0">
                    <button 
                      onClick={() => onAction(ActiveTab.QUIZ, doc)}
                      className="bg-indigo-600 text-white py-3 rounded-2xl text-[9px] font-black uppercase hover:scale-105 active:scale-95 transition-all shadow-md"
                    >Quiz</button>
                    <button 
                      onClick={() => onAction(ActiveTab.CARDS, doc)}
                      className="bg-white dark:bg-slate-800 border-2 border-indigo-600 text-indigo-600 dark:text-indigo-400 py-3 rounded-2xl text-[9px] font-black uppercase hover:scale-105 active:scale-95 transition-all"
                    >Karten</button>
                    <button 
                      onClick={() => onAction(ActiveTab.EXPLAINER, doc)}
                      className="bg-slate-50 dark:bg-slate-800 text-slate-400 py-3 rounded-2xl text-[9px] font-black uppercase hover:text-indigo-600 transition-all"
                    >Erklärung</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
