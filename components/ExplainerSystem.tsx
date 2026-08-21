
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { MessageCircle, Lightbulb, ClipboardList, BookOpen, Search, ChevronRight, Mic, Send, Volume2, Square, Copy, BookmarkPlus, Plus, Trash2, ArrowLeft, GraduationCap, X } from 'lucide-react';
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
import { resolveErrorMessage } from '../services/errorMessages';
import { SourceSelector } from './SourceSelector';
import { useTranslation } from '../i18n/I18nProvider';
import { localeTag } from '../i18n';
import { formatDate } from '../i18n/dates';
import type { TKey } from '../i18n';
import { documentDisplayName } from '../services/libraryService';
import { buildCollectionSource } from '../services/collectionSource';
import { toast } from '../services/toast';
import { buildLearningProfile } from '../services/learningProfileService';
import { getAllResults } from '../services/quizHistoryService';
import { getAllRecallResults } from '../services/recallHistoryService';
import { getAllExamResults } from '../services/examHistoryService';
import { getStreak } from '../services/streakService';
import { renderMarkdown } from './markdownRenderer';

// ─── Typen ────────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: 'user' | 'tutor';
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
}

const uid = (): string => Math.random().toString(36).slice(2, 9);

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
  availableDocuments, collections, getDocumentSource, onSaveToLibrary, initialDoc, metrics, decks, setDecks, onOpenReader,
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
  const profile = useMemo(() => buildLearningProfile({
    metrics, decks,
    quizResults: getAllResults(),
    recallResults: getAllRecallResults(),
    examResults: getAllExamResults(),
    streak: getStreak(),
  }), [metrics, decks]);
  const suggestions = useMemo(() =>
    profile.topicMastery.filter(t => t.security !== 'sicher').slice(0, 5),
  [profile.topicMastery]);

  useEffect(() => {
    if (initialDoc && getDocumentSource) {
      try {
        setActiveSource(getDocumentSource(initialDoc));
        setActiveSourceName(documentDisplayName(initialDoc));
        setSourceRef({ kind: 'doc', id: initialDoc.id });
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

  const filteredReaderDocs = useMemo(() => {
    const q = readerSearch.trim().toLowerCase();
    if (!q) return availableDocuments;
    return availableDocuments.filter(d => documentDisplayName(d).toLowerCase().includes(q));
  }, [availableDocuments, readerSearch]);

  const handleSelectDocument = (doc: ProcessedDocument) => {
    const source = getDocumentSource ? getDocumentSource(doc) : doc.type === 'pdf' ? { file: { data: doc.content, mimeType: 'application/pdf' } } : { text: doc.content };
    setActiveSource(source);
    setActiveSourceName(documentDisplayName(doc));
    setSourceRef({ kind: 'doc', id: doc.id });
  };

  // ── Sitzungs-Persistenz ──

  const persistSession = (msgs: ChatMessage[]) => {
    if (!msgs.length) return;
    if (!sessionIdRef.current) { sessionIdRef.current = uid(); sessionCreatedRef.current = Date.now(); }
    setSessions(saveTutorSession({
      id: sessionIdRef.current, mode, sourceName: activeSourceName, sourceRef, useExternal,
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
    setView('chat');
    inputRef.current?.focus();
  };

  // ── Nachrichten senden ──

  /** baseMessages: expliziter Basis-Stand, wenn send direkt nach einem Reset
   *  aufgerufen wird (Start-Screen) — der State wäre im selben Tick noch alt. */
  const send = async (text: string, baseMessages: ChatMessage[] = messages) => {
    const trimmed = text.trim();
    if (!trimmed || isTyping) return;
    if (!activeSource && !useExternal) { toast.error(t('ex.pleaseChooseDoc')); return; }

    const userMsg: ChatMessage = { id: uid(), role: 'user', content: trimmed, ts: Date.now() };
    const history = baseMessages.map(m => ({ role: m.role, content: m.content }));
    const withUser = [...baseMessages, userMsg];
    setMessages(withUser);
    setInput('');
    adjustTextarea();
    persistSession(withUser);
    setIsTyping(true);
    try {
      const raw = await chatWithTutor(activeSource, history, trimmed, {
        mode, useExternalKnowledge: useExternal, includeSourceQuote: !!activeSource,
      });
      const quote = activeSource ? extractSourceQuote(raw) : null;
      const withoutQuote = activeSource ? stripSourceQuoteLine(raw) : raw;
      const { content, followUps } = parseTutorResponse(withoutQuote);
      const tutorMsg: ChatMessage = {
        id: uid(), role: 'tutor',
        content: (content || raw).trim(),
        followUps: followUps ?? undefined,
        quote, ts: Date.now(),
      };
      const finalMessages = [...withUser, tutorMsg];
      setMessages(finalMessages);
      persistSession(finalMessages);
    } catch (e) {
      toast.error(resolveErrorMessage(e));
    } finally {
      setIsTyping(false);
    }
  };

  /** Vom Start-Screen loslegen: altes (per "Zurück" geparktes) Gespräch bleibt
   *  über die Sitzungsliste fortsetzbar, ein neuer Start beginnt bei null. */
  const startChat = (text?: string) => {
    setView('chat');
    if (text) {
      setMessages([]);
      sessionIdRef.current = null;
      sessionCreatedRef.current = Date.now();
      send(text, []);
    } else {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const backToStart = () => {
    stopSpeaking();
    try { speechRef.current?.stop(); } catch {}
    setView('start');
  };

  const startNewSession = () => {
    stopSpeaking();
    setMessages([]);
    sessionIdRef.current = null;
    sessionCreatedRef.current = Date.now();
    setInput('');
    setTimeout(() => inputRef.current?.focus(), 50);
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
    const existing = decks.find(d => d.title === title);
    const updatedDecks = existing
      ? decks.map(d => d.id === existing.id ? { ...d, cards: [...d.cards, card] } : d)
      : [...decks, { id: uid(), title, cards: [card], sourceDocumentId: sourceRef?.kind === 'doc' ? sourceRef.id : undefined }];
    setDecks(updatedDecks);
    localStorage.setItem('flashcard_decks', JSON.stringify(updatedDecks));
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

  // ── Render: Start ──

  if (view === 'start') {
    return (
      <div className="max-w-3xl mx-auto space-y-8 py-6 lg:py-10 px-4 animate-in fade-in duration-700">
        <div className="space-y-1">
          <h1 className="text-4xl lg:text-6xl font-black tracking-tighter dark:text-white">
            {t('nav.explainer')}
          </h1>
          <p className="text-sm text-slate-400 font-medium">{t('tut.subtitle')}</p>
        </div>

        {/* Modi */}
        <div className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('tut.chooseMode')}</p>
          <div className="grid sm:grid-cols-3 gap-3">
            {MODES.map(({ id, icon: Icon, titleKey, descKey }) => {
              const active = mode === id;
              return (
                <button
                  key={id}
                  onClick={() => setMode(id)}
                  className="text-left p-5 rounded-[20px] transition-all hover:scale-[1.02] space-y-2"
                  style={{
                    background: active ? 'color-mix(in srgb, var(--primary) 10%, var(--bg-sidebar))' : 'var(--bg-sidebar)',
                    border: `1px solid ${active ? 'color-mix(in srgb, var(--primary) 45%, transparent)' : 'var(--border-color)'}`,
                  }}
                >
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--primary) 12%, transparent)' }}>
                    <Icon size={20} style={{ color: 'var(--primary)' }} strokeWidth={1.75} />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-sm font-black dark:text-white">{t(titleKey)}</p>
                    <p className="text-[11px] text-slate-400 font-medium leading-snug">{t(descKey)}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Quelle */}
        {activeSource ? (
          <div className="flex items-center justify-between px-5 py-4 rounded-2xl" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}>
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: 'var(--primary)' }} />
              <span className="text-sm font-black break-words min-w-0" style={{ color: 'var(--primary)' }}>{activeSourceName}</span>
            </div>
            <button onClick={() => { setActiveSource(null); setActiveSourceName(''); setSourceRef(null); }} className="text-slate-400 hover:text-rose-500 transition-colors font-black text-xs shrink-0 ml-3">{t('ex.remove')}</button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('ex.chooseMaterial')}</p>
            <SourceSelector
              documents={availableDocuments} collections={collections}
              onSelectDocument={handleSelectDocument}
              onSelectSource={(source, name) => { setActiveSource(source); setActiveSourceName(name); setSourceRef(null); }}
              onSaveToLibrary={onSaveToLibrary} isLoading={false}
            />
          </div>
        )}

        {/* Wissensquelle */}
        <button
          onClick={() => setUseExternal(v => !v)}
          className="w-full flex items-center justify-between px-5 py-4 rounded-2xl transition-all hover:opacity-90"
          style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}
        >
          <div className="text-left space-y-0.5 min-w-0 pr-3">
            <p className="text-[10px] font-black uppercase tracking-widest dark:text-white">{t('ex.supplementGeneral')}</p>
            <p className="text-[10px] font-medium text-slate-400">
              {useExternal ? t('ex.supplementOn') : t('ex.supplementOff')}
            </p>
          </div>
          <div
            className="w-11 h-6 rounded-full p-0.5 shrink-0 transition-all"
            style={{ background: useExternal ? 'var(--primary)' : 'var(--border-color)' }}
          >
            <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${useExternal ? 'translate-x-5' : ''}`} />
          </div>
        </button>

        {/* Startfrage */}
        <div className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('ex.whatUnderstand')}</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && input.trim()) startChat(input); }}
              placeholder={t('ex.conceptPlaceholder')}
              className="flex-1 px-5 py-4 rounded-2xl text-base font-bold outline-none transition-all"
              style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)', color: 'var(--text-main)' }}
            />
            <button
              onClick={() => startChat(input.trim() || undefined)}
              aria-label={t('tut.send')}
              className="px-5 rounded-2xl text-white transition-all hover:scale-[1.03] shrink-0"
              style={{ background: 'var(--primary)' }}
            >
              <Send size={18} strokeWidth={2} />
            </button>
          </div>
          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {suggestions.map(s => (
                <button
                  key={s.topic}
                  onClick={() => setInput(s.topic)}
                  className="px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all hover:opacity-80"
                  style={{
                    background: `color-mix(in srgb, ${s.security === 'kritisch' ? '#f43f5e' : '#f59e0b'} 10%, var(--bg-sidebar))`,
                    color: s.security === 'kritisch' ? '#f43f5e' : '#f59e0b',
                    border: `1px solid color-mix(in srgb, ${s.security === 'kritisch' ? '#f43f5e' : '#f59e0b'} 25%, transparent)`,
                  }}
                >
                  {s.topic} · {t((`sec.${s.security}`) as TKey)}
                </button>
              ))}
            </div>
          )}
          {!activeSource && !useExternal && (
            <p className="text-center text-[10px] text-slate-400 font-medium pt-1">{t('ex.noDocHint')}</p>
          )}
        </div>

        {/* Letzte Sitzungen */}
        {sessions.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('tut.sessions')}</p>
            <div className="space-y-1.5">
              {sessions.slice(0, 5).map(s => (
                <div
                  key={s.id}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left"
                  style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}
                >
                  <button onClick={() => resumeSession(s)} className="flex-1 flex items-center gap-3 min-w-0 text-left">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'color-mix(in srgb, var(--primary) 12%, transparent)' }}>
                      <GraduationCap size={16} style={{ color: 'var(--primary)' }} strokeWidth={1.75} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-black truncate dark:text-white">{tutorSessionTitle(s, t('tut.session'))}</p>
                      <p className="text-[9px] font-medium text-slate-400 truncate">
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

        {/* Splitscreen-Reader */}
        <button
          onClick={() => availableDocuments.length > 0 ? setReaderPickerOpen(true) : toast.info(t('ex.landing.noDocs'))}
          className="w-full flex items-center justify-between px-5 py-3.5 rounded-2xl text-left transition-all hover:opacity-90"
          style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}
        >
          <span className="text-[10px] font-black uppercase tracking-widest dark:text-white">{t('ex.landing.readerTitle')}</span>
          <ChevronRight className="w-4 h-4 text-slate-300" strokeWidth={2} />
        </button>

        {/* Reader-Picker Overlay */}
        {readerPickerOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={() => setReaderPickerOpen(false)}>
            <div
              className="w-full max-w-md max-h-[70vh] flex flex-col rounded-[28px] p-5 space-y-3 animate-in fade-in zoom-in-95 duration-200"
              style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('ex.landing.readerTitle')}</p>
                <button onClick={() => setReaderPickerOpen(false)} className="text-slate-400 hover:text-rose-500 transition-colors"><X size={16} strokeWidth={2.5} /></button>
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
                    <BookOpen size={16} className="shrink-0" style={{ color: 'var(--primary)' }} strokeWidth={1.75} />
                    <span className="flex-1 min-w-0 text-xs font-black dark:text-white truncate">{documentDisplayName(doc)}</span>
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
        className="sticky top-0 z-20 -mx-4 px-4 py-3 mb-4 flex items-center gap-2 rounded-b-2xl"
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
          <p className="text-[9px] font-black uppercase tracking-widest truncate" style={{ color: 'var(--primary)' }}>
            {activeSourceName ? t('ex.fromSource', { source: activeSourceName }) : t('ex.fromGeneral')}
          </p>
          <p className="text-sm font-black truncate dark:text-white">{t(MODE_TITLE_KEY[mode])}</p>
        </div>
        {/* Modus-Wechsel mitten im Gespräch */}
        <div className="flex gap-1 p-1 rounded-xl shrink-0" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}>
          {MODES.map(({ id, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setMode(id)}
              aria-label={t(MODE_TITLE_KEY[id])}
              title={t(MODE_TITLE_KEY[id])}
              className="p-2 rounded-lg transition-all"
              style={{
                background: mode === id ? 'color-mix(in srgb, var(--primary) 16%, transparent)' : 'transparent',
                color: mode === id ? 'var(--primary)' : 'var(--text-main)',
                opacity: mode === id ? 1 : 0.55,
              }}
            >
              <Icon size={15} strokeWidth={2} />
            </button>
          ))}
        </div>
        <button
          onClick={startNewSession}
          aria-label={t('tut.newSession')}
          title={t('tut.newSession')}
          className="p-2.5 rounded-xl transition-colors shrink-0"
          style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)', color: 'var(--text-main)' }}
        >
          <Plus size={16} strokeWidth={2} />
        </button>
      </div>

      {/* Nachrichten */}
      <div className="flex-1 space-y-5 pb-4">
        {messages.length === 0 && !isTyping && (
          <div className="rounded-[28px] p-8 space-y-4 text-center" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}>
            <div className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--primary) 12%, transparent)' }}>
              <GraduationCap size={26} style={{ color: 'var(--primary)' }} strokeWidth={1.75} />
            </div>
            <p className="text-sm font-bold text-slate-600 dark:text-slate-300 max-w-md mx-auto leading-relaxed">
              {mode === 'explain' && t('tut.intro.explain')}
              {mode === 'socratic' && t('tut.intro.socratic')}
              {mode === 'quiz' && t('tut.intro.quiz')}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {mode === 'socratic' && (
                <button onClick={() => send(t('tut.start.socratic.q'))} className="px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-white transition-all hover:scale-[1.03]" style={{ background: 'var(--primary)' }}>
                  {t('tut.start.socratic')}
                </button>
              )}
              {mode === 'quiz' && (
                <button onClick={() => send(t('tut.start.quiz.q'))} className="px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-white transition-all hover:scale-[1.03]" style={{ background: 'var(--primary)' }}>
                  {t('tut.start.quiz')}
                </button>
              )}
              {suggestions.map(s => (
                <button
                  key={s.topic}
                  onClick={() => setInput(s.topic)}
                  className="px-3 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all hover:opacity-80"
                  style={{
                    background: `color-mix(in srgb, ${s.security === 'kritisch' ? '#f43f5e' : '#f59e0b'} 10%, var(--bg-sidebar))`,
                    color: s.security === 'kritisch' ? '#f43f5e' : '#f59e0b',
                    border: `1px solid color-mix(in srgb, ${s.security === 'kritisch' ? '#f43f5e' : '#f59e0b'} 25%, transparent)`,
                  }}
                >
                  {s.topic}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, idx) => (
          <div key={m.id} className={`flex gap-2.5 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {m.role === 'tutor' && (
              <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-1" style={{ background: 'color-mix(in srgb, var(--primary) 12%, transparent)' }}>
                <GraduationCap size={15} style={{ color: 'var(--primary)' }} strokeWidth={1.75} />
              </div>
            )}
            <div className={`min-w-0 ${m.role === 'user' ? 'max-w-[85%]' : 'flex-1 max-w-[92%]'}`}>
              {m.role === 'user' ? (
                <div
                  className="px-5 py-3.5 rounded-[20px] rounded-br-md text-sm font-bold whitespace-pre-wrap break-words"
                  style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
                >
                  {m.content}
                </div>
              ) : (
                <div className="rounded-[20px] rounded-bl-md overflow-hidden" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}>
                  <div className="px-5 py-4 text-sm leading-relaxed dark:text-white break-words [&_p]:mb-2 [&_p:last-child]:mb-0">
                    {renderMarkdown(m.content)}
                  </div>

                  {m.quote && (
                    <div className="mx-5 mb-4 rounded-xl p-3" style={{ background: 'color-mix(in srgb, var(--primary) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--primary) 25%, transparent)' }}>
                      <p className="text-[9px] font-black uppercase tracking-widest mb-1" style={{ color: 'var(--primary)' }}>
                        {activeSourceName ? t('ex.quoteFrom', { source: activeSourceName }) : t('ex.quoteLabel')}
                      </p>
                      <p className="text-xs font-medium italic text-slate-600 dark:text-slate-300 break-words">„{m.quote}"</p>
                    </div>
                  )}

                  {/* Follow-up-Chips nur unter der jüngsten Tutor-Antwort */}
                  {m.followUps && m.followUps.length > 0 && idx === lastTutorIdx && !isTyping && (
                    <div className="px-5 pb-4 flex flex-wrap gap-2">
                      {m.followUps.map(q => (
                        <button
                          key={q}
                          onClick={() => send(q)}
                          className="px-3 py-2 rounded-xl text-[10px] font-black transition-all hover:scale-[1.03] text-left"
                          style={{
                            background: 'color-mix(in srgb, var(--primary) 10%, transparent)',
                            color: 'var(--primary)',
                            border: '1px solid color-mix(in srgb, var(--primary) 25%, transparent)',
                          }}
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Aktionsleiste */}
                  <div className="px-4 py-2 flex items-center gap-1 border-t" style={{ borderColor: 'var(--border-color)' }}>
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
        ))}

        {/* Tutor denkt nach */}
        {isTyping && (
          <div className="flex gap-2.5 justify-start">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-1" style={{ background: 'color-mix(in srgb, var(--primary) 12%, transparent)' }}>
              <GraduationCap size={15} style={{ color: 'var(--primary)' }} strokeWidth={1.75} />
            </div>
            <div className="rounded-[20px] rounded-bl-md px-5 py-4 flex items-center gap-3" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}>
              <div className="flex gap-1.5">
                <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: 'var(--primary)', animationDelay: '0ms' }} />
                <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: 'var(--primary)', animationDelay: '150ms' }} />
                <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: 'var(--primary)', animationDelay: '300ms' }} />
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t(THINKING_KEYS[thinkingIdx])}</p>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div
        className="sticky bottom-0 z-20 -mx-4 px-4 pt-2 pb-3"
        style={{ background: 'linear-gradient(to top, var(--bg-main) 78%, transparent)' }}
      >
        {/* Quick-Actions */}
        {messages.length > 0 && !isTyping && (
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2">
            {QUICK_ACTIONS[mode].map(({ labelKey, msgKey }) => (
              <button
                key={labelKey}
                onClick={() => send(t(msgKey))}
                className="px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest whitespace-nowrap shrink-0 transition-all hover:opacity-80"
                style={{
                  background: 'var(--bg-sidebar)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-main)',
                }}
              >
                {t(labelKey)}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          {hasSpeechApi && (
            <button
              onClick={toggleListening}
              aria-label={t('tut.mic')}
              title={t('tut.mic')}
              className="p-3.5 rounded-2xl transition-all shrink-0"
              style={{
                background: isListening ? 'var(--primary)' : 'var(--bg-sidebar)',
                border: '1px solid var(--border-color)',
                color: isListening ? 'var(--primary-text)' : 'var(--text-main)',
              }}
            >
              <Mic size={16} strokeWidth={2} className={isListening ? 'animate-pulse' : ''} />
            </button>
          )}
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
          <button
            onClick={() => input.trim() && send(input)}
            disabled={!input.trim() || isTyping}
            aria-label={t('tut.send')}
            className="p-3.5 rounded-2xl transition-all shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
          >
            <Send size={16} strokeWidth={2} />
          </button>
        </div>
      </div>
    </div>
  );
};
