import React, { useState } from 'react';
import { SearchResult } from '../types';
import { EmojiImage } from './EmojiImage';
import { ChevronDown, ChevronUp, ExternalLink, BookOpen, GraduationCap, Copy, Check } from 'lucide-react';

interface ScholarSearchProps {
  onSearch: (query: string) => void;
  onSearchWeb: (query: string) => void;
  onGenerateQuiz: (result: SearchResult) => void;
  onSaveToPaper: (result: SearchResult) => void;
  results: SearchResult[];
  summary?: string;
  savedResults?: SearchResult[];
  isSearching: boolean;
}

export const ScholarSearch: React.FC<ScholarSearchProps> = ({
  onSearch,
  onSearchWeb,
  onGenerateQuiz,
  onSaveToPaper,
  results,
  savedResults = [],
  isSearching
}) => {
  const [query, setQuery] = useState('');
  const [searchMode, setSearchMode] = useState<'web' | 'scholar'>('web');
  const [lastSearchMode, setLastSearchMode] = useState<'web' | 'scholar' | null>(null);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      setExpandedIndex(null);
      setLastSearchMode(searchMode);
      if (searchMode === 'scholar') {
        onSearch(query.trim());
      } else {
        onSearchWeb(query.trim());
      }
    }
  };

  const handleModeChange = (mode: 'web' | 'scholar') => {
    setSearchMode(mode);
    setExpandedIndex(null);
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const handleCopy = (result: SearchResult, index: number) => {
    if (!result.apaCitation) return showToast('Zitation nicht verfügbar');
    navigator.clipboard.writeText(result.apaCitation);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleSave = (result: SearchResult) => {
    onSaveToPaper(result);
    showToast('Quelle gesichert!');
  };

  const isSaved = (url: string) => savedResults.some(s => s.url === url);

  return (
    <div className="space-y-8 animate-in fade-in duration-700 py-6 px-4 relative">
      {toast && (
        <div className="fixed top-8 right-4 z-[100] bg-indigo-600 text-white px-5 py-3 rounded-2xl shadow-3d-deep font-black uppercase text-[10px] tracking-widest animate-in slide-in-from-right-4">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="text-center space-y-3">
        <h1 className="text-4xl lg:text-6xl font-black text-slate-900 dark:text-white tracking-tighter">
          {searchMode === 'scholar'
            ? <>Akademische <span className="text-indigo-600">Recherche</span></>
            : <>Web<span className="text-indigo-600">suche</span></>
          }
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
          {searchMode === 'scholar'
            ? 'Wissenschaftlich fundiertes Grounding aus validen Datenbanken.'
            : 'Allgemeinwissen aus Wikipedia – für Schüler & Studenten.'}
        </p>
      </div>

      {/* Mode Tabs */}
      <div className="flex items-center justify-center gap-1 max-w-xs mx-auto bg-slate-100 dark:bg-slate-800/50 rounded-2xl p-1">
        <button
          type="button"
          onClick={() => handleModeChange('web')}
          className="flex-1 py-2 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
          style={searchMode === 'web'
            ? { background: 'var(--primary)', color: 'white' }
            : { background: 'transparent', color: 'var(--text-secondary)' }
          }
        >
          Web
        </button>
        <button
          type="button"
          onClick={() => handleModeChange('scholar')}
          className="flex-1 py-2 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
          style={searchMode === 'scholar'
            ? { background: 'var(--primary)', color: 'white' }
            : { background: 'transparent', color: 'var(--text-secondary)' }
          }
        >
          Scholar
        </button>
      </div>

      {/* Search */}
      <form onSubmit={handleSubmit} className="relative max-w-3xl mx-auto group">
        <div className="absolute -inset-1 bg-indigo-500/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-[32px]" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={searchMode === 'scholar' ? 'Fachbegriff oder Thema recherchieren...' : 'Thema oder Begriff suchen...'}
          className="relative w-full pl-6 pr-36 py-5 bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-[28px] shadow-3d-raised focus:border-indigo-500 outline-none transition-all text-lg text-slate-900 dark:text-white font-medium"
        />
        <button
          type="submit"
          disabled={isSearching || !query.trim()}
          className="absolute right-3 top-1/2 -translate-y-1/2 bg-indigo-600 text-white px-6 py-2.5 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:scale-105 active:scale-95 transition-all shadow-lg disabled:opacity-50"
        >
          {isSearching ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : 'Suchen'}
        </button>
      </form>

      {/* Loading */}
      {isSearching && (
        <div className="flex flex-col items-center justify-center py-16 space-y-4">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-indigo-100 dark:border-indigo-900/30 rounded-full" />
            <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin absolute top-0 left-0" />
          </div>
          <p className="text-sm font-black uppercase tracking-widest text-slate-400">Quellen werden geprüft...</p>
        </div>
      )}

      {/* Results — compact list */}
      {!isSearching && results.length > 0 && lastSearchMode === searchMode && (
        <div className="max-w-4xl mx-auto space-y-3">
          <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.3em] px-1">
            {results.length} {searchMode === 'scholar' ? 'verifizierte Quellen' : 'Ergebnisse'}
          </p>

          {results.map((result, i) => {
            const expanded = expandedIndex === i;
            const saved = isSaved(result.url);
            const copied = copiedIndex === i;

            return (
              <div
                key={i}
                className="rounded-2xl border transition-all duration-200"
                style={{
                  background: 'var(--bg-sidebar)',
                  borderColor: expanded ? 'var(--primary)' : 'var(--border-color)',
                }}
              >
                {/* Collapsed row — always visible */}
                <div
                  className="flex items-center gap-4 p-4 cursor-pointer select-none"
                  onClick={() => setExpandedIndex(expanded ? null : i)}
                >
                  {/* Number */}
                  <span
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0 transition-colors"
                    style={expanded
                      ? { background: 'var(--primary)', color: 'white' }
                      : { background: 'var(--border-color)', color: 'var(--text-main)' }
                    }
                  >
                    {i + 1}
                  </span>

                  {/* Title + meta */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate leading-tight">
                      {result.title}
                    </p>
                    <p className="text-[10px] text-slate-400 truncate mt-0.5">
                      {result.authors} · {result.year}{result.journal ? ` · ${result.journal}` : ''}
                    </p>
                  </div>

                  {/* Quick actions — always visible */}
                  <div className="flex items-center gap-2 shrink-0">
                    {saved && (
                      <span className="text-[8px] font-black uppercase text-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-1 rounded-lg">
                        Gesichert
                      </span>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleSave(result); }}
                      disabled={saved}
                      title="Quelle sichern"
                      className="w-8 h-8 rounded-xl flex items-center justify-center transition-all hover:scale-110 active:scale-95 disabled:opacity-40"
                      style={{ background: saved ? '#10b981' : 'var(--border-color)', color: saved ? 'white' : 'var(--text-main)' }}
                    >
                      <BookOpen className="w-3.5 h-3.5" strokeWidth={2} />
                    </button>
                    {!result.isWeb && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleCopy(result, i); }}
                        title="APA kopieren"
                        className="w-8 h-8 rounded-xl flex items-center justify-center transition-all hover:scale-110 active:scale-95"
                        style={{ background: 'var(--border-color)', color: copied ? '#10b981' : 'var(--text-main)' }}
                      >
                        {copied ? <Check className="w-3.5 h-3.5" strokeWidth={2.5} /> : <Copy className="w-3.5 h-3.5" strokeWidth={2} />}
                      </button>
                    )}
                    {result.url !== '#' && (
                      <a
                        href={result.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        title="Link öffnen"
                        className="w-8 h-8 rounded-xl flex items-center justify-center transition-all hover:scale-110 active:scale-95"
                        style={{ background: 'var(--border-color)', color: 'var(--text-main)' }}
                      >
                        <ExternalLink className="w-3.5 h-3.5" strokeWidth={2} />
                      </a>
                    )}
                    {expanded
                      ? <ChevronUp className="w-4 h-4 text-slate-400 ml-1" strokeWidth={2} />
                      : <ChevronDown className="w-4 h-4 text-slate-400 ml-1" strokeWidth={2} />
                    }
                  </div>
                </div>

                {/* Expanded detail */}
                {expanded && (
                  <div className="px-4 pb-4 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="h-px" style={{ background: 'var(--border-color)' }} />

                    {result.isWeb ? (
                      <div className="rounded-xl p-4" style={{ background: 'color-mix(in srgb, var(--border-color) 50%, var(--bg-sidebar))' }}>
                        <p className="text-[9px] font-black uppercase text-slate-400 mb-2 tracking-widest">Zusammenfassung</p>
                        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                          {result.snippet}
                        </p>
                      </div>
                    ) : (
                      <>
                        {result.abstract && (
                          <div className="rounded-xl p-4" style={{ background: 'color-mix(in srgb, var(--border-color) 50%, var(--bg-sidebar))' }}>
                            <p className="text-[9px] font-black uppercase text-slate-400 mb-2 tracking-widest">Abstract</p>
                            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed italic">
                              "{result.abstract}"
                            </p>
                          </div>
                        )}
                        {result.doi && (
                          <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">
                            DOI: <span className="text-indigo-600 dark:text-indigo-400 select-all normal-case">{result.doi}</span>
                          </p>
                        )}
                      </>
                    )}

                    <button
                      onClick={() => onGenerateQuiz(result)}
                      className="w-full py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-white transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2"
                      style={{ background: 'var(--primary)' }}
                    >
                      <GraduationCap className="w-4 h-4" strokeWidth={2} />
                      Daraus lernen — Quiz generieren
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
