
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Flashcard } from '../types';
import { reviewCard, migrateLegacyCard, ReviewQuality, QUALITY_MAP } from '../services/spacedRepetition';

interface FlashcardPlayerProps {
  cards: Flashcard[];
  onReview: (cardId: string, difficulty: 'again' | 'hard' | 'good' | 'easy') => void;
  onClose: () => void;
  // Freies Üben: alle Karten beliebig oft, OHNE die SRS-Planung zu verändern.
  practiceMode?: boolean;
  onPracticed?: () => void;
}

export const FlashcardPlayer: React.FC<FlashcardPlayerProps> = ({ cards, onReview, onClose, practiceMode = false, onPracticed }) => {
  const [remainingCards, setRemainingCards] = useState<Flashcard[]>(() => [...cards]);
  const [completed, setCompleted] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);

  const currentCard = remainingCards[0];

  const handleDifficulty = useCallback((diff: 'again' | 'hard' | 'good' | 'easy') => {
    if (!showAnswer || !currentCard) return;

    if (practiceMode) {
      onPracticed?.();           // nur Streak, KEINE SRS-Änderung
    } else {
      onReview(currentCard.id, diff);
    }
    setShowAnswer(false);

    if (diff === 'again') {
      // Re-queue at end. Im Übungsmodus ohne SRS-Änderung, sonst mit aktualisiertem
      // srs, damit die Intervall-Vorschau stimmt.
      setRemainingCards(r => {
        const card = r[0];
        if (practiceMode) return [...r.slice(1), card];
        const currentSrs = card.srs ?? migrateLegacyCard(card);
        const nextSrs = reviewCard(currentSrs, ReviewQuality.BLACKOUT);
        return [...r.slice(1), { ...card, srs: nextSrs }];
      });
    } else {
      if (remainingCards.length <= 1) {
        onClose();
      } else {
        setRemainingCards(r => r.slice(1));
        setCompleted(c => c + 1);
      }
    }
  }, [showAnswer, currentCard, remainingCards, onReview, onClose, practiceMode, onPracticed]);

  // Keyboard Support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        if (!showAnswer) setShowAnswer(true);
        else handleDifficulty('good');
      } else if (showAnswer) {
        if (e.key === '1') handleDifficulty('again');
        if (e.key === '2') handleDifficulty('hard');
        if (e.key === '3') handleDifficulty('good');
        if (e.key === '4') handleDifficulty('easy');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showAnswer, handleDifficulty]);

  const stats = useMemo(() => {
    const newCount = remainingCards.filter(c => !c.srs?.lastReview).length;
    const learnCount = remainingCards.filter(c => c.srs?.lastReview && c.srs.interval < 7).length;
    const reviewCount = remainingCards.filter(c => c.srs?.lastReview && c.srs.interval >= 7).length;
    return { newCount, learnCount, reviewCount, remaining: remainingCards.length };
  }, [remainingCards]);

  const getIntervalLabel = (diff: string, card: Flashcard): string => {
    if (diff === 'again') return '< 1m';
    const srs = card.srs ?? migrateLegacyCard(card);
    const next = reviewCard(srs, QUALITY_MAP[diff as keyof typeof QUALITY_MAP] ?? ReviewQuality.GOOD);
    const days = next.interval;
    if (days < 1) return '< 1d';
    if (days === 1) return '1d';
    if (days < 30) return `${days}d`;
    const weeks = Math.round(days / 7);
    if (weeks < 8) return `${weeks}w`;
    return `${Math.round(days / 30)}mo`;
  };

  const total = completed + remainingCards.length;
  const progress = total > 0 ? (completed / total) * 100 : 0;

  if (!currentCard) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-[#f8fafc] dark:bg-[#020617] flex flex-col animate-in fade-in duration-300">
      {/* Anki Header */}
      <div className="p-4 md:p-6 px-4 md:px-12 flex justify-between items-center bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-sm">
        {practiceMode ? (
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full">
              <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
              Frei üben
            </span>
            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest hidden sm:inline">Zählt nicht für den Fälligkeitsplan · {stats.remaining} übrig</span>
          </div>
        ) : (
        <div className="flex gap-4 md:gap-8">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-black text-blue-500 uppercase tracking-widest">{stats.newCount}</span>
            <span className="text-[8px] font-bold text-slate-300 uppercase tracking-widest">Neu</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-black text-rose-500 uppercase tracking-widest">{stats.learnCount}</span>
            <span className="text-[8px] font-bold text-slate-300 uppercase tracking-widest">Lernen</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-black text-emerald-500 uppercase tracking-widest">{stats.reviewCount}</span>
            <span className="text-[8px] font-bold text-slate-300 uppercase tracking-widest">Fällig</span>
          </div>
        </div>
        )}
        <button aria-label="Lernsession schließen"
          onClick={onClose}
          className="text-slate-400 hover:text-rose-500 transition-colors p-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>

      {/* Main Study Area */}
      <div className="flex-grow flex flex-col items-center justify-center p-4 md:p-8 overflow-y-auto">
        <div className="w-full max-w-4xl space-y-8 md:space-y-16 py-6 md:py-12">

          {/* Front of Card */}
          <div className="text-center animate-in fade-in slide-in-from-top-4 duration-500 px-2 md:px-8">
            <h2 className="text-2xl sm:text-3xl md:text-5xl font-medium text-slate-900 dark:text-slate-100 leading-snug break-words">
              {currentCard.front}
            </h2>
          </div>

          {/* Back of Card (Shown after click) */}
          {showAnswer && (
            <div className="space-y-8 md:space-y-16 animate-in fade-in zoom-in-95 duration-300 border-t border-slate-100 dark:border-slate-800 pt-8 md:pt-16 px-2 md:px-8">
              <div className="text-center">
                <p className="text-xl sm:text-2xl md:text-4xl font-bold leading-relaxed break-words" style={{ color: 'var(--primary)' }}>
                  {currentCard.back}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Anki Controls Footer */}
      <div className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-4 md:px-8 py-6 md:py-10">
        <div className="max-w-4xl mx-auto flex flex-col items-center gap-6 md:gap-8">

          {!showAnswer ? (
            <button
              onClick={() => setShowAnswer(true)}
              className="bg-slate-900 dark:bg-slate-700 text-white px-8 md:px-20 py-5 md:py-6 rounded-2xl font-black uppercase tracking-[0.2em] md:tracking-[0.3em] text-xs md:text-sm shadow-2xl hover:scale-105 active:scale-95 transition-all w-full md:w-auto md:min-w-[350px]"
            >
              Antwort anzeigen
            </button>
          ) : practiceMode ? (
            <div className="grid grid-cols-2 gap-3 sm:gap-4 w-full max-w-xl">
              <button
                onClick={() => handleDifficulty('again')}
                className="group flex flex-col items-center gap-2"
              >
                <div className="w-full bg-rose-500 text-white py-4 md:py-5 rounded-xl md:rounded-2xl font-black uppercase text-[10px] md:text-xs tracking-widest shadow-lg hover:brightness-110 active:scale-95 transition-all">
                  Nochmal
                </div>
                <span className="text-[8px] md:text-[9px] font-bold text-slate-300 opacity-60">Taste 1</span>
              </button>
              <button
                onClick={() => handleDifficulty('good')}
                className="group flex flex-col items-center gap-2"
              >
                <div className="w-full bg-emerald-500 text-white py-4 md:py-5 rounded-xl md:rounded-2xl font-black uppercase text-[10px] md:text-xs tracking-widest shadow-lg hover:brightness-110 active:scale-95 transition-all">
                  Gewusst
                </div>
                <span className="text-[8px] md:text-[9px] font-bold text-slate-300 opacity-60">Taste 3 / Space</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-2 sm:gap-4 w-full">
              {[
                { id: 'again', label: 'Nochmal', color: 'bg-rose-500', key: '1', interval: getIntervalLabel('again', currentCard) },
                { id: 'hard',  label: 'Schwer',  color: 'bg-amber-500', key: '2', interval: getIntervalLabel('hard', currentCard) },
                { id: 'good',  label: 'Gut',     color: 'bg-emerald-500', key: '3', interval: getIntervalLabel('good', currentCard) },
                { id: 'easy',  label: 'Einfach', color: 'bg-blue-500',   key: '4', interval: getIntervalLabel('easy', currentCard) }
              ].map(btn => (
                <button
                  key={btn.id}
                  onClick={() => handleDifficulty(btn.id as 'again' | 'hard' | 'good' | 'easy')}
                  className="group flex flex-col items-center gap-2"
                >
                  <span className="text-[9px] md:text-[10px] font-black text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white transition-colors uppercase tracking-widest">{btn.interval}</span>
                  <div className={`w-full ${btn.color} text-white py-4 md:py-5 rounded-xl md:rounded-2xl font-black uppercase text-[9px] md:text-[10px] tracking-wider md:tracking-widest shadow-lg hover:brightness-110 active:scale-95 transition-all`}>
                    {btn.label}
                  </div>
                  <span className="text-[8px] md:text-[9px] font-bold text-slate-300 opacity-60 text-center leading-tight">
                    <span className="md:hidden">{btn.key}</span>
                    <span className="hidden md:inline">{btn.id === 'good' ? 'Taste 3 / Space' : `Taste ${btn.key}`}</span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Bottom Progress Bar */}
          <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full transition-all duration-500"
              style={{ width: `${progress}%`, background: 'var(--primary)' }}
            />
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
