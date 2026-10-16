import type { Block, Cite, LernstudioResult } from './types';

/**
 * Blöcke → Markdown für Kopieren, Download, "Als Quelle hinzufügen" und die
 * Spalte studio_items.markdown (ältere App-Versionen zeigen so etwas Lesbares).
 * Fußnoten als [n:p] im bisherigen Format, damit der alte Renderer sie kennt.
 */

const CALLOUT_LABEL: Record<string, string> = {
  merksatz: 'Merksatz', klausurfalle: 'Klausurfalle', hinweis: 'Hinweis', beispiel: 'Beispiel', einordnung: 'Einordnung (Erklärhilfe)',
};

export const citeTokens = (cites: Cite[], numberOf: (sourceId: string) => number | undefined): string =>
  cites.map(c => {
    const n = numberOf(c.sourceId);
    if (!n) return '';
    return c.page ? `[${n}:${c.page}]` : `[${n}]`;
  }).join('');

const cell = (t: string) => t.replace(/\|/g, '\\|');

export const blockToMarkdown = (b: Block, numberOf: (sourceId: string) => number | undefined): string => {
  const c = (cites: Cite[]) => { const t = citeTokens(cites, numberOf); return t ? ` ${t}` : ''; };
  const ki = b.origin === 'ki' ? ' *(Erklärhilfe)*' : '';
  switch (b.type) {
    case 'heading': return `${'#'.repeat(b.level + 1)} ${b.text}`;
    case 'paragraph': return `${b.text}${c(b.cites)}${ki}`;
    case 'bullets': case 'tasks': return b.items.map(i => `- ${i.text}${c(i.cites.length ? i.cites : b.cites)}`).join('\n');
    case 'table': return [
      ...(b.caption ? [`**${b.caption}**${c(b.cites)}`, ''] : []),
      `| ${b.headers.map(cell).join(' | ')} |`,
      `|${b.headers.map(() => ' --- ').join('|')}|`,
      ...b.rows.map(r => `| ${r.map(cell).join(' | ')} |`),
    ].join('\n');
    case 'callout': return `> **${CALLOUT_LABEL[b.variant] ?? 'Hinweis'}:** ${b.text}${c(b.cites)}`;
    case 'study': return [
      `**${b.authors} (${b.year})**${c(b.cites)}`,
      ...(b.design ? [`- Aufbau: ${b.design}`] : []),
      ...(b.result ? [`- Ergebnis: ${b.result}`] : []),
      ...(b.conclusion ? [`- Schluss: ${b.conclusion}`] : []),
    ].join('\n');
    case 'figure': return `*Abbildung${b.title ? `: ${b.title}` : ''}. ${b.caption}*${c(b.cites)}`;
    case 'timeline': return b.items.map(i => `- **${i.year}** ${i.who}: ${i.what}${c(i.cites)}`).join('\n');
    case 'check': return `**${b.question}**\n${b.answer}`;
  }
};

export const resultToMarkdown = (r: LernstudioResult, numberOf: (sourceId: string) => number | undefined): string => {
  const body = r.blocks.map(b => blockToMarkdown(b, numberOf)).join('\n\n');
  const warn = r.warnings.length ? `\n\n---\n**Hinweise zur Prüfung:**\n${r.warnings.map(w => `- ${w}`).join('\n')}` : '';
  return body + warn;
};
