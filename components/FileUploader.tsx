
import React, { useState, useMemo } from 'react';
import { QuizType, FlashcardDeck, ProcessedDocument, Collection } from '../types';
import type { GenerationSource } from '../services/geminiService';
import { EmojiImage } from './EmojiImage';
import { SourceSelector } from './SourceSelector';
import { buildCollectionSource } from '../services/collectionSource';
import { useTranslation } from '../i18n/I18nProvider';

interface FileUploaderProps {
  onDocumentSelect: (doc: ProcessedDocument, type: QuizType, options?: any) => void;
  onSourceSelect: (source: GenerationSource, name: string, type: QuizType, options?: any) => void;
  onDeckSelect: (deck: FlashcardDeck, type: QuizType, options?: any) => void;
  isLoading: boolean;
  availableDecks: FlashcardDeck[];
  documents: ProcessedDocument[];
  collections: Collection[];
  onSaveToLibrary?: (file: File) => void;
  userPlan?: 'free' | 'pro';
}

export const FileUploader: React.FC<FileUploaderProps> = ({
  onDocumentSelect,
  onSourceSelect,
  onDeckSelect,
  isLoading,
  availableDecks,
  documents,
  collections,
  onSaveToLibrary,
  userPlan = 'free',
}) => {
  const { t, tp } = useTranslation();
  const [mode, setMode] = useState<'source' | 'deck'>('source');
  // Aktives Fach: Quelle ist damit GESETZT — ein Klick startet das Quiz.
  // 'Andere Quelle wählen' blendet den normalen Wähler ein.
  const [moduleOverride, setModuleOverride] = useState(false);
  const activeModule = useMemo(() => {
    const id = localStorage.getItem('quizwise_active_module');
    return id ? collections.find(c => c.id === id) ?? null : null;
  }, [collections]);
  const folderResult = useMemo(
    () => activeModule ? buildCollectionSource(activeModule, documents) : null,
    [activeModule, documents],
  );
  const folderReady = !!folderResult && folderResult.includedCount > 0;
  const [selectedQuizType, setSelectedQuizType] = useState<QuizType>(QuizType.FAST);

  const [customCount, setCustomCount] = useState(10);
  const [customDifficulty, setCustomDifficulty] = useState<'leicht' | 'mittel' | 'schwer'>('mittel');
  const [customFocus, setCustomFocus] = useState('');

  const getOptions = () => ({ customCount, customDifficulty, customFocus });

  const quizTypes = [
    { id: QuizType.FAST, label: t('fu.qtFast'), desc: t('fu.qtFastDesc'), icon: <EmojiImage emoji="⚡" size={24} /> },
    { id: QuizType.INTENSIVE, label: t('fu.qtIntensive'), desc: t('fu.qtIntensiveDesc'), icon: <EmojiImage emoji="🧠" size={24} /> },
    { id: QuizType.CUSTOM, label: t('fu.qtCustom'), desc: t('fu.qtCustomDesc'), icon: <EmojiImage emoji="⚙️" size={24} /> },
  ];

  return (
    <div className="space-y-8 lg:space-y-12 max-w-4xl mx-auto py-6 lg:py-10 animate-in fade-in slide-in-from-bottom-12 duration-1000 px-4">
      <div className="text-center space-y-4 lg:space-y-6">
        <h1 className="text-4xl sm:text-5xl lg:text-7xl font-black text-slate-900 dark:text-white tracking-tighter leading-tight lg:leading-none">
          {t('fu.title1')} <span className="text-indigo-600 drop-shadow-lg">{t('fu.titleAccent')}</span> <EmojiImage emoji="📥" size={48} />
        </h1>
        <p className="text-lg lg:text-xl text-slate-500 dark:text-slate-400 max-w-2xl mx-auto font-medium opacity-80">
          {t('fu.subtitle')}
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
              <p className="text-[8px] sm:text-[9px] text-slate-400 font-bold leading-tight break-words">{t.desc}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Custom Options Form */}
      {selectedQuizType === QuizType.CUSTOM && (
        <div className="max-w-xl mx-auto bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl space-y-4 animate-in zoom-in-95">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-indigo-600">{t('fu.quizConfig')}</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[9px] font-bold text-slate-400 uppercase">{t('fu.questionCount', { n: customCount })}</label>
              <input type="range" min="5" max="30" step="5" value={customCount} onChange={e => setCustomCount(parseInt(e.target.value))} className="w-full accent-indigo-600" />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-bold text-slate-400 uppercase">{t('fu.difficulty')}</label>
              <select value={customDifficulty} onChange={e => setCustomDifficulty(e.target.value as any)} className="w-full p-2 bg-slate-50 dark:bg-slate-800 rounded-xl text-xs font-bold outline-none dark:text-white">
                <option value="leicht">{t('fu.diffEasy')}</option>
                <option value="mittel">{t('fu.diffMedium')}</option>
                <option value="schwer">{t('fu.diffHardExam')}</option>
              </select>
            </div>
          </div>
          <input
            type="text"
            placeholder={t('fu.focusPlaceholder')}
            value={customFocus}
            onChange={e => setCustomFocus(e.target.value)}
            className="w-full p-3 bg-slate-50 dark:bg-slate-800 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500/30 dark:text-white"
          />
        </div>
      )}

      {/* Mode Switcher */}
      <div className="flex justify-center">
        <div className="inline-flex bg-slate-200/50 dark:bg-slate-900 p-1.5 rounded-[24px] shadow-3d-pressed border border-white/40 dark:border-slate-800">
          <button
            onClick={() => setMode('source')}
            className={`px-6 sm:px-10 py-2.5 rounded-2xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${mode === 'source' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-3d-raised' : 'text-slate-400'}`}
          >
            <EmojiImage emoji="📚" size={12} /> {t('fu.source')}
          </button>
          <button
            onClick={() => setMode('deck')}
            className={`px-6 sm:px-10 py-2.5 rounded-2xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${mode === 'deck' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-3d-raised' : 'text-slate-400'}`}
          >
            <EmojiImage emoji="🗂️" size={12} /> {t('fu.deck')}
          </button>
        </div>
      </div>

      {/* Aktives Fach: Ein-Klick-Start ohne Quellen-Dialog */}
      {mode === 'source' && folderReady && !moduleOverride && activeModule && folderResult && (
        <div
          className="max-w-xl mx-auto p-6 lg:p-8 rounded-[28px] border text-center space-y-4"
          style={{ background: 'color-mix(in srgb, var(--primary) 7%, var(--bg-sidebar))', borderColor: 'color-mix(in srgb, var(--primary) 25%, transparent)' }}
        >
          <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: 'var(--primary)' }}>{t('fu.activeSubject')}</p>
          <p className="text-2xl font-black dark:text-white">{activeModule.emoji} {activeModule.name}</p>
          <p className="text-[11px] font-medium text-slate-400">
            {tp('fu.sourcesBase', folderResult.includedCount)}
            {folderResult.pendingCount > 0 && <>{t('fu.pendingProcessing', { n: folderResult.pendingCount })}</>}
          </p>
          <button
            onClick={() => onSourceSelect(folderResult.source, folderResult.name, selectedQuizType, getOptions())}
            disabled={isLoading}
            className="w-full py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
            style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
          >
            {t('fu.startQuizNow')}
          </button>
          <button
            onClick={() => setModuleOverride(true)}
            className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            {t('fu.chooseOther')}
          </button>
        </div>
      )}

      {/* Source Selection via SourceSelector */}
      {mode === 'source' && !(folderReady && !moduleOverride) && (
        <SourceSelector
          documents={documents}
          collections={collections}
          onSelectDocument={doc => onDocumentSelect(doc, selectedQuizType, getOptions())}
          onSelectSource={(source, name) => onSourceSelect(source, name, selectedQuizType, getOptions())}
          onSaveToLibrary={onSaveToLibrary}
          isLoading={isLoading}
          userPlan={userPlan}
        />
      )}

      {/* Deck Selection */}
      {mode === 'deck' && (
        <div className="bg-white dark:bg-slate-900 rounded-[40px] border border-slate-200 dark:border-slate-800 shadow-3d-deep p-6 space-y-4">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-2">{t('fu.existingDecks', { n: availableDecks.length })}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[400px] overflow-y-auto pr-2 scrollbar-thin">
            {availableDecks.length === 0 ? (
              <div className="col-span-full py-20 text-center opacity-40">
                <EmojiImage emoji="📭" size={48} className="mx-auto mb-2" />
                <p className="text-xs font-bold uppercase">{t('fu.noDecks')}</p>
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
                  <p className="font-black text-sm text-slate-900 dark:text-white group-hover:text-indigo-600 break-words">{deck.title}</p>
                  <div className="flex justify-between items-center mt-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">{t('fu.cardsN', { n: deck.cards.length })}</p>
                    <span className="text-[9px] font-black text-indigo-600 opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0">{t('fu.choose')}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {isLoading && (
        <div className="fixed inset-0 flex items-center justify-center z-[100] backdrop-blur-sm" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-main) 85%, transparent)' }}>
          <div className="flex flex-col items-center gap-6">
            <div className="w-16 h-16 rounded-full animate-spin" style={{ border: '6px solid var(--primary-soft)', borderTopColor: 'var(--primary)' }}></div>
            <p className="font-black uppercase tracking-[0.3em] text-[10px] animate-pulse" style={{ color: 'var(--primary)' }}>{t('fu.quizForming')}</p>
          </div>
        </div>
      )}
    </div>
  );
};
