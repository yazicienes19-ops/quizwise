
import React, { useState } from 'react';
import { QuizQuestion, UserAnswer } from '../types';
import { EmojiImage } from './EmojiImage';

interface QuizPlayerProps {
  questions: QuizQuestion[];
  onComplete: (answers: UserAnswer[]) => void;
}

export const QuizPlayer: React.FC<QuizPlayerProps> = ({ questions, onComplete }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOptions, setSelectedOptions] = useState<number[]>([]);
  const [answers, setAnswers] = useState<UserAnswer[]>([]);
  const [showResult, setShowResult] = useState(false);

  const currentQuestion = questions[currentIndex];
  const progress = ((currentIndex + 1) / questions.length) * 100;

  const handleOptionSelect = (idx: number) => {
    if (showResult) return;

    if (currentQuestion.isMultipleChoice) {
      setSelectedOptions(prev => 
        prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
      );
    } else {
      setSelectedOptions([idx]);
    }
  };

  const checkCorrectness = () => {
    const sortedSelected = [...selectedOptions].sort();
    const sortedCorrect = [...currentQuestion.correctAnswerIndices].sort();
    return sortedSelected.length === sortedCorrect.length && 
           sortedSelected.every((val, index) => val === sortedCorrect[index]);
  };

  const handleNext = () => {
    if (selectedOptions.length === 0) return;

    const newAnswer: UserAnswer = {
      questionIndex: currentIndex,
      selectedOptionIndices: selectedOptions,
      isCorrect: checkCorrectness()
    };

    const newAnswers = [...answers, newAnswer];
    setAnswers(newAnswers);

    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setSelectedOptions([]);
      setShowResult(false);
    } else {
      onComplete(newAnswers);
    }
  };

  const handleShowExplanation = () => {
    if (selectedOptions.length > 0) {
      setShowResult(true);
    }
  };

  return (
    <div className="space-y-8 lg:space-y-16 animate-in fade-in slide-in-from-right-12 duration-1000 py-6 lg:py-10 px-2 sm:px-4">
      <div className="space-y-6 lg:space-y-8 max-w-2xl mx-auto">
        <div className="flex justify-between items-center text-[10px] lg:text-[11px] font-black uppercase text-slate-400 tracking-[0.2em] lg:tracking-[0.4em]">
          <span>Frage {currentIndex + 1} / {questions.length}</span>
          <span className="font-mono">{Math.round(progress)}%</span>
        </div>
        <div className="w-full h-2 lg:h-3 bg-slate-200 dark:bg-slate-800 rounded-full shadow-inner overflow-hidden border border-white/50 dark:border-slate-700">
          <div 
            className="h-full bg-indigo-600 transition-all duration-1000 ease-in-out shadow-[0_0_12px_rgba(79,70,229,0.5)]" 
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-[40px] lg:rounded-[56px] border border-white dark:border-slate-800 p-8 sm:p-12 lg:p-24 transition-all relative shadow-3d-deep">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-indigo-600 text-white px-6 lg:px-10 py-2.5 lg:py-3 rounded-full text-[9px] lg:text-[11px] font-black uppercase tracking-[0.2em] lg:tracking-[0.3em] shadow-[0_12px_24px_rgba(79,70,229,0.4)] z-10 border-2 border-indigo-400 whitespace-nowrap">
          {currentQuestion.isMultipleChoice ? 'Multiple Choice' : 'Single Choice'}
        </div>

        <div className="mb-12 lg:mb-20 space-y-4">
          <h2 className="text-2xl sm:text-3xl lg:text-5xl font-black text-slate-900 dark:text-white leading-tight tracking-tighter">
            {currentQuestion.question}
          </h2>
          {currentQuestion.isMultipleChoice && (
            <p className="text-[10px] font-black uppercase text-indigo-500 tracking-widest animate-pulse flex items-center gap-2">
              Wähle alle zutreffenden Antworten <EmojiImage emoji="👆" size={12} />
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 lg:gap-6">
          {currentQuestion.options.map((option, idx) => {
            const isSelected = selectedOptions.includes(idx);
            const isCorrect = currentQuestion.correctAnswerIndices.includes(idx);
            
            let variant = "border-slate-100 dark:border-slate-800 hover:border-indigo-300 bg-slate-50 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300 shadow-sm";
            
            if (isSelected) {
              variant = "border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 shadow-3d-raised ring-2 ring-indigo-600/50 text-indigo-900 dark:text-indigo-400 scale-[1.02]";
            }
            
            if (showResult) {
              if (isCorrect) {
                variant = "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-400 shadow-[0_8px_20px_rgba(16,185,129,0.2)] scale-[1.02] z-10";
              } else if (isSelected) {
                variant = "border-rose-500 bg-rose-50 dark:bg-rose-950/20 text-rose-800 dark:text-rose-400 opacity-60 scale-[0.98]";
              } else {
                variant = "border-slate-100 dark:border-slate-800 opacity-20 text-slate-400 dark:text-slate-600 scale-[0.95]";
              }
            }

            return (
              <button
                key={idx}
                onClick={() => handleOptionSelect(idx)}
                disabled={showResult}
                className={`
                  w-full text-left px-6 lg:px-10 py-6 lg:py-8 rounded-[24px] lg:rounded-[32px] border-2 transition-all duration-500 font-black flex items-center justify-between
                  ${variant}
                `}
              >
                <span className="flex items-center gap-4 lg:gap-8">
                  <span className={`w-8 h-8 lg:w-12 lg:h-12 rounded-xl lg:rounded-2xl flex items-center justify-center text-[11px] lg:text-[13px] font-black transition-all ${isSelected ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white dark:bg-slate-800 text-slate-400 shadow-inner'}`}>
                    {currentQuestion.isMultipleChoice ? (
                      isSelected ? '✓' : ''
                    ) : String.fromCharCode(65 + idx)}
                  </span>
                  <span className="text-lg lg:text-2xl tracking-tight">{option}</span>
                </span>
                {showResult && isCorrect && (
                   <EmojiImage emoji="✨" size={20} />
                )}
              </button>
            );
          })}
        </div>

        {showResult && (
          <div className="mt-12 lg:mt-16 space-y-6 lg:space-y-8 animate-in slide-in-from-bottom-8 duration-700">
            <div className="p-8 lg:p-12 rounded-[30px] lg:rounded-[40px] bg-slate-50 dark:bg-slate-800 border border-white dark:border-slate-700 shadow-inner">
              <h4 className="text-[10px] lg:text-[11px] font-black uppercase text-indigo-600 tracking-[0.3em] mb-4 lg:mb-6">Synthese</h4>
              <p className="text-slate-700 dark:text-slate-300 leading-relaxed text-lg lg:text-xl font-medium">
                {currentQuestion.explanation}
              </p>
            </div>
          </div>
        )}

        <div className="mt-16 lg:mt-20 flex flex-col md:flex-row justify-between items-center gap-6 border-t-2 border-slate-50 dark:border-slate-800 pt-10 lg:pt-16">
          <button 
            onClick={() => window.location.reload()}
            className="text-[10px] lg:text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 hover:text-rose-500 transition-colors py-2"
          >
            Abbrechen
          </button>
          
          {!showResult ? (
            <button
              onClick={handleShowExplanation}
              disabled={selectedOptions.length === 0}
              className={`
                w-full md:w-auto px-12 lg:px-16 py-5 lg:py-6 rounded-[24px] lg:rounded-[32px] font-black uppercase tracking-[0.2em] text-[11px] transition-all duration-500 shadow-3d-raised
                ${selectedOptions.length > 0 
                  ? 'bg-indigo-600 text-white hover:scale-110 active:scale-95 hover:shadow-3d-deep' 
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'}
              `}
            >
              Bestätigen
            </button>
          ) : (
            <button
              onClick={handleNext}
              className="w-full md:w-auto bg-indigo-600 text-white px-12 lg:px-16 py-5 lg:py-6 rounded-[24px] lg:rounded-[32px] font-black uppercase tracking-[0.2em] text-[11px] hover:scale-110 active:scale-95 transition-all shadow-3d-deep flex items-center justify-center gap-4"
            >
              {currentIndex < questions.length - 1 ? 'Nächste' : 'Ergebnisse'}
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12"></line>
                <polyline points="12 5 19 12 12 19"></polyline>
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
