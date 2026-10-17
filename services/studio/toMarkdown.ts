import type { Block, Cite, LernstudioResult } from './types';
import type { StudioSourceRef } from '../studioStore';
import { groupByPart, slideIn } from './parts';

/**
 * Blöcke → Markdown für Kopieren, Download, "Als Quelle hinzufügen" und die
 * Spalte studio_items.markdown (ältere App-Versionen zeigen so etwas Lesbares).
 * Fußnoten als [n:p] im bisherigen Format, damit der alte Renderer sie kennt.
 */

const CALLOUT_LABEL: Record<string, string> = {
  merksatz: 'Merksatz', klausurfalle: 'Klausurfalle', hinweis: 'Hinweis', beispiel: 'Beispiel', einordnung: 'Einordnung (Erklärhilfe)', leitfrage: 'Leitfrage', bruecke: 'Überleitung',
};

/**
 * Fußnoten gruppiert je Quelle: "[1, S. 14, 16, 46]" statt drei Klammern; bei
 * einer zusammengefügten PDF je Vorlesung mit Folie
 * ("[1, Aufmerksamkeit_1, Folie 12, 14 (gesamt S. 94, 96)]").
 */
export const citeTokens = (cites: Cite[], numberOf: (sourceId: string) => number | undefined, refs: StudioSourceRef[] = []): string => {
  const bySource = new Map<string, number[]>();
  for (const c of cites) {
    if (!numberOf(c.sourceId)) continue;
    const pages = bySource.get(c.sourceId) ?? [];
    if (!pages.includes(c.page)) pages.push(c.page);
    bySource.set(c.sourceId, pages);
  }
  return [...bySource.entries()].map(([sourceId, list]) => {
    const n = numberOf(sourceId)!;
    const pages = list.filter(p => p > 0).sort((a, b) => a - b);
    if (!pages.length) return `[${n}]`;
    const parts = refs.find(r => r.docId === sourceId)?.parts;
    if (parts?.length) {
      return groupByPart(parts, pages).map(g => (g.part
        ? `[${n}, ${g.part.title}, Folie ${g.pages.map(p => slideIn(g.part!, p)).join(', ')} (gesamt S. ${g.pages.join(', ')})]`
        : `[${n}, S. ${g.pages.join(', ')}]`)).join('');
    }
    return `[${n}, S. ${pages.join(', ')}]`;
  }).join('');
};

const cell = (t: string) => t.replace(/\|/g, '\\|');

/** Titel und Bildunterschrift ohne Doppelung ("Interaktion von Person …. Interaktion von Person …"). */
export const figureText = (title: string | undefined, caption: string): string => {
  const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  if (!title || norm(caption).startsWith(norm(title))) return caption;
  if (norm(title).startsWith(norm(caption))) return title;
  return `${title}. ${caption}`;
};

export const blockToMarkdown = (b: Block, numberOf: (sourceId: string) => number | undefined, refs: StudioSourceRef[] = []): string => {
  const c = (cites: Cite[]) => { const t = citeTokens(cites, numberOf, refs); return t ? ` ${t}` : ''; };
  const ki = b.origin === 'ki' ? ' *(Erklärhilfe)*' : '';
  switch (b.type) {
    case 'heading': return `${'#'.repeat(b.level + 1)} ${b.text}`;
    case 'paragraph': return `${b.text}${c(b.cites)}${ki}`;
    case 'bullets': case 'tasks': return b.items.map(i => `- ${i.text}${c(i.cites.length ? i.cites : b.cites)}`).join('\n');
    case 'table': {
      // Belege je Zeile in der letzten Zelle; ohne Zeilenbelege die der ganzen Tabelle unter der Tabelle.
      const rowCites = b.rowCites?.some(r => r.length) ? b.rowCites : undefined;
      return [
        ...(b.caption ? [`**${b.caption}**`, ''] : []),
        `| ${b.headers.map(cell).join(' | ')} |`,
        `|${b.headers.map(() => ' --- ').join('|')}|`,
        ...b.rows.map((r, i) => `| ${r.map((x, k) => cell(k === r.length - 1 && rowCites ? `${x}${c(rowCites[i] ?? [])}` : x)).join(' | ')} |`),
        ...(!rowCites && b.cites.length ? ['', c(b.cites).trim()] : []),
      ].join('\n');
    }
    case 'callout': return `> **${CALLOUT_LABEL[b.variant] ?? 'Hinweis'}:** ${b.text}${c(b.cites)}${b.variant === 'einordnung' ? '' : ki}`;
    case 'study': return [
      `**${b.authors}${b.year ? ` (${b.year})` : ''}**${c(b.cites)}`,
      ...(b.design ? [`- Aufbau: ${b.design}`] : []),
      ...(b.result ? [`- Ergebnis: ${b.result}`] : []),
      ...(b.conclusion ? [`- Schluss: ${b.conclusion}`] : []),
    ].join('\n');
    case 'figure': return `*Abbildung: ${figureText(b.title, b.caption)}*${c(b.cites)}`;
    case 'timeline': return b.items.map(i => `- **${i.year}** ${i.who}: ${i.what}${c(i.cites)}`).join('\n');
    case 'check': return `**${b.question}**${ki}\n${b.answer}`;
  }
};

export const resultToMarkdown = (r: LernstudioResult, numberOf: (sourceId: string) => number | undefined, refs: StudioSourceRef[] = []): string => {
  const body = r.blocks.map(b => blockToMarkdown(b, numberOf, refs)).join('\n\n');
  const warn = r.warnings.length ? `\n\n---\n**Hinweise zur Prüfung:**\n${r.warnings.map(w => `- ${w}`).join('\n')}` : '';
  return body + warn;
};
