
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ProcessedDocument, Collection, RecallChallenge, RecallEvaluation } from '../types';
import type { GenerationSource } from '../services/geminiService';
import { evaluateRecallResponse, generateRecallChallenge } from '../services/geminiService';
import { generateValidatedChallenge, resolveActualTopic } from '../services/recallChallengeGuard';
import { getRecentRecallQuestions, rememberRecallQuestion } from '../services/recallQuestionDedup';
import { useTranslation } from '../i18n/I18nProvider';
import { localeTag } from '../i18n';
import type { TKey } from '../i18n';
import { GeneratedImage } from './GeneratedImage';
import { SourceSelector } from './SourceSelector';
import { toast } from '../services/toast';
import { documentDisplayName } from '../services/libraryService';
import { buildRealTopicMastery } from '../services/learningProfileService';
import { buildCollectionSource } from '../services/collectionSource';
import { rankTopicsForNextChallenge } from '../services/recallGaps';
import { getCoverage, markTopicCovered } from '../services/recallCoverageService';
import { detectChaptersForDoc, type Chapter } from '../services/chapterService';
import { getDoneChapterIndices } from '../services/chapterProgressService';
import { useModuleScopedActivity } from '../hooks/useModuleScopedActivity';

const EMPTY_DISMISSED = new Set<string>();

interface ActiveRecallProps {
  availableDocuments: ProcessedDocument[];
  collections: Collection[];
  getDocumentSource?: (doc: ProcessedDocument) => GenerationSource;
  onSaveToLibrary?: (file: File) => void;
  onComplete: (score: number, topic: string, missingPoints: string[]) => void;
  /** Erstellt Karteikarten aus den identifizierten Lücken (wird in AppContent verdrahtet). */
  onCreateCardsFromGaps?: (topic: string, points: string[]) => void;
  initialDoc?: ProcessedDocument;
  /** Themen-Vorbelegung, z.B. aus dem Split-Screen-Reader-Handoff. */
  initialFocusTopic?: string;
  /** Startet die Herausforderung automatisch, sobald die Quelle gesetzt ist — kein manueller Klick nötig. */
  autoStart?: boolean;
  /** Aktives Fach aus der Sidebar (Bug-Fix 2026-09-10) — die Quellen-Auswahl
   *  zeigte bisher alle Dokumente kontoweit statt nur die des gewählten Fachs.
   *  null/undefined = "Alle Fächer", keine Einschränkung. */
  activeModuleId?: string | null;
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
}) => {
  const { t } = useTranslation();
  const moduleDocuments = useMemo(
    () => activeModuleId ? availableDocuments.filter(d => d.collectionId === activeModuleId) : availableDocuments,
    [availableDocuments, activeModuleId],
  );
  const activeModuleCollection = useMemo(
    () => activeModuleId ? collections.find(c => c.id === activeModuleId) ?? null : null,
    [collections, activeModuleId],
  );
  // Bug-Fix 2026-09-10: Themen-Vorschläge UND die Auswahl des nächsten Drill-
  // Themas (unten, rankTopicsForNextChallenge) bezogen sich bisher auf die
  // GESAMTE Historie — bei aktivem Fach konnte ein Bio-Thema als Drill für
  // "Allgemeine 1" vorgeschlagen werden. Gleiches Muster wie GapRadar/Dashboard.
  const { quizResults: moduleQuizResults, examResults: moduleExamResults, recallResults: moduleRecallResults } =
    useModuleScopedActivity(activeModuleCollection, availableDocuments, EMPTY_DISMISSED);
  const [activeSource, setActiveSource] = useState<GenerationSource | null>(null);
  const [activeSourceName, setActiveSourceName] = useState('');
  /** Gesetzt nur bei Einzeldokument-Quellen — Basis für die Themen-Abdeckung. */
  const [activeDoc, setActiveDoc] = useState<ProcessedDocument | null>(null);
  const [coverageBump, setCoverageBump] = useState(0);
  const [focusTopic, setFocusTopic] = useState(initialFocusTopic ?? '');

  // Schwache echte Themen als Fokus-Vorschläge (gleiche Quelle wie der Lern-Coach),
  // bei aktivem Fach auf dessen Historie beschränkt (moduleQuizResults/-exam/-recall).
  const topicSuggestions = useMemo(() =>
    buildRealTopicMastery(moduleQuizResults, moduleExamResults, moduleRecallResults)
      .filter(t => t.security !== 'sicher')
      .slice(0, 5),
  [moduleQuizResults, moduleExamResults, moduleRecallResults]);
  const [challenge, setChallenge] = useState<RecallChallenge | null>(null);
  const [userAnswer, setUserAnswer] = useState('');
  const [evaluation, setEvaluation] = useState<RecallEvaluation | null>(null);
  const [showModelAnswer, setShowModelAnswer] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [showFeynmanIntro, setShowFeynmanIntro] = useState(() =>
    !localStorage.getItem('studearc_feynman_intro_done')
  );
  const [isListening, setIsListening] = useState(false);
  const speechRef = useRef<any>(null);
  const hasSpeechApi = typeof window !== 'undefined' && !!(
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  );

  useEffect(() => {
    if (initialDoc && getDocumentSource) {
      try {
        setActiveSource(getDocumentSource(initialDoc));
        setActiveSourceName(documentDisplayName(initialDoc));
        setActiveDoc(initialDoc);
      } catch (_) {}
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
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Spracherkennung beim Verlassen stoppen — sonst läuft das Mikrofon weiter
  useEffect(() => () => { try { speechRef.current?.stop(); } catch {} }, []);

  const handleSelectDocument = async (doc: ProcessedDocument) => {
    const source = getDocumentSource
      ? getDocumentSource(doc)
      : doc.type === 'pdf'
        ? { file: { data: doc.content, mimeType: 'application/pdf' } }
        : { text: doc.content };
    setActiveSource(source);
    setActiveSourceName(documentDisplayName(doc));
    setActiveDoc(doc);
  };

  // Kapitel des aktiven Dokuments (Text/DOCX direkt per Regex, PDF per echter
  // Seiten-Layout-/Gliederungs-Erkennung, sonst Digest als Fallback) — volles
  // Chapter-Objekt (nicht nur Titel), damit sich unten der Lesefortschritt
  // zuordnen lässt (startPage/endPage bei PDFs, sonst Kapitel-Index).
  const [chapters, setChapters] = useState<Chapter[]>([]);
  // Für welche Dokument-ID die (async) Kapitel-Erkennung zuletzt abgeschlossen
  // wurde — bewusst NICHT als eigenständiges Boolean-State geführt: ein Boolean,
  // das der Effekt selbst auf true/false setzt, hätte in dem Render, in dem
  // activeDoc gerade erst von null auf das echte Dokument wechselt, kurzzeitig
  // noch den veralteten "true"-Wert vom vorherigen (doc-losen) Render — genau in
  // diesem einen Zwischen-Render liest der autoStart-Effekt unten (der VOR dem
  // Kapitel-Effekt in der Update-Reihenfolge steht) den Wert noch aus der
  // Render-Closure und würde fälschlich zu früh feuern (Reader-Handoff-Race,
  // 2026-09-08 live gemeldet). Als reiner Ableitungswert pro Render (Vergleich
  // mit activeDoc.id) gibt es diesen Zwischenzustand nicht.
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

  // Lesefortschritt (0-basierte Seiten-/Kapitel-Indices aus dem Reader,
  // s. chapterProgressService.ts — per Button manuell markiert, verlässliches
  // Signal). Wird nur beim Dokumentwechsel neu gelesen: der Reader und
  // Feynman laufen nie gleichzeitig in derselben Session, ein Live-Sync
  // während einer offenen Feynman-Session ist daher nicht nötig.
  const doneChapterIndices = useMemo(
    () => (activeDoc ? getDoneChapterIndices(activeDoc.id) : []),
    [activeDoc]
  );

  // Root-Cause-Fix (2026-09-08): Feynman darf nur Themen aus TATSÄCHLICH
  // gelesenen Kapiteln als reguläre Coverage-Vorschläge verwenden — vorher
  // wurde jedes Kapitel/jede Seite unabhängig vom Lesefortschritt als
  // "uncovered"/vorschlagbar behandelt (recallCoverageService.ts kennt den
  // Lesefortschritt strukturell nicht, s. Analysebericht). Bei PDFs mit
  // Seiten-Zuordnung (startPage/endPage, s. pdfOutlineService.ts) wird ein
  // Kapitel als gelesen gewertet, sobald mindestens eine seiner Seiten
  // markiert wurde — startPage/endPage sind dort 1-basiert, doneChapterIndices
  // 0-basiert, daher +1 beim Abgleich. Ohne Seiten-Zuordnung (Text/DOCX, oder
  // der zeilenbasierte PDF-Dense-Fallback ohne Seiten-Tracking) wird auf den
  // Kapitel-Index zurückgefallen — bei Text/DOCX exakt (Reader nutzt dieselbe
  // Erkennung), beim PDF-Dense-Fallback nur eine Näherung (dokumentierte
  // Einschränkung, s. Analysebericht — dort existiert noch kein Seiten-Tracking).
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

  // WICHTIG: coverage basiert jetzt NUR NOCH auf gelesenen Kapiteln —
  // coverage.uncovered ist dadurch bereits exakt "gelesen UND noch nicht per
  // Feynman abgefragt" (die eligibleTopics-Formel), ohne dass die Aufrufstelle
  // unten (startNewChallenge) geändert werden musste.
  const coverage = useMemo(
    () => (activeDoc ? getCoverage(activeDoc.id, readChapterTitles) : null),
    [activeDoc, readChapterTitles, coverageBump]
  );

  const handleCancel = () => {
    setChallenge(null);
    setEvaluation(null);
    setUserAnswer('');
  };

  const dismissFeynmanIntro = () => {
    localStorage.setItem('studearc_feynman_intro_done', '1');
    setShowFeynmanIntro(false);
  };

  const toggleListening = useCallback(() => {
    if (!hasSpeechApi) return;
    if (isListening) {
      speechRef.current?.stop();
      setIsListening(false);
      return;
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = localeTag();
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e: any) => {
      const transcript = Array.from(e.results as SpeechRecognitionResultList)
        .slice(e.resultIndex)
        .map((r: any) => r[0].transcript)
        .join('');
      setUserAnswer(prev => prev ? prev + ' ' + transcript : transcript);
    };
    rec.onerror = (e: any) => {
      setIsListening(false);
      // Verweigertes Mikrofon sonst = scheinbar kaputter Button
      if (e?.error === 'not-allowed' || e?.error === 'service-not-allowed' || e?.error === 'audio-capture') {
        toast.error(t('ar.micDenied'));
      }
    };
    rec.onend = () => setIsListening(false);
    speechRef.current = rec;
    rec.start();
    setIsListening(true);
  }, [hasSpeechApi, isListening, t]);

  const startNewChallenge = async () => {
    if (!activeSource) return;
    setIsLoading(true);
    setEvaluation(null);
    setUserAnswer('');
    setShowModelAnswer(false);
    try {
      // Informierte Themenwahl: nie erfolgreich erklärte / häufig falsch
      // beantwortete / kürzlich gescheiterte Themen bevorzugen (in dieser
      // Reihenfolge), nur kürzlich ERFOLGREICH gemeisterte Themen kurz aussetzen
      // (services/recallGaps.ts — Kernstück des kontinuierlichen Lernzyklus:
      // ein gerade schlecht erklärtes Thema soll HÄUFIGER wiederkehren, nicht
      // seltener). Quell-/Dateinamen (Alt-Einträge ohne echtes Thema) fliegen
      // vorher raus, sonst würden sie fälschlich als Thema mitgezählt.
      const dropNames = new Set(
        [activeSourceName, ...availableDocuments.map(d => documentDisplayName(d))].map(n => n.trim().toLowerCase())
      );
      const relevantResults = moduleRecallResults.filter(r => !dropNames.has((r.topic ?? '').trim().toLowerCase()));
      const { preferTopics, excludeTopics } = rankTopicsForNextChallenge(
        topicSuggestions.map(s => s.topic),
        relevantResults,
      );
      // Guard-Orchestrierung (recallChallengeGuard.ts): deterministische
      // Fokus-Validierung + Frage-Dedup, EINE Regeneration bei Verstoß,
      // danach sauberer Fehler — kein blindes Vertrauen in Prompt-Befolgung
      // (Live-Fund 2026-08-22: Fokus "Extinktion" wurde ignoriert).
      const result = await generateValidatedChallenge({
        source: activeSource,
        focusTopic: focusTopic.trim() || undefined,
        steering: {
          // Abdeckung vor Vertiefung: offene Kapitel zuerst — sind alle einmal
          // durch, übernimmt die adaptive Steuerung (Ausschluss + Schwächen).
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
      // Ausgelieferte Frage für künftige Dedup merken (auch bei Abbruch —
      // eine unbeantwortete Challenge soll nicht identisch nachkommen).
      rememberRecallQuestion(result.challenge.question);
      setChallenge(result.challenge);
    } catch (e: any) {
      console.error('Recall Start Error:', e);
      toast.error(t('ar.challengeFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-Start (z.B. Feynman-Handoff aus dem Reader): activeSource wird erst
  // asynchron im Mount-Effekt gesetzt — dieser Effekt wartet darauf und feuert
  // dann genau einmal, statt startNewChallenge() direkt beim Mount aufzurufen
  // (activeSource wäre dort noch null → Race). Wartet zusätzlich auf
  // chaptersReady, sonst würde genau der Reader-Handoff-Fall (immer mit
  // activeDoc) die allererste Challenge ohne Lesefortschritt-Grenze (Fix 2)
  // generieren.
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (autoStart && activeSource && chaptersReady && !autoStartedRef.current) {
      autoStartedRef.current = true;
      startNewChallenge();
    }
  }, [activeSource, chaptersReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleEvaluate = async () => {
    if (!challenge || !userAnswer.trim() || !activeSource) return;
    setIsEvaluating(true);
    try {
      const res = await evaluateRecallResponse(challenge, userAnswer, activeSource);
      setEvaluation(res);
      // BUG-2-Fix (Live-Fund 2026-08-22): Das gespeicherte Topic ist das
      // TATSÄCHLICH abgefragte Thema (strukturiertes topic-Feld der KI-Antwort),
      // NICHT der gewünschte Fokus — sonst landet "Extinktion" in der History,
      // obwohl "Behaviorismus" gefragt wurde, und Cooldown/Dedup greifen ins Leere.
      const usedTopic = resolveActualTopic(challenge, focusTopic, activeSourceName);
      onComplete(res.score, usedTopic, res.missingPoints ?? []);
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

  return (
    <div className="max-w-4xl mx-auto py-6 lg:py-10 px-4 space-y-8 lg:space-y-10 animate-in fade-in duration-700 pb-32">

      {/* Feynman First-Visit-Intro */}
      {showFeynmanIntro && (
        <div className="relative rounded-[24px] p-6 animate-in slide-in-from-top-4 duration-500" style={{ background: 'color-mix(in srgb, var(--primary) 10%, var(--bg-sidebar))', border: '1px solid color-mix(in srgb, var(--primary) 30%, transparent)' }}>
          <button
            onClick={dismissFeynmanIntro}
            className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors font-black text-lg leading-none"
            aria-label={t('upl.close')}
          >×</button>
          <p className="text-[9px] font-black uppercase tracking-widest mb-2" style={{ color: 'var(--primary)' }}>{t('nav.recall')}</p>
          <p className="text-sm font-medium dark:text-white leading-relaxed">
            {t('ar.introBody')}
          </p>
          <p className="text-[11px] font-black mt-3 italic" style={{ color: 'var(--primary)' }}>
            {t('ar.introItalic')}
          </p>
          <button
            onClick={dismissFeynmanIntro}
            className="mt-4 px-4 py-2 rounded-[14px] text-[10px] font-black uppercase tracking-widest transition-all hover:scale-105"
            style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
          >
            {t('ar.understood')}
          </button>
        </div>
      )}

      {/* Header */}
      <div className="text-center space-y-3">
        <h1 className="text-4xl lg:text-6xl font-black text-slate-900 dark:text-white tracking-tighter flex items-center justify-center gap-3">
          {t('ar.headerPre')}<span style={{ color: 'var(--primary)' }}>{t('ar.headerAccent')}</span>
          <GeneratedImage prompt="Human brain active recall, academic illustration" className="w-8 h-8 lg:w-12 lg:h-12 rounded-xl" />
        </h1>
        <p className="text-base text-slate-500 dark:text-slate-400 font-medium opacity-80">{t('ar.subtitle')}</p>
      </div>

      {/* ── Phase 1: Quellenauswahl + Start ── */}
      {!challenge ? (
        <div className="space-y-6">
          {activeSource ? (
            <div className="rounded-[32px] p-6 flex items-center justify-between shadow-3d-raised" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}>
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-indigo-500 shrink-0" />
                <div>
                  <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">{t('ar.activeSource')}</p>
                  <p className="text-sm font-black dark:text-white break-words max-w-xs">{activeSourceName}</p>
                  {coverage && coverage.total >= 2 && (
                    <p className="text-[9px] font-black uppercase tracking-widest mt-1" style={{ color: coverage.uncovered.length === 0 ? '#10b981' : 'var(--primary)' }}>
                      {coverage.uncovered.length === 0
                        ? t('ar.coverageDone')
                        : t('ar.coverageProgress', { covered: coverage.coveredCount, total: coverage.total })}
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={() => { setActiveSource(null); setActiveSourceName(''); setActiveDoc(null); }}
                className="text-slate-300 hover:text-rose-500 transition-colors font-black text-sm"
              >✕</button>
            </div>
          ) : (
            <SourceSelector
              documents={moduleDocuments}
              collections={collections}
              onSelectDocument={handleSelectDocument}
              onSelectSource={(source, name) => { setActiveSource(source); setActiveSourceName(name); setActiveDoc(null); }}
              onSaveToLibrary={onSaveToLibrary}
              isLoading={isLoading}
              label={t('ar.chooseFocus')}
            />
          )}

          {/* Fokus-Thema (optional) + Vorschläge aus dem Lernprofil */}
          {activeSource && (
            <div className="space-y-3">
              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('ar.focusTopic')}</p>
                <input
                  type="text"
                  value={focusTopic}
                  onChange={e => setFocusTopic(e.target.value)}
                  placeholder={t('ar.focusPlaceholder')}
                  className="w-full px-5 py-4 rounded-2xl text-base font-bold outline-none transition-all"
                  style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)', color: 'var(--text-main)' }}
                />
              </div>
              {topicSuggestions.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {topicSuggestions.map(ts => (
                    <button
                      key={ts.topic}
                      onClick={() => setFocusTopic(ts.topic)}
                      className="px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all hover:opacity-80"
                      style={{
                        background: `color-mix(in srgb, ${ts.security === 'kritisch' ? '#f43f5e' : '#f59e0b'} 10%, var(--bg-sidebar))`,
                        color: ts.security === 'kritisch' ? '#f43f5e' : '#f59e0b',
                        border: `1px solid color-mix(in srgb, ${ts.security === 'kritisch' ? '#f43f5e' : '#f59e0b'} 25%, transparent)`,
                      }}
                    >
                      {ts.topic} · {t((`sec.${ts.security}`) as TKey)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="text-center">
            <button
              onClick={startNewChallenge}
              disabled={isLoading || !activeSource || (autoStart && !chaptersReady)}
              className="w-full sm:w-auto px-8 lg:px-10 py-4 lg:py-5 rounded-[24px] font-black uppercase tracking-[0.2em] text-[10px] lg:text-[11px] shadow-3d-deep hover:scale-105 transition-all disabled:opacity-40"
              style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
            >
              {isLoading ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin"></div>
                  {t('ar.generating')}
                </div>
              ) : (
                <span className="flex items-center gap-2">
                  {t('ar.startDrill')}
                  <GeneratedImage prompt="Sparkles icon, minimalist" className="w-4 h-4 rounded-full" />
                </span>
              )}
            </button>
          </div>
        </div>

      ) : !evaluation ? (
        /* ── Phase 2: Challenge beantworten ── */
        <div className="space-y-6 lg:space-y-8 animate-in slide-in-from-bottom-6">

          {/* Quelle + Abbrechen */}
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-indigo-500" />
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest break-words max-w-[200px]">{activeSourceName}</span>
            </div>
            <button
              onClick={handleCancel}
              className="text-[10px] font-black uppercase text-slate-400 hover:text-rose-500 tracking-widest transition-colors"
            >
              {t('quiz.cancel')}
            </button>
          </div>

          {/* Frage */}
          <div className="bg-indigo-600 p-8 lg:p-12 rounded-[32px] lg:rounded-[40px] shadow-3d-deep relative overflow-hidden border border-indigo-500">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 blur-3xl rounded-full translate-x-12 -translate-y-12" />
            <h3 className="text-[9px] lg:text-[10px] font-black uppercase tracking-[0.3em] mb-4" style={{ color: 'var(--primary-text)', opacity: 0.6 }}>{t('ar.challenge')}</h3>
            <p className="text-lg lg:text-2xl font-bold leading-snug tracking-tight" style={{ color: 'var(--primary-text)' }}>{challenge.question}</p>
          </div>

          {/* Antwort-Textarea */}
          <div className="space-y-4">
            <div className="relative">
              <textarea
                autoFocus
                value={userAnswer}
                onChange={e => setUserAnswer(e.target.value)}
                placeholder={t('ar.answerPlaceholder')}
                disabled={isEvaluating}
                className="w-full h-64 lg:h-72 p-6 lg:p-10 rounded-[32px] lg:rounded-[40px] shadow-3d-raised outline-none focus:border-indigo-400 transition-all text-sm lg:text-base font-medium leading-relaxed disabled:opacity-40"
                style={{ background: 'var(--bg-sidebar)', border: isListening ? '2px solid var(--primary)' : '1px solid var(--border-color)', color: 'var(--text-main)' }}
              />
              {hasSpeechApi ? (
                <button
                  type="button"
                  onClick={toggleListening}
                  disabled={isEvaluating}
                  title={isListening ? t('ar.stopRecording') : t('ar.startDictation')}
                  className={`absolute bottom-4 right-4 w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-lg ${
                    isListening
                      ? 'bg-rose-500 text-white animate-pulse'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {isListening ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="6" y="6" width="12" height="12" rx="2"/>
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
                    </svg>
                  )}
                </button>
              ) : (
                <div className="absolute bottom-4 right-4 w-10 h-10 rounded-full flex items-center justify-center bg-slate-100 dark:bg-slate-800 opacity-40" title={t('ar.dictationUnsupported')}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
                  </svg>
                </div>
              )}
            </div>
            {isListening && (
              <p className="text-[10px] font-black uppercase tracking-widest text-center animate-pulse" style={{ color: 'var(--primary)' }}>
                {t('ar.recordingNow')}
              </p>
            )}
            {!hasSpeechApi && (
              <p className="text-[10px] font-semibold text-center" style={{ color: 'var(--text-secondary)' }}>
                {t('ar.dictationUnsupported')}
              </p>
            )}
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 px-4 lg:px-6">
              <span className="text-[9px] font-black uppercase tracking-widest order-2 sm:order-1 text-slate-400">
                {t('ar.wordsN', { n: userAnswer.trim().split(/\s+/).filter(x => x).length })}
                {userAnswer.length > 3000 && (
                  <span className="block mt-1 text-amber-500 normal-case font-bold">{t('ar.truncationHint')}</span>
                )}
              </span>
              <button
                onClick={handleEvaluate}
                disabled={isEvaluating || userAnswer.trim().length < 10}
                className="w-full sm:w-auto bg-indigo-600 px-8 lg:px-10 py-3.5 rounded-xl lg:rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg hover:scale-105 transition-all disabled:opacity-40 order-1 sm:order-2 flex items-center justify-center gap-2"
                style={{ color: 'var(--primary-text)' }}
              >
                {isEvaluating ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    {t('ar.analyzing')}
                  </>
                ) : (
                  <>
                    {t('ar.submitAnswer')}
                    <GeneratedImage prompt="Checkmark icon, minimalist" className="w-4 h-4 rounded-full" />
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Lade-Overlay während Bewertung */}
          {isEvaluating && (
            <div className="rounded-[32px] p-6 text-center animate-in fade-in duration-300" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}>
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{t('ar.checkingDoc')}</p>
            </div>
          )}
        </div>

      ) : (
        /* ── Phase 3: Ergebnis ── */
        <div className="space-y-6 lg:space-y-8 animate-in zoom-in-95 duration-500">

          {/* Score + Feedback */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-8 lg:p-10 rounded-[32px] lg:rounded-[40px] shadow-3d-raised flex flex-col items-center justify-center text-center" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}>
              <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-2">{t('ar.recallQuality')}</span>
              <span className={`text-5xl lg:text-6xl font-black ${evaluation.score >= 86 ? 'text-emerald-500' : evaluation.score >= 61 ? 'text-indigo-500' : evaluation.score >= 31 ? 'text-amber-500' : 'text-rose-500'}`}>
                {evaluation.score}%
              </span>
              <span className="text-[9px] font-black uppercase tracking-widest mt-2 text-slate-400">
                {evaluation.score >= 86 ? t('ar.rExcellent') : evaluation.score >= 61 ? t('fc.good') : evaluation.score >= 31 ? t('ar.rBasic') : t('ar.rRepeat')}
              </span>
            </div>
            <div className="md:col-span-2 bg-indigo-600 p-8 lg:p-10 rounded-[32px] lg:rounded-[40px] shadow-3d-deep flex flex-col justify-center border border-indigo-500">
              <h3 className="text-[9px] font-black uppercase tracking-[0.3em] mb-3" style={{ color: 'var(--primary-text)', opacity: 0.6 }}>{t('ar.feedback')}</h3>
              <p className="text-base lg:text-lg font-medium leading-relaxed italic" style={{ color: 'var(--primary-text)' }}>"{evaluation.feedback}"</p>
            </div>
          </div>

          {/* Stärken + Lücken */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-8 rounded-[32px]" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}>
              <h4 className="text-[9px] font-black uppercase text-emerald-500 tracking-widest mb-4 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                {t('ar.goodApproaches')}
              </h4>
              {evaluation.strengths.length > 0 ? (
                <ul className="space-y-2.5">
                  {evaluation.strengths.map((s, i) => (
                    <li key={i} className="flex gap-3 items-start">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                      <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 leading-normal">{s}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-slate-400 italic">{t('ar.noStrengths')}</p>
              )}
            </div>
            <div className="p-8 rounded-[32px]" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}>
              <h4 className="text-[9px] font-black uppercase text-rose-500 tracking-widest mb-4 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                {t('ar.gapsIdentified')}
              </h4>
              {evaluation.missingPoints.length > 0 ? (
                <>
                  <ul className="space-y-2.5">
                    {evaluation.missingPoints.map((m, i) => (
                      <li key={i} className="flex gap-3 items-start">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-400 mt-1.5 shrink-0" />
                        <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 leading-normal">{m}</p>
                      </li>
                    ))}
                  </ul>
                  {onCreateCardsFromGaps && (
                    <button
                      onClick={() => onCreateCardsFromGaps(focusTopic.trim() || activeSourceName || t('ar.recallFallback'), evaluation.missingPoints)}
                      className="mt-4 w-full py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all hover:scale-[1.02]"
                      style={{ background: 'color-mix(in srgb, var(--primary) 12%, transparent)', color: 'var(--primary)', border: '1px solid color-mix(in srgb, var(--primary) 30%, transparent)' }}
                    >
                      {t('ar.saveGapsAsCards')}
                    </button>
                  )}
                </>
              ) : (
                <p className="text-xs text-emerald-500 font-semibold">{t('ar.noGaps')}</p>
              )}
            </div>
          </div>

          {/* Musterlösung: der ohnehin generierte conceptContext, auf Abruf */}
          {challenge.conceptContext && (
            <div className="p-8 rounded-[32px] space-y-4" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}>
              <button
                onClick={() => setShowModelAnswer(v => !v)}
                className="w-full flex items-center justify-between text-[9px] font-black uppercase tracking-widest transition-colors"
                style={{ color: 'var(--primary)' }}
                aria-expanded={showModelAnswer}
              >
                <span>{showModelAnswer ? t('ar.hideModelAnswer') : t('ar.showModelAnswer')}</span>
                <span className="font-black">{showModelAnswer ? '−' : '+'}</span>
              </button>
              {showModelAnswer && (
                <p className="text-sm font-medium text-slate-600 dark:text-slate-300 leading-relaxed animate-in fade-in duration-300">
                  {challenge.conceptContext}
                </p>
              )}
            </div>
          )}

          {/* Lernempfehlung + Aktionen */}
          <div className="p-8 lg:p-10 rounded-[32px] lg:rounded-[40px] space-y-6" style={{ background: 'var(--bg-sidebar)', border: '1px dashed var(--border-color)' }}>
            <div className="space-y-1.5 text-center">
              <h3 className="text-[9px] font-black uppercase text-indigo-500 tracking-[0.3em]">{t('ar.learningRec')}</h3>
              <p className="text-sm lg:text-base font-bold dark:text-white leading-relaxed max-w-2xl mx-auto">{evaluation.suggestedReview}</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              {/* Feynman-Kern: dieselbe Frage nochmal einfacher erklären */}
              <button
                onClick={() => { setEvaluation(null); setUserAnswer(''); setShowModelAnswer(false); }}
                className="px-8 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all hover:scale-105 flex items-center justify-center gap-2"
                style={{ background: 'color-mix(in srgb, var(--primary) 12%, transparent)', color: 'var(--primary)', border: '1px solid color-mix(in srgb, var(--primary) 30%, transparent)' }}
              >
                {t('ar.retrySame')}
              </button>
              <button
                onClick={() => { setChallenge(null); setEvaluation(null); startNewChallenge(); }}
                className="bg-indigo-600 px-8 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg hover:scale-105 transition-all flex items-center justify-center gap-2"
                style={{ color: 'var(--primary-text)' }}
              >
                {t('ar.nextDrill')}
                <GeneratedImage prompt="Arrow right icon, minimalist" className="w-4 h-4 rounded-full" />
              </button>
              <button
                onClick={handleCancel}
                className="px-8 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all flex items-center justify-center gap-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
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
