
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ProcessedDocument, Collection, RecallChallenge, RecallEvaluation } from '../types';
import type { GenerationSource } from '../services/geminiService';
import { generateRecallChallenge, evaluateRecallResponse } from '../services/geminiService';
import { SourceSelector } from './SourceSelector';
import { toast } from '../services/toast';

interface ActiveRecallProps {
  availableDocuments: ProcessedDocument[];
  collections: Collection[];
  getDocumentSource?: (doc: ProcessedDocument) => GenerationSource;
  onSaveToLibrary?: (file: File) => void;
  onComplete: (score: number, topic: string, missingPoints: string[]) => void;
  initialDoc?: ProcessedDocument;
}

export const ActiveRecall: React.FC<ActiveRecallProps> = ({
  availableDocuments,
  collections,
  getDocumentSource,
  onSaveToLibrary,
  onComplete,
  initialDoc,
}) => {
  const [activeSource, setActiveSource] = useState<GenerationSource | null>(null);
  const [activeSourceName, setActiveSourceName] = useState('');
  const [challenge, setChallenge] = useState<RecallChallenge | null>(null);
  const [userAnswer, setUserAnswer] = useState('');
  const [evaluation, setEvaluation] = useState<RecallEvaluation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [showFeynmanIntro, setShowFeynmanIntro] = useState(() =>
    !localStorage.getItem('quizwise_feynman_intro_done')
  );
  const [isListening, setIsListening] = useState(false);
  const speechRef = useRef<any>(null);
  const hasSpeechApi = typeof window !== 'undefined' && !!(
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  );

  useEffect(() => {
    if (!initialDoc || !getDocumentSource) return;
    try {
      const source = getDocumentSource(initialDoc);
      setActiveSource(source);
      setActiveSourceName(initialDoc.name.replace(/\.[^/.]+$/, ''));
    } catch (_) {}
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectDocument = async (doc: ProcessedDocument) => {
    const source = getDocumentSource
      ? getDocumentSource(doc)
      : doc.type === 'pdf'
        ? { file: { data: doc.content, mimeType: 'application/pdf' } }
        : { text: doc.content };
    setActiveSource(source);
    setActiveSourceName(doc.name);
  };

  const handleCancel = () => {
    setChallenge(null);
    setEvaluation(null);
    setUserAnswer('');
  };

  const dismissFeynmanIntro = () => {
    localStorage.setItem('quizwise_feynman_intro_done', '1');
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
    rec.lang = 'de-DE';
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e: any) => {
      const transcript = Array.from(e.results as SpeechRecognitionResultList)
        .slice(e.resultIndex)
        .map((r: any) => r[0].transcript)
        .join('');
      setUserAnswer(prev => prev ? prev + ' ' + transcript : transcript);
    };
    rec.onerror = () => setIsListening(false);
    rec.onend = () => setIsListening(false);
    speechRef.current = rec;
    rec.start();
    setIsListening(true);
  }, [hasSpeechApi, isListening]);

  const startNewChallenge = async () => {
    if (!activeSource) return;
    setIsLoading(true);
    setEvaluation(null);
    setUserAnswer('');
    try {
      const res = await generateRecallChallenge(activeSource);
      if (!res || !res.question) throw new Error('Ungültige Antwort der KI');
      setChallenge(res);
    } catch (e: any) {
      console.error('Recall Start Error:', e);
      toast.error('Herausforderung konnte nicht geladen werden. Versuche es erneut.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEvaluate = async () => {
    if (!challenge || !userAnswer.trim() || !activeSource) return;
    setIsEvaluating(true);
    try {
      const res = await evaluateRecallResponse(challenge, userAnswer, activeSource);
      setEvaluation(res);
      onComplete(res.score, activeSourceName || 'Recall Session', res.missingPoints ?? []);
    } catch (e: any) {
      console.error('Evaluation Error:', e);
      toast.error('Bewertung fehlgeschlagen. Versuche es erneut.');
    } finally {
      setIsEvaluating(false);
    }
  };

  return (
    <div className="max-w-[860px] mx-auto py-6 px-4 space-y-5 animate-in fade-in duration-500 pb-20">

      {/* Feynman First-Visit-Intro */}
      {showFeynmanIntro && (
        <div className="relative rounded-[18px] p-6 animate-in slide-in-from-top-4 duration-500" style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent)', borderLeftWidth: 4 }}>
          <button
            onClick={dismissFeynmanIntro}
            className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors font-black text-lg leading-none"
            aria-label="Schließen"
          >×</button>
          <p className="text-[9px] font-black uppercase tracking-widest mb-2" style={{ color: 'var(--accent)' }}>Feynman-Methode</p>
          <p className="text-sm font-medium dark:text-white leading-relaxed">
            Du lernst am besten, wenn du erklärst: Die Feynman-Methode besagt, dass du ein Thema erst wirklich verstanden hast, wenn du es einfach erklären kannst.
          </p>
          <p className="text-[11px] font-black mt-3 italic" style={{ color: 'var(--accent)' }}>
            Erkläre es so, dass es ein Zwölfjähriger versteht.
          </p>
          <button
            onClick={dismissFeynmanIntro}
            className="mt-4 px-4 py-2 rounded-[14px] text-[10px] font-black uppercase tracking-widest text-white transition-opacity hover:opacity-90"
            style={{ background: 'var(--accent)' }}
          >
            Verstanden — loslegen
          </button>
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-[22px] font-extrabold text-slate-900 dark:text-white">Active Recall</h1>
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-0.5">Feynman-Methode · Erkläre komplexe Konzepte in eigenen Worten</p>
      </div>

      {/* ── Phase 1: Quellenauswahl + Start ── */}
      {!challenge ? (
        <div className="space-y-6">
          {activeSource ? (
            <div className="rounded-[18px] p-5 flex items-center justify-between border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full shrink-0" style={{ background: 'var(--accent)' }} />
                <div>
                  <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Aktive Quelle</p>
                  <p className="text-sm font-black dark:text-white truncate max-w-xs">{activeSourceName}</p>
                </div>
              </div>
              <button
                onClick={() => { setActiveSource(null); setActiveSourceName(''); }}
                className="text-slate-300 hover:text-rose-500 transition-colors font-black text-sm"
              >✕</button>
            </div>
          ) : (
            <SourceSelector
              documents={availableDocuments}
              collections={collections}
              onSelectDocument={handleSelectDocument}
              onSelectSource={(source, name) => { setActiveSource(source); setActiveSourceName(name); }}
              onSaveToLibrary={onSaveToLibrary}
              isLoading={isLoading}
              label="Fokus wählen"
            />
          )}

          <div className="text-center">
            <button
              onClick={startNewChallenge}
              disabled={isLoading || !activeSource}
              className="w-full sm:w-auto px-10 py-4 rounded-[16px] font-black uppercase tracking-widest text-[11px] text-white transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: 'var(--card-primary)' }}
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-slate-400 border-t-white rounded-full animate-spin" />
                  Frage wird generiert...
                </span>
              ) : 'Drill starten →'}
            </button>
          </div>
        </div>

      ) : !evaluation ? (
        /* ── Phase 2: Challenge beantworten ── */
        <div className="space-y-6 lg:space-y-8 animate-in slide-in-from-bottom-6">

          {/* Quelle + Abbrechen */}
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ background: 'var(--accent)' }} />
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest truncate max-w-[200px]">{activeSourceName}</span>
            </div>
            <button
              onClick={handleCancel}
              className="text-[10px] font-black uppercase text-slate-400 hover:text-rose-500 tracking-widest transition-colors"
            >
              Abbrechen
            </button>
          </div>

          {/* Frage */}
          <div className="p-8 rounded-[18px] border" style={{ background: 'var(--card-primary)', borderColor: 'rgba(255,255,255,0.08)' }}>
            <h3 className="text-[9px] font-black uppercase tracking-[0.3em] mb-4 text-slate-400">Deine Herausforderung</h3>
            <p className="text-lg lg:text-2xl font-bold leading-snug tracking-tight text-white">{challenge.question}</p>
          </div>

          {/* Antwort-Textarea */}
          <div className="space-y-4">
            <div className="relative">
              <textarea
                autoFocus
                value={userAnswer}
                onChange={e => setUserAnswer(e.target.value)}
                placeholder="Formuliere deine Erklärung hier... oder diktiere mit dem Mikrofon →"
                disabled={isEvaluating}
                className="w-full h-64 lg:h-72 p-6 rounded-[18px] outline-none transition-all text-sm font-medium leading-relaxed disabled:opacity-60 dark:text-white"
                style={{ background: 'var(--surface)', border: isListening ? `2px solid var(--accent)` : `1px solid var(--border)`, color: 'var(--ink)' }}
              />
              {hasSpeechApi ? (
                <button
                  type="button"
                  onClick={toggleListening}
                  disabled={isEvaluating}
                  title={isListening ? 'Aufnahme stoppen' : 'Diktat starten (Deutsch)'}
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
                <div className="absolute bottom-4 right-4 w-10 h-10 rounded-full flex items-center justify-center bg-slate-100 dark:bg-slate-800 opacity-40" title="Diktat wird von deinem Browser nicht unterstützt">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
                  </svg>
                </div>
              )}
            </div>
            {isListening && (
              <p className="text-[10px] font-black uppercase tracking-widest text-center animate-pulse" style={{ color: 'var(--accent)' }}>
                Aufnahme läuft — sprich jetzt auf Deutsch
              </p>
            )}
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 px-4 lg:px-6">
              <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest order-2 sm:order-1">
                {userAnswer.trim().split(/\s+/).filter(x => x).length} Wörter
              </span>
              <button
                onClick={handleEvaluate}
                disabled={isEvaluating || userAnswer.trim().length < 10}
                className="w-full sm:w-auto px-8 py-3.5 rounded-[16px] font-black uppercase text-[10px] tracking-widest text-white transition-opacity hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed order-1 sm:order-2 flex items-center justify-center gap-2"
                style={{ background: 'var(--accent)' }}
              >
                {isEvaluating ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    KI analysiert...
                  </>
                ) : 'Antwort abgeben →'}
              </button>
            </div>
          </div>

          {/* Lade-Overlay während Bewertung */}
          {isEvaluating && (
            <div className="rounded-[18px] p-6 text-center animate-in fade-in duration-300 border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">KI liest dein Dokument und bewertet deine Antwort...</p>
            </div>
          )}
        </div>

      ) : (
        /* ── Phase 3: Ergebnis ── */
        <div className="space-y-6 lg:space-y-8 animate-in zoom-in-95 duration-500">

          {/* Score + Feedback */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-8 rounded-[18px] border flex flex-col items-center justify-center text-center" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
              <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-2">Abruf-Qualität</span>
              <span className="text-5xl lg:text-6xl font-black" style={{ color: evaluation.score >= 80 ? '#10b981' : evaluation.score >= 50 ? 'var(--accent)' : '#f43f5e' }}>
                {evaluation.score}%
              </span>
              <span className="text-[9px] font-black uppercase tracking-widest mt-2 text-slate-400">
                {evaluation.score >= 86 ? 'Exzellent' : evaluation.score >= 61 ? 'Gut' : evaluation.score >= 31 ? 'Grundverständnis' : 'Wiederholen'}
              </span>
            </div>
            <div className="md:col-span-2 p-8 rounded-[18px] border flex flex-col justify-center" style={{ background: 'var(--card-primary)', borderColor: 'rgba(255,255,255,0.08)' }}>
              <h3 className="text-[9px] font-black uppercase tracking-[0.3em] mb-3 text-slate-400">KI-Analyse</h3>
              <p className="text-base lg:text-lg font-medium leading-relaxed italic text-white">"{evaluation.feedback}"</p>
            </div>
          </div>

          {/* Stärken + Lücken */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-6 rounded-[18px] border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
              <h4 className="text-[9px] font-black uppercase text-emerald-500 tracking-widest mb-4 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Gute Ansätze
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
                <p className="text-xs text-slate-400 italic">Noch keine klaren Stärken identifiziert — versuch es ausführlicher.</p>
              )}
            </div>
            <div className="p-6 rounded-[18px] border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
              <h4 className="text-[9px] font-black uppercase text-rose-500 tracking-widest mb-4 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                Lücken identifiziert
              </h4>
              {evaluation.missingPoints.length > 0 ? (
                <ul className="space-y-2.5">
                  {evaluation.missingPoints.map((m, i) => (
                    <li key={i} className="flex gap-3 items-start">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-400 mt-1.5 shrink-0" />
                      <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 leading-normal">{m}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-emerald-500 font-semibold">Keine Lücken gefunden — vollständige Antwort!</p>
              )}
            </div>
          </div>

          {/* Lernempfehlung + Aktionen */}
          <div className="p-6 rounded-[18px] space-y-6" style={{ background: 'var(--surface)', border: '1px dashed var(--border)' }}>
            <div className="space-y-1.5 text-center">
              <h3 className="text-[9px] font-black uppercase tracking-[0.3em]" style={{ color: 'var(--accent)' }}>Lernempfehlung</h3>
              <p className="text-sm lg:text-base font-bold dark:text-white leading-relaxed max-w-2xl mx-auto">{evaluation.suggestedReview}</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => { setChallenge(null); setEvaluation(null); }}
                className="px-8 py-3 rounded-[14px] font-black uppercase text-[10px] tracking-widest text-white transition-opacity hover:opacity-90 flex items-center justify-center gap-2"
                style={{ background: 'var(--accent)' }}
              >
                Nächster Drill →
              </button>
              <button
                onClick={handleCancel}
                className="px-8 py-3 rounded-[14px] font-black uppercase text-[10px] tracking-widest transition-colors text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 flex items-center justify-center gap-2"
                style={{ border: '1px solid var(--border)' }}
              >
                Anderes Dokument
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
