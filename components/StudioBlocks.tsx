import React, { useState } from 'react';
import { ChevronDown, AlertTriangle, Lightbulb, Info, Sparkles, HelpCircle, ArrowRight, Compass } from 'lucide-react';
import type { Block, Cite, LernstudioResult } from '../services/studio/types';
import type { StudioSourceRef } from '../services/studioStore';
import type { CitationRef } from '../services/citations';
import { parseInline } from './markdownRenderer';
import { StudioDiagram } from './StudioDiagram';
import { useTranslation } from '../i18n/I18nProvider';
import { figureText } from '../services/studio/toMarkdown';
import { groupByPart, slideIn } from '../services/studio/parts';

/**
 * Lernstudio v2: Ergebnis aus strukturierten Blöcken (formatVersion 2).
 * Phase 3: Fußnoten als hochgestellte Nummern (je Quelle eine, alle Seiten im
 * Tooltip und in der Leiste unten, Klick öffnet die Stelle im Reader),
 * Kästen mit Symbol, Inhaltsverzeichnis ab 5 Kapiteln.
 */

interface Props {
  result: LernstudioResult;
  sources: StudioSourceRef[];
  renderCite: (refs: CitationRef[], key: string) => React.ReactNode;
  /** Fußnote angeklickt: Quelle, ihre Seiten und die Nummer. Ohne: Chips wie bei Markdown-Ergebnissen. */
  onCite?: (source: StudioSourceRef, pages: number[], footnote: number) => void;
  activeFootnote?: number | null;
}

const CALLOUT_ICON: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  merksatz: Lightbulb, klausurfalle: AlertTriangle, hinweis: Info, beispiel: Sparkles, einordnung: Compass, leitfrage: HelpCircle, bruecke: ArrowRight,
};

const CALLOUT_STYLE: Record<string, { border: string; bg: string; label?: string }> = {
  merksatz: { border: '#16a34a', bg: 'color-mix(in srgb, #16a34a 10%, transparent)' },
  klausurfalle: { border: '#ea580c', bg: 'color-mix(in srgb, #ea580c 10%, transparent)' },
  hinweis: { border: '#2563eb', bg: 'color-mix(in srgb, #2563eb 10%, transparent)' },
  beispiel: { border: '#9333ea', bg: 'color-mix(in srgb, #9333ea 10%, transparent)' },
  einordnung: { border: '#9333ea', bg: 'color-mix(in srgb, #9333ea 10%, transparent)' },
  // Skript: Leitfrage in der Primärfarbe, Überleitung zurückhaltend.
  leitfrage: { border: 'var(--primary)', bg: 'var(--primary-soft)' },
  bruecke: { border: 'var(--border-color)', bg: 'transparent', label: 'var(--text-secondary)' },
};

const Check: React.FC<{ question: string; answer: string; label: string; aid?: React.ReactNode }> = ({ question, answer, label, aid }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl" style={{ border: '1px solid var(--border-color)', background: 'var(--bg-main)' }}>
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className="w-full flex items-start gap-2 px-4 py-3 text-left text-[14px] font-semibold" style={{ color: 'var(--text-main)' }}>
        <span className="flex-1">{parseInline(question, 'q')}</span>
        <ChevronDown className={`w-4 h-4 mt-0.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="px-4 pb-3 text-[14px]" style={{ color: 'var(--text-secondary)' }}><span className="sr-only">{label}: </span>{parseInline(answer, 'a')}{aid}</div>}
    </div>
  );
};

export const StudioBlocks: React.FC<Props> = ({ result, sources, renderCite, onCite, activeFootnote }) => {
  const { t, tp } = useTranslation();
  const numberOf = (id: string) => sources.find(s => s.docId === id)?.n;
  // Fußnoten fortlaufend in Leserichtung; die Blöcke werden der Reihe nach gerendert.
  let footnotes = 0;
  const footnoteTitle = (source: StudioSourceRef, pages: number[]) => {
    if (!pages.length) return source.name;
    if (!source.parts?.length) return `${source.name}, ${t('stu.pagesShort', { pages: pages.join(', ') })}`;
    return groupByPart(source.parts, pages).map(({ part, pages: pg }) => part
      ? t('stu2.slideChip', { part: part.title, slides: pg.map(p => slideIn(part, p)).join(', ') })
      : t('stu.pagesShort', { pages: pg.join(', ') })).join('; ');
  };
  const cite = (cites: Cite[], key: string) => {
    if (!onCite) {
      const refs = cites.map(c => ({ n: numberOf(c.sourceId) ?? 0, ...(c.page ? { page: c.page } : {}) })).filter(r => r.n);
      return refs.length ? <> {renderCite(refs, key)}</> : null;
    }
    const bySource = new Map<string, number[]>();
    for (const c of cites) if (numberOf(c.sourceId)) bySource.set(c.sourceId, [...(bySource.get(c.sourceId) ?? []), ...(c.page ? [c.page] : [])]);
    if (!bySource.size) return null;
    return (
      <sup key={key} className="ml-0.5 whitespace-nowrap">
        {[...bySource].map(([id, pages]) => {
          const source = sources.find(s => s.docId === id)!;
          const n = ++footnotes;
          const pg = [...new Set(pages)].sort((a, b) => a - b);
          const on = activeFootnote === n;
          return (
            <button
              key={n}
              type="button"
              onClick={() => onCite(source, pg, n)}
              title={footnoteTitle(source, pg)}
              aria-label={`${t('stu2.footnote', { n })}: ${footnoteTitle(source, pg)}`}
              className="relative inline-flex items-center justify-center min-w-[1.35rem] h-[1.15rem] px-1 mx-px rounded-md text-[11px] font-semibold tabular-nums transition-colors hover:opacity-80 after:absolute after:-inset-x-1 after:-inset-y-3 after:content-['']"
              style={on ? { background: 'var(--primary)', color: 'var(--bg-main)' } : { background: 'var(--primary-soft)', color: 'var(--primary-ink)' }}
            >
              {n}
            </button>
          );
        })}
      </sup>
    );
  };
  const ki = (b: Block) => b.origin === 'ki' && (
    <span className="ml-1.5 align-middle text-[11px] font-semibold px-1.5 py-0.5 rounded-md" style={{ background: 'color-mix(in srgb, #9333ea 14%, transparent)', color: '#a855f7' }}>{t('stu2.ki')}</span>
  );
  const inl = (text: string, key: string) => parseInline(text, key);

  const render = (b: Block): React.ReactNode => {
    switch (b.type) {
      case 'heading': {
        const cls = b.level === 1 ? 'text-2xl' : b.level === 2 ? 'text-xl pt-4' : 'text-[16px] pt-2';
        return <p id={b.level === 2 ? `stu-ch-${b.id}` : undefined} role="heading" aria-level={b.level + 1} className={`${cls} font-semibold scroll-mt-4`} style={{ color: 'var(--text-main)' }}>{b.text}</p>;
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
        const Icon = CALLOUT_ICON[b.variant] ?? Info;
        return (
          <div className="rounded-xl px-4 py-3" style={{ borderLeft: `3px solid ${st.border}`, background: st.bg }}>
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] mb-1" style={{ color: st.label ?? st.border }}>
              <Icon className="w-3.5 h-3.5 shrink-0" strokeWidth={2.25} />{t(`stu2.callout.${b.variant}`)}{ki(b)}
            </p>
            <p>{inl(b.text, b.id)}{cite(b.cites, `${b.id}-c`)}</p>
          </div>
        );
      }
      case 'study':
        return (
          <div className="rounded-2xl px-4 py-3" style={{ border: '1px solid var(--border-color)', background: 'var(--bg-main)' }}>
            <p className="flex flex-wrap items-baseline gap-x-2 font-semibold" style={{ color: 'var(--text-main)' }}>
              <span>{b.authors}</span>
              {b.year && <span className="font-normal tabular-nums" style={{ color: 'var(--text-secondary)' }}>({b.year})</span>}
              <span className="font-normal">{cite(b.cites, `${b.id}-c`)}</span>
            </p>
            {/* Kompakt: Beschriftung links, Text rechts; auf dem Handy untereinander. */}
            <dl className="mt-2 grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[14px]">
              {([['design', b.design], ['result', b.result], ['conclusion', b.conclusion]] as const).filter(([, v]) => v).map(([k, v]) => (
                <React.Fragment key={k}>
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] sm:pt-[3px]" style={{ color: 'var(--text-secondary)' }}>{t(`stu2.study.${k}`)}</dt>
                  <dd className="mb-1 sm:mb-0">{inl(v, `${b.id}-${k}`)}</dd>
                </React.Fragment>
              ))}
            </dl>
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
        // Antwort vom Modell (Folie ohne Lösung) oder ganze Frage als Erklärhilfe: Marke an der Antwort.
        return <Check question={b.question} answer={b.answer} label={t('stu2.answer')} aid={b.answerOrigin === 'ki' || b.origin === 'ki' ? ki({ ...b, origin: 'ki' }) : undefined} />;
    }
  };

  // Länge am Haupttext (ohne Zeitleiste, Aufgaben, Übungsfragen, Klausurinfos); ältere Ergebnisse ohne mainWords: alles.
  const shown = result.stats.mainWords ?? result.stats.outputWords;
  const ratio = result.stats.sourceWords ? Math.round((shown / result.stats.sourceWords) * 100) : null;
  // Inhaltsverzeichnis ab 5 Kapiteln (Kapitel und angehängte Abschnitte wie Übungsfragen).
  const chapters = result.blocks.filter((b): b is Extract<Block, { type: 'heading' }> => b.type === 'heading' && b.level === 2);
  const jump = (id: string) => document.getElementById(`stu-ch-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return (
    <div className="space-y-4 text-[15px] leading-relaxed" style={{ color: 'var(--text-main)' }}>
      <p className="text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
        {t('stu2.stats', { words: shown, source: result.stats.sourceWords })}{ratio !== null ? ` (${ratio} %)` : ''}
        {' · '}{tp('stu2.sourcesUsed', sources.length)}
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
      {chapters.length > 4 && (
        <nav aria-label={t('stu2.toc')} className="rounded-2xl px-4 py-3" style={{ border: '1px solid var(--border-color)', background: 'var(--bg-main)' }}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] mb-2" style={{ color: 'var(--text-secondary)' }}>{t('stu2.toc')}</p>
          <ol className="space-y-0.5">
            {chapters.map((c, i) => (
              <li key={c.id}>
                <button type="button" onClick={() => jump(c.id)} className="w-full flex items-baseline gap-2.5 text-left py-1 text-[14px] font-semibold rounded-md transition-opacity hover:opacity-70" style={{ color: 'var(--text-main)' }}>
                  <span className="text-[12px] tabular-nums w-5 shrink-0" style={{ color: 'var(--primary-ink)' }}>{i + 1}</span>
                  <span>{c.text}</span>
                </button>
              </li>
            ))}
          </ol>
        </nav>
      )}
      {result.blocks.map((b, i) => (
        <div key={b.id}>
          {/* Skript: „Kurz gecheckt“ über der ersten Frage eines Abschnitts (nicht bei den Übungsfragen am Ende). */}
          {b.type === 'check' && b.id.startsWith('c') && result.blocks[i - 1]?.type !== 'check' && (
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] mb-2" style={{ color: 'var(--primary-ink)' }}>{t('stu2.checkTitle')}</p>
          )}
          {render(b)}
        </div>
      ))}
    </div>
  );
};
