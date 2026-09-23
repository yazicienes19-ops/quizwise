
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Mic, MicOff, Square } from 'lucide-react';
import { ProcessedDocument, Collection, RecallChallenge, RecallEvaluation, FeynmanAudience } from '../types';
import type { GenerationSource } from '../services/geminiService';
import { evaluateRecallResponse, generateRecallChallenge, generateFlashcardsFromGaps } from '../services/geminiService';
import { stripFeynmanMeta } from '../services/feynmanText';
import { generateValidatedChallenge, resolveActualTopic } from '../services/recallChallengeGuard';
import { getRecentRecallQuestions, rememberRecallQuestion } from '../services/recallQuestionDedup';
import { useTranslation } from '../i18n/I18nProvider';
import { localeTag } from '../i18n';
import type { TKey } from '../i18n';
import { SourceSelector } from './SourceSelector';
import { toast } from '../services/toast';
import { documentDisplayName } from '../services/libraryService';
import { buildRealTopicMastery } from '../services/learningProfileService';
import { buildCollectionSource } from '../services/collectionSource';
import { rankTopicsForNextChallenge, SUCCESS_THRESHOLD } from '../services/recallGaps';
import { getCoverage, markTopicCovered } from '../services/recallCoverageService';
import { detectChaptersForDoc, type Chapter } from '../services/chapterService';
import { getDoneChapterIndices } from '../services/chapterProgressService';
import type { RecallResult } from '../services/recallHistoryService';
import { useModuleScopedActivity } from '../hooks/useModuleScopedActivity';

const EMPTY_DISMISSED = new Set<string>();
const AUDIENCES: FeynmanAudience[] = ['child', 'peer', 'exam'];
const AUDIENCE_KEY = 'studearc_feynman_audience';
/** Tab-lokal: eine angefangene Erklärung übersteht Tab-Wechsel, nicht aber einen neuen Browser-Tab. */
const DRAFT_KEY = 'studearc_feynman_draft_v1';
const MAX_TOPIC_WORDS = 8;
const STRONG_GAP = '#c2543f';
const MILD_GAP = '#d9a03f';
/** Gold als Textfarbe auf Cream nur abgedunkelt, sonst reicht der Kontrast nicht. */
const GOLD_TEXT = 'color-mix(in srgb, var(--primary) 70%, black)';

type SourceRef = { kind: 'doc' | 'collection'; id: string } | null;

/** Was beim vorigen Versuch derselben Frage fehlte — Grundlage der Feynman-Schleife. */
interface AttemptContext {
  score: number;
  missingPoints: string[];
  unexplainedJargon: string[];
  probeQuestion: string;
  answer: string;
}

interface StoredDraft {
  challenge: RecallChallenge;
  userAnswer: string;
  sourceRef: { kind: 'doc' | 'collection'; id: string };
  focusTopic: string;
  lastAttempt: AttemptContext | null;
}

const norm = (s: string) => s.trim().toLowerCase();

const readAudience = (): FeynmanAudience => {
  try {
    const v = localStorage.getItem(AUDIENCE_KEY);
    if (v === 'child' || v === 'peer' || v === 'exam') return v;
  } catch {}
  return 'child';
};

const readDraft = (): StoredDraft | null => {
  try {
    const d = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null');
    return d?.challenge?.question && d?.sourceRef?.id ? d : null;
  } catch { return null; }
};

const clearDraft = () => { try { sessionStorage.removeItem(DRAFT_KEY); } catch {} };

const scoreColor = (score: number) =>
  score >= 86 ? 'text-emerald-500' : score >= 61 ? '' : score >= 31 ? 'text-amber-500' : 'text-rose-500';

interface ActiveRecallProps {
  availableDocuments: ProcessedDocument[];
  collections: Collection[];
  getDocumentSource?: (doc: ProcessedDocument) => GenerationSource;
  onSaveToLibrary?: (file: File) => void;
  /** docName = Name der Quelle (Dokument oder "Ordner: X"), NICHT das Thema — daran
   *  hängen Fach-Filter, Dokument-Filter der Fehleranalyse und das Aufräumen beim Löschen. */
  onComplete: (score: number, topic: string, missingPoints: string[], docName: string) => void;
  /** Speichert Karteikarten, die ActiveRecall aus den Lücken erzeugt hat
   *  (echte Frage pro Lücke, s. generateFlashcardsFromGaps). */
  onCreateCardsFromGaps?: (topic: string, cards: { front: string; back: string }[]) => void;
  initialDoc?: ProcessedDocument;
  /** Themen-Vorbelegung, z.B. aus dem Split-Screen-Reader-Handoff. */
  initialFocusTopic?: string;
  /** Startet die Herausforderung automatisch, sobald die Quelle gesetzt ist — kein manueller Klick nötig. */
  autoStart?: boolean;
  /** Aktives Fach aus der Sidebar. null/undefined = "Alle Fächer", keine Einschränkung. */
  activeModuleId?: string | null;
  /** Angefangene Erklärung über Tab-Wechsel retten; aus für eingebettete Nutzungen (Wissensnetz). */
  persistDraft?: boolean;
}

export const ActiveRecall: React.FC<ActiveRecallProps> = ({
  availableDocuments,
  collections,
  getDocumentSource,
  onSaveToLibrary,
  onComplete,
  onCreateCardsFromGaps,
  initialDoc,
  initialFocusTopic,
  autoStart,
  activeModuleId = null,
  persistDraft = true,
}) => {
  const { t, tp } = useTranslation();
  const moduleDocuments = useMemo(
    () => activeModuleId ? availableDocuments.filter(d => d.collectionId === activeModuleId) : availableDocuments,
    [availableDocuments, activeModuleId],
  );
  const activeModuleCollection = useMemo(
    () => activeModuleId ? collections.find(c => c.id === activeModuleId) ?? null : null,
    [collections, activeModuleId],
  );
  // Themen-Vorschläge und die Auswahl des nächsten Themas beziehen sich bei
  // aktivem Fach nur auf dessen Historie (gleiches Muster wie GapRadar/Dashboard).
  const { quizResults: moduleQuizResults, examResults: moduleExamResults, recallResults: moduleRecallResults } =
    useModuleScopedActivity(activeModuleCollection, availableDocuments, EMPTY_DISMISSED);
  const [activeSource, setActiveSource] = useState<GenerationSource | null>(null);
  const [activeSourceName, setActiveSourceName] = useState('');
  /** Gesetzt nur bei Einzeldokument-Quellen — Basis für die Themen-Abdeckung. */
  const [activeDoc, setActiveDoc] = useState<ProcessedDocument | null>(null);
  const [sourceRef, setSourceRef] = useState<SourceRef>(null);
  const [coverageBump, setCoverageBump] = useState(0);
  const [focusTopic, setFocusTopic] = useState(initialFocusTopic ?? '');
  const [audience, setAudience] = useState<FeynmanAudience>(readAudience);
  const [challenge, setChallenge] = useState<RecallChallenge | null>(null);
  const [userAnswer, setUserAnswer] = useState('');
  const [evaluation, setEvaluation] = useState<RecallEvaluation | null>(null);
  const [lastAttempt, setLastAttempt] = useState<AttemptContext | null>(null);
  const [creatingGapCards, setCreatingGapCards] = useState(false);

  const handleCreateGapCards = async () => {
    if (!onCreateCardsFromGaps || !evaluation || !challenge || creatingGapCards) return;
    const topic = resolveActualTopic(challenge, focusTopic, activeSourceName || t('ar.recallFallback'));
    setCreatingGapCards(true);
    try {
      const cards = await generateFlashcardsFromGaps(topic, evaluation.missingPoints, {
        question: challenge.question,
        conceptContext: challenge.conceptContext,
        source: activeSource,
      });
      if (cards.length === 0) { toast.error(t('ar.gapCardsFailed')); return; }
      onCreateCardsFromGaps(topic, cards);
    } catch {
      toast.error(t('ar.gapCardsFailed'));
    } finally {
      setCreatingGapCards(false);
    }
  };
  // useModuleScopedActivity liest die Historie nur beim Mount — ohne diese
  // Ergänzung sähe die Themensteuerung Versuche dieser Sitzung erst nach einem
  // Remount (ein gerade verpatztes Thema käme beim nächsten Drill nicht bevorzugt).
  const [sessionResults, setSessionResults] = useState<RecallResult[]>([]);
  const [showModelAnswer, setShowModelAnswer] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [showFeynmanIntro, setShowFeynmanIntro] = useState(() =>
    !localStorage.getItem('studearc_feynman_intro_done')
  );
  const [isListening, setIsListening] = useState(false);
  const [interim, setInterim] = useState('');
  const speechRef = useRef<any>(null);
  const hasSpeechApi = typeof window !== 'undefined' && !!(
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  );

  const topicSuggestions = useMemo(() =>
    buildRealTopicMastery(moduleQuizResults, moduleExamResults, moduleRecallResults)
      .filter(s => s.security !== 'sicher')
      .slice(0, 5),
  [moduleQuizResults, moduleExamResults, moduleRecallResults]);

  // Feynman-Historie für die Themensteuerung: ohne Tutor-Einträge, ohne Alt-Einträge,
  // deren "Thema" nur ein Quell-/Dateiname war, und ohne Alt-Einträge, bei denen ein
  // getippter Satz als Thema gespeichert wurde (echte Themen haben laut Prompt 2-5 Wörter).
  const feynmanResults = useMemo(() => {
    const dropNames = new Set(
      [activeSourceName, ...availableDocuments.map(d => documentDisplayName(d))].map(norm).filter(Boolean)
    );
    const looksLikeTopic = (topic: string) => topic.trim().split(/\s+/).length <= MAX_TOPIC_WORDS;
    return [...sessionResults, ...moduleRecallResults]
      .filter(r => r.method !== 'explainer' && !dropNames.has(norm(r.topic ?? '')) && looksLikeTopic(r.topic ?? ''));
  }, [sessionResults, moduleRecallResults, activeSourceName, availableDocuments]);

  const resolveSourceRef = (ref: NonNullable<SourceRef>): { source: GenerationSource; name: string; doc: ProcessedDocument | null } | null => {
    if (ref.kind === 'doc') {
      const doc = availableDocuments.find(d => d.id === ref.id);
      if (!doc || !getDocumentSource) return null;
      if (activeModuleId && doc.collectionId !== activeModuleId) return null;
      try { return { source: getDocumentSource(doc), name: documentDisplayName(doc), doc }; } catch { return null; }
    }
    if (activeModuleId && ref.id !== activeModuleId) return null;
    const col = collections.find(c => c.id === ref.id);
    const result = col ? buildCollectionSource(col, availableDocuments) : null;
    if (!result || result.includedCount === 0) return null;
    return { source: result.source, name: result.name, doc: null };
  };

  useEffect(() => {
    if (initialDoc && getDocumentSource) {
      try {
        setActiveSource(getDocumentSource(initialDoc));
        setActiveSourceName(documentDisplayName(initialDoc));
        setActiveDoc(initialDoc);
        setSourceRef({ kind: 'doc', id: initialDoc.id });
      } catch (_) {}
      return;
    }
    // Angefangene Erklärung wiederherstellen (nicht bei gezielten Handoffs mit Fokus)
    const draft = persistDraft && !initialFocusTopic ? readDraft() : null;
    const restored = draft ? resolveSourceRef(draft.sourceRef) : null;
    if (draft && restored) {
      setActiveSource(restored.source);
      setActiveSourceName(restored.name);
      setActiveDoc(restored.doc);
      setSourceRef(draft.sourceRef);
      setFocusTopic(draft.focusTopic ?? '');
      setChallenge(draft.challenge);
      setUserAnswer(draft.userAnswer ?? '');
      setLastAttempt(draft.lastAttempt ?? null);
      if (draft.userAnswer?.trim()) toast.info(t('ar.draftRestored'));
      return;
    }
    // Aktives Fach: Quelle direkt vorbelegen — kein Quellen-Klick nötig
    const moduleId = localStorage.getItem('studearc_active_module');
    const col = moduleId ? collections.find(c => c.id === moduleId) : null;
    if (col) {
      const result = buildCollectionSource(col, availableDocuments);
      if (result && result.includedCount > 0) {
        setActiveSource(result.source);
        setActiveSourceName(result.name);
        setSourceRef({ kind: 'collection', id: col.id });
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Entwurf nur während des Formulierens halten; nach der Bewertung ist das Ergebnis
  // ohnehin im Verlauf gespeichert. Ohne Challenge wird bewusst NICHT gelöscht: waren
  // beim Mount die Dokumente noch nicht geladen, bleibt der Entwurf für den nächsten Besuch.
  useEffect(() => {
    if (!persistDraft || !challenge) return;
    if (evaluation || !sourceRef) { clearDraft(); return; }
    const draft: StoredDraft = { challenge, userAnswer, sourceRef, focusTopic, lastAttempt };
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch {}
  }, [persistDraft, challenge, evaluation, userAnswer, sourceRef, focusTopic, lastAttempt]);

  const stopListening = useCallback(() => {
    try { speechRef.current?.stop(); } catch {}
    speechRef.current = null;
    setIsListening(false);
    setInterim('');
  }, []);

  // Spracherkennung beim Verlassen stoppen — sonst läuft das Mikrofon weiter
  useEffect(() => () => { try { speechRef.current?.stop(); } catch {} }, []);

  const handleSelectDocument = (doc: ProcessedDocument) => {
    const source = getDocumentSource
      ? getDocumentSource(doc)
      : doc.type === 'pdf'
        ? { file: { data: doc.content, mimeType: 'application/pdf' } }
        : { text: doc.content };
    setActiveSource(source);
    setActiveSourceName(documentDisplayName(doc));
    setActiveDoc(doc);
    setSourceRef({ kind: 'doc', id: doc.id });
  };

  const clearSource = () => {
    setActiveSource(null);
    setActiveSourceName('');
    setActiveDoc(null);
    setSourceRef(null);
  };

  // Kapitel des aktiven Dokuments — volles Chapter-Objekt, damit sich der
  // Lesefortschritt zuordnen lässt (startPage/endPage bei PDFs, sonst Index).
  const [chapters, setChapters] = useState<Chapter[]>([]);
  // Abgeleitet statt eigener Boolean-State: sonst gäbe es einen Zwischen-Render,
  // in dem autoStart zu früh feuert (Reader-Handoff-Race, 2026-09-08).
  const [chaptersLoadedForDocId, setChaptersLoadedForDocId] = useState<string | null>(null);
  const chaptersReady = !activeDoc || chaptersLoadedForDocId === activeDoc.id;
  useEffect(() => {
    if (!activeDoc) { setChapters([]); return; }
    let cancelled = false;
    detectChaptersForDoc(activeDoc).then(result => {
      if (cancelled) return;
      setChapters(
        result
          .map(c => ({ ...c, title: c.title.replace(/^#{1,6}\s*/, '').trim() }))
          .filter(c => c.title)
      );
      setChaptersLoadedForDocId(activeDoc.id);
    });
    return () => { cancelled = true; };
  }, [activeDoc]);

  const doneChapterIndices = useMemo(
    () => (activeDoc ? getDoneChapterIndices(activeDoc.id) : []),
    [activeDoc]
  );

  // Nur tatsächlich gelesene Kapitel sind reguläre Abdeckungs-Vorschläge. Bei PDFs
  // mit Seiten-Zuordnung zählt ein Kapitel als gelesen, sobald eine seiner Seiten
  // markiert ist (startPage/endPage 1-basiert, doneChapterIndices 0-basiert).
  const isChapterRead = useCallback((chapter: Chapter): boolean => {
    if (chapter.startPage !== undefined) {
      const endPage = chapter.endPage ?? chapter.startPage;
      return doneChapterIndices.some(idx => idx + 1 >= chapter.startPage! && idx + 1 <= endPage);
    }
    return doneChapterIndices.includes(chapter.index);
  }, [doneChapterIndices]);

  const readChapterTitles = useMemo(
    () => chapters.filter(isChapterRead).map(c => c.title),
    [chapters, isChapterRead]
  );

  const coverage = useMemo(
    () => (activeDoc ? getCoverage(activeDoc.id, readChapterTitles) : null),
    [activeDoc, readChapterTitles, coverageBump]
  );

  // "Hier hakt es noch": dieselbe Reihenfolge, die auch die Themenwahl nutzt,
  // jeweils mit dem Grund aus Feynman-Versuchen oder dem Quiz-/Klausur-Profil.
  const gapEntries = useMemo(() => {
    const { preferTopics } = rankTopicsForNextChallenge(topicSuggestions.map(s => s.topic), feynmanResults);
    return preferTopics.slice(0, 5).map(topic => {
      const attempts = feynmanResults
        .filter(r => norm(r.topic ?? '') === norm(topic))
        .sort((a, b) => b.timestamp - a.timestamp);
      if (attempts.length > 0) {
        const best = Math.max(...attempts.map(r => r.score));
        return best >= SUCCESS_THRESHOLD
          ? { topic, strong: false, reason: t('ar.gap.shaky', { last: attempts[0].score, best }) }
          : { topic, strong: true, reason: tp('ar.gap.neverDone', attempts.length, { best }) };
      }
      const critical = topicSuggestions.find(s => norm(s.topic) === norm(topic))?.security === 'kritisch';
      return { topic, strong: critical, reason: t(critical ? 'ar.gap.kritisch' : 'ar.gap.unsicher') };
    });
  }, [topicSuggestions, feynmanResults, t, tp]);

  const handleCancel = () => {
    stopListening();
    if (persistDraft) clearDraft();
    setChallenge(null);
    setEvaluation(null);
    setLastAttempt(null);
    setUserAnswer('');
  };

  const dismissFeynmanIntro = () => {
    localStorage.setItem('studearc_feynman_intro_done', '1');
    setShowFeynmanIntro(false);
  };

  const chooseAudience = (next: FeynmanAudience) => {
    setAudience(next);
    try { localStorage.setItem(AUDIENCE_KEY, next); } catch {}
  };

  const toggleListening = useCallback(() => {
    if (!hasSpeechApi) return;
    if (isListening) { stopListening(); return; }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = localeTag();
    rec.continuous = true;
    // Zwischenergebnisse live anzeigen, ins Textfeld wandern nur finale Sätze
    rec.interimResults = true;
    rec.onresult = (e: any) => {
      let finalText = '';
      let interimText = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (result.isFinal) finalText += result[0].transcript;
        else interimText += result[0].transcript;
      }
      const done = finalText.trim();
      if (done) setUserAnswer(prev => (prev ? `${prev} ${done}` : done));
      setInterim(interimText.trim());
    };
    rec.onerror = (e: any) => {
      stopListening();
      // Verweigertes Mikrofon sonst = scheinbar kaputter Button
      if (e?.error === 'not-allowed' || e?.error === 'service-not-allowed' || e?.error === 'audio-capture') {
        toast.error(t('ar.micDenied'));
      }
    };
    rec.onend = () => {
      if (speechRef.current !== rec) return;
      speechRef.current = null;
      setIsListening(false);
      setInterim('');
    };
    speechRef.current = rec;
    rec.start();
    setIsListening(true);
  }, [hasSpeechApi, isListening, stopListening, t]);

  const startNewChallenge = async () => {
    if (!activeSource) return;
    stopListening();
    setIsLoading(true);
    setEvaluation(null);
    setLastAttempt(null);
    setUserAnswer('');
    setShowModelAnswer(false);
    try {
      // Nie erfolgreich erklärte, oft verpatzte und kürzlich gescheiterte Themen
      // zuerst; nur kürzlich gemeisterte Themen ruhen kurz (services/recallGaps.ts).
      const { preferTopics, excludeTopics } = rankTopicsForNextChallenge(
        topicSuggestions.map(s => s.topic),
        feynmanResults,
      );
      // Guard: Fokus-Validierung + Frage-Dedup, eine Regeneration, dann Fehler.
      const result = await generateValidatedChallenge({
        source: activeSource,
        focusTopic: focusTopic.trim() || undefined,
        steering: {
          // Abdeckung vor Vertiefung: offene Kapitel zuerst.
          coverTopics: coverage?.uncovered ?? [],
          excludeTopics,
          preferTopics,
        },
        recentQuestions: getRecentRecallQuestions(),
        generate: generateRecallChallenge,
      });
      if ('error' in result) {
        toast.error(result.error === 'focus' ? t('ar.focusFailed') : t('ar.duplicateFailed'));
        return;
      }
      if (!result.challenge || !result.challenge.question) throw new Error(t('ar.invalidResponse'));
      // Auch unbeantwortete Fragen merken, damit sie nicht identisch wiederkommen
      rememberRecallQuestion(result.challenge.question);
      setChallenge(result.challenge);
    } catch (e: any) {
      console.error('Recall Start Error:', e);
      toast.error(t('ar.challengeFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-Start (Feynman-Handoff aus dem Reader): wartet auf die asynchron gesetzte
  // Quelle UND die Kapitel-Erkennung, feuert dann genau einmal.
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (autoStart && activeSource && chaptersReady && !autoStartedRef.current) {
      autoStartedRef.current = true;
      startNewChallenge();
    }
  }, [activeSource, chaptersReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleEvaluate = async () => {
    if (!challenge || userAnswer.trim().length < 10 || !activeSource || isEvaluating) return;
    stopListening();
    setIsEvaluating(true);
    try {
      const res = await evaluateRecallResponse(challenge, userAnswer, activeSource, audience);
      setEvaluation(res);
      // Gespeichert wird das TATSÄCHLICH abgefragte Thema, nicht der Wunsch-Fokus.
      const usedTopic = resolveActualTopic(challenge, focusTopic, activeSourceName);
      const docName = activeSourceName || usedTopic;
      onComplete(res.score, usedTopic, res.missingPoints ?? [], docName);
      setSessionResults(prev => [{
        id: `session-${Date.now()}`, docName, topic: usedTopic, score: res.score,
        missingPoints: res.missingPoints ?? [], timestamp: Date.now(),
      }, ...prev]);
      if (activeDoc) {
        markTopicCovered(activeDoc.id, usedTopic);
        setCoverageBump(b => b + 1);
      }
    } catch (e: any) {
      console.error('Evaluation Error:', e);
      toast.error(t('ar.evalFailed'));
    } finally {
      setIsEvaluating(false);
    }
  };

  /** Feynman-Schritt 3+4: dieselbe Frage neu erklären, die Lücken des letzten Versuchs vor Augen. */
  const handleRetry = () => {
    if (!evaluation) return;
    setLastAttempt({
      score: evaluation.score,
      missingPoints: evaluation.missingPoints,
      unexplainedJargon: evaluation.unexplainedJargon ?? [],
      probeQuestion: evaluation.probeQuestion ?? '',
      answer: userAnswer,
    });
    setEvaluation(null);
    setUserAnswer('');
    setShowModelAnswer(false);
  };

  const handleNextDrill = () => {
    setChallenge(null);
    setEvaluation(null);
    setLastAttempt(null);
    startNewChallenge();
  };

  const wordCount = userAnswer.trim().split(/\s+/).filter(Boolean).length;
  const canSubmit = !isEvaluating && userAnswer.trim().length >= 10;
  const cardStyle: React.CSSProperties = { background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' };
  const primaryButtonStyle: React.CSSProperties = { background: 'var(--primary)', color: 'var(--primary-text)' };
  const microLabel = 'text-[11px] font-black uppercase tracking-[0.16em]';

  const sourceRow = (withCancel: boolean) => (
    <div className="flex items-center justify-between gap-3 px-1">
      <div className="flex items-center gap-2 min-w-0">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: 'var(--primary)' }} />
        <span className="text-[11px] font-black uppercase text-slate-400 tracking-widest truncate">{activeSourceName}</span>
      </div>
      {withCancel && (
        <button onClick={handleCancel} className="shrink-0 text-[11px] font-black uppercase text-slate-400 hover:text-rose-500 tracking-widest transition-colors">
          {t('quiz.cancel')}
        </button>
      )}
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto py-6 lg:py-10 px-4 space-y-8 animate-in fade-in duration-700 pb-32">

      {/* Feynman First-Visit-Intro */}
      {showFeynmanIntro && (
        <div className="relative rounded-[24px] p-6 animate-in slide-in-from-top-4 duration-500" style={{ background: 'color-mix(in srgb, var(--primary) 10%, var(--bg-sidebar))', border: '1px solid color-mix(in srgb, var(--primary) 30%, transparent)' }}>
          <button
            onClick={dismissFeynmanIntro}
            className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors font-black text-lg leading-none"
            aria-label={t('upl.close')}
          >×</button>
          <p className={`${microLabel} mb-2`} style={{ color: GOLD_TEXT }}>{t('nav.recall')}</p>
          <p className="text-sm font-medium leading-relaxed" style={{ color: 'var(--ink)' }}>{t('ar.introBody')}</p>
          <p className="text-[11px] font-black mt-3 italic" style={{ color: GOLD_TEXT }}>{t('ar.introItalic')}</p>
          <button
            onClick={dismissFeynmanIntro}
            className="mt-4 px-4 py-2 rounded-[14px] text-[11px] font-black uppercase tracking-widest transition-all hover:scale-105"
            style={primaryButtonStyle}
          >
            {t('ar.understood')}
          </button>
        </div>
      )}

      {!challenge ? (
        /* ── Phase 1: Quelle, Zielgruppe, Fokus, Start ── */
        <div className="space-y-7">
          <header className="space-y-2 text-center">
            <p className="text-[11px] font-black uppercase tracking-[0.2em]" style={{ color: GOLD_TEXT }}>{t('nav.recall')}</p>
            <h1 className="text-3xl lg:text-[40px] font-normal leading-tight" style={{ color: 'var(--ink)' }}>{t('ar.title')}</h1>
            <p className="text-sm lg:text-base" style={{ color: 'var(--text-secondary)' }}>{t('ar.subtitle')}</p>
          </header>

          {activeSource ? (
            <div className="rounded-[20px] p-5 flex items-center justify-between gap-4" style={cardStyle}>
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase text-slate-400 tracking-widest">{t('ar.activeSource')}</p>
                <p className="text-sm font-black break-words" style={{ color: 'var(--ink)' }}>{activeSourceName}</p>
                {coverage && coverage.total >= 2 && (
                  <p className="text-[11px] font-black uppercase tracking-widest mt-1" style={{ color: coverage.uncovered.length === 0 ? '#10b981' : GOLD_TEXT }}>
                    {coverage.uncovered.length === 0
                      ? t('ar.coverageDone')
                      : t('ar.coverageProgress', { covered: coverage.coveredCount, total: coverage.total })}
                  </p>
                )}
              </div>
              <button onClick={clearSource} aria-label={t('ex.remove')} className="shrink-0 text-slate-300 hover:text-rose-500 transition-colors font-black text-sm">✕</button>
            </div>
          ) : (
            <SourceSelector
              documents={moduleDocuments}
              collections={collections}
              onSelectDocument={handleSelectDocument}
              onSelectSource={(source, name, meta) => {
                setActiveSource(source);
                setActiveSourceName(name);
                setActiveDoc(null);
                setSourceRef(meta?.collectionId ? { kind: 'collection', id: meta.collectionId } : null);
              }}
              onSaveToLibrary={onSaveToLibrary}
              isLoading={isLoading}
              label={t('ar.chooseFocus')}
            />
          )}

          {activeSource && (
            <div className="space-y-6">
              {/* Zielgruppe: bestimmt, woran die Verständlichkeit gemessen wird */}
              <div className="space-y-2">
                <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">{t('ar.audienceLabel')}</p>
                <div role="radiogroup" aria-label={t('ar.audienceLabel')} className="flex gap-1 p-1 rounded-xl" style={{ background: 'color-mix(in srgb, var(--ink) 5.5%, transparent)' }}>
                  {AUDIENCES.map(a => (
                    <button
                      key={a}
                      role="radio"
                      aria-checked={audience === a}
                      onClick={() => chooseAudience(a)}
                      className="flex-1 min-h-[40px] px-2 rounded-lg text-[11px] font-semibold transition-all"
                      style={audience === a
                        ? { background: 'var(--ink)', color: 'var(--bg-sidebar)' }
                        : { color: 'color-mix(in srgb, var(--ink) 70%, transparent)' }}
                    >
                      {t((`ar.audience.${a}`) as TKey)}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] leading-snug" style={{ color: 'var(--text-secondary)' }}>{t((`ar.audienceHint.${audience}`) as TKey)}</p>
              </div>

              <div className="space-y-2">
                <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">{t('ar.focusTopic')}</p>
                <input
                  type="text"
                  value={focusTopic}
                  onChange={e => setFocusTopic(e.target.value)}
                  placeholder={t('ar.focusPlaceholder')}
                  className="w-full px-5 py-4 rounded-2xl text-base font-bold outline-none transition-all"
                  style={{ ...cardStyle, color: 'var(--text-main)' }}
                />
              </div>

              {gapEntries.length > 0 && (
                <div className="space-y-2">
                  <p className="flex items-baseline gap-2">
                    <span className={microLabel} style={{ color: GOLD_TEXT }}>{t('ar.gapsTitle')}</span>
                    <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{t('ar.gapsSubtitle')}</span>
                  </p>
                  {gapEntries.map(g => {
                    const selected = norm(focusTopic) === norm(g.topic);
                    return (
                      <button
                        key={g.topic}
                        onClick={() => setFocusTopic(selected ? '' : g.topic)}
                        aria-pressed={selected}
                        className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl text-left transition-all hover:opacity-80"
                        style={{
                          background: selected ? 'color-mix(in srgb, var(--primary) 10%, var(--bg-sidebar))' : 'var(--bg-sidebar)',
                          borderTop: '1px solid var(--border-color)',
                          borderRight: '1px solid var(--border-color)',
                          borderBottom: '1px solid var(--border-color)',
                          borderLeft: `3px solid ${g.strong ? STRONG_GAP : MILD_GAP}`,
                        }}
                      >
                        <span className="min-w-0">
                          <span className="block text-xs font-black truncate" style={{ color: 'var(--ink)' }}>{g.topic}</span>
                          <span className="block text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>{g.reason}</span>
                        </span>
                        <span className="text-[11px] font-black shrink-0 whitespace-nowrap" style={{ color: GOLD_TEXT }}>
                          {selected ? '✓' : t('ar.gap.pick')}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="text-center">
            <button
              onClick={startNewChallenge}
              disabled={isLoading || !activeSource || (autoStart && !chaptersReady)}
              className="w-full sm:w-auto px-10 py-4 rounded-[20px] font-black uppercase tracking-[0.2em] text-[11px] shadow-3d-deep hover:scale-105 transition-all disabled:opacity-40 disabled:hover:scale-100"
              style={primaryButtonStyle}
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 rounded-full animate-spin" style={{ borderColor: 'color-mix(in srgb, var(--primary-text) 30%, transparent)', borderTopColor: 'var(--primary-text)' }} />
                  {t('ar.generating')}
                </span>
              ) : (
                <span>{t('ar.startDrill')}</span>
              )}
            </button>
          </div>
        </div>

      ) : !evaluation ? (
        /* ── Phase 2: erklären ── */
        <div className="space-y-5 animate-in slide-in-from-bottom-6">
          {sourceRow(true)}

          <div className="rounded-[28px] p-7 lg:p-10 shadow-3d-deep" style={{ background: 'var(--ink)', color: 'var(--bg-sidebar)' }}>
            <p className={`${microLabel} mb-3`} style={{ opacity: 0.65 }}>{t((`ar.explainingTo.${audience}`) as TKey)}</p>
            <p className="text-lg lg:text-2xl font-semibold leading-snug">{stripFeynmanMeta(challenge.question)}</p>
          </div>

          {lastAttempt && (
            <div className="rounded-[20px] p-5 space-y-3" style={{ background: 'color-mix(in srgb, var(--primary) 8%, var(--bg-sidebar))', border: '1px solid color-mix(in srgb, var(--primary) 30%, transparent)' }}>
              <div className="flex items-center justify-between gap-3">
                <p className={microLabel} style={{ color: GOLD_TEXT }}>{t('ar.lastTimeTitle', { score: lastAttempt.score })}</p>
                {lastAttempt.answer.trim() && (
                  <button onClick={() => setUserAnswer(lastAttempt.answer)} className="shrink-0 text-[11px] font-black hover:opacity-70 transition-opacity" style={{ color: GOLD_TEXT }}>
                    {t('ar.useLastAnswer')}
                  </button>
                )}
              </div>
              {lastAttempt.missingPoints.length > 0 && (
                <ul className="space-y-1.5">
                  {lastAttempt.missingPoints.slice(0, 4).map((m, i) => (
                    <li key={i} className="flex gap-2 items-start text-xs font-semibold" style={{ color: 'var(--ink)' }}>
                      <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: STRONG_GAP }} />
                      {m}
                    </li>
                  ))}
                </ul>
              )}
              {lastAttempt.unexplainedJargon.length > 0 && (
                <p className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>{t('ar.lastTimeJargon', { terms: lastAttempt.unexplainedJargon.join(', ') })}</p>
              )}
              {lastAttempt.probeQuestion && (
                <p className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>{t('ar.lastTimeProbe', { q: lastAttempt.probeQuestion })}</p>
              )}
            </div>
          )}

          <div className="space-y-3">
            <div className="relative">
              <textarea
                autoFocus
                value={userAnswer}
                onChange={e => setUserAnswer(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleEvaluate(); } }}
                placeholder={t('ar.answerPlaceholder')}
                disabled={isEvaluating}
                className="w-full h-64 lg:h-72 p-6 lg:p-8 pb-16 rounded-[28px] outline-none transition-all text-sm lg:text-base font-medium leading-relaxed disabled:opacity-40"
                style={{ background: 'var(--bg-sidebar)', border: isListening ? '2px solid var(--primary)' : '1px solid var(--border-color)', color: 'var(--text-main)' }}
              />
              {hasSpeechApi ? (
                <button
                  type="button"
                  onClick={toggleListening}
                  disabled={isEvaluating}
                  aria-pressed={isListening}
                  aria-label={isListening ? t('ar.stopRecording') : t('ar.startDictation')}
                  title={isListening ? t('ar.stopRecording') : t('ar.startDictation')}
                  className={`absolute bottom-4 right-4 w-11 h-11 rounded-full flex items-center justify-center transition-all shadow-lg ${isListening ? 'bg-rose-500 text-white animate-pulse' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
                >
                  {isListening ? <Square size={15} fill="currentColor" /> : <Mic size={17} strokeWidth={2} />}
                </button>
              ) : (
                <div className="absolute bottom-4 right-4 w-11 h-11 rounded-full flex items-center justify-center bg-slate-100 dark:bg-slate-800 opacity-40" title={t('ar.dictationUnsupported')}>
                  <MicOff size={17} strokeWidth={2} />
                </div>
              )}
            </div>
            {isListening && (
              <p className="text-[11px] font-black uppercase tracking-widest text-center animate-pulse" style={{ color: GOLD_TEXT }}>{t('ar.recordingNow')}</p>
            )}
            {interim && (
              <p className="text-sm italic px-2" style={{ color: 'var(--text-secondary)' }}>{interim} …</p>
            )}
            {!hasSpeechApi && (
              <p className="text-[11px] font-semibold text-center" style={{ color: 'var(--text-secondary)' }}>{t('ar.dictationUnsupported')}</p>
            )}
            <div className="flex flex-col sm:flex-row justify-between items-center gap-3 px-2">
              <span className="text-[11px] font-black uppercase tracking-widest order-2 sm:order-1 text-slate-400">
                {t('ar.wordsN', { n: wordCount })} · {t('ar.submitShortcut')}
                {userAnswer.length > 3000 && (
                  <span className="block mt-1 text-amber-500 normal-case font-bold">{t('ar.truncationHint')}</span>
                )}
              </span>
              <button
                onClick={handleEvaluate}
                disabled={!canSubmit}
                className="w-full sm:w-auto px-10 py-3.5 rounded-2xl font-black uppercase text-[11px] tracking-widest shadow-lg hover:scale-105 transition-all disabled:opacity-40 disabled:hover:scale-100 order-1 sm:order-2 flex items-center justify-center gap-2"
                style={primaryButtonStyle}
              >
                {isEvaluating ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 rounded-full animate-spin" style={{ borderColor: 'color-mix(in srgb, var(--primary-text) 30%, transparent)', borderTopColor: 'var(--primary-text)' }} />
                    <span>{t('ar.analyzing')}</span>
                  </>
                ) : (
                  <span>{t('ar.submitAnswer')}</span>
                )}
              </button>
            </div>
          </div>

          {isEvaluating && (
            <div className="rounded-[20px] p-5 text-center animate-in fade-in duration-300" style={cardStyle}>
              <p className="text-[11px] font-black uppercase text-slate-400 tracking-widest">{t('ar.checkingDoc')}</p>
            </div>
          )}
        </div>

      ) : (
        /* ── Phase 3: Ergebnis ── */
        <div className="space-y-5 animate-in zoom-in-95 duration-500">
          {sourceRow(false)}

          <div className={`grid grid-cols-1 gap-4 ${evaluation.clarity !== undefined ? 'sm:grid-cols-2' : ''}`}>
            <div className="p-7 rounded-[24px] flex flex-col items-center justify-center text-center" style={cardStyle}>
              <span className="text-[11px] font-black uppercase text-slate-400 tracking-widest mb-2">{t('ar.understanding')}</span>
              <span className={`text-5xl font-black ${scoreColor(evaluation.score)}`} style={evaluation.score >= 61 && evaluation.score < 86 ? { color: GOLD_TEXT } : undefined}>
                {evaluation.score}%
              </span>
              <span className="text-[11px] font-black uppercase tracking-widest mt-2 text-slate-400">
                {evaluation.score >= 86 ? t('ar.rExcellent') : evaluation.score >= 61 ? t('fc.good') : evaluation.score >= 31 ? t('ar.rBasic') : t('ar.rRepeat')}
              </span>
            </div>
            {evaluation.clarity !== undefined && (
              <div className="p-7 rounded-[24px] flex flex-col items-center justify-center text-center" style={cardStyle}>
                <span className="text-[11px] font-black uppercase text-slate-400 tracking-widest mb-2">
                  {t('ar.clarity')} · {t((`ar.audience.${audience}`) as TKey)}
                </span>
                <span className={`text-5xl font-black ${scoreColor(evaluation.clarity)}`} style={evaluation.clarity >= 61 && evaluation.clarity < 86 ? { color: GOLD_TEXT } : undefined}>
                  {evaluation.clarity} / 100
                </span>
                {evaluation.usedExample !== undefined && audience !== 'exam' && (
                  <span className="text-[11px] font-black uppercase tracking-widest mt-2" style={{ color: evaluation.usedExample ? '#10b981' : 'var(--text-secondary)' }}>
                    {evaluation.usedExample ? t('ar.exampleUsed') : t('ar.exampleMissing')}
                  </span>
                )}
              </div>
            )}
          </div>

          {lastAttempt && (
            <p className="text-center text-[11px] font-black uppercase tracking-widest">
              <span className="text-slate-400">{t('ar.delta', { prev: lastAttempt.score, now: evaluation.score })}</span>
              {evaluation.score !== lastAttempt.score && (
                <span className={`ml-2 ${evaluation.score > lastAttempt.score ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {evaluation.score > lastAttempt.score ? '+' : ''}{evaluation.score - lastAttempt.score}
                </span>
              )}
            </p>
          )}

          <div className="p-7 rounded-[24px]" style={{ background: 'var(--ink)', color: 'var(--bg-sidebar)' }}>
            <p className={`${microLabel} mb-2`} style={{ opacity: 0.65 }}>{t('ar.feedback')}</p>
            <p className="text-base lg:text-lg font-medium leading-relaxed">{evaluation.feedback}</p>
          </div>

          {/* Die Nachfrage: was die Zielgruppe an der schwächsten Stelle fragen würde */}
          {evaluation.probeQuestion && (
            <div
              className="rounded-[20px] p-5 flex flex-col sm:flex-row sm:items-center gap-4"
              style={{ background: 'var(--bg-sidebar)', borderTop: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', borderBottom: '1px solid var(--border-color)', borderLeft: '3px solid var(--primary)' }}
            >
              <div className="flex-1 min-w-0">
                <p className={microLabel} style={{ color: GOLD_TEXT }}>{t('ar.probeTitle')}</p>
                <p className="text-sm lg:text-base font-semibold mt-1 break-words" style={{ color: 'var(--ink)' }}>„{evaluation.probeQuestion}"</p>
              </div>
              <button onClick={handleRetry} className="shrink-0 px-5 py-3 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all hover:scale-105" style={primaryButtonStyle}>
                {t('ar.probeRetry')}
              </button>
            </div>
          )}

          {evaluation.coveredKeywords && challenge.expectedKeywords.length > 0 && (
            <div className="rounded-[20px] p-5 space-y-3" style={cardStyle}>
              <div className="flex items-baseline justify-between gap-3">
                <p className={microLabel} style={{ color: GOLD_TEXT }}>{t('ar.keywordsTitle')}</p>
                <p className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  {t('ar.keywordsCovered', { covered: evaluation.coveredKeywords.length, total: challenge.expectedKeywords.length })}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {challenge.expectedKeywords.map(k => {
                  const covered = evaluation.coveredKeywords!.includes(k);
                  return (
                    <span
                      key={k}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-bold"
                      style={covered
                        ? { background: 'color-mix(in srgb, #10b981 12%, transparent)', color: '#059669', border: '1px solid color-mix(in srgb, #10b981 35%, transparent)' }
                        : { color: 'var(--text-secondary)', border: '1px dashed var(--border-color)' }}
                    >
                      {covered ? '✓ ' : ''}{k}
                    </span>
                  );
                })}
              </div>
              {evaluation.unexplainedJargon && evaluation.unexplainedJargon.length > 0 && (
                <div className="pt-3 space-y-2" style={{ borderTop: '1px solid var(--border-color)' }}>
                  <p className={microLabel} style={{ color: '#b45309' }}>{t('ar.jargonTitle')}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {evaluation.unexplainedJargon.map(j => (
                      <span key={j} className="px-2.5 py-1 rounded-lg text-[11px] font-bold" style={{ background: 'color-mix(in srgb, #f59e0b 12%, transparent)', color: '#b45309' }}>{j}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-6 rounded-[20px]" style={cardStyle}>
              <p className={`${microLabel} text-emerald-600 mb-3`}>{t('ar.goodApproaches')}</p>
              {evaluation.strengths.length > 0 ? (
                <ul className="space-y-2">
                  {evaluation.strengths.map((s, i) => (
                    <li key={i} className="flex gap-3 items-start">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                      <p className="text-xs font-semibold leading-normal" style={{ color: 'var(--ink)' }}>{s}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-slate-400 italic">{t('ar.noStrengths')}</p>
              )}
            </div>
            <div className="p-6 rounded-[20px]" style={cardStyle}>
              <p className={`${microLabel} text-rose-600 mb-3`}>{t('ar.gapsIdentified')}</p>
              {evaluation.missingPoints.length > 0 ? (
                <>
                  <ul className="space-y-2">
                    {evaluation.missingPoints.map((m, i) => (
                      <li key={i} className="flex gap-3 items-start">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-400 mt-1.5 shrink-0" />
                        <p className="text-xs font-semibold leading-normal" style={{ color: 'var(--ink)' }}>{m}</p>
                      </li>
                    ))}
                  </ul>
                  {onCreateCardsFromGaps && (
                    <button
                      onClick={handleCreateGapCards}
                      disabled={creatingGapCards}
                      className="mt-4 w-full py-3 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all hover:scale-[1.02] disabled:opacity-60 disabled:hover:scale-100"
                      style={{ background: 'color-mix(in srgb, var(--primary) 12%, transparent)', color: GOLD_TEXT, border: '1px solid color-mix(in srgb, var(--primary) 30%, transparent)' }}
                    >
                      {creatingGapCards ? t('ar.creatingGapCards') : t('ar.saveGapsAsCards')}
                    </button>
                  )}
                </>
              ) : (
                <p className="text-xs text-emerald-600 font-semibold">{t('ar.noGaps')}</p>
              )}
            </div>
          </div>

          {/* Musterlösung: der ohnehin generierte conceptContext, auf Abruf */}
          {challenge.conceptContext && (
            <div className="p-6 rounded-[20px] space-y-4" style={cardStyle}>
              <button
                onClick={() => setShowModelAnswer(v => !v)}
                className={`w-full flex items-center justify-between ${microLabel}`}
                style={{ color: GOLD_TEXT }}
                aria-expanded={showModelAnswer}
              >
                <span>{showModelAnswer ? t('ar.hideModelAnswer') : t('ar.showModelAnswer')}</span>
                <span className="font-black">{showModelAnswer ? '−' : '+'}</span>
              </button>
              {showModelAnswer && (
                <p className="text-sm font-medium leading-relaxed animate-in fade-in duration-300" style={{ color: 'var(--ink2)' }}>{challenge.conceptContext}</p>
              )}
            </div>
          )}

          <div className="p-7 rounded-[24px] space-y-5" style={{ background: 'var(--bg-sidebar)', border: '1px dashed var(--border-color)' }}>
            {evaluation.suggestedReview && (
              <div className="space-y-1.5 text-center">
                <p className={microLabel} style={{ color: GOLD_TEXT }}>{t('ar.learningRec')}</p>
                <p className="text-sm lg:text-base font-bold leading-relaxed max-w-2xl mx-auto" style={{ color: 'var(--ink)' }}>{evaluation.suggestedReview}</p>
              </div>
            )}
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={handleRetry}
                className="px-8 py-3 rounded-xl font-black uppercase text-[11px] tracking-widest transition-all hover:scale-105"
                style={{ background: 'color-mix(in srgb, var(--primary) 12%, transparent)', color: GOLD_TEXT, border: '1px solid color-mix(in srgb, var(--primary) 30%, transparent)' }}
              >
                {t('ar.retrySame')}
              </button>
              <button
                onClick={handleNextDrill}
                className="px-8 py-3 rounded-xl font-black uppercase text-[11px] tracking-widest shadow-lg hover:scale-105 transition-all"
                style={primaryButtonStyle}
              >
                {t('ar.nextDrill')}
              </button>
              <button
                onClick={handleCancel}
                className="px-8 py-3 rounded-xl font-black uppercase text-[11px] tracking-widest transition-all text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                style={{ border: '1px solid var(--border-color)' }}
              >
                {t('ar.otherDoc')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
