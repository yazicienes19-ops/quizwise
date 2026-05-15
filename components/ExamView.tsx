
import React, { useState, useEffect } from 'react';
import { ExamQuestion } from '../types';
import { EmojiImage } from './EmojiImage';

interface ExamViewProps {
  questions: ExamQuestion[];
  mode: 'edit' | 'solve' | 'result';
  onSave: (questions: ExamQuestion[]) => void;
  onSubmit: (questions: ExamQuestion[]) => void;
  isEvaluating: boolean;
}

export const ExamView: React.FC<ExamViewProps> = ({ questions, mode, onSave, onSubmit, isEvaluating }) => {
  const [answers, setAnswers] = useState<{ [id: string]: string | number[] }>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tempQuestion, setTempQuestion] = useState<ExamQuestion | null>(null);

  const handleUpdateAnswer = (id: string, val: string | number[]) => {
    setAnswers(prev => ({ ...prev, [id]: val }));
  };

  const handleOptionToggle = (id: string, optIdx: number) => {
    const current = (answers[id] as number[]) || [];
    const next = current.includes(optIdx) 
      ? current.filter(i => i !== optIdx)
      : [...current, optIdx];
    handleUpdateAnswer(id, next);
  };

  const startEditing = (q: ExamQuestion) => {
    setEditingId(q.id);
    setTempQuestion({ ...q });
  };

  const saveEdit = () => {
    if (tempQuestion) {
      onSave(questions.map(q => q.id === tempQuestion.id ? tempQuestion : q));
      setEditingId(null);
    }
  };

  const totalPoints = questions.reduce((a, b) => a + b.points, 0);
  const achievedPointsTotal = questions.reduce((a, b) => a + (b.achievedPoints || 0), 0);
  const percentage = totalPoints > 0 ? (achievedPointsTotal / totalPoints) * 100 : 0;

  const getGermanGrade = (p: number) => {
    if (p >= 95) return { grade: "1.0", label: "Sehr Gut", color: "text-emerald-600", bg: "bg-emerald-50" };
    if (p >= 90) return { grade: "1.3", label: "Sehr Gut", color: "text-emerald-600", bg: "bg-emerald-50" };
    if (p >= 85) return { grade: "1.7", label: "Gut", color: "text-emerald-500", bg: "bg-emerald-50/50" };
    if (p >= 80) return { grade: "2.0", label: "Gut", color: "text-emerald-500", bg: "bg-emerald-50/50" };
    if (p >= 75) return { grade: "2.3", label: "Gut", color: "text-indigo-500", bg: "bg-indigo-50/50" };
    if (p >= 70) return { grade: "2.7", label: "Befriedigend", color: "text-indigo-500", bg: "bg-indigo-50/50" };
    if (p >= 65) return { grade: "3.0", label: "Befriedigend", color: "text-amber-500", bg: "bg-amber-50/50" };
    if (p >= 60) return { grade: "3.3", label: "Befriedigend", color: "text-amber-500", bg: "bg-amber-50/50" };
    if (p >= 55) return { grade: "3.7", label: "Ausreichend", color: "text-amber-600", bg: "bg-amber-100/50" };
    if (p >= 50) return { grade: "4.0", label: "Ausreichend", color: "text-amber-600", bg: "bg-amber-100/50" };
    return { grade: "5.0", label: "Nicht Bestanden", color: "text-rose-600", bg: "bg-rose-50" };
  };

  const gradeInfo = getGermanGrade(percentage);

  return (
    <div className="max-w-4xl mx-auto space-y-12 animate-in fade-in duration-700 pb-32">
      {/* Header Section */}
      <div className="flex justify-between items-end border-b-4 border-slate-900 dark:border-slate-100 pb-8">
        <div>
          <h2 className="text-4xl font-black uppercase tracking-tighter dark:text-white">Klausurprotokoll</h2>
          <p className="text-[11px] font-mono opacity-60 uppercase tracking-[0.3em] dark:text-slate-400 mt-2">Prüfungseinrichtung: QuizWise AI Academic Center</p>
        </div>
        <div className="text-right dark:text-white">
          <p className="font-black text-sm border-b-2 border-slate-300 dark:border-slate-700 min-w-[240px] pb-1">STUDIERENDER: ____________________</p>
          <div className="flex justify-end gap-6 mt-3">
            <div className="text-right">
              <p className="text-[9px] font-black uppercase text-slate-400">Gesamtpunkte</p>
              <p className="text-lg font-black">{achievedPointsTotal} / {totalPoints}</p>
            </div>
            <div className="text-right">
              <p className="text-[9px] font-black uppercase text-slate-400">Prozent</p>
              <p className="text-lg font-black">{Math.round(percentage)}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Grade Card - Only in result mode */}
      {mode === 'result' && (
        <div className={`grid grid-cols-1 md:grid-cols-3 gap-8 ${gradeInfo.bg} dark:bg-slate-900/40 p-10 rounded-[40px] border-2 ${percentage >= 50 ? 'border-emerald-500' : 'border-rose-500'} animate-in zoom-in-95`}>
          <div className="flex flex-col items-center justify-center border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-800 pb-6 md:pb-0">
             <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Gesamtnote</span>
             <span className={`text-7xl font-black ${gradeInfo.color}`}>{gradeInfo.grade}</span>
             <span className={`text-xs font-black uppercase mt-2 tracking-widest ${gradeInfo.color}`}>{gradeInfo.label}</span>
          </div>
          
          <div className="md:col-span-2 space-y-6 flex flex-col justify-center">
            <div className="space-y-2">
              <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-slate-400">
                <span>Leistungsstand</span>
                <span>{percentage >= 50 ? 'Bestanden' : 'Nicht Bestanden'}</span>
              </div>
              <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden shadow-inner">
                <div 
                  className={`h-full transition-all duration-1000 ${percentage >= 50 ? 'bg-emerald-500' : 'bg-rose-500'}`}
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <div className="flex justify-between text-[9px] font-bold text-slate-400">
                <span>0%</span>
                <span className="text-amber-500">50% Bestanden</span>
                <span>100%</span>
              </div>
            </div>
            
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400 italic">
              {percentage >= 90 ? "Hervorragende Leistung! Sie haben das Thema tiefgreifend verstanden." :
               percentage >= 70 ? "Gute Leistung. Sie beherrschen die wesentlichen Inhalte sicher." :
               percentage >= 50 ? "Bestanden. Es sind jedoch noch Lücken in der Tiefe vorhanden." :
               "Leider hat es diesmal nicht gereicht. Nutzen Sie die KI-Fehleranalyse für die Nachbereitung."}
            </p>
          </div>
        </div>
      )}

      {/* Questions Section */}
      <div className="space-y-16">
        {questions.map((q, idx) => {
          const isEditing = editingId === q.id;
          
          return (
            <div key={q.id} className="relative group p-6 -m-6 rounded-[32px] hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
              {mode === 'edit' && !isEditing && (
                <button 
                  onClick={() => startEditing(q)}
                  className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2 rounded-xl text-slate-400 hover:text-indigo-600 transition-all shadow-sm z-10"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>
              )}

              {isEditing && tempQuestion ? (
                <div className="space-y-6 animate-in fade-in zoom-in-95 p-8 bg-white dark:bg-slate-800 rounded-[32px] shadow-2xl ring-4 ring-indigo-500/20">
                  <div className="flex justify-between items-center">
                    <h3 className="text-xl font-black dark:text-white">Aufgabe {idx + 1} anpassen</h3>
                    <input 
                      type="number" 
                      value={tempQuestion.points}
                      onChange={(e) => setTempQuestion({...tempQuestion, points: parseInt(e.target.value)})}
                      className="w-16 p-2 bg-slate-50 dark:bg-slate-900 rounded-xl text-center font-black dark:text-white"
                    />
                  </div>
                  <textarea 
                    value={tempQuestion.question}
                    onChange={(e) => setTempQuestion({...tempQuestion, question: e.target.value})}
                    className="w-full p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl dark:text-white border-2 border-transparent focus:border-indigo-500 outline-none"
                  />
                  <div className="flex justify-end gap-3">
                    <button onClick={() => setEditingId(null)} className="text-slate-400 font-black uppercase text-[10px]">Abbrechen</button>
                    <button onClick={saveEdit} className="bg-indigo-600 text-white px-6 py-2 rounded-xl font-black uppercase text-[10px]">Speichern</button>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex justify-between items-start gap-4">
                    <span className="font-black text-xl dark:text-white">Aufgabe {idx + 1}:</span>
                    <span className="text-[10px] font-mono bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-lg dark:text-slate-400 uppercase tracking-widest">[{q.points} Pkt.]</span>
                  </div>
                  
                  <p className="text-xl leading-relaxed text-slate-800 dark:text-slate-200 font-medium">
                    {q.question}
                  </p>

                  {/* Multiple Choice Solving */}
                  {q.type === 'mc' && q.options && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pl-4 lg:pl-10">
                      {q.options.map((opt, oidx) => {
                        const isSelected = ((answers[q.id] as number[]) || []).includes(oidx);
                        return (
                          <button 
                            key={oidx}
                            disabled={mode !== 'solve'}
                            onClick={() => handleOptionToggle(q.id, oidx)}
                            className={`flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left ${
                              isSelected 
                                ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/20 dark:text-white' 
                                : 'border-slate-100 dark:border-slate-800 dark:text-slate-400 hover:border-indigo-200'
                            }`}
                          >
                            <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 ${isSelected ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300'}`}>
                              {isSelected && '✓'}
                            </div>
                            <span className="text-sm font-bold">{opt}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Open Question Solving */}
                  {q.type === 'open' && (
                    <div className="pl-4 lg:pl-10 space-y-4">
                      {mode === 'solve' ? (
                        <textarea 
                          value={(answers[q.id] as string) || ''}
                          onChange={(e) => handleUpdateAnswer(q.id, e.target.value)}
                          placeholder="Antwort hier formulieren..."
                          className="w-full h-48 p-6 bg-slate-50 dark:bg-slate-800 rounded-[32px] border-2 border-transparent focus:border-indigo-500 outline-none transition-all dark:text-white font-medium"
                        />
                      ) : mode === 'result' ? (
                        <div className="bg-slate-100 dark:bg-slate-800 p-6 rounded-[32px] dark:text-slate-300 italic border border-slate-200 dark:border-slate-700">
                          {q.userAnswer || "Keine Antwort gegeben."}
                        </div>
                      ) : (
                        <div className="h-40 border-b-2 border-slate-200 dark:border-slate-800 w-full opacity-20 pointer-events-none bg-[linear-gradient(transparent_39px,#cbd5e1_40px)] dark:bg-[linear-gradient(transparent_39px,#334155_40px)] bg-[size:100%_40px]"></div>
                      )}
                    </div>
                  )}

                  {/* Result Mode: Feedback and achieved points */}
                  {mode === 'result' && (
                    <div className="mt-8 space-y-6 pl-4 lg:pl-10 animate-in slide-in-from-bottom-4">
                      <div className={`p-6 rounded-[32px] border-l-8 ${q.achievedPoints === q.points ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-500' : 'bg-amber-50 dark:bg-amber-950/20 border-amber-500'}`}>
                        <div className="flex justify-between items-center mb-4">
                          <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">KI-Korrektur</h4>
                          <span className="text-sm font-black dark:text-white">{q.achievedPoints} / {q.points} Pkt.</span>
                        </div>
                        <p className="text-sm font-bold dark:text-slate-200 mb-4">{q.feedback}</p>
                        <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                          <p className="text-[9px] font-black uppercase text-slate-400 mb-2">Erwartete Lösung</p>
                          <p className="text-xs italic text-slate-500 dark:text-slate-400 leading-relaxed">{q.solution}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {mode === 'solve' && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[50] flex flex-col items-center gap-4">
           <button 
            onClick={() => {
              const finalQuestions = questions.map(q => ({
                ...q,
                userAnswer: answers[q.id]
              }));
              onSubmit(finalQuestions);
            }}
            disabled={isEvaluating}
            className="bg-indigo-600 text-white px-16 py-6 rounded-[32px] font-black uppercase tracking-[0.3em] text-[11px] shadow-3d-deep hover:scale-110 active:scale-95 transition-all flex items-center gap-4"
          >
            {isEvaluating ? 'Korrektur läuft...' : <span>Klausur abgeben <EmojiImage emoji="📝" size={16} /></span>}
          </button>
          <p className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm px-6 py-2 rounded-full text-[9px] font-black uppercase text-slate-400 tracking-widest shadow-lg">Prüfungszeit läuft...</p>
        </div>
      )}
    </div>
  );
};
