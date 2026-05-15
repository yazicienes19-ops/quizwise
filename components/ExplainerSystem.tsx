
import React, { useState, useEffect } from 'react';
import { ProcessedDocument } from '../types';
import { EmojiImage } from './EmojiImage';
import { generateExplanation } from '../services/geminiService';

interface ExplainerSystemProps {
  availableDocuments: ProcessedDocument[];
  onUploadNew: (file: File) => void;
}

export const ExplainerSystem: React.FC<ExplainerSystemProps> = ({ availableDocuments, onUploadNew }) => {
  const [selectedDocId, setSelectedDocId] = useState<string | null>(availableDocuments.length > 0 ? availableDocuments[0].id : null);
  const [concept, setConcept] = useState('');
  const [explanation, setExplanation] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Sync selected doc if list was empty and now has items
  useEffect(() => {
    if (!selectedDocId && availableDocuments.length > 0) {
      setSelectedDocId(availableDocuments[0].id);
    }
  }, [availableDocuments, selectedDocId]);

  const handleExplain = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const activeDoc = availableDocuments.find(d => d.id === selectedDocId);
    if (!activeDoc || !concept.trim()) {
        if (!activeDoc) alert("Bitte wähle zuerst ein Dokument als Basis aus.");
        return;
    }
    
    setIsLoading(true);
    setExplanation(null);
    try {
      const source = activeDoc.type === 'pdf' 
        ? { file: { data: activeDoc.content, mimeType: 'application/pdf' } } 
        : { text: activeDoc.content };
      
      const result = await generateExplanation(source, concept.trim());
      setExplanation(result);
    } catch (e) {
      console.error(e);
      alert("Fehler bei der Generierung der Erklärung.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-12 py-6 lg:py-10 animate-in fade-in duration-700">
      {/* Search-Style Header Area */}
      <div className={`transition-all duration-700 ease-in-out ${explanation ? 'mb-12' : 'mt-20 lg:mt-32 mb-20'}`}>
        <div className="text-center space-y-6 max-w-3xl mx-auto">
          <h1 className="text-4xl lg:text-6xl font-black text-slate-900 dark:text-white tracking-tighter">
            KI <span className="text-indigo-600">Erklärer</span> <EmojiImage emoji="💡" size={48} />
          </h1>
          
          <form onSubmit={handleExplain} className="relative group">
            <div className="absolute -inset-1 bg-indigo-500/20 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-[32px]"></div>
            <div className="relative">
                <input 
                    type="text"
                    value={concept}
                    onChange={(e) => setConcept(e.target.value)}
                    placeholder="Welchen Begriff möchtest du verstehen?"
                    className="w-full pl-8 pr-40 py-6 sm:py-8 bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-[32px] shadow-3d-raised focus:border-indigo-500 outline-none transition-all text-xl sm:text-2xl text-slate-900 dark:text-white font-bold"
                />
                <button 
                    type="submit"
                    disabled={isLoading || !concept.trim()}
                    className="absolute right-3 top-1/2 -translate-y-1/2 bg-indigo-600 text-white px-8 py-3.5 sm:py-4 rounded-2xl font-black uppercase text-[10px] sm:text-[11px] tracking-widest hover:scale-105 active:scale-95 transition-all shadow-lg disabled:opacity-50"
                >
                    {isLoading ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    ) : <span>Erklären <EmojiImage emoji="✨" size={16} /></span>}
                </button>
            </div>
          </form>

          {/* Basis-Auswahl direkt unter dem Input */}
          <div className="flex flex-col items-center gap-3 animate-in fade-in slide-in-from-top-2 delay-300">
            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Basierend auf Dokument:</p>
            <div className="flex flex-wrap justify-center gap-2 max-w-2xl">
                {availableDocuments.map(doc => (
                    <button
                        key={doc.id}
                        onClick={() => setSelectedDocId(doc.id)}
                        className={`px-4 py-2 rounded-xl text-[10px] font-bold transition-all border-2 ${
                            selectedDocId === doc.id 
                            ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-500 text-indigo-600 dark:text-indigo-400' 
                            : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 text-slate-400 hover:border-slate-200'
                        }`}
                    >
                        {doc.name.length > 25 ? doc.name.substring(0, 22) + '...' : doc.name}
                    </button>
                ))}
                <label className="px-4 py-2 rounded-xl text-[10px] font-bold border-2 border-dashed border-slate-200 dark:border-slate-800 text-slate-400 hover:border-indigo-400 cursor-pointer transition-all">
                    + Neu
                    <input type="file" className="hidden" onChange={e => e.target.files?.[0] && onUploadNew(e.target.files[0])} />
                </label>
            </div>
          </div>
        </div>
      </div>

      {/* Result Display Area */}
      <div className="max-w-4xl mx-auto">
        {explanation ? (
          <div className="bg-white dark:bg-slate-900 rounded-[48px] border border-slate-200 dark:border-slate-800 shadow-3d-deep p-8 sm:p-16 space-y-12 animate-in slide-in-from-bottom-8 duration-700">
            <div className="flex flex-col sm:flex-row justify-between items-start gap-4 pb-8 border-b border-slate-100 dark:border-slate-800">
               <div className="space-y-1">
                 <span className="text-[10px] font-black uppercase text-indigo-500 tracking-[0.3em]">3-Stufen-Synthese</span>
                 <h2 className="text-3xl lg:text-4xl font-black dark:text-white leading-tight">{concept}</h2>
               </div>
               <div className="flex gap-2">
                 <button 
                  onClick={() => {
                    const text = explanation;
                    navigator.clipboard.writeText(text);
                    alert("Erklärung kopiert!");
                  }}
                  className="p-3 bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-indigo-600 rounded-xl transition-all"
                  title="Kopieren"
                 >
                   <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                 </button>
                 <button 
                  onClick={() => { setExplanation(null); setConcept(''); }}
                  className="p-3 bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-rose-500 rounded-xl transition-all"
                  title="Schließen"
                 >
                   <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                 </button>
               </div>
            </div>
            
            <div className="prose dark:prose-invert max-w-none">
              <div className="whitespace-pre-wrap leading-relaxed text-slate-700 dark:text-slate-300 space-y-10">
                {explanation.split('\n\n').map((para, i) => {
                  // Basic rendering logic for headers/steps
                  if (para.match(/^(Stufe|Phase|Grundlagen|Vertiefung|Kontext|#)/i)) {
                     return (
                        <div key={i} className="mt-12 first:mt-0 space-y-4">
                            <h3 className="text-xl lg:text-2xl font-black text-slate-900 dark:text-white bg-indigo-50 dark:bg-indigo-900/20 px-6 py-2 rounded-2xl inline-block">
                                {para.replace(/^#\s*/, '')}
                            </h3>
                        </div>
                     );
                  }
                  return <p key={i} className="text-lg lg:text-xl font-medium opacity-90 leading-relaxed">{para}</p>;
                })}
              </div>
            </div>

            <div className="pt-12 border-t border-slate-50 dark:border-slate-800 flex flex-col items-center gap-6">
                <div className="bg-amber-50 dark:bg-amber-950/20 p-6 rounded-[32px] border border-amber-100 dark:border-amber-900/30 flex items-center gap-4 max-w-xl">
                    <EmojiImage emoji="🧠" size={32} />
                    <p className="text-xs font-bold text-amber-800 dark:text-amber-400 leading-relaxed italic">
                        "Wusstest du? Diese Erklärung wurde speziell auf Basis deiner gewählten Unterlagen generiert, um maximale Relevanz für dein Studium zu garantieren."
                    </p>
                </div>
                <button 
                  onClick={() => { setExplanation(null); setConcept(''); }}
                  className="text-xs font-black uppercase text-slate-400 hover:text-indigo-600 tracking-widest transition-all"
                >
                  Anderen Begriff suchen
                </button>
            </div>
          </div>
        ) : (
          !isLoading && (
            <div className="flex flex-col items-center justify-center py-12 opacity-30 text-center space-y-6 animate-in fade-in duration-1000 delay-500">
                <div className="w-24 h-24 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center">
                  <EmojiImage emoji="💡" size={48} />
                </div>
                <div className="space-y-2">
                    <p className="text-lg font-black text-slate-400 uppercase tracking-widest">Wissens-Generator</p>
                    <p className="text-sm max-w-xs mx-auto">Gib oben einen Begriff ein, den du heute meistern willst.</p>
                </div>
            </div>
          )
        )}
      </div>

      {/* Loading State Overlay (if explanation is null but loading) */}
      {isLoading && !explanation && (
        <div className="fixed inset-0 z-[100] bg-white/60 dark:bg-slate-900/60 backdrop-blur-md flex items-center justify-center animate-in fade-in duration-300">
           <div className="flex flex-col items-center gap-8 text-center p-12">
              <div className="relative">
                <div className="w-24 h-24 border-8 border-indigo-100 dark:border-slate-800 rounded-full"></div>
                <div className="w-24 h-24 border-8 border-indigo-600 border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <EmojiImage emoji="🧠" size={32} />
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">KI denkt nach...</p>
                <p className="text-slate-500 dark:text-slate-400 font-medium italic">"Analysiere Dokumente für die perfekte Erklärung"</p>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};
