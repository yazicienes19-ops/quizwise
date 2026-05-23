import React, { useState, useEffect } from 'react';
import { supabase } from './services/supabaseClient';
import type { User } from '@supabase/supabase-js';
import { AuthModal } from './components/AuthModal';
import { UpgradeModal } from './components/UpgradeModal';
import { SettingsModal } from './components/SettingsModal';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { QuizPlayer } from './components/QuizPlayer';
import { QuizSetup } from './components/QuizSetup';
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
import { ActiveTab, ProcessedDocument, QuizQuestion, UserAnswer, TopicMetric, SearchResult, QuizType, FlashcardDeck, Flashcard, Collection, ExamTerm, LearningFlowResult, QuizConfig } from './types';

import { generateQuizFromDocument, searchScholar, searchWeb, generateQuizFromFlashcards, orchestrateLearningFlow } from './services/geminiService';
import { saveQuizResult, getDocStats, getAllResults } from './services/quizHistoryService';
import { saveRecallResult } from './services/recallHistoryService';
import { saveExamResult } from './services/examHistoryService';
import { saveMeta, getMeta } from './services/libraryService';
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
import heic2any from 'heic2any';

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
  const [pendingActionDoc, setPendingActionDoc] = useState<ProcessedDocument | null>(null);
  const [pendingTopic, setPendingTopic] = useState<string | null>(null);
  const [activeQuizMeta, setActiveQuizMeta] = useState<{ docId: string; docName: string } | null>(null);

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
  const getDocumentSource = (doc: ProcessedDocument): GenerationSource => {
    if (doc.type === 'text' || doc.type === 'docx') return { text: doc.content };
    if (doc.type === 'image') {
      const mime = doc.mimeType || 'image/jpeg';
      if (doc.storagePath) return { storagePath: doc.storagePath, mimeType: mime };
      if (doc.content) return { file: { data: doc.content, mimeType: mime } };
      throw new Error('Bild-Inhalt nicht verfügbar.');
    }
    // PDF
    if (doc.storagePath) return { storagePath: doc.storagePath, mimeType: 'application/pdf' };
    if (doc.content) return { file: { data: doc.content, mimeType: 'application/pdf' } };
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

  const handleFileUpload = async (fileInput: File, collectionId?: string): Promise<string | null> => {
    let file = fileInput;
    if (isOffline) {
      toast.error('Hochladen ist im Offline-Modus nicht möglich.');
      return null;
    }
    setIsLoading(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase();
      let content = '';
      let docType: 'pdf' | 'docx' | 'text' | 'image' = 'text';
      let imageMimeType: string | undefined;

      const IMAGE_MIME: Record<string, string> = {
        png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
        heic: 'image/jpeg', heif: 'image/jpeg',
      };

      // HEIC/HEIF → JPEG konvertieren (iPhone Kamera-Format)
      if (ext === 'heic' || ext === 'heif') {
        try {
          const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 }) as Blob;
          file = new File([converted], file.name.replace(/\.(heic|heif)$/i, '.jpg'), { type: 'image/jpeg' });
        } catch {
          toast.error('HEIC-Konvertierung fehlgeschlagen. Bitte als JPEG exportieren.');
          return null;
        }
      }

      if (ext === 'pdf') {
        docType = 'pdf';
        if (!user) {
          toast.error('Zum Speichern von PDFs bitte zuerst anmelden.');
          return null;
        }
      } else if (ext && IMAGE_MIME[ext]) {
        docType = 'image';
        imageMimeType = IMAGE_MIME[ext];
        content = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      } else if (ext === 'docx') {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        content = result.value;
        docType = 'docx';
      } else {
        content = await file.text();
        docType = 'text';
      }

      if ((docType === 'text' || docType === 'docx') && content.length > 900_000) {
        toast.error('Dokument sehr groß — nur der erste Teil wird verarbeitet. Für beste Ergebnisse empfehlen wir PDF.');
      }

      const newDoc: ProcessedDocument = {
        id: Math.random().toString(36).substr(2, 9),
        name: file.name,
        content,
        type: docType,
        ...(imageMimeType ? { mimeType: imageMimeType } : {}),
        uploadDate: Date.now(),
        collectionId,
      };

      if (docType === 'pdf' || docType === 'image') {
        const storagePath = await saveDocumentToSupabase(newDoc, file);
        saveDocs([...documents, { ...newDoc, storagePath: storagePath ?? undefined }]);
      } else {
        saveDocs([...documents, newDoc]);
        if (user) {
          saveDocumentToSupabase(newDoc)
            .catch(() => toast.error('Cloud-Sync fehlgeschlagen. Dokument nur lokal gespeichert.'));
        }
      }
      return newDoc.id;
    } catch (e) {
      toast.error('Dokument konnte nicht verarbeitet werden.');
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const onQuizComplete = async (ans: UserAnswer[]) => {
    setAnswers(ans);
    localStorage.removeItem('quizwise_current_quiz');
    const correct = ans.filter(a => a.isCorrect).length;
    const score   = Math.round((correct / ans.length) * 100);

    const wrongQs    = questions.filter((_, i) => !ans[i]?.isCorrect);
    const weakTopics = [...new Set(wrongQs.map(q => q.topic).filter((t): t is string => Boolean(t)))];

    if (activeQuizMeta) {
      saveQuizResult({
        docId: activeQuizMeta.docId,
        docName: activeQuizMeta.docName,
        timestamp: Date.now(),
        score, correctCount: correct, totalCount: ans.length,
        weakTopics, questions, answers: ans,
      });
      const stats = getDocStats(activeQuizMeta.docId);
      saveMeta(activeQuizMeta.docId, {
        quizCount: stats.count,
        lastQuizAt: Date.now(),
        avgQuizAccuracy: stats.avgAccuracy ?? score,
        weakTopics: stats.weakTopics,
      });
    }

    await updateMetricsAfterSession(score, activeQuizMeta?.docName || 'Quiz Session', 'quiz');
  };

  const handleStartQuizFromDoc = async (doc: ProcessedDocument, quizType: QuizType = QuizType.FAST, options?: any) => {
    setIsLoading(true);
    setActiveTab(ActiveTab.QUIZ);
    setAnswers([]);
    setQuestions([]);
    try {
      const source = getDocumentSource(doc);
      const quiz = await generateQuizFromDocument(source, quizType, options);
      setQuestions(quiz);
      setActiveQuizMeta({ docId: doc.id, docName: doc.name.replace(/\.[^/.]+$/, '') });
      localStorage.setItem('quizwise_current_quiz', JSON.stringify(quiz));
    } catch (e: any) {
      const msg = e?.message?.includes('nicht verfügbar')
        ? 'Dokument nicht verfügbar. Bitte lade es neu hoch.'
        : e?.message?.includes('LIMIT_REACHED')
        ? 'Tageslimit erreicht. Bitte versuche es morgen wieder.'
        : `Quiz-Generierung fehlgeschlagen: ${e?.message || 'Unbekannter Fehler'}`;
      toast.error(msg);
    } finally { setIsLoading(false); }
  };

  const handleStartQuizFromSetup = async (config: QuizConfig) => {
    if (!pendingActionDoc) return;
    setPendingTopic(null);
    setIsLoading(true);
    setQuestions([]);
    setAnswers([]);
    try {
      const source = getDocumentSource(pendingActionDoc);
      setActiveQuizMeta({ docId: pendingActionDoc.id, docName: pendingActionDoc.name.replace(/\.[^/.]+$/, '') });
      const stats = getDocStats(pendingActionDoc.id);
      const customFocus = config.focus === 'weak' && stats.weakTopics.length > 0
        ? `Fokus auf schwache Themen: ${stats.weakTopics.join(', ')}`
        : undefined;
      const quiz = await generateQuizFromDocument(source, QuizType.CUSTOM, {
        customCount: config.questionCount,
        customDifficulty: config.difficulty,
        customFocus,
        questionType: config.questionType,
      });
      setQuestions(quiz);
      localStorage.setItem('quizwise_current_quiz', JSON.stringify(quiz));
    } catch (e) { handleApiError(e); } finally { setIsLoading(false); }
  };

  const handleCreateFlashcardsFromMistakes = (wrongQuestions: QuizQuestion[]) => {
    if (!wrongQuestions.length) return;

    const cards: Flashcard[] = wrongQuestions.map(q => {
      const correctAnswerText = q.options.length > 0
        ? q.correctAnswerIndices.map(i => q.options[i]).filter(Boolean).join(' / ')
        : '';
      const back = correctAnswerText
        ? correctAnswerText + (q.explanation ? `\n\n${q.explanation}` : '')
        : q.explanation || '';

      return {
        id: Math.random().toString(36).slice(2, 9),
        front: q.question,
        back,
        level: 0,
        nextReview: Date.now(),
      };
    });

    const deckTitle = `Fehler: ${activeQuizMeta?.docName || 'Quiz'}`;
    const newDeck: FlashcardDeck = {
      id: Math.random().toString(36).slice(2, 9),
      title: deckTitle,
      cards,
      sourceDocumentId: activeQuizMeta?.docId,
    };

    const updatedDecks = [...decks, newDeck];
    setDecks(updatedDecks);
    localStorage.setItem('flashcard_decks', JSON.stringify(updatedDecks));

    if (activeQuizMeta?.docId) {
      const current = getMeta(activeQuizMeta.docId);
      saveMeta(activeQuizMeta.docId, {
        flashcardCount: (current.flashcardCount ?? 0) + cards.length,
      });
    }

    toast.success(`${cards.length} Karteikarten aus Fehlern erstellt`);
    setPendingActionDoc(null);
    setActiveTab(ActiveTab.CARDS);
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
        return <LibrarySystem
          documents={documents}
          collections={collections}
          onUpload={handleFileUpload}
          onDelete={deleteDoc}
          onAction={(tab, doc) => {
            if (tab === ActiveTab.QUIZ) {
              setPendingActionDoc(doc);
              setQuestions([]);
              setAnswers([]);
              setActiveTab(ActiveTab.QUIZ);
            } else if (tab === ActiveTab.EXPLAINER || tab === ActiveTab.CARDS || tab === ActiveTab.RECALL || tab === ActiveTab.EXAM) {
              setPendingActionDoc(doc);
              setActiveTab(tab);
            } else {
              setPendingActionDoc(null);
              setActiveTab(tab);
            }
          }}
          onAddCollection={addCollection}
          onDeleteCollection={removeCollection}
          onMoveDocument={moveDoc}
          isLoading={isLoading}
        />;
      case ActiveTab.QUIZ:
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
            doc={pendingActionDoc}
            onStart={handleStartQuizFromSetup}
            onBack={() => {
              setPendingActionDoc(null);
              setPendingTopic(null);
              setActiveTab(fromRadar ? ActiveTab.RADAR : ActiveTab.LIBRARY);
            }}
            initialFocus={pendingTopic ? 'weak' : 'all'}
          />;
        }
        if (questions.length > 0 && answers.length === 0) {
          return <QuizPlayer
            questions={questions}
            sourceName={activeQuizMeta?.docName}
            examMode={false}
            onComplete={onQuizComplete}
            onCancel={() => {
              setQuestions([]);
              setAnswers([]);
              setPendingActionDoc(null);
            }}
          />;
        }
        if (answers.length > 0) {
          return <ResultView
            answers={answers}
            questions={questions}
            docName={activeQuizMeta?.docName}
            onRestart={() => { setQuestions([]); setAnswers([]); }}
            onRetryWrong={(wrongQs) => { setQuestions(wrongQs); setAnswers([]); }}
            onGoToSource={() => { setPendingActionDoc(null); setQuestions([]); setAnswers([]); setActiveTab(ActiveTab.LIBRARY); }}
            onCreateFlashcards={pendingActionDoc ? handleCreateFlashcardsFromMistakes : undefined}
          />;
        }
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
          onDeckSelect={async (deck) => { setIsLoading(true); try { const q = await generateQuizFromFlashcards(deck); setQuestions(q); } catch (e) { handleApiError(e); } finally { setIsLoading(false); } }}
          onSaveToLibrary={file => handleFileUpload(file)}
          availableDecks={decks}
          isLoading={isLoading}
        />;
      case ActiveTab.RECALL:
        return <ActiveRecall
          key={pendingActionDoc ? `recall-${pendingActionDoc.id}` : 'recall'}
          availableDocuments={documents}
          collections={collections}
          getDocumentSource={getDocumentSource}
          onSaveToLibrary={file => handleFileUpload(file)}
          onComplete={(score, topic, missingPoints) => {
            saveRecallResult({ docName: topic, timestamp: Date.now(), score, topic, missingPoints });
            updateMetricsAfterSession(score, topic, 'recall');
          }}
          initialDoc={pendingActionDoc ?? undefined}
        />;
      case ActiveTab.EXAM: return <ExamSystem
          key={pendingActionDoc ? `exam-${pendingActionDoc.id}` : 'exam'}
          documents={documents}
          collections={collections}
          getDocumentSource={getDocumentSource}
          onSaveToLibrary={file => handleFileUpload(file)}
          initialDoc={pendingActionDoc ?? undefined}
          onComplete={({ score, docName, passed, totalPoints, achievedPoints }) => {
            saveExamResult({ docName, timestamp: Date.now(), score, passed, totalPoints, achievedPoints, weakTopics: [] });
            updateMetricsAfterSession(score, docName, 'exam');
          }}
          onNavigate={setActiveTab}
        />;
      case ActiveTab.RADAR: return <GapRadar
          metrics={metrics}
          onNavigate={setActiveTab}
          onAction={(topic, mode) => {
            if (mode === 'quiz') {
              const match = getAllResults().find(r => r.weakTopics.includes(topic));
              const doc = match ? documents.find(d => d.id === match.docId) ?? null : null;
              setPendingActionDoc(doc);
              setPendingTopic(doc ? topic : null);
              setQuestions([]);
              setAnswers([]);
              setActiveTab(ActiveTab.QUIZ);
            } else {
              const tabMap = { cards: ActiveTab.CARDS, recall: ActiveTab.RECALL, quiz: ActiveTab.QUIZ } as const;
              setActiveTab(tabMap[mode]);
            }
          }}
        />;
      case ActiveTab.EXPLAINER: return <ExplainerSystem
          key={pendingActionDoc ? `explainer-${pendingActionDoc.id}` : 'explainer'}
          availableDocuments={documents}
          collections={collections}
          getDocumentSource={getDocumentSource}
          onSaveToLibrary={file => handleFileUpload(file)}
          initialDoc={pendingActionDoc ?? undefined}
        />;
      case ActiveTab.PAPER: return <TermPaperSystem availableDocuments={documents} onUploadNew={handleFileUpload} initialSources={savedSources} getDocumentSource={getDocumentSource} />;
      case ActiveTab.SEARCH: return <ScholarSearch results={searchResults} onSearch={async (q) => { setIsSearching(true); const { results } = await searchScholar(q); setSearchResults(results); setIsSearching(false); }} onSearchWeb={async (q) => { setIsSearching(true); const { results } = await searchWeb(q); setSearchResults(results); setIsSearching(false); }} isSearching={isSearching} onGenerateQuiz={(res) => handleStartQuizFromDoc({ id: `search-${Date.now()}`, name: res.title, content: res.abstract || res.snippet, type: 'text', uploadDate: Date.now() })} onSaveToPaper={(s) => setSavedSources([...savedSources, s])} savedResults={savedSources} />;
      case ActiveTab.PLANNER: return <StudyPlanner metrics={metrics} decks={decks} examTerms={examTerms} onUpdateExams={saveExamTerms} />;
      case ActiveTab.CARDS: return <FlashcardSystem
          key={pendingActionDoc ? `cards-${pendingActionDoc.id}` : 'cards'}
          availableDocuments={documents}
          collections={collections}
          onDeleteDoc={deleteDoc}
          onSaveToLibrary={file => handleFileUpload(file)}
          getDocumentSource={getDocumentSource}
          onGenerateQuizFromDeck={async (deck) => { setIsLoading(true); const q = await generateQuizFromFlashcards(deck); setQuestions(q); setIsLoading(false); setActiveTab(ActiveTab.QUIZ); }}
          initialDoc={pendingActionDoc ?? undefined}
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
    <Layout activeTab={activeTab} onTabChange={(tab) => { setPendingActionDoc(null); setPendingTopic(null); setActiveTab(tab); }} user={user} onLoginClick={() => setShowAuthModal(true)} onLogout={() => supabase.auth.signOut()} onUpgradeClick={() => setShowUpgradeModal(true)} onSettingsClick={() => setShowSettings(true)}>
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