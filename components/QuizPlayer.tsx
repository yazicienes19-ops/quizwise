import React, { useState, useEffect } from 'react';
import { QuizQuestion, UserAnswer } from '../types';
import { EmojiImage } from './EmojiImage';

interface QuizPlayerProps {
  questions: QuizQuestion[];
  onComplete: (answers: UserAnswer[]) => void;
  onCancel?: () => void;
  sourceName?: string;
  examMode?: boolean;
}

export const QuizPlayer: React.FC<QuizPlayerProps> = ({ questions, onComplete, onCancel, sourceName, examMode }) => {
  const [currentIndex, setCurrentIndex]       = useState(0);
  const [selectedOptions, setSelectedOptions] = useState<number[]>([]);
  const [answers, setAnswers]                 = useState<UserAnswer[]>([]);
  const [showResult, setShowResult]           = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  // Open question state
  const [showSampleAnswer, setShowSampleAnswer] = useState(false);
  const [selfAssessCorrect, setSelfAssessCorrect] = useState<boolean | null>(null);

  const currentQuestion = questions[currentIndex];
  const progress        = ((currentIndex) / questions.length) * 100;
  const isOpenQuestion  = currentQuestion.options.length === 0 || currentQuestion.questionType === 'open';

  useEffect(() => {
    setSelectedOptions([]);
    setShowResult(false);
    setShowExplanation(false);
    setShowSampleAnswer(false);
    setSelfAssessCorrect(null);
  }, [currentIndex]);

  const handleOptionSelect = (idx: number) => {
    if (showResult) return;
    setSelectedOptions(prev => prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]);
  };

  const checkMcCorrectness = () => {
    const ss = [...selectedOptions].sort();
    const sc = [...currentQuestion.correctAnswerIndices].sort();
    return ss.length === sc.length && ss.every((v, i) => v === sc[i]);
  };

  const handleConfirm = () => {
    if (isOpenQuestion || selectedOptions.length === 0) return;
    setShowResult(true);
    if (!examMode) setShowExplanation(true);
  };

  const handleSelfAssess = (correct: boolean) => {
    setSelfAssessCorrect(correct);
    setShowResult(true);
  };

  const handleNext = () => {
    const isCorrect = isOpenQuestion ? (selfAssessCorrect ?? false) : checkMcCorrectness();
    const newAnswer: UserAnswer = {
      questionIndex: currentIndex,
      selectedOptionIndices: selectedOptions,
      isCorrect,
    };
    const newAnswers = [...answers, newAnswer];
    setAnswers(newAnswers);
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      onComplete(newAnswers);
    }
  };

  const canConfirm = isOpenQuestion ? selfAssessCorrect !== null : selectedOptions.length > 0;

  return (
    <div className="max-w-2xl mx-auto animate-in fade-in duration-700 pb-36">
      {/* Header: source + progress */}
      <div className="px-4 pt-6 lg:pt-10 space-y-3 mb-6">
        {sourceName && (
          <p className="text-[9px] font-black uppercase tracking-[0.3em] text-indigo-500 truncate">{sourceName}</p>
        )}
        <div className="flex justify-between items-center text-[10px] font-black uppercase text-slate-400 tracking-widest">
          <span>Frage {currentIndex + 1} / {questions.length}</span>
          <span>{Math.round(((currentIndex + 1) / questions.length) * 100)}%</span>
        </div>
        <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-600 transition-all duration-700 ease-out"
            style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
          />
        </div>
        {currentQuestion.topic && (
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 truncate">
            Thema: {currentQuestion.topic}
          </p>
        )}
      </div>

      {/* Question card */}
      <div className="mx-4 bg-white dark:bg-slate-900 rounded-[32px] border border-slate-100 dark:border-slate-800 shadow-3d-raised overflow-hidden">
        {/* Type badge — nur für offene Fragen */}
        {isOpenQuestion && (
          <div className="px-6 pt-5 pb-1">
            <span className="inline-block bg-indigo-600 text-white text-[8px] font-black uppercase tracking-[0.25em] px-3 py-1 rounded-full">
              Offene Frage
            </span>
          </div>
        )}

        {/* Question */}
        <div className={`px-6 py-5 ${isOpenQuestion ? '' : 'pt-5'}`}>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white leading-snug tracking-tight">
            {currentQuestion.question}
          </h2>
        </div>

        {/* Answers */}
        <div className="px-4 pb-4 space-y-2">
          {isOpenQuestion ? (
            /* Open question flow */
            <div className="space-y-3">
              {!showSampleAnswer ? (
                <button
                  onClick={() => setShowSampleAnswer(true)}
                  className="w-full py-4 rounded-[20px] bg-indigo-50 dark:bg-indigo-900/20 border-2 border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 font-black text-[10px] uppercase tracking-widest hover:bg-indigo-100 transition-colors"
                >
                  Musterantwort anzeigen
                </button>
              ) : (
                <div className="space-y-3 animate-in slide-in-from-bottom-4 duration-500">
                  <div className="p-5 bg-indigo-50 dark:bg-indigo-900/20 rounded-[20px] border border-indigo-200 dark:border-indigo-800">
                    <p className="text-[8px] font-black uppercase tracking-widest text-indigo-500 mb-2">Musterantwort</p>
                    <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{currentQuestion.explanation}</p>
                  </div>
                  {selfAssessCorrect === null && (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleSelfAssess(true)}
                        className="py-4 rounded-[20px] bg-emerald-600 text-white font-black text-[10px] uppercase tracking-widest hover:bg-emerald-700 transition-colors"
                      >
                        ✓ Hatte ich
                      </button>
                      <button
                        onClick={() => handleSelfAssess(false)}
                        className="py-4 rounded-[20px] bg-rose-600 text-white font-black text-[10px] uppercase tracking-widest hover:bg-rose-700 transition-colors"
                      >
                        ✗ Hatte ich nicht
                      </button>
                    </div>
                  )}
                  {selfAssessCorrect !== null && (
                    <div className={`p-4 rounded-[20px] text-center font-black text-[10px] uppercase tracking-widest ${selfAssessCorrect ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600' : 'bg-rose-50 dark:bg-rose-900/20 text-rose-600'}`}>
                      {selfAssessCorrect ? '✓ Gut gemacht!' : '✗ Zum Wiederholen vorgemerkt'}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* MC / Single / True-False */
            currentQuestion.options.map((option, idx) => {
              const isSelected = selectedOptions.includes(idx);
              const isCorrect  = currentQuestion.correctAnswerIndices.includes(idx);

              let cls = 'border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300 hover:border-indigo-300';
              if (isSelected && !showResult) cls = 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 ring-2 ring-indigo-600/30 text-indigo-900 dark:text-indigo-200';
              if (showResult) {
                if (isCorrect)        cls = 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300';
                else if (isSelected)  cls = 'border-rose-500 bg-rose-50 dark:bg-rose-950/20 text-rose-800 dark:text-rose-300 opacity-70';
                else                  cls = 'border-slate-100 dark:border-slate-800 opacity-30 text-slate-400 dark:text-slate-600';
              }

              return (
                <button
                  key={idx}
                  onClick={() => handleOptionSelect(idx)}
                  disabled={showResult}
                  className={`w-full text-left px-5 py-4 rounded-[20px] border-2 transition-all duration-300 font-semibold flex items-center gap-4 ${cls}`}
                >
                  <span className={`w-8 h-8 rounded-xl flex items-center justify-center text-[11px] font-black shrink-0 transition-all ${isSelected && !showResult ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-400 shadow-inner'}`}>
                    {String.fromCharCode(65 + idx)}
                  </span>
                  <span className="text-sm sm:text-base leading-snug">{option}</span>
                  {showResult && isCorrect && <EmojiImage emoji="✨" size={16} className="ml-auto shrink-0" />}
                </button>
              );
            })
          )}
        </div>

        {/* Explanation (after answer, not in exam mode) */}
        {showResult && !isOpenQuestion && !examMode && (
          <div className="mx-4 mb-4 animate-in slide-in-from-bottom-4 duration-500">
            <button
              onClick={() => setShowExplanation(v => !v)}
              className="w-full flex items-center justify-between px-5 py-3 bg-slate-50 dark:bg-slate-800 rounded-[20px] text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400"
            >
              <span>Erklärung</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${showExplanation ? 'rotate-180' : ''}`}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
            {showExplanation && (
              <div className="mt-2 px-5 py-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-[20px] border border-indigo-100 dark:border-indigo-900/30 animate-in slide-in-from-top-2 duration-300">
                <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{currentQuestion.explanation}</p>
                {currentQuestion.sourceReference && (
                  <p className="mt-2 text-[9px] text-slate-400 font-black uppercase tracking-widest">{currentQuestion.sourceReference}</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sticky bottom CTA */}
      <div className="fixed bottom-0 left-0 right-0 z-20 pointer-events-none">
        <div className="max-w-2xl mx-auto px-4 pb-6 pt-8 bg-gradient-to-t from-slate-50 dark:from-slate-950 from-60% pointer-events-auto">
          <div className="flex gap-3">
            {onCancel && (
              <button
                onClick={onCancel}
                className="text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-rose-500 transition-colors px-4 py-4 shrink-0"
              >
                Abbrechen
              </button>
            )}
            {!showResult && !isOpenQuestion && (
              <button
                onClick={handleConfirm}
                disabled={!canConfirm}
                className={`flex-1 py-4 rounded-[20px] font-black uppercase tracking-widest text-[10px] transition-all ${
                  canConfirm
                    ? 'bg-indigo-600 text-white shadow-3d-raised hover:scale-[1.02] active:scale-[0.98]'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                }`}
              >
                Antwort prüfen
              </button>
            )}
            {(showResult || (isOpenQuestion && selfAssessCorrect !== null)) && (
              <button
                onClick={handleNext}
                className="flex-1 bg-indigo-600 text-white py-4 rounded-[20px] font-black uppercase tracking-widest text-[10px] shadow-3d-raised hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                {currentIndex < questions.length - 1 ? 'Nächste Frage' : 'Ergebnisse anzeigen'}
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                </svg>
              </button>
            )}
            {/* Open question: show placeholder while waiting for sample answer reveal */}
            {isOpenQuestion && !showSampleAnswer && !showResult && (
              <div className="flex-1 py-4 rounded-[20px] bg-slate-100 dark:bg-slate-800 text-slate-400 text-[10px] font-black uppercase tracking-widest text-center cursor-not-allowed">
                Musterantwort erst anzeigen
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
