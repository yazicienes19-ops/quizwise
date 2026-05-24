import React, { useState, useRef, useMemo } from 'react';
import { BookOpen, Upload, FileText, Search, ChevronRight, X, File, Image } from 'lucide-react';
import { ProcessedDocument, Collection } from '../types';
import type { GenerationSource } from '../services/geminiService';
import mammoth from 'mammoth';

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
}) => {
  const [tab, setTab] = useState<Tab>(documents.length > 0 ? 'library' : 'upload');
  const [search, setSearch] = useState('');
  const [filterCol, setFilterCol] = useState<string>('all');
  const [pastedText, setPastedText] = useState('');
  const [saveToLib, setSaveToLib] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadWarning, setUploadWarning] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const MAX_FILE_SIZE = 50 * 1024 * 1024;

  const filtered = useMemo(() => {
    return documents.filter(d => {
      const matchesSearch = d.name.toLowerCase().includes(search.toLowerCase());
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
      setUploadError(`Datei zu groß (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum ist 50 MB.`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const isDuplicate = documents.some(d => d.name === file.name);
    if (isDuplicate) {
      setUploadWarning(`"${file.name}" ist bereits in deiner Bibliothek — wird trotzdem verarbeitet.`);
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
    onSelectSource({ text: pastedText.trim() }, 'Eingefügter Text');
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'library', label: 'Aus Bibliothek', icon: <BookOpen className="w-4 h-4" strokeWidth={1.75} /> },
    { id: 'upload',  label: 'Neue Datei',     icon: <Upload className="w-4 h-4" strokeWidth={1.75} /> },
    { id: 'text',    label: 'Text einfügen',  icon: <FileText className="w-4 h-4" strokeWidth={1.75} /> },
  ];

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
        <div className="flex p-1 rounded-2xl gap-1" style={{ background: 'color-mix(in srgb, var(--border-color) 40%, var(--bg-main))' }}>
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap ${
                tab === t.id ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
              }`}
            >
              {t.icon}
              <span className="hidden sm:inline">{t.label}</span>
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
                <p className="text-[11px] font-black uppercase tracking-widest dark:text-white">Bibliothek ist leer</p>
                <button
                  onClick={() => setTab('upload')}
                  className="text-[10px] font-black uppercase tracking-widest text-indigo-600 hover:underline"
                >
                  Erste Datei hochladen →
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
                      placeholder="Dokument suchen..."
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
                      <option value="all">Alle</option>
                      {collections.map(c => (
                        <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Dokumenten-Liste */}
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {filtered.length === 0 ? (
                    <p className="text-center text-[11px] text-slate-400 py-8 italic">Keine Treffer für „{search}"</p>
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
                            <p className="text-[12px] font-black dark:text-white truncate">{doc.name}</p>
                            <p className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5">
                              {doc.type.toUpperCase()}
                              {col && <> · <span>{col.emoji} {col.name}</span></>}
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
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing || isLoading}
              className="w-full py-12 rounded-[24px] border-2 border-dashed transition-all flex flex-col items-center gap-4 hover:border-indigo-500 group disabled:opacity-50"
              style={{ borderColor: 'var(--border-color)', background: 'color-mix(in srgb, var(--border-color) 15%, var(--bg-main))' }}
            >
              <span className="text-4xl">{isProcessing ? '⏳' : '📂'}</span>
              <div className="text-center space-y-1">
                <p className="text-[11px] font-black uppercase tracking-widest dark:text-white group-hover:text-indigo-600 transition-colors">
                  {isProcessing ? 'Wird verarbeitet...' : 'Datei auswählen'}
                </p>
                <p className="text-[10px] text-slate-400">PDF, DOCX oder TXT · max. 50 MB</p>
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
                  <p className="text-[11px] font-black dark:text-white">Auch in Bibliothek speichern</p>
                  <p className="text-[10px] text-slate-400">Dann in allen Modulen wiederverwendbar</p>
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
              placeholder="Füge hier deinen Lernstoff ein — Mitschrift, Zusammenfassung, Skript-Abschnitt..."
              rows={8}
              className="w-full p-5 rounded-[24px] text-sm dark:text-white placeholder-slate-400 outline-none resize-none leading-relaxed"
              style={{ background: 'color-mix(in srgb, var(--border-color) 25%, var(--bg-main))', border: '1px solid var(--border-color)' }}
            />
            <div className="flex items-center justify-between px-1">
              <span className="text-[10px] text-slate-400">
                {pastedText.trim().split(/\s+/).filter(Boolean).length} Wörter
              </span>
              <button
                onClick={handleTextSubmit}
                disabled={pastedText.trim().length < 20 || isLoading}
                className="px-6 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest text-white transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-40"
                style={{ background: 'var(--primary)' }}
              >
                Weiter →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
