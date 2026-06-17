import React, { useState, useEffect } from 'react';
import { supabase } from './services/supabaseClient';
import { AuthModal } from './components/AuthModal';
import { UpgradeModal } from './components/UpgradeModal';
import { SettingsModal } from './components/SettingsModal';
import { Layout } from './components/Layout';
import { ToastContainer } from './components/Toast';
import { SplashScreen } from './components/SplashScreen';
import { AuthPage } from './components/AuthPage';
import { Onboarding, isOnboardingDone } from './components/Onboarding';
import { SharedDeckPage } from './components/SharedDeckPage';
import { LandingPage } from './components/LandingPage';
import { ErrorBoundary } from './components/ErrorBoundary';
import { CookieBanner } from './components/CookieBanner';
import { LegalModal } from './components/LegalModal';
import { resolveErrorMessage } from './services/errorMessages';
import { getStreak } from './services/streakService';
import { orchestrateLearningFlow } from './services/geminiService';
import { toast } from './services/toast';
import { ActiveTab, TopicMetric, SearchResult, FlashcardDeck, ExamTerm, LearningFlowResult } from './types';
import { useAuth } from './hooks/useAuth';
import { useDocuments } from './hooks/useDocuments';
import { useQuizState } from './hooks/useQuizState';
import { AppContent } from './components/AppContent';
import { loadAllCloudData, syncLearningField, syncMetrics, migrateLocalToCloud } from './services/syncService';

const App: React.FC = () => {
  const auth = useAuth();
  const [activeTab, setActiveTab] = useState<ActiveTab>(ActiveTab.DASHBOARD);
  const [pendingActionDoc, setPendingActionDoc] = useState<import('./types').ProcessedDocument | null>(null);
  const [pendingTopic, setPendingTopic] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [showUpgradeHint, setShowUpgradeHint] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => !isOnboardingDone());
  const [decks, setDecks] = useState<FlashcardDeck[]>([]);
  const [examTerms, setExamTerms] = useState<ExamTerm[]>([]);
  const [flowResult, setFlowResult] = useState<LearningFlowResult | null>(() => {
    const saved = localStorage.getItem('quizwise_flow_result');
    return saved ? JSON.parse(saved) : null;
  });
  const [metrics, setMetrics] = useState<TopicMetric[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [savedSources, setSavedSources] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [streakDismissed, setStreakDismissed] = useState(false);
  const [cookieConsent, setCookieConsent] = useState(() => localStorage.getItem('cookie_consent') === 'accepted');
  const [legalPage, setLegalPage] = useState<'impressum' | 'datenschutz' | 'agb' | null>(null);

  useEffect(() => {
    const handleStatus = () => setIsOffline(!navigator.onLine);
    window.addEventListener('online', handleStatus);
    window.addEventListener('offline', handleStatus);
    const savedMetrics = localStorage.getItem('quizwise_metrics');
    if (savedMetrics) setMetrics(JSON.parse(savedMetrics));
    const savedDecks = localStorage.getItem('flashcard_decks');
    if (savedDecks) setDecks(JSON.parse(savedDecks));
    const savedExamTerms = localStorage.getItem('quizwise_exam_terms');
    if (savedExamTerms) setExamTerms(JSON.parse(savedExamTerms));
    return () => { window.removeEventListener('online', handleStatus); window.removeEventListener('offline', handleStatus); };
  }, []);

  useEffect(() => {
    if (!auth.user || isOffline) return;
    loadAllCloudData(auth.user.id).then(cloud => {
      if (cloud.learning) {
        if (cloud.learning.exam_terms.length) { setExamTerms(cloud.learning.exam_terms); localStorage.setItem('quizwise_exam_terms', JSON.stringify(cloud.learning.exam_terms)); }
        if (cloud.learning.streak.lastDay) localStorage.setItem('quizwise_streak', JSON.stringify(cloud.learning.streak));
        if (cloud.learning.quiz_history.length) localStorage.setItem('quizwise_quiz_history', JSON.stringify(cloud.learning.quiz_history));
        if (cloud.learning.exam_history.length) localStorage.setItem('quizwise_exam_history', JSON.stringify(cloud.learning.exam_history));
        if (cloud.learning.recall_history.length) localStorage.setItem('quizwise_recall_history', JSON.stringify(cloud.learning.recall_history));
      }
      if (cloud.metrics.length) { setMetrics(cloud.metrics); localStorage.setItem('quizwise_metrics', JSON.stringify(cloud.metrics)); }
      if (cloud.saved) {
        if (cloud.saved.saved_quizzes.length) localStorage.setItem('quizwise_saved_quizzes', JSON.stringify(cloud.saved.saved_quizzes));
        if (cloud.saved.saved_exams.length) localStorage.setItem('quizwise_saved_exams', JSON.stringify(cloud.saved.saved_exams));
        if (Object.keys(cloud.saved.lib_meta).length) localStorage.setItem('quizwise_lib_meta', JSON.stringify(cloud.saved.lib_meta));
        if (cloud.saved.study_events.length) localStorage.setItem('study_events', JSON.stringify(cloud.saved.study_events));
        if (cloud.saved.study_templates.length) localStorage.setItem('study_templates', JSON.stringify(cloud.saved.study_templates));
      }
      if (!cloud.learning && !cloud.metrics.length) {
        const hasLocal = localStorage.getItem('quizwise_metrics') || localStorage.getItem('quizwise_streak') || localStorage.getItem('quizwise_quiz_history');
        if (hasLocal) migrateLocalToCloud(auth.user!.id).catch(() => {});
      }
    }).catch(() => {});
  }, [auth.user, isOffline]);

  const handleApiError = (e: any) => {
    if (e?.message === 'LIMIT_REACHED') { setShowUpgradeHint(true); return; }
    if (e?.message?.includes('einloggen')) { auth.setShowAuthModal(true); return; }
    toast.error(resolveErrorMessage(e));
  };

  const saveFlowResult = (res: LearningFlowResult) => {
    setFlowResult(res);
    localStorage.setItem('quizwise_flow_result', JSON.stringify(res));
  };

  const saveExamTerms = (terms: ExamTerm[]) => {
    setExamTerms(terms);
    localStorage.setItem('quizwise_exam_terms', JSON.stringify(terms));
    if (auth.user) syncLearningField(auth.user.id, 'exam_terms', terms);
  };

  const updateMetricsAfterSession = async (score: number, topicName: string, type: 'quiz' | 'exam' | 'recall' | 'cards') => {
    const prev = [...metrics];
    const idx = prev.findIndex(m => m.topic === topicName);
    let updated: TopicMetric[];
    if (idx >= 0) {
      updated = prev;
      updated[idx] = { ...updated[idx], confidence: Math.round((updated[idx].confidence + score) / 2), lastReviewed: Date.now(), totalAttempts: updated[idx].totalAttempts + 1, correctAttempts: updated[idx].correctAttempts + (score >= 70 ? 1 : 0) };
    } else {
      updated = [{ id: Math.random().toString(36).substr(2, 5), topic: topicName, confidence: score, lastReviewed: Date.now(), totalAttempts: 1, correctAttempts: score >= 70 ? 1 : 0 }, ...prev];
    }
    setMetrics(updated);
    localStorage.setItem('quizwise_metrics', JSON.stringify(updated));
    if (auth.user) syncMetrics(auth.user.id, updated);
    try {
      const flow = await orchestrateLearningFlow({ type, result: { score } }, updated, { entries: JSON.parse(localStorage.getItem('study_plan') || '[]'), exams: examTerms });
      saveFlowResult(flow);
    } catch (e) { console.error('Flow error', e); }
  };

  const { saveDocs: _saveDocs, ...docs } = useDocuments({ user: auth.user, userPlan: auth.userPlan, isOffline, setIsLoading, setShowUpgradeModal });

  const quiz = useQuizState({
    userId: auth.user?.id,
    documents: docs.documents,
    decks,
    metrics,
    examTerms,
    pendingActionDoc,
    getDocumentSource: docs.getDocumentSource,
    setActiveTab,
    setPendingActionDoc,
    setPendingTopic,
    setDecks,
    setIsLoading,
    handleApiError,
    updateMetricsAfterSession,
  });

  const sharedDeckMatch = window.location.pathname.match(/^\/shared\/([a-z0-9]+)$/i);
  if (sharedDeckMatch) {
    return (
      <>
        <ToastContainer />
        <SharedDeckPage
          deckId={sharedDeckMatch[1]}
          userId={auth.user?.id}
          onLoginRequired={() => auth.setShowAuthModal(true)}
          onAccepted={(deck) => {
            const stored: FlashcardDeck[] = (() => { try { return JSON.parse(localStorage.getItem('flashcard_decks') || '[]'); } catch { return []; } })();
            localStorage.setItem('flashcard_decks', JSON.stringify([...stored, deck]));
            window.location.href = '/';
          }}
        />
        {auth.showAuthModal && <AuthModal onClose={() => auth.setShowAuthModal(false)} />}
      </>
    );
  }

  if (!auth.authChecked) return <SplashScreen />;

  if (!auth.user) return (
    <>
      <ToastContainer />
      <LandingPage onAuthClick={() => auth.setShowAuthModal(true)} />
      {auth.showAuthModal && <AuthModal onClose={() => auth.setShowAuthModal(false)} />}
      {!cookieConsent && <CookieBanner onAccept={() => { setCookieConsent(true); localStorage.setItem('cookie_consent', 'accepted'); }} onShowPrivacy={() => setLegalPage('datenschutz')} />}
      {legalPage && <LegalModal page={legalPage} onClose={() => setLegalPage(null)} />}
    </>
  );

  const streak = getStreak();
  const totalDueCards = decks.reduce((sum, d) => {
    const now = Date.now();
    return sum + d.cards.filter(c => !c.srs || (c.srs as any).nextReview <= now).length;
  }, 0);
  const showStreakWarning = !streakDismissed && streak.current >= 2 && !streak.todayDone && totalDueCards > 0;

  return (
    <>
      <ToastContainer />
      {showOnboarding && <Onboarding onComplete={() => setShowOnboarding(false)} onStartUpload={() => setActiveTab(ActiveTab.LIBRARY)} />}
      {auth.showAuthModal && <AuthModal onClose={() => auth.setShowAuthModal(false)} onSuccess={() => auth.setShowAuthModal(false)} />}
      {showUpgradeModal && <UpgradeModal onClose={() => setShowUpgradeModal(false)} />}
      {showSettings && <SettingsModal user={auth.user} isDark={auth.isDark} onToggleTheme={auth.toggleTheme} onLogout={() => supabase.auth.signOut()} onClose={() => setShowSettings(false)} />}
      <Layout
        activeTab={activeTab}
        onTabChange={(tab) => { setPendingActionDoc(null); setPendingTopic(null); setActiveTab(tab); }}
        user={auth.user} onLoginClick={() => auth.setShowAuthModal(true)}
        onLogout={() => supabase.auth.signOut()}
        onUpgradeClick={() => setShowUpgradeModal(true)}
        onSettingsClick={() => setShowSettings(true)}
        isDark={auth.isDark} onToggleTheme={auth.toggleTheme}
      >
        {showStreakWarning && (
          <div className="mb-4 p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700 rounded-2xl flex items-center justify-between gap-4 animate-in slide-in-from-top-2 duration-300">
            <div className="flex items-center gap-3">
              <span className="text-xl">🔥</span>
              <p className="text-[11px] font-bold text-amber-800 dark:text-amber-300">
                Deine <strong>{streak.current}-Tage-Streak</strong> endet heute — noch {totalDueCards} Karte{totalDueCards !== 1 ? 'n' : ''} fällig!
              </p>
            </div>
            <button
              onClick={() => setStreakDismissed(true)}
              className="text-amber-400 hover:text-amber-600 transition-colors shrink-0"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        )}
        {isOffline && (
          <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center justify-center gap-2">
            <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest">Offline-Modus aktiv</p>
          </div>
        )}
        {showUpgradeHint && (
          <div className="mb-4 p-4 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded-2xl flex items-center justify-between gap-4">
            <p className="text-[11px] font-bold text-indigo-700 dark:text-indigo-300">Tageslimit (20 Anfragen) erreicht. Mit <strong>Pro</strong> unlimitiert lernen.</p>
            <button onClick={() => { setShowUpgradeHint(false); setShowUpgradeModal(true); }} className="text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl text-white shrink-0" style={{ background: 'var(--primary)' }}>Upgrade zu Pro</button>
          </div>
        )}
        <ErrorBoundary>
        <React.Suspense fallback={<div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-slate-200 dark:border-slate-700 border-t-indigo-600 rounded-full animate-spin" /></div>}>
          <AppContent
            activeTab={activeTab} setActiveTab={setActiveTab}
            isLoading={isLoading} setIsLoading={setIsLoading}
            user={auth.user} userPlan={auth.userPlan}
            {...docs}
            {...quiz}
            pendingActionDoc={pendingActionDoc} setPendingActionDoc={setPendingActionDoc}
            pendingTopic={pendingTopic} setPendingTopic={setPendingTopic}
            decks={decks} setDecks={setDecks}
            examTerms={examTerms} saveExamTerms={saveExamTerms}
            flowResult={flowResult} saveFlowResult={saveFlowResult}
            metrics={metrics}
            searchResults={searchResults} setSearchResults={setSearchResults}
            savedSources={savedSources} setSavedSources={setSavedSources}
            isSearching={isSearching} setIsSearching={setIsSearching}
            handleApiError={handleApiError}
            updateMetricsAfterSession={updateMetricsAfterSession}
          />
        </React.Suspense>
        </ErrorBoundary>
      </Layout>
      {!cookieConsent && <CookieBanner onAccept={() => { setCookieConsent(true); localStorage.setItem('cookie_consent', 'accepted'); }} onShowPrivacy={() => setLegalPage('datenschutz')} />}
      {legalPage && <LegalModal page={legalPage} onClose={() => setLegalPage(null)} />}
    </>
  );
};

export default App;
