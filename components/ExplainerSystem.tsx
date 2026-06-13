
import React, { useState, useEffect } from 'react';
import { ProcessedDocument, Collection } from '../types';
import type { GenerationSource } from '../services/geminiService';
import { EmojiImage } from './EmojiImage';
import { AgentChat } from './AgentChat';
import { generateExplanation } from '../services/geminiService';
import { SourceSelector } from './SourceSelector';
import { toast } from '../services/toast';
import { Bot } from 'lucide-react';

// ─── Lightweight Markdown Renderer ───────────────────────────────────────────

function parseInline(text: string, baseKey: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // matches **bold**, *italic*, `code`
  const regex = /(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`]+`)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const token = match[0];
    const k = `${baseKey}-${match.index}`;
    if (token.startsWith('**')) {
      parts.push(<strong key={k} className="font-black text-slate-900 dark:text-white">{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('*')) {
      parts.push(<em key={k} className="italic text-slate-600 dark:text-slate-300">{token.slice(1, -1)}</em>);
    } else {
      parts.push(<code key={k} className="px-1.5 py-0.5 rounded-md text-[0.85em] font-mono bg-slate-100 dark:bg-slate-800 text-indigo-600 dark:text-indigo-300">{token.slice(1, -1)}</code>);
    }
    last = match.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Empty line — skip
    if (!line.trim()) { i++; continue; }

    // H1
    if (line.startsWith('# ')) {
      blocks.push(
        <h2 key={key++} className="text-2xl lg:text-3xl font-black text-slate-900 dark:text-white tracking-tight mt-2">
          {parseInline(line.slice(2), String(key))}
        </h2>
      );
      i++; continue;
    }

    // H2
    if (line.startsWith('## ')) {
      blocks.push(
        <h3 key={key++} className="text-xl lg:text-2xl font-black text-slate-900 dark:text-white tracking-tight mt-1">
          {parseInline(line.slice(3), String(key))}
        </h3>
      );
      i++; continue;
    }

    // H3
    if (line.startsWith('### ')) {
      blocks.push(
        <h4 key={key++} className="text-base lg:text-lg font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider mt-1">
          {parseInline(line.slice(4), String(key))}
        </h4>
      );
      i++; continue;
    }

    // Heading-like words without # (Grundlagen, Vertiefung, Kontext, Stufe, Phase)
    if (line.match(/^(Grundlagen|Vertiefung|Kontext|Stufe\s*\d*|Phase\s*\d*)[\s:]/i)) {
      blocks.push(
        <h3 key={key++} className="text-xl lg:text-2xl font-black text-slate-900 dark:text-white tracking-tight mt-1">
          {parseInline(line, String(key))}
        </h3>
      );
      i++; continue;
    }

    // "Allgemeinwissen:" block
    if (line.startsWith('Allgemeinwissen:')) {
      const content: string[] = [line.replace('Allgemeinwissen:', '').trim()];
      i++;
      while (i < lines.length && lines[i].trim() && !lines[i].startsWith('#') && !lines[i].match(/^[-*•]\s/) && !lines[i].match(/^\d+\.\s/)) {
        content.push(lines[i]);
        i++;
      }
      blocks.push(
        <div key={key++} className="px-5 py-4 rounded-2xl" style={{ background: 'color-mix(in srgb, var(--primary) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--primary) 20%, transparent)' }}>
          <p className="text-[9px] font-black uppercase tracking-widest mb-2" style={{ color: 'var(--primary)' }}>Externes Wissen</p>
          <p className="text-base font-medium text-slate-700 dark:text-slate-300 leading-relaxed">
            {parseInline(content.join(' '), String(key))}
          </p>
        </div>
      );
      continue;
    }

    // Bullet list (- or * or •)
    if (line.match(/^[-*•]\s/)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^[-*•]\s/)) {
        items.push(lines[i].replace(/^[-*•]\s/, ''));
        i++;
      }
      blocks.push(
        <ul key={key++} className="space-y-2 pl-1">
          {items.map((item, idx) => (
            <li key={idx} className="flex gap-2.5 items-start text-base lg:text-lg font-medium text-slate-700 dark:text-slate-300 leading-relaxed">
              <span className="mt-2 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'var(--primary)' }} />
              <span>{parseInline(item, `${key}-${idx}`)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Numbered list
    if (line.match(/^\d+\.\s/)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^\d+\.\s/)) {
        items.push(lines[i].replace(/^\d+\.\s/, ''));
        i++;
      }
      blocks.push(
        <ol key={key++} className="space-y-2 pl-1">
          {items.map((item, idx) => (
            <li key={idx} className="flex gap-3 items-start text-base lg:text-lg font-medium text-slate-700 dark:text-slate-300 leading-relaxed">
              <span className="font-black shrink-0 w-6 text-right" style={{ color: 'var(--primary)' }}>{idx + 1}.</span>
              <span>{parseInline(item, `${key}-${idx}`)}</span>
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Paragraph — collect non-empty, non-special lines
    const paraLines: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].startsWith('#') &&
      !lines[i].match(/^[-*•]\s/) &&
      !lines[i].match(/^\d+\.\s/) &&
      !lines[i].startsWith('Allgemeinwissen:') &&
      !lines[i].match(/^(Grundlagen|Vertiefung|Kontext|Stufe\s*\d*|Phase\s*\d*)[\s:]/i)
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    blocks.push(
      <p key={key++} className="text-base lg:text-lg font-medium text-slate-700 dark:text-slate-300 leading-relaxed">
        {parseInline(paraLines.join(' '), String(key))}
      </p>
    );
  }

  return <div className="space-y-5">{blocks}</div>;
}

interface ExplainerSystemProps {
  availableDocuments: ProcessedDocument[];
  collections: Collection[];
  getDocumentSource?: (doc: ProcessedDocument) => GenerationSource;
  onSaveToLibrary?: (file: File) => void;
  initialDoc?: ProcessedDocument;
}

export const ExplainerSystem: React.FC<ExplainerSystemProps> = ({
  availableDocuments,
  collections,
  getDocumentSource,
  onSaveToLibrary,
  initialDoc,
}) => {
  const [activeSource, setActiveSource] = useState<GenerationSource | null>(null);
  const [activeSourceName, setActiveSourceName] = useState('');
  const [concept, setConcept] = useState('');
  const [explanation, setExplanation] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [useExternalKnowledge, setUseExternalKnowledge] = useState(false);
  const [erklaererOpen, setErklaererOpen] = useState(false);

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

  const canSubmit = concept.trim().length > 0 && (useExternalKnowledge || !!activeSource);

  const handleExplain = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!canSubmit) return;
    setIsLoading(true);
    setExplanation(null);
    try {
      const result = await generateExplanation(activeSource, concept.trim(), useExternalKnowledge);
      setExplanation(result);
    } catch (err: any) {
      console.error(err);
      toast.error('Erklärung konnte nicht generiert werden. Versuche es erneut.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setExplanation(null);
    setConcept('');
  };

  return (
    <div className="max-w-5xl mx-auto space-y-10 py-6 lg:py-10 px-4 animate-in fade-in duration-700 pb-32">

      {/* Header */}
      <div className="text-center space-y-3">
        <h1 className="text-4xl lg:text-7xl font-black text-slate-900 dark:text-white tracking-tighter">
          KI <span className="text-indigo-600">Erklärer</span> <EmojiImage emoji="💡" size={44} />
        </h1>
        <p className="text-base text-slate-500 dark:text-slate-400 font-medium opacity-80">
          Konzepte verstehen — aus deinen Unterlagen oder darüber hinaus
        </p>
      </div>

      {/* Eingabe-Bereich */}
      <div className="space-y-4 max-w-3xl mx-auto">

        {/* Suchfeld */}
        <form onSubmit={handleExplain} className="relative">
          <input
            type="text"
            value={concept}
            onChange={e => setConcept(e.target.value)}
            placeholder="Welchen Begriff möchtest du verstehen?"
            className="w-full pl-6 pr-36 py-5 lg:py-6 rounded-[28px] text-lg lg:text-xl font-bold outline-none focus:border-indigo-400 transition-all"
            style={{
              background: 'var(--bg-sidebar)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-main)',
            }}
          />
          <button
            type="submit"
            disabled={isLoading || !canSubmit}
            className="absolute right-3 top-1/2 -translate-y-1/2 bg-indigo-600 px-6 py-2.5 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:scale-105 active:scale-95 transition-all shadow-lg disabled:opacity-40 flex items-center gap-2"
            style={{ color: 'var(--primary-text)' }}
          >
            {isLoading
              ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <><EmojiImage emoji="✨" size={14} /> Erklären</>
            }
          </button>
        </form>

        {/* Quellenauswahl + Toggle in einer Reihe */}
        <div className="space-y-3">

          {/* Quelle */}
          {activeSource ? (
            <div className="flex items-center justify-between px-5 py-3 rounded-2xl" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
                <span className="text-[11px] font-black text-indigo-600 dark:text-indigo-400 truncate max-w-[240px]">{activeSourceName}</span>
              </div>
              <button
                onClick={() => { setActiveSource(null); setActiveSourceName(''); }}
                className="text-slate-400 hover:text-rose-500 transition-colors font-black text-xs"
              >✕</button>
            </div>
          ) : (
            <div className="space-y-2">
              {!useExternalKnowledge && (
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">
                  Dokument wählen (Pflicht im Dokument-Modus)
                </p>
              )}
              {useExternalKnowledge && (
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">
                  Dokument wählen (optional — für zusätzlichen Kontext)
                </p>
              )}
              <SourceSelector
                documents={availableDocuments}
                collections={collections}
                onSelectDocument={handleSelectDocument}
                onSelectSource={(source, name) => { setActiveSource(source); setActiveSourceName(name); }}
                onSaveToLibrary={onSaveToLibrary}
                isLoading={isLoading}
              />
            </div>
          )}

          {/* Externes Wissen Toggle */}
          <button
            onClick={() => setUseExternalKnowledge(v => !v)}
            className="w-full flex items-center justify-between px-5 py-3.5 rounded-2xl transition-all"
            style={useExternalKnowledge
              ? { background: 'color-mix(in srgb, var(--primary) 10%, transparent)', border: '1px solid var(--primary)' }
              : { background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }
            }
          >
            <div className="flex items-center gap-3">
              <span className="text-base"><EmojiImage emoji="🌐" size={16} /></span>
              <div className="text-left">
                <p className="text-[11px] font-black uppercase tracking-widest" style={{ color: useExternalKnowledge ? 'var(--primary)' : undefined }}>
                  {useExternalKnowledge ? 'Externes Wissen aktiv' : 'Nur eigene Quellen'}
                </p>
                <p className="text-[10px] text-slate-400 font-medium">
                  {useExternalKnowledge
                    ? 'KI nutzt Allgemeinwissen — Ergänzungen werden gekennzeichnet'
                    : 'KI antwortet ausschließlich aus deinem Dokument'}
                </p>
              </div>
            </div>
            {/* Toggle-Pill */}
            <div
              className="w-10 h-5 rounded-full transition-all relative shrink-0"
              style={{ background: useExternalKnowledge ? 'var(--primary)' : 'var(--border-color)' }}
            >
              <div
                className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all"
                style={{ left: useExternalKnowledge ? '1.35rem' : '0.125rem' }}
              />
            </div>
          </button>
        </div>
      </div>

      {/* Ladeanimation */}
      {isLoading && !explanation && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--bg-main) 80%, transparent)', backdropFilter: 'blur(8px)' }}>
          <div className="flex flex-col items-center gap-6 text-center p-10 rounded-[40px]" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}>
            <div className="relative">
              <div className="w-20 h-20 rounded-full" style={{ border: '6px solid var(--border-color)' }} />
              <div className="w-20 h-20 rounded-full border-t-transparent animate-spin absolute top-0 left-0" style={{ border: '6px solid var(--primary)', borderTopColor: 'transparent' }} />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-black uppercase tracking-widest text-slate-900 dark:text-white">KI erklärt...</p>
              <p className="text-xs text-slate-400 font-medium italic">
                {useExternalKnowledge && !activeSource ? 'Aus Allgemeinwissen' : activeSource ? 'Basierend auf deinem Dokument' : ''}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Ergebnis */}
      {explanation && (
        <div className="max-w-4xl mx-auto rounded-[40px] p-8 sm:p-14 space-y-10 animate-in slide-in-from-bottom-8 duration-700 shadow-3d-deep" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-color)' }}>

          {/* Ergebnis-Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4 pb-8" style={{ borderBottom: '1px solid var(--border-color)' }}>
            <div className="space-y-1">
              <span className="text-[10px] font-black uppercase text-indigo-500 tracking-[0.3em]">
                {useExternalKnowledge ? (activeSource ? 'Dokument + Allgemeinwissen' : 'Allgemeinwissen') : 'Nur aus deinem Dokument'}
              </span>
              <h2 className="text-3xl lg:text-4xl font-black dark:text-white leading-tight">{concept}</h2>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => { navigator.clipboard.writeText(explanation); toast.success('Erklärung kopiert!'); }}
                className="p-3 rounded-xl transition-all text-slate-400 hover:text-indigo-500"
                style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)' }}
                title="Kopieren"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              </button>
              <button
                onClick={handleReset}
                className="p-3 rounded-xl transition-all text-slate-400 hover:text-rose-500"
                style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)' }}
                title="Schließen"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          </div>

          {/* Erklärungstext */}
          <div>
            {renderMarkdown(explanation)}
          </div>

          {/* Footer */}
          <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4" style={{ borderTop: '1px solid var(--border-color)' }}>
            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
              {!useExternalKnowledge
                ? `Quelle: ${activeSourceName}`
                : activeSource ? `Primärquelle: ${activeSourceName} + Allgemeinwissen` : 'Quelle: Allgemeinwissen'
              }
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setErklaererOpen(true)}
                className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest transition-colors px-3 py-1.5 rounded-xl"
                style={{ background: 'color-mix(in srgb, var(--primary) 10%, var(--bg-sidebar))', color: 'var(--primary)', border: '1px solid color-mix(in srgb, var(--primary) 20%, transparent)' }}
              >
                <Bot size={12} />
                Nachfragen
              </button>
              <button
                onClick={handleReset}
                className="text-[10px] font-black uppercase tracking-widest transition-colors text-slate-400 hover:text-indigo-500"
              >
                Anderen Begriff →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!explanation && !isLoading && (
        <div className="flex flex-col items-center justify-center py-16 text-center space-y-4 opacity-30 animate-in fade-in duration-1000 delay-300">
          <EmojiImage emoji="💡" size={48} />
          <p className="text-sm font-black uppercase tracking-widest text-slate-400">Begriff eingeben und los</p>
        </div>
      )}

      <AgentChat
        agentType="erklaerer"
        context={{ currentTab: 'EXPLAINER' }}
        initialMessage={concept ? `Ich habe gerade eine Erklärung zu "${concept}" gelesen${activeSourceName ? ` aus dem Dokument "${activeSourceName}"` : ''}. Ich habe noch Fragen dazu.` : undefined}
        isOpen={erklaererOpen}
        onClose={() => setErklaererOpen(false)}
      />
    </div>
  );
};
