
import React, { useRef, useState } from 'react';
import { QuizType, FlashcardDeck } from '../types';
import { EmojiImage } from './EmojiImage';

interface FileUploaderProps {
  onFileSelect: (file: File, type: QuizType, options?: any) => void;
  onTextSubmit: (text: string, type: QuizType, options?: any) => void;
  onDeckSelect: (deck: FlashcardDeck, type: QuizType, options?: any) => void;
  isLoading: boolean;
  availableDecks: FlashcardDeck[];
}

export const FileUploader: React.FC<FileUploaderProps> = ({ 
  onFileSelect, 
  onTextSubmit, 
  onDeckSelect,
  isLoading, 
  availableDecks 
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [mode, setMode] = useState<'file' | 'text' | 'deck'>('file');
  const [selectedQuizType, setSelectedQuizType] = useState<QuizType>(QuizType.FAST);
  const [pastedText, setPastedText] = useState('');
  
  // Custom Options State
  const [customCount, setCustomCount] = useState(10);
  const [customDifficulty, setCustomDifficulty] = useState<'leicht' | 'mittel' | 'schwer'>('mittel');
  const [customFocus, setCustomFocus] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const getOptions = () => ({
    customCount,
    customDifficulty,
    customFocus
  });

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFileSelect(e.dataTransfer.files[0], selectedQuizType, getOptions());
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileSelect(e.target.files[0], selectedQuizType, getOptions());
    }
  };

  const quizTypes = [
    { id: QuizType.FAST, label: 'Schnell', desc: '5-10 Fragen', icon: <EmojiImage emoji="⚡" size={24} /> },
    { id: QuizType.INTENSIVE, label: 'Intensiv', desc: '15-20 Fragen', icon: <EmojiImage emoji="🧠" size={24} /> },
    { id: QuizType.CUSTOM, label: 'Individuell', desc: 'Eigene Regeln', icon: <EmojiImage emoji="⚙️" size={24} /> },
  ];

  return (
    <div className="space-y-8 lg:space-y-12 max-w-4xl mx-auto py-6 lg:py-10 animate-in fade-in slide-in-from-bottom-12 duration-1000 px-4">
      <div className="text-center space-y-4 lg:space-y-6">
        <h1 className="text-4xl sm:text-5xl lg:text-7xl font-black text-slate-900 dark:text-white tracking-tighter leading-tight lg:leading-none">
          Dein <span className="text-indigo-600 drop-shadow-lg">Wissenstest</span> <EmojiImage emoji="📥" size={48} />
        </h1>
        <p className="text-lg lg:text-xl text-slate-500 dark:text-slate-400 max-w-2xl mx-auto font-medium opacity-80">
          Wähle eine Quelle und konfiguriere dein Quiz.
        </p>
      </div>

      {/* Quiz Type Selector */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4 max-w-xl mx-auto">
        {quizTypes.map((t) => (
          <button
            key={t.id}
            onClick={() => setSelectedQuizType(t.id)}
            className={`p-3 sm:p-4 rounded-2xl border-2 transition-all text-left flex flex-col gap-1 sm:gap-2 ${
              selectedQuizType === t.id 
                ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 ring-4 ring-indigo-500/10' 
                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-indigo-300'
            }`}
          >
            <div className="flex justify-between items-center">
              {t.icon}
              <div className={`w-3 h-3 sm:w-4 sm:h-4 rounded-full border-2 ${selectedQuizType === t.id ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'}`}></div>
            </div>
            <div>
              <p className="font-black text-[10px] sm:text-xs uppercase tracking-wider dark:text-white">{t.label}</p>
              <p className="text-[8px] sm:text-[9px] text-slate-400 font-bold leading-tight line-clamp-1">{t.desc}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Mode Switcher */}
      <div className="flex justify-center">
        <div className="inline-flex bg-slate-200/50 dark:bg-slate-900 p-1.5 rounded-[24px] shadow-3d-pressed border border-white/40 dark:border-slate-800">
          <button 
            onClick={() => setMode('file')}
            className={`px-4 sm:px-8 py-2.5 rounded-2xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${mode === 'file' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-3d-raised' : 'text-slate-400'}`}
          >
            <EmojiImage emoji="📁" size={12} /> Datei
          </button>
          <button 
            onClick={() => setMode('text')}
            className={`px-4 sm:px-8 py-2.5 rounded-2xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${mode === 'text' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-3d-raised' : 'text-slate-400'}`}
          >
            <EmojiImage emoji="⌨️" size={12} /> Text
          </button>
          <button 
            onClick={() => setMode('deck')}
            className={`px-4 sm:px-8 py-2.5 rounded-2xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${mode === 'deck' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-3d-raised' : 'text-slate-400'}`}
          >
            <EmojiImage emoji="🗂️" size={12} /> Stapel
          </button>
        </div>
      </div>

      {/* Custom Options Form (if Custom mode is selected) */}
      {selectedQuizType === QuizType.CUSTOM && (
        <div className="max-w-xl mx-auto bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl space-y-4 animate-in zoom-in-95">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-indigo-600">Quiz-Konfiguration</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[9px] font-bold text-slate-400 uppercase">Anzahl Fragen: {customCount}</label>
              <input type="range" min="5" max="30" step="5" value={customCount} onChange={e => setCustomCount(parseInt(e.target.value))} className="w-full accent-indigo-600" />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-bold text-slate-400 uppercase">Schwierigkeit</label>
              <select value={customDifficulty} onChange={e => setCustomDifficulty(e.target.value as any)} className="w-full p-2 bg-slate-50 dark:bg-slate-800 rounded-xl text-xs font-bold outline-none dark:text-white">
                <option value="leicht">Leicht</option>
                <option value="mittel">Mittel</option>
                <option value="schwer">Schwer (Klausurniveau)</option>
              </select>
            </div>
          </div>
          <input 
            type="text" 
            placeholder="Schwerpunkt (z.B. Kapitel 1-3, nur Definitionen...)" 
            value={customFocus}
            onChange={e => setCustomFocus(e.target.value)}
            className="w-full p-3 bg-slate-50 dark:bg-slate-800 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500/30 dark:text-white"
          />
        </div>
      )}

      {/* Main Area based on Mode */}
      <div className="min-h-[300px] flex flex-col">
        {mode === 'file' && (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !isLoading && fileInputRef.current?.click()}
            className={`
              flex-grow relative cursor-pointer group rounded-[40px] lg:rounded-[64px] border-4 border-dashed transition-all duration-500 p-12 flex flex-col items-center justify-center gap-6 lg:gap-10
              ${isDragging 
                ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/10 shadow-3d-pressed' 
                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-3d-raised hover:shadow-3d-deep'}
              ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".pdf,.txt,.md,.doc,.docx" disabled={isLoading} />
            <div className="w-20 h-20 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 rounded-[30px] flex items-center justify-center group-hover:scale-110 transition-transform">
              {isDragging ? <EmojiImage emoji="✨" size={40} /> : <EmojiImage emoji="📄" size={40} />}
            </div>
            <p className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">
              {isDragging ? 'LOSLASSEN' : 'DATEI WÄHLEN'}
            </p>
          </div>
        )}

        {mode === 'text' && (
          <div className="bg-white dark:bg-slate-900 rounded-[40px] border border-slate-200 dark:border-slate-800 shadow-3d-deep p-6 space-y-6">
            <textarea
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              placeholder="Inhalt hier einfügen..."
              className="w-full h-[250px] bg-slate-50 dark:bg-slate-800 rounded-3xl p-6 outline-none transition-all dark:text-white text-base resize-none"
            />
            <button
              onClick={() => onTextSubmit(pastedText, selectedQuizType, getOptions())}
              disabled={isLoading || pastedText.length < 20}
              className="w-full bg-indigo-600 text-white font-black py-4 rounded-2xl shadow-xl transition-all uppercase tracking-widest text-[11px] disabled:opacity-30"
            >
              Quiz aus Text starten <EmojiImage emoji="✨" size={16} />
            </button>
          </div>
        )}

        {mode === 'deck' && (
          <div className="bg-white dark:bg-slate-900 rounded-[40px] border border-slate-200 dark:border-slate-800 shadow-3d-deep p-6 space-y-4">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-2">Vorhandene Stapel ({availableDecks.length})</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[400px] overflow-y-auto pr-2 scrollbar-thin">
              {availableDecks.length === 0 ? (
                <div className="col-span-full py-20 text-center opacity-40">
                  <EmojiImage emoji="📭" size={48} className="mx-auto mb-2" />
                  <p className="text-xs font-bold uppercase">Noch keine Stapel vorhanden</p>
                </div>
              ) : (
                availableDecks.map(deck => (
                  <button
                    key={deck.id}
                    onClick={() => onDeckSelect(deck, selectedQuizType, getOptions())}
                    disabled={isLoading}
                    className="p-5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border-2 border-transparent hover:border-indigo-500 text-left transition-all active:scale-95 group relative overflow-hidden"
                  >
                    <div className="absolute top-0 left-0 w-1 h-full bg-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <p className="font-black text-sm text-slate-900 dark:text-white group-hover:text-indigo-600 truncate">{deck.title}</p>
                    <div className="flex justify-between items-center mt-1">
                       <p className="text-[10px] font-bold text-slate-400 uppercase">{deck.cards.length} Karten</p>
                       <span className="text-[9px] font-black text-indigo-600 opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0">WÄHLEN →</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {isLoading && (
        <div className="fixed inset-0 flex items-center justify-center bg-white/80 dark:bg-slate-900/80 z-[100] backdrop-blur-sm">
          <div className="flex flex-col items-center gap-6">
            <div className="w-16 h-16 border-8 border-indigo-100 dark:border-slate-800 border-t-indigo-600 rounded-full animate-spin"></div>
            <p className="text-indigo-600 font-black uppercase tracking-[0.3em] text-[10px] animate-pulse">KI generiert dein Quiz...</p>
          </div>
        </div>
      )}
    </div>
  );
};
