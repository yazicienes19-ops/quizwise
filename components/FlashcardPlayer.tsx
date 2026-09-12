
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Flashcard } from '../types';
import { reviewCard, migrateLegacyCard, ReviewQuality, QUALITY_MAP } from '../services/spacedRepetition';
import { useTranslation } from '../i18n/I18nProvider';

type Difficulty = 'again' | 'hard' | 'good' | 'easy';

interface FlashcardPlayerProps {
  cards: Flashcard[];
  onReview: (cardId: string, difficulty: Difficulty) => void;
  onClose: () => void;
  // Freies Üben: alle Karten beliebig oft, OHNE die SRS-Planung zu verändern.
  practiceMode?: boolean;
  onPracticed?: () => void;
  /** Lernrunden bei großen Decks (wie beim Recall): Anzahl weiterer wartender
   *  Karten — > 0 bietet im Abschluss "Weiter lernen" für die nächste Runde. */
  moreWaiting?: number;
  onContinue?: () => void;
}

/** Schriftgröße nach Textlänge: kurze Begriffe groß, lange Fragen bleiben
 *  lesbar statt als 5xl-Wand über drei Bildschirmhöhen. */
const frontSize = (text: string) =>
  text.length > 220 ? 'text-lg sm:text-xl md:text-2xl'
  : text.length > 90 ? 'text-xl sm:text-2xl md:text-3xl'
  : 'text-2xl sm:text-3xl md:text-5xl';
const backSize = (text: string) =>
  text.length > 300 ? 'text-base sm:text-lg md:text-xl'
  : text.length > 120 ? 'text-lg sm:text-xl md:text-2xl'
  : 'text-xl sm:text-2xl md:text-4xl';

export const FlashcardPlayer: React.FC<FlashcardPlayerProps> = ({ cards, onReview, onClose, practiceMode = false, onPracticed, moreWaiting = 0, onContinue }) => {
  const { t, tp } = useTranslation();
  const [remainingCards, setRemainingCards] = useState<Flashcard[]>(() => [...cards]);
  const [completed, setCompleted] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [sessionDone, setSessionDone] = useState(false);
  const [tally, setTally] = useState<Record<Difficulty, number>>({ again: 0, hard: 0, good: 0, easy: 0 });

  const currentCard = remainingCards[0];
  const canContinue = moreWaiting > 0 && !!onContinue;

  const handleDifficulty = useCallback((diff: Difficulty) => {
    if (!showAnswer || !currentCard) return;

    if (practiceMode) {
      onPracticed?.();           // nur Streak, KEINE SRS-Änderung
    } else {
      onReview(currentCard.id, diff);
    }
    setShowAnswer(false);
    setTally(prev => ({ ...prev, [diff]: prev[diff] + 1 }));

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
      setCompleted(c => c + 1);
      if (remainingCards.length <= 1) {
        setRemainingCards([]);
        // Immer ein Abschluss statt wortlosem Zuklappen: vorher verschwand die
        // Session nach der letzten Karte einfach, ohne Rückmeldung.
        setSessionDone(true);
      } else {
        setRemainingCards(r => r.slice(1));
      }
    }
  }, [showAnswer, currentCard, remainingCards, onReview, practiceMode, onPracticed]);

  // Keyboard Support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl+1 (Tab-Wechsel) oder gehaltene Leertaste dürfen keine Karten bewerten.
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      if (e.code === 'Escape') { e.preventDefault(); onClose(); return; }
      if (sessionDone) {
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          if (canContinue) onContinue!(); else onClose();
        }
        return;
      }
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        if (!showAnswer) setShowAnswer(true);
        else handleDifficulty('good');
      } else if (showAnswer) {
        if (e.key === '1') handleDifficulty('again');
        if (practiceMode) return; // Frei üben kennt nur Nochmal / Gewusst
        if (e.key === '2') handleDifficulty('hard');
        if (e.key === '3') handleDifficulty('good');
        if (e.key === '4') handleDifficulty('easy');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showAnswer, handleDifficulty, sessionDone, canContinue, onContinue, onClose, practiceMode]);

  const stats = useMemo(() => {
    const newCount = remainingCards.filter(c => !c.srs?.lastReview).length;
    const learnCount = remainingCards.filter(c => c.srs?.lastReview && c.srs.interval < 7).length;
    const reviewCount = remainingCards.filter(c => c.srs?.lastReview && c.srs.interval >= 7).length;
    return { newCount, learnCount, reviewCount, remaining: remainingCards.length };
  }, [remainingCards]);

  const getIntervalLabel = (diff: Difficulty, card: Flashcard): string => {
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

  const total = completed + remainingCards.length;
  const progress = total > 0 ? (completed / total) * 100 : 0;

  if (sessionDone || !currentCard) {
    if (!sessionDone) return null;
    const presses = tally.again + tally.hard + tally.good + tally.easy;
    const knownPct = presses > 0 ? Math.round(((presses - tally.again) / presses) * 100) : 0;
    return createPortal(
      <div className="fixed inset-0 z-[100] bg-[#f8fafc] dark:bg-[#020617] flex items-center justify-center p-6 animate-in fade-in duration-300">
        <div className="max-w-md w-full text-center space-y-6 rounded-[28px] p-8 sm:p-10 bg-white dark:bg-slate-900 shadow-2xl border border-slate-100 dark:border-slate-800">
          <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--primary) 15%, transparent)' }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-black text-slate-900 dark:text-white">{canContinue ? t('fc.roundDone') : t('fc.allDone')}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
              {tp('fc.cardsThisRound', completed, { n: completed })}{canContinue && <> · {t('fc.moreWaiting', { n: moreWaiting })}</>}
            </p>
          </div>
          {presses > 0 && (
            <div className="flex justify-center gap-2 flex-wrap">
              <span className="px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400">
                {t('fc.summaryKnown', { n: knownPct })}
              </span>
              {tally.again > 0 && (
                <span className="px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400">
                  {t('fc.summaryAgain', { n: tally.again })}
                </span>
              )}
            </div>
          )}
          <p className="text-xs text-slate-400 dark:text-slate-500">{practiceMode ? t('fc.summaryPractice') : t('fc.summaryNext')}</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            {canContinue && (
              <button
                onClick={onContinue}
                className="px-8 py-4 rounded-full text-[11px] font-black uppercase tracking-widest shadow-xl hover:scale-105 transition-all"
                style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
              >
                {t('fc.continueLearning')}
              </button>
            )}
            <button
              onClick={onClose}
              className={canContinue
                ? 'px-8 py-4 rounded-full text-[11px] font-black uppercase tracking-widest transition-all hover:opacity-70 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                : 'px-8 py-4 rounded-full text-[11px] font-black uppercase tracking-widest shadow-xl hover:scale-105 transition-all'}
              style={canContinue ? undefined : { background: 'var(--primary)', color: 'var(--primary-text)' }}
            >
              {canContinue ? t('fc.doneForNow') : t('fcs.done')}
            </button>
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  const longBack = currentCard.back.length > 160;

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-[#f8fafc] dark:bg-[#020617] flex flex-col animate-in fade-in duration-300">
      {/* Anki Header */}
      <div className="p-4 md:p-6 px-4 md:px-12 flex justify-between items-center bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-sm">
        {practiceMode ? (
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full">
              <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
              {t('fc.practiceFree')}
            </span>
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest hidden sm:inline">{t('fc.notCounted', { n: stats.remaining })}</span>
          </div>
        ) : (
        <div className="flex gap-4 md:gap-8">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-black text-blue-500 uppercase tracking-widest">{stats.newCount}</span>
            <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest">{t('fc.new')}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-black text-rose-500 uppercase tracking-widest">{stats.learnCount}</span>
            <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest">{t('fc.learning')}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-black text-emerald-500 uppercase tracking-widest">{stats.reviewCount}</span>
            <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest">{t('fc.due')}</span>
          </div>
        </div>
        )}
        <div className="flex items-center gap-3">
          <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest hidden md:inline">{t('fc.keyEsc')}</span>
          <button aria-label={t('fc.closeSession')}
            onClick={onClose}
            className="text-slate-400 hover:text-rose-500 transition-colors p-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
      </div>

      {/* Main Study Area */}
      <div className="flex-grow flex flex-col items-center justify-center p-4 md:p-8 overflow-y-auto">
        <div className="w-full max-w-4xl space-y-8 md:space-y-16 py-6 md:py-12">

          {/* Front of Card */}
          <div key={`front-${currentCard.id}-${completed}`} className="text-center animate-in fade-in slide-in-from-top-4 duration-500 px-2 md:px-8">
            <h2 className={`${frontSize(currentCard.front)} font-medium text-slate-900 dark:text-slate-100 leading-snug break-words whitespace-pre-line`}>
              {currentCard.front}
            </h2>
          </div>

          {/* Back of Card (Shown after click) */}
          {showAnswer && (
            <div className="space-y-8 md:space-y-16 animate-in fade-in zoom-in-95 duration-300 border-t border-slate-100 dark:border-slate-800 pt-8 md:pt-16 px-2 md:px-8">
              <div className={longBack ? 'text-left max-w-2xl mx-auto' : 'text-center'}>
                <p className={`${backSize(currentCard.back)} font-bold leading-relaxed break-words whitespace-pre-line`} style={{ color: 'var(--primary)' }}>
                  {currentCard.back}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Anki Controls Footer */}
      <div className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-4 md:px-8 py-6 md:py-10" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
        <div className="max-w-4xl mx-auto flex flex-col items-center gap-6 md:gap-8">

          {!showAnswer ? (
            <button
              onClick={() => setShowAnswer(true)}
              className="bg-slate-900 dark:bg-slate-700 text-white px-8 md:px-20 py-5 md:py-6 rounded-2xl font-black uppercase tracking-[0.2em] md:tracking-[0.3em] text-xs md:text-sm shadow-2xl hover:scale-105 transition-all w-full md:w-auto md:min-w-[350px]"
            >
              {t('fc.showAnswer')}
            </button>
          ) : practiceMode ? (
            <div className="grid grid-cols-2 gap-3 sm:gap-4 w-full max-w-xl">
              <button
                onClick={() => handleDifficulty('again')}
                className="group flex flex-col items-center gap-2"
              >
                <div className="w-full bg-rose-500 text-white py-4 md:py-5 rounded-xl md:rounded-2xl font-black uppercase text-[10px] md:text-xs tracking-widest shadow-lg hover:brightness-110 active:scale-95 transition-all">
                  {t('fc.again')}
                </div>
                <span className="text-[9px] md:text-[9px] font-bold text-slate-300 opacity-60">{t('fc.key1')}</span>
              </button>
              <button
                onClick={() => handleDifficulty('good')}
                className="group flex flex-col items-center gap-2"
              >
                <div className="w-full bg-emerald-500 text-white py-4 md:py-5 rounded-xl md:rounded-2xl font-black uppercase text-[10px] md:text-xs tracking-widest shadow-lg hover:brightness-110 active:scale-95 transition-all">
                  {t('fc.known')}
                </div>
                <span className="text-[9px] md:text-[9px] font-bold text-slate-300 opacity-60">{t('fc.key3Space')}</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-2 sm:gap-4 w-full">
              {([
                { id: 'again', label: t('fc.again'), color: 'bg-rose-500', key: '1' },
                { id: 'hard',  label: t('fc.hard'),  color: 'bg-amber-500', key: '2' },
                { id: 'good',  label: t('fc.good'),  color: 'bg-emerald-500', key: '3' },
                { id: 'easy',  label: t('fc.easy'),  color: 'bg-blue-500', key: '4' },
              ] as const).map(btn => (
                <button
                  key={btn.id}
                  onClick={() => handleDifficulty(btn.id)}
                  className="group flex flex-col items-center gap-2"
                >
                  <span className="text-[9px] md:text-[10px] font-black text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white transition-colors uppercase tracking-widest">{getIntervalLabel(btn.id, currentCard)}</span>
                  <div className={`w-full ${btn.color} text-white py-4 md:py-5 rounded-xl md:rounded-2xl font-black uppercase text-[9px] md:text-[10px] tracking-wider md:tracking-widest shadow-lg hover:brightness-110 active:scale-95 transition-all`}>
                    {btn.label}
                  </div>
                  <span className="text-[9px] md:text-[9px] font-bold text-slate-300 opacity-60 text-center leading-tight">
                    <span className="md:hidden">{btn.key}</span>
                    <span className="hidden md:inline">{btn.id === 'good' ? t('fc.key3Space') : t('fc.keyN', { n: btn.key })}</span>
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
