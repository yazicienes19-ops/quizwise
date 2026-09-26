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
  /** Neue Datei, Text oder ganzer Ordner; bei Ordnern trägt meta die Collection-ID. */
  onSelectSource: (source: GenerationSource, name: string, meta?: { collectionId?: string }) => void;
  /** Optional: neue hochgeladene Datei auch in die Bibliothek speichern */
  onSaveToLibrary?: (file: File) => void;
  isLoading?: boolean;
  /** Anzeige-Text über dem Selektor, z. B. "Quiz-Quelle wählen" */
  label?: string;
  userPlan?: 'free' | 'pro';
  /** false: ohne eigenen Rahmen, wenn der Bereich die Auswahl schon in eine
   *  Tafel legt (Karten-Generator, Klausur, Tutor-Fenster). Vorher lagen dort
   *  drei Rahmen ineinander (Design-Tour 25.09.2026). */
  framed?: boolean;
}

type Tab = 'library' | 'upload' | 'text';

const LIST_PREVIEW = 6;
/** Auf dem Handy nur die ersten drei, der Rest über "Alle n anzeigen" (Zeugnis 6: Seiten über 3 000 px). */
const MOBILE_PREVIEW = 3;

const DocIcon = ({ type }: { type: string }) => {
  const Icon = type === 'docx' ? File : type === 'image' ? Image : FileText;
  return <Icon size={18} className="shrink-0" style={{ color: 'var(--text-secondary)' }} strokeWidth={1.75} />;
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
  framed = true,
}) => {
  const { t, tp } = useTranslation();
  const [tab, setTab] = useState<Tab>(documents.length > 0 ? 'library' : 'upload');
  const [search, setSearch] = useState('');
  // Variante C: aktives Fach (app-weiter Kontext) als Vorauswahl des Ordner-Filters
  const [filterCol, setFilterCol] = useState<string>(() => {
    const active = localStorage.getItem('studearc_active_module');
    return active && collections.some(c => c.id === active) ? active : 'all';
  });
  const [pastedText, setPastedText] = useState('');
  const [saveToLib, setSaveToLib] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadWarning, setUploadWarning] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Statt einer inneren Scrollbox: die ersten Einträge zeigen, Rest auf Wunsch.
  const [showAll, setShowAll] = useState(false);

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
    onSelectSource(result.source, result.name, { collectionId: collection.id });
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'library', label: t('ssel.tabLibrary') },
    { id: 'upload',  label: t('ssel.tabUpload') },
    { id: 'text',    label: t('ssel.tabText') },
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

  // Ordner und Dokumente als eine Liste; ohne Suche nur die ersten Einträge.
  const rows = [
    ...visibleFolders.map(f => ({ kind: 'folder' as const, ...f })),
    ...filtered.map(doc => ({ kind: 'doc' as const, doc })),
  ];
  const shownRows = showAll || search ? rows : rows.slice(0, LIST_PREVIEW);
  const rowClass = 'w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-colors hover:bg-slate-100 dark:hover:bg-slate-800/60 disabled:opacity-40';

  return (
    <div
      className={framed ? 'rounded-[24px]' : ''}
      style={framed ? { background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' } : undefined}
    >

      {/* Header */}
      {label && (
        <div className={framed ? 'px-4 sm:px-6 pt-5 sm:pt-6' : ''}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">{label}</p>
        </div>
      )}

      {/* Reiter: schlanke Textreiter statt einer zweiten goldenen Leiste */}
      <div className={framed ? 'px-4 sm:px-6 pt-4' : 'pt-1'}>
        <div role="tablist" className="flex flex-wrap gap-x-3.5 sm:gap-x-4 gap-y-1 border-b" style={{ borderColor: 'var(--border-color)' }}>
          {tabs.map(tb => {
            const active = tab === tb.id;
            return (
              <button
                key={tb.id}
                role="tab"
                aria-selected={active}
                onClick={() => setTab(tb.id)}
                className={`-mb-px py-2.5 text-[13px] font-semibold border-b-2 transition-colors ${active ? '' : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'}`}
                style={active ? { borderColor: 'var(--primary)', color: 'var(--ink)' } : undefined}
              >
                {tb.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Inhalt */}
      <div className={framed ? 'p-4 sm:p-6 pt-4' : 'pt-4'}>

        {/* ── Tab: Bibliothek ─────────────────────────────────────────── */}
        {tab === 'library' && (
          <div className="space-y-3">
            {documents.length === 0 ? (
              <div className="py-10 flex flex-col items-center gap-3 text-center">
                <BookOpen className="w-8 h-8 text-slate-300" strokeWidth={1.5} />
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('ssel.emptyLibrary')}</p>
                <button
                  onClick={() => setTab('upload')}
                  className="text-[13px] font-semibold hover:underline"
                  style={{ color: 'var(--primary-ink)' }}
                >
                  {t('ssel.uploadFirst')}
                </button>
              </div>
            ) : (
              <>
                {/* Suche + Sammlungsfilter. Mindestbreiten + Umbruch: vorher wurde das
                    Suchfeld in schmalen Spalten neben einem langen Ordnernamen auf
                    wenige Pixel zusammengedrückt (Audit 23.09.2026). */}
                <div className="flex flex-wrap gap-2">
                  <div className="relative flex-[2] min-w-[180px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" strokeWidth={1.75} />
                    <input
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder={t('ssel.searchPlaceholder')}
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm dark:text-white placeholder-slate-400 outline-none"
                      style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)' }}
                    />
                    {search && (
                      <button aria-label={t('common.clear')} onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                        <X className="w-3.5 h-3.5" strokeWidth={2} />
                      </button>
                    )}
                  </div>
                  {collections.length > 0 && (
                    <select
                      value={filterCol}
                      onChange={e => setFilterCol(e.target.value)}
                      className="flex-1 min-w-[140px] max-w-full truncate px-3 py-2.5 rounded-xl text-[13px] font-semibold dark:text-white outline-none"
                      style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)' }}
                    >
                      <option value="all">{t('ssel.all')}</option>
                      {collections.map(c => (
                        <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Liste — Ordner zuerst (ganzer Ordner = eine Wissensbasis). Zeilen
                    statt einzelner Kästen, keine innere Scrollbox mehr. */}
                {rows.length === 0 ? (
                  <p className="text-center text-[13px] text-slate-400 py-8">{t('ssel.noHits', { q: search })}</p>
                ) : (
                  <div className="-mx-1 divide-y" style={{ borderColor: 'var(--border-soft)' }}>
                    {shownRows.map((row, rowIndex) => {
                      const mobileHidden = !showAll && !search && rowIndex >= MOBILE_PREVIEW ? ' hidden sm:block' : '';
                      if (row.kind === 'folder') {
                        const { collection, count } = row;
                        const result = buildCollectionSource(collection, documents);
                        const included = result?.includedCount ?? 0;
                        const ready = included > 0;
                        return (
                          <div key={`folder-${collection.id}`} className={`py-0.5${mobileHidden}`} style={{ borderColor: 'var(--border-soft)' }}>
                            <button onClick={() => handleSelectFolder(collection)} disabled={isLoading || !ready} className={rowClass}>
                              <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-base" style={{ background: 'var(--primary-soft)' }}>
                                {collection.emoji || <FolderOpen size={16} style={{ color: 'var(--primary-ink)' }} strokeWidth={1.75} />}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="text-[13px] font-semibold break-words" style={{ color: 'var(--ink)' }}>{collection.name}</p>
                                <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                                  {t('ssel.wholeFolder')} · {tp('ssel.sourcesN', count)}
                                  {ready && included < count && <> · {t('ssel.usableN', { n: included })}</>}
                                  {!ready && <> · {t('ssel.processing')}</>}
                                </p>
                              </div>
                              <ChevronRight className="w-4 h-4 shrink-0 text-slate-300" strokeWidth={2} />
                            </button>
                          </div>
                        );
                      }
                      const { doc } = row;
                      const col = collections.find(c => c.id === doc.collectionId);
                      return (
                        <div key={doc.id} className={`py-0.5${mobileHidden}`} style={{ borderColor: 'var(--border-soft)' }}>
                          <button onClick={() => onSelectDocument(doc)} disabled={isLoading} className={rowClass}>
                            <span className="w-7 h-7 flex items-center justify-center shrink-0"><DocIcon type={doc.type} /></span>
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] font-semibold break-words" style={{ color: 'var(--ink)' }}>{docTitle(doc)}</p>
                              <p className="text-xs mt-0.5 break-words" style={{ color: 'var(--text-secondary)' }}>
                                {doc.type.toUpperCase()}
                                {col && <> · {col.name}</>}
                              </p>
                            </div>
                            <ChevronRight className="w-4 h-4 shrink-0 text-slate-300" strokeWidth={2} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
                {!search && rows.length > MOBILE_PREVIEW && (
                  <button
                    onClick={() => setShowAll(v => !v)}
                    className={`${rows.length > LIST_PREVIEW ? '' : 'sm:hidden '}text-[13px] font-semibold hover:underline`}
                    style={{ color: 'var(--primary-ink)' }}
                  >
                    {showAll ? t('ssel.showLess') : t('ssel.showAll', { n: rows.length })}
                  </button>
                )}
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
                  <p className={`text-[11px] font-semibold ${documents.length >= 5 ? 'text-rose-700 dark:text-rose-400' : 'text-slate-600 dark:text-slate-300'}`}>
                    {documents.length >= 5 ? t('ssel.docLimitReached') : t('ssel.docsCount', { n: documents.length })}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
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
              className="w-full py-10 rounded-2xl border-2 border-dashed transition-all flex flex-col items-center gap-4 hover:border-indigo-500 group disabled:opacity-40"
              style={{ borderColor: 'var(--border-color)', background: 'color-mix(in srgb, var(--border-color) 15%, var(--bg-main))' }}
            >
              <Upload className={`w-7 h-7 text-slate-400 ${isProcessing ? 'animate-pulse' : ''}`} strokeWidth={1.5} />
              <div className="text-center space-y-1">
                <p className="text-[13px] font-semibold dark:text-white group-hover:text-indigo-600 transition-colors">
                  {isProcessing ? t('ssel.processingFile') : t('ssel.chooseFile')}
                </p>
                <p className="text-[11px] text-slate-400">{t('ssel.fileTypes')}</p>
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
                <input
                  type="checkbox"
                  checked={saveToLib}
                  onChange={e => setSaveToLib(e.target.checked)}
                  className="sr-only peer"
                />
                <div
                  className={`w-10 h-5 rounded-full transition-all relative shrink-0 ${saveToLib ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'} peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-[color:var(--primary)]`}
                >
                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${saveToLib ? 'left-5' : 'left-0.5'}`} />
                </div>
                <div>
                  <p className="text-[11px] font-semibold dark:text-white">{t('ssel.saveToLibrary')}</p>
                  <p className="text-[11px] text-slate-400">{t('ssel.reusable')}</p>
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
              <span className="text-[11px] text-slate-400">
                {tp('ssel.wordsN', pastedText.trim().split(/\s+/).filter(Boolean).length)}
              </span>
              <button
                onClick={handleTextSubmit}
                disabled={pastedText.trim().length < 20 || isLoading}
                className="px-6 py-3 rounded-2xl text-[13px] font-semibold transition-all hover:scale-[1.02] disabled:opacity-40"
                style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
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
