
import React, { useState, useMemo, useEffect } from 'react';
import { ProcessedDocument, Collection, ScoringProfile, ScoringMode, ExamQuestion, TopicMetric, FlashcardDeck, ExamTypePreset, QuantModeConfig, QuantTypeDistribution, ExamTerm } from '../types';
import { nextExamForModule } from '../services/examTermService';
import { GenerationSource } from '../services/geminiService';
import { SourceSelector } from './SourceSelector';
import { getAllMeta, documentDisplayName } from '../services/libraryService';
import { useTranslation } from '../i18n/I18nProvider';
import { getTypeLabel } from '../services/learningProfileService';
import type { TKey } from '../i18n';
import { buildCollectionSource } from '../services/collectionSource';
import { buildLearningProfile, buildRealTopicMastery } from '../services/learningProfileService';
import { getStreak } from '../services/streakService';
import { sourceTopicsKey, getUsedTopics, getUsedExamQuestions } from '../hooks/useQuizState';
import { useModuleScopedActivity } from '../hooks/useModuleScopedActivity';
import {
  computeTopicWeights, computeDifficultyMix, recentAverageScore, excludeTopicsWithoutAdaptive,
  DIFFICULTY_LEVELS, TopicWeight, DifficultyMix, AdaptiveExamTarget,
} from '../services/examAdaptive';
import { PageHeader } from './PageHeader';

export type ExamOptions = {
  count: number; difficulty: string;
  types?: string[];
  adaptive?: { weakCategories: string[]; weakTopics: string[]; topicWeights?: TopicWeight[]; difficultyMix?: DifficultyMix };
  /** Vollständige Soll-Vorgabe für die Ist-vs-Soll-Anzeige (ExamView) und die Klausurhistorie. */
  adaptiveTarget?: AdaptiveExamTarget;
  excludeTopics?: string[];
  recentQuestions?: string[];
  examTypePreset?: ExamTypePreset;
  quantMode?: QuantModeConfig;
};

const EMPTY_DISMISSED = new Set<string>();

const EXAM_TYPE_PRESETS: ExamTypePreset[] = ['wissensabfrage', 'universitaetsklausur', 'transfer', 'gemischt'];

// Quantitativer Modus (Phase 1 Mathe-Ausbau): Presets nur als Vorschläge, kein starres
// Enum — quantSubject bleibt ein Freitextfeld (services/geminiService.ts buildQuantModeBlock).
const QUANT_SUBJECT_PRESETS = ['Mathematik', 'Statistik', 'Analysis', 'Lineare Algebra', 'Finanzmathematik', 'Physik', 'VWL', 'Ingenieurwesen', 'Informatik'];
const QUANT_TYPE_IDS: (keyof QuantTypeDistribution)[] = ['mc', 'numeric', 'expression', 'step_by_step', 'truefalse'];
const QUANT_TYPE_LABELS: Record<keyof QuantTypeDistribution, string> = {
  mc: 'Multiple Choice', numeric: 'Numerisch', expression: 'Term/Ausdruck', step_by_step: 'Rechenweg', truefalse: 'Wahr/Falsch',
};
// Phase 2: 5. Slider "Rechenweg" (step_by_step) dazu, Prozente neu balanciert.
// Begründung: MC (schnell auswertbar, breite Abdeckung) und Numerisch (Kernfertigkeit
// "richtiges Ergebnis berechnen") bleiben die größten Anteile. Rechenweg bekommt trotz
// höherem Bewertungsaufwand (KI-Call statt deterministisch) einen spürbaren Anteil, weil
// es das eigentliche USP dieser Phase ist (Bewertung des GANZEN Lösungswegs, nicht nur
// des Ergebnisses) — aber nicht so groß, dass eine Klausur nur noch aus zeitaufwändigen
// Herleitungsfragen besteht. Term/Ausdruck etwas reduziert, Wahr/Falsch bleibt kleinster
// Anteil als schnelle Auflockerung.
const DEFAULT_QUANT_DISTRIBUTION: QuantTypeDistribution = { mc: 30, numeric: 20, expression: 15, step_by_step: 25, truefalse: 10 };

interface ExamGeneratorProps {
  onGenerate: (content: GenerationSource, style?: GenerationSource, options?: ExamOptions, docName?: string, totalMinutes?: number, scoringProfile?: ScoringProfile) => void;
  isLoading: boolean;
  documents: ProcessedDocument[];
  collections: Collection[];
  getDocumentSource?: (doc: ProcessedDocument) => GenerationSource;
  onSaveToLibrary?: (file: File) => void;
  initialDoc?: ProcessedDocument;
  metrics: TopicMetric[];
  decks: FlashcardDeck[];
  examTerms?: ExamTerm[];
  /** Aktives Fach aus der Sidebar (Bug-Fix 2026-09-10) — Material- UND
   *  Altklausur-Stil-Auswahl zeigten bisher alle Dokumente kontoweit statt nur
   *  die des gewählten Fachs. null/undefined = "Alle Fächer", keine Einschränkung. */
  activeModuleId?: string | null;
}

const EXAM_TYPE_IDS: ExamQuestion['type'][] = ['mc', 'matching', 'truefalse', 'fillblank', 'ranking', 'numeric', 'open'];

export const ExamGenerator: React.FC<ExamGeneratorProps> = ({
  onGenerate,
  isLoading,
  documents,
  collections,
  getDocumentSource,
  onSaveToLibrary,
  initialDoc,
  metrics,
  decks,
  examTerms,
  activeModuleId = null,
}) => {
  const { t } = useTranslation();
  const moduleDocuments = useMemo(
    () => activeModuleId ? documents.filter(d => d.collectionId === activeModuleId) : documents,
    [documents, activeModuleId],
  );
  const [contentSource, setContentSource] = useState<GenerationSource | null>(null);
  const [contentName, setContentName] = useState('');

  useEffect(() => {
    if (initialDoc) {
      try {
        const source = getDocumentSource
          ? getDocumentSource(initialDoc)
          : initialDoc.type === 'pdf'
            ? { file: { data: initialDoc.content, mimeType: 'application/pdf' } }
            : { text: initialDoc.content };
        setContentSource(source);
        setContentName(initialDoc.name);
      } catch (_) {}
      return;
    }
    // Aktives Fach: Quelle direkt vorbelegen — kein Quellen-Klick nötig
    const moduleId = localStorage.getItem('studearc_active_module');
    const col = moduleId ? collections.find(c => c.id === moduleId) : null;
    if (col) {
      const result = buildCollectionSource(col, documents);
      if (result && result.includedCount > 0) {
        setContentSource(result.source);
        setContentName(result.name);
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [styleFile, setStyleFile] = useState<File | null>(null);
  const [styleLibDocId, setStyleLibDocId] = useState<string | null>(null);

  const altklausurDocs = useMemo(() => {
    const meta = getAllMeta();
    return moduleDocuments.filter(d => meta[d.id]?.isAltklausur);
  }, [moduleDocuments]);
  const [questionCount, setQuestionCount] = useState(10);
  const [difficulty, setDifficulty] = useState<'leicht' | 'mittel' | 'schwer'>('mittel');
  const [scoringMode, setScoringMode] = useState<ScoringMode>('standard');
  const [emphases, setEmphases] = useState<ScoringProfile['emphases']>([]);
  const [selectedTypes, setSelectedTypes] = useState<ExamQuestion['type'][]>([...EXAM_TYPE_IDS]);
  const [customMinutes, setCustomMinutes] = useState<number | null>(null);
  const [adaptiveEnabled, setAdaptiveEnabled] = useState(false);
  const [examTypePreset, setExamTypePreset] = useState<ExamTypePreset>('universitaetsklausur');

  // Quantitativer Modus (Phase 1 Mathe-Ausbau) — rein additiv: ist quantModeEnabled
  // false, ändert sich am bestehenden Generierungspfad nichts (kein quantMode in den
  // Options, exakt wie vorher).
  const [quantModeEnabled, setQuantModeEnabled] = useState(false);
  const [quantSubject, setQuantSubject] = useState('');
  const [quantAutoTopics, setQuantAutoTopics] = useState(true);
  const [quantTopics, setQuantTopics] = useState('');
  const [quantDistribution, setQuantDistribution] = useState<QuantTypeDistribution>(DEFAULT_QUANT_DISTRIBUTION);

  // Adaptive Signale bei aktivem Fach auf dessen Historie beschränken (gleiches Muster
  // wie ActiveRecall/GapRadar) — sonst landen schwache Bio-Themen als Mindestkontingent
  // in einer Statistik-Klausur und fremde Notenschnitte verschieben den Mix.
  const activeModuleCollection = useMemo(
    () => activeModuleId ? collections.find(c => c.id === activeModuleId) ?? null : null,
    [collections, activeModuleId],
  );
  const { quizResults, examResults, recallResults } = useModuleScopedActivity(activeModuleCollection, documents, EMPTY_DISMISSED);
  const profile = useMemo(() => buildLearningProfile({
    metrics, decks, quizResults, recallResults, examResults, streak: getStreak(),
  }), [metrics, decks, quizResults, recallResults, examResults]);
  // Echte Subthemen aus den gespeicherten Fragen — profile.topicMastery enthält
  // Dokumentnamen (Metriken werden pro Dokument geführt) und taugt nicht als Prompt-Thema.
  const realTopics = useMemo(
    () => buildRealTopicMastery(quizResults, examResults, recallResults),
    [quizResults, examResults, recallResults],
  );
  const recentAvgScore = useMemo(() => recentAverageScore(examResults.map(r => r.score), 5), [examResults]);
  const hasAdaptiveData = profile.categoryMastery.length > 0 || realTopics.length > 0 || examResults.length > 0;

  // Nächster Klausurtermin des aktiven Fachs (ohne aktives Fach: der nächste insgesamt),
  // Eingabe für computeDifficultyMix (Paket 11, Phase 3A). Termine tragen seit 2026-09
  // eine Fach-Zuordnung, s. services/examTermService.ts.
  const daysUntilNextExam = useMemo(() => {
    const activeModule = activeModuleId ? (collections ?? []).find(c => c.id === activeModuleId) ?? null : null;
    return nextExamForModule(examTerms ?? [], activeModule, new Date())?.days ?? null;
  }, [examTerms, activeModuleId, collections]);

  const adaptiveTarget = useMemo<AdaptiveExamTarget>(() => ({
    topicWeights: computeTopicWeights(realTopics, questionCount),
    difficultyMix: computeDifficultyMix(difficulty, recentAvgScore, daysUntilNextExam),
    signals: { recentAvgScore, daysUntilNextExam, examCount: examResults.length },
  }), [realTopics, questionCount, difficulty, recentAvgScore, daysUntilNextExam, examResults.length]);

  const autoMinutes = useMemo(() => {
    const baseTimePerQuestion = difficulty === 'leicht' ? 4 : difficulty === 'mittel' ? 6 : 9;
    return questionCount * baseTimePerQuestion + 5;
  }, [questionCount, difficulty]);
  // Bei Änderung von Fragenanzahl/Schwierigkeit den manuellen Timer-Override zurücksetzen
  useEffect(() => { setCustomMinutes(null); }, [questionCount, difficulty]);
  const effectiveMinutes = customMinutes ?? autoMinutes;

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
    });

  const processStyleFile = async (file: File): Promise<GenerationSource> => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') {
      const base64 = await fileToBase64(file);
      return { file: { data: base64, mimeType: 'application/pdf' } };
    }
    const text = await file.text();
    return { text };
  };

  const handleSelectDocument = (doc: ProcessedDocument) => {
    try {
      const source = getDocumentSource
        ? getDocumentSource(doc)
        : doc.type === 'pdf'
          ? { file: { data: doc.content, mimeType: 'application/pdf' } }
          : { text: doc.content };
      setContentSource(source);
      setContentName(documentDisplayName(doc));
    } catch (_) {}
  };

  const handleStart = async () => {
    if (!contentSource) return;
    try {
      let styleSource: GenerationSource | undefined;
      if (styleFile) {
        styleSource = await processStyleFile(styleFile);
      } else if (styleLibDocId) {
        const doc = documents.find(d => d.id === styleLibDocId);
        if (doc) {
          styleSource = getDocumentSource
            ? getDocumentSource(doc)
            : doc.type === 'pdf'
              ? { file: { data: doc.content, mimeType: 'application/pdf' } }
              : { text: doc.content };
        }
      }
      const scoringProfile: ScoringProfile = { mode: scoringMode, emphases };
      const adaptive = adaptiveEnabled ? {
        weakCategories: profile.categoryMastery.filter(c => c.avgScore < 60).map(c => c.category),
        weakTopics: realTopics.filter(t => t.security !== 'sicher').slice(0, 5).map(t => t.topic),
        topicWeights: adaptiveTarget.topicWeights,
        difficultyMix: adaptiveTarget.difficultyMix,
      } : undefined;
      // Wiederholungsgefahr wie beim Quiz: kürzlich aus derselben Quelle geprüfte
      // Themen nicht gleich nochmal abfragen (services/hooks/useQuizState.ts) —
      // außer sie sind adaptives Mindestkontingent, dann haben sie Vorrang.
      const usedTopics = contentName ? getUsedTopics(sourceTopicsKey(contentName)) : [];
      const excludeTopics = adaptive ? excludeTopicsWithoutAdaptive(usedTopics, adaptive.topicWeights) : usedTopics;
      // Ergänzt excludeTopics auf Fragenebene: verhindert inhaltlich äquivalente
      // Einzelfragen aus früheren Klausuren zu diesem Modul, die excludeTopics
      // allein (nur Themen-Labels) durchrutschen lässt.
      const recentQuestions = contentName ? getUsedExamQuestions(sourceTopicsKey(contentName)) : [];

      // Quantitativer Modus: überschreibt NUR die Fragetypen-Auswahl (auf die 4
      // quant-relevanten Typen mit tatsächlich gewünschtem Gewicht > 0) und gibt eine
      // zusätzliche quantMode-Konfiguration mit — alles andere (Bewertungsprofil,
      // Adaptiv, Altklausur-Stil, ...) bleibt unverändert nutzbar.
      const quantMode: QuantModeConfig | undefined = quantModeEnabled ? {
        enabled: true,
        subject: quantSubject.trim() || undefined,
        topics: quantAutoTopics ? undefined : (quantTopics.trim() || undefined),
        typeDistribution: quantDistribution,
      } : undefined;
      const quantSelectedTypes = QUANT_TYPE_IDS.filter(id => quantDistribution[id] > 0);
      const effectiveTypes = quantModeEnabled
        ? (quantSelectedTypes.length > 0 ? quantSelectedTypes : QUANT_TYPE_IDS)
        : selectedTypes;

      onGenerate(
        contentSource, styleSource,
        { count: questionCount, difficulty, types: effectiveTypes, adaptive, adaptiveTarget: adaptive ? adaptiveTarget : undefined, excludeTopics, recentQuestions, examTypePreset, quantMode },
        contentName, effectiveMinutes, scoringProfile
      );
    } catch (e) {
      console.error(e);
      throw e;
    }
  };

  const toggleType = (type: ExamQuestion['type']) => {
    setSelectedTypes(prev => {
      if (prev.includes(type)) {
        // Mindestens ein Typ muss aktiv bleiben
        return prev.length > 1 ? prev.filter(t => t !== type) : prev;
      }
      return [...prev, type];
    });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-10 lg:space-y-16 animate-in fade-in slide-in-from-bottom-4 duration-700 py-8 sm:py-10 px-4">
      <PageHeader eyebrow={t('nav.exam')} title={t('page.exam.title')} subtitle={t('eg.subtitle')} />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
        {/* Left: Quellauswahl + Altklausur */}
        <div className="lg:col-span-7 space-y-6">

          {/* Lernmaterial via SourceSelector */}
          <div className="rounded-[28px] border transition-all overflow-hidden"
            style={{ background: 'var(--bg-sidebar)', borderColor: contentSource ? 'var(--primary)' : 'var(--border-color)' }}>
            <div className="flex items-center gap-3 px-5 sm:px-7 pt-5 sm:pt-6 pb-1">
              <h3 className="text-[11px] font-black uppercase tracking-[0.2em]" style={{ color: 'var(--text-secondary)' }}>{t('eg.material')}</h3>
              {contentSource && (
                <div className="ml-auto flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/20 px-3 py-1.5 rounded-xl">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                  <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-black break-words max-w-[120px]">{contentName}</p>
                  <button onClick={() => { setContentSource(null); setContentName(''); }} className="text-emerald-400 hover:text-rose-500 transition-colors text-xs font-black ml-1">✕</button>
                </div>
              )}
            </div>
            <SourceSelector
              documents={moduleDocuments}
              collections={collections}
              onSelectDocument={handleSelectDocument}
              onSelectSource={(source, name) => { setContentSource(source); setContentName(name); }}
              onSaveToLibrary={onSaveToLibrary}
              isLoading={isLoading}
            />
          </div>

          {/* Altklausur (optional, Stil-Referenz) */}
          <div className={`p-5 sm:p-7 rounded-[28px] border transition-all flex flex-col gap-4 ${(styleFile || styleLibDocId) ? '' : 'border-dashed'}`}
            style={{ background: 'var(--bg-sidebar)', borderColor: (styleFile || styleLibDocId) ? 'var(--primary)' : 'var(--border-color)' }}>
            <div>
              <h3 className="text-[11px] font-black uppercase tracking-[0.2em]" style={{ color: 'var(--text-secondary)' }}>{t('card.oldExam')}</h3>
              <p className="text-[13px] mt-1" style={{ color: 'var(--text-secondary)' }}>{t('eg.oldExamOptional')}</p>
            </div>

            {/* Library Altklausur docs */}
            {altklausurDocs.length > 0 && (
              <div className="space-y-2">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{t('eg.fromLibrary')}</p>
                {altklausurDocs.map(d => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => { setStyleLibDocId(prev => prev === d.id ? null : d.id); setStyleFile(null); }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-[18px] border-2 transition-all text-left"
                    style={styleLibDocId === d.id
                      ? { borderColor: '#f43f5e', background: 'rgba(244,63,94,0.08)' }
                      : { borderColor: 'var(--border-color)', background: 'transparent' }
                    }
                  >
                    <div
                      className="w-4 h-4 rounded flex items-center justify-center shrink-0 border-2 transition-all"
                      style={styleLibDocId === d.id
                        ? { background: '#f43f5e', borderColor: '#f43f5e' }
                        : { borderColor: '#94a3b8' }
                      }
                    >
                      {styleLibDocId === d.id && (
                        <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                          <polyline points="1.5,5 4,7.5 8.5,2.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                    <span className="text-[10px] font-black break-words dark:text-white">{documentDisplayName(d)}</span>
                  </button>
                ))}
                <div className="flex items-center gap-3 my-1">
                  <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{t('eg.or')}</p>
                  <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                </div>
              </div>
            )}

            <input
              type="file"
              id="style-input"
              className="hidden"
              accept=".pdf,.docx,.txt,.md"
              onChange={(e) => { setStyleFile(e.target.files?.[0] || null); setStyleLibDocId(null); }}
            />
            <label
              htmlFor="style-input"
              className="w-full py-4 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-rose-600 hover:text-white transition-all text-center cursor-pointer shadow-sm"
            >
              {styleFile ? t('eg.changeFile') : t('eg.uploadFile')}
            </label>
            {styleFile ? (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 rounded-xl flex items-center gap-3">
                <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-black break-words">{styleFile.name}</p>
                <button type="button" onClick={() => setStyleFile(null)} className="ml-auto text-slate-400 hover:text-rose-500 text-xs font-black">✕</button>
              </div>
            ) : !styleLibDocId ? (
              <p className="text-[10px] text-slate-400 italic text-center">{t('eg.defaultStyle')}</p>
            ) : null}
          </div>
        </div>

        {/* Config Column */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-[24px] sm:rounded-[32px] border border-slate-200 dark:border-slate-800 shadow-3d-deep p-5 sm:p-8 space-y-8 sm:space-y-10">
            <h3 className="text-[11px] font-black uppercase tracking-[0.4em] text-indigo-500">{t('eg.setup')}</h3>

            <div className="space-y-6">
              <div className="space-y-3">
                <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <span>{t('eg.questionCount')}</span>
                  <span className="text-slate-900 dark:text-white">{questionCount}</span>
                </div>
                <div className="flex bg-slate-50 dark:bg-slate-800 p-1 rounded-2xl border shadow-inner">
                  {[5, 10, 15, 20].map(c => (
                    <button
                      key={c}
                      onClick={() => setQuestionCount(c)}
                      className={`flex-1 py-3 rounded-xl text-[10px] font-black transition-all ${questionCount === c ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <span>{t('quizSetup.difficulty')}</span>
                  <span className="text-slate-900 dark:text-white">{t((`diff.${difficulty}`) as TKey)}</span>
                </div>
                <div className="flex bg-slate-50 dark:bg-slate-800 p-1 rounded-2xl border shadow-inner">
                  {(['leicht', 'mittel', 'schwer'] as const).map(d => (
                    <button
                      key={d}
                      onClick={() => setDifficulty(d)}
                      className={`flex-1 py-3 rounded-xl text-[10px] font-black transition-all uppercase tracking-widest ${difficulty === d ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                      {t((`diff.${d}`) as TKey)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('eg.questionTypes')}</div>
                <div className="flex flex-wrap gap-2">
                  {EXAM_TYPE_IDS.map(id => {
                    const active = selectedTypes.includes(id);
                    return (
                      <button
                        key={id}
                        onClick={() => toggleType(id)}
                        className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border-2 transition-all ${active ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600' : 'border-slate-200 dark:border-slate-700 text-slate-400 hover:border-indigo-300'}`}
                      >
                        {active ? '✓ ' : ''}{getTypeLabel(id)}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-3">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('eg.examTypePreset')}</div>
                <div className="grid grid-cols-2 gap-2">
                  {EXAM_TYPE_PRESETS.map(p => (
                    <button
                      key={p}
                      onClick={() => setExamTypePreset(p)}
                      className={`py-3 px-2 rounded-xl text-[10px] font-black transition-all uppercase tracking-wide text-center leading-tight break-words [hyphens:auto] border-2 ${examTypePreset === p ? 'border-indigo-500 bg-indigo-600 text-white shadow-lg' : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-slate-600'}`}
                    >
                      {t((`eg.examType.${p}`) as TKey)}
                    </button>
                  ))}
                </div>
                <p className="text-[9px] text-slate-400 italic">{t((`eg.examTypeHint.${examTypePreset}`) as TKey)}</p>
              </div>

              {/* Quantitativer Modus (Phase 1 Mathe-Ausbau) — rein additiv, überschreibt
                  bei Aktivierung nur die Fragetypen-Auswahl oben (s. handleStart). */}
              <div className={`p-4 sm:p-5 rounded-[20px] border-2 transition-all space-y-4 ${quantModeEnabled ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20' : 'border-slate-200 dark:border-slate-700'}`}>
                <button
                  type="button"
                  onClick={() => setQuantModeEnabled(v => !v)}
                  className="w-full flex items-start gap-4 text-left"
                >
                  <div className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all ${quantModeEnabled ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 dark:border-slate-600'}`}>
                    {quantModeEnabled && (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><polyline points="1.5,5 4,7.5 8.5,2.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    )}
                  </div>
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-widest dark:text-white">{t('eg.quantMode')}</p>
                    <p className="text-[10px] text-slate-400 font-medium mt-1">{t('eg.quantModeHint')}</p>
                  </div>
                </button>

                {quantModeEnabled && (
                  <div className="space-y-5 animate-in fade-in slide-in-from-top-2 duration-300 pl-9">
                    {/* Fach */}
                    <div className="space-y-2">
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{t('eg.quantSubject')}</p>
                      <input
                        type="text"
                        value={quantSubject}
                        onChange={e => setQuantSubject(e.target.value)}
                        placeholder={t('eg.quantSubjectPlaceholder')}
                        list="quant-subject-presets"
                        className="w-full p-3 bg-white dark:bg-slate-800 rounded-xl border-2 border-slate-200 dark:border-slate-700 text-sm font-medium dark:text-white outline-none focus:border-indigo-500 transition-colors"
                      />
                      <datalist id="quant-subject-presets">
                        {QUANT_SUBJECT_PRESETS.map(s => <option key={s} value={s} />)}
                      </datalist>
                    </div>

                    {/* Themen */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{t('eg.quantTopics')}</p>
                        <button
                          type="button"
                          onClick={() => setQuantAutoTopics(v => !v)}
                          className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg transition-all ${quantAutoTopics ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}
                        >
                          {t('eg.quantTopicsAuto')}
                        </button>
                      </div>
                      {!quantAutoTopics && (
                        <input
                          type="text"
                          value={quantTopics}
                          onChange={e => setQuantTopics(e.target.value)}
                          placeholder={t('eg.quantTopicsPlaceholder')}
                          className="w-full p-3 bg-white dark:bg-slate-800 rounded-xl border-2 border-slate-200 dark:border-slate-700 text-sm font-medium dark:text-white outline-none focus:border-indigo-500 transition-colors"
                        />
                      )}
                    </div>

                    {/* Fragetyp-Verteilung */}
                    <div className="space-y-3">
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{t('eg.quantDistribution')}</p>
                      {QUANT_TYPE_IDS.map(id => (
                        <div key={id} className="flex items-center gap-3">
                          <span className="text-[10px] font-bold dark:text-slate-300 w-24 shrink-0">{QUANT_TYPE_LABELS[id]}</span>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            step={5}
                            value={quantDistribution[id]}
                            onChange={e => setQuantDistribution(prev => ({ ...prev, [id]: parseInt(e.target.value) }))}
                            className="flex-1 range-fill"
                            style={{ '--range-progress': `${quantDistribution[id]}%` } as React.CSSProperties}
                          />
                          <span className="text-[10px] font-black dark:text-white w-8 text-right shrink-0">{quantDistribution[id]}</span>
                        </div>
                      ))}
                      <p className="text-[9px] text-slate-400 italic">{t('eg.quantDistributionHint')}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Bewertungsprofil */}
            <div className="space-y-4">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('eg.scoringProfile')}</div>
              <div className="flex bg-slate-50 dark:bg-slate-800 p-1 rounded-2xl border shadow-inner">
                {([
                  { id: 'strict',   label: t('eg.scoreStrict') },
                  { id: 'standard', label: t('eg.scoreStandard') },
                  { id: 'lenient',  label: t('eg.scoreLenient') },
                ] as { id: ScoringMode; label: string }[]).map(m => (
                  <button
                    key={m.id}
                    onClick={() => setScoringMode(m.id)}
                    className={`flex-1 py-3 rounded-xl text-[10px] font-black transition-all uppercase tracking-widest break-words leading-tight ${scoringMode === m.id ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
                  >{m.label}</button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {([
                  { id: 'terms',        label: t('eg.emphTerms') },
                  { id: 'understanding', label: t('eg.emphUnderstanding') },
                  { id: 'examples',     label: t('eg.emphExamples') },
                  { id: 'definitions',  label: t('eg.emphDefinitions') },
                ] as { id: ScoringProfile['emphases'][number]; label: string }[]).map(e => {
                  const active = emphases.includes(e.id);
                  return (
                    <button
                      key={e.id}
                      onClick={() => setEmphases(prev => active ? prev.filter(x => x !== e.id) : [...prev, e.id])}
                      className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border-2 transition-all ${active ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600' : 'border-slate-200 dark:border-slate-700 text-slate-400 hover:border-indigo-300'}`}
                    >
                      {active ? '✓ ' : ''}{e.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-[9px] text-slate-400 italic">
                {scoringMode === 'strict'   ? t('eg.strictHint') : ''}
                {scoringMode === 'standard' ? t('eg.standardHint') : ''}
                {scoringMode === 'lenient'  ? t('eg.lenientHint') : ''}
              </p>
            </div>

            <div className="pt-8 border-t border-slate-50 dark:border-slate-800 space-y-3">
              <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-slate-400">
                <span>{t('eg.editTime')}</span>
                {customMinutes !== null && (
                  <button onClick={() => setCustomMinutes(null)} className="text-indigo-500 hover:text-indigo-700 normal-case tracking-normal font-bold">{t('eg.reset')}</button>
                )}
              </div>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setCustomMinutes(Math.max(10, effectiveMinutes - 5))}
                  className="w-11 h-11 rounded-2xl bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-black text-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-all shrink-0"
                >−</button>
                <p className="flex-1 text-center text-xl font-black dark:text-white">{effectiveMinutes} Min.</p>
                <button
                  onClick={() => setCustomMinutes(effectiveMinutes + 5)}
                  className="w-11 h-11 rounded-2xl bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-black text-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-all shrink-0"
                >+</button>
              </div>
            </div>

            {/* Adaptive Klausur — nur sichtbar mit genug Lernhistorie */}
            {hasAdaptiveData && (
              <div className={`p-5 rounded-[24px] border-2 transition-all space-y-4 ${adaptiveEnabled ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/20' : 'border-slate-200 dark:border-slate-700'}`}>
                <button
                  type="button"
                  onClick={() => setAdaptiveEnabled(v => !v)}
                  className="w-full flex items-start gap-4 text-left"
                >
                  <div className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all ${adaptiveEnabled ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 dark:border-slate-600'}`}>
                    {adaptiveEnabled && (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><polyline points="1.5,5 4,7.5 8.5,2.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    )}
                  </div>
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-widest dark:text-white">{t('eg.adaptive')}</p>
                    <p className="text-[10px] text-slate-400 font-medium mt-1">{t('eg.adaptiveHint')}</p>
                  </div>
                </button>

                {/* Live-Vorschau der Soll-Vorgabe: der Nutzer sieht vor dem Generieren,
                    was der Schalter konkret verändert, und kann es nach der Klausur
                    gegen die Ist-Verteilung (ExamView) prüfen. */}
                {adaptiveEnabled && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300 pl-9">
                    <div className="space-y-2">
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{t('eg.adaptivePreviewTopics')}</p>
                      {adaptiveTarget.topicWeights.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {adaptiveTarget.topicWeights.map(w => (
                            <span key={w.topic} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-[10px] font-bold bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-800 text-slate-700 dark:text-slate-200">
                              <span className="break-words">{w.topic}</span>
                              <span className="text-[9px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400 shrink-0">{t('eg.adaptiveMinCount', { n: w.minCount })}</span>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[10px] text-slate-400 italic">{t('eg.adaptiveNoTopics')}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{t('eg.adaptivePreviewMix')}</p>
                      <div className="flex h-2.5 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800">
                        <div className="bg-emerald-400" style={{ width: `${adaptiveTarget.difficultyMix.leicht}%` }} />
                        <div className="bg-amber-400" style={{ width: `${adaptiveTarget.difficultyMix.mittel}%` }} />
                        <div className="bg-rose-500" style={{ width: `${adaptiveTarget.difficultyMix.schwer}%` }} />
                      </div>
                      <div className="flex justify-between text-[9px] font-black uppercase tracking-widest">
                        {DIFFICULTY_LEVELS.map(level => (
                          <span key={level} className={level === 'leicht' ? 'text-emerald-600' : level === 'mittel' ? 'text-amber-600' : 'text-rose-600'}>
                            {t((`diff.${level}`) as TKey)} {adaptiveTarget.difficultyMix[level]}%
                          </span>
                        ))}
                      </div>
                    </div>

                    <p className="text-[10px] text-slate-400 font-medium">
                      {adaptiveTarget.signals.recentAvgScore != null
                        ? t('eg.adaptiveSignalScore', { score: Math.round(adaptiveTarget.signals.recentAvgScore), n: Math.min(adaptiveTarget.signals.examCount, 5) })
                        : t('eg.adaptiveSignalNoScore')}
                      {' · '}
                      {adaptiveTarget.signals.daysUntilNextExam != null
                        ? t('eg.adaptiveSignalExam', { days: adaptiveTarget.signals.daysUntilNextExam })
                        : t('eg.adaptiveSignalNoExam')}
                    </p>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={handleStart}
              disabled={!contentSource || isLoading}
              className="w-full py-5 rounded-[24px] font-black uppercase tracking-[0.2em] text-[12px] hover:scale-[1.01] transition-all disabled:opacity-40 disabled:cursor-not-allowed mt-4"
              style={{ background: 'var(--primary)', color: 'var(--primary-text)' }}
            >
              {isLoading ? (
                <div className="flex items-center justify-center gap-3">
                  <div className="w-4 h-4 border-2 border-slate-400 border-t-white rounded-full animate-spin"></div>
                  {t('eg.conception')}
                </div>
              ) : (
                <span className="flex items-center justify-center gap-3">
                  {t('eg.startSim')}
                </span>
              )}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};
