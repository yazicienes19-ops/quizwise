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
import { GeneratedImage } from './components/GeneratedImage';
import { ToastContainer } from './components/Toast';
import { ActiveTab, ProcessedDocument, QuizQuestion, UserAnswer, TopicMetric, SearchResult, QuizType, FlashcardDeck, Collection, ExamTerm, LearningFlowResult } from './types';

import { generateQuizFromDocument, searchScholar, searchWeb, generateQuizFromFlashcards, orchestrateLearningFlow } from './services/geminiService';
import {
  loadDocumentsFromSupabase,
  loadCollectionsFromSupabase,
  saveDocumentToSupabase,
  deleteDocumentFromSupabase,
  saveCollectionToSupabase,
  deleteCollectionFromSupabase,
  updateDocumentCollectionInSupabase,
  downloadPdfAsBase64,
} from './services/documentService';
import type { GenerationSource } from './services/geminiService';
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
    const timeout = setTimeout(() => setAuthChecked(true), 3000);
    supabase.auth.getSession().then(({ data: { session } }) => {
      clearTimeout(timeout);
      setUser(session?.user ?? null);
      setAuthChecked(true);
    }).catch(() => {
      clearTimeout(timeout);
      setAuthChecked(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Beim Login: Dokumente und Sammlungen aus Supabase laden (Supabase ist Quelle der Wahrheit)
  useEffect(() => {
    if (!user) return;
    loadDocumentsFromSupabase()
      .then(docs => {
        setDocuments(docs);
        localStorage.setItem('quizwise_docs', JSON.stringify(docs));
      })
      .catch(() => toast.error('Dokumente konnten nicht aus der Cloud geladen werden.'));
    loadCollectionsFromSupabase()
      .then(cols => {
        setCollections(cols);
        localStorage.setItem('quizwise_collections', JSON.stringify(cols));
      })
      .catch(() => {});
  }, [user]);

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

  const addCollection = (col: Collection) => {
    saveCollections([...collections, col]);
    if (user) saveCollectionToSupabase(col).catch(() => {});
  };

  const removeCollection = (id: string) => {
    saveCollections(collections.filter(c => c.id !== id));
    if (user) deleteCollectionFromSupabase(id).catch(() => {});
  };

  const deleteDoc = (id: string) => {
    const doc = documents.find(d => d.id === id);
    saveDocs(documents.filter(d => d.id !== id));
    if (user && doc) deleteDocumentFromSupabase(doc).catch(() => {});
  };

  const moveDoc = (docId: string, collectionId: string | undefined) => {
    const updated = documents.map(d => d.id === docId ? { ...d, collectionId } : d);
    saveDocs(updated);
    if (user) updateDocumentCollectionInSupabase(docId, collectionId).catch(() => {});
  };

  // Gibt den KI-tauglichen Inhalt eines Dokuments zurück.
  // PDFs ohne content werden on-demand aus Storage geladen.
  const getDocumentSource = async (doc: ProcessedDocument): Promise<GenerationSource> => {
    if (doc.type !== 'pdf') return { text: doc.content };
    if (doc.content) return { file: { data: doc.content, mimeType: 'application/pdf' } };
    if (doc.storagePath) {
      const base64 = await downloadPdfAsBase64(doc.storagePath);
      // Im lokalen State cachen damit nachfolgende Aufrufe schnell sind
      setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, content: base64 } : d));
      return { file: { data: base64, mimeType: 'application/pdf' } };
    }
    throw new Error('PDF-Inhalt nicht verfügbar.');
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
    if (isOffline) {
      toast.error('Hochladen ist im Offline-Modus nicht möglich.');
      return;
    }
    setIsLoading(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase();
      let content = '';
      let docType: 'pdf' | 'docx' | 'text' = 'text';

      if (ext === 'pdf') {
        docType = 'pdf';
        // PDFs werden NICHT als Base64 in localStorage gespeichert (Limit ~5 MB).
        // Stattdessen: direkt in Supabase Storage hochladen, content bleibt leer,
        // on-demand laden via getDocumentSource.
        if (!user) {
          toast.error('Zum Speichern von PDFs bitte zuerst anmelden.');
          return;
        }
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
        content, // leer bei PDFs — wird später on-demand aus Storage geladen
        type: docType,
        uploadDate: Date.now(),
        collectionId,
      };

      if (docType === 'pdf') {
        // PDF: erst in Storage hochladen, dann in State aufnehmen (kein localStorage-Limit-Problem)
        const storagePath = await saveDocumentToSupabase(newDoc, file);
        saveDocs([...documents, { ...newDoc, storagePath: storagePath ?? undefined }]);
      } else {
        // Text/DOCX: sofort in State + localStorage, Supabase im Hintergrund
        saveDocs([...documents, newDoc]);
        if (user) {
          saveDocumentToSupabase(newDoc)
            .catch(() => toast.error('Cloud-Sync fehlgeschlagen. Dokument nur lokal gespeichert.'));
        }
      }
    } catch (e) {
      toast.error('Dokument konnte nicht verarbeitet werden.');
    } finally {
      setIsLoading(false);
    }
  };

  const onQuizComplete = async (ans: UserAnswer[]) => {
    setAnswers(ans);
    localStorage.removeItem('quizwise_current_quiz');
    const correct = ans.filter(a => a.isCorrect).length;
    const score = Math.round((correct / ans.length) * 100);
    const topicName = documents[documents.length - 1]?.name || 'Quiz Session';
    await updateMetricsAfterSession(score, topicName, 'quiz');
  };

  const handleStartQuizFromDoc = async (doc: ProcessedDocument, quizType: QuizType = QuizType.FAST, options?: any) => {
    setIsLoading(true);
    setActiveTab(ActiveTab.QUIZ);
    setAnswers([]);
    setQuestions([]);
    try {
      const source = await getDocumentSource(doc);
      const quiz = await generateQuizFromDocument(source, quizType, options);
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
        return <LibrarySystem documents={documents} collections={collections} onUpload={handleFileUpload} onDelete={deleteDoc} onAction={(tab, doc) => tab === ActiveTab.QUIZ ? handleStartQuizFromDoc(doc) : setActiveTab(tab)} onAddCollection={addCollection} onDeleteCollection={removeCollection} onMoveDocument={moveDoc} isLoading={isLoading} />;
      case ActiveTab.QUIZ:
        if (questions.length > 0 && answers.length === 0) return <QuizPlayer questions={questions} onComplete={onQuizComplete} />;
        if (answers.length > 0) return <ResultView answers={answers} questions={questions} onRestart={() => { setAnswers([]); setQuestions([]); }} />;
        return <FileUploader
          documents={documents}
          collections={collections}
          onDocumentSelect={(doc, type, opts) => handleStartQuizFromDoc(doc, type, opts)}
          onSourceSelect={async (source, _name, type, opts) => {
            setIsLoading(true);
            setAnswers([]);
            setQuestions([]);
            try {
              const q = await generateQuizFromDocument(source, type, opts);
              setQuestions(q);
              localStorage.setItem('quizwise_current_quiz', JSON.stringify(q));
            } catch (e) { handleApiError(e); } finally { setIsLoading(false); }
          }}
          onDeckSelect={async (deck) => { setIsLoading(true); const q = await generateQuizFromFlashcards(deck); setQuestions(q); setIsLoading(false); }}
          onSaveToLibrary={file => handleFileUpload(file)}
          availableDecks={decks}
          isLoading={isLoading}
        />;
      case ActiveTab.RECALL:
        return <ActiveRecall
          availableDocuments={documents}
          collections={collections}
          getDocumentSource={getDocumentSource}
          onSaveToLibrary={file => handleFileUpload(file)}
          onComplete={(score, topic) => updateMetricsAfterSession(score, topic, 'recall')}
        />;
      case ActiveTab.EXAM: return <ExamSystem
          documents={documents}
          collections={collections}
          getDocumentSource={getDocumentSource}
          onSaveToLibrary={file => handleFileUpload(file)}
        />;
      case ActiveTab.RADAR: return <GapRadar metrics={metrics} onNavigate={setActiveTab} />;
      case ActiveTab.EXPLAINER: return <ExplainerSystem
          availableDocuments={documents}
          collections={collections}
          getDocumentSource={getDocumentSource}
          onSaveToLibrary={file => handleFileUpload(file)}
        />;
      case ActiveTab.PAPER: return <TermPaperSystem availableDocuments={documents} onUploadNew={handleFileUpload} initialSources={savedSources} />;
      case ActiveTab.SEARCH: return <ScholarSearch results={searchResults} onSearch={async (q) => { setIsSearching(true); const { results } = await searchScholar(q); setSearchResults(results); setIsSearching(false); }} onSearchWeb={async (q) => { setIsSearching(true); const { results } = await searchWeb(q); setSearchResults(results); setIsSearching(false); }} isSearching={isSearching} onGenerateQuiz={(res) => handleStartQuizFromDoc({ id: 'search', name: res.title, content: res.abstract || res.snippet, type: 'text', uploadDate: Date.now() } as any)} onSaveToPaper={(s) => setSavedSources([...savedSources, s])} savedResults={savedSources} />;
      case ActiveTab.PLANNER: return <StudyPlanner metrics={metrics} decks={decks} examTerms={examTerms} onUpdateExams={saveExamTerms} />;
      case ActiveTab.CARDS: return <FlashcardSystem
          availableDocuments={documents}
          collections={collections}
          onDeleteDoc={deleteDoc}
          onSaveToLibrary={file => handleFileUpload(file)}
          getDocumentSource={getDocumentSource}
          onGenerateQuizFromDeck={async (deck) => { setIsLoading(true); const q = await generateQuizFromFlashcards(deck); setQuestions(q); setIsLoading(false); setActiveTab(ActiveTab.QUIZ); }}
        />;
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