
import React, { useState, useMemo } from 'react';
import { FlashcardDeck, ProcessedDocument, Collection } from '../types';
import type { GenerationSource } from '../services/geminiService';
import { EmojiImage } from './EmojiImage';
import { SourceSelector } from './SourceSelector';
import { buildCollectionSource } from '../services/collectionSource';
import { useTranslation } from '../i18n/I18nProvider';
import { PageHeader } from './PageHeader';

interface FileUploaderProps {
  // Die Auswahl führt jeweils in denselben Einstellungs-Bildschirm (QuizSetup)
  // wie der Weg über die Bibliothek; hier wird nur die Quelle gewählt.
  onDocumentSelect: (doc: ProcessedDocument) => void;
  onSourceSelect: (source: GenerationSource, name: string) => void;
  onDeckSelect: (deck: FlashcardDeck) => void;
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
  // Aktives Fach: Quelle ist damit GESETZT — ein Klick führt direkt zu den Quiz-Einstellungen.
  // 'Andere Quelle wählen' blendet den normalen Wähler ein.
  const [moduleOverride, setModuleOverride] = useState(false);
  const activeModule = useMemo(() => {
    const id = localStorage.getItem('studearc_active_module');
    return id ? collections.find(c => c.id === id) ?? null : null;
  }, [collections]);
  const folderResult = useMemo(
    () => activeModule ? buildCollectionSource(activeModule, documents) : null,
    [activeModule, documents],
  );
  const folderReady = !!folderResult && folderResult.includedCount > 0;

  return (
    <div className="space-y-8 lg:space-y-12 max-w-4xl mx-auto py-6 lg:py-10 animate-in fade-in slide-in-from-bottom-12 duration-1000 px-4">
      <PageHeader eyebrow={t('nav.quiz')} title={t('page.quiz.title')} subtitle={t('fu.subtitle')} />

      {/* Mode Switcher */}
      <div className="flex justify-center">
        <div className="inline-flex bg-slate-200/50 dark:bg-slate-900 p-1.5 rounded-[24px] shadow-3d-pressed border border-white/40 dark:border-slate-800">
          <button
            onClick={() => setMode('source')}
            className={`px-6 sm:px-10 py-2.5 rounded-2xl text-[13px] sm:text-[11px] font-semibold transition-all flex items-center gap-2 ${mode === 'source' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-3d-raised' : 'text-slate-400'}`}
          >
            <EmojiImage emoji="📚" size={12} /> {t('fu.source')}
          </button>
          <button
            onClick={() => setMode('deck')}
            className={`px-6 sm:px-10 py-2.5 rounded-2xl text-[13px] sm:text-[11px] font-semibold transition-all flex items-center gap-2 ${mode === 'deck' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-3d-raised' : 'text-slate-400'}`}
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
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--primary-ink)' }}>{t('fu.activeSubject')}</p>
          <p className="text-2xl font-black dark:text-white">{activeModule.emoji} {activeModule.name}</p>
          <p className="text-[11px] font-medium text-slate-400">
            {tp('fu.sourcesBase', folderResult.includedCount)}
            {folderResult.pendingCount > 0 && <>{t('fu.pendingProcessing', { n: folderResult.pendingCount })}</>}
          </p>
          <button
            onClick={() => onSourceSelect(folderResult.source, folderResult.name)}
            disabled={isLoading}
            className="w-full py-4 rounded-2xl text-[13px] font-semibold transition-all hover:scale-[1.02] disabled:opacity-40"
            style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
          >
            {t('fu.startQuizNow')}
          </button>
          <button
            onClick={() => setModuleOverride(true)}
            className="text-[13px] font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            {t('fu.chooseOther')}
          </button>
        </div>
      )}

      {/* Source Selection via SourceSelector — Bug-Fix 2026-09-10: zeigte bisher
          immer alle Dokumente kontoweit, auch mit aktivem Fach + "Andere Quelle
          wählen" (activeModule kommt oben schon aus dem Fach-Kontext). */}
      {mode === 'source' && !(folderReady && !moduleOverride) && (
        <SourceSelector
          documents={activeModule ? documents.filter(d => d.collectionId === activeModule.id) : documents}
          collections={collections}
          onSelectDocument={onDocumentSelect}
          onSelectSource={(source, name) => onSourceSelect(source, name)}
          onSaveToLibrary={onSaveToLibrary}
          isLoading={isLoading}
          userPlan={userPlan}
        />
      )}

      {/* Deck Selection */}
      {mode === 'deck' && (
        <div className="bg-white dark:bg-slate-900 rounded-[28px] border border-slate-200 dark:border-slate-800 shadow-3d-deep p-6 space-y-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400 px-2">{t('fu.existingDecks', { n: availableDecks.length })}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[400px] overflow-y-auto pr-2 scrollbar-thin">
            {availableDecks.length === 0 ? (
              <div className="col-span-full py-20 text-center opacity-40">
                <EmojiImage emoji="📭" size={48} className="mx-auto mb-2" />
                <p className="text-xs font-bold">{t('fu.noDecks')}</p>
              </div>
            ) : (
              availableDecks.map(deck => (
                <button
                  key={deck.id}
                  onClick={() => onDeckSelect(deck)}
                  disabled={isLoading}
                  className="p-5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border-2 border-transparent hover:border-indigo-500 text-left transition-all group relative overflow-hidden"
                >
                  <div className="absolute top-0 left-0 w-1 h-full bg-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <p className="font-black text-sm text-slate-900 dark:text-white group-hover:text-indigo-600 break-words">{deck.title}</p>
                  <div className="flex justify-between items-center mt-1">
                    <p className="text-[11px] font-bold text-slate-400 uppercase">{t('fu.cardsN', { n: deck.cards.length })}</p>
                    <span className="text-[11px] font-semibold text-indigo-600 opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0">{t('fu.choose')}</span>
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
            <p className="font-semibold text-xs animate-pulse" style={{ color: 'var(--primary-ink)' }}>{t('fu.quizForming')}</p>
          </div>
        </div>
      )}
    </div>
  );
};
