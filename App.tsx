import React, { useState, useEffect } from 'react';
import { supabase } from './services/supabaseClient';
import type { User } from '@supabase/supabase-js';
import { AuthModal } from './components/AuthModal';
import { UpgradeModal } from './components/UpgradeModal';
import { SettingsModal } from './components/SettingsModal';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { QuizPlayer } from './components/QuizPlayer';
import { ResultView } from './components/ResultView';
import { FileUploader } from './components/FileUploader';
import { ScholarSearch } from './components/ScholarSearch';
import { StudyPlanner } from './components/StudyPlanner';
import { FlashcardSystem } from './components/FlashcardSystem';
import { TermPaperSystem } from './components/TermPaperSystem';
import { GapRadar } from './components/GapRadar';
import { ExplainerSystem } from './components/ExplainerSystem';
import { LibrarySystem } from './components/LibrarySystem';
import { ExamSystem } from './components/ExamSystem';
import { ActiveRecall } from './components/ActiveRecall';
import { MindMapSystem } from './components/MindMapSystem';
import { GeneratedImage } from './components/GeneratedImage';
import { ToastContainer } from './components/Toast';
import { ActiveTab, ProcessedDocument, QuizQuestion, UserAnswer, TopicMetric, SearchResult, QuizType, FlashcardDeck, Collection, ExamTerm, LearningFlowResult } from './types';
import { generateQuizFromDocument, searchScholar, generateQuizFromFlashcards, generateFlashcardsFromDocument, orchestrateLearningFlow } from './services/geminiService';
import { toast } from './services/toast';
import mammoth from 'mammoth';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>(ActiveTab.DASHBOARD);
  const [documents, setDocuments] = useState<ProcessedDocument[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [answers, setAnswers] = useState<UserAnswer[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [savedSources, setSavedSources] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [metrics, setMetrics] = useState<TopicMetric[]>([]);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [showUpgradeHint, setShowUpgradeHint] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isDark, setIsDark] = useState(() => localStorage.getItem('theme') === 'dark');

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
  };
  const [decks, setDecks] = useState<FlashcardDeck[]>([]);
  const [examTerms, setExamTerms] = useState<ExamTerm[]>([]);
  
  const [flowResult, setFlowResult] = useState<LearningFlowResult | null>(() => {
    const saved = localStorage.getItem('quizwise_flow_result');
    return saved ? JSON.parse(saved) : null;
  });

  useEffect(() => {
    // Beim Start prüfen ob der Nutzer noch eingeloggt ist (gespeicherte Session)
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAuthChecked(true);
    });
    // Auf Login/Logout-Events hören (z.B. Token läuft ab)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const handleStatus = () => setIsOffline(!navigator.onLine);
    window.addEventListener('online', handleStatus);
    window.addEventListener('offline', handleStatus);

    const saved = localStorage.getItem('quizwise_docs');
    if (saved) setDocuments(JSON.parse(saved));
    const savedCollections = localStorage.getItem('quizwise_collections');
    if (savedCollections) setCollections(JSON.parse(savedCollections));
    const savedMetrics = localStorage.getItem('quizwise_metrics');
    if (savedMetrics) setMetrics(JSON.parse(savedMetrics));
    const savedDecks = localStorage.getItem('flashcard_decks');
    if (savedDecks) setDecks(JSON.parse(savedDecks));
    const savedExams = localStorage.getItem('quizwise_exam_terms');
    if (savedExams) setExamTerms(JSON.parse(savedExams));
    return () => {
      window.removeEventListener('online', handleStatus);
      window.removeEventListener('offline', handleStatus);
    };
  }, []);

  const saveDocs = (docs: ProcessedDocument[]) => {
    setDocuments(docs);
    localStorage.setItem('quizwise_docs', JSON.stringify(docs));
  };

  const saveCollections = (cols: Collection[]) => {
    setCollections(cols);
    localStorage.setItem('quizwise_collections', JSON.stringify(cols));
  };

  const saveExamTerms = (terms: ExamTerm[]) => {
    setExamTerms(terms);
    localStorage.setItem('quizwise_exam_terms', JSON.stringify(terms));
  };

  const saveFlowResult = (res: LearningFlowResult) => {
    setFlowResult(res);
    localStorage.setItem('quizwise_flow_result', JSON.stringify(res));
  };

  const updateMetricsAfterSession = async (score: number, topicName: string, type: 'quiz' | 'exam' | 'recall' | 'cards') => {
    let updatedMetrics: TopicMetric[] = [];
    const prev = [...metrics];
    const existingIdx = prev.findIndex(m => m.topic === topicName);
    
    if (existingIdx >= 0) {
      const existing = prev[existingIdx];
      updatedMetrics = prev;
      updatedMetrics[existingIdx] = {
        ...existing,
        confidence: Math.round((existing.confidence + score) / 2),
        lastReviewed: Date.now(),
        totalAttempts: existing.totalAttempts + 1,
        correctAttempts: existing.correctAttempts + (score >= 70 ? 1 : 0)
      };
    } else {
      const newMetric: TopicMetric = {
        id: Math.random().toString(36).substr(2, 5),
        topic: topicName,
        confidence: score,
        lastReviewed: Date.now(),
        totalAttempts: 1,
        correctAttempts: score >= 70 ? 1 : 0
      };
      updatedMetrics = [newMetric, ...prev];
    }
    setMetrics(updatedMetrics);
    localStorage.setItem('quizwise_metrics', JSON.stringify(updatedMetrics));

    // Orchestrate Flow
    try {
      const flow = await orchestrateLearningFlow(
        { type, result: { score } },
        updatedMetrics,
        { entries: JSON.parse(localStorage.getItem('study_plan') || '[]'), exams: examTerms }
      );
      saveFlowResult(flow);
    } catch (e) { console.error("Flow error", e); }
  };

  const handleApiError = (e: any) => {
    if (e?.message === 'LIMIT_REACHED') {
      setShowUpgradeHint(true);
      toast.error('Tageslimit erreicht. Upgrade auf Pro für unlimitierten Zugriff.');
    } else if (e?.message?.includes('einloggen')) {
      setShowAuthModal(true);
    } else {
      toast.error(e?.message || 'Unbekannter Fehler.');
    }
  };

  const handleFileUpload = async (file: File, collectionId?: string) => {
    if (isOffline) return;
    setIsLoading(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase();
      let content = '';
      let docType: 'pdf' | 'docx' | 'text' = 'text';

      if (ext === 'pdf') {
        content = await fileToBase64(file);
        docType = 'pdf';
      } else if (ext === 'docx') {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        content = result.value;
        docType = 'docx';
      } else {
        content = await file.text();
        docType = 'text';
      }
      
      const newDoc: ProcessedDocument = {
        id: Math.random().toString(36).substr(2, 9),
        name: file.name,
        content: content,
        type: docType,
        uploadDate: Date.now(),
        collectionId: collectionId
      };
      saveDocs([...documents, newDoc]);
    } catch (e) {
      toast.error('Dokument konnte nicht verarbeitet werden.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleMoveDocument = (docId: string, collectionId: string | undefined) => {
    const updated = documents.map(d => d.id === docId ? { ...d, collectionId } : d);
    saveDocs(updated);
  };

  const onQuizComplete = async (ans: UserAnswer[]) => {
    setAnswers(ans);
    localStorage.removeItem('quizwise_current_quiz');
    const correct = ans.filter(a => a.isCorrect).length;
    const score = Math.round((correct / ans.length) * 100);
    const topicName = documents[documents.length - 1]?.name || 'Quiz Session';
    await updateMetricsAfterSession(score, topicName, 'quiz');
  };

  const handleQuizFromConcept = async (concept: string) => {
    setIsLoading(true);
    setActiveTab(ActiveTab.QUIZ);
    setAnswers([]);
    setQuestions([]);
    try {
      const q = await generateQuizFromDocument({ text: `Erkläre und teste das folgende Konzept gründlich: "${concept}"` }, QuizType.FAST);
      setQuestions(q);
    } catch (e) {
      toast.error('Quiz-Generierung fehlgeschlagen.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCardsFromConcept = async (concept: string) => {
    setIsLoading(true);
    try {
      const raw = await generateFlashcardsFromDocument({ text: `Erkläre das folgende Konzept: "${concept}"` }, 8);
      const cards = raw.map(c => ({
        id: Math.random().toString(36).substr(2, 9),
        front: c.front ?? '',
        back: c.back ?? '',
        level: c.level ?? 0,
        nextReview: c.nextReview ?? Date.now(),
      }));
      const newDeck: FlashcardDeck = {
        id: Math.random().toString(36).substr(2, 9),
        title: concept,
        cards,
      };
      const updated = [...decks, newDeck];
      setDecks(updated);
      localStorage.setItem('flashcard_decks', JSON.stringify(updated));
      toast.success(`Deck "${concept}" wurde erstellt.`);
      setActiveTab(ActiveTab.CARDS);
    } catch (e) {
      toast.error('Karteikarten-Generierung fehlgeschlagen.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartQuizFromDoc = async (doc: ProcessedDocument, quizType: QuizType = QuizType.FAST) => {
    setIsLoading(true);
    setActiveTab(ActiveTab.QUIZ);
    setAnswers([]);
    setQuestions([]);
    try {
      const source = doc.type === 'pdf' ? { file: { data: doc.content, mimeType: 'application/pdf' } } : { text: doc.content };
      const quiz = await generateQuizFromDocument(source, quizType);
      setQuestions(quiz);
      localStorage.setItem('quizwise_current_quiz', JSON.stringify(quiz));
    } catch (e) { toast.error('Quiz-Generierung fehlgeschlagen. Bitte prüfe deinen API-Key.'); } finally { setIsLoading(false); }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
    });
  };

  const renderContent = () => {
    if (isLoading && activeTab !== ActiveTab.EXAM && activeTab !== ActiveTab.QUIZ && activeTab !== ActiveTab.PLANNER && activeTab !== ActiveTab.RECALL) {
      return (
        <div className="flex flex-col items-center justify-center py-20 lg:py-32 space-y-8 animate-in fade-in zoom-in-95 duration-500 px-4">
          <div className="relative">
            <div className="w-20 h-20 lg:w-24 lg:h-24 border-8 border-indigo-100 dark:border-indigo-900/30 rounded-full"></div>
            <div className="w-20 h-20 lg:w-24 lg:h-24 border-8 border-indigo-600 border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
          </div>
          <p className="text-2xl font-black uppercase tracking-tighter text-slate-900 dark:text-white">KI am Werk...</p>
        </div>
      );
    }

    switch (activeTab) {
      case ActiveTab.DASHBOARD:
        return <Dashboard onTabChange={setActiveTab} flowResult={flowResult} onAcceptFlow={saveFlowResult} />;
      case ActiveTab.LIBRARY:
        return <LibrarySystem documents={documents} collections={collections} onUpload={handleFileUpload} onDelete={(id) => saveDocs(documents.filter(d => d.id !== id))} onAction={(tab, doc) => tab === ActiveTab.QUIZ ? handleStartQuizFromDoc(doc) : setActiveTab(tab)} onAddCollection={(col) => saveCollections([...collections, col])} onDeleteCollection={(id) => saveCollections(collections.filter(c => c.id !== id))} onMoveDocument={handleMoveDocument} isLoading={isLoading} />;
      case ActiveTab.QUIZ:
        if (questions.length > 0 && answers.length === 0) return <QuizPlayer questions={questions} onComplete={onQuizComplete} />;
        if (answers.length > 0) return <ResultView answers={answers} questions={questions} onRestart={() => { setAnswers([]); setQuestions([]); }} />;
        return <FileUploader onFileSelect={(file, type) => handleStartQuizFromDoc({ id: 'temp', name: file.name, content: '', type: 'pdf', uploadDate: Date.now() } as any, type)} onTextSubmit={async (text, type) => { setIsLoading(true); const q = await generateQuizFromDocument({ text }, type); setQuestions(q); setIsLoading(false); }} onDeckSelect={async (deck) => { setIsLoading(true); const q = await generateQuizFromFlashcards(deck); setQuestions(q); setIsLoading(false); }} availableDecks={decks} isLoading={isLoading} />;
      case ActiveTab.RECALL:
        // Fixed: Provide a wrapper for updateMetricsAfterSession to match the onComplete signature from ActiveRecall.
        return <ActiveRecall availableDocuments={documents} onComplete={(score, topic) => updateMetricsAfterSession(score, topic, 'recall')} />;
      case ActiveTab.EXAM: return <ExamSystem />;
      case ActiveTab.RADAR: return <GapRadar metrics={metrics} onNavigate={setActiveTab} />;
      case ActiveTab.EXPLAINER: return <ExplainerSystem availableDocuments={documents} onUploadNew={handleFileUpload} />;
      case ActiveTab.PAPER: return <TermPaperSystem availableDocuments={documents} onUploadNew={handleFileUpload} initialSources={savedSources} />;
      case ActiveTab.SEARCH: return <ScholarSearch results={searchResults} onSearch={async (q) => { setIsSearching(true); const { results } = await searchScholar(q); setSearchResults(results); setIsSearching(false); }} isSearching={isSearching} onGenerateQuiz={(res) => handleStartQuizFromDoc({ id: 'search', name: res.title, content: res.abstract || res.snippet, type: 'text', uploadDate: Date.now() } as any)} onSaveToPaper={(s) => setSavedSources([...savedSources, s])} savedResults={savedSources} />;
      case ActiveTab.PLANNER: return <StudyPlanner metrics={metrics} decks={decks} examTerms={examTerms} onUpdateExams={saveExamTerms} />;
      case ActiveTab.CARDS: return <FlashcardSystem availableDocuments={documents} onDeleteDoc={(id) => saveDocs(documents.filter(d => d.id !== id))} onUploadNew={handleFileUpload} onGenerateQuizFromDeck={async (deck) => { setIsLoading(true); const q = await generateQuizFromFlashcards(deck); setQuestions(q); setIsLoading(false); setActiveTab(ActiveTab.QUIZ); }} />;
      case ActiveTab.MINDMAP: return <MindMapSystem availableDocuments={documents} onGenerateQuizFromConcept={handleQuizFromConcept} onGenerateCardsFromConcept={handleCardsFromConcept} />;
      default: return <Dashboard onTabChange={setActiveTab} flowResult={flowResult} onAcceptFlow={saveFlowResult} />;
    }
  };

  if (!authChecked) return null; // kurz warten bis Session geprüft ist

  return (
    <>
    <ToastContainer />
    {showAuthModal && (
      <AuthModal
        onClose={() => setShowAuthModal(false)}
        onSuccess={() => setShowAuthModal(false)}
      />
    )}
    {showUpgradeModal && (
      <UpgradeModal onClose={() => setShowUpgradeModal(false)} />
    )}
    {showSettings && (
      <SettingsModal
        user={user}
        isDark={isDark}
        onToggleTheme={toggleTheme}
        onLogout={() => supabase.auth.signOut()}
        onClose={() => setShowSettings(false)}
      />
    )}
    <Layout activeTab={activeTab} onTabChange={setActiveTab} user={user} onLoginClick={() => setShowAuthModal(true)} onLogout={() => supabase.auth.signOut()} onUpgradeClick={() => setShowUpgradeModal(true)} onSettingsClick={() => setShowSettings(true)}>
      {isOffline && (
        <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center justify-center gap-2">
          <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest">Offline-Modus aktiv</p>
        </div>
      )}
      {showUpgradeHint && (
        <div className="mb-4 p-4 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded-2xl flex items-center justify-between gap-4">
          <p className="text-[11px] font-bold text-indigo-700 dark:text-indigo-300">
            Tageslimit (20 Anfragen) erreicht. Mit <strong>Pro</strong> unlimitiert lernen.
          </p>
          <button
            onClick={() => { setShowUpgradeHint(false); setShowUpgradeModal(true); }}
            className="text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl text-white shrink-0"
            style={{ background: 'var(--primary)' }}
          >
            Upgrade zu Pro
          </button>
        </div>
      )}
      {renderContent()}
    </Layout>
    </>
  );
};

export default App;