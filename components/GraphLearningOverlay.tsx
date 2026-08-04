import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Collection, Flashcard, FlashcardDeck, ProcessedDocument, QuizQuestion, UserAnswer } from '../types';
import { QuizType } from '../types';
import type { GraphNode } from '../services/graph/types';
import { buildNodeGenerationSource, buildNodeSyntheticDocument } from '../services/graph/graphLearningSource';
import { generateFlashcardsFromDocument, generateQuizFromDocument, generateExplanation } from '../services/geminiService';
import { createSrsState, reviewCard, migrateLegacyCard, QUALITY_MAP } from '../services/spacedRepetition';
import { saveDeckToSupabase } from '../services/flashcardService';
import { saveQuizResult } from '../services/quizHistoryService';
import { saveRecallResult } from '../services/recallHistoryService';
import { recordActivity } from '../services/streakService';
import { resolveErrorMessage } from '../services/errorMessages';
import { toast } from '../services/toast';
import { renderMarkdown } from './markdownRenderer';
import { useTranslation } from '../i18n/I18nProvider';

const QuizPlayer = React.lazy(() => import('./QuizPlayer').then(m => ({ default: m.QuizPlayer })));
const FlashcardPlayer = React.lazy(() => import('./FlashcardPlayer').then(m => ({ default: m.FlashcardPlayer })));
const ActiveRecall = React.lazy(() => import('./ActiveRecall').then(m => ({ default: m.ActiveRecall })));

/**
 * Phase 5 ("Aktiv lernen") — letzte große Funktionsphase des Wissensnetzes.
 * Öffnet eine der vier bestehenden Lernaktivitäten (Karteikarten/Quiz/
 * Feynman/KI-Erklärung) DIREKT für einen Node, als Overlay über dem Graphen
 * — exakt dieselbe "Variante A" wie der Reader in Phase 3 (s. GraphSystem.tsx
 * Datei-Kommentar): GraphCanvas bleibt gemounted, Zoom/Pan/Auswahl/History
 * bleiben unangetastet, nichts navigiert zu einem anderen Tab.
 *
 * Bewusst KEIN zweiter KI-/Quiz-/Karteikarten-/Feynman-Workflow — jede
 * Aktivität ruft exakt dieselbe Service-Funktion bzw. Komponente auf, die
 * auch die "normale" App nutzt. Der Node liefert nur den Rohstoff
 * (Titel+Beschreibung+Notiz, s. graphLearningSource.ts) — keine
 * ConceptNode-Konvergenz, keine Verknüpfung mit verlinkten Dokumenten/Kanten,
 * das ist eine bewusst spätere, hier nicht getroffene Entscheidung.
 *
 * `FlashcardPlayer` portalt bereits SICH SELBST (eigener z-[100]-Vollbild-
 * Layer mit eigenem Schließen-Button) — für "Karteikarten" übernimmt dieser
 * Overlay deshalb nur den Ladezustand VOR dem Öffnen, danach übergibt er
 * komplett an `FlashcardPlayer`. `QuizPlayer`/`ActiveRecall` sind dagegen
 * reine Inline-Komponenten ohne eigenes Overlay-Chrome — für "Quiz" und
 * "Feynman" bleibt deshalb DIESER Overlay während der gesamten Aktivität die
 * sichtbare Hülle (Kopfzeile mit "Zurück zum Wissensnetz").
 */

export type GraphLearningActivity = 'flashcards' | 'quiz' | 'feynman' | 'explain';

export interface GraphLearningOverlayProps {
  node: GraphNode;
  activity: GraphLearningActivity;
  onClose: () => void;
  userId?: string;
  documents: ProcessedDocument[];
  collections: Collection[];
  decks: FlashcardDeck[];
  onDecksChange: (decks: FlashcardDeck[]) => void;
  updateMetricsAfterSession: (score: number, name: string, type: 'quiz' | 'exam' | 'recall' | 'cards') => Promise<void>;
  onApiError: (e: unknown) => void;
}

const ACTIVITY_TITLES: Record<GraphLearningActivity, string> = {
  flashcards: 'kg.panel.activityFlashcards',
  quiz: 'kg.panel.activityQuiz',
  feynman: 'kg.panel.activityFeynman',
  explain: 'kg.panel.activityExplain',
};

/** Gemeinsame Kopfzeile+Vollbild-Hülle für Quiz/Feynman/KI-Erklärung (und den
 *  Ladezustand von Karteikarten, bevor FlashcardPlayer übernimmt). Escape
 *  schließt — außer der Fokus liegt gerade in einem Eingabefeld (Feynman-
 *  Antwort, offene Quizfrage): dann nur Blur, kein Datenverlust durch
 *  versehentliches Schließen mitten im Tippen. Derselbe globale
 *  window-Listener wie beim Panel/Canvas (s. dortige Kommentare) statt eines
 *  component-scoped onKeyDown — aus demselben Grund: Fokus kann durch
 *  Unmounten eines Feldes den DOM-Teilbaum verlassen. */
const OverlayShell: React.FC<{ node: GraphNode; activity: GraphLearningActivity; onClose: () => void; children: React.ReactNode }> = ({
  node, activity, onClose, children,
}) => {
  const { t } = useTranslation();
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => { closeButtonRef.current?.focus(); }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const active = document.activeElement;
      if (active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement) {
        active.blur();
        return;
      }
      onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col animate-in fade-in duration-200" style={{ background: 'var(--bg-main)' }}>
      <div className="flex items-center gap-3 px-4 py-3 border-b shrink-0" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-sidebar)' }}>
        <button
          ref={closeButtonRef}
          onClick={onClose}
          className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-300 hover:text-slate-700 dark:hover:text-white transition-colors shrink-0"
        >
          ← {t('kg.activity.back')}
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 break-words">{t(ACTIVITY_TITLES[activity])} · {node.title}</p>
        </div>
        <div className="w-[72px] shrink-0" />
      </div>
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>,
    document.body,
  );
};

const LoadingState: React.FC<{ label: string }> = ({ label }) => (
  <div className="flex flex-col items-center justify-center py-32 space-y-6 px-4">
    <div className="relative w-16 h-16">
      <div className="w-16 h-16 border-8 rounded-full" style={{ borderColor: 'var(--border-color)' }} />
      <div className="w-16 h-16 border-8 border-t-transparent rounded-full animate-spin absolute top-0 left-0" style={{ borderColor: 'var(--primary)', borderTopColor: 'transparent' }} />
    </div>
    <p className="text-sm font-black uppercase tracking-tight dark:text-white text-center">{label}</p>
  </div>
);

const ErrorState: React.FC<{ message: string; onClose: () => void }> = ({ message, onClose }) => {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center py-32 space-y-4 px-4 text-center">
      <p className="text-sm font-bold text-rose-500 max-w-sm">{message}</p>
      <button
        onClick={onClose}
        className="px-5 py-2.5 rounded-[14px] text-[10px] font-black uppercase tracking-widest text-white"
        style={{ background: 'var(--primary)' }}
      >
        {t('kg.activity.back')}
      </button>
    </div>
  );
};

// ── Karteikarten ─────────────────────────────────────────────────────────
const FlashcardsActivity: React.FC<{
  node: GraphNode; userId?: string; decks: FlashcardDeck[];
  onDecksChange: (decks: FlashcardDeck[]) => void; onClose: () => void; onApiError: (e: unknown) => void;
}> = ({ node, userId, decks, onDecksChange, onClose, onApiError }) => {
  const { t } = useTranslation();
  const [deck, setDeck] = useState<FlashcardDeck | null>(null);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  // FlashcardPlayer hat kein eigenes Escape-Verhalten (nur den sichtbaren
  // ✕-Button) — sobald es übernimmt, greift OverlayShells Escape-Listener
  // nicht mehr (der läuft nur während des Ladezustands unten). Eigener,
  // über die gesamte Lebensdauer dieser Aktivität aktiver Listener schließt
  // die Lücke, ohne FlashcardPlayer selbst anzufassen (bestehende
  // Infrastruktur, nicht verändern). Während des Ladens doppelt sich das
  // harmlos mit OverlayShells eigenem Listener (beide rufen onClose auf).
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    (async () => {
      try {
        const generated = await generateFlashcardsFromDocument(buildNodeGenerationSource(node), 8);
        if (!generated.length) throw new Error('Keine Karteikarten erzeugt.');
        const newDeck: FlashcardDeck = {
          id: `graph-deck-${node.id}-${Date.now()}`,
          title: `Knoten: ${node.title}`,
          cards: generated.map((c): Flashcard => ({
            id: Math.random().toString(36).slice(2, 9),
            front: c.front || '', back: c.back || '',
            level: 0, nextReview: Date.now(), lastInterval: 0,
            srs: createSrsState(),
          })),
        };
        const updatedDecks = [...decks, newDeck];
        onDecksChange(updatedDecks);
        localStorage.setItem('flashcard_decks', JSON.stringify(updatedDecks));
        if (userId) saveDeckToSupabase(newDeck, userId).catch(() => {});
        setDeck(newDeck);
      } catch (e) {
        onApiError(e);
        setError(resolveErrorMessage(e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleReview = (cardId: string, difficulty: 'again' | 'hard' | 'good' | 'easy') => {
    if (!deck) return;
    const quality = QUALITY_MAP[difficulty];
    const updatedDecks = decks.map(d => {
      if (d.id !== deck.id) return d;
      return {
        ...d,
        cards: d.cards.map(card => {
          if (card.id !== cardId) return card;
          const currentSrs = card.srs ?? migrateLegacyCard(card);
          const nextSrs = reviewCard(currentSrs, quality);
          return { ...card, srs: nextSrs, level: nextSrs.repetitions, nextReview: nextSrs.nextReview, lastInterval: nextSrs.interval };
        }),
      };
    });
    onDecksChange(updatedDecks);
    const changedDeck = updatedDecks.find(d => d.id === deck.id);
    if (changedDeck) {
      setDeck(changedDeck);
      localStorage.setItem('flashcard_decks', JSON.stringify(updatedDecks));
      if (userId) saveDeckToSupabase(changedDeck, userId).catch(() => {});
    }
    recordActivity(userId);
  };

  if (deck) {
    return (
      <React.Suspense fallback={null}>
        <FlashcardPlayer cards={deck.cards} onReview={handleReview} onClose={onClose} />
      </React.Suspense>
    );
  }

  return (
    <OverlayShell node={node} activity="flashcards" onClose={onClose}>
      {error ? <ErrorState message={error} onClose={onClose} /> : <LoadingState label={t('kg.activity.loadingFlashcards')} />}
    </OverlayShell>
  );
};

// ── Quiz ─────────────────────────────────────────────────────────────────
const QUIZ_QUESTION_COUNT = 4;

const QuizActivity: React.FC<{
  node: GraphNode; userId?: string; onClose: () => void; onApiError: (e: unknown) => void;
  updateMetricsAfterSession: (score: number, name: string, type: 'quiz' | 'exam' | 'recall' | 'cards') => Promise<void>;
}> = ({ node, userId, onClose, onApiError, updateMetricsAfterSession }) => {
  const { t } = useTranslation();
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null);
  const [answers, setAnswers] = useState<UserAnswer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    (async () => {
      try {
        const q = await generateQuizFromDocument(buildNodeGenerationSource(node), QuizType.CUSTOM, { customCount: QUIZ_QUESTION_COUNT });
        if (!q.length) throw new Error('Keine Fragen erzeugt.');
        setQuestions(q);
      } catch (e) {
        onApiError(e);
        setError(resolveErrorMessage(e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleComplete = async (ans: UserAnswer[]) => {
    setAnswers(ans);
    const correct = ans.filter(a => a.isCorrect).length;
    const score = Math.round((correct / ans.length) * 100);
    saveQuizResult({
      docId: `graph-node-${node.id}`, docName: node.title, timestamp: Date.now(),
      score, correctCount: correct, totalCount: ans.length,
      weakTopics: correct < ans.length ? [node.title] : [],
      questions: questions ?? [], answers: ans,
    }, userId);
    await updateMetricsAfterSession(score, node.title, 'quiz');
    recordActivity(userId);
  };

  if (error) return <OverlayShell node={node} activity="quiz" onClose={onClose}><ErrorState message={error} onClose={onClose} /></OverlayShell>;
  if (!questions) return <OverlayShell node={node} activity="quiz" onClose={onClose}><LoadingState label={t('kg.activity.loadingQuiz')} /></OverlayShell>;

  if (answers) {
    const correct = answers.filter(a => a.isCorrect).length;
    const score = Math.round((correct / answers.length) * 100);
    return (
      <OverlayShell node={node} activity="quiz" onClose={onClose}>
        <div className="flex flex-col items-center justify-center py-24 space-y-6 px-4 text-center">
          <p className="text-5xl font-black dark:text-white">{score}%</p>
          <p className="text-sm font-bold text-slate-500 dark:text-slate-400">
            {t('kg.activity.quizResult', { correct, total: answers.length })}
          </p>
          <button
            onClick={onClose}
            className="px-6 py-3 rounded-[14px] text-[10px] font-black uppercase tracking-widest text-white"
            style={{ background: 'var(--primary)' }}
          >
            {t('kg.activity.back')}
          </button>
        </div>
      </OverlayShell>
    );
  }

  return (
    <OverlayShell node={node} activity="quiz" onClose={onClose}>
      <React.Suspense fallback={<LoadingState label={t('kg.activity.loadingQuiz')} />}>
        <QuizPlayer questions={questions} sourceName={node.title} examMode={false} onComplete={handleComplete} onCancel={onClose} />
      </React.Suspense>
    </OverlayShell>
  );
};

// ── Feynman ──────────────────────────────────────────────────────────────
const FeynmanActivity: React.FC<{
  node: GraphNode; documents: ProcessedDocument[]; collections: Collection[]; userId?: string;
  onClose: () => void; onDecksChange: (decks: FlashcardDeck[]) => void; decks: FlashcardDeck[];
  updateMetricsAfterSession: (score: number, name: string, type: 'quiz' | 'exam' | 'recall' | 'cards') => Promise<void>;
}> = ({ node, documents, collections, userId, onClose, onDecksChange, decks, updateMetricsAfterSession }) => {
  const { t } = useTranslation();
  // ActiveRecall liest `initialDoc` nur einmal in seinem eigenen Mount-Effekt
  // (leeres Dependency-Array) — ein neues Objekt bei jedem Render ist deshalb
  // unproblematisch, keine Memoisierung nötig.
  const syntheticDoc = buildNodeSyntheticDocument(node);

  return (
    <OverlayShell node={node} activity="feynman" onClose={onClose}>
      <React.Suspense fallback={<LoadingState label={t('kg.activity.loadingFeynman')} />}>
        <ActiveRecall
          availableDocuments={documents}
          collections={collections}
          getDocumentSource={() => buildNodeGenerationSource(node)}
          initialDoc={syntheticDoc}
          initialFocusTopic={node.title}
          autoStart
          onComplete={(score, topic, missingPoints) => {
            saveRecallResult({ docName: topic, timestamp: Date.now(), score, topic, missingPoints }, userId);
            updateMetricsAfterSession(score, topic, 'recall');
            recordActivity(userId);
          }}
          onCreateCardsFromGaps={(topic, points) => {
            if (!points.length) return;
            const cards: Flashcard[] = points.map(p => ({
              id: Math.random().toString(36).slice(2, 9),
              front: `${topic}: Was fehlte hier?\n„${p.slice(0, 120)}${p.length > 120 ? '…' : ''}"`,
              back: p, level: 0, nextReview: Date.now(), srs: createSrsState(),
            }));
            const newDeck: FlashcardDeck = { id: `graph-gaps-${node.id}-${Date.now()}`, title: `Lücken: ${topic}`, cards };
            const updatedDecks = [...decks, newDeck];
            onDecksChange(updatedDecks);
            localStorage.setItem('flashcard_decks', JSON.stringify(updatedDecks));
            if (userId) saveDeckToSupabase(newDeck, userId).catch(() => {});
            toast.success(`${cards.length} Karteikarten erstellt`);
          }}
        />
      </React.Suspense>
    </OverlayShell>
  );
};

// ── KI-Erklärung ─────────────────────────────────────────────────────────
const ExplainActivity: React.FC<{ node: GraphNode; onClose: () => void; onApiError: (e: unknown) => void }> = ({ node, onClose, onApiError }) => {
  const { t } = useTranslation();
  const [explanation, setExplanation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    (async () => {
      try {
        const hasOwnContext = node.description.trim().length > 0 || node.notes.trim().length > 0;
        const source = hasOwnContext ? buildNodeGenerationSource(node) : null;
        const result = await generateExplanation(source, node.title, true, false);
        setExplanation(result);
      } catch (e) {
        onApiError(e);
        setError(resolveErrorMessage(e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <OverlayShell node={node} activity="explain" onClose={onClose}>
      {error && <ErrorState message={error} onClose={onClose} />}
      {!error && !explanation && <LoadingState label={t('kg.activity.loadingExplain')} />}
      {explanation && (
        <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
          <div className="rounded-[20px] p-6 border" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-sidebar)' }}>
            {renderMarkdown(explanation)}
          </div>
        </div>
      )}
    </OverlayShell>
  );
};

export const GraphLearningOverlay: React.FC<GraphLearningOverlayProps> = ({
  node, activity, onClose, userId, documents, collections, decks, onDecksChange, updateMetricsAfterSession, onApiError,
}) => {
  switch (activity) {
    case 'flashcards':
      return <FlashcardsActivity key={`flashcards-${node.id}`} node={node} userId={userId} decks={decks} onDecksChange={onDecksChange} onClose={onClose} onApiError={onApiError} />;
    case 'quiz':
      return <QuizActivity key={`quiz-${node.id}`} node={node} userId={userId} onClose={onClose} onApiError={onApiError} updateMetricsAfterSession={updateMetricsAfterSession} />;
    case 'feynman':
      return <FeynmanActivity key={`feynman-${node.id}`} node={node} documents={documents} collections={collections} userId={userId} onClose={onClose} decks={decks} onDecksChange={onDecksChange} updateMetricsAfterSession={updateMetricsAfterSession} />;
    case 'explain':
      return <ExplainActivity key={`explain-${node.id}`} node={node} onClose={onClose} onApiError={onApiError} />;
  }
};
