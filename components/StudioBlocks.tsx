import React, { useState } from 'react';
import { ChevronDown, AlertTriangle } from 'lucide-react';
import type { Block, Cite, LernstudioResult } from '../services/studio/types';
import type { StudioSourceRef } from '../services/studioStore';
import type { CitationRef } from '../services/citations';
import { parseInline } from './markdownRenderer';
import { StudioDiagram } from './StudioDiagram';
import { useTranslation } from '../i18n/I18nProvider';
import { figureText } from '../services/studio/toMarkdown';

/**
 * Lernstudio v2: Ergebnis aus strukturierten Blöcken (formatVersion 2).
 * Phase 1: funktional, alle Blocktypen; das Feindesign folgt in Phase 3.
 * Fußnoten nutzen denselben Chip wie die Markdown-Ergebnisse
 * (Klick öffnet die Stelle im Split-Screen-Reader).
 */

interface Props {
  result: LernstudioResult;
  sources: StudioSourceRef[];
  renderCite: (refs: CitationRef[], key: string) => React.ReactNode;
}

const CALLOUT_STYLE: Record<string, { border: string; bg: string }> = {
  merksatz: { border: '#16a34a', bg: 'color-mix(in srgb, #16a34a 10%, transparent)' },
  klausurfalle: { border: '#ea580c', bg: 'color-mix(in srgb, #ea580c 10%, transparent)' },
  hinweis: { border: '#2563eb', bg: 'color-mix(in srgb, #2563eb 10%, transparent)' },
  beispiel: { border: '#9333ea', bg: 'color-mix(in srgb, #9333ea 10%, transparent)' },
  einordnung: { border: '#9333ea', bg: 'color-mix(in srgb, #9333ea 10%, transparent)' },
  // Skript: Leitfrage in der Primärfarbe, Überleitung zurückhaltend.
  leitfrage: { border: 'var(--primary)', bg: 'var(--primary-soft)' },
  bruecke: { border: 'var(--border-color)', bg: 'transparent' },
};

const Check: React.FC<{ question: string; answer: string; label: string }> = ({ question, answer, label }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl" style={{ border: '1px solid var(--border-color)', background: 'var(--bg-main)' }}>
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className="w-full flex items-start gap-2 px-4 py-3 text-left text-[14px] font-semibold" style={{ color: 'var(--text-main)' }}>
        <span className="flex-1">{parseInline(question, 'q')}</span>
        <ChevronDown className={`w-4 h-4 mt-0.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="px-4 pb-3 text-[14px]" style={{ color: 'var(--text-secondary)' }}><span className="sr-only">{label}: </span>{parseInline(answer, 'a')}</div>}
    </div>
  );
};

export const StudioBlocks: React.FC<Props> = ({ result, sources, renderCite }) => {
  const { t } = useTranslation();
  const numberOf = (id: string) => sources.find(s => s.docId === id)?.n;
  const cite = (cites: Cite[], key: string) => {
    const refs = cites.map(c => ({ n: numberOf(c.sourceId) ?? 0, ...(c.page ? { page: c.page } : {}) })).filter(r => r.n);
    return refs.length ? <> {renderCite(refs, key)}</> : null;
  };
  const ki = (b: Block) => b.origin === 'ki' && (
    <span className="ml-1.5 align-middle text-[11px] font-semibold px-1.5 py-0.5 rounded-md" style={{ background: 'color-mix(in srgb, #9333ea 14%, transparent)', color: '#a855f7' }}>{t('stu2.ki')}</span>
  );
  const inl = (text: string, key: string) => parseInline(text, key);

  const render = (b: Block): React.ReactNode => {
    switch (b.type) {
      case 'heading': {
        const cls = b.level === 1 ? 'text-2xl' : b.level === 2 ? 'text-xl pt-4' : 'text-[16px] pt-2';
        return <p role="heading" aria-level={b.level + 1} className={`${cls} font-semibold`} style={{ color: 'var(--text-main)' }}>{b.text}</p>;
      }
      case 'paragraph':
        return <p>{inl(b.text, b.id)}{cite(b.cites, `${b.id}-c`)}{ki(b)}</p>;
      case 'bullets':
        return (
          <ul className="list-disc pl-5 space-y-1.5">
            {b.items.map((it, i) => <li key={i}>{inl(it.text, `${b.id}-${i}`)}{cite(it.cites.length ? it.cites : b.cites, `${b.id}-${i}-c`)}</li>)}
          </ul>
        );
      case 'tasks':
        return (
          <ol className="list-decimal pl-5 space-y-1.5">
            {b.items.map((it, i) => <li key={i}>{inl(it.text, `${b.id}-${i}`)}{cite(it.cites, `${b.id}-${i}-c`)}</li>)}
          </ol>
        );
      case 'table': {
        const rowCited = !!b.rowCites?.some(rc => rc.length);
        return (
          <figure className="space-y-2">
            {b.caption && <figcaption className="text-[13px] font-semibold" style={{ color: 'var(--text-secondary)' }}>{b.caption}{!rowCited && cite(b.cites, `${b.id}-c`)}</figcaption>}
            <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid var(--border-color)' }}>
              <table className="min-w-full text-[13.5px] border-collapse">
                <thead>
                  <tr style={{ background: 'var(--bg-main)' }}>
                    {b.headers.map((h, i) => <th key={i} className={`text-left font-semibold px-3 py-2 ${i === 0 ? 'sticky left-0' : ''}`} style={{ color: 'var(--text-main)', ...(i === 0 ? { background: 'var(--bg-main)' } : {}) }}>{inl(h, `${b.id}-h${i}`)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {b.rows.map((r, ri) => (
                    <tr key={ri} style={{ borderTop: '1px solid var(--border-color)' }}>
                      {r.map((c, ci) => (
                        <td key={ci} className={`align-top px-3 py-2 ${ci === 0 ? 'sticky left-0 font-semibold' : ''}`} style={ci === 0 ? { background: 'var(--bg-sidebar)' } : undefined}>
                          {inl(c, `${b.id}-${ri}-${ci}`)}
                          {/* Beleg je Zeile in der letzten Zelle. */}
                          {ci === r.length - 1 && rowCited && cite(b.rowCites![ri] ?? [], `${b.id}-${ri}-c`)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!b.caption && !rowCited && cite(b.cites, `${b.id}-c`)}
          </figure>
        );
      }
      case 'callout': {
        const st = CALLOUT_STYLE[b.variant] ?? CALLOUT_STYLE.hinweis;
        return (
          <div className="rounded-xl px-4 py-3" style={{ borderLeft: `3px solid ${st.border}`, background: st.bg }}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] mb-1" style={{ color: st.border }}>{t(`stu2.callout.${b.variant}`)}{ki(b)}</p>
            <p>{inl(b.text, b.id)}{cite(b.cites, `${b.id}-c`)}</p>
          </div>
        );
      }
      case 'study':
        return (
          <div className="rounded-2xl px-4 py-3 space-y-1" style={{ border: '1px solid var(--border-color)', background: 'var(--bg-main)' }}>
            <p className="font-semibold" style={{ color: 'var(--text-main)' }}>{b.authors}{b.year ? ` (${b.year})` : ''}{cite(b.cites, `${b.id}-c`)}</p>
            {b.design && <p className="text-[14px]"><span className="font-semibold">{t('stu2.study.design')}:</span> {inl(b.design, `${b.id}-d`)}</p>}
            {b.result && <p className="text-[14px]"><span className="font-semibold">{t('stu2.study.result')}:</span> {inl(b.result, `${b.id}-r`)}</p>}
            {b.conclusion && <p className="text-[14px]"><span className="font-semibold">{t('stu2.study.conclusion')}:</span> {inl(b.conclusion, `${b.id}-s`)}</p>}
          </div>
        );
      case 'figure': {
        const n = numberOf(b.sourceId);
        // imageRef ist nach dem Ausschneiden der Pfad im Bild-Speicher; ein reiner Katalogverweis (A3) zeigt nur Titel und Text.
        const image = /^A\d+$/.test(b.imageRef) ? undefined : b.imageRef;
        return (
          <StudioDiagram
            diagram={{ type: 'figure', image, docId: b.sourceId, page: b.page, title: figureText(b.title, b.caption) === b.caption ? undefined : b.title, caption: b.caption, ...(n ? { cite: [{ n, page: b.page }] } : {}) }}
            renderCite={renderCite}
          />
        );
      }
      case 'timeline':
        return (
          <ol className="space-y-2 pl-1" style={{ borderLeft: '2px solid var(--border-color)' }}>
            {b.items.map((it, i) => (
              <li key={i} className="pl-4">
                <span className="font-semibold tabular-nums" style={{ color: 'var(--primary-ink)' }}>{it.year}</span>{' '}
                <span className="font-semibold">{it.who}:</span> {inl(it.what, `${b.id}-${i}`)}{cite(it.cites, `${b.id}-${i}-c`)}
              </li>
            ))}
          </ol>
        );
      case 'check':
        return <Check question={b.question} answer={b.answer} label={t('stu2.answer')} />;
    }
  };

  // Länge am Haupttext (ohne Zeitleiste, Aufgaben, Übungsfragen, Klausurinfos); ältere Ergebnisse ohne mainWords: alles.
  const shown = result.stats.mainWords ?? result.stats.outputWords;
  const ratio = result.stats.sourceWords ? Math.round((shown / result.stats.sourceWords) * 100) : null;
  return (
    <div className="space-y-4 text-[15px] leading-relaxed" style={{ color: 'var(--text-main)' }}>
      <p className="text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
        {t('stu2.stats', { words: shown, source: result.stats.sourceWords })}{ratio !== null ? ` (${ratio} %)` : ''}
        {' · '}{t('stu2.sourcesUsed', { n: sources.length })}
      </p>
      {(result.warnings.length > 0 || result.omittedSources.length > 0) && (
        <details className="rounded-xl px-4 py-3" style={{ border: '1px solid #ea580c', background: 'color-mix(in srgb, #ea580c 8%, transparent)' }}>
          <summary className="cursor-pointer text-[13px] font-semibold flex items-center gap-2" style={{ color: '#ea580c' }}>
            <AlertTriangle className="w-4 h-4" /> {t('stu2.warnings', { n: result.warnings.length + result.omittedSources.length })}
          </summary>
          <ul className="list-disc pl-5 mt-2 space-y-1 text-[13px]" style={{ color: 'var(--text-secondary)' }}>
            {result.omittedSources.map((o, i) => <li key={`o${i}`}>{t('stu2.omitted', { name: o.part?.title ?? sources.find(s => s.docId === o.sourceId)?.name ?? '?', reason: o.reason })}</li>)}
            {result.warnings.map((w, i) => <li key={`w${i}`}>{w}</li>)}
          </ul>
        </details>
      )}
      {result.blocks.map((b, i) => (
        <div key={b.id}>
          {/* Skript: „Kurz gecheckt“ über der ersten Frage eines Abschnitts. */}
          {b.type === 'check' && result.blocks[i - 1]?.type !== 'check' && (
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] mb-2" style={{ color: 'var(--primary-ink)' }}>{t('stu2.checkTitle')}</p>
          )}
          {render(b)}
        </div>
      ))}
    </div>
  );
};
