
import React, { useState } from 'react';
import { ExamGenerator } from './ExamGenerator';
import { ExamArchive } from './ExamArchive';
import { ExamView } from './ExamView';
import { ExamQuestion, ProcessedDocument, Collection, ActiveTab, ScoringProfile, ExamAnalysis, TopicMetric, FlashcardDeck } from '../types';
import { generateFullExam, evaluateWithRubric, analyzeExamResults, GenerationSource } from '../services/geminiService';
import { formatFeedbackContext } from '../services/examFeedbackService';
import { normalizeExamQuestions } from '../services/examNormalize';
import { scoreMc } from '../services/examScoring';
import { GeneratedImage } from './GeneratedImage';
import { toast } from '../services/toast';
import { useTranslation } from '../i18n/I18nProvider';
import { t as translate } from '../i18n';
import { saveExamToStorage } from '../services/savedExamsService';
import { interleaveQuestionsByTopic } from '../services/interleave';

interface ExamSystemProps {
  documents: ProcessedDocument[];
  collections: Collection[];
  getDocumentSource?: (doc: ProcessedDocument) => GenerationSource;
  onSaveToLibrary?: (file: File) => void;
  onComplete?: (result: {
    score: number; docName: string; passed: boolean; totalPoints: number; achievedPoints: number;
    weakTopics: string[]; categoryBreakdown: { category: string; score: number }[];
    typeBreakdown: { type: string; score: number }[];
    fatigue?: { earlyScore: number; lateScore: number };
    questions: ExamQuestion[];
  }) => void;
  onNavigate?: (tab: ActiveTab) => void;
  onAction?: (topic: string, mode: 'cards' | 'recall' | 'quiz') => void;
  initialDoc?: ProcessedDocument;
  initialQuestions?: ExamQuestion[];
  metrics: TopicMetric[];
  decks: FlashcardDeck[];
}

const DEFAULT_SCORING_PROFILE: ScoringProfile = { mode: 'standard', emphases: [] };

export const ExamSystem: React.FC<ExamSystemProps> = ({ documents, collections, getDocumentSource, onSaveToLibrary, onComplete, onNavigate, onAction, initialDoc, initialQuestions, metrics, decks }) => {
  const { t } = useTranslation();
  // Auch gespeicherte/ältere Klausuren durch die Normalisierung schicken —
  // unbewertbare Aufgaben dürfen nie in die Wertung zählen.
  const [questions, setQuestions]         = useState<ExamQuestion[] | null>(initialQuestions ? normalizeExamQuestions(initialQuestions) : null);
  const [isLoading, setIsLoading]         = useState(false);
  const [loadingHint, setLoadingHint]     = useState('');
  const [mode, setMode]                   = useState<'edit' | 'solve' | 'result'>(() =>
    initialQuestions?.some(q => q.userAnswer !== undefined) ? 'solve' : 'edit'
  );
  const [examDocName, setExamDocName]     = useState(translate('es.examDefaultName'));
  const [examDuration, setExamDuration]   = useState<number | undefined>(undefined);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [currentAnswers, setCurrentAnswers] = useState<Record<string, any>>(() => {
    if (!initialQuestions) return {};
    return Object.fromEntries(
      initialQuestions.filter(q => q.userAnswer !== undefined).map(q => [q.id, q.userAnswer])
    );
  });
  const [scoringProfile, setScoringProfile] = useState<ScoringProfile>(DEFAULT_SCORING_PROFILE);
  const [examAnalysis, setExamAnalysis]     = useState<ExamAnalysis | null>(null);
  const [categoryBreakdown, setCategoryBreakdown] = useState<{ category: string; score: number }[]>([]);

  const resetExam = () => { setQuestions(null); setMode('edit'); setShowCancelConfirm(false); setExamDuration(undefined); setExamAnalysis(null); setCategoryBreakdown([]); };

  // Vorübergehende KI-Überlastung: clientseitig erneut versuchen. Das Backend
  // wiederholt selbst schon kurz — hier fangen wir längere Aussetzer ab und
  // halten den Nutzer mit einem Status-Hinweis auf dem Laufenden.
  const isTransientError = (msg: string) =>
    /ausgelast|überlast|quota|\b503\b|RESOURCE_EXHAUSTED|rate limit|\b429\b|timeout|erneut versuchen/i.test(msg);

  const handleGenerate = async (
    content: GenerationSource, style?: GenerationSource,
    options?: { count: number; difficulty: string; types?: string[]; adaptive?: { weakCategories: string[]; weakTopics: string[] } },
    docName?: string, totalMinutes?: number, profile?: ScoringProfile
  ) => {
    if (docName) setExamDocName(docName.replace(/\.[^/.]+$/, ''));
    if (totalMinutes) setExamDuration(totalMinutes);
    if (profile) setScoringProfile(profile);
    setIsLoading(true);
    setLoadingHint('');

    const maxAttempts = 3;
    try {
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const exam = normalizeExamQuestions(await generateFullExam(content, style, options));
          if (exam.length === 0) throw new Error(translate('es.noValidQuestions'));
          setQuestions(interleaveQuestionsByTopic(exam));
          setMode('edit');
          return;
        } catch (e: any) {
          const msg = e?.message || translate('es.unknownError');
          if (attempt < maxAttempts && isTransientError(msg)) {
            setLoadingHint(t('es.retryHint', { attempt: attempt + 1, max: maxAttempts }));
            await new Promise(r => setTimeout(r, 2000 * attempt)); // 2s, 4s
            continue;
          }
          toast.error(t('es.genFailed', { msg }));
          return;
        }
      }
    } finally {
      setIsLoading(false);
      setLoadingHint('');
    }
  };

  const handleStartExam = () => {
    setMode('solve');
  };

  const autoEvaluate = (q: ExamQuestion): ExamQuestion => {
    const empty = (v: any) => v === undefined || v === null || (Array.isArray(v) && !v.filter((x: any) => x !== undefined && x !== null && x !== '' && x !== -1).length);
    if (empty(q.userAnswer)) return { ...q, achievedPoints: 0, feedback: t('ev.noAnswer') };

    if (q.type === 'mc') {
      const user: number[] = q.userAnswer || [];
      const correct: number[] = q.correctIndices || [];
      if (!correct.length) return { ...q, achievedPoints: 0, feedback: t('es.mcNoBasis') };
      // Falsche Kreuze ziehen ab (Hochschulmaßstab): verhindert „alles ankreuzen"
      // als Strategie und belohnt Teilwissen statt pauschal 0 zu geben.
      const { fraction, hits, wrong, totalCorrect } = scoreMc(user, correct);
      const pts = Math.round(fraction * q.points);
      if (pts === q.points) return { ...q, achievedPoints: q.points, feedback: t('es.fullyCorrect') };
      if (pts > 0)          return { ...q, achievedPoints: pts, feedback: t('es.mcPartial', { hits, total: totalCorrect, wrong }) };
      return { ...q, achievedPoints: 0, feedback: t('es.wrongCorrect', { list: correct.map(i => q.options?.[i] ?? translate('ev.pdf.optionN', { n: i + 1 })).join(', ') }) };
    }

    if (q.type === 'truefalse') {
      const ans: { tf?: boolean; reason?: number } = q.userAnswer || {};
      if (ans.tf === undefined) return { ...q, achievedPoints: 0, feedback: t('ev.noAnswer') };
      if (ans.tf !== q.tfCorrect) return { ...q, achievedPoints: 0, feedback: t('es.tfWrong', { answer: q.tfCorrect ? t('ev.answerRight') : t('ev.answerWrong') }) };
      if (q.tfReasonOptions?.length && ans.reason !== undefined) {
        if (ans.reason === q.tfCorrectReasonIndex) return { ...q, achievedPoints: q.points, feedback: t('es.statementReasonCorrect') };
        return { ...q, achievedPoints: Math.floor(q.points / 2), feedback: t('es.statementCorrectReasonWrong', { reason: q.tfReasonOptions[q.tfCorrectReasonIndex ?? 0] }) };
      }
      return { ...q, achievedPoints: q.points, feedback: t('es.correct') };
    }

    if (q.type === 'matching') {
      const user: number[] = q.userAnswer || [];
      const correct: number[] = q.matchCorrect || [];
      const hits = correct.filter((ci, i) => user[i] === ci).length;
      const pts  = correct.length ? Math.round((hits / correct.length) * q.points) : 0;
      return { ...q, achievedPoints: pts, feedback: hits === correct.length ? t('es.allMatchCorrect') : t('es.matchScore', { hits, total: correct.length }) };
    }

    if (q.type === 'fillblank') {
      const user: string[] = q.userAnswer || [];
      const correct: string[] = q.blanks || [];
      const hits = correct.filter((b, i) => (user[i] || '').trim().toLowerCase() === b.toLowerCase()).length;
      const pts  = correct.length ? Math.round((hits / correct.length) * q.points) : 0;
      return { ...q, achievedPoints: pts, feedback: t('es.blankScore', { hits, total: correct.length }) };
    }

    if (q.type === 'ranking') {
      const user: string[] = q.userAnswer || [];
      const correct: string[] = q.rankingItems || [];
      const hits = correct.filter((item, i) => item === user[i]).length;
      const pts  = correct.length ? Math.round((hits / correct.length) * q.points) : 0;
      return { ...q, achievedPoints: pts, feedback: hits === correct.length ? t('es.rankAllCorrect') : t('es.rankScore', { hits, total: correct.length, order: correct.join(' → ') }) };
    }

    if (q.type === 'numeric') {
      const user = parseFloat(q.userAnswer);
      const correct = q.numericAnswer ?? 0;
      const tolerance = q.numericTolerance ?? 0;
      if (!isNaN(user) && Math.abs(user - correct) <= tolerance) {
        return { ...q, achievedPoints: q.points, feedback: t('es.numCorrect', { value: user }) };
      }
      return { ...q, achievedPoints: 0, feedback: t('es.numWrong', { answer: correct, tol: tolerance > 0 ? ` (±${tolerance})` : '' }) };
    }

    return q;
  };

  const handleSubmitExam = async (finalQuestions: ExamQuestion[]) => {
    setIsLoading(true);
    try {
      // Automatische Auswertung für alle nicht-open Typen
      const preEvaluated = finalQuestions.map(q => q.type === 'open' ? q : autoEvaluate(q));

      // Rubrik-basierte KI-Bewertung für offene Fragen
      const openQs = preEvaluated.filter(q => q.type === 'open');
      let evaluated = preEvaluated;
      if (openQs.length > 0) {
        const feedbackContexts: Record<string, string> = {};
        openQs.forEach(q => {
          const ctx = formatFeedbackContext(q.question);
          if (ctx) feedbackContexts[q.id] = ctx;
        });
        const aiResults = await evaluateWithRubric(openQs, scoringProfile, feedbackContexts);
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
      // Schwache Themen: Aufgaben mit weniger als 50% der Punkte (dedupliziert)
      const weakTopics = [...new Set(
        evaluated
          .filter(q => q.topic && q.points > 0 && (q.achievedPoints ?? 0) / q.points < 0.5)
          .map(q => q.topic as string)
      )];

      // Kategorie-Aufschlüsselung: Score je Kategorie über alle Fragen dieser Kategorie
      const categoryPoints: Record<string, { achieved: number; total: number }> = {};
      evaluated.forEach(q => {
        if (!q.category || q.points <= 0) return;
        const entry = categoryPoints[q.category] ?? { achieved: 0, total: 0 };
        entry.achieved += q.achievedPoints ?? 0;
        entry.total += q.points;
        categoryPoints[q.category] = entry;
      });
      const categoryBreakdown = Object.entries(categoryPoints).map(([category, { achieved, total }]) => ({
        category, score: total > 0 ? Math.round((achieved / total) * 100) : 0,
      }));

      // Typ-Aufschlüsselung: Score je Fragetyp (Grundlage für das Wissensprofil im Lern-Coach)
      const typePoints: Record<string, { achieved: number; total: number }> = {};
      evaluated.forEach(q => {
        if (q.points <= 0) return;
        const entry = typePoints[q.type] ?? { achieved: 0, total: 0 };
        entry.achieved += q.achievedPoints ?? 0;
        entry.total += q.points;
        typePoints[q.type] = entry;
      });
      const typeBreakdown = Object.entries(typePoints).map(([type, { achieved, total }]) => ({
        type, score: total > 0 ? Math.round((achieved / total) * 100) : 0,
      }));

      // Fatigue-Signal: Score erste vs. zweite Hälfte der Fragen in Original-Reihenfolge
      const withPoints = evaluated.filter(q => q.points > 0);
      const mid = Math.floor(withPoints.length / 2);
      const scoreOf = (qs: ExamQuestion[]) => {
        const total = qs.reduce((s, q) => s + q.points, 0);
        const achieved = qs.reduce((s, q) => s + (q.achievedPoints ?? 0), 0);
        return total > 0 ? Math.round((achieved / total) * 100) : 0;
      };
      const fatigue = withPoints.length >= 4
        ? { earlyScore: scoreOf(withPoints.slice(0, mid)), lateScore: scoreOf(withPoints.slice(mid)) }
        : undefined;

      onComplete?.({ score, docName: examDocName, passed: score >= 50, totalPoints, achievedPoints, weakTopics, categoryBreakdown, typeBreakdown, fatigue, questions: evaluated });
      setCategoryBreakdown(categoryBreakdown);

      // Analyse asynchron im Hintergrund (kein Blocker)
      analyzeExamResults(evaluated)
        .then(setExamAnalysis)
        .catch(() => {});
    } catch (e) {
      toast.error(t('es.evalFailed'));
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
          <p className="text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tighter">{t('es.conceiving')}</p>
          <p className="text-slate-500 dark:text-slate-400 font-medium italic">"Gute Lehre braucht Zeit - auch bei KIs"</p>
          {loadingHint && (
            <p className="text-[11px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400 pt-2 animate-pulse">
              {loadingHint}
            </p>
          )}
        </div>
      </div>
    );
  }

  if (!questions) {
    return <>
      <ExamGenerator
        onGenerate={handleGenerate}
        isLoading={isLoading}
        documents={documents}
        collections={collections}
        getDocumentSource={getDocumentSource}
        onSaveToLibrary={onSaveToLibrary}
        initialDoc={initialDoc}
        metrics={metrics}
        decks={decks}
      />
      <ExamArchive />
    </>;
  }

  return (
    <div className="space-y-10 animate-in fade-in duration-700">
      <div className="flex justify-between items-center bg-white dark:bg-slate-900 p-6 rounded-[32px] border border-slate-200 dark:border-slate-800 shadow-3d-raised">
        <div>
          <h2 className="text-xl font-black dark:text-white">{t('nav.exam')}</h2>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">{t('es.statusLabel', { status: mode === 'edit' ? t('es.tabSolve') : mode === 'solve' ? t('es.tabSimulation') : t('es.tabResult') })}</p>
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
              <p className="text-[9px] font-black uppercase tracking-widest text-rose-600 dark:text-rose-400">{t('es.cancelExam')}</p>
              <button onClick={resetExam} className="text-[9px] font-black uppercase tracking-widest text-rose-600 hover:text-rose-800 transition-colors">{t('ev.fbYes')}</button>
              <button onClick={() => setShowCancelConfirm(false)} className="text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-colors">{t('es.no')}</button>
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
        initialAnswers={currentAnswers}
        onAnswersChange={setCurrentAnswers}
        examTitle={examDocName}
        scoringProfile={scoringProfile}
        analysis={examAnalysis}
        categoryBreakdown={categoryBreakdown}
        onAction={onAction}
        onSaveProgress={(name) => {
          const withAnswers = questions.map(q => ({ ...q, userAnswer: currentAnswers[q.id] }));
          saveExamToStorage({ name, docName: examDocName, questions: withAnswers });
          toast.success(t('es.examSaved'));
        }}
        onSaveExam={(name) => {
          const clean = questions.map(q => ({ ...q, userAnswer: undefined, feedback: undefined, achievedPoints: undefined }));
          saveExamToStorage({ name, docName: examDocName, questions: clean });
          toast.success(t('es.examSaved'));
        }}
      />
    </div>
  );
};
