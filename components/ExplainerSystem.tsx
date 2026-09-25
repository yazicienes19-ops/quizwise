
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { MessageCircle, Lightbulb, ClipboardList, BookOpen, Search, ChevronRight, Mic, Send, Volume2, Square, Copy, BookmarkPlus, Trash2, ArrowLeft, GraduationCap, X } from 'lucide-react';
import { ProcessedDocument, Collection, TopicMetric, FlashcardDeck, Flashcard } from '../types';
import type { GenerationSource } from '../services/geminiService';
import { chatWithTutor } from '../services/geminiService';
import { extractSourceQuote, stripSourceQuoteLine } from '../services/sourceQuoteParser';
import { parseTutorResponse } from '../services/tutorFollowUpParser';
import {
  loadTutorSessions, saveTutorSession, deleteTutorSession, tutorSessionTitle,
  type TutorMode, type TutorSourceRef, type StoredTutorSession,
} from '../services/tutorSessions';
import { createSrsState } from '../services/spacedRepetition';
import { saveDeckToSupabase } from '../services/flashcardService';
import { readLocalDecks, upsertLocalDeck } from '../services/deckStore';
import { resolveErrorMessage } from '../services/errorMessages';
import { SourceSelector } from './SourceSelector';
import { useTranslation } from '../i18n/I18nProvider';
import { localeTag } from '../i18n';
import { formatDate } from '../i18n/dates';
import type { TKey } from '../i18n';
import { documentDisplayName } from '../services/libraryService';
import { buildCollectionSource } from '../services/collectionSource';
import { toast } from '../services/toast';
import { buildWeakSpotReasons } from '../services/learningProfileService';
import { useModuleScopedActivity } from '../hooks/useModuleScopedActivity';
import { renderMarkdown, parseInline } from './markdownRenderer';
import { BrandMark } from './BrandMark';
import { PageHeader } from './PageHeader';

// ─── Typen ────────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  /** 'system' = Moduswechsel-Pille im Verlauf; `content` trägt dann den
   *  Zielmodus-Schlüssel (z.B. 'quiz'), nicht den Fließtext. */
  role: 'user' | 'tutor' | 'system';
  content: string;
  followUps?: string[];
  quote?: string | null;
  ts: number;
}

interface ExplainerSystemProps {
  availableDocuments: ProcessedDocument[];
  collections: Collection[];
  getDocumentSource?: (doc: ProcessedDocument) => GenerationSource;
  onSaveToLibrary?: (file: File) => void;
  initialDoc?: ProcessedDocument;
  metrics: TopicMetric[];
  decks: FlashcardDeck[];
  setDecks: React.Dispatch<React.SetStateAction<FlashcardDeck[]>>;
  /** Öffnet das gewählte Dokument im Splitscreen-Reader (Nav-Ebene, außerhalb dieser Komponente). */
  onOpenReader?: (doc: ProcessedDocument) => void;
  /** Vorname für die personalisierte Begrüßung auf dem Start-Screen (Redesign 2026-09-10). */
  userName?: string | null;
  /** Für den Cloud-Sync gespeicherter Karteikarten; ohne Login bleiben sie lokal. */
  userId?: string | null;
  /** Aktives Fach aus der Sidebar (Bug-Fix 2026-09-10: Material-Auswahl und
   *  Dokument-öffnen-Picker ignorierten das bisher komplett, zeigten immer
   *  alle Dokumente kontoweit statt nur die des gewählten Fachs). null/undefined
   *  = "Alle Fächer", keine Einschränkung. */
  activeModuleId?: string | null;
}

const uid = (): string => Math.random().toString(36).slice(2, 9);
const EMPTY_DISMISSED = new Set<string>();
/** Tab-lokal gemerkte offene Sitzung: ein Wechsel in den Reader oder einen anderen
 *  Tab hängt die Komponente aus, das Gespräch soll danach trotzdem weitergehen. */
const OPEN_SESSION_KEY = 'studearc_tutor_open_session';

const MODES: { id: TutorMode; icon: typeof MessageCircle; titleKey: TKey; descKey: TKey }[] = [
  { id: 'explain', icon: MessageCircle, titleKey: 'tut.mode.explain', descKey: 'tut.mode.explain.desc' },
  { id: 'socratic', icon: Lightbulb, titleKey: 'tut.mode.socratic', descKey: 'tut.mode.socratic.desc' },
  { id: 'quiz', icon: ClipboardList, titleKey: 'tut.mode.quiz', descKey: 'tut.mode.quiz.desc' },
];

const MODE_TITLE_KEY: Record<TutorMode, TKey> = {
  explain: 'tut.mode.explain',
  socratic: 'tut.mode.socratic',
  quiz: 'tut.mode.quiz',
};

/** Quick-Actions über dem Composer — pro Modus andere, als normale
 *  Nutzernachrichten abgeschickt (der Tutor-Prompt kennt die Intentionen). */
const QUICK_ACTIONS: Record<TutorMode, { labelKey: TKey; msgKey: TKey }[]> = {
  explain: [
    { labelKey: 'tut.qa.example', msgKey: 'tut.qa.example.q' },
    { labelKey: 'tut.qa.simpler', msgKey: 'tut.qa.simpler.q' },
    { labelKey: 'tut.qa.deeper', msgKey: 'tut.qa.deeper.q' },
    { labelKey: 'tut.qa.quizMe', msgKey: 'tut.qa.quizMe.q' },
  ],
  socratic: [
    { labelKey: 'tut.qa.hint', msgKey: 'tut.qa.hint.q' },
    { labelKey: 'tut.qa.dontKnow', msgKey: 'tut.qa.dontKnow.q' },
    { labelKey: 'tut.qa.summary', msgKey: 'tut.qa.summary.q' },
  ],
  quiz: [
    { labelKey: 'tut.qa.next', msgKey: 'tut.qa.next.q' },
    { labelKey: 'tut.qa.harder', msgKey: 'tut.qa.harder.q' },
    { labelKey: 'tut.qa.explain', msgKey: 'tut.qa.explain.q' },
  ],
};

const THINKING_KEYS: TKey[] = ['tut.thinking.1', 'tut.thinking.2', 'tut.thinking.3'];

// ─── Hauptkomponente ──────────────────────────────────────────────────────────

export const ExplainerSystem: React.FC<ExplainerSystemProps> = ({
  availableDocuments, collections, getDocumentSource, onSaveToLibrary, initialDoc, metrics, decks, setDecks, onOpenReader, activeModuleId = null, userName = null, userId = null,
}) => {
  const { t } = useTranslation();
  // initialDoc (aus der Bibliothek gestartet) führt direkt ins Gespräch — die
  // Start-Auswahl ist nur für den generischen Einstieg über den Nav-Punkt.
  const [view, setView] = useState<'start' | 'chat'>(initialDoc ? 'chat' : 'start');
  const [mode, setMode] = useState<TutorMode>('explain');
  const [activeSource, setActiveSource] = useState<GenerationSource | null>(null);
  const [activeSourceName, setActiveSourceName] = useState('');
  const [sourceRef, setSourceRef] = useState<TutorSourceRef>(null);
  const [useExternal, setUseExternal] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // Sitzungs-Id bewusst als Ref: send() ruft persistSession zweimal in einem
  // Rendervorgang (User- + Tutor-Nachricht) — ein State-Update wäre dort noch
  // nicht sichtbar und würde zwei Sitzungen mit unterschiedlichen Ids anlegen.
  const sessionIdRef = useRef<string | null>(null);
  const sessionCreatedRef = useRef<number>(Date.now());
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [thinkingIdx, setThinkingIdx] = useState(0);
  const [sessions, setSessions] = useState<StoredTutorSession[]>(loadTutorSessions);
  const [readerPickerOpen, setReaderPickerOpen] = useState(false);
  /** Quellen-Auswahl-Modal für den vereinheitlichten Start-Composer (Redesign
   *  2026-09-10, "Startbildschirm 1a") — wickelt den bestehenden SourceSelector
   *  ein statt ihn dauerhaft auf der Seite zu zeigen. */
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  const [readerSearch, setReaderSearch] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const speechRef = useRef<any>(null);
  const speakTokenRef = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const hasSpeechApi = typeof window !== 'undefined' && !!(
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  );
  const hasTts = typeof window !== 'undefined' && 'speechSynthesis' in window;

  // ── Lernprofil: schwache Themen als Vorschläge ──
  // Bug-Fix 2026-09-10: bezog sich bisher auf die GESAMTE Historie — bei
  // aktivem Fach konnten Vorschläge aus komplett anderen Fächern erscheinen
  // (gleiches Muster wie GapRadar/Dashboard, s. hooks/useModuleScopedActivity).
  const activeModuleCollection = useMemo(
    () => activeModuleId ? collections.find(c => c.id === activeModuleId) ?? null : null,
    [collections, activeModuleId],
  );
  const { quizResults: moduleQuizResults, examResults: moduleExamResults } =
    useModuleScopedActivity(activeModuleCollection, availableDocuments, EMPTY_DISMISSED);

  // "Hier hakt es noch" (Redesign 2026-09-10) — ersetzt den alten Leerzustand
  // aus reinem Intro-Text + bedeutungslosen Themen-Chips. Nur Quiz+Klausur als
  // Quelle (Karteikarten tracken aktuell keine Korrektheit pro Thema).
  const weakSpots = useMemo(
    () => buildWeakSpotReasons(moduleQuizResults, moduleExamResults),
    [moduleQuizResults, moduleExamResults],
  );

  useEffect(() => {
    if (initialDoc && getDocumentSource) {
      try {
        setActiveSource(getDocumentSource(initialDoc));
        setActiveSourceName(documentDisplayName(initialDoc));
        setSourceRef({ kind: 'doc', id: initialDoc.id });
      } catch (_) {}
      return;
    }
    // Offenes Gespräch fortsetzen, wenn der Nutzer nur kurz weg war (Reader, anderer Tab)
    let openSessionId: string | null = null;
    try { openSessionId = sessionStorage.getItem(OPEN_SESSION_KEY); } catch {}
    const openSession = openSessionId ? loadTutorSessions().find(s => s.id === openSessionId) : undefined;
    if (openSession) { resumeSession(openSession); return; }
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

  // Mikrofon + Vorlesen beim Verlassen sauber stoppen
  useEffect(() => () => {
    try { speechRef.current?.stop(); } catch {}
    try { window.speechSynthesis?.cancel(); } catch {}
  }, []);

  // Neue Nachrichten → automatisch nach unten scrollen
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isTyping]);

  // Rotierende Status-Zeilen während der Tutor antwortet
  useEffect(() => {
    if (!isTyping) { setThinkingIdx(0); return; }
    const iv = setInterval(() => setThinkingIdx(i => (i + 1) % THINKING_KEYS.length), 2600);
    return () => clearInterval(iv);
  }, [isTyping]);

  // Bug-Fix 2026-09-10: Material-Auswahl (SourceSelector) und der Dokument-
  // öffnen-Picker respektierten das in der Sidebar gewählte Fach nicht — bei
  // "Alle Fächer" (activeModuleId null) bleibt die volle Liste unverändert.
  const moduleDocuments = useMemo(
    () => activeModuleId ? availableDocuments.filter(d => d.collectionId === activeModuleId) : availableDocuments,
    [availableDocuments, activeModuleId],
  );

  const filteredReaderDocs = useMemo(() => {
    const q = readerSearch.trim().toLowerCase();
    if (!q) return moduleDocuments;
    return moduleDocuments.filter(d => documentDisplayName(d).toLowerCase().includes(q));
  }, [moduleDocuments, readerSearch]);

  const handleSelectDocument = (doc: ProcessedDocument) => {
    const source = getDocumentSource ? getDocumentSource(doc) : doc.type === 'pdf' ? { file: { data: doc.content, mimeType: 'application/pdf' } } : { text: doc.content };
    setActiveSource(source);
    setActiveSourceName(documentDisplayName(doc));
    setSourceRef({ kind: 'doc', id: doc.id });
  };

  // ── Sitzungs-Persistenz ──

  // modeOverride: setMode() ist async (nächster Render) — ein Aufrufer, der
  // Modus UND Nachrichten im selben Tick ändert (changeMode), würde sonst den
  // noch alten mode-Wert aus der Closure persistieren.
  const persistSession = (msgs: ChatMessage[], modeOverride?: TutorMode) => {
    if (!msgs.length) return;
    if (!sessionIdRef.current) { sessionIdRef.current = uid(); sessionCreatedRef.current = Date.now(); }
    try { sessionStorage.setItem(OPEN_SESSION_KEY, sessionIdRef.current); } catch {}
    setSessions(saveTutorSession({
      id: sessionIdRef.current, mode: modeOverride ?? mode, sourceName: activeSourceName, sourceRef, useExternal,
      messages: msgs.map(m => ({ id: m.id, role: m.role, content: m.content, followUps: m.followUps, quote: m.quote, ts: m.ts })),
      createdAt: sessionCreatedRef.current, updatedAt: Date.now(),
    }));
  };

  /** Quellen-Referenz einer gespeicherten Sitzung nach Neuladen neu auflösen. */
  const resolveStoredSource = (ref: TutorSourceRef): { source: GenerationSource | null; name: string } => {
    if (ref?.kind === 'doc') {
      const doc = availableDocuments.find(d => d.id === ref.id);
      if (doc && getDocumentSource) {
        try { return { source: getDocumentSource(doc), name: documentDisplayName(doc) }; } catch {}
      }
    }
    if (ref?.kind === 'collection') {
      const col = collections.find(c => c.id === ref.id);
      if (col) {
        const result = buildCollectionSource(col, availableDocuments);
        if (result && result.includedCount > 0) return { source: result.source, name: result.name };
      }
    }
    return { source: null, name: '' };
  };

  const resumeSession = (session: StoredTutorSession) => {
    const { source, name } = resolveStoredSource(session.sourceRef);
    const sourceMissing = !!session.sourceRef && !source;
    setMode(session.mode);
    setActiveSource(source);
    setActiveSourceName(source ? (name || session.sourceName) : '');
    setSourceRef(session.sourceRef);
    setUseExternal(source ? session.useExternal : true);
    if (sourceMissing) toast.info(t('tut.sourceGone'));
    setMessages(session.messages);
    sessionIdRef.current = session.id;
    sessionCreatedRef.current = session.createdAt;
    try { sessionStorage.setItem(OPEN_SESSION_KEY, session.id); } catch {}
    setView('chat');
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  // ── Nachrichten senden ──

  /** baseMessages: expliziter Basis-Stand, wenn send direkt nach einem Reset
   *  aufgerufen wird (Start-Screen) — der State wäre im selben Tick noch alt.
   *  forceExternal: "Hier hakt es noch" auf dem Start-Screen darf ohne gewählte
   *  Quelle sofort starten (allgemeines Thema) — setUseExternal(true) wäre hier
   *  zu spät sichtbar (State-Update erst nächster Render), deshalb als Override. */
  const send = async (text: string, baseMessages: ChatMessage[] = messages, forceExternal = false) => {
    const trimmed = text.trim();
    if (!trimmed || isTyping) return;
    const external = useExternal || forceExternal;
    if (!activeSource && !external) { toast.error(t('ex.pleaseChooseDoc')); return; }
    if (forceExternal && !useExternal) setUseExternal(true);

    const userMsg: ChatMessage = { id: uid(), role: 'user', content: trimmed, ts: Date.now() };
    // System-Pillen (Moduswechsel-Marker) sind reine UI-Anzeige, keine echten
    // Gesprächsbeiträge — der Tutor bekommt sie nicht als Historie zu sehen.
    const history = baseMessages
      .filter((m): m is ChatMessage & { role: 'user' | 'tutor' } => m.role !== 'system')
      .map(m => ({ role: m.role, content: m.content }));
    const withUser = [...baseMessages, userMsg];
    setMessages(withUser);
    setInput('');
    adjustTextarea();
    persistSession(withUser);
    setIsTyping(true);
    try {
      // Streaming: eine Platzhalter-Nachricht wächst mit. Protokollzeilen
      // (Weiterfragen/Quelle), auch halb angekommene, bleiben verborgen, bis die
      // fertige Antwort unten sauber geparst wird; gleiche id = kein Flackern.
      const placeholderId = uid();
      const raw = await chatWithTutor(activeSource, history, trimmed, {
        mode, useExternalKnowledge: external, includeSourceQuote: !!activeSource,
      }, partial => {
        const lastBreak = partial.lastIndexOf('\n');
        const tail = partial.slice(lastBreak + 1).trimStart();
        const settled = tail.startsWith('*') ? partial.slice(0, Math.max(lastBreak, 0)) : partial;
        const visible = parseTutorResponse(settled).content;
        if (!visible) return;
        setMessages([...withUser, { id: placeholderId, role: 'tutor', content: visible, ts: Date.now() }]);
      });
      const quote = activeSource ? extractSourceQuote(raw) : null;
      const withoutQuote = activeSource ? stripSourceQuoteLine(raw) : raw;
      const { content, followUps } = parseTutorResponse(withoutQuote);
      const tutorMsg: ChatMessage = {
        id: placeholderId, role: 'tutor',
        content: (content || raw).trim(),
        followUps: followUps ?? undefined,
        quote, ts: Date.now(),
      };
      const finalMessages = [...withUser, tutorMsg];
      setMessages(finalMessages);
      persistSession(finalMessages);
    } catch (e) {
      setMessages(withUser);
      toast.error(resolveErrorMessage(e));
    } finally {
      setIsTyping(false);
    }
  };

  /** Vom Start-Screen loslegen: altes (per "Zurück" geparktes) Gespräch bleibt
   *  über die Sitzungsliste fortsetzbar, ein neuer Start beginnt bei null. */
  const startChat = (text?: string, forceExternal = false) => {
    // Ohne Quelle und ohne Allgemeinwissen kann send() nichts tun; die Meldung
    // gehört auf den Start-Screen, nicht in einen leeren Chat.
    if (text && !activeSource && !useExternal && !forceExternal) { toast.error(t('ex.pleaseChooseDoc')); return; }
    setView('chat');
    if (text) {
      setMessages([]);
      sessionIdRef.current = null;
      sessionCreatedRef.current = Date.now();
      send(text, [], forceExternal);
    } else {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const backToStart = () => {
    stopSpeaking();
    try { speechRef.current?.stop(); } catch {}
    try { sessionStorage.removeItem(OPEN_SESSION_KEY); } catch {}
    setView('start');
  };

  const startNewSession = () => {
    stopSpeaking();
    try { sessionStorage.removeItem(OPEN_SESSION_KEY); } catch {}
    setMessages([]);
    sessionIdRef.current = null;
    sessionCreatedRef.current = Date.now();
    setInput('');
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  /** Modus-Wechsel mitten im Gespräch (Redesign 2026-09-10): Verlauf bleibt
   *  erhalten, nur die NÄCHSTE Antwort nutzt den neuen Modus — sichtbar über
   *  eine System-Pille im Verlauf statt einer stillen State-Änderung. */
  const changeMode = (next: TutorMode) => {
    if (next === mode) return;
    setMode(next);
    if (messages.length > 0) {
      const withPill = [...messages, { id: uid(), role: 'system' as const, content: next, ts: Date.now() }];
      setMessages(withPill);
      persistSession(withPill, next);
    }
  };

  // ── Sprachein- / -ausgabe ──

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
      setInput(prev => prev ? `${prev} ${transcript}`.trim() : transcript);
    };
    rec.onerror = (e: any) => {
      setIsListening(false);
      if (e?.error === 'not-allowed' || e?.error === 'service-not-allowed' || e?.error === 'audio-capture') {
        toast.error(t('ar.micDenied'));
      }
    };
    rec.onend = () => setIsListening(false);
    speechRef.current = rec;
    rec.start();
    setIsListening(true);
  }, [hasSpeechApi, isListening, t]);

  const stopSpeaking = () => {
    speakTokenRef.current++;
    try { window.speechSynthesis?.cancel(); } catch {}
    setSpeakingId(null);
  };

  const toggleSpeak = (msg: ChatMessage) => {
    if (!hasTts) return;
    if (speakingId === msg.id) { stopSpeaking(); return; }
    stopSpeaking();
    const token = ++speakTokenRef.current;
    // Markdown grob zu Sprache portieren: Satzzeichen und Formatierung raus,
    // auf 1500 Zeichen kappen (langes Vorlesen ohne Stop-Möglichkeit vermeiden)
    const plain = msg.content
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/[#*`>|_]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 1500);
    const utterance = new SpeechSynthesisUtterance(plain);
    utterance.lang = localeTag();
    utterance.onend = () => { if (speakTokenRef.current === token) setSpeakingId(null); };
    utterance.onerror = () => { if (speakTokenRef.current === token) setSpeakingId(null); };
    setSpeakingId(msg.id);
    window.speechSynthesis.speak(utterance);
  };

  // ── Antwort als Karteikarte merken ──

  const saveCardFrom = (index: number) => {
    const msg = messages[index];
    if (!msg || msg.role !== 'tutor') return;
    const prevUser = [...messages.slice(0, index)].reverse().find(m => m.role === 'user');
    const front = (prevUser?.content ?? msg.content.slice(0, 80)).trim().slice(0, 220);
    const card: Flashcard = { id: uid(), front, back: msg.content.trim().slice(0, 1500), level: 0, nextReview: Date.now(), srs: createSrsState() };
    const title = `${t('nav.explainer')} · ${activeSourceName || t('tut.general')}`;
    // Aktueller Speicherstand statt der App-Kopie: sonst würde ein zweites
    // Speichern in derselben Sitzung Karten aus den Karteikarten überschreiben.
    const existing = readLocalDecks().find(d => d.title === title);
    const deck: FlashcardDeck = existing
      ? { ...existing, cards: [...existing.cards, card] }
      : { id: uid(), title, cards: [card], sourceDocumentId: sourceRef?.kind === 'doc' ? sourceRef.id : undefined };
    setDecks(upsertLocalDeck(deck));
    if (userId) saveDeckToSupabase(deck, userId).catch(() => {});
    toast.success(t('tut.msg.cardSaved'));
  };

  // ── Composer ──

  const adjustTextarea = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    adjustTextarea();
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() && !isTyping) send(input);
    }
  };

  const lastTutorIdx = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === 'tutor') return i;
    return -1;
  }, [messages]);

  // Kopfzeile zeigt den Sitzungstitel statt des Modus (Redesign 2026-09-10) —
  // gleiche Kürzung wie tutorSessionTitle() für gespeicherte Sitzungen.
  const chatTitle = useMemo(() => {
    const firstUser = messages.find(m => m.role === 'user');
    const title = firstUser?.content.trim() ?? '';
    if (!title) return t('tut.general');
    return title.length > 60 ? `${title.slice(0, 60).trimEnd()}…` : title;
  }, [messages, t]);

  const activeDocForReader = sourceRef?.kind === 'doc' ? availableDocuments.find(d => d.id === sourceRef.id) : undefined;

  // ── Render: Start ──

  if (view === 'start') {
    return (
      <div className="max-w-3xl mx-auto space-y-8 py-6 lg:py-10 px-4 animate-in fade-in duration-700">
        <PageHeader
          eyebrow={activeSourceName ? `${t('nav.explainer')} · ${activeSourceName}` : t('nav.explainer')}
          title={userName ? <>{t('tut.landing.greeting')} <span className="italic">{userName}</span>?</> : t('tut.landing.headline')}
        />

        {/* Vereinheitlichter Composer (Redesign 2026-09-10, "Startbildschirm 1a") —
            ersetzt Modus-Karten + Dokument-Karte + SourceSelector + Allgemeinwissen-
            Schalter + separates Eingabefeld durch EIN Element. */}
        <div className="rounded-[20px] p-4 space-y-3" style={{ background: 'var(--card)', border: '1px solid var(--border-color)', boxShadow: '0 8px 24px rgba(22,41,77,.07)' }}>
          <div className="flex flex-wrap gap-1.5">
            {activeSourceName && (
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold"
                style={{ background: 'color-mix(in srgb, var(--primary) 16%, transparent)', border: '1px solid color-mix(in srgb, var(--primary) 40%, transparent)', color: 'color-mix(in srgb, var(--primary) 75%, black)' }}
              >
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'var(--primary)' }} />
                {activeSourceName}
                <button onClick={() => { setActiveSource(null); setActiveSourceName(''); setSourceRef(null); }} aria-label={t('ex.remove')} className="ml-0.5 opacity-60 hover:opacity-100">×</button>
              </span>
            )}
            <button
              onClick={() => setSourcePickerOpen(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors hover:opacity-70"
              style={{ background: 'color-mix(in srgb, var(--ink) 5%, transparent)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}
            >
              + {t('tut.composer.addSource')}
            </button>
          </div>

          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && input.trim()) startChat(input); }}
            placeholder={t('ex.conceptPlaceholder')}
            className="w-full text-base font-medium outline-none bg-transparent"
            style={{ color: 'var(--text-main)' }}
          />

          <div className="flex flex-wrap items-center gap-2.5 pt-2.5 border-t" style={{ borderColor: 'var(--border-color)' }}>
            <div className="flex gap-1 p-0.5 rounded-lg" style={{ background: 'color-mix(in srgb, var(--ink) 5.5%, transparent)' }}>
              {MODES.map(({ id, titleKey }) => (
                <button
                  key={id}
                  onClick={() => setMode(id)}
                  className="px-2.5 py-1.5 rounded-md text-[11px] font-semibold transition-all whitespace-nowrap"
                  style={{
                    background: mode === id ? 'var(--ink)' : 'transparent',
                    color: mode === id ? 'var(--bg-sidebar)' : 'color-mix(in srgb, var(--ink) 70%, transparent)',
                  }}
                >
                  {t(titleKey)}
                </button>
              ))}
            </div>
            <button onClick={() => setUseExternal(v => !v)} className="flex items-center gap-1.5">
              <span className="w-[30px] h-[17px] rounded-full relative transition-colors shrink-0" style={{ background: useExternal ? 'var(--primary)' : 'color-mix(in srgb, var(--ink) 16%, transparent)' }}>
                <span className={`absolute top-0.5 w-[13px] h-[13px] rounded-full bg-white transition-all ${useExternal ? 'left-[15px]' : 'left-0.5'}`} />
              </span>
              <span className="text-[11px] font-medium whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{t('ex.supplementGeneral')}</span>
            </button>
            <button
              onClick={() => startChat(input.trim() || undefined)}
              aria-label={t('tut.send')}
              className="ml-auto w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0 transition-all hover:scale-105"
              style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
            >
              <Send size={16} strokeWidth={2} />
            </button>
          </div>
        </div>
        {!activeSource && !useExternal && (
          <p className="text-center text-[11px] text-slate-400 font-medium -mt-6">{t('ex.noDocHint')}</p>
        )}

        {/* Splitscreen-Reader — eigenständiger Einstieg direkt unter dem Composer
            (User-Feedback 2026-09-10: soll oben stehen, nicht am Seitenende).
            Die "+ Quelle wählen"-Pille im Composer ist NICHT dasselbe — die
            setzt nur die Chat-Quelle, öffnet aber nicht den Splitscreen. */}
        <button
          onClick={() => moduleDocuments.length > 0 ? setReaderPickerOpen(true) : toast.info(t('ex.landing.noDocs'))}
          className="w-full flex items-center gap-4 p-4 rounded-[16px] text-left transition-all hover:scale-[1.01]"
          style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}
        >
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'color-mix(in srgb, var(--primary) 12%, transparent)' }}>
            <BookOpen size={18} style={{ color: 'var(--primary-ink)' }} strokeWidth={1.75} />
          </div>
          <div className="flex-1 min-w-0 space-y-0.5">
            <p className="text-sm font-semibold dark:text-white">{t('ex.landing.readerTitle')}</p>
            <p className="text-[11px] text-slate-400 font-medium leading-snug">{t('ex.landing.readerDesc')}</p>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" strokeWidth={2} />
        </button>

        {/* "Hier hakt es noch" (Redesign 2026-09-10) — jetzt schon auf dem
            Start-Screen sichtbar, nicht erst im leeren Chat. Klick startet
            direkt eine Erklär-Sitzung zu diesem Thema. */}
        {weakSpots.length > 0 && (
          <div className="space-y-2">
            <p className="flex items-baseline gap-2">
              <span className="text-xs font-semibold" style={{ color: 'color-mix(in srgb, var(--primary) 70%, black)', letterSpacing: '0.08em' }}>
                {t('tut.weakSpots.title')}
              </span>
              <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{t('tut.weakSpots.subtitle')}</span>
            </p>
            <div className="space-y-2">
              {weakSpots.map(w => (
                <button
                  key={w.topic}
                  onClick={() => startChat(t('tut.weakSpot.startQuestion', { topic: w.topic }), !activeSource)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl text-left transition-all hover:opacity-80"
                  style={{
                    background: 'var(--card)',
                    borderTop: '1px solid var(--border-color)',
                    borderRight: '1px solid var(--border-color)',
                    borderBottom: '1px solid var(--border-color)',
                    borderLeft: `3px solid ${w.severity === 'strong' ? '#c2543f' : '#d9a03f'}`,
                  }}
                >
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold dark:text-white truncate">{w.topic}</span>
                    <span className="block text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>{w.reason}</span>
                  </span>
                  <span className="text-[11px] font-semibold shrink-0 whitespace-nowrap" style={{ color: 'color-mix(in srgb, var(--primary) 70%, black)' }}>
                    {t(MODE_TITLE_KEY.explain)} →
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Letzte Sitzungen */}
        {sessions.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">{t('tut.sessions')}</p>
            <div className="space-y-1.5">
              {sessions.slice(0, 5).map(s => (
                <div
                  key={s.id}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left"
                  style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}
                >
                  <button onClick={() => resumeSession(s)} className="flex-1 flex items-center gap-3 min-w-0 text-left">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'color-mix(in srgb, var(--primary) 12%, transparent)' }}>
                      <GraduationCap size={16} style={{ color: 'var(--primary-ink)' }} strokeWidth={1.75} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold truncate dark:text-white">{tutorSessionTitle(s, t('tut.session'))}</p>
                      <p className="text-[11px] font-medium text-slate-400 truncate">
                        {t(MODE_TITLE_KEY[s.mode])} · {s.sourceName || t('tut.general')} · {formatDate(s.updatedAt, { day: '2-digit', month: 'short' })}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" strokeWidth={2} />
                  </button>
                  <button
                    onClick={() => setSessions(deleteTutorSession(s.id))}
                    aria-label={t('tut.session.delete')}
                    className="text-slate-300 hover:text-rose-500 transition-colors shrink-0 p-1"
                  >
                    <Trash2 size={15} strokeWidth={1.75} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quellen-Auswahl-Modal für die Composer-Pille "+ Quelle wählen" —
            wickelt den bestehenden SourceSelector ein (Bibliothek/Neue Datei/
            Text einfügen bleiben vollständig erhalten, nur nicht mehr
            dauerhaft auf der Seite sichtbar). */}
        {sourcePickerOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={() => setSourcePickerOpen(false)}>
            <div
              className="w-full max-w-lg max-h-[80vh] flex flex-col rounded-[28px] p-5 space-y-3 animate-in fade-in zoom-in-95 duration-200 overflow-y-auto"
              style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">{t('ex.chooseMaterial')}</p>
                <button aria-label={t('common.close')} onClick={() => setSourcePickerOpen(false)} className="text-slate-400 hover:text-rose-500 transition-colors"><X size={16} strokeWidth={2.5} /></button>
              </div>
              <SourceSelector
                framed={false}
                documents={moduleDocuments} collections={collections}
                onSelectDocument={doc => { handleSelectDocument(doc); setSourcePickerOpen(false); }}
                onSelectSource={(source, name) => { setActiveSource(source); setActiveSourceName(name); setSourceRef(null); setSourcePickerOpen(false); }}
                onSaveToLibrary={onSaveToLibrary} isLoading={false}
              />
            </div>
          </div>
        )}

        {/* Reader-Picker Overlay */}
        {readerPickerOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={() => setReaderPickerOpen(false)}>
            <div
              className="w-full max-w-md max-h-[70vh] flex flex-col rounded-[28px] p-5 space-y-3 animate-in fade-in zoom-in-95 duration-200"
              style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">{t('ex.landing.readerTitle')}</p>
                <button aria-label={t('common.close')} onClick={() => setReaderPickerOpen(false)} className="text-slate-400 hover:text-rose-500 transition-colors"><X size={16} strokeWidth={2.5} /></button>
              </div>
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" strokeWidth={1.75} />
                <input
                  value={readerSearch}
                  onChange={e => setReaderSearch(e.target.value)}
                  placeholder={t('ssel.searchPlaceholder')}
                  className="w-full pl-11 pr-4 py-3 rounded-2xl text-sm dark:text-white placeholder-slate-400 outline-none"
                  style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)' }}
                  autoFocus
                />
              </div>
              <div className="space-y-2 overflow-y-auto pr-1">
                {filteredReaderDocs.map(doc => (
                  <button
                    key={doc.id}
                    onClick={() => { setReaderPickerOpen(false); onOpenReader?.(doc); }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition-all hover:scale-[1.02]"
                    style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)' }}
                  >
                    <BookOpen size={16} className="shrink-0" style={{ color: 'var(--primary-ink)' }} strokeWidth={1.75} />
                    <span className="flex-1 min-w-0 text-xs font-semibold dark:text-white truncate">{documentDisplayName(doc)}</span>
                    <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" strokeWidth={2} />
                  </button>
                ))}
                {filteredReaderDocs.length === 0 && (
                  <p className="text-center text-[11px] text-slate-400 py-6 italic">{t('ssel.noHits', { q: readerSearch })}</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Render: Chat ──

  return (
    <div className="max-w-3xl mx-auto py-4 lg:py-6 px-4 flex flex-col min-h-[70vh]">
      {/* Kopfzeile */}
      <div
        // Mobil unter der fixen App-Topbar andocken (Notch-Inset + 3.5rem),
        // ab md klebt der Header wie bisher am oberen Rand — die Topbar ist
        // unter 768px das Einzige, was sonst davor läge.
        className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] md:top-0 z-20 -mx-4 px-4 py-3 mb-4 flex items-center gap-2 rounded-b-2xl"
        style={{ background: 'linear-gradient(to bottom, var(--bg-main) 82%, transparent)' }}
      >
        <button
          onClick={backToStart}
          aria-label={t('tut.backToStart')}
          className="p-2.5 rounded-xl transition-colors shrink-0"
          style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)', color: 'var(--text-main)' }}
        >
          <ArrowLeft size={16} strokeWidth={2} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{chatTitle}</p>
          {activeSourceName && (
            <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
              {t('ex.fromSource', { source: activeSourceName })}
            </p>
          )}
        </div>
        {activeDocForReader && onOpenReader && (
          <button
            onClick={() => onOpenReader(activeDocForReader)}
            className="px-3 py-1.5 rounded-lg text-[11px] font-semibold shrink-0 whitespace-nowrap transition-colors hover:opacity-80"
            style={{ border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}
          >
            {t('ex.landing.readerTitle')}
          </button>
        )}
        <button
          onClick={startNewSession}
          className="px-3 py-1.5 rounded-lg text-[11px] font-semibold shrink-0 whitespace-nowrap transition-colors hover:opacity-80"
          style={{ border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}
        >
          {t('tut.newSession')}
        </button>
      </div>

      {/* Nachrichten */}
      <div className="flex-1 space-y-5 pb-4">
        {messages.length === 0 && !isTyping && (
          <div className="space-y-4">
            <div className="rounded-[28px] p-8 space-y-4 text-center" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}>
              <div className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--primary) 12%, transparent)' }}>
                <GraduationCap size={26} style={{ color: 'var(--primary-ink)' }} strokeWidth={1.75} />
              </div>
              <p className="text-sm font-bold text-slate-600 dark:text-slate-300 max-w-md mx-auto leading-relaxed">
                {mode === 'explain' && t('tut.intro.explain')}
                {mode === 'socratic' && t('tut.intro.socratic')}
                {mode === 'quiz' && t('tut.intro.quiz')}
              </p>
              {(mode === 'socratic' || mode === 'quiz') && (
                <div className="flex flex-wrap justify-center gap-2">
                  {mode === 'socratic' && (
                    <button onClick={() => send(t('tut.start.socratic.q'))} className="px-4 py-2.5 rounded-xl text-[13px] font-semibold text-white transition-all hover:scale-[1.03]" style={{ background: 'var(--primary)' }}>
                      {t('tut.start.socratic')}
                    </button>
                  )}
                  {mode === 'quiz' && (
                    <button onClick={() => send(t('tut.start.quiz.q'))} className="px-4 py-2.5 rounded-xl text-[13px] font-semibold text-white transition-all hover:scale-[1.03]" style={{ background: 'var(--primary)' }}>
                      {t('tut.start.quiz')}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* "Hier hakt es noch" (Redesign 2026-09-10) — ersetzt die frühere
                bedeutungslose Themen-Chip-Reihe durch Zeilen mit echtem Grund. */}
            {weakSpots.length > 0 && (
              <div className="rounded-[20px] p-5 space-y-3" style={{ background: 'var(--card)', border: '1px solid var(--border-color)' }}>
                <p className="text-xs font-semibold" style={{ color: 'color-mix(in srgb, var(--primary) 70%, black)', letterSpacing: '0.08em' }}>
                  {t('tut.weakSpots.title')}
                </p>
                <div className="space-y-2">
                  {weakSpots.map(w => (
                    <button
                      key={w.topic}
                      onClick={() => send(t('tut.weakSpot.startQuestion', { topic: w.topic }), messages, !activeSource)}
                      className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl text-left transition-all hover:opacity-80"
                      style={{
                        background: 'var(--bg-main)',
                        borderTop: '1px solid var(--border-color)',
                        borderRight: '1px solid var(--border-color)',
                        borderBottom: '1px solid var(--border-color)',
                        borderLeft: `3px solid ${w.severity === 'strong' ? '#c2543f' : '#d9a03f'}`,
                      }}
                    >
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold dark:text-white truncate">{w.topic}</span>
                        <span className="block text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>{w.reason}</span>
                      </span>
                      <ChevronRight className="w-4 h-4 shrink-0" style={{ color: 'var(--text-secondary)' }} strokeWidth={2} />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {messages.map((m, idx) => {
          if (m.role === 'system') {
            return (
              <div key={m.id} className="flex justify-center">
                <span
                  className="text-[11px] font-semibold uppercase px-2.5 py-1 rounded-full"
                  style={{ background: 'color-mix(in srgb, var(--ink) 6%, transparent)', color: 'color-mix(in srgb, var(--ink) 70%, transparent)', letterSpacing: '0.08em' }}
                >
                  {t('tut.modeChanged')} · {t(MODE_TITLE_KEY[m.content as TutorMode])}
                </span>
              </div>
            );
          }
          return (
          <div key={m.id} className={`flex gap-2.5 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {m.role === 'tutor' && (
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-1"
                style={{ border: '1px solid color-mix(in srgb, var(--primary) 60%, transparent)', background: 'var(--card)' }}
              >
                <BrandMark size={13} strokeColor="var(--ink)" peakColor="var(--primary)" />
              </div>
            )}
            <div className={`min-w-0 ${m.role === 'user' ? 'max-w-[85%]' : 'flex-1 max-w-[92%]'}`}>
              {m.role === 'user' ? (
                <div
                  className="px-5 py-3.5 rounded-tl-[14px] rounded-tr-[14px] rounded-bl-[14px] rounded-br-[4px] text-sm font-bold whitespace-pre-wrap break-words"
                  style={{ background: 'var(--ink)', color: 'var(--bg-sidebar)' }}
                >
                  {m.content}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="text-[15px] leading-relaxed break-words [&_p]:mb-2 [&_p:last-child]:mb-0" style={{ color: 'var(--ink)' }}>
                    {renderMarkdown(m.content)}
                  </div>

                  {m.quote && (
                    <div
                      className="rounded-r-[9px] p-3 pl-4 ml-[-1px]"
                      style={{ background: 'var(--card)', borderTop: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', borderBottom: '1px solid var(--border-color)', borderLeft: '3px solid var(--primary)' }}
                    >
                      <div className="flex items-center justify-between gap-3 mb-1">
                        <p className="text-xs font-semibold truncate" style={{ color: 'color-mix(in srgb, var(--primary) 70%, black)', letterSpacing: '0.08em' }}>
                          {activeSourceName ? t('ex.quoteFrom', { source: activeSourceName }) : t('ex.quoteLabel')}
                        </p>
                        {activeDocForReader && onOpenReader && (
                          <button
                            onClick={() => onOpenReader(activeDocForReader)}
                            className="text-[13px] font-semibold shrink-0 whitespace-nowrap hover:opacity-70 transition-opacity"
                            style={{ color: 'color-mix(in srgb, var(--primary) 70%, black)' }}
                          >
                            {t('tut.quote.openInDoc')}
                          </button>
                        )}
                      </div>
                      <p className="text-xs font-medium italic break-words" style={{ color: 'color-mix(in srgb, var(--ink) 82%, transparent)' }}>„{parseInline(m.quote, `${m.id}-quote`)}"</p>
                    </div>
                  )}

                  {/* Follow-up-Chips nur unter der jüngsten Tutor-Antwort */}
                  {m.followUps && m.followUps.length > 0 && idx === lastTutorIdx && !isTyping && (
                    <div>
                      <p className="text-[11px] font-semibold uppercase mb-2" style={{ color: 'color-mix(in srgb, var(--primary) 70%, black)', letterSpacing: '0.08em' }}>
                        {t('tut.suggestions')}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {m.followUps.map(q => (
                          <button
                            key={q}
                            onClick={() => send(q)}
                            className="px-3 py-1.5 rounded-lg text-[13px] text-left transition-all hover:opacity-70"
                            style={{
                              border: '1px solid color-mix(in srgb, var(--primary) 45%, transparent)',
                              background: 'color-mix(in srgb, var(--primary) 8%, transparent)',
                              color: 'color-mix(in srgb, var(--primary) 75%, black)',
                            }}
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Aktionsleiste */}
                  <div className="flex items-center gap-1 -ml-1.5">
                    <button
                      onClick={() => { navigator.clipboard.writeText(m.content); toast.success(t('ex.copied')); }}
                      aria-label={t('ex.copy')}
                      title={t('ex.copy')}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                    >
                      <Copy size={13} strokeWidth={1.75} />
                    </button>
                    {hasTts && (
                      <button
                        onClick={() => toggleSpeak(m)}
                        aria-label={speakingId === m.id ? t('tut.msg.stopListen') : t('tut.msg.listen')}
                        title={speakingId === m.id ? t('tut.msg.stopListen') : t('tut.msg.listen')}
                        className="p-1.5 rounded-lg transition-colors"
                        style={{ color: speakingId === m.id ? 'var(--primary)' : undefined }}
                      >
                        {speakingId === m.id
                          ? <Square size={13} strokeWidth={2} className="text-slate-400" />
                          : <Volume2 size={13} strokeWidth={1.75} className="text-slate-400" />}
                      </button>
                    )}
                    <button
                      onClick={() => saveCardFrom(idx)}
                      aria-label={t('tut.msg.saveCard')}
                      title={t('tut.msg.saveCard')}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                    >
                      <BookmarkPlus size={13} strokeWidth={1.75} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
          );
        })}

        {/* Tutor denkt nach — ausgeblendet, sobald die Antwort bereits streamt */}
        {isTyping && messages[messages.length - 1]?.role !== 'tutor' && (
          <div className="flex gap-2.5 justify-start">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-1"
              style={{ border: '1px solid color-mix(in srgb, var(--primary) 60%, transparent)', background: 'var(--card)' }}
            >
              <BrandMark size={13} strokeColor="var(--ink)" peakColor="var(--primary)" />
            </div>
            <div className="flex items-center gap-3 px-1 py-2">
              <div className="flex gap-1.5">
                <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: 'var(--primary)', animationDelay: '0ms' }} />
                <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: 'var(--primary)', animationDelay: '150ms' }} />
                <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: 'var(--primary)', animationDelay: '300ms' }} />
              </div>
              <p className="text-xs font-semibold text-slate-400">{t(THINKING_KEYS[thinkingIdx])}</p>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div
        // Mobil über der fixen Bottom-Nav schweben (Nav-Höhe ~4rem + Home-
        // Indikator-Inset), sonst läge der Senden-Button hinter ihr — ab md
        // (Nav verschwindet) klebt der Composer normal am unteren Rand.
        className="sticky bottom-[calc(env(safe-area-inset-bottom)+4rem)] md:bottom-0 z-20 -mx-4 px-4 pt-2 pb-3"
        style={{ background: 'linear-gradient(to top, var(--bg-main) 78%, transparent)' }}
      >
        {/* Quick-Actions */}
        {messages.length > 0 && !isTyping && (
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2">
            {QUICK_ACTIONS[mode].map(({ labelKey, msgKey }) => (
              <button
                key={labelKey}
                onClick={() => send(t(msgKey))}
                className="px-3 py-1.5 rounded-full text-[13px] font-semibold whitespace-nowrap shrink-0 transition-all hover:opacity-80"
                style={{
                  background: 'color-mix(in srgb, var(--primary) 10%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--primary) 45%, transparent)',
                  color: 'color-mix(in srgb, var(--primary) 75%, black)',
                }}
              >
                {t(labelKey)}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          {/* Auch ohne Speech-Support sichtbar (deaktiviert) — Firefox-Nutzer
              sollen sehen, dass es Diktat gibt, statt dass der Button fehlt. */}
          <button
            onClick={toggleListening}
            disabled={!hasSpeechApi}
            aria-pressed={isListening}
            aria-label={hasSpeechApi ? t('tut.mic') : t('ar.dictationUnsupported')}
            title={hasSpeechApi ? t('tut.mic') : t('ar.dictationUnsupported')}
            className={`p-3.5 rounded-2xl transition-all shrink-0 ${!hasSpeechApi ? 'opacity-40 cursor-not-allowed' : ''}`}
            style={{
              background: isListening ? 'var(--primary)' : 'var(--bg-sidebar)',
              border: '1px solid var(--border-color)',
              color: isListening ? 'var(--primary-text)' : 'var(--text-main)',
            }}
          >
            <Mic size={16} strokeWidth={2} className={isListening ? 'animate-pulse' : ''} />
          </button>
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleInputKeyDown}
            rows={1}
            placeholder={t('tut.input.placeholder')}
            className="flex-1 resize-none px-5 py-3.5 rounded-2xl text-sm font-bold outline-none transition-all max-h-40"
            style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)', color: 'var(--text-main)' }}
          />
          {/* Modus-Segmente (Redesign 2026-09-10) — vorher 3 Karten über dem
              Composer, nach dem Absenden der ersten Nachricht unerreichbar.
              Jetzt jederzeit mitten im Gespräch umschaltbar. Auf schmalen
              Bildschirmen in eine eigene Zeile darunter (sonst quetschen die drei
              Segmente das Eingabefeld auf wenige Zeichen). */}
          <div className="hidden sm:flex gap-1 p-1 rounded-lg shrink-0 mb-0.5" style={{ background: 'color-mix(in srgb, var(--ink) 5.5%, transparent)' }}>
            {MODES.map(({ id, titleKey }) => (
              <button
                key={id}
                onClick={() => changeMode(id)}
                title={t(titleKey)}
                className="px-2.5 py-1.5 rounded-md text-[11px] font-semibold transition-all whitespace-nowrap"
                style={{
                  background: mode === id ? 'var(--card)' : 'transparent',
                  color: mode === id ? 'var(--ink)' : 'color-mix(in srgb, var(--ink) 70%, transparent)',
                }}
              >
                {t(titleKey)}
              </button>
            ))}
          </div>
          <button
            onClick={() => input.trim() && send(input)}
            disabled={!input.trim() || isTyping}
            aria-label={t('tut.send')}
            className="hidden sm:flex p-3.5 rounded-2xl transition-all shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
          >
            <Send size={16} strokeWidth={2} />
          </button>
        </div>
        <div className="sm:hidden flex items-center gap-2 mt-2">
          <div className="flex flex-1 gap-1 p-1 rounded-lg" style={{ background: 'color-mix(in srgb, var(--ink) 5.5%, transparent)' }}>
            {MODES.map(({ id, titleKey }) => (
              <button
                key={id}
                onClick={() => changeMode(id)}
                className="flex-1 py-2 rounded-md text-[11px] font-semibold transition-all whitespace-nowrap min-h-[44px]"
                style={{
                  background: mode === id ? 'var(--card)' : 'transparent',
                  color: mode === id ? 'var(--ink)' : 'color-mix(in srgb, var(--ink) 70%, transparent)',
                }}
              >
                {t(titleKey)}
              </button>
            ))}
          </div>
          <button
            onClick={() => input.trim() && send(input)}
            disabled={!input.trim() || isTyping}
            aria-label={t('tut.send')}
            className="w-[46px] h-[46px] rounded-2xl flex items-center justify-center transition-all shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
          >
            <Send size={16} strokeWidth={2} />
          </button>
        </div>
        {!hasSpeechApi && (
          <p className="text-[11px] font-semibold text-center mt-1" style={{ color: 'var(--text-secondary)' }}>
            {t('ar.dictationUnsupported')}
          </p>
        )}
      </div>
    </div>
  );
};
