
import React, { useState } from 'react';
import { ProcessedDocument, Collection, RecallChallenge, RecallEvaluation } from '../types';
import type { GenerationSource } from '../services/geminiService';
import { generateRecallChallenge, evaluateRecallResponse } from '../services/geminiService';
import { GeneratedImage } from './GeneratedImage';
import { SourceSelector } from './SourceSelector';

interface ActiveRecallProps {
  availableDocuments: ProcessedDocument[];
  collections: Collection[];
  getDocumentSource?: (doc: ProcessedDocument) => Promise<GenerationSource>;
  onSaveToLibrary?: (file: File) => void;
  onComplete: (score: number, topic: string) => void;
}

export const ActiveRecall: React.FC<ActiveRecallProps> = ({
  availableDocuments,
  collections,
  getDocumentSource,
  onSaveToLibrary,
  onComplete,
}) => {
  const [activeSource, setActiveSource] = useState<GenerationSource | null>(null);
  const [activeSourceName, setActiveSourceName] = useState('');
  const [challenge, setChallenge] = useState<RecallChallenge | null>(null);
  const [userAnswer, setUserAnswer] = useState('');
  const [evaluation, setEvaluation] = useState<RecallEvaluation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);

  const handleSelectDocument = async (doc: ProcessedDocument) => {
    const source = getDocumentSource
      ? await getDocumentSource(doc)
      : doc.type === 'pdf'
        ? { file: { data: doc.content, mimeType: 'application/pdf' } }
        : { text: doc.content };
    setActiveSource(source);
    setActiveSourceName(doc.name);
  };

  const startNewChallenge = async () => {
    if (!activeSource) {
      alert('Bitte wähle zuerst eine Quelle aus.');
      return;
    }
    setIsLoading(true);
    setEvaluation(null);
    setUserAnswer('');
    try {
      const res = await generateRecallChallenge(activeSource);
      if (!res || !res.question) throw new Error('Ungültige Antwort der KI');
      setChallenge(res);
    } catch (e) {
      console.error('Recall Start Error:', e);
      alert('Herausforderung konnte nicht geladen werden. Bitte überprüfe deine Internetverbindung oder versuche es mit einem anderen Dokument.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEvaluate = async () => {
    if (!challenge || !userAnswer.trim()) return;
    setIsEvaluating(true);
    try {
      const res = await evaluateRecallResponse(challenge, userAnswer);
      setEvaluation(res);
      onComplete(res.score, activeSourceName || 'Recall Session');
    } catch (e) {
      console.error('Evaluation Error:', e);
      alert('Bewertung fehlgeschlagen.');
    } finally {
      setIsEvaluating(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-6 lg:py-10 px-4 space-y-8 lg:space-y-10 animate-in fade-in duration-700 pb-32">
      <div className="text-center space-y-3">
        <h1 className="text-3xl lg:text-5xl font-black tracking-tight dark:text-white leading-tight flex items-center justify-center gap-3">
          Active <span className="text-indigo-600">Recall</span>
          <GeneratedImage prompt="Human brain active recall, academic illustration" className="w-8 h-8 lg:w-12 lg:h-12 rounded-xl" />
        </h1>
        <p className="text-xs lg:text-sm text-slate-500 dark:text-slate-400 font-semibold tracking-wide uppercase opacity-80">Erkläre komplexe Konzepte in eigenen Worten</p>
      </div>

      {!challenge ? (
        <div className="space-y-6">
          {/* Quellenauswahl */}
          {activeSource ? (
            <div className="bg-white dark:bg-slate-900 rounded-[32px] border border-slate-200 dark:border-slate-800 p-6 flex items-center justify-between shadow-3d-raised">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-indigo-500 shrink-0" />
                <div>
                  <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Aktive Quelle</p>
                  <p className="text-sm font-black dark:text-white truncate max-w-xs">{activeSourceName}</p>
                </div>
              </div>
              <button
                onClick={() => { setActiveSource(null); setActiveSourceName(''); }}
                className="text-slate-300 hover:text-rose-500 transition-colors font-black text-sm"
              >✕</button>
            </div>
          ) : (
            <SourceSelector
              documents={availableDocuments}
              collections={collections}
              onSelectDocument={handleSelectDocument}
              onSelectSource={(source, name) => { setActiveSource(source); setActiveSourceName(name); }}
              onSaveToLibrary={onSaveToLibrary}
              isLoading={isLoading}
              label="Fokus wählen"
            />
          )}

          <div className="text-center">
          <button
            onClick={startNewChallenge}
            disabled={isLoading || !activeSource}
            className="w-full sm:w-auto bg-slate-900 dark:bg-slate-700 text-white px-8 lg:px-10 py-4 lg:py-5 rounded-2xl lg:rounded-3xl font-black uppercase tracking-[0.2em] text-[10px] lg:text-[11px] shadow-3d-deep hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
          >
            {isLoading ? (
              <div className="flex items-center justify-center gap-2">
                <div className="w-3.5 h-3.5 border-2 border-slate-400 border-t-white rounded-full animate-spin"></div>
                Vorbereitung...
              </div>
            ) : (
              <span className="flex items-center gap-2">
                Drill starten
                <GeneratedImage prompt="Sparkles icon, minimalist" className="w-4 h-4 rounded-full" />
              </span>
            )}
          </button>
          </div>
        </div>
      ) : !evaluation ? (
        <div className="space-y-6 lg:space-y-8 animate-in slide-in-from-bottom-6">
          <div className="bg-indigo-600 p-8 lg:p-12 rounded-[32px] lg:rounded-[40px] text-white shadow-3d-deep relative overflow-hidden border border-indigo-500">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 blur-3xl rounded-full translate-x-12 -translate-y-12"></div>
            <h3 className="text-[9px] lg:text-[10px] font-black uppercase tracking-[0.3em] opacity-60 mb-4">Deine Herausforderung</h3>
            <p className="text-lg lg:text-2xl font-bold leading-snug tracking-tight">{challenge.question}</p>
          </div>

          <div className="space-y-4">
            <textarea 
              autoFocus
              value={userAnswer}
              onChange={e => setUserAnswer(e.target.value)}
              placeholder="Formuliere deine Erklärung hier..."
              className="w-full h-64 lg:h-72 p-6 lg:p-10 bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 rounded-[32px] lg:rounded-[40px] shadow-3d-raised outline-none focus:border-indigo-400 transition-all dark:text-white text-sm lg:text-base font-medium leading-relaxed"
            />
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 px-4 lg:px-6">
              <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest order-2 sm:order-1">
                Länge: {userAnswer.trim().split(/\s+/).filter(x => x).length} Wörter
              </span>
              <button 
                onClick={handleEvaluate}
                disabled={isEvaluating || userAnswer.trim().length < 10}
                className="w-full sm:w-auto bg-indigo-600 text-white px-8 lg:px-10 py-3.5 rounded-xl lg:rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg hover:scale-105 active:scale-95 transition-all disabled:opacity-30 order-1 sm:order-2 flex items-center justify-center gap-2"
              >
                {isEvaluating ? 'KI bewertet...' : (
                  <>
                    Antwort abgeben
                    <GeneratedImage prompt="Checkmark icon, minimalist" className="w-4 h-4 rounded-full" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6 lg:space-y-8 animate-in zoom-in-95 duration-500">
           {/* Result Grid */}
           <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white dark:bg-slate-900 p-8 lg:p-10 rounded-[32px] lg:rounded-[40px] border border-slate-200 dark:border-slate-800 shadow-3d-raised flex flex-col items-center justify-center text-center">
                 <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-2">Abruf-Qualität</span>
                 <span className={`text-5xl lg:text-6xl font-black ${evaluation.score >= 80 ? 'text-emerald-500' : evaluation.score >= 50 ? 'text-indigo-500' : 'text-rose-500'}`}>
                   {evaluation.score}%
                 </span>
              </div>
              <div className="md:col-span-2 bg-indigo-600 p-8 lg:p-10 rounded-[32px] lg:rounded-[40px] text-white shadow-3d-deep flex flex-col justify-center border border-indigo-500">
                 <h3 className="text-[9px] font-black uppercase tracking-[0.3em] opacity-60 mb-3">KI-Analyse</h3>
                 <p className="text-base lg:text-lg font-medium leading-relaxed italic">"{evaluation.feedback}"</p>
              </div>
           </div>

           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white dark:bg-slate-900 p-8 rounded-[32px] border border-slate-200 dark:border-slate-800 shadow-sm">
                <h4 className="text-[9px] font-black uppercase text-emerald-500 tracking-widest mb-4 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  Gute Ansätze
                </h4>
                <ul className="space-y-2.5">
                  {evaluation.strengths.map((s, i) => (
                    <li key={i} className="flex gap-3 items-start">
                      <GeneratedImage prompt="Checkmark icon, minimalist" className="w-3 h-3 rounded-full mt-0.5" />
                      <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 leading-normal">{s}</p>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="bg-white dark:bg-slate-900 p-8 rounded-[32px] border border-slate-200 dark:border-slate-800 shadow-sm">
                <h4 className="text-[9px] font-black uppercase text-rose-500 tracking-widest mb-4 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                  Lücken identifiziert
                </h4>
                <ul className="space-y-2.5">
                  {evaluation.missingPoints.map((m, i) => (
                    <li key={i} className="flex gap-3 items-start">
                      <GeneratedImage prompt="Lightning bolt icon, minimalist" className="w-3 h-3 rounded-full mt-0.5" />
                      <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 leading-normal">{m}</p>
                    </li>
                  ))}
                </ul>
              </div>
           </div>

           <div className="bg-slate-50 dark:bg-slate-800/40 p-8 lg:p-10 rounded-[32px] lg:rounded-[40px] border-2 border-dashed border-slate-200 dark:border-slate-800 text-center space-y-5">
              <div className="space-y-1.5">
                <h3 className="text-[9px] font-black uppercase text-indigo-500 tracking-[0.3em]">Lernempfehlung</h3>
                <p className="text-sm lg:text-base font-bold dark:text-white leading-relaxed max-w-2xl mx-auto">{evaluation.suggestedReview}</p>
              </div>
              <button 
                onClick={() => { setChallenge(null); setEvaluation(null); }}
                className="bg-indigo-600 text-white px-8 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg hover:scale-105 transition-all flex items-center gap-2 mx-auto"
              >
                Nächster Durchlauf
                <GeneratedImage prompt="Arrow right icon, minimalist" className="w-4 h-4 rounded-full" />
              </button>
           </div>
        </div>
      )}
    </div>
  );
};
