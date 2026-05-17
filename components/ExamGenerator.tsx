
import React, { useState, useMemo } from 'react';
import { ProcessedDocument, Collection } from '../types';
import { GenerationSource } from '../services/geminiService';
import { GeneratedImage } from './GeneratedImage';
import { SourceSelector } from './SourceSelector';

interface ExamGeneratorProps {
  onGenerate: (content: GenerationSource, style?: GenerationSource, options?: { count: number, difficulty: string }) => void;
  isLoading: boolean;
  documents: ProcessedDocument[];
  collections: Collection[];
  getDocumentSource?: (doc: ProcessedDocument) => Promise<GenerationSource>;
  onSaveToLibrary?: (file: File) => void;
}

export const ExamGenerator: React.FC<ExamGeneratorProps> = ({
  onGenerate,
  isLoading,
  documents,
  collections,
  getDocumentSource,
  onSaveToLibrary,
}) => {
  const [contentSource, setContentSource] = useState<GenerationSource | null>(null);
  const [contentName, setContentName] = useState('');
  const [styleFile, setStyleFile] = useState<File | null>(null);
  const [questionCount, setQuestionCount] = useState(10);
  const [difficulty, setDifficulty] = useState<'leicht' | 'mittel' | 'schwer'>('mittel');

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
    const text = await file.text();
    return { text };
  };

  const handleSelectDocument = async (doc: ProcessedDocument) => {
    const source = getDocumentSource
      ? await getDocumentSource(doc)
      : doc.type === 'pdf'
        ? { file: { data: doc.content, mimeType: 'application/pdf' } }
        : { text: doc.content };
    setContentSource(source);
    setContentName(doc.name);
  };

  const handleStart = async () => {
    if (!contentSource) return;
    try {
      const styleSource = styleFile ? await processStyleFile(styleFile) : undefined;
      onGenerate(contentSource, styleSource, { count: questionCount, difficulty });
    } catch (e) {
      console.error(e);
      throw e;
    }
  };

  const estimatedDuration = useMemo(() => {
    const baseTimePerQuestion = difficulty === 'leicht' ? 4 : difficulty === 'mittel' ? 6 : 9;
    const total = questionCount * baseTimePerQuestion;
    return `${total - 5} - ${total + 10} Min.`;
  }, [questionCount, difficulty]);

  return (
    <div className="max-w-4xl mx-auto space-y-10 lg:space-y-16 animate-in fade-in slide-in-from-bottom-4 duration-700 py-10 px-4">
      <div className="text-center space-y-4">
        <h1 className="text-5xl lg:text-7xl font-black text-slate-900 dark:text-white tracking-tighter flex items-center justify-center gap-4">
          Klausur <span className="text-rose-600 dark:text-rose-400">Simulator</span>
          <GeneratedImage prompt="Graduation cap, academic illustration" className="w-12 h-12 lg:w-16 lg:h-16 rounded-2xl" />
        </h1>
        <p className="text-lg lg:text-xl text-slate-500 dark:text-slate-400 font-medium">
          Erstelle neue Prüfungen basierend auf deinen Unterlagen.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
        {/* Left: Quellauswahl + Altklausur */}
        <div className="lg:col-span-7 space-y-6">

          {/* Lernmaterial via SourceSelector */}
          <div className={`rounded-[32px] border-2 transition-all overflow-hidden ${contentSource ? 'border-indigo-500 ring-4 ring-indigo-500/10' : 'border-slate-100 dark:border-slate-800'}`}
            style={{ background: 'var(--bg-sidebar)' }}>
            <div className="flex items-center gap-4 px-8 pt-7 pb-4">
              <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/30 rounded-2xl flex items-center justify-center overflow-hidden shrink-0">
                <GeneratedImage prompt="Academic books, minimalist illustration" className="w-full h-full object-cover" />
              </div>
              <div>
                <h3 className="text-base font-black dark:text-white uppercase tracking-tight">Lernmaterial</h3>
                <p className="text-[10px] text-indigo-600 uppercase font-black tracking-widest">Zwingend erforderlich</p>
              </div>
              {contentSource && (
                <div className="ml-auto flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/20 px-3 py-1.5 rounded-xl">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                  <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-black truncate max-w-[120px]">{contentName}</p>
                  <button onClick={() => { setContentSource(null); setContentName(''); }} className="text-emerald-400 hover:text-rose-500 transition-colors text-xs font-black ml-1">✕</button>
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

          {/* Altklausur (optional, Stil-Referenz) */}
          <div className={`p-8 rounded-[32px] border-2 transition-all flex flex-col gap-6 shadow-3d-raised ${styleFile ? 'border-rose-500 ring-4 ring-rose-500/10' : 'border-dashed border-slate-200 dark:border-slate-700'}`}
            style={{ background: 'var(--bg-sidebar)' }}>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 rounded-2xl flex items-center justify-center overflow-hidden shrink-0">
                <GeneratedImage prompt="Exam paper, academic illustration" className="w-full h-full object-cover" />
              </div>
              <div>
                <h3 className="text-xl font-black dark:text-white uppercase tracking-tight">Altklausur</h3>
                <p className="text-[10px] text-rose-500 uppercase font-black tracking-widest">Optional (Stil-Kopie)</p>
              </div>
            </div>
            <input
              type="file"
              id="style-input"
              className="hidden"
              accept=".pdf,.docx,.txt,.md"
              onChange={(e) => setStyleFile(e.target.files?.[0] || null)}
            />
            <label
              htmlFor="style-input"
              className="w-full py-4 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-rose-600 hover:text-white transition-all text-center cursor-pointer shadow-sm"
            >
              {styleFile ? 'Datei ändern' : 'Datei wählen'}
            </label>
            {styleFile ? (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 rounded-xl flex items-center gap-3">
                <GeneratedImage prompt="Checkmark icon, minimalist" className="w-4 h-4 rounded-full" />
                <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-black truncate">{styleFile.name}</p>
              </div>
            ) : (
              <p className="text-[10px] text-slate-400 italic text-center">Standard-Stil verwenden</p>
            )}
          </div>
        </div>

        {/* Config Column */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-[32px] border border-slate-200 dark:border-slate-800 shadow-3d-deep p-8 space-y-10">
            <h3 className="text-[11px] font-black uppercase tracking-[0.4em] text-rose-500">Prüfungs-Setup</h3>

            <div className="space-y-6">
              <div className="space-y-3">
                <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <span>Frageanzahl</span>
                  <span className="text-slate-900 dark:text-white">{questionCount}</span>
                </div>
                <div className="flex bg-slate-50 dark:bg-slate-800 p-1 rounded-2xl border shadow-inner">
                  {[5, 10, 15, 20].map(c => (
                    <button
                      key={c}
                      onClick={() => setQuestionCount(c)}
                      className={`flex-1 py-3 rounded-xl text-[10px] font-black transition-all ${questionCount === c ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <span>Schwierigkeit</span>
                  <span className="text-slate-900 dark:text-white capitalize">{difficulty}</span>
                </div>
                <div className="flex bg-slate-50 dark:bg-slate-800 p-1 rounded-2xl border shadow-inner">
                  {(['leicht', 'mittel', 'schwer'] as const).map(d => (
                    <button
                      key={d}
                      onClick={() => setDifficulty(d)}
                      className={`flex-1 py-3 rounded-xl text-[10px] font-black transition-all uppercase tracking-widest ${difficulty === d ? 'bg-rose-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-8 border-t border-slate-50 dark:border-slate-800 grid grid-cols-2 gap-8">
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Geschätzte Dauer</p>
                <p className="text-xl font-black dark:text-white">{estimatedDuration}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Zertifikat-Status</p>
                <p className="text-xl font-black text-emerald-500 uppercase">Akkreditiert</p>
              </div>
            </div>

            <button
              onClick={handleStart}
              disabled={!contentSource || isLoading}
              className="w-full bg-slate-900 dark:bg-slate-700 text-white py-6 rounded-2xl font-black uppercase tracking-[0.3em] text-[12px] shadow-3d-deep hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-30 disabled:cursor-not-allowed mt-4"
            >
              {isLoading ? (
                <div className="flex items-center justify-center gap-3">
                  <div className="w-4 h-4 border-2 border-slate-400 border-t-white rounded-full animate-spin"></div>
                  Konzeption läuft...
                </div>
              ) : (
                <span className="flex items-center justify-center gap-3">
                  Simulation Starten
                  <GeneratedImage prompt="Writing pen icon, minimalist" className="w-4 h-4 rounded-full" />
                </span>
              )}
            </button>
          </div>

          <div className="bg-rose-50 dark:bg-rose-950/20 p-6 rounded-[32px] border border-rose-100 dark:border-rose-900/30 flex items-start gap-4">
            <GeneratedImage prompt="Balance scales icon, academic minimalist" className="w-8 h-8 rounded-full shrink-0" />
            <p className="text-xs font-medium text-rose-800 dark:text-rose-400 leading-relaxed italic">
              "Diese Simulation basiert auf akademischen Standards. Sorgen Sie für eine ruhige Umgebung ohne Ablenkung."
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
