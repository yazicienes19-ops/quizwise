import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { QuizQuestion, UserAnswer } from '../types';
import { EmojiImage } from './EmojiImage';
import { useTranslation } from '../i18n/I18nProvider';

interface QuizPlayerProps {
  questions: QuizQuestion[];
  onComplete: (answers: UserAnswer[]) => void;
  onCancel?: () => void;
  onProgress?: (answers: UserAnswer[]) => void;
  onSave?: (name: string, currentAnswers: UserAnswer[]) => void;
  sourceName?: string;
  examMode?: boolean;
  initialAnswers?: UserAnswer[];
}

// Fisher-Yates: gleichmäßig verteiltes Mischen (sort(()=>Math.random()-0.5) ist verzerrt)
const shuffle = <T,>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export const QuizPlayer: React.FC<QuizPlayerProps> = ({
  questions, onComplete, onCancel, onProgress, onSave, sourceName, examMode, initialAnswers,
}) => {
  const { t } = useTranslation();
  const [currentIndex, setCurrentIndex]         = useState(initialAnswers?.length ?? 0);
  const [answers, setAnswers]                   = useState<UserAnswer[]>(initialAnswers ?? []);
  const [showResult, setShowResult]             = useState(false);
  const [showExplanation, setShowExplanation]   = useState(false);
  const [showSaveInput, setShowSaveInput]       = useState(false);
  const [saveName, setSaveName]                 = useState('');

  // MC / TF / Scenario
  const [selectedOptions, setSelectedOptions]   = useState<number[]>([]);
  // Metakognitive Kalibrierung (v1: nur MC-artige Fragen)
  const [confidence, setConfidence]             = useState<'sicher' | 'unsicher' | null>(null);
  // Open
  const [showSampleAnswer, setShowSampleAnswer] = useState(false);
  const [selfAssessCorrect, setSelfAssessCorrect] = useState<boolean | null>(null);
  // Matching
  const [matchAnswer, setMatchAnswer]           = useState<Record<number, string>>({});
  // Cloze
  const [clozeAnswer, setClozeAnswer]           = useState<string[]>([]);
  // Numeric
  const [numericInput, setNumericInput]         = useState('');
  // Ranking
  const [rankingOrder, setRankingOrder]         = useState<string[]>([]);

  const currentQuestion = questions[currentIndex];
  const qt = currentQuestion?.questionType;
  const isOpen     = qt === 'open' || (!qt && (currentQuestion?.options?.length === 0));
  const isMatching = qt === 'matching';
  const isCloze    = qt === 'cloze';
  const isRanking  = qt === 'ranking';
  const isNumeric  = qt === 'numeric';
  const isScenario = qt === 'scenario';
  const isMcLike   = !isOpen && !isMatching && !isCloze && !isRanking && !isNumeric;

  // Anzahl tatsächlich gerenderter Lücken — aus clozeText, nicht aus clozeAnswers.
  // Verhindert, dass eine fehlerhaft generierte Frage (Lücken/Antworten passen nicht
  // zusammen) den „Antwort prüfen"-Button dauerhaft sperrt.
  const clozeBlankCount = isCloze && currentQuestion?.clozeText
    ? currentQuestion.clozeText.split('__LÜCKE__').length - 1
    : 0;

  // Shuffled versions — stable per question index
  const shuffledRight = useMemo(() => {
    if (!currentQuestion?.matchPairs) return [];
    return shuffle(currentQuestion.matchPairs.map(p => p.right));
  }, [currentIndex]);

  const shuffledRanking = useMemo(() => {
    if (!currentQuestion?.rankingItems) return [];
    return shuffle(currentQuestion.rankingItems);
  }, [currentIndex]);

  useEffect(() => {
    setSelectedOptions([]);
    setConfidence(null);
    setShowResult(false);
    setShowExplanation(false);
    setShowSampleAnswer(false);
    setSelfAssessCorrect(null);
    setMatchAnswer({});
    setClozeAnswer([]);
    setNumericInput('');
    setRankingOrder(shuffledRanking);
  }, [currentIndex]);

  useEffect(() => {
    if (shuffledRanking.length > 0 && rankingOrder.length === 0) {
      setRankingOrder(shuffledRanking);
    }
  }, [shuffledRanking]);

  // ─── Correctness check ───────────────────────────────────────────────────
  const checkCorrectness = (): boolean => {
    if (!currentQuestion) return false;
    if (isOpen) return selfAssessCorrect ?? false;
    if (isScenario || isMcLike) {
      const ss = [...selectedOptions].sort();
      const sc = [...(currentQuestion.correctAnswerIndices || [])].sort();
      return ss.length === sc.length && ss.every((v, i) => v === sc[i]);
    }
    if (isMatching) {
      return (currentQuestion.matchPairs || []).every((pair, i) => matchAnswer[i] === pair.right);
    }
    if (isCloze) {
      const ca = currentQuestion.clozeAnswers || [];
      if (ca.length === 0) return false;
      return ca.every(
        (a, i) => (clozeAnswer[i] || '').trim().toLowerCase() === (a || '').toLowerCase()
      );
    }
    if (isRanking) {
      return (currentQuestion.rankingItems || []).every((item, i) => item === rankingOrder[i]);
    }
    if (isNumeric) {
      const user = parseFloat(numericInput);
      const correct = currentQuestion.numericAnswer ?? 0;
      const tolerance = currentQuestion.numericTolerance ?? 0;
      return !isNaN(user) && Math.abs(user - correct) <= tolerance;
    }
    return false;
  };

  // ─── canConfirm ──────────────────────────────────────────────────────────
  const canConfirm = (() => {
    if (!currentQuestion) return false;
    if (isOpen)     return selfAssessCorrect !== null;
    if (isMcLike || isScenario) return selectedOptions.length > 0 && confidence !== null;
    if (isMatching) return Object.keys(matchAnswer).length === (currentQuestion.matchPairs?.length ?? 0);
    if (isCloze)    return clozeBlankCount === 0 ||  // defekte Frage nicht blockieren
                           Array.from({ length: clozeBlankCount })
                                .every((_, i) => (clozeAnswer[i] || '').trim() !== '');
    if (isRanking)  return rankingOrder.length > 0;
    if (isNumeric)  return numericInput.trim() !== '';
    return false;
  })();

  const handleOptionSelect = useCallback((idx: number) => {
    if (showResult) return;
    setSelectedOptions(prev => prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]);
  }, [showResult]);

  const handleConfirm = useCallback(() => {
    if (!canConfirm || isOpen) return;
    setShowResult(true);
    setShowExplanation(true);
  }, [canConfirm, isOpen]);

  const handleSelfAssess = (correct: boolean) => {
    setSelfAssessCorrect(correct);
    setShowResult(true);
  };

  const handleNext = useCallback(() => {
    const isCorrect = checkCorrectness();
    const newAnswer: UserAnswer = {
      questionIndex: currentIndex,
      selectedOptionIndices: selectedOptions,
      isCorrect,
      ...(isOpen               ? { textAnswer: '' }           : {}),
      ...(isMatching           ? { matchAnswer }              : {}),
      ...(isCloze              ? { clozeAnswer }              : {}),
      ...(isNumeric            ? { numericAnswer: parseFloat(numericInput) } : {}),
      ...(isRanking            ? { rankingAnswer: rankingOrder } : {}),
      ...((isMcLike || isScenario) && confidence ? { confidence } : {}),
    };
    const newAnswers = [...answers, newAnswer];
    setAnswers(newAnswers);
    onProgress?.(newAnswers);
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      onComplete(newAnswers);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, questions.length, answers, selectedOptions, confidence, isOpen, isMatching, isCloze, isNumeric, isRanking, matchAnswer, clozeAnswer, numericInput, rankingOrder, onComplete]);

  // Keyboard: 1–4 select option, Enter confirm/next
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (showResult) {
        if (e.key === 'Enter') { e.preventDefault(); handleNext(); }
        return;
      }
      if (isMcLike || isScenario) {
        const n = parseInt(e.key);
        if (n >= 1 && n <= (currentQuestion?.options?.length ?? 0)) {
          e.preventDefault();
          handleOptionSelect(n - 1);
        }
      }
      if (e.key === 'Enter' && canConfirm && !isOpen) { e.preventDefault(); handleConfirm(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showResult, isMcLike, isScenario, isOpen, canConfirm, currentQuestion, handleNext, handleOptionSelect, handleConfirm]);

  if (!currentQuestion) return null;

  const progress = ((currentIndex + 1) / questions.length) * 100;

  // ─── Question type badge ─────────────────────────────────────────────────
  const TYPE_BADGE: Record<string, string> = {
    open: t('quiz.badge.open'),
    matching: t('quiz.badge.matching'),
    cloze: t('quiz.badge.cloze'),
    ranking: t('quiz.badge.ranking'),
    numeric: t('quiz.badge.numeric'),
    scenario: t('quiz.badge.scenario'),
  };
  const badgeLabel = qt ? TYPE_BADGE[qt] : null;

  // ─── Result overlay for non-MC types ────────────────────────────────────
  const renderResultFeedback = () => {
    if (!showResult || isOpen) return null;
    const correct = checkCorrectness();
    return (
      <div className={`mx-4 mb-4 p-4 rounded-[20px] text-center font-black text-[10px] uppercase tracking-widest animate-in slide-in-from-bottom-4 duration-300 ${
        correct ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600' : 'bg-rose-50 dark:bg-rose-900/20 text-rose-600'
      }`}>
        {correct ? t('quiz.correct') : t('quiz.incorrect')}
      </div>
    );
  };

  // ─── Render question body ────────────────────────────────────────────────
  const renderBody = () => {

    /* ── Scenario card ── */
    const scenarioCard = isScenario && currentQuestion.scenarioText ? (
      <div className="mx-4 mb-4 p-5 bg-amber-50 dark:bg-amber-900/20 rounded-[24px] border border-amber-200 dark:border-amber-800">
        <p className="text-[8px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400 mb-2">{t('quiz.badge.scenario')}</p>
        <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{currentQuestion.scenarioText}</p>
      </div>
    ) : null;

    /* ── MC / Single / TF / Scenario ── */
    if (isMcLike || isScenario) {
      return (
        <>
          {scenarioCard}
          <div className="px-4 pb-4 space-y-2">
            {currentQuestion.options.map((option, idx) => {
              const isSelected = selectedOptions.includes(idx);
              const isCorrect  = (currentQuestion.correctAnswerIndices || []).includes(idx);
              let cls = 'border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300 hover:border-indigo-300';
              if (isSelected && !showResult) cls = 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 ring-2 ring-indigo-600/30 text-indigo-900 dark:text-indigo-200';
              if (showResult) {
                if (isCorrect)       cls = 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300';
                else if (isSelected) cls = 'border-rose-500 bg-rose-50 dark:bg-rose-950/20 text-rose-800 dark:text-rose-300 opacity-70';
                else                 cls = 'border-slate-100 dark:border-slate-800 opacity-30 text-slate-400 dark:text-slate-600';
              }
              return (
                <button key={idx} onClick={() => handleOptionSelect(idx)} disabled={showResult}
                  className={`w-full text-left px-5 py-4 rounded-[20px] border-2 transition-all duration-300 font-semibold flex items-center gap-4 min-h-[52px] ${cls}`}
                >
                  <span
                    className={`w-8 h-8 rounded-xl flex items-center justify-center text-[11px] font-black shrink-0 transition-all ${isSelected && !showResult ? '' : 'bg-white dark:bg-slate-800 text-slate-400 shadow-inner'}`}
                    style={isSelected && !showResult ? { background: 'var(--primary)', color: 'var(--primary-text)' } : undefined}
                  >
                    {String.fromCharCode(65 + idx)}
                  </span>
                  <span className="text-sm sm:text-base leading-snug flex-1">{option}</span>
                  {!showResult && idx < 4 && (
                    <span className="text-[8px] font-black text-slate-300 shrink-0">{idx + 1}</span>
                  )}
                  {showResult && isCorrect && <EmojiImage emoji="✨" size={16} className="ml-auto shrink-0" />}
                </button>
              );
            })}
          </div>

          {/* Metakognitive Kalibrierung: Selbsteinschätzung vor Aufdeckung der Lösung */}
          {!showResult && selectedOptions.length > 0 && (
            <div className="px-4 pb-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-2 px-1">{t('quiz.confidence')}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfidence('unsicher')}
                  className={`flex-1 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border-2 transition-all flex items-center justify-center gap-2 ${
                    confidence === 'unsicher' ? '' : 'border-slate-100 dark:border-slate-800 text-slate-400 hover:border-slate-300'
                  }`}
                  style={confidence === 'unsicher' ? { borderColor: 'var(--primary)', background: 'color-mix(in srgb, var(--primary) 10%, transparent)', color: 'var(--primary)' } : undefined}
                >
                  {t('quiz.unsure')}
                </button>
                <button
                  onClick={() => setConfidence('sicher')}
                  className={`flex-1 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border-2 transition-all flex items-center justify-center gap-2 ${
                    confidence === 'sicher' ? '' : 'border-slate-100 dark:border-slate-800 text-slate-400 hover:border-slate-300'
                  }`}
                  style={confidence === 'sicher' ? { borderColor: 'var(--primary)', background: 'color-mix(in srgb, var(--primary) 10%, transparent)', color: 'var(--primary)' } : undefined}
                >
                  {t('quiz.sure')}
                </button>
              </div>
            </div>
          )}
        </>
      );
    }

    /* ── Open / Essay ── */
    if (isOpen) {
      return (
        <div className="px-4 pb-4 space-y-3">
          {!showSampleAnswer ? (
            <button onClick={() => setShowSampleAnswer(true)}
              className="w-full py-4 rounded-[20px] bg-indigo-50 dark:bg-indigo-900/20 border-2 border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 font-black text-[10px] uppercase tracking-widest hover:bg-indigo-100 transition-colors"
            >
              {t('quiz.showSample')}
            </button>
          ) : (
            <div className="space-y-3 animate-in slide-in-from-bottom-4 duration-500">
              <div className="p-5 bg-indigo-50 dark:bg-indigo-900/20 rounded-[20px] border border-indigo-200 dark:border-indigo-800">
                <p className="text-[8px] font-black uppercase tracking-widest text-indigo-500 mb-2">{t('quiz.sample')}</p>
                <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{currentQuestion.explanation}</p>
              </div>
              {selfAssessCorrect === null && (
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => handleSelfAssess(true)} className="py-4 rounded-[20px] bg-emerald-600 text-white font-black text-[10px] uppercase tracking-widest hover:bg-emerald-700 transition-colors">
                    {t('quiz.hadIt')}
                  </button>
                  <button onClick={() => handleSelfAssess(false)} className="py-4 rounded-[20px] bg-rose-600 text-white font-black text-[10px] uppercase tracking-widest hover:bg-rose-700 transition-colors">
                    {t('quiz.didntHave')}
                  </button>
                </div>
              )}
              {selfAssessCorrect !== null && (
                <div className={`p-4 rounded-[20px] text-center font-black text-[10px] uppercase tracking-widest ${selfAssessCorrect ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600' : 'bg-rose-50 dark:bg-rose-900/20 text-rose-600'}`}>
                  {selfAssessCorrect ? t('quiz.wellDone') : t('quiz.markedReview')}
                </div>
              )}
            </div>
          )}
        </div>
      );
    }

    /* ── Matching / Zuordnung ── */
    if (isMatching && currentQuestion.matchPairs) {
      const pairs = currentQuestion.matchPairs;
      return (
        <div className="px-4 pb-4 space-y-3">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 px-1">{t('quiz.matchHint')}</p>
          {pairs.map((pair, li) => {
            const selected = matchAnswer[li];
            const isCorrect = showResult && selected === pair.right;
            const isWrong   = showResult && selected !== undefined && !isCorrect;
            return (
              <div key={li} className="flex items-center gap-2">
                <div className="flex-1 p-3 rounded-[16px] bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 text-indigo-800 dark:text-indigo-200 text-sm font-bold min-w-0 break-words">
                  {pair.left}
                </div>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-slate-400">
                  <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                </svg>
                {!showResult ? (
                  <select
                    value={selected ?? ''}
                    onChange={e => setMatchAnswer(prev => ({ ...prev, [li]: e.target.value }))}
                    className="flex-1 p-3 bg-white dark:bg-slate-800 rounded-[16px] border-2 border-slate-200 dark:border-slate-700 text-sm font-medium dark:text-white outline-none focus:border-indigo-500 transition-colors"
                  >
                    <option value="">{t('quiz.selectOption')}</option>
                    {shuffledRight.map((r, ri) => (
                      <option key={ri} value={r}>{r}</option>
                    ))}
                  </select>
                ) : (
                  <div className={`flex-1 p-3 rounded-[16px] border-2 text-sm font-medium ${isCorrect ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700' : isWrong ? 'border-rose-400 bg-rose-50 dark:bg-rose-950/20 text-rose-700' : 'border-slate-200 bg-slate-50 dark:bg-slate-800 text-slate-400'}`}>
                    {selected || '—'}
                    {isWrong && <span className="block text-[10px] text-emerald-600 dark:text-emerald-400 font-black mt-0.5">✓ {pair.right}</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      );
    }

    /* ── Cloze / Lückentext ── */
    if (isCloze && currentQuestion.clozeText) {
      const parts = currentQuestion.clozeText.split('__LÜCKE__');
      return (
        <div className="px-4 pb-4">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-4 px-1">{t('quiz.clozeHint')}</p>
          <div className="text-base leading-loose text-slate-800 dark:text-slate-200 px-2">
            {parts.map((part, pi) => {
              const userBlank    = clozeAnswer[pi] || '';
              const correctBlank = currentQuestion.clozeAnswers?.[pi] || '';
              const ok = showResult && userBlank.trim().toLowerCase() === correctBlank.toLowerCase();
              const wrong = showResult && !ok && pi < parts.length - 1;
              return (
                <React.Fragment key={pi}>
                  {part}
                  {pi < parts.length - 1 && (
                    showResult ? (
                      <span className={`mx-1 inline-flex items-center gap-1 px-2 py-0.5 rounded font-bold ${ok ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700' : 'bg-rose-100 dark:bg-rose-900/30 text-rose-700'}`}>
                        {userBlank || '—'}
                        {wrong && <span className="text-emerald-600 dark:text-emerald-400 text-xs">→ {correctBlank}</span>}
                      </span>
                    ) : (
                      <input
                        type="text"
                        value={userBlank}
                        onChange={e => {
                          const next = [...clozeAnswer];
                          next[pi] = e.target.value;
                          setClozeAnswer(next);
                        }}
                        placeholder="..."
                        className="mx-1 px-3 py-0.5 border-b-2 border-indigo-500 bg-transparent outline-none font-bold text-indigo-700 dark:text-indigo-300 min-w-[80px] text-center"
                      />
                    )
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      );
    }

    /* ── Ranking / Sortierung ── */
    if (isRanking && currentQuestion.rankingItems) {
      const correct = currentQuestion.rankingItems;
      return (
        <div className="px-4 pb-4 space-y-2">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-3 px-1">{t('quiz.rankingHint')}</p>
          {rankingOrder.map((item, i) => {
            const isCorrect = showResult && correct[i] === item;
            const isWrong   = showResult && !isCorrect;
            return (
              <div key={item} className={`flex items-center gap-3 p-3 rounded-[16px] border-2 transition-all ${
                showResult
                  ? isCorrect ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/20' : 'border-rose-400 bg-rose-50 dark:bg-rose-950/20'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
              }`}>
                <span className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 text-[11px] font-black flex items-center justify-center shrink-0">{i + 1}</span>
                <span className={`flex-1 text-sm font-medium ${showResult ? isCorrect ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300' : 'text-slate-700 dark:text-slate-300'}`}>{item}</span>
                {isWrong && <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 shrink-0">→ Pos. {correct.indexOf(item) + 1}</span>}
                {!showResult && (
                  <div className="flex flex-col gap-1 shrink-0">
                    <button disabled={i === 0} onClick={() => {
                      const next = [...rankingOrder];
                      [next[i - 1], next[i]] = [next[i], next[i - 1]];
                      setRankingOrder(next);
                    }} className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-500 text-xs flex items-center justify-center hover:bg-indigo-100 disabled:opacity-30 transition-colors">▲</button>
                    <button disabled={i === rankingOrder.length - 1} onClick={() => {
                      const next = [...rankingOrder];
                      [next[i], next[i + 1]] = [next[i + 1], next[i]];
                      setRankingOrder(next);
                    }} className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-500 text-xs flex items-center justify-center hover:bg-indigo-100 disabled:opacity-30 transition-colors">▼</button>
                  </div>
                )}
              </div>
            );
          })}
          {showResult && (
            <div className="mt-2 text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">
              Korrekte Reihenfolge: {correct.join(' → ')}
            </div>
          )}
        </div>
      );
    }

    /* ── Numeric / Zahlenangabe ── */
    if (isNumeric) {
      const userNum  = parseFloat(numericInput);
      const correct  = currentQuestion.numericAnswer ?? 0;
      const tolerance = currentQuestion.numericTolerance ?? 0;
      const ok = showResult && !isNaN(userNum) && Math.abs(userNum - correct) <= tolerance;
      const wrong = showResult && !ok;
      return (
        <div className="px-4 pb-4 space-y-4">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 px-1">{t('quiz.numericHint')}</p>
          <div className="flex items-center gap-3 max-w-xs">
            <input
              type="number"
              value={numericInput}
              onChange={e => { if (!showResult) setNumericInput(e.target.value); }}
              disabled={showResult}
              placeholder="0"
              className={`flex-1 p-4 rounded-[20px] border-2 outline-none transition-all text-xl font-black text-center dark:text-white ${
                showResult
                  ? ok ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700' : 'border-rose-400 bg-rose-50 dark:bg-rose-950/20 text-rose-700'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:border-indigo-500'
              }`}
            />
            {tolerance > 0 && <span className="text-[10px] text-slate-400 font-black whitespace-nowrap">±{tolerance}</span>}
          </div>
          {wrong && (
            <p className="text-sm font-bold text-slate-500 dark:text-slate-400 px-1">
              Korrekte Antwort: <span className="text-emerald-600 font-black">{correct}</span>{tolerance > 0 ? ` ±${tolerance}` : ''}
            </p>
          )}
        </div>
      );
    }

    return null;
  };

  return (
    <div className="max-w-2xl mx-auto animate-in fade-in duration-700 pb-48 md:pb-36">
      {/* Header */}
      <div className="px-4 pt-6 lg:pt-10 space-y-3 mb-6">
        {sourceName && (
          <p className="text-[9px] font-black uppercase tracking-[0.3em] text-indigo-500 break-words">{sourceName}</p>
        )}
        <div className="flex justify-between items-center text-[10px] font-black uppercase text-slate-400 tracking-widest">
          <span>{t('quiz.questionOf', { n: currentIndex + 1, total: questions.length })}</span>
          <div className="flex items-center gap-3">
            {onSave && (
              <button
                onClick={() => { setSaveName(sourceName || t('quiz.myQuiz')); setShowSaveInput(v => !v); }}
                className="flex items-center gap-1 text-slate-400 hover:text-indigo-600 transition-colors"
                title={t('quiz.saveQuiz')}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                {t('quiz.save')}
              </button>
            )}
            <span>{Math.round(progress)}%</span>
          </div>
        </div>
        <div
          className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden"
          role="progressbar"
          aria-valuenow={currentIndex + 1}
          aria-valuemin={1}
          aria-valuemax={questions.length}
          aria-label={t('quiz.progressLabel', { n: currentIndex + 1, total: questions.length })}
        >
          <div className="h-full transition-all duration-700 ease-out" style={{ width: `${progress}%`, background: 'var(--primary)' }} />
        </div>
        {currentQuestion.topic && (
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 break-words">{t('quiz.topic', { topic: currentQuestion.topic })}</p>
        )}
      </div>

      {/* Speichern-Panel */}
      {showSaveInput && onSave && (
        <div className="mx-4 mb-4 p-4 bg-white dark:bg-slate-900 rounded-[20px] border border-indigo-200 dark:border-indigo-800 shadow-lg animate-in slide-in-from-top-4 duration-300">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-3">{t('quiz.saveQuiz')}</p>
          <div className="flex gap-2">
            <input
              autoFocus
              value={saveName}
              onChange={e => setSaveName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { onSave(saveName.trim() || t('quiz.myQuiz'), answers); setShowSaveInput(false); }
                if (e.key === 'Escape') setShowSaveInput(false);
              }}
              placeholder={t('quiz.quizNamePlaceholder')}
              className="flex-1 px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[14px] text-sm font-medium dark:text-white outline-none focus:border-indigo-500 transition-colors"
            />
            <button
              onClick={() => { onSave(saveName.trim() || t('quiz.myQuiz'), answers); setShowSaveInput(false); }}
              className="px-4 py-2 bg-indigo-600 text-white rounded-[14px] text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shrink-0"
            >
              OK
            </button>
            <button onClick={() => setShowSaveInput(false)} className="px-3 py-2 text-slate-400 hover:text-slate-600 text-lg leading-none">×</button>
          </div>
        </div>
      )}

      {/* Question card */}
      <div className="mx-4 bg-white dark:bg-slate-900 rounded-[32px] border border-slate-100 dark:border-slate-800 shadow-3d-raised overflow-hidden">
        {badgeLabel && (
          <div className="px-6 pt-5 pb-1">
            <span className="inline-block bg-indigo-600 text-white text-[8px] font-black uppercase tracking-[0.25em] px-3 py-1 rounded-full">
              {badgeLabel}
            </span>
          </div>
        )}

        <div className="px-6 py-5">
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white leading-snug tracking-tight">
            {currentQuestion.question}
          </h2>
        </div>

        {renderBody()}

        {renderResultFeedback()}

        {/* Erklärung — immer sichtbar nach Antwort (außer Klausurmodus) */}
        {showResult && !isOpen && !examMode && currentQuestion.explanation && (
          <div className="mx-4 mb-4 animate-in slide-in-from-bottom-4 duration-500">
            <div
              className="px-5 py-4 rounded-[20px] border"
              style={!checkCorrectness()
                ? { background: 'color-mix(in srgb, var(--primary) 8%, white)', borderColor: 'color-mix(in srgb, var(--primary) 25%, transparent)' }
                : { background: 'var(--bg-sidebar)', borderColor: 'var(--border-color)' }
              }
            >
              <p className="text-[8px] font-black uppercase tracking-widest mb-1.5"
                style={{ color: !checkCorrectness() ? 'var(--primary)' : '#94a3b8' }}
              >{t('quiz.explanation')}</p>
              <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{currentQuestion.explanation}</p>
              {currentQuestion.sourceReference && (
                <p className="mt-2 text-[9px] text-slate-400 font-black uppercase tracking-widest">{currentQuestion.sourceReference}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Sticky bottom CTA — auf Mobile über der unteren Tab-Navigation, ab md am Rand */}
      <div className="fixed bottom-[calc(3.75rem+env(safe-area-inset-bottom))] md:bottom-0 left-0 right-0 z-20 pointer-events-none">
        <div className="max-w-2xl mx-auto px-4 pb-4 md:pb-6 pt-8 bg-gradient-to-t from-slate-50 dark:from-slate-950 from-60% pointer-events-auto">
          <div className="flex gap-3">
            {onCancel && (
              <button onClick={onCancel} className="text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-rose-500 transition-colors px-4 py-4 shrink-0">
                {t('quiz.cancel')}
              </button>
            )}

            {/* Confirm button — für alle Typen außer Open */}
            {!showResult && !isOpen && (
              <button onClick={handleConfirm} disabled={!canConfirm}
                className={`flex-1 py-4 rounded-[20px] font-black uppercase tracking-widest text-[10px] transition-all min-h-[52px] ${
                  canConfirm ? 'shadow-3d-raised hover:scale-[1.02] active:scale-[0.98]' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                }`}
                style={canConfirm ? { background: 'var(--primary)', color: 'var(--primary-text)' } : undefined}
              >
                {t('quiz.checkAnswer')} <span className="opacity-50 text-[8px] ml-1">↵</span>
              </button>
            )}

            {/* Open: warte auf Sample Answer + Self-Assess */}
            {isOpen && !showSampleAnswer && (
              <div className="flex-1 py-4 rounded-[20px] bg-slate-100 dark:bg-slate-800 text-slate-400 text-[10px] font-black uppercase tracking-widest text-center cursor-not-allowed">
                {t('quiz.showSampleFirst')}
              </div>
            )}

            {/* Next / Finish button */}
            {(showResult || (isOpen && selfAssessCorrect !== null)) && (
              <button onClick={handleNext}
                className="flex-1 py-4 rounded-[20px] font-black uppercase tracking-widest text-[10px] shadow-3d-raised hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 min-h-[52px]"
                style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
              >
                {currentIndex < questions.length - 1 ? t('quiz.nextQuestion') : t('quiz.showResults')}
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
