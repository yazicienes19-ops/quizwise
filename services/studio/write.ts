import type { Block, Cite, Unit } from './types';
import type { Chapter } from './outline';
import { normalizeBlocks, writerSchema, type FigureRef } from './blocks';
import { SUMMARY_BLOCK_TYPES, SUMMARY_PROMPT } from './prompts/summary.v1';
import type { StudioLlm } from './llm';

/** Schritt C: ein Kapitel schreiben (auch Reparatur E mit Beanstandungen). */

const unitLine = (u: Unit, sourceNames: Map<string, string>) => {
  const where = `${sourceNames.get(u.sourceId) ?? '?'}${u.page ? `, S. ${u.page}` : ''}`;
  const study = u.study
    ? ` [Studie: ${[u.study.authors, u.study.year, u.study.design, u.study.result, u.study.conclusion].filter(Boolean).join(' | ')}]`
    : '';
  return `- ${u.id} (${u.type}, ${where})${u.title ? ` ${u.title}:` : ''} ${u.text}${study}`;
};

export interface WriteInput {
  chapter: Chapter;
  chapterIndex: number;
  units: Unit[];
  sourceNames: Map<string, string>;
  examInfo: Unit[];
  figures: FigureRef[];
  focus?: string;
  /** Reparatur: Beanstandungen und vorherige Fassung. */
  repair?: { issues: string[]; previous: Block[] };
}

export const buildWritePrompt = (input: WriteInput): string => {
  const byId = new Map(input.units.map(u => [u.id, u]));
  const sections = input.chapter.sections.map(s =>
    `## Abschnitt: ${s.title}\n${s.unitIds.map(id => byId.get(id)).filter((u): u is Unit => !!u).map(u => unitLine(u, input.sourceNames)).join('\n')}`,
  ).join('\n\n');
  const exam = input.examInfo.length
    ? `\n=== KLAUSURINFOS (nur zur Gewichtung, nicht wiedergeben) ===\n${input.examInfo.map(u => `- ${u.text}`).join('\n')}\n`
    : '';
  const figs = input.figures.length
    ? `\n=== ABBILDUNGEN ===\n${input.figures.map(f => `${f.ref} · ${input.sourceNames.get(f.sourceId) ?? '?'}, S. ${f.page}: ${f.title}`).join('\n')}\n`
    : '';
  const focus = input.focus?.trim() ? `\nSCHWERPUNKT: "${input.focus.trim().slice(0, 300)}"\n` : '';
  const repair = input.repair
    ? `\n=== ÜBERARBEITUNG ===\nDeine vorherige Fassung hatte diese Probleme. Schreib das Kapitel neu und behebe sie alle:\n${input.repair.issues.map(i => `- ${i}`).join('\n')}\n`
    : '';
  return `${SUMMARY_PROMPT}
${focus}${exam}${figs}${repair}
=== KAPITEL: ${input.chapter.title} ===
WORTBUDGET: ${input.chapter.budget} Wörter

${sections}`;
};

export const writeChapter = async (input: WriteInput, llm: StudioLlm, argon: boolean): Promise<Block[]> => {
  const byId = new Map(input.units.map(u => [u.id, u]));
  const raw = await llm({
    step: 'write', prompt: buildWritePrompt(input), schema: writerSchema(SUMMARY_BLOCK_TYPES),
    heavy: true, argon, temperature: 0.3,
  });
  const prefix = `c${input.chapterIndex + 1}${input.repair ? 'r' : ''}-`;
  const blocks = normalizeBlocks((raw as { blocks?: unknown })?.blocks, byId, prefix, input.figures)
    // Kapitelüberschrift setzt der Code; Modell-Überschriften der Ebene 1/2 werden zu Abschnitten.
    .map(b => (b.type === 'heading' ? { ...b, level: 3 as const } : b));
  const chapterUnits = input.chapter.sections.flatMap(s => s.unitIds);
  const headCites: Cite[] = [];
  return [
    { id: `${prefix}h`, origin: 'quelle', cites: headCites, type: 'heading', level: 2, text: input.chapter.title },
    ...ensureSourceErrorHints(blocks, chapterUnits.map(id => byId.get(id)).filter((u): u is Unit => !!u), prefix),
  ];
};

/**
 * Folienfehler (source_error) systematisch melden: fehlt im Kapitel ein
 * Hinweis mit Beleg auf die Seite, hängt der Code ihn an.
 */
export const ensureSourceErrorHints = (blocks: Block[], chapterUnits: Unit[], prefix: string): Block[] => {
  const errors = chapterUnits.filter(u => u.type === 'source_error');
  const out = [...blocks];
  errors.forEach((u, i) => {
    const covered = blocks.some(b => b.type === 'callout' && b.variant === 'hinweis'
      && b.cites.some(c => c.sourceId === u.sourceId && c.page === u.page));
    if (covered) return;
    out.push({
      id: `${prefix}se${i + 1}`, origin: 'quelle', cites: [{ sourceId: u.sourceId, page: u.page }],
      type: 'callout', variant: 'hinweis', text: u.text,
    });
  });
  return out;
};
