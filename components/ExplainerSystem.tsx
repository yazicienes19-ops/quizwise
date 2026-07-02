
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ProcessedDocument, Collection, ExplanationEvaluation, TopicMetric, FlashcardDeck } from '../types';
import type { GenerationSource } from '../services/geminiService';
import { generateExplanation, evaluateStudentExplanation } from '../services/geminiService';
import { SourceSelector } from './SourceSelector';
import { toast } from '../services/toast';
import { buildLearningProfile } from '../services/learningProfileService';
import { getAllResults } from '../services/quizHistoryService';
import { getAllRecallResults } from '../services/recallHistoryService';
import { getAllExamResults } from '../services/examHistoryService';
import { getStreak } from '../services/streakService';

const INTRO_KEY = 'quizwise_feynman_intro_v1';

// ─── Markdown-Renderer (für KI-Erklärung) ────────────────────────────────────

function parseInline(text: string, baseKey: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`]+`)/g;
  let last = 0; let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const token = match[0]; const k = `${baseKey}-${match.index}`;
    if (token.startsWith('**'))      parts.push(<strong key={k} className="font-black text-slate-900 dark:text-white">{token.slice(2,-2)}</strong>);
    else if (token.startsWith('*'))  parts.push(<em key={k} className="italic text-slate-600 dark:text-slate-300">{token.slice(1,-1)}</em>);
    else                             parts.push(<code key={k} className="px-1.5 py-0.5 rounded-md text-[0.85em] font-mono bg-slate-100 dark:bg-slate-800 text-indigo-600 dark:text-indigo-300">{token.slice(1,-1)}</code>);
    last = match.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0; let key = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (line.startsWith('# '))   { blocks.push(<h2 key={key++} className="text-2xl lg:text-3xl font-black text-slate-900 dark:text-white tracking-tight mt-2">{parseInline(line.slice(2),String(key))}</h2>); i++; continue; }
    if (line.startsWith('## '))  { blocks.push(<h3 key={key++} className="text-xl lg:text-2xl font-black text-slate-900 dark:text-white tracking-tight mt-1">{parseInline(line.slice(3),String(key))}</h3>); i++; continue; }
    if (line.startsWith('### ')) { blocks.push(<h4 key={key++} className="text-base lg:text-lg font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider mt-1">{parseInline(line.slice(4),String(key))}</h4>); i++; continue; }
    if (line.match(/^(Grundlagen|Vertiefung|Kontext|Stufe\s*\d*|Phase\s*\d*)[\s:]/i)) {
      blocks.push(<h3 key={key++} className="text-xl lg:text-2xl font-black text-slate-900 dark:text-white tracking-tight mt-1">{parseInline(line,String(key))}</h3>); i++; continue;
    }
    if (line.startsWith('Allgemeinwissen:')) {
      const content: string[] = [line.replace('Allgemeinwissen:','').trim()]; i++;
      while (i < lines.length && lines[i].trim() && !lines[i].startsWith('#') && !lines[i].match(/^[-*•]\s/) && !lines[i].match(/^\d+\.\s/)) { content.push(lines[i]); i++; }
      blocks.push(<div key={key++} className="px-5 py-4 rounded-2xl" style={{ background:'color-mix(in srgb,var(--primary) 8%,transparent)', border:'1px solid color-mix(in srgb,var(--primary) 20%,transparent)' }}><p className="text-[9px] font-black uppercase tracking-widest mb-2" style={{ color:'var(--primary)' }}>Externes Wissen</p><p className="text-base font-medium text-slate-700 dark:text-slate-300 leading-relaxed">{parseInline(content.join(' '),String(key))}</p></div>);
      continue;
    }
    if (line.match(/^[-*•]\s/)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^[-*•]\s/)) { items.push(lines[i].replace(/^[-*•]\s/,'')); i++; }
      blocks.push(<ul key={key++} className="space-y-2 pl-1">{items.map((item,idx) => <li key={idx} className="flex gap-2.5 items-start text-base lg:text-lg font-medium text-slate-700 dark:text-slate-300 leading-relaxed"><span className="mt-2 w-1.5 h-1.5 rounded-full shrink-0" style={{ background:'var(--primary)' }}/><span>{parseInline(item,`${key}-${idx}`)}</span></li>)}</ul>);
      continue;
    }
    if (line.match(/^\d+\.\s/)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^\d+\.\s/)) { items.push(lines[i].replace(/^\d+\.\s/,'')); i++; }
      blocks.push(<ol key={key++} className="space-y-2 pl-1">{items.map((item,idx) => <li key={idx} className="flex gap-3 items-start text-base lg:text-lg font-medium text-slate-700 dark:text-slate-300 leading-relaxed"><span className="font-black shrink-0 w-6 text-right" style={{ color:'var(--primary)' }}>{idx+1}.</span><span>{parseInline(item,`${key}-${idx}`)}</span></li>)}</ol>);
      continue;
    }
    const paraLines: string[] = [line]; i++;
    while (i < lines.length && lines[i].trim() && !lines[i].startsWith('#') && !lines[i].match(/^[-*•]\s/) && !lines[i].match(/^\d+\.\s/) && !lines[i].startsWith('Allgemeinwissen:') && !lines[i].match(/^(Grundlagen|Vertiefung|Kontext|Stufe\s*\d*|Phase\s*\d*)[\s:]/i)) { paraLines.push(lines[i]); i++; }
    blocks.push(<p key={key++} className="text-base lg:text-lg font-medium text-slate-700 dark:text-slate-300 leading-relaxed">{parseInline(paraLines.join(' '),String(key))}</p>);
  }
  return <div className="space-y-5">{blocks}</div>;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = 'setup' | 'input' | 'evaluating' | 'result' | 'ai_explanation';
type InputMode = 'speech' | 'text';

interface ExplainerSystemProps {
  availableDocuments: ProcessedDocument[];
  collections: Collection[];
  getDocumentSource?: (doc: ProcessedDocument) => GenerationSource;
  onSaveToLibrary?: (file: File) => void;
  initialDoc?: ProcessedDocument;
  /** Wird nach jeder erfolgreichen KI-Bewertung aufgerufen — persistiert das Ergebnis. */
  onComplete?: (score: number, topic: string, missingPoints: string[]) => void;
  metrics: TopicMetric[];
  decks: FlashcardDeck[];
}

// ─── First-Visit Intro ────────────────────────────────────────────────────────

const FeynmanIntro: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
    <div className="w-full max-w-lg rounded-[40px] p-10 space-y-6 animate-in zoom-in-95 duration-300" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}>
      <div className="space-y-2">
        <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500">Feynman-Methode</p>
        <h2 className="text-3xl font-black dark:text-white leading-tight">Erklären ist die beste Art zu lernen.</h2>
      </div>
      <div className="space-y-4 text-sm font-medium text-slate-600 dark:text-slate-400 leading-relaxed">
        <p>
          Richard Feynman, Physik-Nobelpreisträger, hatte eine einfache Regel:
          <strong className="text-slate-900 dark:text-white"> Wenn du ein Konzept nicht in einfachen Worten erklären kannst, hast du es noch nicht wirklich verstanden.</strong>
        </p>
        <p>
          Hier funktioniert es so: Du wählst ein Thema aus deinen Unterlagen — dann erklärst du es selbst, so als würdest du es jemandem erklären der es noch nie gehört hat. Die KI vergleicht deine Erklärung mit dem Dokument und zeigt dir genau, was du bereits weißt und wo noch Lücken sind.
        </p>
        <div className="rounded-2xl p-4 space-y-2" style={{ background: 'color-mix(in srgb, var(--primary) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--primary) 20%, transparent)' }}>
          <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--primary)' }}>So geht's</p>
          <ol className="space-y-1 text-xs">
            <li>1. Dokument hochladen und Konzept eingeben</li>
            <li>2. Sprechen oder tippen — erkläre in eigenen Worten</li>
            <li>3. KI gibt dir sofort Feedback was gut war und was fehlt</li>
            <li>4. Nochmal versuchen oder nächstes Thema</li>
          </ol>
        </div>
      </div>
      <button
        onClick={onClose}
        className="w-full py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all"
        style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
      >
        Verstanden — loslegen
      </button>
    </div>
  </div>
);

// ─── Score-Ring ───────────────────────────────────────────────────────────────

const ScoreRing: React.FC<{ score: number }> = ({ score }) => {
  const r = 44; const circ = 2 * Math.PI * r;
  const color = score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444';
  return (
    <div className="relative w-28 h-28 shrink-0">
      <svg width="112" height="112" viewBox="0 0 112 112" className="-rotate-90">
        <circle cx="56" cy="56" r={r} fill="none" stroke="currentColor" strokeWidth="8" className="text-slate-100 dark:text-slate-800" />
        <circle cx="56" cy="56" r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - score / 100)}
          style={{ transition: 'stroke-dashoffset 1s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-black dark:text-white" style={{ color }}>{score}</span>
        <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">/ 100</span>
      </div>
    </div>
  );
};

// ─── Hauptkomponente ──────────────────────────────────────────────────────────

export const ExplainerSystem: React.FC<ExplainerSystemProps> = ({
  availableDocuments, collections, getDocumentSource, onSaveToLibrary, initialDoc, onComplete, metrics, decks,
}) => {
  const [showIntro, setShowIntro]         = useState(() => !localStorage.getItem(INTRO_KEY));
  const [step, setStep]                   = useState<Step>('setup');
  const [inputMode, setInputMode]         = useState<InputMode>('speech');
  const [activeSource, setActiveSource]   = useState<GenerationSource | null>(null);
  const [activeSourceName, setActiveSourceName] = useState('');
  const [concept, setConcept]             = useState('');
  const [studentText, setStudentText]     = useState('');
  const [transcript, setTranscript]       = useState(''); // live speech transcript
  const [isRecording, setIsRecording]     = useState(false);
  const [isLoading, setIsLoading]         = useState(false);
  const [evaluation, setEvaluation]       = useState<ExplanationEvaluation | null>(null);
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [speechSupported, setSpeechSupported] = useState(true);

  const recognitionRef = useRef<any>(null);

  // ── Lernprofil (für Vorschläge) + Erklärer-Verlauf ──
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
  const explainerHistory = useMemo(() =>
    getAllRecallResults().filter(r => r.method === 'explainer').slice(0, 5),
  []);
  const lastAttemptForConcept = useMemo(() => {
    const trimmed = concept.trim().toLowerCase();
    if (!trimmed) return null;
    return explainerHistory.find(r => r.topic.trim().toLowerCase() === trimmed) ?? null;
  }, [concept, explainerHistory]);

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setSpeechSupported(false); setInputMode('text'); }
  }, []);

  useEffect(() => {
    if (!initialDoc || !getDocumentSource) return;
    try {
      setActiveSource(getDocumentSource(initialDoc));
      setActiveSourceName(initialDoc.name.replace(/\.[^/.]+$/, ''));
    } catch (_) {}
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectDocument = (doc: ProcessedDocument) => {
    const source = getDocumentSource ? getDocumentSource(doc) : doc.type === 'pdf' ? { file: { data: doc.content, mimeType: 'application/pdf' } } : { text: doc.content };
    setActiveSource(source);
    setActiveSourceName(doc.name.replace(/\.[^/.]+$/, ''));
  };

  const closeIntro = () => {
    localStorage.setItem(INTRO_KEY, '1');
    setShowIntro(false);
  };

  // ── Sprache ──

  const startRecording = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = 'de-DE';
    rec.continuous = true;
    rec.interimResults = true;
    let finalText = studentText;
    rec.onresult = (e: any) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) { finalText += (finalText ? ' ' : '') + t; setStudentText(finalText); }
        else interim = t;
      }
      setTranscript(interim);
    };
    rec.onerror = (e: any) => {
      if (e.error === 'not-allowed') toast.error('Mikrofon-Zugriff verweigert. Bitte in den Browser-Einstellungen erlauben.');
      else if (e.error !== 'aborted') toast.error('Spracheingabe fehlgeschlagen.');
      setIsRecording(false);
      setTranscript('');
    };
    rec.onend = () => { setIsRecording(false); setTranscript(''); };
    recognitionRef.current = rec;
    rec.start();
    setIsRecording(true);
  }, [studentText]);

  const stopRecording = useCallback(() => {
    recognitionRef.current?.stop();
    setIsRecording(false);
    setTranscript('');
  }, []);

  // ── Bewertung ──

  const handleEvaluate = async () => {
    const text = studentText.trim();
    if (!text) { toast.error('Bitte zuerst deine Erklärung eingeben.'); return; }
    if (isRecording) stopRecording();
    setStep('evaluating');
    setEvaluation(null);
    try {
      const result = await evaluateStudentExplanation(activeSource, concept.trim(), text);
      setEvaluation(result);
      setStep('result');
      onComplete?.(result.score, concept.trim(), result.missing);
    } catch {
      toast.error('Bewertung fehlgeschlagen. Bitte erneut versuchen.');
      setStep('input');
    }
  };

  const handleShowAiExplanation = async () => {
    setStep('ai_explanation');
    if (aiExplanation) return;
    setIsLoading(true);
    try {
      const result = await generateExplanation(activeSource, concept.trim(), false);
      setAiExplanation(result);
    } catch {
      toast.error('Erklärung konnte nicht geladen werden.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRetry = () => {
    setStudentText('');
    setTranscript('');
    setEvaluation(null);
    setStep('input');
  };

  const handleNewConcept = () => {
    setConcept('');
    setStudentText('');
    setTranscript('');
    setEvaluation(null);
    setAiExplanation(null);
    setStep('setup');
  };

  const canStart = concept.trim().length > 2 && !!activeSource;

  // ── Render ──

  return (
    <div className="max-w-3xl mx-auto space-y-8 py-6 lg:py-10 px-4 animate-in fade-in duration-700 pb-32">

      {showIntro && <FeynmanIntro onClose={closeIntro} />}

      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-4xl lg:text-5xl font-black tracking-tighter dark:text-white">
          Erklären üben
        </h1>
        <p className="text-sm text-slate-400 font-medium">
          Erkläre ein Konzept in eigenen Worten — die KI zeigt dir wo du stehst.
        </p>
      </div>

      {/* ── SETUP ── */}
      {step === 'setup' && (
        <div className="space-y-5">

          {/* Dokument */}
          {activeSource ? (
            <div className="flex items-center justify-between px-5 py-4 rounded-2xl" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}>
              <div className="flex items-center gap-2.5">
                <div className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
                <span className="text-sm font-black text-indigo-600 dark:text-indigo-400 truncate max-w-[260px]">{activeSourceName}</span>
              </div>
              <button onClick={() => { setActiveSource(null); setActiveSourceName(''); }} className="text-slate-400 hover:text-rose-500 transition-colors font-black text-xs shrink-0 ml-3">Entfernen</button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Lernmaterial wählen</p>
              <SourceSelector
                documents={availableDocuments} collections={collections}
                onSelectDocument={handleSelectDocument}
                onSelectSource={(source, name) => { setActiveSource(source); setActiveSourceName(name); }}
                onSaveToLibrary={onSaveToLibrary} isLoading={false}
              />
            </div>
          )}

          {/* Vorschläge aus dem Lernprofil */}
          {suggestions.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Vorschläge aus deinem Lernprofil</p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map(s => (
                  <button
                    key={s.topic}
                    onClick={() => setConcept(s.topic)}
                    className="px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all hover:opacity-80"
                    style={{
                      background: `color-mix(in srgb, ${s.security === 'kritisch' ? '#f43f5e' : '#f59e0b'} 10%, var(--bg-sidebar))`,
                      color: s.security === 'kritisch' ? '#f43f5e' : '#f59e0b',
                      border: `1px solid color-mix(in srgb, ${s.security === 'kritisch' ? '#f43f5e' : '#f59e0b'} 25%, transparent)`,
                    }}
                  >
                    {s.topic} · {s.security}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Konzept */}
          <div className="space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Welches Konzept möchtest du erklären?</p>
            <input
              type="text"
              value={concept}
              onChange={e => setConcept(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && canStart) setStep('input'); }}
              placeholder="z.B. Kognitive Dissonanz, Mitose, Keynesian Economics…"
              className="w-full px-5 py-4 rounded-2xl text-base font-bold outline-none transition-all"
              style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)', color: 'var(--text-main)' }}
              autoFocus
            />
            {lastAttemptForConcept && (
              <p className="text-[10px] font-bold" style={{ color: 'var(--mute)' }}>
                Letzter Versuch: <strong style={{ color: lastAttemptForConcept.score >= 70 ? '#22c55e' : lastAttemptForConcept.score >= 40 ? '#f59e0b' : '#f43f5e' }}>{lastAttemptForConcept.score}%</strong>
                {' · '}{new Date(lastAttemptForConcept.timestamp).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })}
              </p>
            )}
          </div>

          <button
            onClick={() => setStep('input')}
            disabled={!canStart}
            className="w-full py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed"
            style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
          >
            Los geht's — Konzept erklären
          </button>

          {/* Hinweis warum Dokument fehlt */}
          {!activeSource && (
            <p className="text-center text-[10px] text-slate-400 font-medium">
              Dokument erforderlich damit die KI deine Erklärung mit dem Lernstoff vergleichen kann.
            </p>
          )}

          {/* Verlauf */}
          {explainerHistory.length > 0 && (
            <div className="pt-4 space-y-3 border-t" style={{ borderColor: 'var(--border-color)' }}>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Letzte Erklär-Sessions</p>
              <div className="space-y-1.5">
                {explainerHistory.map(r => (
                  <button
                    key={r.id}
                    onClick={() => setConcept(r.topic)}
                    className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-left transition-all hover:opacity-80"
                    style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}
                  >
                    <span className="text-xs font-bold truncate dark:text-white">{r.topic}</span>
                    <span className="flex items-center gap-2 shrink-0 ml-3">
                      <span className="text-[10px] font-black" style={{ color: r.score >= 70 ? '#22c55e' : r.score >= 40 ? '#f59e0b' : '#f43f5e' }}>{r.score}%</span>
                      <span className="text-[9px] font-medium text-slate-400">
                        {new Date(r.timestamp).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── INPUT ── */}
      {step === 'input' && (
        <div className="space-y-6">

          {/* Konzept-Header */}
          <div className="rounded-[28px] p-6 space-y-1" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Dein Thema</p>
            <p className="text-2xl font-black dark:text-white">{concept}</p>
            <p className="text-xs text-slate-400 font-medium">Erkläre es so, als würdest du es jemandem erklären der es noch nie gehört hat.</p>
          </div>

          {/* Modus-Tabs */}
          <div className="flex rounded-2xl p-1 gap-1" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}>
            {speechSupported && (
              <button
                onClick={() => setInputMode('speech')}
                className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${inputMode === 'speech' ? 'shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
                style={inputMode === 'speech' ? { background: 'var(--primary)', color: 'var(--primary-text)' } : {}}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
                </svg>
                Sprechen
              </button>
            )}
            <button
              onClick={() => { setInputMode('text'); if (isRecording) stopRecording(); }}
              className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${inputMode === 'text' ? 'shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
              style={inputMode === 'text' ? { background: 'var(--primary)', color: 'var(--primary-text)' } : {}}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="17" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="17" y1="18" x2="3" y2="18"/>
              </svg>
              Tippen
            </button>
          </div>

          {/* Spracheingabe */}
          {inputMode === 'speech' && (
            <div className="space-y-5">
              {/* Mic-Button */}
              <div className="flex flex-col items-center gap-4 py-6">
                <button
                  onClick={isRecording ? stopRecording : startRecording}
                  className={`w-24 h-24 rounded-full flex items-center justify-center transition-all shadow-lg ${isRecording ? 'scale-110' : 'hover:scale-105 active:scale-95'}`}
                  style={isRecording
                    ? { background: '#ef4444', boxShadow: '0 0 0 12px rgba(239,68,68,0.15), 0 0 0 24px rgba(239,68,68,0.05)' }
                    : { background: 'var(--primary)' }
                  }
                >
                  {isRecording ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="white" stroke="white" strokeWidth="0">
                      <rect x="6" y="6" width="12" height="12" rx="2"/>
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
                    </svg>
                  )}
                </button>
                <p className="text-sm font-black uppercase tracking-widest text-slate-500">
                  {isRecording ? 'Aufnahme läuft — tippe zum Stoppen' : 'Tippe zum Starten'}
                </p>
                {isRecording && (
                  <div className="flex gap-1">
                    {[...Array(5)].map((_,i) => (
                      <div key={i} className="w-1 rounded-full bg-rose-400" style={{ height: `${12 + Math.random()*16}px`, animation: `qw-bounce ${0.6 + i*0.1}s ease infinite alternate` }} />
                    ))}
                  </div>
                )}
              </div>

              {/* Live-Transkript + bisheriger Text */}
              {(studentText || transcript) && (
                <div className="rounded-[28px] p-5 space-y-2" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Deine Erklärung</p>
                  <p className="text-sm font-medium dark:text-white leading-relaxed">
                    {studentText}
                    {transcript && <span className="text-slate-400"> {transcript}</span>}
                  </p>
                  <button onClick={() => setStudentText('')} className="text-[9px] font-black uppercase tracking-widest text-slate-300 hover:text-rose-500 transition-colors">
                    Alles löschen
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Tipp-Eingabe */}
          {inputMode === 'text' && (
            <textarea
              value={studentText}
              onChange={e => setStudentText(e.target.value)}
              placeholder="Erkläre das Konzept hier in eigenen Worten — so als würdest du es einem Freund erklären der es noch nie gehört hat…"
              rows={8}
              className="w-full px-5 py-4 rounded-[28px] text-base font-medium outline-none transition-all resize-none"
              style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)', color: 'var(--text-main)' }}
              autoFocus
            />
          )}

          {/* Aktions-Buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleEvaluate}
              disabled={!studentText.trim()}
              className="flex-1 py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
            >
              Bewertung erhalten
            </button>
            <button
              onClick={handleNewConcept}
              className="px-5 py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest text-slate-400 border-2 border-slate-200 dark:border-slate-700 hover:border-slate-300 transition-all"
            >
              Abbruch
            </button>
          </div>
        </div>
      )}

      {/* ── EVALUATING ── */}
      {step === 'evaluating' && (
        <div className="flex flex-col items-center justify-center py-20 space-y-6 text-center">
          <div className="relative w-20 h-20">
            <div className="w-20 h-20 rounded-full" style={{ border: '6px solid var(--border-color)' }} />
            <div className="w-20 h-20 rounded-full absolute top-0 left-0 animate-spin" style={{ border: '6px solid var(--primary)', borderTopColor: 'transparent' }} />
          </div>
          <div className="space-y-1">
            <p className="text-lg font-black uppercase tracking-widest dark:text-white">KI analysiert…</p>
            <p className="text-sm text-slate-400 font-medium">Deine Erklärung wird mit dem Dokument verglichen</p>
          </div>
        </div>
      )}

      {/* ── RESULT ── */}
      {step === 'result' && evaluation && (
        <div className="space-y-5 animate-in fade-in duration-500">

          {/* Score */}
          <div className="rounded-[32px] p-6 flex items-center gap-6" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}>
            <ScoreRing score={evaluation.score} />
            <div className="space-y-1 min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{concept}</p>
              <p className={`text-xl font-black ${evaluation.score >= 70 ? 'text-emerald-600' : evaluation.score >= 40 ? 'text-amber-500' : 'text-rose-500'}`}>
                {evaluation.score >= 70 ? 'Gut erklärt' : evaluation.score >= 40 ? 'Teilweise korrekt' : 'Noch Lücken'}
              </p>
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400 leading-relaxed">{evaluation.feedback}</p>
            </div>
          </div>

          {/* Breakdown */}
          <div className="space-y-3">
            {evaluation.correct.length > 0 && (
              <div className="rounded-[24px] p-5 space-y-3" style={{ background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.2)' }}>
                <p className="text-[9px] font-black uppercase tracking-widest text-emerald-600">Das hast du richtig erklärt</p>
                <ul className="space-y-2">
                  {evaluation.correct.map((c, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm font-medium text-slate-700 dark:text-slate-300">
                      <span className="w-4 h-4 rounded bg-emerald-500 text-white flex items-center justify-center text-[9px] font-black shrink-0 mt-0.5">+</span>
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {evaluation.missing.length > 0 && (
              <div className="rounded-[24px] p-5 space-y-3" style={{ background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.2)' }}>
                <p className="text-[9px] font-black uppercase tracking-widest text-amber-600">Das hat gefehlt</p>
                <ul className="space-y-2">
                  {evaluation.missing.map((m, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm font-medium text-slate-700 dark:text-slate-300">
                      <span className="w-4 h-4 rounded bg-amber-400 text-white flex items-center justify-center text-[9px] font-black shrink-0 mt-0.5">!</span>
                      {m}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {evaluation.wrong.length > 0 && (
              <div className="rounded-[24px] p-5 space-y-3" style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)' }}>
                <p className="text-[9px] font-black uppercase tracking-widest text-rose-500">Das war ungenau oder falsch</p>
                <ul className="space-y-2">
                  {evaluation.wrong.map((w, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm font-medium text-slate-700 dark:text-slate-300">
                      <span className="w-4 h-4 rounded bg-rose-500 text-white flex items-center justify-center text-[9px] font-black shrink-0 mt-0.5">x</span>
                      {w}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Nächster Schritt */}
          {evaluation.nextSteps && (
            <div className="rounded-[24px] p-4 flex items-start gap-3" style={{ background: 'color-mix(in srgb, var(--primary) 6%, transparent)', border: '1px solid color-mix(in srgb, var(--primary) 15%, transparent)' }}>
              <div className="w-4 h-4 rounded shrink-0 mt-0.5 flex items-center justify-center" style={{ background: 'var(--primary)' }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              </div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300"><strong className="font-black dark:text-white">Nächster Schritt:</strong> {evaluation.nextSteps}</p>
            </div>
          )}

          {/* Aktionen */}
          <div className="flex flex-wrap gap-3 pt-2">
            <button
              onClick={handleRetry}
              className="flex-1 min-w-[140px] py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
            >
              Nochmal versuchen
            </button>
            <button
              onClick={handleShowAiExplanation}
              className="flex-1 min-w-[140px] py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest border-2 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-indigo-400 hover:text-indigo-600 transition-all"
            >
              Musterlösung zeigen
            </button>
            <button
              onClick={handleNewConcept}
              className="flex-1 min-w-[140px] py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest border-2 border-slate-200 dark:border-slate-700 text-slate-400 hover:border-slate-300 transition-all"
            >
              Neues Thema
            </button>
          </div>
        </div>
      )}

      {/* ── AI EXPLANATION ── */}
      {step === 'ai_explanation' && (
        <div className="space-y-5 animate-in fade-in duration-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500">Musterlösung</p>
              <h2 className="text-2xl font-black dark:text-white">{concept}</h2>
            </div>
            <div className="flex gap-2">
              {aiExplanation && (
                <button onClick={() => { navigator.clipboard.writeText(aiExplanation); toast.success('Kopiert!'); }}
                  className="p-3 rounded-xl text-slate-400 hover:text-indigo-500 transition-colors" title="Kopieren"
                  style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                </button>
              )}
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center gap-3 py-10 justify-center">
              <div className="w-6 h-6 rounded-full animate-spin" style={{ border: '3px solid var(--border-color)', borderTopColor: 'var(--primary)' }} />
              <span className="text-sm font-black uppercase tracking-widest text-slate-400">Wird geladen…</span>
            </div>
          ) : aiExplanation ? (
            <div className="rounded-[32px] p-8 space-y-6" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}>
              {renderMarkdown(aiExplanation)}
            </div>
          ) : null}

          <div className="flex gap-3">
            <button onClick={handleRetry} className="flex-1 py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all hover:scale-[1.02]" style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}>
              Nochmal versuchen
            </button>
            <button onClick={handleNewConcept} className="flex-1 py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest border-2 border-slate-200 dark:border-slate-700 text-slate-400 hover:border-slate-300 transition-all">
              Neues Thema
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
