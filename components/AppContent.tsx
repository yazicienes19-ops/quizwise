import React from 'react';
import { flushSync } from 'react-dom';
import type { User } from '@supabase/supabase-js';
import { Dashboard } from './Dashboard';
import { QuizPlayer } from './QuizPlayer';
import { QuizSetup } from './QuizSetup';
import { ResultView } from './ResultView';
import { FileUploader } from './FileUploader';
import { saveQuizToStorage } from '../services/savedQuizzesService';
import type { SavedQuiz } from '../services/savedQuizzesService';
import type { SavedExam } from '../services/savedExamsService';
import { getSavedQuizzes } from '../services/savedQuizzesService';
import { getSavedExams } from '../services/savedExamsService';
import { searchScholar, searchWeb, generateQuizFromDocument, generateQuizFromFlashcards } from '../services/geminiService';
import { getAllResults } from '../services/quizHistoryService';
import { countDueMistakes, addExamMistakes } from '../services/mistakeReviewService';
import type { MistakeItem } from '../services/mistakeReviewService';
import { saveRecallResult } from '../services/recallHistoryService';
import { saveExamResult } from '../services/examHistoryService';
import { recordActivity } from '../services/streakService';
import { isAdmin } from '../config/admin';
import { toast } from '../services/toast';
import {
  ActiveTab, ProcessedDocument, QuizQuestion, UserAnswer, TopicMetric,
  SearchResult, QuizType, FlashcardDeck, Collection, ExamTerm,
  LearningFlowResult, QuizConfig,
} from '../types';
import type { GenerationSource } from '../services/geminiService';

const TermPaperSystem = React.lazy(() => import('./TermPaperSystem').then(m => ({ default: m.TermPaperSystem })));
const ExamSystem = React.lazy(() => import('./ExamSystem').then(m => ({ default: m.ExamSystem })));
const ScholarSearch = React.lazy(() => import('./ScholarSearch').then(m => ({ default: m.ScholarSearch })));
const LibrarySystem = React.lazy(() => import('./LibrarySystem').then(m => ({ default: m.LibrarySystem })));
const ActiveRecall = React.lazy(() => import('./ActiveRecall').then(m => ({ default: m.ActiveRecall })));
const LearningCoach = React.lazy(() => import('./LearningCoach').then(m => ({ default: m.LearningCoach })));
const ExplainerSystem = React.lazy(() => import('./ExplainerSystem').then(m => ({ default: m.ExplainerSystem })));
const StudyPlanner = React.lazy(() => import('./StudyPlanner').then(m => ({ default: m.StudyPlanner })));
const FlashcardSystem = React.lazy(() => import('./FlashcardSystem').then(m => ({ default: m.FlashcardSystem })));

interface AppContentProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  isLoading: boolean;
  setIsLoading: (v: boolean) => void;
  user: User | null;
  userPlan: 'free' | 'pro';
  documents: ProcessedDocument[];
  collections: Collection[];
  handleFileUpload: (file: File, collectionId?: string) => Promise<string | null>;
  deleteDoc: (id: string) => void;
  addCollection: (col: Collection) => void;
  removeCollection: (id: string) => void;
  updateCollection: (col: Collection) => void;
  moveDoc: (docId: string, collectionId: string | undefined) => void;
  getDocumentSource: (doc: ProcessedDocument) => GenerationSource;
  questions: QuizQuestion[];
  setQuestions: (q: QuizQuestion[]) => void;
  answers: UserAnswer[];
  setAnswers: (a: UserAnswer[]) => void;
  activeQuizMeta: { docId: string; docName: string } | null;
  setActiveQuizMeta: (m: { docId: string; docName: string } | null) => void;
  quizInitialAnswers: UserAnswer[] | undefined;
  setQuizInitialAnswers: (a: UserAnswer[] | undefined) => void;
  savedQuizzes: SavedQuiz[];
  setSavedQuizzes: (q: SavedQuiz[]) => void;
  savedExams: SavedExam[];
  setSavedExams: (e: SavedExam[]) => void;
  examInitialQuestions: SavedExam | null;
  setExamInitialQuestions: (e: SavedExam | null) => void;
  pendingActionDoc: ProcessedDocument | null;
  setPendingActionDoc: (d: ProcessedDocument | null) => void;
  pendingTopic: string | null;
  setPendingTopic: (t: string | null) => void;
  decks: FlashcardDeck[];
  setDecks: (d: FlashcardDeck[]) => void;
  examTerms: ExamTerm[];
  saveExamTerms: (t: ExamTerm[]) => void;
  flowResult: LearningFlowResult | null;
  saveFlowResult: (r: LearningFlowResult) => void;
  metrics: TopicMetric[];
  searchResults: SearchResult[];
  setSearchResults: (r: SearchResult[]) => void;
  savedSources: SearchResult[];
  setSavedSources: React.Dispatch<React.SetStateAction<SearchResult[]>>;
  isSearching: boolean;
  setIsSearching: (v: boolean) => void;
  saveQuizProgress: (qs: QuizQuestion[], ans: UserAnswer[], meta: { docId: string; docName: string } | null) => void;
  clearQuizProgress: () => void;
  handleSaveQuiz: (name: string) => void;
  handleLoadSavedQuiz: (quiz: SavedQuiz) => void;
  handleDeleteSavedQuiz: (id: string) => void;
  handleLoadSavedExam: (exam: SavedExam) => void;
  handleDeleteSavedExam: (id: string) => void;
  onQuizComplete: (ans: UserAnswer[]) => Promise<void>;
  handleStartQuizFromDoc: (doc: ProcessedDocument, quizType?: QuizType, options?: any) => Promise<void>;
  handleStartQuizFromSetup: (config: QuizConfig, docIds?: string[]) => Promise<void>;
  handleCreateFlashcardsFromMistakes: (wrongQs: QuizQuestion[]) => void;
  reviewSessionItems: MistakeItem[] | null;
  setReviewSessionItems: (items: MistakeItem[] | null) => void;
  handleStartMistakeReview: () => void;
  handleApiError: (e: any) => void;
  updateMetricsAfterSession: (score: number, name: string, type: 'quiz' | 'exam' | 'recall' | 'cards') => Promise<void>;
}

export const AppContent: React.FC<AppContentProps> = (p) => {
  const {
    activeTab, setActiveTab, isLoading, setIsLoading, user, userPlan,
    documents, collections, handleFileUpload, deleteDoc, addCollection, removeCollection, updateCollection, moveDoc, getDocumentSource,
    questions, setQuestions, answers, setAnswers, activeQuizMeta, setActiveQuizMeta,
    quizInitialAnswers, setQuizInitialAnswers, savedQuizzes, setSavedQuizzes,
    savedExams, setSavedExams, examInitialQuestions, setExamInitialQuestions,
    pendingActionDoc, setPendingActionDoc, pendingTopic, setPendingTopic,
    decks, setDecks, examTerms, saveExamTerms, flowResult, saveFlowResult,
    metrics, searchResults, setSearchResults, savedSources, setSavedSources,
    isSearching, setIsSearching, saveQuizProgress, clearQuizProgress,
    handleSaveQuiz, handleLoadSavedQuiz, handleDeleteSavedQuiz,
    handleLoadSavedExam, handleDeleteSavedExam, onQuizComplete,
    handleStartQuizFromDoc, handleStartQuizFromSetup, handleCreateFlashcardsFromMistakes,
    setReviewSessionItems, handleStartMistakeReview,
    handleApiError, updateMetricsAfterSession,
  } = p;

  // Gemeinsamer Folge-Aktion-Handler für schwache Themen — von Lern-Coach UND Klausur-Ergebnis genutzt
  const handleWeakTopicAction = (topic: string, mode: 'cards' | 'recall' | 'quiz') => {
    if (mode === 'quiz') {
      const match = getAllResults().find(r => r.weakTopics.includes(topic));
      const doc = match ? documents.find(d => d.id === match.docId) ?? null : null;
      setPendingActionDoc(doc); setPendingTopic(doc ? topic : null);
      setQuestions([]); setAnswers([]); setActiveTab(ActiveTab.QUIZ);
    } else {
      const tabMap = { cards: ActiveTab.CARDS, recall: ActiveTab.RECALL, quiz: ActiveTab.QUIZ } as const;
      setActiveTab(tabMap[mode]);
    }
  };

  if (isLoading && activeTab !== ActiveTab.EXAM && activeTab !== ActiveTab.QUIZ && activeTab !== ActiveTab.PLANNER && activeTab !== ActiveTab.RECALL) {
    return (
      <div className="flex flex-col items-center justify-center py-20 lg:py-32 space-y-8 animate-in fade-in zoom-in-95 duration-500 px-4">
        <div className="relative">
          <div className="w-20 h-20 lg:w-24 lg:h-24 border-8 border-indigo-100 dark:border-indigo-900/30 rounded-full" />
          <div className="w-20 h-20 lg:w-24 lg:h-24 border-8 border-indigo-600 border-t-transparent rounded-full animate-spin absolute top-0 left-0" />
        </div>
        <p className="text-2xl font-black uppercase tracking-tighter text-slate-900 dark:text-white">KI am Werk...</p>
      </div>
    );
  }

  switch (activeTab) {
    case ActiveTab.DASHBOARD:
      return <Dashboard onTabChange={setActiveTab} flowResult={flowResult} onAcceptFlow={saveFlowResult} documents={documents} onStartMistakeReview={handleStartMistakeReview} />;

    case ActiveTab.LIBRARY:
      return <LibrarySystem
        documents={documents} collections={collections}
        onUpload={handleFileUpload} onDelete={deleteDoc}
        onAction={(tab, doc) => {
          if (tab === ActiveTab.QUIZ) { setPendingActionDoc(doc); setQuestions([]); setAnswers([]); setActiveTab(ActiveTab.QUIZ); }
          else if (tab === ActiveTab.EXPLAINER || tab === ActiveTab.CARDS || tab === ActiveTab.RECALL || tab === ActiveTab.EXAM) { setPendingActionDoc(doc); setActiveTab(tab); }
          else { setPendingActionDoc(null); setActiveTab(tab); }
        }}
        onAddCollection={addCollection} onDeleteCollection={removeCollection}
        onUpdateCollection={updateCollection}
        onMoveDocument={moveDoc} isLoading={isLoading}
      />;

    case ActiveTab.QUIZ: {
      if (isLoading) return (
        <div className="flex flex-col items-center justify-center py-32 space-y-6 animate-in fade-in duration-500 px-4">
          <div className="relative w-20 h-20">
            <div className="w-20 h-20 border-8 border-indigo-100 dark:border-indigo-900/30 rounded-full" />
            <div className="w-20 h-20 border-8 border-indigo-600 border-t-transparent rounded-full animate-spin absolute top-0 left-0" />
          </div>
          <div className="text-center space-y-1">
            <p className="text-lg font-black uppercase tracking-tighter dark:text-white">Quiz wird generiert</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">KI liest deine Quelle...</p>
          </div>
        </div>
      );
      if (pendingActionDoc && questions.length === 0 && answers.length === 0) {
        const fromRadar = !!pendingTopic;
        return <QuizSetup
          doc={pendingActionDoc} availableDocs={documents}
          onStart={handleStartQuizFromSetup}
          onBack={() => { setPendingActionDoc(null); setPendingTopic(null); setActiveTab(fromRadar ? ActiveTab.RADAR : ActiveTab.LIBRARY); }}
          initialFocus={pendingTopic ? 'weak' : 'all'}
        />;
      }
      if (questions.length > 0 && answers.length === 0) return <QuizPlayer
        questions={questions} sourceName={activeQuizMeta?.docName} examMode={false}
        initialAnswers={quizInitialAnswers}
        onProgress={(ans) => saveQuizProgress(questions, ans, activeQuizMeta)}
        onComplete={onQuizComplete}
        onSave={(name, currentAnswers) => {
          saveQuizToStorage({ name, docName: activeQuizMeta?.docName || 'Quiz', questions, resumeAnswers: currentAnswers });
          setSavedQuizzes(getSavedQuizzes());
          toast.success('Quiz gespeichert!');
        }}
        onCancel={() => { clearQuizProgress(); setQuizInitialAnswers(undefined); setQuestions([]); setAnswers([]); setPendingActionDoc(null); setReviewSessionItems(null); }}
      />;
      if (answers.length > 0) return <ResultView
        answers={answers} questions={questions} docName={activeQuizMeta?.docName}
        onRestart={() => { clearQuizProgress(); setQuizInitialAnswers(undefined); setQuestions([]); setAnswers([]); }}
        onRetryWrong={(wrongQs) => { clearQuizProgress(); setQuizInitialAnswers(undefined); setQuestions(wrongQs); setAnswers([]); }}
        onGoToSource={() => { setPendingActionDoc(null); setQuestions([]); setAnswers([]); setActiveTab(ActiveTab.LIBRARY); }}
        onCreateFlashcards={pendingActionDoc ? handleCreateFlashcardsFromMistakes : undefined}
        onSaveQuiz={handleSaveQuiz}
      />;
      const dueMistakes = countDueMistakes();
      return (
        <div>
          {dueMistakes > 0 && (
            <div className="max-w-3xl mx-auto px-4 pt-6 pb-2">
              <div
                className="flex items-center justify-between gap-4 rounded-[20px] px-5 py-4"
                style={{
                  background: 'color-mix(in srgb, var(--primary) 8%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--primary) 20%, transparent)',
                }}
              >
                <div className="min-w-0">
                  <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: 'var(--primary)' }}>Wiederholen</p>
                  <p className="text-sm font-black dark:text-white mt-0.5">
                    {dueMistakes} Frage{dueMistakes !== 1 ? 'n' : ''} fällig — aus früheren Fehlern
                  </p>
                  <p className="text-[10px] font-medium text-slate-400 mt-0.5">Richtig beantwortet = längeres Intervall, falsch = bald wieder dran.</p>
                </div>
                <button
                  onClick={handleStartMistakeReview}
                  className="px-5 py-3 rounded-[14px] text-[10px] font-black uppercase tracking-widest text-white hover:scale-105 active:scale-95 transition-all shrink-0"
                  style={{ background: 'var(--primary)' }}
                >
                  Wiederholen üben
                </button>
              </div>
            </div>
          )}
          {savedQuizzes.length > 0 && (
            <div className="max-w-3xl mx-auto px-4 pt-6 pb-2 space-y-3">
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400">Gespeicherte Quizze</p>
              <div className="space-y-2">
                {savedQuizzes.map(sq => (
                  <div key={sq.id} className="flex items-center gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[20px] px-5 py-4 shadow-sm">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black dark:text-white truncate">{sq.name}</p>
                      <p className="text-[9px] text-slate-400 font-medium mt-0.5">{sq.questions.length} Fragen · {new Date(sq.savedAt).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: '2-digit' })}</p>
                    </div>
                    <button onClick={() => handleLoadSavedQuiz(sq)} className="flex items-center gap-1.5 px-4 py-2 text-white rounded-[14px] text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shrink-0" style={{ background: 'var(--primary)' }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                      Starten
                    </button>
                    <button onClick={() => handleDeleteSavedQuiz(sq.id)} className="w-8 h-8 rounded-[12px] flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-all shrink-0">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                    </button>
                  </div>
                ))}
              </div>
              <div className="h-px bg-slate-100 dark:bg-slate-800 my-2" />
            </div>
          )}
          <FileUploader
            documents={documents} collections={collections}
            onDocumentSelect={(doc, type, opts) => handleStartQuizFromDoc(doc, type, opts)}
            onSourceSelect={async (source, _name, type, opts) => {
              flushSync(() => { setIsLoading(true); setAnswers([]); setQuestions([]); });
              try { const q = await generateQuizFromDocument(source, type, opts); setQuestions(q); }
              catch (e) { handleApiError(e); } finally { setIsLoading(false); }
            }}
            onDeckSelect={async (deck) => {
              flushSync(() => setIsLoading(true));
              try {
                const q = await generateQuizFromFlashcards(deck);
                if (!q.length) throw new Error('Die KI konnte aus diesem Stapel kein Quiz erstellen. Bitte versuche es noch einmal.');
                const meta = { docId: deck.id, docName: deck.title };
                setQuestions(q); setQuizInitialAnswers(undefined); setActiveQuizMeta(meta);
                saveQuizProgress(q, [], meta);
              } catch (e) { handleApiError(e); } finally { setIsLoading(false); }
            }}
            onSaveToLibrary={file => handleFileUpload(file)}
            availableDecks={decks} isLoading={isLoading} userPlan={userPlan}
          />
        </div>
      );
    }

    case ActiveTab.RECALL:
      return <ActiveRecall
        key={pendingActionDoc ? `recall-${pendingActionDoc.id}` : 'recall'}
        availableDocuments={documents} collections={collections}
        getDocumentSource={getDocumentSource}
        onSaveToLibrary={file => handleFileUpload(file)}
        onComplete={(score, topic, missingPoints) => {
          saveRecallResult({ docName: topic, timestamp: Date.now(), score, topic, missingPoints }, user?.id);
          updateMetricsAfterSession(score, topic, 'recall');
          recordActivity(user?.id);
        }}
        onCreateCardsFromGaps={(topic, points) => {
          if (!points.length) return;
          const cards = points.map(p => ({
            id: Math.random().toString(36).slice(2, 9),
            front: `${topic}: Was fehlte hier?\n„${p.slice(0, 120)}${p.length > 120 ? '…' : ''}"`,
            back: p,
            level: 0,
            nextReview: Date.now(),
          }));
          const newDeck: FlashcardDeck = { id: Math.random().toString(36).slice(2, 9), title: `Lücken: ${topic}`, cards };
          const updatedDecks = [...decks, newDeck];
          setDecks(updatedDecks);
          localStorage.setItem('flashcard_decks', JSON.stringify(updatedDecks));
          toast.success(`${cards.length} Karteikarte${cards.length !== 1 ? 'n' : ''} aus Lücken erstellt`);
          setActiveTab(ActiveTab.CARDS);
        }}
        initialDoc={pendingActionDoc ?? undefined}
      />;

    case ActiveTab.EXAM: return (
      <div>
        {savedExams.length > 0 && !examInitialQuestions && !pendingActionDoc && (
          <div className="max-w-3xl mx-auto px-4 pt-6 pb-2 space-y-3">
            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400">Gespeicherte Klausuren</p>
            <div className="space-y-2">
              {savedExams.map(se => (
                <div key={se.id} className="flex items-center gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[20px] px-5 py-4 shadow-sm">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black dark:text-white truncate">{se.name}</p>
                    <p className="text-[9px] text-slate-400 font-medium mt-0.5">{se.questions.length} Fragen · {new Date(se.savedAt).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: '2-digit' })}</p>
                  </div>
                  <button onClick={() => handleLoadSavedExam(se)} className="flex items-center gap-1.5 px-4 py-2 text-white rounded-[14px] text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shrink-0" style={{ background: 'var(--primary)' }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    Starten
                  </button>
                  <button onClick={() => handleDeleteSavedExam(se.id)} className="w-8 h-8 rounded-[12px] flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-all shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                  </button>
                </div>
              ))}
            </div>
            <div className="h-px bg-slate-100 dark:bg-slate-800 my-2" />
          </div>
        )}
        <ExamSystem
          key={examInitialQuestions ? `exam-saved-${examInitialQuestions.id}` : pendingActionDoc ? `exam-${pendingActionDoc.id}` : 'exam'}
          documents={documents} collections={collections}
          getDocumentSource={getDocumentSource}
          onSaveToLibrary={file => handleFileUpload(file)}
          initialDoc={pendingActionDoc ?? undefined}
          initialQuestions={examInitialQuestions?.questions}
          metrics={metrics} decks={decks}
          onComplete={({ score, docName, passed, totalPoints, achievedPoints, weakTopics, categoryBreakdown, typeBreakdown, fatigue, questions: examQuestions }) => {
            saveExamResult({ docName, timestamp: Date.now(), score, passed, totalPoints, achievedPoints, weakTopics, categoryBreakdown, typeBreakdown, fatigue, questions: examQuestions }, user?.id);
            // Falsche mc/truefalse-Klausurfragen in die SM-2-Wiederholungs-Queue
            const enqueued = addExamMistakes(examQuestions, { docId: `exam-${docName}`, docName }, user?.id);
            if (enqueued > 0) toast.info(`${enqueued} Klausurfrage${enqueued !== 1 ? 'n' : ''} zur Wiederholung vorgemerkt`);
            updateMetricsAfterSession(score, docName, 'exam');
            setExamInitialQuestions(null);
            setSavedExams(getSavedExams());
            recordActivity(user?.id);
          }}
          onNavigate={setActiveTab}
          onAction={handleWeakTopicAction}
        />
      </div>
    );

    case ActiveTab.RADAR:
      return <LearningCoach metrics={metrics} decks={decks} onNavigate={setActiveTab} onAction={handleWeakTopicAction} flowResult={flowResult} />;

    case ActiveTab.EXPLAINER:
      return <ExplainerSystem
        key={pendingActionDoc ? `explainer-${pendingActionDoc.id}` : 'explainer'}
        availableDocuments={documents} collections={collections}
        getDocumentSource={getDocumentSource}
        onSaveToLibrary={file => handleFileUpload(file)}
        initialDoc={pendingActionDoc ?? undefined}
        metrics={metrics} decks={decks}
      />;

    case ActiveTab.PAPER:
      if (!isAdmin(user?.id)) return <Dashboard onTabChange={setActiveTab} flowResult={flowResult} onAcceptFlow={saveFlowResult} documents={documents} onStartMistakeReview={handleStartMistakeReview} />;
      return <TermPaperSystem availableDocuments={documents} onUploadNew={handleFileUpload} initialSources={savedSources} getDocumentSource={getDocumentSource} />;

    case ActiveTab.SEARCH:
      if (!isAdmin(user?.id)) return <Dashboard onTabChange={setActiveTab} flowResult={flowResult} onAcceptFlow={saveFlowResult} documents={documents} onStartMistakeReview={handleStartMistakeReview} />;
      return <ScholarSearch
        results={searchResults}
        onSearch={async (q) => { setIsSearching(true); const { results } = await searchScholar(q); setSearchResults(results); setIsSearching(false); }}
        onSearchWeb={async (q) => { setIsSearching(true); const { results } = await searchWeb(q); setSearchResults(results); setIsSearching(false); }}
        isSearching={isSearching}
        onGenerateQuiz={(res) => handleStartQuizFromDoc({ id: `search-${Date.now()}`, name: res.title, content: res.abstract || res.snippet, type: 'text', uploadDate: Date.now() })}
        onSaveToPaper={(s) => { if (!savedSources.some(x => x.url === s.url)) setSavedSources(prev => [...prev, s]); }}
        onGoToPaper={() => setActiveTab(ActiveTab.PAPER)}
        savedResults={savedSources}
      />;

    case ActiveTab.PLANNER:
      return <StudyPlanner metrics={metrics} decks={decks} examTerms={examTerms} onUpdateExams={saveExamTerms} userId={user?.id} />;

    case ActiveTab.CARDS:
      return <FlashcardSystem
        key={pendingActionDoc ? `cards-${pendingActionDoc.id}` : 'cards'}
        availableDocuments={documents} collections={collections}
        onDeleteDoc={deleteDoc}
        onSaveToLibrary={file => handleFileUpload(file)}
        getDocumentSource={getDocumentSource} userId={user?.id}
        onGenerateQuizFromDeck={async (deck) => {
          setIsLoading(true);
          try {
            const q = await generateQuizFromFlashcards(deck);
            if (!q.length) throw new Error('Die KI konnte aus diesem Stapel kein Quiz erstellen. Bitte versuche es noch einmal.');
            const meta = { docId: deck.id, docName: deck.title };
            setQuestions(q); setQuizInitialAnswers(undefined); setActiveQuizMeta(meta);
            saveQuizProgress(q, [], meta); setActiveTab(ActiveTab.QUIZ);
          } catch (e) { handleApiError(e); } finally { setIsLoading(false); }
        }}
        initialDoc={pendingActionDoc ?? undefined}
      />;

    default:
      return <Dashboard onTabChange={setActiveTab} flowResult={flowResult} onAcceptFlow={saveFlowResult} documents={documents} onStartMistakeReview={handleStartMistakeReview} />;
  }
};
