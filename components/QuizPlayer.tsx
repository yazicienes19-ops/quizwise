
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { QuizQuestion, UserAnswer } from '../types';
import { EmojiImage } from './EmojiImage';

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

const shuffle = <T,>(arr: T[]): T[] => [...arr].sort(() => Math.random() - 0.5);

export const QuizPlayer: React.FC<QuizPlayerProps> = ({
  questions, onComplete, onCancel, onProgress, onSave, sourceName, examMode, initialAnswers,
}) => {
  const [currentIndex, setCurrentIndex]           = useState(initialAnswers?.length ?? 0);
  const [answers, setAnswers]                     = useState<UserAnswer[]>(initialAnswers ?? []);
  const [showResult, setShowResult]               = useState(false);
  const [showExplanation, setShowExplanation]     = useState(false);
  const [showSaveInput, setShowSaveInput]         = useState(false);
  const [saveName, setSaveName]                   = useState('');

  const [selectedOptions, setSelectedOptions]     = useState<number[]>([]);
  const [showSampleAnswer, setShowSampleAnswer]   = useState(false);
  const [selfAssessCorrect, setSelfAssessCorrect] = useState<boolean | null>(null);
  const [matchAnswer, setMatchAnswer]             = useState<Record<number, string>>({});
  const [clozeAnswer, setClozeAnswer]             = useState<string[]>([]);
  const [numericInput, setNumericInput]           = useState('');
  const [rankingOrder, setRankingOrder]           = useState<string[]>([]);

  const currentQuestion = questions[currentIndex];
  const qt        = currentQuestion?.questionType;
  const isOpen     = qt === 'open' || (!qt && (currentQuestion?.options?.length === 0));
  const isMatching = qt === 'matching';
  const isCloze    = qt === 'cloze';
  const isRanking  = qt === 'ranking';
  const isNumeric  = qt === 'numeric';
  const isScenario = qt === 'scenario';
  const isMcLike   = !isOpen && !isMatching && !isCloze && !isRanking && !isNumeric;

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

  if (!currentQuestion) return null;

  const progress = ((currentIndex + 1) / questions.length) * 100;

  const checkCorrectness = (): boolean => {
    if (isOpen) return selfAssessCorrect ?? false;
    if (isScenario || isMcLike) {
      const ss = [...selectedOptions].sort();
      const sc = [...(currentQuestion.correctAnswerIndices || [])].sort();
      return ss.length === sc.length && ss.every((v, i) => v === sc[i]);
    }
    if (isMatching) return (currentQuestion.matchPairs || []).every((pair, i) => matchAnswer[i] === pair.right);
    if (isCloze)    return (currentQuestion.clozeAnswers || []).every((a, i) => (clozeAnswer[i] || '').trim().toLowerCase() === a.toLowerCase());
    if (isRanking)  return (currentQuestion.rankingItems || []).every((item, i) => item === rankingOrder[i]);
    if (isNumeric) {
      const user = parseFloat(numericInput);
      const correct = currentQuestion.numericAnswer ?? 0;
      const tolerance = currentQuestion.numericTolerance ?? 0;
      return !isNaN(user) && Math.abs(user - correct) <= tolerance;
    }
    return false;
  };

  const canConfirm = (() => {
    if (isOpen)      return selfAssessCorrect !== null;
    if (isMcLike || isScenario) return selectedOptions.length > 0;
    if (isMatching)  return Object.keys(matchAnswer).length === (currentQuestion.matchPairs?.length ?? 0);
    if (isCloze)     return (currentQuestion.clozeAnswers?.length ?? 0) > 0 &&
                            clozeAnswer.filter(a => a.trim()).length === (currentQuestion.clozeAnswers?.length ?? 0);
    if (isRanking)   return rankingOrder.length > 0;
    if (isNumeric)   return numericInput.trim() !== '';
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
      ...(isOpen    ? { textAnswer: '' }              : {}),
      ...(isMatching ? { matchAnswer }                : {}),
      ...(isCloze   ? { clozeAnswer }                : {}),
      ...(isNumeric ? { numericAnswer: parseFloat(numericInput) } : {}),
      ...(isRanking ? { rankingAnswer: rankingOrder } : {}),
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
  }, [currentIndex, questions.length, answers, selectedOptions, isOpen, isMatching, isCloze, isNumeric, isRanking, matchAnswer, clozeAnswer, numericInput, rankingOrder, onComplete]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (showResult) { if (e.key === 'Enter') { e.preventDefault(); handleNext(); } return; }
      if (isMcLike || isScenario) {
        const n = parseInt(e.key);
        if (n >= 1 && n <= (currentQuestion.options?.length ?? 0)) { e.preventDefault(); handleOptionSelect(n - 1); }
      }
      if (e.key === 'Enter' && canConfirm && !isOpen) { e.preventDefault(); handleConfirm(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showResult, isMcLike, isScenario, isOpen, canConfirm, currentQuestion, handleNext, handleOptionSelect, handleConfirm]);

  const TYPE_BADGE: Record<string, string> = {
    open: 'Offene Frage', matching: 'Zuordnung', cloze: 'Lückentext',
    ranking: 'Sortierung', numeric: 'Numerisch', scenario: 'Fallbeispiel',
  };
  const badgeLabel = qt ? TYPE_BADGE[qt] : null;

  /* ── Option style helper ── */
  const getOptionStyle = (idx: number): React.CSSProperties => {
    const isSelected = selectedOptions.includes(idx);
    const isCorrect  = currentQuestion.correctAnswerIndices.includes(idx);
    if (showResult) {
      if (isCorrect)       return { border: '2px solid #10b981', background: '#ecfdf5', color: '#065f46' };
      if (isSelected)      return { border: '2px solid #f43f5e', background: '#fff1f2', color: '#9f1239', opacity: 0.7 };
      return { border: '2px solid #f1f5f9', opacity: 0.3, color: '#94a3b8' };
    }
    if (isSelected) return { border: '2px solid var(--accent)', background: 'var(--accent-soft)', color: 'var(--accent)' };
    return { border: '2px solid #f1f5f9', background: '#f8fafc', color: '#475569' };
  };

  const getLetterStyle = (idx: number): React.CSSProperties => {
    const isSelected = selectedOptions.includes(idx);
    if (isSelected && !showResult) return { background: 'var(--accent)', color: '#ffffff' };
    return { background: '#ffffff', color: '#94a3b8', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.06)' };
  };

  /* ── Result feedback banner ── */
  const renderResultFeedback = () => {
    if (!showResult || isOpen) return null;
    const correct = checkCorrectness();
    return (
      <div className={`mx-4 mb-4 p-4 rounded-[14px] text-center font-black text-[10px] uppercase tracking-widest animate-in slide-in-from-bottom-4 duration-300 ${
        correct
          ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600'
          : 'bg-rose-50 dark:bg-rose-900/20 text-rose-600'
      }`}>
        {correct ? '✓ Richtig!' : '✗ Nicht korrekt'}
      </div>
    );
  };

  /* ── Question body ── */
  const renderBody = () => {
    const scenarioCard = isScenario && currentQuestion.scenarioText ? (
      <div className="mx-4 mb-4 p-4 rounded-[14px] border"
        style={{ background: 'rgba(245,158,11,0.08)', borderColor: 'rgba(245,158,11,0.3)' }}>
        <p className="text-[8px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400 mb-2">Fallbeispiel</p>
        <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{currentQuestion.scenarioText}</p>
      </div>
    ) : null;

    /* MC / Single / TF / Scenario */
    if (isMcLike || isScenario) {
      return (
        <>
          {scenarioCard}
          <div className="px-4 pb-4 space-y-2">
            {currentQuestion.options.map((option, idx) => (
              <button
                key={idx}
                onClick={() => handleOptionSelect(idx)}
                disabled={showResult}
                className="w-full text-left px-5 py-4 rounded-[14px] transition-all duration-200 font-semibold flex items-center gap-4 min-h-[52px]"
                style={getOptionStyle(idx)}
              >
                <span
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-[11px] font-black shrink-0 transition-all"
                  style={getLetterStyle(idx)}
                >
                  {String.fromCharCode(65 + idx)}
                </span>
                <span className="text-sm leading-snug flex-1">{option}</span>
                {!showResult && idx < 4 && (
                  <span className="text-[8px] font-black text-slate-300 shrink-0">{idx + 1}</span>
                )}
                {showResult && currentQuestion.correctAnswerIndices.includes(idx) && (
                  <EmojiImage emoji="✨" size={16} className="ml-auto shrink-0" />
                )}
              </button>
            ))}
          </div>
        </>
      );
    }

    /* Open / Essay */
    if (isOpen) {
      return (
        <div className="px-4 pb-4 space-y-3">
          {!showSampleAnswer ? (
            <button
              onClick={() => setShowSampleAnswer(true)}
              className="w-full py-4 rounded-[14px] font-black text-[10px] uppercase tracking-widest border-2 transition-colors"
              style={{ background: 'var(--accent-soft)', borderColor: 'var(--accent)', color: 'var(--accent)' }}
            >
              Musterantwort anzeigen
            </button>
          ) : (
            <div className="space-y-3 animate-in slide-in-from-bottom-4 duration-500">
              <div className="p-5 rounded-[14px] border"
                style={{ background: 'var(--accent-soft)', borderColor: 'color-mix(in srgb, var(--accent) 30%, transparent)' }}>
                <p className="text-[8px] font-black uppercase tracking-widest mb-2" style={{ color: 'var(--accent)' }}>Musterantwort</p>
                <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{currentQuestion.explanation}</p>
              </div>
              {selfAssessCorrect === null && (
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => handleSelfAssess(true)}
                    className="py-4 rounded-[14px] bg-emerald-600 text-white font-black text-[10px] uppercase tracking-widest transition-opacity hover:opacity-90">
                    ✓ Hatte ich
                  </button>
                  <button onClick={() => handleSelfAssess(false)}
                    className="py-4 rounded-[14px] bg-rose-600 text-white font-black text-[10px] uppercase tracking-widest transition-opacity hover:opacity-90">
                    ✗ Hatte ich nicht
                  </button>
                </div>
              )}
              {selfAssessCorrect !== null && (
                <div className={`p-4 rounded-[14px] text-center font-black text-[10px] uppercase tracking-widest ${
                  selfAssessCorrect ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600' : 'bg-rose-50 dark:bg-rose-900/20 text-rose-600'
                }`}>
                  {selfAssessCorrect ? '✓ Gut gemacht!' : '✗ Zum Wiederholen vorgemerkt'}
                </div>
              )}
            </div>
          )}
        </div>
      );
    }

    /* Matching */
    if (isMatching && currentQuestion.matchPairs) {
      const pairs = currentQuestion.matchPairs;
      return (
        <div className="px-4 pb-4 space-y-3">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 px-1">Weise jedem Begriff die richtige Zuordnung zu</p>
          {pairs.map((pair, li) => {
            const selected  = matchAnswer[li];
            const isCorrect = showResult && selected === pair.right;
            const isWrong   = showResult && selected !== undefined && !isCorrect;
            return (
              <div key={li} className="flex items-center gap-2">
                <div className="flex-1 p-3 rounded-[12px] border text-sm font-bold min-w-0 truncate text-slate-800 dark:text-white"
                  style={{ background: 'var(--accent-soft)', borderColor: 'color-mix(in srgb, var(--accent) 25%, transparent)' }}>
                  {pair.left}
                </div>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-slate-400">
                  <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                </svg>
                {!showResult ? (
                  <select
                    value={selected ?? ''}
                    onChange={e => setMatchAnswer(prev => ({ ...prev, [li]: e.target.value }))}
                    className="flex-1 p-3 bg-white dark:bg-slate-800 rounded-[12px] border-2 border-slate-200 dark:border-slate-700 text-sm font-medium dark:text-white outline-none transition-colors"
                  >
                    <option value="">— auswählen —</option>
                    {shuffledRight.map((r, ri) => <option key={ri} value={r}>{r}</option>)}
                  </select>
                ) : (
                  <div className={`flex-1 p-3 rounded-[12px] border-2 text-sm font-medium ${
                    isCorrect ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700'
                      : isWrong ? 'border-rose-400 bg-rose-50 dark:bg-rose-950/20 text-rose-700'
                      : 'border-slate-200 bg-slate-50 dark:bg-slate-800 text-slate-400'
                  }`}>
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

    /* Cloze */
    if (isCloze && currentQuestion.clozeText) {
      const parts = currentQuestion.clozeText.split('__LÜCKE__');
      return (
        <div className="px-4 pb-4">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-4 px-1">Fülle die Lücken aus</p>
          <div className="text-base leading-loose text-slate-800 dark:text-slate-200 px-2">
            {parts.map((part, pi) => {
              const userBlank    = clozeAnswer[pi] || '';
              const correctBlank = currentQuestion.clozeAnswers?.[pi] || '';
              const ok    = showResult && userBlank.trim().toLowerCase() === correctBlank.toLowerCase();
              const wrong = showResult && !ok && pi < parts.length - 1;
              return (
                <React.Fragment key={pi}>
                  {part}
                  {pi < parts.length - 1 && (
                    showResult ? (
                      <span className={`mx-1 inline-flex items-center gap-1 px-2 py-0.5 rounded font-bold ${
                        ok ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700' : 'bg-rose-100 dark:bg-rose-900/30 text-rose-700'
                      }`}>
                        {userBlank || '—'}
                        {wrong && <span className="text-emerald-600 dark:text-emerald-400 text-xs">→ {correctBlank}</span>}
                      </span>
                    ) : (
                      <input
                        type="text" value={userBlank}
                        onChange={e => { const next = [...clozeAnswer]; next[pi] = e.target.value; setClozeAnswer(next); }}
                        placeholder="..."
                        className="mx-1 px-3 py-0.5 border-b-2 bg-transparent outline-none font-bold min-w-[80px] text-center"
                        style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
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

    /* Ranking */
    if (isRanking && currentQuestion.rankingItems) {
      const correct = currentQuestion.rankingItems;
      return (
        <div className="px-4 pb-4 space-y-2">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-3 px-1">Bringe die Elemente in die richtige Reihenfolge</p>
          {rankingOrder.map((item, i) => {
            const isCorrect = showResult && correct[i] === item;
            const isWrong   = showResult && !isCorrect;
            return (
              <div key={item} className={`flex items-center gap-3 p-3 rounded-[12px] border-2 transition-all ${
                showResult
                  ? isCorrect ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/20'
                               : 'border-rose-400 bg-rose-50 dark:bg-rose-950/20'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
              }`}>
                <span className="w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-black shrink-0"
                  style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                  {i + 1}
                </span>
                <span className={`flex-1 text-sm font-medium ${
                  showResult ? isCorrect ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300' : 'text-slate-700 dark:text-slate-300'
                }`}>{item}</span>
                {isWrong && (
                  <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 shrink-0">
                    → Pos. {correct.indexOf(item) + 1}
                  </span>
                )}
                {!showResult && (
                  <div className="flex flex-col gap-1 shrink-0">
                    <button disabled={i === 0} onClick={() => { const next = [...rankingOrder]; [next[i-1], next[i]] = [next[i], next[i-1]]; setRankingOrder(next); }}
                      className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-500 text-xs flex items-center justify-center disabled:opacity-30 transition-colors">▲</button>
                    <button disabled={i === rankingOrder.length - 1} onClick={() => { const next = [...rankingOrder]; [next[i], next[i+1]] = [next[i+1], next[i]]; setRankingOrder(next); }}
                      className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-500 text-xs flex items-center justify-center disabled:opacity-30 transition-colors">▼</button>
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

    /* Numeric */
    if (isNumeric) {
      const userNum   = parseFloat(numericInput);
      const correct   = currentQuestion.numericAnswer ?? 0;
      const tolerance = currentQuestion.numericTolerance ?? 0;
      const ok    = showResult && !isNaN(userNum) && Math.abs(userNum - correct) <= tolerance;
      const wrong = showResult && !ok;
      return (
        <div className="px-4 pb-4 space-y-4">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 px-1">Gib die Zahl ein</p>
          <div className="flex items-center gap-3 max-w-xs">
            <input
              type="number" value={numericInput}
              onChange={e => { if (!showResult) setNumericInput(e.target.value); }}
              disabled={showResult} placeholder="0"
              className={`flex-1 p-4 rounded-[14px] border-2 outline-none transition-all text-xl font-black text-center dark:text-white ${
                showResult
                  ? ok ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700'
                       : 'border-rose-400 bg-rose-50 dark:bg-rose-950/20 text-rose-700'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
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
    <div className="max-w-2xl mx-auto animate-in fade-in duration-700 pb-36">
      {/* Header */}
      <div className="px-4 pt-6 space-y-3 mb-6">
        {sourceName && (
          <p className="text-[9px] font-black uppercase tracking-[0.3em] truncate" style={{ color: 'var(--accent)' }}>
            {sourceName}
          </p>
        )}
        <div className="flex justify-between items-center text-[10px] font-black uppercase text-slate-400 tracking-widest">
          <span>Frage {currentIndex + 1} / {questions.length}</span>
          <div className="flex items-center gap-3">
            {onSave && (
              <button
                onClick={() => { setSaveName(sourceName || 'Mein Quiz'); setShowSaveInput(v => !v); }}
                className="flex items-center gap-1 text-slate-400 transition-colors"
                title="Quiz speichern"
                style={{ color: '#94a3b8' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')}
                onMouseLeave={e => (e.currentTarget.style.color = '#94a3b8')}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                Speichern
              </button>
            )}
            <span>{Math.round(progress)}%</span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${progress}%`, background: 'var(--accent)' }} />
        </div>
        {currentQuestion.topic && (
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 truncate">Thema: {currentQuestion.topic}</p>
        )}
      </div>

      {/* Save panel */}
      {showSaveInput && onSave && (
        <div className="mx-4 mb-4 p-4 bg-white dark:bg-slate-900 rounded-[16px] border border-slate-200 dark:border-slate-700 shadow-sm animate-in slide-in-from-top-4 duration-300">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-3">Quiz speichern</p>
          <div className="flex gap-2">
            <input
              autoFocus value={saveName}
              onChange={e => setSaveName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { onSave(saveName.trim() || 'Mein Quiz', answers); setShowSaveInput(false); }
                if (e.key === 'Escape') setShowSaveInput(false);
              }}
              placeholder="Quiz-Name..."
              className="flex-1 px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[11px] text-sm font-medium dark:text-white outline-none transition-colors"
            />
            <button
              onClick={() => { onSave(saveName.trim() || 'Mein Quiz', answers); setShowSaveInput(false); }}
              className="px-4 py-2 text-white rounded-[11px] text-[10px] font-black uppercase tracking-widest transition-opacity hover:opacity-90 shrink-0"
              style={{ background: 'var(--accent)' }}
            >OK</button>
            <button onClick={() => setShowSaveInput(false)} className="px-3 py-2 text-slate-400 hover:text-slate-600 text-lg leading-none">×</button>
          </div>
        </div>
      )}

      {/* Question card */}
      <div className="mx-4 bg-white dark:bg-slate-900 rounded-[20px] border border-slate-200 dark:border-slate-800 overflow-hidden">
        {badgeLabel && (
          <div className="px-6 pt-5 pb-1">
            <span className="inline-block text-white text-[8px] font-black uppercase tracking-[0.25em] px-3 py-1 rounded-full"
              style={{ background: 'var(--icon-box)' }}>
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

        {/* Erklärung */}
        {showResult && !isOpen && !examMode && currentQuestion.explanation && (
          <div className="mx-4 mb-4 animate-in slide-in-from-bottom-4 duration-500">
            <div className="px-5 py-4 rounded-[14px] border"
              style={!checkCorrectness()
                ? { background: 'var(--accent-soft)', borderColor: 'color-mix(in srgb, var(--accent) 30%, transparent)' }
                : { background: 'var(--bg-sidebar)', borderColor: 'var(--border)' }
              }
            >
              <p className="text-[8px] font-black uppercase tracking-widest mb-1.5"
                style={{ color: !checkCorrectness() ? 'var(--accent)' : '#94a3b8' }}>
                Erklärung
              </p>
              <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{currentQuestion.explanation}</p>
              {currentQuestion.sourceReference && (
                <p className="mt-2 text-[9px] text-slate-400 font-black uppercase tracking-widest">{currentQuestion.sourceReference}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Sticky bottom CTA */}
      <div className="fixed bottom-0 left-0 right-0 z-20 pointer-events-none">
        <div className="max-w-2xl mx-auto px-4 pb-6 pt-8 bg-gradient-to-t from-slate-50 dark:from-slate-950 from-60% pointer-events-auto">
          <div className="flex gap-3">
            {onCancel && (
              <button onClick={onCancel}
                className="text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-rose-500 transition-colors px-4 py-4 shrink-0">
                Abbrechen
              </button>
            )}

            {!showResult && !isOpen && (
              <button onClick={handleConfirm} disabled={!canConfirm}
                className={`flex-1 py-4 rounded-[16px] font-black uppercase tracking-widest text-[10px] transition-all min-h-[52px] ${
                  canConfirm ? 'text-white hover:scale-[1.02] active:scale-[0.98]' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                }`}
                style={canConfirm ? { background: 'var(--accent)' } : undefined}
              >
                Antwort prüfen <span className="opacity-50 text-[8px] ml-1">↵</span>
              </button>
            )}

            {isOpen && !showSampleAnswer && (
              <div className="flex-1 py-4 rounded-[16px] bg-slate-100 dark:bg-slate-800 text-slate-400 text-[10px] font-black uppercase tracking-widest text-center cursor-not-allowed">
                Musterantwort erst anzeigen
              </div>
            )}

            {(showResult || (isOpen && selfAssessCorrect !== null)) && (
              <button onClick={handleNext}
                className="flex-1 py-4 rounded-[16px] font-black uppercase tracking-widest text-[10px] text-white hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 min-h-[52px]"
                style={{ background: 'var(--accent)' }}
              >
                {currentIndex < questions.length - 1 ? 'Nächste Frage' : 'Ergebnisse anzeigen'}
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
