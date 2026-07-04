
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ProcessedDocument, Collection, RecallChallenge, RecallEvaluation } from '../types';
import type { GenerationSource } from '../services/geminiService';
import { generateRecallChallenge, evaluateRecallResponse } from '../services/geminiService';
import { GeneratedImage } from './GeneratedImage';
import { SourceSelector } from './SourceSelector';
import { toast } from '../services/toast';
import { documentDisplayName } from '../services/libraryService';
import { buildRealTopicMastery } from '../services/learningProfileService';
import { getAllResults } from '../services/quizHistoryService';
import { getAllRecallResults } from '../services/recallHistoryService';
import { getAllExamResults } from '../services/examHistoryService';

interface ActiveRecallProps {
  availableDocuments: ProcessedDocument[];
  collections: Collection[];
  getDocumentSource?: (doc: ProcessedDocument) => GenerationSource;
  onSaveToLibrary?: (file: File) => void;
  onComplete: (score: number, topic: string, missingPoints: string[]) => void;
  /** Erstellt Karteikarten aus den identifizierten Lücken (wird in AppContent verdrahtet). */
  onCreateCardsFromGaps?: (topic: string, points: string[]) => void;
  initialDoc?: ProcessedDocument;
}

export const ActiveRecall: React.FC<ActiveRecallProps> = ({
  availableDocuments,
  collections,
  getDocumentSource,
  onSaveToLibrary,
  onComplete,
  onCreateCardsFromGaps,
  initialDoc,
}) => {
  const [activeSource, setActiveSource] = useState<GenerationSource | null>(null);
  const [activeSourceName, setActiveSourceName] = useState('');
  const [focusTopic, setFocusTopic] = useState('');

  // Schwache echte Themen als Fokus-Vorschläge (gleiche Quelle wie der Lern-Coach)
  const topicSuggestions = useMemo(() =>
    buildRealTopicMastery(getAllResults(), getAllExamResults(), getAllRecallResults())
      .filter(t => t.security !== 'sicher')
      .slice(0, 5),
  []);
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
      setActiveSourceName(documentDisplayName(initialDoc));
    } catch (_) {}
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
      const res = await generateRecallChallenge(activeSource, focusTopic.trim() || undefined);
      if (!res || !res.question) throw new Error('Ungültige Antwort');
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
      // Themen-Ebene: gewähltes Fokus-Thema als Topic speichern, sonst Quellname
      onComplete(res.score, focusTopic.trim() || activeSourceName || 'Recall Session', res.missingPoints ?? []);
    } catch (e: any) {
      console.error('Evaluation Error:', e);
      toast.error('Bewertung fehlgeschlagen. Versuche es erneut.');
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
            aria-label="Schließen"
          >×</button>
          <p className="text-[9px] font-black uppercase tracking-widest mb-2" style={{ color: 'var(--primary)' }}>Feynman-Methode</p>
          <p className="text-sm font-medium dark:text-white leading-relaxed">
            Du lernst am besten, wenn du erklärst: Die Feynman-Methode besagt, dass du ein Thema erst wirklich verstanden hast, wenn du es einfach erklären kannst.
          </p>
          <p className="text-[11px] font-black mt-3 italic" style={{ color: 'var(--primary)' }}>
            Erkläre es so, dass es ein Zwölfjähriger versteht.
          </p>
          <button
            onClick={dismissFeynmanIntro}
            className="mt-4 px-4 py-2 rounded-[14px] text-[10px] font-black uppercase tracking-widest transition-all hover:scale-105"
            style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
          >
            Verstanden — loslegen
          </button>
        </div>
      )}

      {/* Header */}
      <div className="text-center space-y-3">
        <h1 className="text-4xl lg:text-7xl font-black text-slate-900 dark:text-white tracking-tighter flex items-center justify-center gap-3">
          Active <span className="text-indigo-600">Recall</span>
          <GeneratedImage prompt="Human brain active recall, academic illustration" className="w-8 h-8 lg:w-12 lg:h-12 rounded-xl" />
        </h1>
        <p className="text-base text-slate-500 dark:text-slate-400 font-medium opacity-80">Erkläre komplexe Konzepte in eigenen Worten</p>
      </div>

      {/* ── Phase 1: Quellenauswahl + Start ── */}
      {!challenge ? (
        <div className="space-y-6">
          {activeSource ? (
            <div className="rounded-[32px] p-6 flex items-center justify-between shadow-3d-raised" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}>
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-indigo-500 shrink-0" />
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

          {/* Fokus-Thema (optional) + Vorschläge aus dem Lernprofil */}
          {activeSource && (
            <div className="space-y-3">
              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Fokus-Thema (optional)</p>
                <input
                  type="text"
                  value={focusTopic}
                  onChange={e => setFocusTopic(e.target.value)}
                  placeholder="z.B. Operante Konditionierung — leer lassen für freie Themenwahl"
                  className="w-full px-5 py-4 rounded-2xl text-base font-bold outline-none transition-all"
                  style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)', color: 'var(--text-main)' }}
                />
              </div>
              {topicSuggestions.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {topicSuggestions.map(t => (
                    <button
                      key={t.topic}
                      onClick={() => setFocusTopic(t.topic)}
                      className="px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all hover:opacity-80"
                      style={{
                        background: `color-mix(in srgb, ${t.security === 'kritisch' ? '#f43f5e' : '#f59e0b'} 10%, var(--bg-sidebar))`,
                        color: t.security === 'kritisch' ? '#f43f5e' : '#f59e0b',
                        border: `1px solid color-mix(in srgb, ${t.security === 'kritisch' ? '#f43f5e' : '#f59e0b'} 25%, transparent)`,
                      }}
                    >
                      {t.topic} · {t.security}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="text-center">
            <button
              onClick={startNewChallenge}
              disabled={isLoading || !activeSource}
              className="w-full sm:w-auto px-8 lg:px-10 py-4 lg:py-5 rounded-2xl lg:rounded-3xl font-black uppercase tracking-[0.2em] text-[10px] lg:text-[11px] shadow-3d-deep hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
              style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
            >
              {isLoading ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin"></div>
                  Frage wird generiert...
                </div>
              ) : (
                <span className="flex items-center gap-2">
                  Drill starten
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
          <div className="bg-indigo-600 p-8 lg:p-12 rounded-[32px] lg:rounded-[40px] shadow-3d-deep relative overflow-hidden border border-indigo-500">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 blur-3xl rounded-full translate-x-12 -translate-y-12" />
            <h3 className="text-[9px] lg:text-[10px] font-black uppercase tracking-[0.3em] mb-4" style={{ color: 'var(--primary-text)', opacity: 0.6 }}>Deine Herausforderung</h3>
            <p className="text-lg lg:text-2xl font-bold leading-snug tracking-tight" style={{ color: 'var(--primary-text)' }}>{challenge.question}</p>
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
                className="w-full h-64 lg:h-72 p-6 lg:p-10 rounded-[32px] lg:rounded-[40px] shadow-3d-raised outline-none focus:border-indigo-400 transition-all text-sm lg:text-base font-medium leading-relaxed disabled:opacity-60"
                style={{ background: 'var(--bg-sidebar)', border: isListening ? '2px solid var(--primary)' : '1px solid var(--border-color)', color: 'var(--text-main)' }}
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
              <p className="text-[10px] font-black uppercase tracking-widest text-center animate-pulse" style={{ color: 'var(--primary)' }}>
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
                className="w-full sm:w-auto bg-indigo-600 px-8 lg:px-10 py-3.5 rounded-xl lg:rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg hover:scale-105 active:scale-95 transition-all disabled:opacity-30 order-1 sm:order-2 flex items-center justify-center gap-2"
                style={{ color: 'var(--primary-text)' }}
              >
                {isEvaluating ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Analyse läuft …
                  </>
                ) : (
                  <>
                    Antwort abgeben
                    <GeneratedImage prompt="Checkmark icon, minimalist" className="w-4 h-4 rounded-full" />
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Lade-Overlay während Bewertung */}
          {isEvaluating && (
            <div className="rounded-[32px] p-6 text-center animate-in fade-in duration-300" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}>
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Deine Antwort wird mit dem Dokument abgeglichen …</p>
            </div>
          )}
        </div>

      ) : (
        /* ── Phase 3: Ergebnis ── */
        <div className="space-y-6 lg:space-y-8 animate-in zoom-in-95 duration-500">

          {/* Score + Feedback */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-8 lg:p-10 rounded-[32px] lg:rounded-[40px] shadow-3d-raised flex flex-col items-center justify-center text-center" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}>
              <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-2">Abruf-Qualität</span>
              <span className={`text-5xl lg:text-6xl font-black ${evaluation.score >= 80 ? 'text-emerald-500' : evaluation.score >= 50 ? 'text-indigo-500' : 'text-rose-500'}`}>
                {evaluation.score}%
              </span>
              <span className="text-[9px] font-black uppercase tracking-widest mt-2 text-slate-400">
                {evaluation.score >= 86 ? 'Exzellent' : evaluation.score >= 61 ? 'Gut' : evaluation.score >= 31 ? 'Grundverständnis' : 'Wiederholen'}
              </span>
            </div>
            <div className="md:col-span-2 bg-indigo-600 p-8 lg:p-10 rounded-[32px] lg:rounded-[40px] shadow-3d-deep flex flex-col justify-center border border-indigo-500">
              <h3 className="text-[9px] font-black uppercase tracking-[0.3em] mb-3" style={{ color: 'var(--primary-text)', opacity: 0.6 }}>Feedback</h3>
              <p className="text-base lg:text-lg font-medium leading-relaxed italic" style={{ color: 'var(--primary-text)' }}>"{evaluation.feedback}"</p>
            </div>
          </div>

          {/* Stärken + Lücken */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-8 rounded-[32px]" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}>
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
            <div className="p-8 rounded-[32px]" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}>
              <h4 className="text-[9px] font-black uppercase text-rose-500 tracking-widest mb-4 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                Lücken identifiziert
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
                      onClick={() => onCreateCardsFromGaps(focusTopic.trim() || activeSourceName || 'Recall', evaluation.missingPoints)}
                      className="mt-4 w-full py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-[0.98]"
                      style={{ background: 'color-mix(in srgb, var(--primary) 12%, transparent)', color: 'var(--primary)', border: '1px solid color-mix(in srgb, var(--primary) 30%, transparent)' }}
                    >
                      Lücken als Karteikarten sichern →
                    </button>
                  )}
                </>
              ) : (
                <p className="text-xs text-emerald-500 font-semibold">Keine Lücken gefunden — vollständige Antwort!</p>
              )}
            </div>
          </div>

          {/* Lernempfehlung + Aktionen */}
          <div className="p-8 lg:p-10 rounded-[32px] lg:rounded-[40px] space-y-6" style={{ background: 'var(--bg-sidebar)', border: '1px dashed var(--border-color)' }}>
            <div className="space-y-1.5 text-center">
              <h3 className="text-[9px] font-black uppercase text-indigo-500 tracking-[0.3em]">Lernempfehlung</h3>
              <p className="text-sm lg:text-base font-bold dark:text-white leading-relaxed max-w-2xl mx-auto">{evaluation.suggestedReview}</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => { setChallenge(null); setEvaluation(null); }}
                className="bg-indigo-600 px-8 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg hover:scale-105 transition-all flex items-center justify-center gap-2"
                style={{ color: 'var(--primary-text)' }}
              >
                Nächster Drill
                <GeneratedImage prompt="Arrow right icon, minimalist" className="w-4 h-4 rounded-full" />
              </button>
              <button
                onClick={handleCancel}
                className="px-8 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all flex items-center justify-center gap-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                style={{ border: '1px solid var(--border-color)' }}
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
