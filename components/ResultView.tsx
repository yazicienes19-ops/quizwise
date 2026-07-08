import React, { useState } from 'react';
import { UserAnswer, QuizQuestion } from '../types';
import { EmojiImage } from './EmojiImage';
import { computeCalibration, calibrationPct, MIN_CALIBRATED_FOR_DISPLAY } from '../services/calibration';

interface ResultViewProps {
  answers: UserAnswer[];
  questions: QuizQuestion[];
  onRestart: () => void;
  docName?: string;
  onRetryWrong?: (wrongQuestions: QuizQuestion[]) => void;
  onGoToSource?: () => void;
  onCreateFlashcards?: (wrongQuestions: QuizQuestion[]) => void;
  onSaveQuiz?: (name: string) => void;
}

export const ResultView: React.FC<ResultViewProps> = ({
  answers, questions, onRestart, docName,
  onRetryWrong, onGoToSource, onCreateFlashcards, onSaveQuiz,
}) => {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [saveName, setSaveName] = useState(docName ? `Quiz — ${docName}` : 'Mein Quiz');
  const [saved, setSaved] = useState(false);

  const correctCount    = answers.filter(a => a.isCorrect).length;
  const wrongCount      = answers.length - correctCount;
  const score           = Math.round((correctCount / answers.length) * 100);
  const wrongQuestions  = questions.filter((_, i) => !answers[i]?.isCorrect);

  const weakTopics  = [...new Set(wrongQuestions.map(q => q.topic).filter((t): t is string => Boolean(t)))];
  const strongTopics = [...new Set(
    questions.filter((_, i) => answers[i]?.isCorrect)
      .map(q => q.topic)
      .filter((t): t is string => Boolean(t) && !weakTopics.includes(t))
  )].slice(0, 4);

  const grade = score >= 90 ? { label: 'Hervorragend', icon: '🏆', color: 'text-yellow-500' }
    : score >= 75 ? { label: 'Sehr gut', icon: '🌟', color: 'text-emerald-600' }
    : score >= 55 ? { label: 'Gut', icon: '📈', color: 'text-indigo-600' }
    : { label: 'Noch Luft nach oben', icon: '🎯', color: 'text-rose-500' };

  // Metakognitive Kalibrierung: Selbsteinschätzung vs. tatsächliches Ergebnis (nur MC-artige Fragen, v1)
  const calibration = computeCalibration(answers);
  const pct = (n: number) => calibrationPct(n, calibration.total);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 lg:py-10 space-y-6 animate-in zoom-in-95 duration-500 pb-20">
      {/* Score hero */}
      <div className="bg-white dark:bg-slate-900 rounded-[32px] border border-slate-100 dark:border-slate-800 shadow-3d-raised overflow-hidden">
        <div className="h-1.5 bg-gradient-to-r from-indigo-500 to-violet-500" style={{ width: `${score}%`, transition: 'width 1s ease' }} />
        <div className="p-8 text-center space-y-4">
          <EmojiImage emoji={grade.icon} size={52} className="mx-auto" />
          <div>
            <p className={`text-6xl font-black ${grade.color}`}>{score}%</p>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mt-1">{grade.label}</p>
          </div>
          {docName && (
            <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500 break-words">{docName}</p>
          )}
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 divide-x divide-slate-100 dark:divide-slate-800 border-t border-slate-100 dark:border-slate-800">
          <div className="py-4 text-center">
            <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{correctCount}</p>
            <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mt-0.5">Richtig</p>
          </div>
          <div className="py-4 text-center">
            <p className="text-2xl font-black text-rose-500">{wrongCount}</p>
            <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mt-0.5">Falsch</p>
          </div>
          <div className="py-4 text-center">
            <p className="text-2xl font-black text-slate-800 dark:text-white">{answers.length}</p>
            <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mt-0.5">Gesamt</p>
          </div>
        </div>
      </div>

      {/* Weak / strong topics */}
      {(weakTopics.length > 0 || strongTopics.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {weakTopics.length > 0 && (
            <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 rounded-[24px] p-5">
              <p className="text-[9px] font-black uppercase tracking-widest text-rose-500 mb-3 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                Schwache Themen
              </p>
              <div className="flex flex-wrap gap-1.5">
                {weakTopics.map(t => (
                  <span key={t} className="text-[9px] font-black px-2.5 py-1 rounded-full bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400">{t}</span>
                ))}
              </div>
            </div>
          )}
          {strongTopics.length > 0 && (
            <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/30 rounded-[24px] p-5">
              <p className="text-[9px] font-black uppercase tracking-widest text-emerald-600 mb-3 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Starke Themen
              </p>
              <div className="flex flex-wrap gap-1.5">
                {strongTopics.map(t => (
                  <span key={t} className="text-[9px] font-black px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">{t}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Metakognitive Kalibrierung: Selbsteinschätzung vs. Ergebnis */}
      {calibration.total >= MIN_CALIBRATED_FOR_DISPLAY && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[24px] p-5">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-3">Deine Selbsteinschätzung</p>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <p className="text-xl font-black text-emerald-600 dark:text-emerald-400">{pct(calibration.wellCalibrated)}%</p>
              <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mt-0.5 leading-tight">Gut<br />kalibriert</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-black text-rose-500">{pct(calibration.overconfident)}%</p>
              <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mt-0.5 leading-tight">Über-<br />schätzt</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-black text-amber-500">{pct(calibration.underconfident)}%</p>
              <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mt-0.5 leading-tight">Unter-<br />schätzt</p>
            </div>
          </div>
        </div>
      )}

      {/* Save quiz offline */}
      {onSaveQuiz && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[24px] p-5 space-y-3 shadow-3d-raised">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Offline speichern</p>
          {saved ? (
            <div className="flex items-center gap-2 text-emerald-600">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              <span className="text-sm font-black">Quiz gespeichert — offline abrufbar</span>
            </div>
          ) : showSaveInput ? (
            <div className="flex gap-2">
              <input
                autoFocus
                value={saveName}
                onChange={e => setSaveName(e.target.value)}
                className="flex-1 px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[16px] text-sm font-medium dark:text-white outline-none focus:border-indigo-500 transition-colors"
                placeholder="Quiz-Name..."
              />
              <button
                onClick={() => { onSaveQuiz(saveName.trim() || 'Mein Quiz'); setSaved(true); setShowSaveInput(false); }}
                className="px-5 py-2.5 bg-indigo-600 text-white rounded-[16px] text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shrink-0"
              >
                Speichern
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowSaveInput(true)}
              className="w-full flex items-center justify-between px-5 py-3.5 bg-slate-50 dark:bg-slate-800 rounded-[18px] hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              <div className="flex items-center gap-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-600"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                <span className="text-sm font-black dark:text-white">Quiz für offline speichern</span>
              </div>
              <span className="text-[9px] text-slate-400 font-black">{questions.length} Fragen</span>
            </button>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="space-y-2">
        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 px-1">Nächster Schritt</p>

        {wrongQuestions.length > 0 && onRetryWrong && (
          <button
            onClick={() => onRetryWrong(wrongQuestions)}
            className="w-full flex items-center justify-between px-6 py-5 bg-indigo-600 text-white rounded-[24px] shadow-3d-deep hover:scale-[1.01] active:scale-[0.99] transition-all"
          >
            <div className="text-left">
              <p className="text-sm font-black">Falsche Fragen wiederholen</p>
              <p className="text-[9px] opacity-70 mt-0.5">{wrongQuestions.length} Fragen</p>
            </div>
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.1"/>
            </svg>
          </button>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onRestart}
            className="flex items-center justify-center gap-2 px-4 py-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 rounded-[20px] shadow-3d-raised hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.49-3.1"/>
            </svg>
            <span className="text-[10px] font-black uppercase tracking-widest">Neues Quiz</span>
          </button>

          {onCreateFlashcards && wrongQuestions.length > 0 && (
            <button
              onClick={() => onCreateFlashcards(wrongQuestions)}
              className="flex items-center justify-center gap-2 px-4 py-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 rounded-[20px] shadow-3d-raised hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
              </svg>
              <span className="text-[10px] font-black uppercase tracking-widest">Karten aus Fehlern ({wrongQuestions.length})</span>
            </button>
          )}

          {onGoToSource && (
            <button
              onClick={onGoToSource}
              className="flex items-center justify-center gap-2 px-4 py-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 rounded-[20px] shadow-3d-raised hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
              </svg>
              <span className="text-[10px] font-black uppercase tracking-widest">Zur Quelle</span>
            </button>
          )}
        </div>
      </div>

      {/* Question review */}
      <div className="space-y-3">
        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 px-1">Fragenübersicht</p>
        {questions.map((q, i) => {
          const correct = answers[i]?.isCorrect;
          const open    = expandedIdx === i;
          return (
            <div key={i} className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[20px] overflow-hidden shadow-sm">
              <button
                onClick={() => setExpandedIdx(open ? null : i)}
                className="w-full flex items-start gap-4 px-5 py-4 text-left"
              >
                <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${correct ? 'bg-emerald-100 dark:bg-emerald-900/20 text-emerald-600' : 'bg-rose-100 dark:bg-rose-900/20 text-rose-600'}`}>
                  {correct ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  )}
                </div>
                <div className="flex-grow min-w-0">
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100 leading-snug">{q.question}</p>
                  {q.topic && <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mt-0.5">{q.topic}</p>}
                </div>
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 mt-1 transition-transform text-slate-400 ${open ? 'rotate-180' : ''}`}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>
              {open && (
                <div className="px-5 pb-4 space-y-2 border-t border-slate-50 dark:border-slate-800 animate-in slide-in-from-top-2 duration-200">
                  <div className="text-xs space-y-1 pt-3">
                    {answers[i]?.selectedOptionIndices?.length > 0 && (
                      <p className="text-slate-500 dark:text-slate-400">
                        <span className="font-black text-[9px] uppercase tracking-widest mr-2">Deine Wahl:</span>
                        {answers[i].selectedOptionIndices.map(idx => q.options[idx]).join(', ')}
                      </p>
                    )}
                    {!correct && q.correctAnswerIndices?.length > 0 && q.options.length > 0 && (
                      <p className="text-emerald-600 dark:text-emerald-400">
                        <span className="font-black text-[9px] uppercase tracking-widest mr-2">Korrekt:</span>
                        {q.correctAnswerIndices.map(idx => q.options[idx]).join(', ')}
                      </p>
                    )}
                    {q.explanation && (
                      <p className="text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-50 dark:border-slate-800 mt-2">
                        <span className="font-black text-[9px] uppercase tracking-widest mr-2">Erklärung:</span>
                        {q.explanation}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
