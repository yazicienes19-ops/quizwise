
import React from 'react';
import { UserAnswer, QuizQuestion } from '../types';
import { EmojiImage } from './EmojiImage';

interface ResultViewProps {
  answers: UserAnswer[];
  questions: QuizQuestion[];
  onRestart: () => void;
}

export const ResultView: React.FC<ResultViewProps> = ({ answers, questions, onRestart }) => {
  const correctCount = answers.filter(a => a.isCorrect).length;
  const scorePercentage = Math.round((correctCount / questions.length) * 100);

  let message = "Das geht noch besser!";
  let icon = "🎯";
  let color = "text-indigo-600 dark:text-indigo-400";
  
  if (scorePercentage >= 90) {
    message = "Hervorragend! Du bist ein Experte.";
    icon = "🏆";
    color = "text-yellow-500 dark:text-yellow-400";
  } else if (scorePercentage >= 70) {
    message = "Sehr gut gemacht!";
    icon = "🌟";
    color = "text-emerald-600 dark:text-emerald-400";
  } else if (scorePercentage >= 50) {
    message = "Nicht schlecht!";
    icon = "📈";
    color = "text-blue-600 dark:text-blue-400";
  }

  return (
    <div className="space-y-8 animate-in zoom-in duration-500 text-center pb-20">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-800 p-12 overflow-hidden relative transition-colors">
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-indigo-500 to-violet-500"></div>
        
        <div className="mb-6 flex justify-center">
          <EmojiImage emoji={icon} size={64} />
        </div>
        <h2 className="text-4xl font-extrabold text-slate-900 dark:text-white mb-2">{scorePercentage}%</h2>
        <p className={`text-xl font-bold ${color} mb-8 uppercase tracking-widest`}>{message}</p>
        
        <div className="grid grid-cols-2 gap-4 max-w-sm mx-auto mb-12">
          <div className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-2xl border border-slate-100 dark:border-slate-800">
            <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">{correctCount}</div>
            <div className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase">Richtig</div>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-2xl border border-slate-100 dark:border-slate-800">
            <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">{questions.length - correctCount}</div>
            <div className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase">Falsch</div>
          </div>
        </div>

        <button
          onClick={onRestart}
          className="w-full bg-indigo-600 text-white px-10 py-5 rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg hover:shadow-indigo-200 dark:hover:shadow-indigo-900/30 hover:-translate-y-1 text-lg flex items-center justify-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Neues Quiz erstellen
        </button>
      </div>

      <div className="space-y-4 text-left">
        <h3 className="text-xl font-bold text-slate-900 dark:text-white px-2">Zusammenfassung</h3>
        <div className="space-y-4">
          {questions.map((q, i) => (
            <div key={i} className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm flex gap-4 transition-colors">
              <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-bold ${answers[i].isCorrect ? 'bg-emerald-100 dark:bg-emerald-900/20 text-emerald-600' : 'bg-rose-100 dark:bg-rose-900/20 text-rose-600'}`}>
                {answers[i].isCorrect ? (
                   <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                   </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
              </div>
              <div>
                <p className="font-bold text-slate-800 dark:text-slate-100 mb-2">{q.question}</p>
                <div className="text-xs space-y-1">
                  <p className="text-slate-500 dark:text-slate-400">
                    <span className="font-bold uppercase tracking-wider text-[10px]">Deine Wahl:</span> {answers[i].selectedOptionIndices.map(idx => q.options[idx]).join(', ')}
                  </p>
                  {!answers[i].isCorrect && (
                    <p className="text-emerald-600 dark:text-emerald-400">
                      <span className="font-bold uppercase tracking-wider text-[10px]">Korrekt:</span> {q.correctAnswerIndices.map(idx => q.options[idx]).join(', ')}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
