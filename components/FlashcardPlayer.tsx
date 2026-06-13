
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Flashcard } from '../types';
import { reviewCard, migrateLegacyCard, ReviewQuality, countDueCards } from '../services/spacedRepetition';

interface FlashcardPlayerProps {
  cards: Flashcard[];
  onReview: (cardId: string, difficulty: 'again' | 'hard' | 'good' | 'easy') => void;
  onClose: () => void;
}

export const FlashcardPlayer: React.FC<FlashcardPlayerProps> = ({ cards, onReview, onClose }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  
  const currentCard = cards[currentIndex];

  const handleDifficulty = useCallback((diff: 'again' | 'hard' | 'good' | 'easy') => {
    if (!showAnswer) return;
    
    onReview(currentCard.id, diff);
    setShowAnswer(false);
    
    if (currentIndex < cards.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      onClose();
    }
  }, [currentIndex, currentCard, showAnswer, onReview, onClose]);

  // Keyboard Support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        if (!showAnswer) setShowAnswer(true);
        else handleDifficulty('good'); // Default to 'good' on space if answer is shown
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
    const remaining = cards.length - currentIndex;
    const remaining_cards = cards.slice(currentIndex);
    const newCount = remaining_cards.filter(c => !c.srs?.lastReview).length;
    const learnCount = remaining_cards.filter(c => c.srs?.lastReview && c.srs.interval < 7).length;
    const reviewCount = remaining_cards.filter(c => c.srs?.lastReview && c.srs.interval >= 7).length;
    return { newCount, learnCount, reviewCount, remaining };
  }, [currentIndex, cards]);

  const QUALITY_MAP: Record<string, ReviewQuality> = {
    again: ReviewQuality.BLACKOUT,
    hard:  ReviewQuality.HARD,
    good:  ReviewQuality.GOOD,
    easy:  ReviewQuality.EASY,
  };

  const getIntervalLabel = (diff: string, card: Flashcard): string => {
    if (diff === 'again') return '< 1m';
    const srs = card.srs ?? migrateLegacyCard(card);
    const next = reviewCard(srs, QUALITY_MAP[diff] ?? ReviewQuality.GOOD);
    const days = next.interval;
    if (days < 1) return '< 1d';
    if (days === 1) return '1d';
    if (days < 30) return `${days}d`;
    const weeks = Math.round(days / 7);
    if (weeks < 8) return `${weeks}w`;
    return `${Math.round(days / 30)}mo`;
  };

  const progress = (currentIndex / cards.length) * 100;

  if (cards.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-[#f8fafc] dark:bg-[#020617] flex flex-col animate-in fade-in duration-300">
      {/* Anki Header */}
      <div className="p-6 flex justify-between items-center bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-sm px-12">
        <div className="flex gap-8">
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
        <button 
          onClick={onClose}
          className="text-slate-400 hover:text-rose-500 transition-colors p-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>

      {/* Main Study Area */}
      <div className="flex-grow flex flex-col items-center justify-center p-8 overflow-y-auto">
        <div className="w-full max-w-4xl space-y-16 py-12">
          
          {/* Front of Card */}
          <div className="text-center animate-in fade-in slide-in-from-top-4 duration-500 px-8">
            <h2 className="text-4xl md:text-5xl font-medium text-slate-900 dark:text-slate-100 leading-snug">
              {currentCard.front}
            </h2>
          </div>

          {/* Back of Card (Shown after click) */}
          {showAnswer && (
            <div className="space-y-16 animate-in fade-in zoom-in-95 duration-300 border-t border-slate-100 dark:border-slate-800 pt-16 px-8">
              <div className="text-center">
                <p className="text-3xl md:text-4xl font-bold leading-relaxed" style={{ color: 'var(--accent)' }}>
                  {currentCard.back}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Anki Controls Footer */}
      <div className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-8 py-10">
        <div className="max-w-4xl mx-auto flex flex-col items-center gap-8">
          
          {!showAnswer ? (
            <button
              onClick={() => setShowAnswer(true)}
              className="text-white px-20 py-6 rounded-[16px] font-black uppercase tracking-[0.3em] text-sm hover:scale-105 active:scale-95 transition-all w-full md:w-auto min-w-[350px]"
            style={{ background: 'var(--card-primary)' }}
            >
              Antwort anzeigen
            </button>
          ) : (
            <div className="grid grid-cols-4 gap-4 w-full">
              {[
                { id: 'again', label: 'Nochmal', color: 'bg-rose-500', key: '1', interval: getIntervalLabel('again', currentCard) },
                { id: 'hard', label: 'Schwer', color: 'bg-amber-500', key: '2', interval: getIntervalLabel('hard', currentCard) },
                { id: 'good', label: 'Gut', color: 'bg-emerald-500', key: '3', interval: getIntervalLabel('good', currentCard) },
                { id: 'easy', label: 'Einfach', color: 'bg-blue-500', key: '4', interval: getIntervalLabel('easy', currentCard) }
              ].map(btn => (
                <button 
                  key={btn.id}
                  onClick={() => handleDifficulty(btn.id as any)}
                  className="group flex flex-col items-center gap-2"
                >
                  <span className="text-[10px] font-black text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white transition-colors uppercase tracking-widest">{btn.interval}</span>
                  <div className={`w-full ${btn.color} text-white py-5 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg hover:brightness-110 active:scale-95 transition-all`}>
                    {btn.label}
                  </div>
                  <span className="text-[9px] font-bold text-slate-300 opacity-60">Taste {btn.key}</span>
                </button>
              ))}
            </div>
          )}

          {/* Bottom Progress Bar */}
          <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div 
              className="h-full transition-all duration-500"
              style={{ width: `${progress}%`, background: 'var(--accent)' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
