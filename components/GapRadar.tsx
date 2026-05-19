
import React, { useState, useMemo } from 'react';
import { TopicMetric, LearningAnalysis, ErrorPattern, ActiveTab } from '../types';
import { EmojiImage } from './EmojiImage';
import { analyzeLearningProgress } from '../services/geminiService';
import { toast } from '../services/toast';

interface GapRadarProps {
  metrics: TopicMetric[];
  onNavigate: (tab: ActiveTab) => void;
}

export const GapRadar: React.FC<GapRadarProps> = ({ metrics, onNavigate }) => {
  const [analysis, setAnalysis] = useState<LearningAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Strategische Berechnungen
  const stats = useMemo(() => {
    if (metrics.length === 0) return null;

    const sortedByConfidence = [...metrics].sort((a, b) => a.confidence - b.confidence);
    const averageConfidence = Math.round(metrics.reduce((acc, m) => acc + m.confidence, 0) / metrics.length);
    const biggestGap = sortedByConfidence[0];
    const toLearnToday = metrics.filter(m => m.confidence < 70 || (Date.now() - m.lastReviewed > 3 * 24 * 60 * 60 * 1000)).slice(0, 3);
    
    // Empfehlung + Ziel-Tab basierend auf Konfidenz
    let recommendation = "Starte ein Quiz zum schwächsten Thema.";
    let recommendedTab = ActiveTab.QUIZ;
    if (biggestGap.confidence < 40) {
      recommendation = "Nutze den KI-Erklärer für die Grundlagen.";
      recommendedTab = ActiveTab.EXPLAINER;
    } else if (biggestGap.confidence < 70) {
      recommendation = "Wiederhole die Karteikarten für diesen Bereich.";
      recommendedTab = ActiveTab.CARDS;
    }

    // Ziel-Tab für "Lücke schließen" ebenfalls dynamisch
    const gapTab = biggestGap.confidence < 40 ? ActiveTab.EXPLAINER
                 : biggestGap.confidence < 70  ? ActiveTab.CARDS
                 : ActiveTab.QUIZ;

    return {
      averageConfidence,
      biggestGap,
      toLearnToday,
      recommendation,
      recommendedTab,
      gapTab,
    };
  }, [metrics]);

  const handleRunAnalysis = async () => {
    if (metrics.length === 0) return;
    setIsAnalyzing(true);
    try {
      const res = await analyzeLearningProgress(metrics);
      setAnalysis(res);
    } catch (e) {
      toast.error('Analyse fehlgeschlagen. Bitte prüfe den API-Key.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (metrics.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32 space-y-6 opacity-30">
        <EmojiImage emoji="📊" size={64} />
        <div className="text-center space-y-2">
          <p className="font-black text-slate-400 uppercase text-xs tracking-widest">Keine Daten vorhanden</p>
          <p className="text-sm text-slate-500 max-w-xs mx-auto">Absolviere ein Quiz, um Daten für die Analyse zu generieren.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10 lg:space-y-16 animate-in fade-in duration-700 pb-20 px-4">
      {/* Header */}
      <div className="text-center space-y-4">
        <h1 className="text-5xl lg:text-7xl font-black text-slate-900 dark:text-white tracking-tighter">
          Lern <span className="text-indigo-600">Radar</span> <EmojiImage emoji="📡" size={48} />
        </h1>
        <p className="text-lg text-slate-500 dark:text-slate-400 font-medium opacity-80">
          Dein intelligenter Wegweiser zum Lernerfolg.
        </p>
      </div>

      {/* Strategic Overview Bento Grid */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Progress Card */}
          <div className="bg-white dark:bg-slate-900 p-8 rounded-[32px] border border-slate-200 dark:border-slate-800 shadow-3d-raised flex flex-col justify-between">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-6">Gesamtfortschritt</h3>
            <div className="relative w-24 h-24 mx-auto mb-4">
              <svg className="w-full h-full transform -rotate-90">
                <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-slate-100 dark:text-slate-800" />
                <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="8" fill="transparent" strokeDasharray={251.2} strokeDashoffset={251.2 - (251.2 * stats.averageConfidence) / 100} className="text-indigo-600 transition-all duration-1000" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center font-black text-2xl dark:text-white">{stats.averageConfidence}%</div>
            </div>
            <p className="text-[10px] text-center font-bold text-slate-400 uppercase">Meister-Niveau</p>
          </div>

          {/* Biggest Gap */}
          <div className="bg-white dark:bg-slate-900 p-8 rounded-[32px] border border-slate-200 dark:border-slate-800 shadow-3d-raised border-l-rose-500 border-l-4">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-rose-500 mb-4">Größte Wissenslücke</h3>
            <div className="space-y-2">
              <p className="text-xl font-black text-slate-900 dark:text-white truncate">{stats.biggestGap.topic}</p>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-tight">Nur {stats.biggestGap.confidence}% korrekt</p>
            </div>
            <button
              onClick={() => onNavigate(stats.gapTab)}
              className="mt-6 w-full py-3 bg-rose-50 dark:bg-rose-950/20 text-rose-600 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-rose-600 hover:text-white transition-all"
            >
              {stats.gapTab === ActiveTab.EXPLAINER ? 'KI-Erklärer öffnen →'
               : stats.gapTab === ActiveTab.CARDS    ? 'Karteikarten öffnen →'
               : 'Quiz starten →'}
            </button>
          </div>

          {/* Today's Focus */}
          <div className="bg-white dark:bg-slate-900 p-8 rounded-[32px] border border-slate-200 dark:border-slate-800 shadow-3d-raised">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-indigo-600 mb-4">Heute lernen</h3>
            <div className="space-y-3">
              {stats.toLearnToday.map((m, i) => (
                <div key={i} className="flex justify-between items-center text-xs font-bold dark:text-slate-300">
                  <span className="truncate pr-4">• {m.topic}</span>
                  <span className="text-indigo-600 shrink-0">{m.confidence}%</span>
                </div>
              ))}
              {stats.toLearnToday.length === 0 && <p className="text-xs text-slate-400 italic">Alles im grünen Bereich!</p>}
            </div>
          </div>

          {/* Next Session */}
          <div className="bg-indigo-600 p-8 rounded-[32px] shadow-3d-deep text-white flex flex-col justify-between">
            <h3 className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-4">Nächste Session</h3>
            <p className="text-lg font-bold leading-tight mb-4">"{stats.recommendation}"</p>
            <div className="flex items-center gap-2 mb-4">
              <EmojiImage emoji="✨" size={16} />
              <span className="text-[9px] font-black uppercase tracking-widest opacity-60">KI-Empfehlung</span>
            </div>
            <button
              onClick={() => onNavigate(stats.recommendedTab)}
              className="w-full py-3 bg-white/20 hover:bg-white/30 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-95"
            >
              Jetzt starten →
            </button>
          </div>
        </div>
      )}

      {/* Advanced Analysis Section */}
      <div className="pt-10 border-t border-slate-100 dark:border-slate-800 space-y-8">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="text-center sm:text-left">
            <h3 className="text-2xl font-black dark:text-white">Detaillierte Fehleranalyse</h3>
            <p className="text-sm text-slate-500">Lass die KI deine Antwortmuster tiefenanalysieren.</p>
          </div>
          <button 
            onClick={handleRunAnalysis}
            disabled={isAnalyzing}
            className="w-full sm:w-auto px-10 py-4 bg-slate-900 dark:bg-slate-700 text-white rounded-2xl font-black uppercase text-[11px] tracking-[0.2em] shadow-xl hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
          >
            {isAnalyzing ? "KI analysiert Muster..." : <span>Tiefenanalyse starten <EmojiImage emoji="✨" size={16} /></span>}
          </button>
        </div>

        {analysis && (
          <div className="space-y-12 animate-in slide-in-from-bottom-8 duration-700">
            <section className="bg-slate-900 dark:bg-slate-800 p-10 rounded-[40px] text-white dark:text-slate-100 shadow-3d-deep">
              <h2 className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-4">Psychologische Synthese</h2>
              <p className="text-xl lg:text-2xl font-medium leading-relaxed italic">"{analysis.overallHealth}"</p>
            </section>

            <div className="grid grid-cols-1 gap-8">
              {analysis.errorPatterns.map((error, idx) => (
                <div key={idx} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[40px] overflow-hidden shadow-3d-raised group hover:border-indigo-500/30 transition-all">
                  <div className="p-8 border-b border-slate-50 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/20">
                    <h4 className="text-xl font-black text-slate-900 dark:text-white">{error.pattern}</h4>
                    <span className="text-[10px] font-black bg-indigo-600 text-white px-4 py-1.5 rounded-full uppercase tracking-widest">{error.count} Vorkommnisse</span>
                  </div>
                  <div className="p-8 lg:p-12 grid grid-cols-1 lg:grid-cols-2 gap-12">
                    <div className="space-y-8">
                      <div>
                        <p className="text-[10px] font-black uppercase text-slate-400 mb-3 tracking-widest">Beschreibung</p>
                        <p className="text-base text-slate-600 dark:text-slate-300 leading-relaxed font-medium">{error.description}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-6 pt-4 border-t border-slate-50 dark:border-slate-800">
                        <div>
                          <p className="text-[10px] font-black uppercase text-slate-400 mb-2">Kern-Konzepte</p>
                          <div className="flex flex-wrap gap-2">
                            {error.concepts.map((c, i) => (
                              <span key={i} className="text-[10px] font-bold dark:text-slate-200">#{c}</span>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase text-slate-400 mb-2">Vermutete Ursache</p>
                          <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400">{error.probableCause}</p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="bg-indigo-50 dark:bg-indigo-900/10 p-8 rounded-[32px] border border-indigo-100 dark:border-indigo-800/50 relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-600/5 blur-3xl rounded-full"></div>
                      <p className="text-[10px] font-black uppercase text-indigo-600 dark:text-indigo-400 mb-4 tracking-widest">Empfohlene Lernaktion</p>
                      <h5 className="text-2xl font-black mb-4 dark:text-white leading-tight">{error.recommendedAction.type}</h5>
                      <div className="space-y-3">
                        <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Lernpsychologische Begründung</p>
                        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed font-medium italic">"{error.recommendedAction.reasoning}"</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
