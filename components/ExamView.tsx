
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ExamQuestion, ActiveTab, ScoringProfile, ExamAnalysis, QuestionFeedbackType } from '../types';
import { saveQuestionFeedback } from '../services/examFeedbackService';
import { EmojiImage } from './EmojiImage';
import type { jsPDF as JsPDFType } from 'jspdf';

interface ExamViewProps {
  questions: ExamQuestion[];
  mode: 'edit' | 'solve' | 'result';
  onSave: (questions: ExamQuestion[]) => void;
  onSubmit: (questions: ExamQuestion[]) => void;
  isEvaluating: boolean;
  examDuration?: number;
  onNewExam?: () => void;
  onNavigate?: (tab: ActiveTab) => void;
  onSaveExam?: (name: string) => void;
  initialAnswers?: Record<string, any>;
  onAnswersChange?: (answers: Record<string, any>) => void;
  onSaveProgress?: (name: string) => void;
  examTitle?: string;
  scoringProfile?: ScoringProfile;
  analysis?: ExamAnalysis | null;
}

const formatTime = (s: number) =>
  `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

const TYPE_LABELS: Record<string, string> = {
  mc: 'Multiple Choice',
  truefalse: 'Wahr / Falsch',
  matching: 'Zuordnung',
  fillblank: 'Lückentext',
  ranking: 'Sortierung',
  numeric: 'Numerisch',
  open: 'Freitext',
};

export const ExamView: React.FC<ExamViewProps> = ({
  questions, mode, onSave, onSubmit, isEvaluating,
  examDuration, onNewExam, onNavigate, onSaveExam,
  initialAnswers, onAnswersChange, onSaveProgress, examTitle,
  scoringProfile, analysis,
}) => {
  const [answers, setAnswers]           = useState<Record<string, any>>(initialAnswers ?? {});
  const [editingId, setEditingId]       = useState<string | null>(null);
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [saveName, setSaveName]         = useState('Meine Klausur');
  const [examSaved, setExamSaved]       = useState(false);
  const [showProgressInput, setShowProgressInput] = useState(false);
  const [progressName, setProgressName] = useState('Meine Klausur');
  const [tempQuestion, setTempQuestion] = useState<ExamQuestion | null>(null);
  const [timeLeft, setTimeLeft]         = useState<number | null>(null);
  const [timerExpired, setTimerExpired] = useState(false);
  const [questionFeedback, setQuestionFeedback] = useState<Record<string, QuestionFeedbackType>>({});

  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const answersRef = useRef(answers);
  useEffect(() => { answersRef.current = answers; }, [answers]);

  useEffect(() => {
    if (mode !== 'solve') {
      if (timerRef.current) clearInterval(timerRef.current);
      setTimeLeft(null);
      setTimerExpired(false);
      return;
    }
    if (!examDuration) return;
    setTimeLeft(examDuration * 60);
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev === null || prev <= 0) return 0;
        if (prev === 1) { clearInterval(timerRef.current!); setTimerExpired(true); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [mode, examDuration]);

  useEffect(() => {
    if (!timerExpired || mode !== 'solve') return;
    const finalQs = questions.map(q => ({ ...q, userAnswer: answersRef.current[q.id] }));
    onSubmit(finalQs);
  }, [timerExpired]);

  const setAnswer = (id: string, val: any) =>
    setAnswers(prev => {
      const next = { ...prev, [id]: val };
      onAnswersChange?.(next);
      return next;
    });

  const handleSubmit = () => {
    const finalQs = questions.map(q => ({ ...q, userAnswer: answers[q.id] }));
    onSubmit(finalQs);
  };

  const startEditing = (q: ExamQuestion) => { setEditingId(q.id); setTempQuestion({ ...q }); };
  const saveEdit = () => {
    if (tempQuestion) { onSave(questions.map(q => q.id === tempQuestion.id ? tempQuestion : q)); setEditingId(null); }
  };

  const totalPoints    = questions.reduce((a, b) => a + b.points, 0);
  const achievedTotal  = questions.reduce((a, b) => a + (b.achievedPoints || 0), 0);
  const percentage     = totalPoints > 0 ? (achievedTotal / totalPoints) * 100 : 0;
  const isTimeLow      = timeLeft !== null && timeLeft > 0 && timeLeft <= 300;

  const getGrade = (p: number) => {
    if (p >= 95) return { grade: '1.0', label: 'Sehr Gut',        color: 'text-emerald-600', bg: 'bg-emerald-50' };
    if (p >= 90) return { grade: '1.3', label: 'Sehr Gut',        color: 'text-emerald-600', bg: 'bg-emerald-50' };
    if (p >= 85) return { grade: '1.7', label: 'Gut',             color: 'text-emerald-500', bg: 'bg-emerald-50/50' };
    if (p >= 80) return { grade: '2.0', label: 'Gut',             color: 'text-emerald-500', bg: 'bg-emerald-50/50' };
    if (p >= 75) return { grade: '2.3', label: 'Gut',             color: 'text-indigo-500',  bg: 'bg-indigo-50/50' };
    if (p >= 70) return { grade: '2.7', label: 'Befriedigend',    color: 'text-indigo-500',  bg: 'bg-indigo-50/50' };
    if (p >= 65) return { grade: '3.0', label: 'Befriedigend',    color: 'text-amber-500',   bg: 'bg-amber-50/50' };
    if (p >= 60) return { grade: '3.3', label: 'Befriedigend',    color: 'text-amber-500',   bg: 'bg-amber-50/50' };
    if (p >= 55) return { grade: '3.7', label: 'Ausreichend',     color: 'text-amber-600',   bg: 'bg-amber-100/50' };
    if (p >= 50) return { grade: '4.0', label: 'Ausreichend',     color: 'text-amber-600',   bg: 'bg-amber-100/50' };
    return        { grade: '5.0', label: 'Nicht Bestanden',       color: 'text-rose-600',    bg: 'bg-rose-50' };
  };
  const gradeInfo = getGrade(percentage);

  const handleExportPdf = useCallback(async () => {
    const { jsPDF } = await import('jspdf');
    const doc: JsPDFType = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210, margin = 18, lw = W - 2 * margin;
    let y = margin;

    const addText = (text: string, size: number, bold: boolean, color: [number, number, number] = [0, 0, 0]) => {
      doc.setFontSize(size);
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      doc.setTextColor(...color);
      const lines = doc.splitTextToSize(text, lw) as string[];
      lines.forEach(line => {
        if (y > 275) { doc.addPage(); y = margin; }
        doc.text(line, margin, y);
        y += size * 0.4;
      });
      y += 2;
    };

    // Header
    addText(examTitle || 'Klausur-Protokoll', 22, true);
    addText(new Date().toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' }), 9, false, [120, 120, 120]);
    y += 4;

    // Grade box line
    const gradeColor: [number, number, number] = percentage >= 50 ? [16, 185, 129] : [239, 68, 68];
    doc.setDrawColor(...gradeColor);
    doc.setLineWidth(0.8);
    doc.roundedRect(margin, y, lw, 20, 3, 3, 'S');
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...gradeColor);
    doc.text(`Note ${gradeInfo.grade} — ${gradeInfo.label}`, margin + 6, y + 8);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    doc.text(`${Math.round(percentage)}%  ·  ${achievedTotal}/${totalPoints} Punkte  ·  ${percentage >= 50 ? 'Bestanden' : 'Nicht Bestanden'}`, margin + 6, y + 15);
    y += 27;

    // Questions
    questions.forEach((q, i) => {
      if (y > 260) { doc.addPage(); y = margin; }
      addText(`${i + 1}. ${q.question}`, 10, true);

      const userAns = q.userAnswer;
      let userText = '';
      let correctText = '';
      if (q.type === 'mc') {
        userText = (userAns as number[] || []).map((idx: number) => q.options?.[idx] ?? `Option ${idx + 1}`).join(', ') || '—';
        correctText = (q.correctIndices || []).map((idx: number) => q.options?.[idx] ?? `Option ${idx + 1}`).join(', ');
      } else if (q.type === 'truefalse') {
        const ans = userAns as { tf?: boolean; reason?: number } || {};
        userText = ans.tf === undefined ? '—' : (ans.tf ? 'Richtig' : 'Falsch');
        correctText = q.tfCorrect ? 'Richtig' : 'Falsch';
      } else if (q.type === 'open') {
        userText = String(userAns || '—');
        correctText = q.solution || '';
      } else {
        userText = String(userAns ?? '—');
        correctText = q.solution || '';
      }

      const isCorrect = (q.achievedPoints ?? 0) === q.points;
      const pts = q.achievedPoints ?? 0;
      addText(`Deine Antwort: ${userText}`, 9, false, isCorrect ? [16, 185, 129] : [239, 68, 68]);
      if (!isCorrect && correctText) addText(`Korrekt: ${correctText}`, 9, false, [80, 80, 80]);
      if (q.feedback) addText(`Feedback: ${q.feedback}`, 8, false, [120, 120, 120]);
      addText(`Punkte: ${pts} / ${q.points}`, 8, false, [120, 120, 120]);
      y += 2;
    });

    doc.save(`QuizWise_Klausur_${new Date().toISOString().slice(0, 10)}.pdf`);
  }, [questions, percentage, gradeInfo, achievedTotal, totalPoints, examTitle]);

  // ─── Question Body ─────────────────────────────────────────────────────────

  const renderQuestionBody = (q: ExamQuestion) => {
    const ans = answers[q.id];

    /* ── MC / Szenario-MC ── */
    if (q.type === 'mc' && q.options) {
      const scenarioBlock = q.scenarioText ? (
        <div className="pl-4 lg:pl-10 mb-4 p-5 bg-amber-50 dark:bg-amber-900/20 rounded-[20px] border border-amber-200 dark:border-amber-800">
          <p className="text-[8px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400 mb-2">Fallbeispiel</p>
          <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{q.scenarioText}</p>
        </div>
      ) : null;
      return (
        <div>
          {scenarioBlock}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-4 lg:pl-10">
          {q.options.map((opt, oi) => {
            const selected  = ((ans as number[]) || []).includes(oi);
            const isCorrect = q.correctIndices?.includes(oi);
            let cls = 'border-slate-100 dark:border-slate-800 dark:text-slate-400 hover:border-indigo-200';
            if (mode === 'solve') cls = selected ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/20 dark:text-white' : cls;
            if (mode === 'result') {
              if (isCorrect) cls = 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300';
              else if (selected) cls = 'border-rose-400 bg-rose-50 dark:bg-rose-950/20 text-rose-700 opacity-70';
              else cls = 'border-slate-100 dark:border-slate-800 opacity-30 text-slate-400';
            }
            return (
              <button key={oi} disabled={mode !== 'solve'}
                onClick={() => {
                  const cur = (ans as number[]) || [];
                  setAnswer(q.id, cur.includes(oi) ? cur.filter(i => i !== oi) : [...cur, oi]);
                }}
                className={`flex items-center gap-3 p-4 rounded-2xl border-2 transition-all text-left ${cls}`}
              >
                <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 text-[10px] font-black ${
                  mode === 'solve' && selected ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 dark:border-slate-600'
                }`}>
                  {mode === 'solve' && selected ? '✓' : String.fromCharCode(65 + oi)}
                </div>
                <span className="text-sm font-medium">{opt}</span>
              </button>
            );
          })}
        </div>
        </div>
      );
    }

    /* ── Ranking / Sortierung ── */
    if (q.type === 'ranking' && q.rankingItems) {
      const userOrder: string[] = (ans as string[]) || [...q.rankingItems].sort(() => Math.random() - 0.5);
      if (mode === 'solve') {
        return (
          <div className="pl-4 lg:pl-10 space-y-2">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-3">Bringe die Elemente in die richtige Reihenfolge</p>
            {userOrder.map((item, i) => (
              <div key={item} className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 text-[11px] font-black flex items-center justify-center shrink-0">{i + 1}</span>
                <div className="flex-1 p-3 rounded-2xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium dark:text-white">{item}</div>
                <div className="flex flex-col gap-1">
                  <button disabled={i === 0} onClick={() => {
                    const next = [...userOrder];
                    [next[i - 1], next[i]] = [next[i], next[i - 1]];
                    setAnswer(q.id, next);
                  }} className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-500 text-xs flex items-center justify-center hover:bg-indigo-100 disabled:opacity-30 transition-colors">▲</button>
                  <button disabled={i === userOrder.length - 1} onClick={() => {
                    const next = [...userOrder];
                    [next[i], next[i + 1]] = [next[i + 1], next[i]];
                    setAnswer(q.id, next);
                  }} className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-500 text-xs flex items-center justify-center hover:bg-indigo-100 disabled:opacity-30 transition-colors">▼</button>
                </div>
              </div>
            ))}
          </div>
        );
      }
      const correct = q.rankingItems;
      const user: string[] = (q.userAnswer as string[]) || [];
      return (
        <div className="pl-4 lg:pl-10 space-y-2">
          {correct.map((item, i) => {
            const ok = user[i] === item;
            return (
              <div key={item} className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 text-[11px] font-black flex items-center justify-center shrink-0">{i + 1}</span>
                <div className={`flex-1 p-3 rounded-2xl border-2 text-sm font-medium ${ok ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300' : 'border-rose-300 bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-300'}`}>
                  {user[i] || '—'}{!ok && <span className="text-emerald-600 dark:text-emerald-400 text-[11px] font-black ml-2">→ {item}</span>}
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    /* ── Numerisch ── */
    if (q.type === 'numeric') {
      if (mode === 'solve') {
        return (
          <div className="pl-4 lg:pl-10">
            <div className="flex items-center gap-3 max-w-xs">
              <input
                type="number"
                value={(ans as string) || ''}
                onChange={e => setAnswer(q.id, e.target.value)}
                placeholder="Zahl eingeben..."
                className="flex-1 p-4 bg-slate-50 dark:bg-slate-800 rounded-[20px] border-2 border-transparent focus:border-indigo-500 outline-none transition-all dark:text-white font-black text-xl text-center"
              />
              {q.numericTolerance ? <span className="text-[10px] text-slate-400 font-black">±{q.numericTolerance}</span> : null}
            </div>
          </div>
        );
      }
      const user = parseFloat(q.userAnswer);
      const correct = q.numericAnswer ?? 0;
      const ok = !isNaN(user) && Math.abs(user - correct) <= (q.numericTolerance ?? 0);
      return (
        <div className="pl-4 lg:pl-10 flex items-center gap-4">
          <span className={`text-2xl font-black ${ok ? 'text-emerald-600' : 'text-rose-600'}`}>{isNaN(user) ? '—' : user}</span>
          {!ok && <span className="text-sm text-slate-500 dark:text-slate-400">Korrekt: <strong className="text-emerald-600">{correct}</strong>{q.numericTolerance ? ` ±${q.numericTolerance}` : ''}</span>}
          {ok && <span className="text-sm text-emerald-600 font-black">✓ Korrekt</span>}
        </div>
      );
    }

    /* ── Wahr / Falsch ── */
    if (q.type === 'truefalse') {
      const tfAns = ans as { tf?: boolean; reason?: number } | undefined;
      return (
        <div className="pl-4 lg:pl-10 space-y-4">
          <div className="flex gap-3">
            {([true, false] as const).map(val => {
              const sel = tfAns?.tf === val;
              let cls = 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400';
              if (sel) cls = val ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300' : 'border-rose-500 bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-300';
              if (mode === 'result' && q.tfCorrect === val) cls = 'border-emerald-500 bg-emerald-50 text-emerald-700';
              return (
                <button key={String(val)} disabled={mode !== 'solve'}
                  onClick={() => setAnswer(q.id, { ...(tfAns || {}), tf: val })}
                  className={`flex-1 py-4 rounded-[20px] font-black text-sm border-2 transition-all ${cls}`}
                >
                  {val ? '✓ Richtig' : '✗ Falsch'}
                </button>
              );
            })}
          </div>

          {/* Begründungsauswahl */}
          {q.tfReasonOptions && q.tfReasonOptions.length > 0 && (tfAns?.tf !== undefined || mode === 'result') && (
            <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Begründung</p>
              {q.tfReasonOptions.map((reason, ri) => {
                const sel = tfAns?.reason === ri;
                const correct = mode === 'result' && ri === q.tfCorrectReasonIndex;
                const wrong   = mode === 'result' && sel && ri !== q.tfCorrectReasonIndex;
                return (
                  <button key={ri} disabled={mode !== 'solve'}
                    onClick={() => setAnswer(q.id, { ...(tfAns || {}), reason: ri })}
                    className={`w-full text-left p-4 rounded-2xl border-2 transition-all text-sm font-medium ${
                      correct ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700' :
                      wrong   ? 'border-rose-400 bg-rose-50 text-rose-700 opacity-70' :
                      sel     ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/20 text-indigo-800 dark:text-indigo-200' :
                      'border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {reason}
                    {correct && <span className="ml-2 text-[9px] font-black uppercase text-emerald-500">✓</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    /* ── Zuordnung ── */
    if (q.type === 'matching' && q.matchLeft && q.matchRight) {
      const pairs = (ans as number[]) || [];
      return (
        <div className="pl-4 lg:pl-10 space-y-3">
          {q.matchLeft.map((left, li) => {
            const selected  = pairs[li];
            const isCorrect = mode === 'result' && selected === q.matchCorrect?.[li];
            const isWrong   = mode === 'result' && selected !== undefined && selected !== -1 && !isCorrect;
            return (
              <div key={li} className="flex items-center gap-3">
                <div className="flex-1 min-w-0 p-3 rounded-2xl text-sm font-bold bg-indigo-50 dark:bg-indigo-900/20 text-indigo-800 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-800 truncate">
                  {left}
                </div>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-slate-400">
                  <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                </svg>
                {mode === 'solve' ? (
                  <select
                    value={selected ?? ''}
                    onChange={e => {
                      const next = [...(Array.isArray(ans) ? ans : new Array(q.matchLeft!.length).fill(undefined))];
                      next[li] = parseInt(e.target.value);
                      setAnswer(q.id, next);
                    }}
                    className="flex-1 p-3 bg-white dark:bg-slate-800 rounded-2xl border-2 border-slate-200 dark:border-slate-700 text-sm font-medium dark:text-white outline-none focus:border-indigo-500 transition-colors"
                  >
                    <option value="">— wählen —</option>
                    {q.matchRight.map((right, ri) => (
                      <option key={ri} value={ri}>{right}</option>
                    ))}
                  </select>
                ) : (
                  <div className={`flex-1 p-3 rounded-2xl text-sm font-medium border ${
                    isCorrect ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-300 text-emerald-700' :
                    isWrong   ? 'bg-rose-50 dark:bg-rose-950/20 border-rose-300 text-rose-700' :
                    'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500'
                  }`}>
                    {selected !== undefined && selected >= 0 ? q.matchRight[selected] : '—'}
                    {isWrong && q.matchCorrect && (
                      <span className="block text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5 font-black">
                        ✓ {q.matchRight[q.matchCorrect[li]]}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      );
    }

    /* ── Lückentext ── */
    if (q.type === 'fillblank' && q.blankText) {
      const parts  = q.blankText.split('[LÜCKE]');
      const blanks = (ans as string[]) || [];
      if (mode === 'solve') {
        return (
          <div className="pl-4 lg:pl-10 text-lg leading-loose text-slate-800 dark:text-slate-200">
            {parts.map((part, pi) => (
              <React.Fragment key={pi}>
                {part}
                {pi < parts.length - 1 && (
                  <input
                    type="text"
                    value={blanks[pi] || ''}
                    onChange={e => {
                      const next = [...(Array.isArray(ans) ? ans : new Array(parts.length - 1).fill(''))];
                      next[pi] = e.target.value;
                      setAnswer(q.id, next);
                    }}
                    placeholder="..."
                    className="mx-1 px-3 py-0.5 border-b-2 border-indigo-500 bg-transparent outline-none font-bold text-indigo-700 dark:text-indigo-300 min-w-[80px] text-center"
                  />
                )}
              </React.Fragment>
            ))}
          </div>
        );
      }
      if (mode === 'result') {
        return (
          <div className="pl-4 lg:pl-10 text-lg leading-loose text-slate-800 dark:text-slate-200">
            {parts.map((part, pi) => {
              const userBlank    = (q.userAnswer as string[])?.[pi] || '';
              const correctBlank = q.blanks?.[pi] || '';
              const ok = userBlank.trim().toLowerCase() === correctBlank.toLowerCase();
              return (
                <React.Fragment key={pi}>
                  {part}
                  {pi < parts.length - 1 && (
                    <span className={`mx-1 inline-flex items-center gap-1 px-2 py-0.5 rounded font-bold ${ok ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700' : 'bg-rose-100 dark:bg-rose-900/30 text-rose-700'}`}>
                      {userBlank || '—'}
                      {!ok && <span className="text-emerald-600 dark:text-emerald-400">→ {correctBlank}</span>}
                    </span>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        );
      }
      // Edit mode — Vorschau mit Unterstrichen
      return (
        <div className="pl-4 lg:pl-10 text-lg leading-loose text-slate-500 dark:text-slate-400">
          {q.blankText.replace(/\[LÜCKE\]/g, ' ________ ')}
        </div>
      );
    }

    /* ── Freitext / Open ── */
    if (q.type === 'open') {
      if (mode === 'solve') {
        return (
          <div className="pl-4 lg:pl-10">
            <textarea
              value={(ans as string) || ''}
              onChange={e => setAnswer(q.id, e.target.value)}
              placeholder="Antwort hier formulieren..."
              className="w-full h-40 p-6 bg-slate-50 dark:bg-slate-800 rounded-[32px] border-2 border-transparent focus:border-indigo-500 outline-none transition-all dark:text-white font-medium resize-none"
            />
          </div>
        );
      }
      if (mode === 'result') {
        return (
          <div className="pl-4 lg:pl-10 bg-slate-100 dark:bg-slate-800 p-6 rounded-[32px] dark:text-slate-300 italic border border-slate-200 dark:border-slate-700">
            {q.userAnswer || 'Keine Antwort gegeben.'}
          </div>
        );
      }
      return (
        <div className="pl-4 lg:pl-10 h-32 border-b-2 border-slate-200 dark:border-slate-800 opacity-20 pointer-events-none bg-[linear-gradient(transparent_39px,#cbd5e1_40px)] dark:bg-[linear-gradient(transparent_39px,#334155_40px)] bg-[size:100%_40px]" />
      );
    }

    return null;
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl mx-auto space-y-12 animate-in fade-in duration-700 pb-32">

      {/* Protokoll-Header */}
      <div className="flex justify-between items-end border-b-4 border-slate-900 dark:border-slate-100 pb-8">
        <div>
          <h2 className="text-4xl font-black uppercase tracking-tighter dark:text-white">Klausurprotokoll</h2>
          <p className="text-[11px] font-mono opacity-60 uppercase tracking-[0.3em] dark:text-slate-400 mt-2">
            Prüfungseinrichtung: QuizWise AI Academic Center
          </p>
        </div>
        <div className="text-right dark:text-white">
          <p className="font-black text-sm border-b-2 border-slate-300 dark:border-slate-700 min-w-[240px] pb-1">
            STUDIERENDER: ____________________
          </p>
          <div className="flex justify-end gap-6 mt-3">
            <div className="text-right">
              <p className="text-[9px] font-black uppercase text-slate-400">Gesamtpunkte</p>
              <p className="text-lg font-black">{achievedTotal} / {totalPoints}</p>
            </div>
            <div className="text-right">
              <p className="text-[9px] font-black uppercase text-slate-400">Prozent</p>
              <p className="text-lg font-black">{Math.round(percentage)}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Note + Ergebnis-Aktionen */}
      {mode === 'result' && (
        <div className={`grid grid-cols-1 md:grid-cols-3 gap-8 ${gradeInfo.bg} dark:bg-slate-900/40 p-10 rounded-[40px] border-2 ${percentage >= 50 ? 'border-emerald-500' : 'border-rose-500'} animate-in zoom-in-95`}>
          <div className="flex flex-col items-center justify-center border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-800 pb-6 md:pb-0">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Gesamtnote</span>
            <span className={`text-7xl font-black ${gradeInfo.color}`}>{gradeInfo.grade}</span>
            <span className={`text-xs font-black uppercase mt-2 tracking-widest ${gradeInfo.color}`}>{gradeInfo.label}</span>
          </div>
          <div className="md:col-span-2 space-y-4 flex flex-col justify-center">
            <div className="space-y-2">
              <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-slate-400">
                <span>Leistungsstand</span>
                <span>{percentage >= 50 ? 'Bestanden' : 'Nicht Bestanden'}</span>
              </div>
              <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden shadow-inner">
                <div className={`h-full transition-all duration-1000 ${percentage >= 50 ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width: `${percentage}%` }} />
              </div>
              <div className="flex justify-between text-[9px] font-bold text-slate-400">
                <span>0%</span><span className="text-amber-500">50% Bestanden</span><span>100%</span>
              </div>
            </div>
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400 italic">
              {percentage >= 90 ? 'Hervorragende Leistung! Sie haben das Thema tiefgreifend verstanden.' :
               percentage >= 70 ? 'Gute Leistung. Sie beherrschen die wesentlichen Inhalte sicher.' :
               percentage >= 50 ? 'Bestanden. Es sind jedoch noch Lücken in der Tiefe vorhanden.' :
               'Leider hat es diesmal nicht gereicht. Nutzen Sie die KI-Fehleranalyse für die Nachbereitung.'}
            </p>
            {onSaveExam && (
              <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                {examSaved ? (
                  <p className="text-emerald-600 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    Klausur gespeichert — offline abrufbar
                  </p>
                ) : showSaveInput ? (
                  <div className="flex gap-2 mb-2">
                    <input autoFocus value={saveName} onChange={e => setSaveName(e.target.value)}
                      className="flex-1 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[14px] text-sm font-medium dark:text-white outline-none focus:border-indigo-500 transition-colors"
                      placeholder="Klausur-Name..." />
                    <button onClick={() => { onSaveExam(saveName.trim() || 'Meine Klausur'); setExamSaved(true); setShowSaveInput(false); }}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-[14px] text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shrink-0">
                      Speichern
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setShowSaveInput(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-[14px] text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all mb-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Klausur offline speichern ({questions.length} Fragen)
                  </button>
                )}
              </div>
            )}
            <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
              {onNewExam && (
                <button onClick={onNewExam} className="text-white px-5 py-2.5 rounded-[16px] font-black uppercase text-[9px] tracking-widest hover:scale-[1.02] transition-all shadow-lg" style={{ background: 'var(--primary)' }}>
                  Neue Klausur
                </button>
              )}
              <button
                onClick={handleExportPdf}
                className="flex items-center gap-2 px-5 py-2.5 rounded-[16px] border-2 border-slate-200 dark:border-slate-700 font-black uppercase text-[9px] tracking-widest text-slate-600 dark:text-slate-300 hover:border-rose-400 hover:text-rose-600 transition-all"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                </svg>
                PDF exportieren
              </button>
              {onNavigate && (
                <>
                  <button onClick={() => onNavigate(ActiveTab.RADAR)} className="px-5 py-2.5 rounded-[16px] border-2 border-slate-200 dark:border-slate-700 font-black uppercase text-[9px] tracking-widest text-slate-600 dark:text-slate-300 hover:border-indigo-400 hover:text-indigo-600 transition-all">
                    Lern-Analyse
                  </button>
                  <button onClick={() => onNavigate(ActiveTab.LIBRARY)} className="px-5 py-2.5 rounded-[16px] border-2 border-slate-200 dark:border-slate-700 font-black uppercase text-[9px] tracking-widest text-slate-600 dark:text-slate-300 hover:border-indigo-400 hover:text-indigo-600 transition-all">
                    Zur Bibliothek
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Scoring-Profil-Badge (result) */}
      {mode === 'result' && scoringProfile && (
        <div className="flex items-center gap-2 flex-wrap px-1">
          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Bewertungsprofil:</span>
          <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${scoringProfile.mode === 'strict' ? 'bg-rose-100 dark:bg-rose-950/20 text-rose-600' : scoringProfile.mode === 'lenient' ? 'bg-emerald-100 dark:bg-emerald-950/20 text-emerald-600' : 'bg-indigo-100 dark:bg-indigo-950/20 text-indigo-600'}`}>
            {scoringProfile.mode === 'strict' ? 'Streng' : scoringProfile.mode === 'lenient' ? 'Lernmodus' : 'Standard'}
          </span>
          {scoringProfile.emphases.map(e => (
            <span key={e} className="text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">
              {e === 'terms' ? 'Fachbegriffe' : e === 'understanding' ? 'Verständnis' : e === 'examples' ? 'Beispiele' : 'Definitionen'}
            </span>
          ))}
        </div>
      )}

      {/* Lernanalyse */}
      {mode === 'result' && analysis && (
        <div className="rounded-[32px] p-8 space-y-6 animate-in fade-in duration-700" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}>
          <div>
            <h3 className="text-lg font-black dark:text-white">Lernanalyse</h3>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Basierend auf deinen Antworten</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {analysis.strengths.length > 0 && (
              <div className="space-y-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Stärken</p>
                <ul className="space-y-2">
                  {analysis.strengths.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                      <span className="text-emerald-500 shrink-0 mt-0.5 font-black">✓</span>{s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {analysis.weaknesses.length > 0 && (
              <div className="space-y-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-rose-600">Wissenslücken</p>
                <ul className="space-y-2">
                  {analysis.weaknesses.map((w, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                      <span className="text-rose-400 shrink-0 mt-0.5 font-black">✗</span>{w}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {analysis.recommendations.length > 0 && (
            <div className="pt-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
              <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600 mb-3">Empfehlungen</p>
              <div className="flex flex-wrap gap-2">
                {analysis.recommendations.map((r, i) => (
                  <span key={i} className="px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-50 dark:bg-indigo-950/20 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                    → {r}
                  </span>
                ))}
              </div>
            </div>
          )}

          {analysis.topicPerformance.length > 0 && (
            <div className="pt-4 border-t space-y-3" style={{ borderColor: 'var(--border-color)' }}>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Themen-Performance</p>
              {analysis.topicPerformance.map((tp, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex justify-between items-center text-[11px] font-bold dark:text-slate-300">
                    <span>{tp.topic}</span>
                    <span className={tp.score >= 70 ? 'text-emerald-600' : tp.score >= 50 ? 'text-amber-600' : 'text-rose-600'}>{tp.score}%</span>
                  </div>
                  <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-1000 ${tp.score >= 70 ? 'bg-emerald-500' : tp.score >= 50 ? 'bg-amber-400' : 'bg-rose-500'}`}
                      style={{ width: `${tp.score}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Analyse lädt noch */}
      {mode === 'result' && !analysis && (
        <div className="flex items-center gap-3 px-1 text-slate-400">
          <div className="w-4 h-4 border-2 border-slate-300 border-t-indigo-500 rounded-full animate-spin shrink-0" />
          <span className="text-[10px] font-black uppercase tracking-widest">Lernanalyse wird erstellt…</span>
        </div>
      )}

      {/* Fragen */}
      <div className="space-y-16">
        {questions.map((q, idx) => {
          const isEditing = editingId === q.id;
          return (
            <div key={q.id} className="relative group p-6 -m-6 rounded-[32px] hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">

              {mode === 'edit' && !isEditing && (
                <button onClick={() => startEditing(q)} className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2 rounded-xl text-slate-400 hover:text-indigo-600 transition-all shadow-sm z-10">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
              )}

              {isEditing && tempQuestion ? (
                <div className="space-y-6 animate-in fade-in zoom-in-95 p-8 bg-white dark:bg-slate-800 rounded-[32px] shadow-2xl ring-4 ring-indigo-500/20">
                  <div className="flex justify-between items-center">
                    <h3 className="text-xl font-black dark:text-white">Aufgabe {idx + 1} anpassen</h3>
                    <input type="number" value={tempQuestion.points} onChange={e => setTempQuestion({ ...tempQuestion, points: parseInt(e.target.value) })} className="w-16 p-2 bg-slate-50 dark:bg-slate-900 rounded-xl text-center font-black dark:text-white" />
                  </div>
                  <textarea value={tempQuestion.question} onChange={e => setTempQuestion({ ...tempQuestion, question: e.target.value })} className="w-full p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl dark:text-white border-2 border-transparent focus:border-indigo-500 outline-none" />
                  <div className="flex justify-end gap-3">
                    <button onClick={() => setEditingId(null)} className="text-slate-400 font-black uppercase text-[10px]">Abbrechen</button>
                    <button onClick={saveEdit} className="bg-indigo-600 text-white px-6 py-2 rounded-xl font-black uppercase text-[10px]">Speichern</button>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex items-center gap-3">
                      <span className="font-black text-xl dark:text-white">Aufgabe {idx + 1}:</span>
                      <span className="text-[8px] font-black uppercase tracking-widest bg-slate-100 dark:bg-slate-800 text-slate-400 px-2.5 py-1 rounded-lg">
                        {TYPE_LABELS[q.type] || q.type}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-lg dark:text-slate-400 uppercase tracking-widest shrink-0">
                      [{q.points} Pkt.]
                    </span>
                  </div>

                  <p className="text-xl leading-relaxed text-slate-800 dark:text-slate-200 font-medium">
                    {q.question}
                  </p>

                  {renderQuestionBody(q)}

                  {/* Auswertung */}
                  {mode === 'result' && (
                    <div className="mt-8 pl-4 lg:pl-10 animate-in slide-in-from-bottom-4 space-y-3">
                      {/* Haupt-Box */}
                      <div className={`p-6 rounded-[32px] border-l-8 ${(q.achievedPoints ?? 0) === q.points ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-500' : (q.achievedPoints ?? 0) > 0 ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-500' : 'bg-rose-50 dark:bg-rose-950/20 border-rose-400'}`}>
                        <div className="flex justify-between items-center mb-4">
                          <div className="flex items-center gap-2">
                            <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                              {q.type === 'open' ? 'KI-Korrektur' : 'Auswertung'}
                            </h4>
                            {q.evaluationConfidence !== undefined && (
                              <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${q.evaluationConfidence >= 80 ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600' : q.evaluationConfidence >= 60 ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600' : 'bg-rose-100 dark:bg-rose-900/30 text-rose-600'}`}>
                                {q.evaluationConfidence >= 80 ? 'Sicher' : q.evaluationConfidence >= 60 ? 'Mittel' : 'Unsicher'}
                              </span>
                            )}
                          </div>
                          <span className="text-sm font-black dark:text-white">{q.achievedPoints ?? 0} / {q.points} Pkt.</span>
                        </div>

                        {/* Rubrik-Kriterien (nur für open) */}
                        {q.criterionScores && q.criterionScores.length > 0 && (
                          <div className="space-y-2 mb-4">
                            {q.criterionScores.map(cs => (
                              <div key={cs.criterionId} className="flex items-start gap-3 text-sm">
                                <span className={`shrink-0 mt-0.5 w-5 h-5 rounded-lg flex items-center justify-center text-[10px] font-black ${cs.status === 'full' ? 'bg-emerald-500 text-white' : cs.status === 'partial' ? 'bg-amber-400 text-white' : 'bg-slate-300 dark:bg-slate-600 text-white'}`}>
                                  {cs.status === 'full' ? '✓' : cs.status === 'partial' ? '~' : '✗'}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <div className="flex justify-between items-center gap-2">
                                    <span className="font-black text-[11px] dark:text-white">{cs.criterionName}</span>
                                    <span className={`text-[10px] font-black shrink-0 ${cs.status === 'full' ? 'text-emerald-600' : cs.status === 'partial' ? 'text-amber-600' : 'text-slate-400'}`}>
                                      {cs.status === 'full' ? '+' : cs.status === 'none' ? '' : '+'}{cs.pointsAwarded} / {cs.maxPoints} Pkt.
                                    </span>
                                  </div>
                                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{cs.explanation}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Gesamtfeedback */}
                        {q.feedback && <p className="text-sm font-bold dark:text-slate-200 mb-4 pt-3 border-t border-black/10 dark:border-white/10">{q.feedback}</p>}

                        <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                          <p className="text-[9px] font-black uppercase text-slate-400 mb-2">Musterlösung</p>
                          <p className="text-xs italic text-slate-500 dark:text-slate-400 leading-relaxed">{q.solution}</p>
                        </div>
                      </div>

                      {/* Feedback-Widget */}
                      {!questionFeedback[q.id] ? (
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <span className="text-[9px] font-black uppercase tracking-widest text-slate-300 dark:text-slate-600">Bewertung fair?</span>
                          {([
                            { type: 'correct'             as QuestionFeedbackType, label: 'Ja',           cls: 'hover:border-emerald-400 hover:text-emerald-600' },
                            { type: 'too_strict'          as QuestionFeedbackType, label: 'Zu streng',    cls: 'hover:border-amber-400 hover:text-amber-600' },
                            { type: 'too_lenient'         as QuestionFeedbackType, label: 'Zu locker',    cls: 'hover:border-amber-400 hover:text-amber-600' },
                            { type: 'incomplete_solution' as QuestionFeedbackType, label: 'Lösung fehlt', cls: 'hover:border-rose-400 hover:text-rose-600' },
                            { type: 'unrealistic'         as QuestionFeedbackType, label: 'Unrealistisch', cls: 'hover:border-rose-400 hover:text-rose-600' },
                          ]).map(fb => (
                            <button
                              key={fb.type}
                              onClick={() => {
                                saveQuestionFeedback(q.question, fb.type);
                                setQuestionFeedback(prev => ({ ...prev, [q.id]: fb.type }));
                              }}
                              className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border-2 border-slate-200 dark:border-slate-700 text-slate-400 transition-all ${fb.cls}`}
                            >{fb.label}</button>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-300 dark:text-slate-600 pl-1">
                          Feedback gespeichert — danke!
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Sticky Submit + Timer */}
      {mode === 'solve' && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[50] flex flex-col items-center gap-3">
          {/* Speichern-Panel */}
          {showProgressInput && onSaveProgress && (
            <div className="bg-white dark:bg-slate-900 rounded-[20px] border border-indigo-200 dark:border-indigo-800 shadow-xl p-4 w-80 animate-in slide-in-from-bottom-4 duration-300">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-3">Klausur speichern</p>
              <div className="flex gap-2">
                <input
                  autoFocus
                  value={progressName}
                  onChange={e => setProgressName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { onSaveProgress(progressName.trim() || 'Meine Klausur'); setShowProgressInput(false); }
                    if (e.key === 'Escape') setShowProgressInput(false);
                  }}
                  placeholder="Klausur-Name..."
                  className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[12px] text-sm font-medium dark:text-white outline-none focus:border-indigo-500 transition-colors"
                />
                <button
                  onClick={() => { onSaveProgress(progressName.trim() || 'Meine Klausur'); setShowProgressInput(false); }}
                  className="px-3 py-2 bg-indigo-600 text-white rounded-[12px] text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shrink-0"
                >
                  OK
                </button>
                <button onClick={() => setShowProgressInput(false)} className="px-2 py-2 text-slate-400 hover:text-slate-600 text-lg leading-none">×</button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            {onSaveProgress && (
              <button
                onClick={() => { setProgressName('Meine Klausur'); setShowProgressInput(v => !v); }}
                className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 px-5 py-4 rounded-[24px] font-black uppercase tracking-widest text-[10px] shadow-lg hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                Speichern
              </button>
            )}
            <button onClick={handleSubmit} disabled={isEvaluating}
              className="bg-indigo-600 text-white px-10 py-6 rounded-[32px] font-black uppercase tracking-[0.3em] text-[11px] shadow-3d-deep hover:scale-110 active:scale-95 transition-all flex items-center gap-4"
            >
              {isEvaluating ? 'Korrektur läuft...' : <span>Klausur abgeben <EmojiImage emoji="📝" size={16} /></span>}
            </button>
          </div>

          {timeLeft !== null ? (
            <p className={`px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg backdrop-blur-sm transition-all ${
              isTimeLow ? 'bg-rose-500 text-white animate-pulse' : 'bg-white/80 dark:bg-slate-900/80 text-slate-500 dark:text-slate-400'
            }`}>
              {timeLeft === 0 ? '⏱ Zeit abgelaufen — wird eingereicht...' : `⏱ ${formatTime(timeLeft)} verbleibend`}
            </p>
          ) : (
            <p className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm px-6 py-2 rounded-full text-[9px] font-black uppercase text-slate-400 tracking-widest shadow-lg">
              Prüfungszeit läuft...
            </p>
          )}
        </div>
      )}
    </div>
  );
};
