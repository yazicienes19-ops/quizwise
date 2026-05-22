
import React, { useState } from 'react';
import { ExamGenerator } from './ExamGenerator';
import { ExamView } from './ExamView';
import { ExamQuestion, ProcessedDocument, Collection, ActiveTab } from '../types';
import { generateFullExam, evaluateExamAnswers, GenerationSource } from '../services/geminiService';
import { GeneratedImage } from './GeneratedImage';
import { toast } from '../services/toast';

interface ExamSystemProps {
  documents: ProcessedDocument[];
  collections: Collection[];
  getDocumentSource?: (doc: ProcessedDocument) => GenerationSource;
  onSaveToLibrary?: (file: File) => void;
  onComplete?: (result: { score: number; docName: string; passed: boolean; totalPoints: number; achievedPoints: number }) => void;
  onNavigate?: (tab: ActiveTab) => void;
  initialDoc?: ProcessedDocument;
}

export const ExamSystem: React.FC<ExamSystemProps> = ({ documents, collections, getDocumentSource, onSaveToLibrary, onComplete, onNavigate, initialDoc }) => {
  const [questions, setQuestions]         = useState<ExamQuestion[] | null>(null);
  const [isLoading, setIsLoading]         = useState(false);
  const [mode, setMode]                   = useState<'edit' | 'solve' | 'result'>('edit');
  const [examDocName, setExamDocName]     = useState('Klausur');
  const [examDuration, setExamDuration]   = useState<number | undefined>(undefined);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const resetExam = () => { setQuestions(null); setMode('edit'); setShowCancelConfirm(false); setExamDuration(undefined); };

  const handleGenerate = async (content: GenerationSource, style?: GenerationSource, options?: { count: number, difficulty: string }, docName?: string, totalMinutes?: number) => {
    if (docName) setExamDocName(docName.replace(/\.[^/.]+$/, ''));
    if (totalMinutes) setExamDuration(totalMinutes);
    setIsLoading(true);
    try {
      const exam = await generateFullExam(content, style, options);
      setQuestions(exam);
      setMode('edit');
    } catch (e) {
      toast.error('Klausur-Generierung fehlgeschlagen. Bitte prüfe den API-Key.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartExam = () => {
    setMode('solve');
  };

  const autoEvaluate = (q: ExamQuestion): ExamQuestion => {
    const empty = (v: any) => v === undefined || v === null || (Array.isArray(v) && !v.filter((x: any) => x !== undefined && x !== null && x !== '' && x !== -1).length);
    if (empty(q.userAnswer)) return { ...q, achievedPoints: 0, feedback: 'Keine Antwort gegeben.' };

    if (q.type === 'mc') {
      const user: number[] = q.userAnswer || [];
      const correct: number[] = q.correctIndices || [];
      if (!correct.length) return { ...q, achievedPoints: 0, feedback: 'Keine Auswertungsgrundlage (correctIndices fehlt).' };
      const uSet = new Set(user), cSet = new Set(correct);
      const allRight = correct.every(i => uSet.has(i));
      const noWrong  = user.every(i => cSet.has(i));
      if (allRight && noWrong) return { ...q, achievedPoints: q.points, feedback: 'Vollständig korrekt.' };
      if (allRight)            return { ...q, achievedPoints: Math.floor(q.points / 2), feedback: 'Alle richtigen gewählt, aber auch falsche dabei.' };
      return { ...q, achievedPoints: 0, feedback: `Falsch. Richtig: ${correct.map(i => q.options?.[i] ?? `Option ${i + 1}`).join(', ')}.` };
    }

    if (q.type === 'truefalse') {
      const ans: { tf?: boolean; reason?: number } = q.userAnswer || {};
      if (ans.tf === undefined) return { ...q, achievedPoints: 0, feedback: 'Keine Antwort gegeben.' };
      if (ans.tf !== q.tfCorrect) return { ...q, achievedPoints: 0, feedback: `Falsch. Korrekt: ${q.tfCorrect ? 'Richtig' : 'Falsch'}.` };
      if (q.tfReasonOptions?.length && ans.reason !== undefined) {
        if (ans.reason === q.tfCorrectReasonIndex) return { ...q, achievedPoints: q.points, feedback: 'Aussage und Begründung korrekt.' };
        return { ...q, achievedPoints: Math.floor(q.points / 2), feedback: `Aussage korrekt, Begründung falsch. Richtig: "${q.tfReasonOptions[q.tfCorrectReasonIndex ?? 0]}".` };
      }
      return { ...q, achievedPoints: q.points, feedback: 'Korrekt.' };
    }

    if (q.type === 'matching') {
      const user: number[] = q.userAnswer || [];
      const correct: number[] = q.matchCorrect || [];
      const hits = correct.filter((ci, i) => user[i] === ci).length;
      const pts  = correct.length ? Math.round((hits / correct.length) * q.points) : 0;
      return { ...q, achievedPoints: pts, feedback: hits === correct.length ? 'Alle Zuordnungen korrekt.' : `${hits} von ${correct.length} Zuordnungen korrekt.` };
    }

    if (q.type === 'fillblank') {
      const user: string[] = q.userAnswer || [];
      const correct: string[] = q.blanks || [];
      const hits = correct.filter((b, i) => (user[i] || '').trim().toLowerCase() === b.toLowerCase()).length;
      const pts  = correct.length ? Math.round((hits / correct.length) * q.points) : 0;
      return { ...q, achievedPoints: pts, feedback: `${hits} von ${correct.length} Lücken korrekt.` };
    }

    return q;
  };

  const handleSubmitExam = async (finalQuestions: ExamQuestion[]) => {
    setIsLoading(true);
    try {
      // Auto-Auswertung für alle nicht-open Typen
      const preEvaluated = finalQuestions.map(q => q.type === 'open' ? q : autoEvaluate(q));

      // KI nur für offene Fragen
      const openQs = preEvaluated.filter(q => q.type === 'open');
      let evaluated = preEvaluated;
      if (openQs.length > 0) {
        const aiResults = await evaluateExamAnswers(openQs);
        evaluated = preEvaluated.map(q => {
          if (q.type !== 'open') return q;
          return aiResults.find(r => r.id === q.id) ?? q;
        });
      }

      setQuestions(evaluated);
      setMode('result');
      const totalPoints    = evaluated.reduce((s, q) => s + q.points, 0);
      const achievedPoints = evaluated.reduce((s, q) => s + (q.achievedPoints ?? 0), 0);
      const score = totalPoints > 0 ? Math.round((achievedPoints / totalPoints) * 100) : 0;
      onComplete?.({ score, docName: examDocName, passed: score >= 50, totalPoints, achievedPoints });
    } catch (e) {
      toast.error('Bewertung fehlgeschlagen. Bitte versuche es erneut.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading && !questions) {
    return (
      <div className="flex flex-col items-center justify-center py-20 lg:py-32 space-y-8 animate-in fade-in duration-500 px-4">
        <div className="relative">
          <div className="w-24 h-24 border-8 border-indigo-100 dark:border-indigo-900/30 rounded-full"></div>
          <div className="w-24 h-24 border-8 border-indigo-600 border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
        </div>
        <div className="text-center space-y-2">
          <p className="text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tighter">Prüfung wird konzipiert...</p>
          <p className="text-slate-500 dark:text-slate-400 font-medium italic">"Gute Lehre braucht Zeit - auch bei KIs"</p>
        </div>
      </div>
    );
  }

  if (!questions) {
    return <ExamGenerator
      onGenerate={handleGenerate}
      isLoading={isLoading}
      documents={documents}
      collections={collections}
      getDocumentSource={getDocumentSource}
      onSaveToLibrary={onSaveToLibrary}
      initialDoc={initialDoc}
    />;
  }

  return (
    <div className="space-y-10 animate-in fade-in duration-700">
      <div className="flex justify-between items-center bg-white dark:bg-slate-900 p-6 rounded-[32px] border border-slate-200 dark:border-slate-800 shadow-3d-raised">
        <div>
          <h2 className="text-xl font-black dark:text-white">Klausur-Simulator</h2>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Status: {mode === 'edit' ? 'Bearbeitung' : mode === 'solve' ? 'Simulation' : 'Ergebnis'}</p>
        </div>
        <div className="flex items-center gap-4">
          {mode === 'edit' && (
            <button
              onClick={handleStartExam}
              className="bg-indigo-600 text-white px-8 py-3 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] shadow-lg hover:scale-105 transition-all flex items-center gap-2"
            >
              Simulation starten
              <GeneratedImage prompt="Rocket launch icon, minimalist" className="w-4 h-4 rounded-full" />
            </button>
          )}

          {/* Abbrechen — mit Bestätigung während der Simulation */}
          {mode === 'solve' && showCancelConfirm ? (
            <div className="flex items-center gap-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 px-4 py-2 rounded-2xl animate-in fade-in duration-200">
              <p className="text-[9px] font-black uppercase tracking-widest text-rose-600 dark:text-rose-400">Klausur abbrechen?</p>
              <button onClick={resetExam} className="text-[9px] font-black uppercase tracking-widest text-rose-600 hover:text-rose-800 transition-colors">Ja</button>
              <button onClick={() => setShowCancelConfirm(false)} className="text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-colors">Nein</button>
            </div>
          ) : mode !== 'result' ? (
            <button
              onClick={() => mode === 'solve' ? setShowCancelConfirm(true) : resetExam()}
              className="text-slate-400 hover:text-rose-500 font-black uppercase text-[9px] tracking-widest p-2 transition-colors"
            >
              Abbrechen / Neu
            </button>
          ) : null}
        </div>
      </div>

      <ExamView
        questions={questions}
        mode={mode}
        onSave={(updated) => setQuestions(updated)}
        onSubmit={handleSubmitExam}
        isEvaluating={isLoading}
        examDuration={examDuration}
        onNewExam={resetExam}
        onNavigate={onNavigate}
      />
    </div>
  );
};
