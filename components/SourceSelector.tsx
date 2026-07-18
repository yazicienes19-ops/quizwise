import React, { useState, useRef, useMemo } from 'react';
import { BookOpen, Upload, FileText, Search, ChevronRight, X, File, Image, FolderOpen } from 'lucide-react';
import { ProcessedDocument, Collection } from '../types';
import type { GenerationSource } from '../services/geminiService';
import { documentDisplayName as docTitle } from '../services/libraryService';
import { buildCollectionSource, collectionDocs } from '../services/collectionSource';
import mammoth from 'mammoth';
import { useTranslation } from '../i18n/I18nProvider';

interface SourceSelectorProps {
  documents: ProcessedDocument[];
  collections: Collection[];
  /** Bibliotheks-Dokument wurde ausgewählt — Parent ruft getDocumentSource auf */
  onSelectDocument: (doc: ProcessedDocument) => void;
  /** Neue Datei oder Text wurde direkt eingegeben */
  onSelectSource: (source: GenerationSource, name: string) => void;
  /** Optional: neue hochgeladene Datei auch in die Bibliothek speichern */
  onSaveToLibrary?: (file: File) => void;
  isLoading?: boolean;
  /** Anzeige-Text über dem Selektor, z. B. "Quiz-Quelle wählen" */
  label?: string;
  userPlan?: 'free' | 'pro';
}

type Tab = 'library' | 'upload' | 'text';

const DocIcon = ({ type }: { type: string }) => {
  if (type === 'pdf') return <FileText size={20} className="text-rose-500 shrink-0" />;
  if (type === 'docx') return <File size={20} className="text-blue-500 shrink-0" />;
  if (type === 'image') return <Image size={20} className="text-emerald-500 shrink-0" />;
  return <FileText size={20} className="text-slate-400 shrink-0" />;
};

export const SourceSelector: React.FC<SourceSelectorProps> = ({
  documents,
  collections,
  onSelectDocument,
  onSelectSource,
  onSaveToLibrary,
  isLoading,
  label,
  userPlan = 'free',
}) => {
  const { t, tp } = useTranslation();
  const [tab, setTab] = useState<Tab>(documents.length > 0 ? 'library' : 'upload');
  const [search, setSearch] = useState('');
  // Variante C: aktives Fach (app-weiter Kontext) als Vorauswahl des Ordner-Filters
  const [filterCol, setFilterCol] = useState<string>(() => {
    const active = localStorage.getItem('quizwise_active_module');
    return active && collections.some(c => c.id === active) ? active : 'all';
  });
  const [pastedText, setPastedText] = useState('');
  const [saveToLib, setSaveToLib] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadWarning, setUploadWarning] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const MAX_FILE_SIZE = 50 * 1024 * 1024;

  const filtered = useMemo(() => {
    return documents.filter(d => {
      const q = search.toLowerCase();
      const matchesSearch = d.name.toLowerCase().includes(q) || docTitle(d).toLowerCase().includes(q);
      const matchesCol = filterCol === 'all' || d.collectionId === filterCol;
      return matchesSearch && matchesCol;
    });
  }, [documents, search, filterCol]);

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
    });

  const handleFileSelected = async (file: File) => {
    setUploadError(null);
    setUploadWarning(null);

    if (file.size > MAX_FILE_SIZE) {
      setUploadError(t('ssel.fileTooBig', { size: (file.size / 1024 / 1024).toFixed(1) }));
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const isDuplicate = documents.some(d => d.name === file.name);
    if (isDuplicate) {
      setUploadWarning(t('ssel.duplicate', { name: file.name }));
    }

    setIsProcessing(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase();
      let source: GenerationSource;

      if (ext === 'pdf') {
        const base64 = await fileToBase64(file);
        source = { file: { data: base64, mimeType: 'application/pdf' } };
      } else if (ext === 'docx') {
        const buffer = await file.arrayBuffer();
        const { value } = await mammoth.extractRawText({ arrayBuffer: buffer });
        source = { text: value };
      } else {
        const text = await file.text();
        source = { text };
      }

      if (saveToLib && onSaveToLibrary) onSaveToLibrary(file);
      onSelectSource(source, file.name);
    } catch {
      // Fehler wird durch den Parent via toast behandelt
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTextSubmit = () => {
    if (!pastedText.trim()) return;
    onSelectSource({ text: pastedText.trim() }, t('ssel.pastedTextName'));
  };

  // Ordner mit Inhalten — jeder Ordner ist ein Wissensraum aus allen seinen Quellen
  const foldersWithDocs = useMemo(
    () => collections
      .map(c => ({ collection: c, count: collectionDocs(c, documents).length }))
      .filter(f => f.count > 0),
    [collections, documents],
  );

  const handleSelectFolder = (collection: Collection) => {
    const result = buildCollectionSource(collection, documents);
    if (!result || result.includedCount === 0) return;
    onSelectSource(result.source, result.name);
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'library', label: t('ssel.tabLibrary'), icon: <BookOpen className="w-4 h-4" strokeWidth={1.75} /> },
    { id: 'upload',  label: t('ssel.tabUpload'), icon: <Upload className="w-4 h-4" strokeWidth={1.75} /> },
    { id: 'text',    label: t('ssel.tabText'), icon: <FileText className="w-4 h-4" strokeWidth={1.75} /> },
  ];

  // Ordner-Zeilen erscheinen direkt in der Bibliotheks-Liste (kein eigener Tab):
  // sichtbar wenn Suche/Filter passt — Klick nutzt ALLE Quellen des Ordners gemeinsam.
  const visibleFolders = useMemo(
    () => foldersWithDocs.filter(({ collection }) => {
      const matchesSearch = collection.name.toLowerCase().includes(search.toLowerCase());
      const matchesCol = filterCol === 'all' || filterCol === collection.id;
      return matchesSearch && matchesCol;
    }),
    [foldersWithDocs, search, filterCol],
  );

  return (
    <div className="rounded-[32px] overflow-hidden" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}>

      {/* Header */}
      {label && (
        <div className="px-8 pt-7 pb-0">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">{label}</p>
        </div>
      )}

      {/* Tab-Leiste */}
      <div className="px-6 pt-5 pb-0">
        <div className="flex p-1 rounded-2xl gap-1 min-w-0" style={{ background: 'color-mix(in srgb, var(--border-color) 40%, var(--bg-main))' }}>
          {tabs.map(tb => (
            <button
              key={tb.id}
              onClick={() => setTab(tb.id)}
              title={tb.label}
              className={`flex-1 min-w-0 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                tab === tb.id ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
              }`}
            >
              <span className="shrink-0">{tb.icon}</span>
              <span className="hidden sm:inline break-words">{tb.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Inhalt */}
      <div className="p-6">

        {/* ── Tab: Bibliothek ─────────────────────────────────────────── */}
        {tab === 'library' && (
          <div className="space-y-4">
            {documents.length === 0 ? (
              <div className="py-12 flex flex-col items-center gap-4 text-center opacity-50">
                <span className="text-5xl">📭</span>
                <p className="text-[11px] font-black uppercase tracking-widest dark:text-white">{t('ssel.emptyLibrary')}</p>
                <button
                  onClick={() => setTab('upload')}
                  className="text-[10px] font-black uppercase tracking-widest text-indigo-600 hover:underline"
                >
                  {t('ssel.uploadFirst')}
                </button>
              </div>
            ) : (
              <>
                {/* Suche + Sammlungsfilter */}
                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" strokeWidth={1.75} />
                    <input
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder={t('ssel.searchPlaceholder')}
                      className="w-full pl-10 pr-4 py-2.5 rounded-2xl text-sm dark:text-white placeholder-slate-400 outline-none"
                      style={{ background: 'color-mix(in srgb, var(--border-color) 30%, var(--bg-main))', border: '1px solid var(--border-color)' }}
                    />
                    {search && (
                      <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                        <X className="w-3.5 h-3.5" strokeWidth={2} />
                      </button>
                    )}
                  </div>
                  {collections.length > 0 && (
                    <select
                      value={filterCol}
                      onChange={e => setFilterCol(e.target.value)}
                      className="px-3 py-2.5 rounded-2xl text-[11px] font-bold dark:text-white outline-none"
                      style={{ background: 'color-mix(in srgb, var(--border-color) 30%, var(--bg-main))', border: '1px solid var(--border-color)' }}
                    >
                      <option value="all">{t('ssel.all')}</option>
                      {collections.map(c => (
                        <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Dokumenten-Liste — Ordner zuerst (ganzer Ordner = eine Wissensbasis) */}
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {visibleFolders.map(({ collection, count }) => {
                    const result = buildCollectionSource(collection, documents);
                    const included = result?.includedCount ?? 0;
                    const ready = included > 0;
                    return (
                      <button
                        key={`folder-${collection.id}`}
                        onClick={() => handleSelectFolder(collection)}
                        disabled={isLoading || !ready}
                        className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-left transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 group"
                        style={{
                          background: 'color-mix(in srgb, var(--primary) 7%, var(--bg-main))',
                          border: '1px solid color-mix(in srgb, var(--primary) 22%, transparent)',
                        }}
                      >
                        <FolderOpen size={20} className="shrink-0" style={{ color: 'var(--primary)' }} strokeWidth={1.75} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-black dark:text-white break-words">{collection.emoji} {collection.name}</p>
                          <p className="text-[10px] uppercase tracking-widest mt-0.5" style={{ color: 'var(--primary)' }}>
                            {t('ssel.wholeFolder')} · {tp('ssel.sourcesN', count)}
                            {ready && included < count && <> · {t('ssel.usableN', { n: included })}</>}
                            {!ready && <> · {t('ssel.processing')}</>}
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 shrink-0 transition-colors" style={{ color: 'var(--primary)' }} strokeWidth={2} />
                      </button>
                    );
                  })}
                  {filtered.length === 0 && visibleFolders.length === 0 ? (
                    <p className="text-center text-[11px] text-slate-400 py-8 italic">{t('ssel.noHits', { q: search })}</p>
                  ) : (
                    filtered.map(doc => {
                      const col = collections.find(c => c.id === doc.collectionId);
                      return (
                        <button
                          key={doc.id}
                          onClick={() => onSelectDocument(doc)}
                          disabled={isLoading}
                          className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-left transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 group"
                          style={{ background: 'color-mix(in srgb, var(--border-color) 25%, var(--bg-main))', border: '1px solid var(--border-color)' }}
                        >
                          <DocIcon type={doc.type} />
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-black dark:text-white break-words">{docTitle(doc)}</p>
                            <p className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5 break-words">
                              {doc.type.toUpperCase()}
                              {col && <> · {col.emoji} {col.name}</>}
                            </p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 transition-colors shrink-0" strokeWidth={2} />
                        </button>
                      );
                    })
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Tab: Neue Datei ─────────────────────────────────────────── */}
        {tab === 'upload' && (
          <div className="space-y-4">
            {/* Free-Plan Limit Banner */}
            {userPlan === 'free' && saveToLib && (
              <div className={`flex items-center justify-between px-4 py-3 rounded-2xl ${documents.length >= 5 ? 'bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800' : 'bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700'}`}>
                <div>
                  <p className={`text-[11px] font-black ${documents.length >= 5 ? 'text-rose-700 dark:text-rose-400' : 'text-slate-600 dark:text-slate-300'}`}>
                    {documents.length >= 5 ? t('ssel.docLimitReached') : t('ssel.docsCount', { n: documents.length })}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {documents.length >= 5 ? t('ssel.proUnlimited') : t('ssel.freeIncluded')}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  {[0, 1, 2, 3, 4].map(i => (
                    <div key={i} className={`w-2 h-2 rounded-full transition-all ${i < documents.length ? (documents.length >= 5 ? 'bg-rose-400' : 'bg-indigo-500') : 'bg-slate-200 dark:bg-slate-700'}`} />
                  ))}
                </div>
              </div>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing || isLoading || (userPlan === 'free' && saveToLib && documents.length >= 5)}
              className="w-full py-12 rounded-[24px] border-2 border-dashed transition-all flex flex-col items-center gap-4 hover:border-indigo-500 group disabled:opacity-50"
              style={{ borderColor: 'var(--border-color)', background: 'color-mix(in srgb, var(--border-color) 15%, var(--bg-main))' }}
            >
              <span className="text-4xl">{isProcessing ? '⏳' : '📂'}</span>
              <div className="text-center space-y-1">
                <p className="text-[11px] font-black uppercase tracking-widest dark:text-white group-hover:text-indigo-600 transition-colors">
                  {isProcessing ? t('ssel.processingFile') : t('ssel.chooseFile')}
                </p>
                <p className="text-[10px] text-slate-400">{t('ssel.fileTypes')}</p>
              </div>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.webp,.heic,.heif"
              onChange={e => { if (e.target.files?.[0]) handleFileSelected(e.target.files[0]); }}
            />

            {uploadError && (
              <div className="flex items-start gap-3 px-4 py-3 rounded-2xl bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800 animate-in slide-in-from-top-2 duration-200">
                <span className="text-rose-500 shrink-0 mt-0.5">✕</span>
                <p className="text-[11px] font-bold text-rose-700 dark:text-rose-400">{uploadError}</p>
              </div>
            )}
            {uploadWarning && !uploadError && (
              <div className="flex items-start gap-3 px-4 py-3 rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 animate-in slide-in-from-top-2 duration-200">
                <span className="text-amber-500 shrink-0 mt-0.5">⚠</span>
                <p className="text-[11px] font-bold text-amber-700 dark:text-amber-400">{uploadWarning}</p>
              </div>
            )}

            {/* Option: In Bibliothek speichern */}
            {onSaveToLibrary && (
              <label className="flex items-center gap-3 px-4 py-3 rounded-2xl cursor-pointer hover:opacity-80 transition-opacity" style={{ background: 'color-mix(in srgb, var(--border-color) 25%, var(--bg-main))' }}>
                <div
                  onClick={() => setSaveToLib(!saveToLib)}
                  className={`w-10 h-5 rounded-full transition-all relative shrink-0 ${saveToLib ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'}`}
                >
                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${saveToLib ? 'left-5' : 'left-0.5'}`} />
                </div>
                <div>
                  <p className="text-[11px] font-black dark:text-white">{t('ssel.saveToLibrary')}</p>
                  <p className="text-[10px] text-slate-400">{t('ssel.reusable')}</p>
                </div>
              </label>
            )}
          </div>
        )}

        {/* ── Tab: Text einfügen ──────────────────────────────────────── */}
        {tab === 'text' && (
          <div className="space-y-4">
            <textarea
              autoFocus
              value={pastedText}
              onChange={e => setPastedText(e.target.value)}
              placeholder={t('ssel.textPlaceholder')}
              rows={8}
              className="w-full p-5 rounded-[24px] text-sm dark:text-white placeholder-slate-400 outline-none resize-none leading-relaxed"
              style={{ background: 'color-mix(in srgb, var(--border-color) 25%, var(--bg-main))', border: '1px solid var(--border-color)' }}
            />
            <div className="flex items-center justify-between px-1">
              <span className="text-[10px] text-slate-400">
                {tp('ssel.wordsN', pastedText.trim().split(/\s+/).filter(Boolean).length)}
              </span>
              <button
                onClick={handleTextSubmit}
                disabled={pastedText.trim().length < 20 || isLoading}
                className="px-6 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest text-white transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-40"
                style={{ background: 'var(--primary)' }}
              >
                {t('ssel.continue')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
