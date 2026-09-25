
import { hasCloze } from '../services/cloze';
import { ClozeText } from './ClozeText';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Flashcard } from '../types';
import { reviewCard, migrateLegacyCard, ReviewQuality, QUALITY_MAP } from '../services/spacedRepetition';
import { useTranslation } from '../i18n/I18nProvider';
import { ArrowLeftRight, Undo2, PauseCircle, CalendarClock, Keyboard } from 'lucide-react';
import { getCardDirection, setCardDirection, isReversed, CARD_DIRECTIONS, type CardDirection } from '../services/cardDirection';
import { CardImage } from './CardImage';
import { compareAnswer } from '../services/answerCompare';
import { OcclusionImage } from './OcclusionImage';

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
  /** Letzte Bewertung zurücknehmen: bekommt die Karte im Zustand VOR der
   *  Bewertung. Ohne diesen Callback gibt es kein Rückgängig (außer beim
   *  freien Üben, das nichts speichert). */
  onUndo?: (before: Flashcard) => void;
  /** Karte aus der Wiederholung nehmen bzw. für heute zurückstellen (ohne Bewertung). */
  onSuspend?: (cardId: string) => void;
  onBury?: (cardId: string) => void;
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

const TYPE_KEY = 'studearc_type_answer';

export const FlashcardPlayer: React.FC<FlashcardPlayerProps> = ({ cards, onReview, onClose, practiceMode = false, onPracticed, moreWaiting = 0, onContinue, onUndo, onSuspend, onBury }) => {
  const { t, tp } = useTranslation();
  const [remainingCards, setRemainingCards] = useState<Flashcard[]>(() => [...cards]);
  const [completed, setCompleted] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [sessionDone, setSessionDone] = useState(false);
  const [tally, setTally] = useState<Record<Difficulty, number>>({ again: 0, hard: 0, good: 0, easy: 0 });
  const [direction, setDirection] = useState<CardDirection>(getCardDirection);
  // Rückgängig: Zustand der Runde und bewertete Karte vor jeder Bewertung
  const [history, setHistory] = useState<{
    remaining: Flashcard[]; completed: number; tally: Record<Difficulty, number>; card: Flashcard;
  }[]>([]);
  const canUndo = history.length > 0 && (practiceMode || !!onUndo);
  // Antwort eintippen (Anki: "type-in answer"), Wahl pro Gerät gemerkt
  const [typeMode, setTypeMode] = useState(() => { try { return localStorage.getItem(TYPE_KEY) === '1'; } catch { return false; } });
  const [typed, setTyped] = useState('');
  const toggleTypeMode = () => setTypeMode(v => { try { localStorage.setItem(TYPE_KEY, v ? '0' : '1'); } catch { /* gesperrt */ } return !v; });

  const currentCard = remainingCards[0];
  useEffect(() => { setTyped(''); }, [currentCard?.id, completed]);
  const canContinue = moreWaiting > 0 && !!onContinue;

  const handleDifficulty = useCallback((diff: Difficulty) => {
    if (!showAnswer || !currentCard) return;
    setHistory(h => [...h.slice(-19), { remaining: remainingCards, completed, tally, card: currentCard }]);

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
  }, [showAnswer, currentCard, remainingCards, completed, tally, onReview, practiceMode, onPracticed]);

  /** Karte ohne Bewertung aus dieser Runde nehmen (nach Aussetzen/Zurückstellen). */
  const dropCurrent = useCallback((action: (id: string) => void) => {
    if (!currentCard) return;
    action(currentCard.id);
    setShowAnswer(false);
    if (remainingCards.length <= 1) { setRemainingCards([]); setSessionDone(true); }
    else setRemainingCards(r => r.slice(1));
  }, [currentCard, remainingCards.length]);

  const handleUndo = useCallback(() => {
    const last = history[history.length - 1];
    if (!last || !(practiceMode || onUndo)) return;
    if (!practiceMode) onUndo?.(last.card);
    setHistory(h => h.slice(0, -1));
    setRemainingCards(last.remaining);
    setCompleted(last.completed);
    setTally(last.tally);
    setSessionDone(false);
    setShowAnswer(true); // zurück zur aufgedeckten Karte, neu bewerten
  }, [history, practiceMode, onUndo]);

  // Keyboard Support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT' || (e.target as HTMLElement | null)?.tagName === 'TEXTAREA') return;
      // Rückgängig: Z oder Cmd/Ctrl+Z
      if (e.key.toLowerCase() === 'z' && !e.altKey && !e.repeat && !e.shiftKey) {
        if (canUndo) { e.preventDefault(); handleUndo(); }
        return;
      }
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
  }, [showAnswer, handleDifficulty, sessionDone, canContinue, onContinue, onClose, practiceMode, canUndo, handleUndo]);

  const stats = useMemo(() => {
    const newCount = remainingCards.filter(c => !c.srs?.lastReview).length;
    const learnCount = remainingCards.filter(c => c.srs?.lastReview && c.srs.interval < 7).length;
    const reviewCount = remainingCards.filter(c => c.srs?.lastReview && c.srs.interval >= 7).length;
    return { newCount, learnCount, reviewCount, remaining: remainingCards.length };
  }, [remainingCards]);

  const getIntervalLabel = (diff: Difficulty, card: Flashcard): string => {
    if (diff === 'again') return t('fc.int.now');
    const srs = card.srs ?? migrateLegacyCard(card);
    const next = reviewCard(srs, QUALITY_MAP[diff] ?? ReviewQuality.GOOD);
    const days = Math.max(1, next.interval);
    if (days < 30) return tp('fc.int.days', days);
    const weeks = Math.round(days / 7);
    if (weeks < 8) return tp('fc.int.weeks', weeks);
    const months = Math.round(days / 30);
    if (months < 12) return tp('fc.int.months', months);
    return tp('fc.int.years', Math.round(days / 365));
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
              <span className="px-3 py-1.5 rounded-full text-[11px] font-semibold uppercase tracking-[0.08em] bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400">
                {t('fc.summaryKnown', { n: knownPct })}
              </span>
              {tally.again > 0 && (
                <span className="px-3 py-1.5 rounded-full text-[11px] font-semibold uppercase tracking-[0.08em] bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400">
                  {t('fc.summaryAgain', { n: tally.again })}
                </span>
              )}
            </div>
          )}
          <p className="text-xs text-slate-400 dark:text-slate-500">{practiceMode ? t('fc.summaryPractice') : t('fc.summaryNext')}</p>
          {canUndo && (
            <button onClick={handleUndo} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors">
              <Undo2 className="w-4 h-4" aria-hidden="true" /> {t('fc.undoLast')}
            </button>
          )}
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            {canContinue && (
              <button
                onClick={onContinue}
                className="px-8 py-4 rounded-full text-[13px] font-semibold shadow-xl hover:scale-105 transition-all"
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

  // Lernrichtung (services/cardDirection.ts): nur die Anzeige wird getauscht.
  // Lückentext-Karten bleiben immer in Leserichtung: die Lücke ist die Frage.
  const cloze = hasCloze(currentCard.front);
  const reversed = !cloze && !currentCard.occlusion && isReversed(currentCard.id, direction);
  const shownFront = reversed ? currentCard.back : currentCard.front;
  const shownBack = reversed ? currentCard.front : currentCard.back;
  const shownFrontImage = reversed ? currentCard.backImage : currentCard.frontImage;
  const shownBackImage = reversed ? currentCard.frontImage : currentCard.backImage;
  const longBack = shownBack.length > 160;
  // Eintippen nur bei Karten mit Text-Antwort (nicht bei Lückentext oder reiner Bild-Antwort)
  const typeActive = typeMode && !cloze && !!shownBack.trim();
  const comparison = typeActive && showAnswer && typed.trim() ? compareAnswer(typed, shownBack) : null;

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-[#f8fafc] dark:bg-[#020617] flex flex-col animate-in fade-in duration-300">
      {/* Anki Header */}
      <div className="p-4 md:p-6 px-4 md:px-12 flex justify-between items-center bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-sm">
        {practiceMode ? (
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 text-[11px] font-semibold uppercase tracking-[0.08em] px-3 py-1.5 rounded-full">
              <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
              {t('fc.practiceFree')}
            </span>
            <span className="text-xs font-semibold text-slate-400 hidden sm:inline">{t('fc.notCounted', { n: stats.remaining })}</span>
          </div>
        ) : (
        <div className="flex gap-4 md:gap-8">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-blue-500">{stats.newCount}</span>
            <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-[0.08em]">{t('fc.new')}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-rose-500">{stats.learnCount}</span>
            <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-[0.08em]">{t('fc.learning')}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-emerald-500">{stats.reviewCount}</span>
            <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-[0.08em]">{t('fc.due')}</span>
          </div>
        </div>
        )}
        <div className="flex items-center gap-3">
          {onBury && (
            <button onClick={() => dropCurrent(onBury)} aria-label={t('bury.action')} title={t('bury.action')}
              className="p-2 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors">
              <CalendarClock className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
          {onSuspend && (
            <button onClick={() => dropCurrent(onSuspend)} aria-label={t('susp.action')} title={t('susp.action')}
              className="p-2 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors">
              <PauseCircle className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
          <button
            onClick={toggleTypeMode}
            aria-pressed={typeMode}
            aria-label={t('type.toggle')}
            title={t('type.toggle')}
            className={`p-2 rounded-lg transition-colors ${typeMode ? 'text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
          >
            <Keyboard className="w-4 h-4" aria-hidden="true" />
          </button>
          {canUndo && (
            <button
              onClick={handleUndo}
              aria-label={t('fc.undoLast')}
              title={`${t('fc.undoLast')} (Z)`}
              className="p-2 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
            >
              <Undo2 className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
            <ArrowLeftRight className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="sr-only">{t('fc.direction')}</span>
            <select
              value={direction}
              onChange={e => { const d = e.target.value as CardDirection; setDirection(d); setCardDirection(d); setShowAnswer(false); }}
              aria-label={t('fc.direction')}
              className="bg-transparent font-semibold cursor-pointer outline-none text-slate-600 dark:text-slate-300"
            >
              {CARD_DIRECTIONS.map(d => <option key={d} value={d}>{t(`fc.direction.${d}` as const)}</option>)}
            </select>
          </label>
          <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-[0.08em] hidden md:inline">{t('fc.keyEsc')}</span>
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
          <div key={`front-${currentCard.id}-${completed}`} className="text-center animate-in fade-in slide-in-from-top-4 duration-500 px-2 md:px-8 space-y-6">
            {currentCard.occlusion && <OcclusionImage occlusion={currentCard.occlusion} revealed={showAnswer} alt={t('occ.alt')} />}
            {shownFrontImage && <CardImage path={shownFrontImage} alt={t('img.altFront')} />}
            <h2 className={`${frontSize(shownFront)} font-medium text-slate-900 dark:text-slate-100 leading-snug break-words whitespace-pre-line`}>
              {cloze ? <ClozeText text={currentCard.front} revealed={showAnswer} /> : shownFront}
            </h2>
            {typeActive && !showAnswer && (
              <input
                autoFocus
                value={typed}
                onChange={e => setTyped(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); setShowAnswer(true); } }}
                placeholder={t('type.placeholder')}
                aria-label={t('type.placeholder')}
                className="w-full max-w-xl mx-auto block px-4 py-3 rounded-2xl text-base bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 focus:border-slate-400 outline-none text-slate-900 dark:text-white"
              />
            )}
          </div>

          {/* Back of Card (Shown after click) */}
          {showAnswer && !((cloze || currentCard.occlusion) && !shownBack.trim() && !shownBackImage) && (
            <div className="space-y-8 md:space-y-16 animate-in fade-in zoom-in-95 duration-300 border-t border-slate-100 dark:border-slate-800 pt-8 md:pt-16 px-2 md:px-8">
              <div className={`${longBack ? 'text-left max-w-2xl mx-auto' : 'text-center'} space-y-6`}>
                {comparison && (
                  <div className="max-w-2xl mx-auto text-left rounded-2xl px-4 py-3 bg-slate-50 dark:bg-slate-800/60 space-y-2" aria-live="polite">
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      {t('type.result', { n: Math.round(comparison.score * 100) })}
                    </p>
                    <p className="text-[15px] leading-relaxed">
                      {comparison.expected.map((s, i) => (
                        <span key={i} className={s.kind === 'ok'
                          ? 'text-emerald-700 dark:text-emerald-300'
                          : 'text-rose-700 dark:text-rose-300 underline decoration-2 underline-offset-4'}>
                          {s.text}{' '}
                        </span>
                      ))}
                    </p>
                    {comparison.extra.length > 0 && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {t('type.extra')} <span className="line-through">{comparison.extra.join(' ')}</span>
                      </p>
                    )}
                  </div>
                )}
                {shownBackImage && <CardImage path={shownBackImage} alt={t('img.altBack')} />}
                <p className={`${backSize(shownBack)} font-bold leading-relaxed break-words whitespace-pre-line`} style={{ color: 'var(--primary-ink)' }}>
                  {shownBack}
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
              className="bg-slate-900 dark:bg-slate-700 text-white px-8 md:px-20 py-5 md:py-6 rounded-2xl font-semibold text-xs md:text-sm shadow-2xl hover:scale-105 transition-all w-full md:w-auto md:min-w-[350px]"
            >
              {t('fc.showAnswer')}
            </button>
          ) : practiceMode ? (
            <div className="grid grid-cols-2 gap-3 sm:gap-4 w-full max-w-xl">
              <button
                onClick={() => handleDifficulty('again')}
                className="group flex flex-col items-center gap-2"
              >
                <div className="w-full bg-rose-500 text-white py-4 md:py-5 rounded-xl md:rounded-2xl font-semibold uppercase text-[11px] md:text-xs tracking-[0.08em] shadow-lg hover:brightness-110 active:scale-95 transition-all">
                  {t('fc.again')}
                </div>
                <span className="text-[11px] md:text-[11px] font-bold text-slate-300 opacity-60">{t('fc.key1')}</span>
              </button>
              <button
                onClick={() => handleDifficulty('good')}
                className="group flex flex-col items-center gap-2"
              >
                <div className="w-full bg-emerald-500 text-white py-4 md:py-5 rounded-xl md:rounded-2xl font-semibold uppercase text-[11px] md:text-xs tracking-[0.08em] shadow-lg hover:brightness-110 active:scale-95 transition-all">
                  {t('fc.known')}
                </div>
                <span className="text-[11px] md:text-[11px] font-bold text-slate-300 opacity-60">{t('fc.key3Space')}</span>
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
                  className={`group flex flex-col items-center gap-2 rounded-2xl ${comparison?.suggestion === btn.id ? 'ring-2 ring-offset-4 ring-slate-400 dark:ring-offset-slate-900' : ''}`}
                  aria-describedby={comparison?.suggestion === btn.id ? 'type-suggestion' : undefined}
                >
                  <span className="text-xs md:text-[11px] font-semibold text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">{getIntervalLabel(btn.id, currentCard)}</span>
                  <div className={`w-full ${btn.color} text-white py-4 md:py-5 rounded-xl md:rounded-2xl font-semibold text-xs md:text-[11px] shadow-lg hover:brightness-110 active:scale-95 transition-all`}>
                    {btn.label}
                  </div>
                  <span className="text-[11px] md:text-[11px] font-bold text-slate-300 opacity-60 text-center leading-tight">
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
