import React, { useState, useEffect } from 'react';
import { supabase } from './services/supabaseClient';
import { AuthModal } from './components/AuthModal';
import { UpgradeModal } from './components/UpgradeModal';
import { SettingsModal } from './components/SettingsModal';
import { Layout } from './components/Layout';
import { ToastContainer } from './components/Toast';
import { SplashScreen } from './components/SplashScreen';
import { AuthPage } from './components/AuthPage';
import { OnboardingFlow } from './components/onboarding/OnboardingFlow';
import { isOnboardingDone, markOnboardingDone, cacheOnboardingProfile, getCachedOnboardingProfile } from './components/onboarding/onboardingState';
import { getRecommendation, buildCombinedRecommendation } from './services/onboardingRecommendation';
import { SharedDeckPage } from './components/SharedDeckPage';
import { SharedLibraryPage } from './components/SharedLibraryPage';
import { ResetPasswordPage } from './components/ResetPasswordPage';
import { LandingPage } from './components/LandingPage';
import { ErrorBoundary } from './components/ErrorBoundary';
import { CookieBanner } from './components/CookieBanner';
import { CookieSettingsModal } from './components/CookieSettingsModal';
import { LegalModal } from './components/LegalModal';
import { hasDecided, setCookieConsent as saveCookieConsent } from './services/cookieConsent';
import { resolveErrorMessage } from './services/errorMessages';
import { track, trackSessionStart } from './services/analyticsService';
import { getStreak } from './services/streakService';
import { orchestrateLearningFlow } from './services/geminiService';
import { updateTopicMetric } from './services/topicConfidence';
import { documentDisplayName } from './services/libraryService';
import { getAllRecallResults } from './services/recallHistoryService';
import { toast } from './services/toast';
import { ActiveTab, TopicMetric, SearchResult, FlashcardDeck, ExamTerm, LearningFlowResult, OnboardingProfile } from './types';
import { isAdmin } from './config/admin';
import { useAuth } from './hooks/useAuth';
import { useDocuments } from './hooks/useDocuments';
import { useQuizState } from './hooks/useQuizState';
import { AppContent } from './components/AppContent';
import { loadAllCloudData, syncLearningField, syncMetrics, migrateLocalToCloud, syncPreferences, SYNC_DEGRADED_EVENT, mergeById, mergeReadingProgress, mergeMetrics, type CloudPreferences } from './services/syncService';
import { useTranslation } from './i18n/I18nProvider';

const LAST_TAB_KEY = 'studearc_last_tab';
// READER bewusst ausgeschlossen — hängt an einem konkreten pendingActionDoc,
// das nach einem Neuladen nicht mehr vorhanden ist.
const RESTORABLE_TABS = new Set<ActiveTab>([
  ActiveTab.DASHBOARD, ActiveTab.LIBRARY, ActiveTab.QUIZ, ActiveTab.CARDS,
  ActiveTab.PLANNER, ActiveTab.RADAR, ActiveTab.EXPLAINER, ActiveTab.EXAM,
  ActiveTab.RECALL, ActiveTab.KNOWLEDGE_GRAPH, ActiveTab.PAPER, ActiveTab.SEARCH,
]);

// Deep-Link-Pfade pro Bereich — bewusst kurz und deutsch, passend zur Marke.
// READER/PAPER/SEARCH bewusst ohne Pfad (Reader hängt an pendingActionDoc,
// Labor-Tabs sind admin-gegate).
const TAB_PATH: Partial<Record<ActiveTab, string>> = {
  [ActiveTab.DASHBOARD]: '/',
  [ActiveTab.LIBRARY]: '/library',
  [ActiveTab.QUIZ]: '/quiz',
  [ActiveTab.CARDS]: '/cards',
  [ActiveTab.RECALL]: '/erklarung',
  [ActiveTab.EXAM]: '/klausur',
  [ActiveTab.RADAR]: '/coach',
  [ActiveTab.EXPLAINER]: '/tutor',
  [ActiveTab.PLANNER]: '/planer',
  [ActiveTab.KNOWLEDGE_GRAPH]: '/wissensnetz',
};

const getInitialTab = (): ActiveTab => {
  // 1. Deep-Link: /quiz, /exam, /coach … (nach Reload/Share bleibt der Kontext)
  const pathTab = (Object.entries(TAB_PATH) as [ActiveTab, string][]).find(([, p]) => p === window.location.pathname);
  if (pathTab && RESTORABLE_TABS.has(pathTab[0])) return pathTab[0];
  // 2. zuletzt genutzter Tab
  const saved = localStorage.getItem(LAST_TAB_KEY) as ActiveTab | null;
  return saved && RESTORABLE_TABS.has(saved) ? saved : ActiveTab.DASHBOARD;
};

// Browser-Back für Tab-Wechsel: jeder User-Tab-Wechsel landet als History-
// Eintrag (state + URL-Pfad, der Express/Vercel-SPA-Fallback liefert die App),
// popstate stellt den vorherigen Tab wieder her. Programmgesteuerte Wechsel
// (Onboarding, Flow-Empfehlungen) schreiben bewusst KEINEN Eintrag, damit
// "Zurück" nicht durch Auto-Navigation springt.
const pushTabHistory = (tab: ActiveTab) => {
  const path = TAB_PATH[tab] ?? '/';
  try { history.pushState({ studearcTab: tab }, '', path); } catch {}
};

const App: React.FC = () => {
  const auth = useAuth();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<ActiveTab>(getInitialTab);
  // Fach-Kontext (Variante C): gewähltes Modul gilt app-weit als Vorauswahl
  const [activeModuleId, setActiveModuleIdState] = useState<string | null>(() => localStorage.getItem('studearc_active_module'));
  const setActiveModuleId = (id: string | null) => {
    setActiveModuleIdState(id);
    if (id) localStorage.setItem('studearc_active_module', id);
    else localStorage.removeItem('studearc_active_module');
  };
  const [pendingActionDoc, setPendingActionDoc] = useState<import('./types').ProcessedDocument | null>(null);
  const [pendingTopic, setPendingTopic] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [showUpgradeHint, setShowUpgradeHint] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => !isOnboardingDone());
  const [showTourReplay, setShowTourReplay] = useState(false);
  const [cloudPreferences, setCloudPreferences] = useState<CloudPreferences | null>(null);

  // Cloud sagt „Onboarding längst erledigt" (kommt asynchron nach dem Login,
  // z.B. nach gelöschten Website-Daten): Overlay sofort wieder schließen.
  useEffect(() => {
    const close = () => setShowOnboarding(!isOnboardingDone());
    window.addEventListener('studearc-onboarding-done', close);
    return () => window.removeEventListener('studearc-onboarding-done', close);
  }, []);
  const [decks, setDecks] = useState<FlashcardDeck[]>([]);
  const [examTerms, setExamTerms] = useState<ExamTerm[]>([]);
  const [flowResult, setFlowResult] = useState<LearningFlowResult | null>(() => {
    try {
      const saved = localStorage.getItem('studearc_flow_result');
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  const [metrics, setMetrics] = useState<TopicMetric[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [savedSources, setSavedSources] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [streakDismissed, setStreakDismissed] = useState(false);
  const [cookieConsent, setCookieConsent] = useState(() => hasDecided());
  const [showCookieSettings, setShowCookieSettings] = useState(false);
  const [legalPage, setLegalPage] = useState<'impressum' | 'datenschutz' | 'agb' | null>(null);
  // Sync 3x in Folge fehlgeschlagen → Hinweis statt stiller Datenverlust-Angst.
  // Dismissibel; erfolgreiche Syncs setzen den Zähler im Service zurück, das
  // Banner bleibt bewusst sitzen, bis der Nutzer es wegklickt (kein Flackern).
  const [syncDegraded, setSyncDegraded] = useState(false);
  useEffect(() => {
    const onDegraded = () => setSyncDegraded(true);
    window.addEventListener(SYNC_DEGRADED_EVENT, onDegraded);
    return () => window.removeEventListener(SYNC_DEGRADED_EVENT, onDegraded);
  }, []);
  // Produkt-Analytics (local-first, keine personenbezogenen Daten): Session-
  // Start + abgeleitete Retention-Marker (day_1/day_7_return).
  useEffect(() => { trackSessionStart(); }, []);

  useEffect(() => {
    const handleStatus = () => setIsOffline(!navigator.onLine);
    window.addEventListener('online', handleStatus);
    window.addEventListener('offline', handleStatus);
    try {
      const savedMetrics = localStorage.getItem('studearc_metrics');
      if (savedMetrics) setMetrics(JSON.parse(savedMetrics));
    } catch {}
    try {
      const savedDecks = localStorage.getItem('flashcard_decks');
      if (savedDecks) setDecks(JSON.parse(savedDecks));
    } catch {}
    try {
      const savedExamTerms = localStorage.getItem('studearc_exam_terms');
      if (savedExamTerms) setExamTerms(JSON.parse(savedExamTerms));
    } catch {}
    return () => { window.removeEventListener('online', handleStatus); window.removeEventListener('offline', handleStatus); };
  }, []);

  useEffect(() => {
    if (!auth.user || isOffline) return;
    loadAllCloudData(auth.user.id).then(cloud => {
      setCloudPreferences(cloud.preferences);
      // Cloud-Pull MERGT statt zu überschreiben: Wer offline gelernt hat (oder
      // bei gestörtem Sync), hat neuere lokale Einträge — ein Blind-Overwrite
      // würde diese still vernichten. Konflikte: neuerer Zeitstempel gewinnt.
      const readArr = (key: string): any[] => { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; } };
      // Bei Änderung zusätzlich zurück zur Cloud pushen — sonst bliebe sie
      // stale, bis der Nutzer das nächste Mal lokal schreibt (Self-Healing-Pull).
      const writeArr = (key: string, merged: any[], cloudField: string, table: 'learning' | 'saved') => {
        const prev = readArr(key);
        if (merged.length === prev.length && merged.every((m, i) => m.id === prev[i]?.id)) return;
        localStorage.setItem(key, JSON.stringify(merged));
        if (table === 'learning') syncLearningField(auth.user!.id, cloudField as any, merged);
        else import('./services/syncService').then(m => m.syncSavedField(auth.user!.id, cloudField as any, merged)).catch(() => {});
      };
      if (cloud.learning) {
        if (cloud.learning.exam_terms.length) {
          const mergedExamTerms = mergeById(readArr('studearc_exam_terms'), cloud.learning.exam_terms);
          writeArr('studearc_exam_terms', mergedExamTerms, 'exam_terms', 'learning');
          setExamTerms(mergedExamTerms);
        }
        // Streak: der weiter fortgeschrittenere Stand gewinnt (höheres current;
        // bei Gleichstand Cloud, falls lastDay neuer ist — getStreak liest localStorage).
        try {
          const localStreak = JSON.parse(localStorage.getItem('studearc_streak') || 'null');
          const cs = cloud.learning.streak;
          const cloudBetter = !localStreak || cs.current > localStreak.current
            || (cs.current === localStreak.current && (cs.lastDay ?? '') > (localStreak.lastDay ?? ''));
          if (cs.lastDay && cloudBetter) localStorage.setItem('studearc_streak', JSON.stringify(cs));
        } catch {}
        writeArr('studearc_quiz_history', mergeById(readArr('studearc_quiz_history'), cloud.learning.quiz_history, 'timestamp'), 'quiz_history', 'learning');
        writeArr('studearc_exam_history', mergeById(readArr('studearc_exam_history'), cloud.learning.exam_history, 'timestamp'), 'exam_history', 'learning');
        writeArr('studearc_recall_history', mergeById(readArr('studearc_recall_history'), cloud.learning.recall_history, 'timestamp'), 'recall_history', 'learning');
        writeArr('studearc_mistake_queue', mergeById(readArr('studearc_mistake_queue'), cloud.learning.mistake_queue, 'addedAt'), 'mistake_queue', 'learning');
      }
      if (cloud.metrics.length) {
        const localMetrics = (() => { try { return JSON.parse(localStorage.getItem('studearc_metrics') || '[]'); } catch { return []; } })();
        const mergedMetrics = mergeMetrics(localMetrics, cloud.metrics);
        setMetrics(mergedMetrics);
        localStorage.setItem('studearc_metrics', JSON.stringify(mergedMetrics));
        syncMetrics(auth.user.id, mergedMetrics);
      }
      if (cloud.saved) {
        writeArr('studearc_saved_quizzes', mergeById(readArr('studearc_saved_quizzes'), cloud.saved.saved_quizzes, 'savedAt'), 'saved_quizzes', 'saved');
        writeArr('studearc_saved_exams', mergeById(readArr('studearc_saved_exams'), cloud.saved.saved_exams, 'savedAt'), 'saved_exams', 'saved');
        writeArr('study_events', mergeById(readArr('study_events'), cloud.saved.study_events), 'study_events', 'saved');
        writeArr('study_templates', mergeById(readArr('study_templates'), cloud.saved.study_templates), 'study_templates', 'saved');
        writeArr('studearc_reader_log', mergeById(readArr('studearc_reader_log'), cloud.saved.reader_log, 'timestamp'), 'reader_log', 'saved');
        writeArr('studearc_recurring_sessions', mergeById(readArr('studearc_recurring_sessions'), cloud.saved.recurring_sessions), 'recurring_sessions', 'saved');
        writeArr('studearc_calendar_sessions', mergeById(readArr('studearc_calendar_sessions'), cloud.saved.calendar_sessions), 'calendar_sessions', 'saved');
        // Lesefortschritt: Kapitel-Union, done gewinnt, sonst neueres doneAt.
        if (Object.keys(cloud.saved.reading_progress).length) {
          try {
            const localRp = JSON.parse(localStorage.getItem('studearc_reading_progress') || '{}');
            const mergedRp = mergeReadingProgress(localRp, cloud.saved.reading_progress);
            localStorage.setItem('studearc_reading_progress', JSON.stringify(mergedRp));
          } catch {}
        }
        // lib_meta: Key-Union, Cloud gewinnt pro vorhandenem Key.
        if (Object.keys(cloud.saved.lib_meta).length) {
          try {
            const localMeta = JSON.parse(localStorage.getItem('studearc_lib_meta') || '{}');
            localStorage.setItem('studearc_lib_meta', JSON.stringify({ ...localMeta, ...cloud.saved.lib_meta }));
          } catch {}
        }
      }
      if (!cloud.learning && !cloud.metrics.length) {
        const hasLocal = localStorage.getItem('studearc_metrics') || localStorage.getItem('studearc_streak') || localStorage.getItem('studearc_quiz_history');
        if (hasLocal) migrateLocalToCloud(auth.user!.id).catch(() => {});
      }
    }).catch(() => {});
  }, [auth.user, isOffline]);

  // Admin-only Tabs (Labor) nicht wiederherstellen, falls der eingeloggte
  // Account kein Admin (mehr) ist — sonst zeigt AppContent zwar ohnehin nur
  // das Dashboard, aber die Sidebar würde fälschlich den Labor-Tab markieren.
  useEffect(() => {
    if (!auth.authChecked) return;
    if ((activeTab === ActiveTab.PAPER || activeTab === ActiveTab.SEARCH) && !isAdmin(auth.user?.id)) {
      setActiveTab(ActiveTab.DASHBOARD);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.authChecked]);

  // History-Integration: Back/Forward stellt den jeweiligen Tab wieder her.
  // Fehlt der State (initialer Eintrag), wird der Tab aus der URL abgeleitet —
  // sonst stünde nach "Zurück bis zum Start" ein Tab da, der nicht mehr zur
  // Adresse passt. Tabs außerhalb RESTORABLE_TABS (READER hängt an
  // pendingActionDoc) werden ignoriert.
  useEffect(() => {
    const onPopState = (e: PopStateEvent) => {
      let tab = (e.state as { studearcTab?: ActiveTab } | null)?.studearcTab;
      if (!tab) {
        const pathTab = (Object.entries(TAB_PATH) as [ActiveTab, string][]).find(([, p]) => p === window.location.pathname);
        tab = pathTab?.[0] ?? ActiveTab.DASHBOARD;
      }
      if (tab && RESTORABLE_TABS.has(tab)) {
        setPendingActionDoc(null);
        setPendingTopic(null);
        setActiveTab(tab);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const handleApiError = (e: any) => {
    if (e?.message === 'LIMIT_REACHED') { setShowUpgradeHint(true); return; }
    if (e?.message?.includes('einloggen')) { auth.setShowAuthModal(true); return; }
    toast.error(resolveErrorMessage(e));
  };

  const saveFlowResult = (res: LearningFlowResult) => {
    setFlowResult(res);
    localStorage.setItem('studearc_flow_result', JSON.stringify(res));
  };

  const saveExamTerms = (terms: ExamTerm[]) => {
    setExamTerms(terms);
    localStorage.setItem('studearc_exam_terms', JSON.stringify(terms));
    if (auth.user) syncLearningField(auth.user.id, 'exam_terms', terms);
  };

  const updateMetricsAfterSession = async (score: number, topicName: string, type: 'quiz' | 'exam' | 'recall' | 'cards') => {
    // Funnel-Marker: jede Session-Art zählt, die erste je Art nur einmal.
    track(`${type}_complete` as 'quiz_complete', { score });
    track(`first_${type}` as 'first_quiz', undefined, true);
    const prev = [...metrics];
    const idx = prev.findIndex(m => m.topic === topicName);
    let updated: TopicMetric[];
    if (idx >= 0) {
      updated = prev;
      updated[idx] = updateTopicMetric(updated[idx], topicName, score, type);
    } else {
      updated = [updateTopicMetric(undefined, topicName, score, type), ...prev];
    }
    setMetrics(updated);
    localStorage.setItem('studearc_metrics', JSON.stringify(updated));
    if (auth.user) syncMetrics(auth.user.id, updated);

    // KI-Flow max. 1x pro Tag — sonst kostet jede einzelne Session einen Gemini-Call,
    // obwohl sich die Empfehlungen innerhalb eines Tages kaum ändern.
    const d = new Date();
    const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (localStorage.getItem('studearc_flow_last_run') === todayStr) return;
    try {
      const flow = await orchestrateLearningFlow({ type, result: { score } }, updated, { entries: JSON.parse(localStorage.getItem('study_plan') || '[]'), exams: examTerms });
      saveFlowResult(flow);
      localStorage.setItem('studearc_flow_last_run', todayStr);
    } catch (e) { console.error('Flow error', e); }
  };

  // TopicMetric (Anki-Konfidenz) speichert kein docId, aber Quiz/Klausur legen
  // ihren Eintrag unter dem Dokument-/Ordnernamen als "Thema" an (siehe
  // updateMetricsAfterSession-Aufrufe unten). Beim Löschen eines Dokuments/
  // Ordners räumen wir diese Einträge deshalb explizit mit auf — sonst bleibt
  // die "Themen-Sicherheit" für längst gelöschte Quellen stehen.
  const removeMetricsForTopics = (topics: string[]) => {
    const topicSet = new Set(topics.filter(Boolean));
    if (topicSet.size === 0) return;
    const updated = metrics.filter(m => !topicSet.has(m.topic));
    if (updated.length === metrics.length) return;
    setMetrics(updated);
    localStorage.setItem('studearc_metrics', JSON.stringify(updated));
    if (auth.user) syncMetrics(auth.user.id, updated);
  };

  const { saveDocs: _saveDocs, deleteDoc: deleteDocRaw, removeCollection: removeCollectionRaw, ...docs } = useDocuments({ user: auth.user, userPlan: auth.userPlan, isOffline, setIsLoading, setShowUpgradeModal });

  // Feynman-Themen (RecallResult.topic) sind Konzeptnamen, keine Dokument-
  // namen — vor dem eigentlichen Löschen merken, welche Themen an diesem
  // Dokument/Ordner hängen, danach nur die entfernen, die kein noch
  // existierendes Dokument mehr referenziert (sonst reißt man geteilte
  // Themen anderer, weiterhin vorhandener Quellen mit heraus).
  const deleteDoc = (id: string) => {
    const doc = docs.documents.find(d => d.id === id);
    const docName = doc ? documentDisplayName(doc) : null;
    const topicsFromDoc = docName
      ? getAllRecallResults().filter(r => r.docName === docName).map(r => r.topic)
      : [];
    deleteDocRaw(id);
    if (!docName) return;
    const stillUsed = new Set(getAllRecallResults().map(r => r.topic));
    removeMetricsForTopics([docName, ...topicsFromDoc.filter(t => !stillUsed.has(t))]);
  };

  const removeCollection = (id: string) => {
    const col = docs.collections.find(c => c.id === id);
    const folderName = col ? `Ordner: ${col.name}` : null;
    const topicsFromFolder = folderName
      ? getAllRecallResults().filter(r => r.docName === folderName).map(r => r.topic)
      : [];
    removeCollectionRaw(id);
    if (!folderName) return;
    const stillUsed = new Set(getAllRecallResults().map(r => r.topic));
    removeMetricsForTopics([folderName, ...topicsFromFolder.filter(t => !stillUsed.has(t))]);
  };

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

  const sharedLibraryMatch = window.location.pathname.match(/^\/shared-library\/([a-z0-9]+)$/i);
  if (sharedLibraryMatch) {
    return (
      <>
        <ToastContainer />
        <SharedLibraryPage
          shareId={sharedLibraryMatch[1]}
          userId={auth.user?.id}
          onLoginRequired={() => auth.setShowAuthModal(true)}
        />
        {auth.showAuthModal && <AuthModal onClose={() => auth.setShowAuthModal(false)} />}
      </>
    );
  }

  if (window.location.pathname === '/reset-password') {
    return (
      <>
        <ToastContainer />
        <ResetPasswordPage authChecked={auth.authChecked} userId={auth.user?.id} />
      </>
    );
  }

  if (!auth.authChecked) return <SplashScreen />;

  if (!auth.user) return (
    <>
      <ToastContainer />
      <LandingPage onAuthClick={() => auth.setShowAuthModal(true)} onLegalClick={setLegalPage} onCookieSettingsClick={() => setShowCookieSettings(true)} />
      {auth.showAuthModal && <AuthModal onClose={() => auth.setShowAuthModal(false)} />}
      {!cookieConsent && !auth.showAuthModal && <CookieBanner
        onAccept={() => { saveCookieConsent({ functional: true, analytics: true }); setCookieConsent(true); }}
        onDecline={() => { saveCookieConsent({ functional: false, analytics: false }); setCookieConsent(true); }}
        onShowPrivacy={() => setLegalPage('datenschutz')}
        onShowSettings={() => setShowCookieSettings(true)}
      />}
      {legalPage && <LegalModal page={legalPage} onClose={() => setLegalPage(null)} />}
      {showCookieSettings && <CookieSettingsModal onClose={() => { setShowCookieSettings(false); setCookieConsent(true); }} onShowPrivacy={() => setLegalPage('datenschutz')} />}
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
      {showOnboarding && (
        <OnboardingFlow
          handleFileUpload={docs.handleFileUpload}
          documents={docs.documents}
          setActiveTab={setActiveTab}
          onComplete={(profile, startContext) => {
            markOnboardingDone();
            cacheOnboardingProfile(profile);
            track('onboarding_complete', { path: startContext?.docId ? 'with-upload' : 'skip' }, true);
            setCloudPreferences(prev => ({ ...(prev ?? {}), onboarding_done: true, onboarding: profile as OnboardingProfile }));
            setShowOnboarding(false);
            if (auth.user) syncPreferences(auth.user.id, { onboarding_done: true, onboarding: profile as OnboardingProfile });

            if (startContext?.docId) {
              const challenges = profile.challenges ?? [];
              const tab = challenges.length >= 2
                ? buildCombinedRecommendation(challenges).steps[0].tab
                : getRecommendation(challenges[0] ?? 'unsure').primaryTab;
              setPendingActionDoc(docs.documents.find(d => d.id === startContext.docId) ?? null);
              setPendingTopic(null);
              setActiveTab(tab);
            }
          }}
        />
      )}
      {showTourReplay && (
        <OnboardingFlow
          handleFileUpload={docs.handleFileUpload}
          documents={docs.documents}
          setActiveTab={setActiveTab}
          onComplete={() => setShowTourReplay(false)}
          replay={{ profile: cloudPreferences?.onboarding ?? getCachedOnboardingProfile() ?? {}, onDone: () => setShowTourReplay(false) }}
        />
      )}
      {auth.showAuthModal && <AuthModal onClose={() => auth.setShowAuthModal(false)} onSuccess={() => auth.setShowAuthModal(false)} />}
      {showUpgradeModal && <UpgradeModal onClose={() => setShowUpgradeModal(false)} />}
      {showSettings && <SettingsModal user={auth.user} isDark={auth.isDark} onToggleTheme={auth.toggleTheme} onLogout={() => supabase.auth.signOut()} onClose={() => setShowSettings(false)} onLaunchTour={() => { setShowSettings(false); setShowTourReplay(true); }} />}
      <Layout
        activeTab={activeTab}
        onTabChange={(tab) => { setPendingActionDoc(null); setPendingTopic(null); setActiveTab(tab); localStorage.setItem(LAST_TAB_KEY, tab); pushTabHistory(tab); }}
        collections={docs.collections}
        decks={decks}
        activeModuleId={activeModuleId}
        onModuleChange={setActiveModuleId}
        user={auth.user} userPlan={auth.userPlan} onLoginClick={() => auth.setShowAuthModal(true)}
        onLogout={() => supabase.auth.signOut()}
        onUpgradeClick={() => setShowUpgradeModal(true)}
        onSettingsClick={() => setShowSettings(true)}
        isDark={auth.isDark} onToggleTheme={auth.toggleTheme}
      >
        {showStreakWarning && (
          <div className="mb-4 p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700 rounded-2xl flex items-center justify-between gap-4 animate-in slide-in-from-top-2 duration-300">
            <div className="flex items-center gap-3">
              <span className="text-xl">⭐</span>
              <p className="text-[11px] font-bold text-amber-800 dark:text-amber-300">
                Deine <strong>{streak.current}-Tage-Streak</strong> endet heute, noch {totalDueCards} Karte{totalDueCards !== 1 ? 'n' : ''} fällig!
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
        {syncDegraded && !isOffline && (
          <div className="mb-4 p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700 rounded-2xl flex items-center justify-between gap-4">
            <p className="text-[11px] font-bold text-amber-800 dark:text-amber-300">{t('app.syncDegraded')}</p>
            <button
              onClick={() => setSyncDegraded(false)}
              aria-label="Banner schließen"
              className="text-amber-400 hover:text-amber-600 transition-colors shrink-0"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
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
            deleteDoc={deleteDoc}
            removeCollection={removeCollection}
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
            activeModuleId={activeModuleId}
            handleApiError={handleApiError}
            updateMetricsAfterSession={updateMetricsAfterSession}
            isDark={auth.isDark}
          />
        </React.Suspense>
        </ErrorBoundary>
      </Layout>
      {!cookieConsent && !auth.showAuthModal && !showOnboarding && !showTourReplay && <CookieBanner
        onAccept={() => { saveCookieConsent({ functional: true, analytics: true }); setCookieConsent(true); }}
        onDecline={() => { saveCookieConsent({ functional: false, analytics: false }); setCookieConsent(true); }}
        onShowPrivacy={() => setLegalPage('datenschutz')}
        onShowSettings={() => setShowCookieSettings(true)}
      />}
      {legalPage && <LegalModal page={legalPage} onClose={() => setLegalPage(null)} />}
      {showCookieSettings && <CookieSettingsModal onClose={() => { setShowCookieSettings(false); setCookieConsent(true); }} onShowPrivacy={() => setLegalPage('datenschutz')} />}
    </>
  );
};

export default App;
