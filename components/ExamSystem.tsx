
import React, { useState } from 'react';
import { ExamGenerator } from './ExamGenerator';
import { ExamView } from './ExamView';
import { ExamQuestion, ProcessedDocument, Collection } from '../types';
import { generateFullExam, evaluateExamAnswers, GenerationSource } from '../services/geminiService';
import { GeneratedImage } from './GeneratedImage';
import { toast } from '../services/toast';

interface ExamSystemProps {
  documents: ProcessedDocument[];
  collections: Collection[];
  getDocumentSource?: (doc: ProcessedDocument) => Promise<GenerationSource>;
  onSaveToLibrary?: (file: File) => void;
}

export const ExamSystem: React.FC<ExamSystemProps> = ({ documents, collections, getDocumentSource, onSaveToLibrary }) => {
  const [questions, setQuestions] = useState<ExamQuestion[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<'edit' | 'solve' | 'result'>('edit');

  const handleGenerate = async (content: GenerationSource, style?: GenerationSource, options?: { count: number, difficulty: string }) => {
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

  const handleSubmitExam = async (finalQuestions: ExamQuestion[]) => {
    setIsLoading(true);
    try {
      const evaluated = await evaluateExamAnswers(finalQuestions);
      setQuestions(evaluated);
      setMode('result');
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
          <div className="w-24 h-24 border-8 border-rose-100 dark:border-rose-900/30 rounded-full"></div>
          <div className="w-24 h-24 border-8 border-rose-600 border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
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
    />;
  }

  return (
    <div className="space-y-10 animate-in fade-in duration-700">
      <div className="flex justify-between items-center bg-white dark:bg-slate-900 p-6 rounded-[32px] border border-slate-200 dark:border-slate-800 shadow-3d-raised">
        <div>
          <h2 className="text-xl font-black dark:text-white">Klausur-Simulator</h2>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Status: {mode === 'edit' ? 'Bearbeitung' : mode === 'solve' ? 'Simulation' : 'Ergebnis'}</p>
        </div>
        <div className="flex gap-4">
          {mode === 'edit' && (
            <button 
              onClick={handleStartExam}
              className="bg-emerald-600 text-white px-8 py-3 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] shadow-lg hover:scale-105 transition-all flex items-center gap-2"
            >
              Simulation starten
              <GeneratedImage prompt="Rocket launch icon, minimalist" className="w-4 h-4 rounded-full" />
            </button>
          )}
          <button 
            onClick={() => { setQuestions(null); setMode('edit'); }}
            className="text-slate-400 hover:text-rose-500 font-black uppercase text-[9px] tracking-widest p-2"
          >
            Abbrechen / Neu
          </button>
        </div>
      </div>

      <ExamView 
        questions={questions} 
        mode={mode}
        onSave={(updated) => setQuestions(updated)}
        onSubmit={handleSubmitExam}
        isEvaluating={isLoading}
      />
    </div>
  );
};
