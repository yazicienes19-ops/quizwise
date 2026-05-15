
import React, { useState, useEffect, useRef } from 'react';
import { PaperOutlineSection, AcademicSource, CitationStyle, SearchResult, ProcessedDocument, MultiStyleCitation } from '../types';
import { EmojiImage } from './EmojiImage';
import { generatePaperOutline, formatCitation, GenerationSource, magicFormatCitation } from '../services/geminiService';

interface TermPaperSystemProps {
  availableDocuments: ProcessedDocument[];
  onUploadNew: (file: File) => void;
  initialSources?: SearchResult[];
}

export const TermPaperSystem: React.FC<TermPaperSystemProps> = ({ 
  availableDocuments, 
  onUploadNew,
  initialSources = [] 
}) => {
  const [step, setStep] = useState<'setup' | 'planner' | 'citations' | 'magic'>('setup');
  const [topic, setTopic] = useState('');
  const [focus, setFocus] = useState('');
  const [manualText, setManualText] = useState('');
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [outline, setOutline] = useState<PaperOutlineSection[]>([]);
  const [sources, setSources] = useState<AcademicSource[]>([]);
  const [formattedCitations, setFormattedCitations] = useState<{ [id: string]: string }>({});
  const [citationStyle, setCitationStyle] = useState<CitationStyle>('APA');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isFormatting, setIsFormatting] = useState(false);

  // Magic Citation State
  const [magicInput, setMagicInput] = useState('');
  const [magicResult, setMagicResult] = useState<MultiStyleCitation | null>(null);
  const [isMagicLoading, setIsMagicLoading] = useState(false);

  // Manual Citation Form State
  const [manualAuthor, setManualAuthor] = useState('');
  const [manualTitle, setManualTitle] = useState('');
  const [manualYear, setManualYear] = useState('');
  const [manualJournal, setManualJournal] = useState('');
  const [manualUrl, setManualUrl] = useState('');

  useEffect(() => {
    if (initialSources.length > 0) {
      const newOnes = initialSources.map((s, idx) => ({
        id: `source-${idx}-${Date.now()}`,
        title: s.title,
        authors: s.authors,
        year: s.year,
        journal: s.journal,
        url: s.url,
        snippet: s.snippet,
        apaCitation: s.apaCitation,
        type: 'article' as const
      }));
      setSources(prev => {
        const currentUrls = new Set(prev.map(p => p.url));
        return [...prev, ...newOnes.filter(n => !currentUrls.has(n.url))];
      });
    }
  }, [initialSources]);

  const handleCreateOutline = async () => {
    if (!topic) return alert("Thema angeben!");
    setIsGenerating(true);
    try {
      const selectedDocs = availableDocuments.filter(d => selectedDocIds.includes(d.id));
      const genSources: GenerationSource[] = selectedDocs.map(d => 
        d.type === 'pdf' ? { file: { data: d.content, mimeType: 'application/pdf' } } : { text: d.content }
      );
      if (manualText.trim()) genSources.push({ text: manualText });
      const res = await generatePaperOutline(topic, focus, genSources);
      setOutline(res);
      setStep('planner');
    } catch (e) {
      alert("Fehler bei Gliederung.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleMagicFormat = async () => {
    if (!magicInput.trim()) return;
    setIsMagicLoading(true);
    try {
      const res = await magicFormatCitation(magicInput);
      setMagicResult(res);
    } catch (e) {
      alert("Fehler beim KI-Zitieren.");
    } finally {
      setIsMagicLoading(false);
    }
  };

  const addManualCitation = async () => {
    if (!manualTitle || !manualAuthor) return alert("Autor und Titel sind Pflicht!");
    setIsFormatting(true);
    const newSource: AcademicSource = {
      id: `manual-${Date.now()}`,
      authors: manualAuthor,
      title: manualTitle,
      year: manualYear || new Date().getFullYear().toString(),
      journal: manualJournal,
      url: manualUrl,
      type: 'article',
      snippet: '',
      apaCitation: ''
    };

    try {
      const formatted = await formatCitation(newSource, citationStyle);
      setSources(prev => [newSource, ...prev]);
      setFormattedCitations(prev => ({ ...prev, [newSource.id]: formatted }));
      setManualAuthor(''); setManualTitle(''); setManualYear(''); setManualJournal(''); setManualUrl('');
    } catch (e) {
      alert("Zitier-Fehler.");
    } finally {
      setIsFormatting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert("Kopiert!");
  };

  return (
    <div className="space-y-10 animate-in fade-in duration-700 pb-20">
      <div className="text-center space-y-3">
        <h1 className="text-5xl font-black text-slate-900 dark:text-white tracking-tighter">
          Hausarbeit <span className="text-emerald-600 drop-shadow-md">Professional</span> <EmojiImage emoji="🖋️" size={48} />
        </h1>
        <p className="text-lg text-slate-500 dark:text-slate-400 max-w-2xl mx-auto font-medium opacity-80">
          Strukturiere deine Arbeit und verwalte Zitate in Echtzeit.
        </p>
      </div>

      <div className="flex justify-center flex-wrap gap-2">
        <div className="bg-slate-200/50 dark:bg-slate-900 p-2 rounded-[28px] shadow-3d-pressed border border-white/40 dark:border-slate-800 flex flex-wrap justify-center gap-2">
          {[
            { id: 'setup', label: '1. Basis' },
            { id: 'planner', label: '2. Gliederung' },
            { id: 'citations', label: '3. Zitierung' },
            { id: 'magic', label: <span><EmojiImage emoji="✨" size={12} /> KI-Zitierer</span> }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => (tab.id === 'citations' || tab.id === 'magic' || outline.length > 0) && setStep(tab.id as any)}
              className={`px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${step === tab.id ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-white shadow-3d-raised scale-[1.05]' : 'text-slate-400 opacity-60 hover:opacity-100'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-[48px] border border-slate-200 dark:border-slate-800 shadow-3d-deep p-6 sm:p-12 transition-all min-h-[600px]">
        
        {step === 'magic' && (
          <div className="space-y-10 animate-in slide-in-from-bottom-8 duration-500">
            <div className="text-center space-y-4">
               <h3 className="text-[11px] font-black uppercase tracking-[0.4em] text-emerald-600">KI-Zitier-Assistent</h3>
               <p className="text-sm text-slate-500 dark:text-slate-400">Füge rohe Daten ein und erhalte perfekte Zitationen in 4 Stilen.</p>
            </div>

            <div className="max-w-4xl mx-auto space-y-6">
              <textarea 
                value={magicInput}
                onChange={e => setMagicInput(e.target.value)}
                placeholder="Rohen Text, Website-URL oder Fragmente hier einfügen..."
                className="w-full h-40 p-6 bg-slate-50 dark:bg-slate-800 rounded-[32px] border-2 border-transparent focus:border-emerald-500 outline-none transition-all dark:text-white font-medium"
              />
              <button 
                onClick={handleMagicFormat}
                disabled={isMagicLoading || !magicInput.trim()}
                className="w-full bg-emerald-600 text-white font-black py-5 rounded-2xl text-[12px] uppercase tracking-[0.3em] shadow-xl hover:scale-[1.02] transition-all disabled:opacity-50"
              >
                {isMagicLoading ? 'KI formatiert...' : <span>Zitierstile generieren <EmojiImage emoji="✨" size={16} /></span>}
              </button>
            </div>

            {magicResult && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
                {/* APA Card */}
                <div className="bg-slate-50 dark:bg-slate-800/40 p-8 rounded-[32px] border border-slate-100 dark:border-slate-700 space-y-6">
                  <div className="flex justify-between items-center"><span className="text-[10px] font-black uppercase text-blue-500 tracking-widest">APA 7th Edition</span></div>
                  <div className="space-y-4">
                    <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border italic text-sm text-slate-700 dark:text-slate-300 relative group">
                      {magicResult.apa.entry}
                      <button onClick={() => copyToClipboard(magicResult.apa.entry)} className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 bg-emerald-500 text-white p-1 rounded">
                        <EmojiImage emoji="📋" size={12} />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                       <div className="text-[9px] font-bold text-slate-400 uppercase">Klammer: {magicResult.apa.inTextKlammer}</div>
                       <div className="text-[9px] font-bold text-slate-400 uppercase">Narrativ: {magicResult.apa.inTextNarrativ}</div>
                    </div>
                  </div>
                </div>

                {/* MLA Card */}
                <div className="bg-slate-50 dark:bg-slate-800/40 p-8 rounded-[32px] border border-slate-100 dark:border-slate-700 space-y-6">
                  <div className="flex justify-between items-center"><span className="text-[10px] font-black uppercase text-emerald-500 tracking-widest">MLA 9th Edition</span></div>
                  <div className="space-y-4">
                    <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border text-sm text-slate-700 dark:text-slate-300 relative group">
                      {magicResult.mla.entry}
                      <button onClick={() => copyToClipboard(magicResult.mla.entry)} className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 bg-emerald-500 text-white p-1 rounded">
                        <EmojiImage emoji="📋" size={12} />
                      </button>
                    </div>
                    <div className="text-[9px] font-bold text-slate-400 uppercase">In-Text: {magicResult.mla.inText}</div>
                  </div>
                </div>

                {/* Harvard Card */}
                <div className="bg-slate-50 dark:bg-slate-800/40 p-8 rounded-[32px] border border-slate-100 dark:border-slate-700 space-y-6">
                  <div className="flex justify-between items-center"><span className="text-[10px] font-black uppercase text-amber-500 tracking-widest">Harvard Style</span></div>
                  <div className="space-y-4">
                    <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border italic text-sm text-slate-700 dark:text-slate-300 relative group">
                      {magicResult.harvard.entry}
                      <button onClick={() => copyToClipboard(magicResult.harvard.entry)} className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 bg-emerald-500 text-white p-1 rounded">
                        <EmojiImage emoji="📋" size={12} />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                       <div className="text-[9px] font-bold text-slate-400 uppercase">In-Text: {magicResult.harvard.inText}</div>
                       <div className="text-[9px] font-bold text-slate-400 uppercase">Direkt: {magicResult.harvard.direct}</div>
                    </div>
                  </div>
                </div>

                {/* Chicago Card */}
                <div className="bg-slate-50 dark:bg-slate-800/40 p-8 rounded-[32px] border border-slate-100 dark:border-slate-700 space-y-6">
                  <div className="flex justify-between items-center"><span className="text-[10px] font-black uppercase text-rose-500 tracking-widest">Chicago (Notes)</span></div>
                  <div className="space-y-4">
                    <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border text-sm text-slate-700 dark:text-slate-300 relative group">
                      <p className="font-bold text-[10px] text-slate-400 uppercase mb-1">Bibliographie</p>
                      {magicResult.chicago.bibliography}
                      <button onClick={() => copyToClipboard(magicResult.chicago.bibliography)} className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 bg-emerald-500 text-white p-1 rounded">
                        <EmojiImage emoji="📋" size={12} />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                       <div className="text-[9px] font-bold text-slate-400 uppercase">Erste Note: {magicResult.chicago.fullNote}</div>
                       <div className="text-[9px] font-bold text-slate-400 uppercase">Folge-Note: {magicResult.chicago.shortNote}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {step === 'setup' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
            <div className="space-y-8">
              <div className="space-y-6">
                <h3 className="text-[11px] font-black uppercase tracking-[0.4em] text-emerald-600">Arbeit konfigurieren</h3>
                <div className="space-y-4">
                  <input
                    type="text"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="Thema deiner Hausarbeit..."
                    className="w-full p-5 bg-slate-50 dark:bg-slate-800 rounded-2xl border-2 border-transparent focus:border-emerald-500 outline-none transition-all dark:text-white font-bold"
                  />
                  <textarea
                    value={focus}
                    onChange={(e) => setFocus(e.target.value)}
                    placeholder="Besonderer Fokus oder Forschungsfrage..."
                    className="w-full p-5 bg-slate-50 dark:bg-slate-800 rounded-2xl border-2 border-transparent focus:border-emerald-500 outline-none transition-all h-32 dark:text-white resize-none"
                  />
                </div>
              </div>
              <button
                onClick={handleCreateOutline}
                disabled={isGenerating || !topic}
                className="w-full bg-emerald-600 text-white font-black py-5 rounded-2xl text-[12px] uppercase tracking-[0.3em] shadow-xl hover:bg-emerald-700 transition-all disabled:opacity-50"
              >
                {isGenerating ? 'Analysiere Material...' : <span>Gliederung generieren <EmojiImage emoji="✨" size={16} /></span>}
              </button>
            </div>
            <div className="space-y-6">
              <h3 className="text-[11px] font-black uppercase tracking-[0.4em] text-slate-400">Verknüpfte Dokumente</h3>
              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 scrollbar-thin">
                {availableDocuments.map(doc => (
                  <div 
                    key={doc.id}
                    onClick={() => setSelectedDocIds(prev => prev.includes(doc.id) ? prev.filter(i => i !== doc.id) : [...prev, doc.id])}
                    className={`flex items-center gap-4 p-5 rounded-2xl border-2 transition-all cursor-pointer ${selectedDocIds.includes(doc.id) ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20 shadow-inner' : 'border-slate-100 dark:border-slate-800 bg-slate-50/50'}`}
                  >
                    <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center ${selectedDocIds.includes(doc.id) ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300'}`}>
                      {selectedDocIds.includes(doc.id) && '✓'}
                    </div>
                    <span className="text-sm font-bold truncate dark:text-slate-200">{doc.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 'planner' && (
          <div className="max-w-4xl mx-auto space-y-10 animate-in slide-in-from-right-12 duration-700">
            <div className="flex justify-between items-center pb-6 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-3xl font-black dark:text-white">Gliederung</h3>
              <button onClick={() => setStep('setup')} className="text-[10px] font-black uppercase text-slate-400 hover:text-emerald-600">← Zurück</button>
            </div>
            <div className="space-y-6">
              {outline.map((section, idx) => (
                <div key={idx} className="p-8 bg-slate-50 dark:bg-slate-800/50 rounded-[32px] border border-slate-100 dark:border-slate-800 group hover:border-emerald-500/40 transition-all">
                  <div className="flex gap-6">
                    <div className="w-12 h-12 bg-emerald-600 text-white rounded-2xl flex items-center justify-center font-black text-xl flex-shrink-0 shadow-lg">{idx + 1}</div>
                    <div className="space-y-2">
                      <h4 className="text-xl font-black text-slate-900 dark:text-white">{section.title}</h4>
                      <p className="text-sm text-slate-500 leading-relaxed">{section.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 'citations' && (
          <div className="space-y-12 animate-in slide-in-from-right-12 duration-700">
            <div className="flex flex-col items-center gap-8 text-center">
              <div className="space-y-4">
                <h3 className="text-[11px] font-black uppercase tracking-[0.4em] text-emerald-600">Schritt 1: Zitierstil wählen</h3>
                <div className="flex flex-wrap justify-center gap-3 bg-slate-100 dark:bg-slate-800 p-2 rounded-3xl shadow-inner">
                  {(['APA', 'MLA', 'Harvard', 'Chicago'] as CitationStyle[]).map(style => (
                    <button
                      key={style}
                      onClick={() => setCitationStyle(style)}
                      className={`px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${citationStyle === style ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                      {style}
                    </button>
                  ))}
                </div>
              </div>

              <div className="w-full max-w-4xl bg-slate-50 dark:bg-slate-800/40 rounded-[40px] p-6 sm:p-10 border border-slate-100 dark:border-slate-800 space-y-8">
                <h3 className="text-[11px] font-black uppercase tracking-[0.4em] text-slate-400">Schritt 2: Quelle hinzufügen</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <input 
                    type="text" placeholder="Autor(en)" value={manualAuthor} onChange={e => setManualAuthor(e.target.value)}
                    className="p-4 bg-white dark:bg-slate-900 rounded-2xl border-none outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm dark:text-white"
                  />
                  <input 
                    type="text" placeholder="Titel der Quelle" value={manualTitle} onChange={e => setManualTitle(e.target.value)}
                    className="p-4 bg-white dark:bg-slate-900 rounded-2xl border-none outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm dark:text-white"
                  />
                  <input 
                    type="text" placeholder="Jahr" value={manualYear} onChange={e => setManualYear(e.target.value)}
                    className="p-4 bg-white dark:bg-slate-900 rounded-2xl border-none outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm dark:text-white"
                  />
                  <input 
                    type="text" placeholder="Journal / Herausgeber" value={manualJournal} onChange={e => setManualJournal(e.target.value)}
                    className="p-4 bg-white dark:bg-slate-900 rounded-2xl border-none outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm dark:text-white"
                  />
                  <input 
                    type="text" placeholder="URL / DOI (Optional)" value={manualUrl} onChange={e => setManualUrl(e.target.value)}
                    className="p-4 bg-white dark:bg-slate-900 rounded-2xl border-none outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm dark:text-white md:col-span-2"
                  />
                </div>
                <button 
                  onClick={addManualCitation}
                  disabled={isFormatting || !manualTitle || !manualAuthor}
                  className="w-full bg-emerald-600 text-white font-black py-5 rounded-2xl text-[12px] uppercase tracking-[0.3em] shadow-xl hover:scale-[1.02] transition-all disabled:opacity-50"
                >
                  {isFormatting ? 'Zitiere...' : <span>In {citationStyle} zitieren <EmojiImage emoji="📚" size={16} /></span>}
                </button>
              </div>
            </div>

            <div className="space-y-8 max-w-5xl mx-auto">
              <h3 className="text-[11px] font-black uppercase tracking-[0.4em] text-slate-400 px-6">Literaturverzeichnis ({sources.length})</h3>
              <div className="grid grid-cols-1 gap-6">
                {sources.map(s => (
                  <div key={s.id} className="p-8 bg-white dark:bg-slate-900 border-2 border-slate-50 dark:border-slate-800 rounded-[32px] relative group hover:border-emerald-400 transition-all shadow-3d-raised">
                    <div className="flex justify-between items-start mb-4">
                      <span className="text-[9px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-1 rounded-lg">{citationStyle} Standard</span>
                      <button onClick={() => setSources(prev => prev.filter(x => x.id !== s.id))} className="text-slate-300 hover:text-rose-500 transition-colors">
                        <EmojiImage emoji="✕" size={12} />
                      </button>
                    </div>
                    <div className="relative group/citation">
                      <div className="p-6 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 italic font-serif text-slate-700 dark:text-slate-300 leading-relaxed pr-24">
                        {formattedCitations[s.id] || "Formatierung ausstehend..."}
                      </div>
                      <button 
                        onClick={() => copyToClipboard(formattedCitations[s.id] || "")}
                        className="absolute right-4 top-1/2 -translate-y-1/2 bg-white dark:bg-slate-700 text-emerald-600 px-4 py-2 rounded-xl text-[9px] font-black uppercase shadow-md border hover:bg-emerald-600 hover:text-white transition-all"
                      >Kopieren</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
