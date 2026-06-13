
import React, { useState, useMemo, useEffect } from 'react';
import { ProcessedDocument, Collection } from '../types';
import { GenerationSource } from '../services/geminiService';
import { SourceSelector } from './SourceSelector';
import { getAllMeta } from '../services/libraryService';

interface ExamGeneratorProps {
  onGenerate: (content: GenerationSource, style?: GenerationSource, options?: { count: number, difficulty: string }, docName?: string, totalMinutes?: number) => void;
  isLoading: boolean;
  documents: ProcessedDocument[];
  collections: Collection[];
  getDocumentSource?: (doc: ProcessedDocument) => GenerationSource;
  onSaveToLibrary?: (file: File) => void;
  initialDoc?: ProcessedDocument;
}

export const ExamGenerator: React.FC<ExamGeneratorProps> = ({
  onGenerate, isLoading, documents, collections, getDocumentSource, onSaveToLibrary, initialDoc,
}) => {
  const [contentSource, setContentSource] = useState<GenerationSource | null>(null);
  const [contentName, setContentName] = useState('');
  const [styleFile, setStyleFile] = useState<File | null>(null);
  const [styleLibDocId, setStyleLibDocId] = useState<string | null>(null);
  const [questionCount, setQuestionCount] = useState(10);
  const [difficulty, setDifficulty] = useState<'leicht' | 'mittel' | 'schwer'>('mittel');

  useEffect(() => {
    if (!initialDoc) return;
    try {
      const source = getDocumentSource
        ? getDocumentSource(initialDoc)
        : initialDoc.type === 'pdf'
          ? { file: { data: initialDoc.content, mimeType: 'application/pdf' } }
          : { text: initialDoc.content };
      setContentSource(source);
      setContentName(initialDoc.name);
    } catch (_) {}
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const altklausurDocs = useMemo(() => {
    const meta = getAllMeta();
    return documents.filter(d => meta[d.id]?.isAltklausur);
  }, [documents]);

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
    });

  const processStyleFile = async (file: File): Promise<GenerationSource> => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') {
      const base64 = await fileToBase64(file);
      return { file: { data: base64, mimeType: 'application/pdf' } };
    }
    return { text: await file.text() };
  };

  const handleSelectDocument = (doc: ProcessedDocument) => {
    try {
      const source = getDocumentSource
        ? getDocumentSource(doc)
        : doc.type === 'pdf'
          ? { file: { data: doc.content, mimeType: 'application/pdf' } }
          : { text: doc.content };
      setContentSource(source);
      setContentName(doc.name);
    } catch (_) {}
  };

  const handleStart = async () => {
    if (!contentSource) return;
    try {
      let styleSource: GenerationSource | undefined;
      if (styleFile) {
        styleSource = await processStyleFile(styleFile);
      } else if (styleLibDocId) {
        const doc = documents.find(d => d.id === styleLibDocId);
        if (doc) {
          styleSource = getDocumentSource
            ? getDocumentSource(doc)
            : doc.type === 'pdf'
              ? { file: { data: doc.content, mimeType: 'application/pdf' } }
              : { text: doc.content };
        }
      }
      const baseTimePerQuestion = difficulty === 'leicht' ? 4 : difficulty === 'mittel' ? 6 : 9;
      onGenerate(contentSource, styleSource, { count: questionCount, difficulty }, contentName, questionCount * baseTimePerQuestion + 5);
    } catch (e) { console.error(e); throw e; }
  };

  const estimatedDuration = useMemo(() => {
    const baseTimePerQuestion = difficulty === 'leicht' ? 4 : difficulty === 'mittel' ? 6 : 9;
    const total = questionCount * baseTimePerQuestion;
    return `${total - 5}–${total + 10} Min.`;
  }, [questionCount, difficulty]);

  return (
    <div className="max-w-[860px] mx-auto px-4 py-6 space-y-5 animate-in fade-in duration-500">

      {/* Page header */}
      <div>
        <h1 className="text-[22px] font-extrabold text-slate-900 dark:text-white">Klausur-Simulator</h1>
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-0.5">Prüfungsrealistische Simulation auf Knopfdruck</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">

        {/* Left: source + altklausur */}
        <div className="space-y-4">

          {/* Lernmaterial */}
          <div
            className="rounded-[18px] border-2 overflow-hidden transition-all"
            style={contentSource
              ? { borderColor: 'var(--accent)', background: 'var(--surface)' }
              : { borderColor: 'var(--border)', background: 'var(--surface)' }}
          >
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid var(--border)` }}>
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: 'var(--accent)' }}>Lernmaterial</p>
                <p className="text-sm font-bold dark:text-white mt-0.5">Zwingend erforderlich</p>
              </div>
              {contentSource && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-[10px] bg-emerald-50 dark:bg-emerald-950/20">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  <p className="text-[9px] text-emerald-600 dark:text-emerald-400 font-black truncate max-w-[140px]">{contentName}</p>
                  <button onClick={() => { setContentSource(null); setContentName(''); }}
                    className="text-emerald-400 hover:text-rose-500 transition-colors text-xs font-black">✕</button>
                </div>
              )}
            </div>
            <SourceSelector
              documents={documents}
              collections={collections}
              onSelectDocument={handleSelectDocument}
              onSelectSource={(source, name) => { setContentSource(source); setContentName(name); }}
              onSaveToLibrary={onSaveToLibrary}
              isLoading={isLoading}
            />
          </div>

          {/* Altklausur (optional) */}
          <div
            className="p-5 rounded-[18px] border-2 transition-all"
            style={(styleFile || styleLibDocId)
              ? { borderColor: '#f43f5e', background: 'var(--surface)' }
              : { borderColor: 'var(--border)', borderStyle: 'dashed', background: 'var(--surface)' }}
          >
            <div className="mb-4">
              <p className="text-[9px] font-black uppercase tracking-widest text-rose-500">Altklausur — Optional</p>
              <p className="text-sm font-bold dark:text-white mt-0.5">Fragestil übernehmen</p>
            </div>

            {altklausurDocs.length > 0 && (
              <div className="space-y-2 mb-4">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Aus Bibliothek</p>
                {altklausurDocs.map(d => (
                  <button key={d.id} type="button"
                    onClick={() => { setStyleLibDocId(prev => prev === d.id ? null : d.id); setStyleFile(null); }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-[14px] border-2 transition-all text-left"
                    style={styleLibDocId === d.id
                      ? { borderColor: '#f43f5e', background: 'rgba(244,63,94,0.08)' }
                      : { borderColor: 'var(--border)', background: 'transparent' }}
                  >
                    <div className="w-4 h-4 rounded flex items-center justify-center shrink-0 border-2 transition-all"
                      style={styleLibDocId === d.id ? { background: '#f43f5e', borderColor: '#f43f5e' } : { borderColor: '#94a3b8' }}>
                      {styleLibDocId === d.id && (
                        <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                          <polyline points="1.5,5 4,7.5 8.5,2.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                    <span className="text-[10px] font-black truncate dark:text-white">{d.name.replace(/\.[^/.]+$/, '')}</span>
                  </button>
                ))}
                <div className="flex items-center gap-3 my-2">
                  <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
                  <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">oder</p>
                  <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
                </div>
              </div>
            )}

            <input type="file" id="style-input" className="hidden" accept=".pdf,.docx,.txt,.md"
              onChange={(e) => { setStyleFile(e.target.files?.[0] || null); setStyleLibDocId(null); }} />
            <label htmlFor="style-input"
              className="block w-full py-3 bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-[14px] text-[10px] font-black uppercase tracking-widest hover:bg-rose-600 hover:text-white transition-all text-center cursor-pointer">
              {styleFile ? 'Datei ändern' : 'Datei hochladen'}
            </label>
            {styleFile ? (
              <div className="mt-3 p-3 bg-emerald-50 dark:bg-emerald-950/20 rounded-[12px] flex items-center gap-3">
                <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-black truncate">{styleFile.name}</p>
                <button type="button" onClick={() => setStyleFile(null)} className="ml-auto text-slate-400 hover:text-rose-500 text-xs font-black">✕</button>
              </div>
            ) : !styleLibDocId ? (
              <p className="text-[10px] text-slate-400 italic text-center mt-2">Standard-Stil verwenden</p>
            ) : null}
          </div>
        </div>

        {/* Right: config */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-[18px] border p-5 space-y-6" style={{ borderColor: 'var(--border)' }}>
            <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: 'var(--accent)' }}>Prüfungs-Setup</p>

            <div className="space-y-2">
              <div className="flex justify-between text-[9px] font-black uppercase tracking-widest text-slate-400">
                <span>Frageanzahl</span><span className="dark:text-white text-slate-900">{questionCount}</span>
              </div>
              <div className="flex bg-slate-50 dark:bg-slate-800 p-1 rounded-[12px] border" style={{ borderColor: 'var(--border)' }}>
                {[5, 10, 15, 20].map(c => (
                  <button key={c} onClick={() => setQuestionCount(c)}
                    className={`flex-1 py-2 rounded-[9px] text-[10px] font-black transition-all ${questionCount === c ? 'text-white' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'}`}
                    style={questionCount === c ? { background: 'var(--accent)' } : {}}>
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-[9px] font-black uppercase tracking-widest text-slate-400">
                <span>Schwierigkeit</span><span className="dark:text-white text-slate-900 capitalize">{difficulty}</span>
              </div>
              <div className="flex bg-slate-50 dark:bg-slate-800 p-1 rounded-[12px] border" style={{ borderColor: 'var(--border)' }}>
                {(['leicht', 'mittel', 'schwer'] as const).map(d => (
                  <button key={d} onClick={() => setDifficulty(d)}
                    className={`flex-1 py-2 rounded-[9px] text-[9px] font-black transition-all uppercase tracking-widest ${difficulty === d ? 'text-white' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'}`}
                    style={difficulty === d ? { background: 'var(--accent)' } : {}}>
                    {d}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t grid grid-cols-2 gap-4" style={{ borderColor: 'var(--border)' }}>
              <div>
                <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Geschätzte Dauer</p>
                <p className="text-lg font-black dark:text-white mt-0.5">{estimatedDuration}</p>
              </div>
              <div>
                <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Zertifiziert</p>
                <p className="text-lg font-black text-emerald-500 mt-0.5">Akkreditiert</p>
              </div>
            </div>

            <button
              onClick={handleStart}
              disabled={!contentSource || isLoading}
              className="w-full text-white py-5 rounded-[16px] font-black uppercase tracking-widest text-[11px] transition-opacity hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ background: 'var(--card-primary)' }}
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-3">
                  <span className="w-4 h-4 border-2 border-slate-400 border-t-white rounded-full animate-spin" />
                  Konzeption läuft...
                </span>
              ) : 'Simulation starten →'}
            </button>
          </div>

          <div className="bg-rose-50 dark:bg-rose-950/20 p-5 rounded-[18px] border border-rose-100 dark:border-rose-900/30">
            <p className="text-[10px] font-black uppercase tracking-widest text-rose-500 mb-2">Hinweis</p>
            <p className="text-xs text-rose-800 dark:text-rose-400 leading-relaxed italic">
              "Klausur-Realismus braucht Fokus. Wähle eine ruhige Umgebung ohne Ablenkung."
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
