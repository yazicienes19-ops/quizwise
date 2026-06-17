import { useState, useRef, useEffect } from 'react';
import { ProcessedDocument, QuizQuestion, UserAnswer, FlashcardDeck, Flashcard, ActiveTab, QuizType, TopicMetric, ExamTerm, QuizConfig } from '../types';
import type { GenerationSource } from '../services/geminiService';
import { generateQuizFromDocument } from '../services/geminiService';
import { getSavedQuizzes, saveQuizToStorage, deleteSavedQuiz, SavedQuiz } from '../services/savedQuizzesService';
import { getSavedExams, deleteSavedExam, SavedExam } from '../services/savedExamsService';
import { getMeta, saveMeta } from '../services/libraryService';
import { saveQuizResult, getDocStats } from '../services/quizHistoryService';
import { recordActivity } from '../services/streakService';
import { toast } from '../services/toast';

interface UseQuizStateParams {
  documents: ProcessedDocument[];
  decks: FlashcardDeck[];
  metrics: TopicMetric[];
  examTerms: ExamTerm[];
  pendingActionDoc: ProcessedDocument | null;
  getDocumentSource: (doc: ProcessedDocument) => GenerationSource;
  setActiveTab: (tab: ActiveTab) => void;
  setPendingActionDoc: (doc: ProcessedDocument | null) => void;
  setPendingTopic: (t: string | null) => void;
  setDecks: (d: FlashcardDeck[]) => void;
  setIsLoading: (v: boolean) => void;
  handleApiError: (e: any) => void;
  updateMetricsAfterSession: (score: number, name: string, type: 'quiz' | 'exam' | 'recall' | 'cards') => Promise<void>;
}

const PROGRESS_KEY = 'quizwise_quiz_progress';

export const useQuizState = (params: UseQuizStateParams) => {
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [answers, setAnswers] = useState<UserAnswer[]>([]);
  const [activeQuizMeta, setActiveQuizMeta] = useState<{ docId: string; docName: string } | null>(null);
  const [quizInitialAnswers, setQuizInitialAnswers] = useState<UserAnswer[] | undefined>(undefined);
  const [savedQuizzes, setSavedQuizzes] = useState<SavedQuiz[]>(() => getSavedQuizzes());
  const [savedExams, setSavedExams] = useState<SavedExam[]>(() => getSavedExams());
  const [examInitialQuestions, setExamInitialQuestions] = useState<SavedExam | null>(null);

  const progressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveQuizProgress = (qs: QuizQuestion[], ans: UserAnswer[], meta: { docId: string; docName: string } | null) => {
    if (progressTimer.current) clearTimeout(progressTimer.current);
    progressTimer.current = setTimeout(() => {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify({ questions: qs, answers: ans, meta, timestamp: Date.now() }));
    }, 250);
  };

  const clearQuizProgress = () => localStorage.removeItem(PROGRESS_KEY);

  const loadQuizProgress = () => {
    try {
      const raw = localStorage.getItem(PROGRESS_KEY);
      if (!raw) return null;
      const p = JSON.parse(raw);
      const age = Date.now() - (p.timestamp ?? 0);
      if (age > 7 * 24 * 60 * 60 * 1000) { clearQuizProgress(); return null; }
      if (!p.questions?.length || p.answers?.length >= p.questions?.length) { clearQuizProgress(); return null; }
      return p as { questions: QuizQuestion[]; answers: UserAnswer[]; meta: { docId: string; docName: string } | null };
    } catch { return null; }
  };

  useEffect(() => {
    const progress = loadQuizProgress();
    if (progress?.questions?.length) {
      setQuestions(progress.questions);
      if (progress.answers?.length > 0) setQuizInitialAnswers(progress.answers);
      if (progress.meta) setActiveQuizMeta(progress.meta);
      params.setActiveTab(ActiveTab.QUIZ);
      setTimeout(() => toast.info(`Quiz fortgesetzt – Frage ${progress.answers.length + 1} von ${progress.questions.length}`), 500);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSaveQuiz = (name: string) => {
    saveQuizToStorage({ name, docName: activeQuizMeta?.docName || 'Quiz', questions });
    setSavedQuizzes(getSavedQuizzes());
    toast.success('Quiz gespeichert!');
  };

  const handleLoadSavedQuiz = (quiz: SavedQuiz) => {
    clearQuizProgress();
    setAnswers([]);
    setQuestions(quiz.questions);
    setActiveQuizMeta({ docId: `saved-${quiz.id}`, docName: quiz.name });
    params.setPendingActionDoc(null);
    setQuizInitialAnswers(quiz.resumeAnswers?.length ? quiz.resumeAnswers : undefined);
    params.setActiveTab(ActiveTab.QUIZ);
  };

  const handleDeleteSavedQuiz = (id: string) => { deleteSavedQuiz(id); setSavedQuizzes(getSavedQuizzes()); };

  const handleLoadSavedExam = (exam: SavedExam) => { setExamInitialQuestions(exam); params.setActiveTab(ActiveTab.EXAM); };

  const handleDeleteSavedExam = (id: string) => { deleteSavedExam(id); setSavedExams(getSavedExams()); };

  const getUsedTopics = (docId: string): string[] => {
    try { return JSON.parse(localStorage.getItem(`quizwise_topics_${docId}`) || '[]'); } catch { return []; }
  };

  const saveUsedTopics = (docId: string, qs: QuizQuestion[]) => {
    const newTopics = qs.map(q => q.topic).filter(Boolean) as string[];
    if (!newTopics.length) return;
    const merged = [...getUsedTopics(docId), ...newTopics].slice(-60);
    localStorage.setItem(`quizwise_topics_${docId}`, JSON.stringify(merged));
  };

  const handleStartQuizFromDoc = async (doc: ProcessedDocument, quizType: QuizType = QuizType.FAST, options?: any) => {
    params.setIsLoading(true);
    params.setActiveTab(ActiveTab.QUIZ);
    setAnswers([]);
    setQuestions([]);
    try {
      const source = params.getDocumentSource(doc);
      const excludeTopics = getUsedTopics(doc.id);
      const quiz = await generateQuizFromDocument(source, quizType, { ...options, excludeTopics });
      const meta = { docId: doc.id, docName: doc.name.replace(/\.[^/.]+$/, '') };
      setQuestions(quiz);
      setQuizInitialAnswers(undefined);
      saveUsedTopics(doc.id, quiz);
      setActiveQuizMeta(meta);
      saveQuizProgress(quiz, [], meta);
    } catch (e: any) {
      const msg = e?.message?.includes('nicht verfügbar')
        ? 'Dokument nicht verfügbar. Bitte lade es neu hoch.'
        : e?.message?.includes('LIMIT_REACHED')
        ? 'Tageslimit erreicht. Bitte versuche es morgen wieder.'
        : `Quiz-Generierung fehlgeschlagen: ${e?.message || 'Unbekannter Fehler'}`;
      toast.error(msg);
    } finally { params.setIsLoading(false); }
  };

  const handleStartQuizFromSetup = async (config: QuizConfig, docIds: string[] = []) => {
    if (!params.pendingActionDoc) return;
    params.setPendingTopic(null);
    params.setIsLoading(true);
    setQuestions([]);
    setAnswers([]);
    try {
      const selectedDocs = docIds.length > 1
        ? params.documents.filter(d => docIds.includes(d.id))
        : [params.pendingActionDoc!];

      let source: GenerationSource;
      let metaName: string;
      if (selectedDocs.length > 1) {
        const combined = selectedDocs.map(d => {
          const txt = d.digestText || (d.type === 'text' ? d.content : '');
          return `[Quelle: ${d.name.replace(/\.[^/.]+$/, '')}]\n${txt}`;
        }).join('\n\n---\n\n');
        source = { text: combined };
        metaName = `${selectedDocs.length} Dokumente`;
      } else {
        source = params.getDocumentSource(params.pendingActionDoc!);
        metaName = params.pendingActionDoc!.name.replace(/\.[^/.]+$/, '');
      }

      setActiveQuizMeta({ docId: params.pendingActionDoc!.id, docName: metaName });
      const stats = getDocStats(params.pendingActionDoc!.id);
      const customFocus = config.focus === 'weak' && stats.weakTopics.length > 0
        ? `Fokus auf schwache Themen: ${stats.weakTopics.join(', ')}` : undefined;
      const excludeTopics = getUsedTopics(params.pendingActionDoc!.id);
      const quiz = await generateQuizFromDocument(source, QuizType.CUSTOM, {
        customCount: config.questionCount,
        customDifficulty: config.difficulty,
        customFocus,
        questionType: config.questionType,
        excludeTopics,
      });
      setQuestions(quiz);
      setQuizInitialAnswers(undefined);
      saveUsedTopics(params.pendingActionDoc!.id, quiz);
      saveQuizProgress(quiz, [], { docId: params.pendingActionDoc!.id, docName: metaName });
    } catch (e) { params.handleApiError(e); } finally { params.setIsLoading(false); }
  };

  const onQuizComplete = async (ans: UserAnswer[]) => {
    clearQuizProgress();
    setQuizInitialAnswers(undefined);
    setAnswers(ans);
    const correct = ans.filter(a => a.isCorrect).length;
    const score = Math.round((correct / ans.length) * 100);
    const wrongQs = questions.filter((_, i) => !ans[i]?.isCorrect);
    const allTopics = wrongQs.map(q => q.topic).filter((t): t is string => Boolean(t));
    const weakTopics = allTopics.filter((t, i) => allTopics.indexOf(t) === i);

    if (activeQuizMeta) {
      saveQuizResult({ docId: activeQuizMeta.docId, docName: activeQuizMeta.docName, timestamp: Date.now(), score, correctCount: correct, totalCount: ans.length, weakTopics, questions, answers: ans });
      const stats = getDocStats(activeQuizMeta.docId);
      saveMeta(activeQuizMeta.docId, { quizCount: stats.count, lastQuizAt: Date.now(), avgQuizAccuracy: stats.avgAccuracy ?? score, weakTopics: stats.weakTopics });
    }

    await params.updateMetricsAfterSession(score, activeQuizMeta?.docName || 'Quiz Session', 'quiz');
    recordActivity();
  };

  const handleCreateFlashcardsFromMistakes = (wrongQuestions: QuizQuestion[]) => {
    if (!wrongQuestions.length) return;
    const cards: Flashcard[] = wrongQuestions.map(q => {
      const correctAnswerText = q.options.length > 0 ? q.correctAnswerIndices.map(i => q.options[i]).filter(Boolean).join(' / ') : '';
      const back = correctAnswerText ? correctAnswerText + (q.explanation ? `\n\n${q.explanation}` : '') : q.explanation || '';
      return { id: Math.random().toString(36).slice(2, 9), front: q.question, back, level: 0, nextReview: Date.now() };
    });

    const newDeck: FlashcardDeck = {
      id: Math.random().toString(36).slice(2, 9),
      title: `Fehler: ${activeQuizMeta?.docName || 'Quiz'}`,
      cards,
      sourceDocumentId: activeQuizMeta?.docId,
    };

    const updatedDecks = [...params.decks, newDeck];
    params.setDecks(updatedDecks);
    localStorage.setItem('flashcard_decks', JSON.stringify(updatedDecks));

    if (activeQuizMeta?.docId) {
      const current = getMeta(activeQuizMeta.docId);
      saveMeta(activeQuizMeta.docId, { flashcardCount: (current.flashcardCount ?? 0) + cards.length });
    }

    toast.success(`${cards.length} Karteikarten aus Fehlern erstellt`);
    params.setPendingActionDoc(null);
    params.setActiveTab(ActiveTab.CARDS);
  };

  return {
    questions, setQuestions,
    answers, setAnswers,
    activeQuizMeta, setActiveQuizMeta,
    quizInitialAnswers, setQuizInitialAnswers,
    savedQuizzes, setSavedQuizzes,
    savedExams, setSavedExams,
    examInitialQuestions, setExamInitialQuestions,
    saveQuizProgress, clearQuizProgress,
    handleSaveQuiz, handleLoadSavedQuiz, handleDeleteSavedQuiz,
    handleLoadSavedExam, handleDeleteSavedExam,
    handleStartQuizFromDoc, handleStartQuizFromSetup,
    onQuizComplete, handleCreateFlashcardsFromMistakes,
  };
};
