
import React, { useState } from 'react';
import { SearchResult } from '../types';
import { EmojiImage } from './EmojiImage';

interface ScholarSearchProps {
  onSearch: (query: string) => void;
  onGenerateQuiz: (result: SearchResult) => void;
  onSaveToPaper: (result: SearchResult) => void;
  results: SearchResult[];
  summary?: string;
  savedResults?: SearchResult[];
  isSearching: boolean;
}

export const ScholarSearch: React.FC<ScholarSearchProps> = ({ 
  onSearch, 
  onGenerateQuiz, 
  onSaveToPaper,
  results, 
  summary,
  savedResults = [],
  isSearching 
}) => {
  const [query, setQuery] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query.trim());
    }
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const copyToClipboard = (text: string) => {
    if (!text) return showToast("Zitation nicht verfügbar");
    navigator.clipboard.writeText(text);
    showToast('Zitation kopiert!');
  };

  const handleSave = (result: SearchResult) => {
    onSaveToPaper(result);
    showToast('Quelle in Hausarbeit gesichert!');
  };

  const isSaved = (url: string) => savedResults.some(s => s.url === url);

  return (
    <div className="space-y-8 lg:space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700 relative py-6 lg:py-10 px-4">
      {toast && (
        <div className="fixed top-8 sm:top-20 right-4 sm:right-8 z-[100] bg-indigo-600 text-white px-6 py-3 rounded-2xl shadow-3d-deep font-black uppercase text-[10px] tracking-widest animate-in slide-in-from-right-4">
          <div className="flex items-center gap-3">
            <EmojiImage emoji="✨" size={16} /> {toast}
          </div>
        </div>
      )}

      <div className="text-center space-y-4 lg:space-y-6">
        <h1 className="text-4xl lg:text-6xl font-black text-slate-900 dark:text-white tracking-tighter">
          Akademische <span className="text-indigo-600">Recherche</span> <EmojiImage emoji="🌐" size={48} />
        </h1>
        <p className="text-sm lg:text-xl text-slate-500 dark:text-slate-400 max-w-2xl mx-auto font-medium opacity-80">
          Wissenschaftlich fundiertes Grounding aus validen Datenbanken.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="relative max-w-3xl mx-auto group">
        <div className="absolute -inset-1 bg-indigo-500/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-[24px] sm:rounded-[32px]"></div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Fachbegriff oder Thema recherchieren..."
          className="relative w-full pl-6 sm:pl-16 pr-24 sm:pr-40 py-5 sm:py-6 bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-2xl sm:rounded-[32px] shadow-3d-raised focus:border-indigo-500 outline-none transition-all text-base sm:text-xl text-slate-900 dark:text-white font-medium"
        />
        <button
          type="submit"
          disabled={isSearching || !query.trim()}
          className="absolute right-3 top-1/2 -translate-y-1/2 bg-indigo-600 text-white px-6 sm:px-8 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl font-black uppercase text-[9px] sm:text-[11px] tracking-widest hover:scale-105 active:scale-95 transition-all shadow-lg disabled:opacity-50"
        >
          {isSearching ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
          ) : 'Suchen'}
        </button>
      </form>

      {!isSearching && results.length > 0 && (
        <div className="grid grid-cols-1 gap-6 lg:gap-8 max-w-5xl mx-auto">
          <p className="text-[9px] sm:text-[11px] font-black uppercase text-slate-400 tracking-[0.3em] px-2">{results.length} Verifizierte Quellen</p>
          {results.map((result, i) => (
            <div 
              key={i} 
              className="group bg-white dark:bg-slate-900 p-6 sm:p-10 rounded-3xl sm:rounded-[40px] border border-slate-200 dark:border-slate-800 shadow-3d-raised transition-all flex flex-col gap-4 lg:gap-6 relative"
            >
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 text-[8px] sm:text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest flex items-center gap-1">
                    Geprüfte Quelle <EmojiImage emoji="🎓" size={12} />
                  </span>
                  {result.openalex_id && (
                    <span className="bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[8px] sm:text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest">
                      ID: {result.openalex_id}
                    </span>
                  )}
                  {isSaved(result.url) && (
                    <span className="bg-emerald-500 text-white text-[8px] sm:text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest">
                      ✓ Gesichert
                    </span>
                  )}
                </div>

                <div className="space-y-2">
                  <h4 className="text-lg sm:text-2xl font-black text-slate-900 dark:text-slate-100 leading-tight">
                    {result.title}
                  </h4>
                  <p className="text-[10px] sm:text-xs font-black uppercase text-indigo-500 tracking-widest">
                    {result.authors} ({result.year}) • {result.journal || "Wissenschaftliche Publikation"}
                  </p>
                </div>

                {result.abstract && (
                  <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <p className="text-[9px] font-black uppercase text-slate-400 mb-2 tracking-widest">Abstract / Auszug</p>
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed italic">
                      "{result.abstract}"
                    </p>
                  </div>
                )}

                {result.doi && (
                  <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">
                    DOI: <span className="text-indigo-600 dark:text-indigo-400 select-all">{result.doi}</span>
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-2 mt-2 pt-4 border-t border-slate-50 dark:border-slate-800">
                <button
                  onClick={() => onGenerateQuiz(result)}
                  className="flex-grow bg-indigo-600 text-white px-4 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest active:scale-95 transition-all"
                >
                  Daraus lernen (Quiz) <EmojiImage emoji="🎯" size={12} />
                </button>
                <button
                  onClick={() => handleSave(result)}
                  disabled={isSaved(result.url)}
                  className={`flex-grow px-4 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
                    isSaved(result.url) 
                    ? 'bg-emerald-500 text-white' 
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-emerald-600 hover:text-white'
                  }`}
                >
                  Quelle sichern <EmojiImage emoji="📝" size={12} />
                </button>
                <button
                  onClick={() => copyToClipboard(result.apaCitation)}
                  className="bg-slate-50 dark:bg-slate-800/50 text-slate-400 p-3 rounded-xl text-[9px] font-black uppercase hover:text-indigo-600 transition-all border border-transparent hover:border-indigo-200"
                >
                  Zitieren (APA)
                </button>
                <a 
                  href={result.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className={`bg-slate-50 dark:bg-slate-800/50 text-slate-400 p-3 rounded-xl text-[9px] font-black uppercase flex items-center justify-center hover:text-indigo-600 ${result.url === '#' ? 'opacity-30 cursor-not-allowed' : ''}`}
                >
                  Link öffnen <EmojiImage emoji="🔗" size={12} />
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
