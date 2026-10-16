import type { Block, Cite, Unit } from './types';
import type { Chapter } from './outline';
import { normalizeBlocks, writerSchema, type DroppedBlock, type FigureRef } from './blocks';
import { SUMMARY_BLOCK_TYPES, SUMMARY_PROMPT } from './prompts/summary.v2';
import { STUDIO_TEMPERATURE, type StudioLlm } from './llm';
import { blockTexts } from './text';

/** Schritt C: ein Kapitel (oder ein einzelner Abschnitt) schreiben, auch Reparatur E mit Beanstandungen. */

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
  /** Nur diesen Abschnitt schreiben (Rückfall, wenn das ganze Kapitel scheitert). */
  sectionIndex?: number;
  units: Unit[];
  sourceNames: Map<string, string>;
  examInfo: Unit[];
  figures: FigureRef[];
  focus?: string;
  /** Reparatur: Beanstandungen und vorherige Fassung. */
  repair?: { issues: string[]; previous: Block[] };
}

export interface WriteResult { blocks: Block[]; dropped: DroppedBlock[] }

/**
 * Antwortgrenze je Kapitel: etwa 3 Tokens je Budgetwort plus Puffer für das
 * JSON. Eine Schleife endet so nach wenigen tausend Tokens statt am
 * Modell-Limit (16k bzw. 32k bei Argon).
 */
export const chapterTokenCap = (budget: number): number => Math.min(16_000, Math.max(2_500, Math.round(budget * 3 + 1_500)));

/** Vorherige Fassung kompakt für den Reparatur-Prompt (Typ, Text, Einheiten). */
const previousLine = (b: Block): string => {
  const ids = b.unitIds?.length ? ` (units: ${b.unitIds.join(', ')})` : '';
  const kind = b.type === 'callout' ? `callout ${b.variant}` : b.type;
  return `- [${kind}] ${blockTexts(b).filter(Boolean).join(' | ')}${ids}`;
};

export const buildWritePrompt = (input: WriteInput): string => {
  const byId = new Map(input.units.map(u => [u.id, u]));
  const sections = (input.sectionIndex !== undefined ? [input.chapter.sections[input.sectionIndex]] : input.chapter.sections).map(s =>
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
    ? `\n=== ÜBERARBEITUNG ===\nDeine vorherige Fassung hatte diese Probleme. Schreib das Kapitel neu, behebe sie alle und behalte alles Richtige:\n${input.repair.issues.map(i => `- ${i}`).join('\n')}\n\nVorherige Fassung:\n${input.repair.previous.filter(b => !b.id.endsWith('-h')).map(previousLine).join('\n')}\n`
    : '';
  const part = input.sectionIndex !== undefined
    ? `\nDu schreibst nur EINEN Abschnitt dieses Kapitels: ein heading mit seinem Titel, danach sein Inhalt.\n`
    : '';
  return `${SUMMARY_PROMPT}
${focus}${exam}${figs}${repair}${part}
=== KAPITEL: ${input.chapter.title} ===
WORTBUDGET: ${input.chapter.budget} Wörter

${sections}`;
};

const chapterPrefix = (input: WriteInput) =>
  `c${input.chapterIndex + 1}${input.repair ? 'r' : ''}${input.sectionIndex !== undefined ? `s${input.sectionIndex + 1}` : ''}-`;

/** Kapitelüberschrift (setzt der Code, nie das Modell). */
export const chapterHeading = (title: string, chapterIndex: number): Block =>
  ({ id: `c${chapterIndex + 1}-h`, origin: 'quelle', cites: [] as Cite[], type: 'heading', level: 2, text: title });

/** Inhalt eines Kapitels oder Abschnitts, ohne Kapitelüberschrift. */
export const writeChapterBody = async (input: WriteInput, llm: StudioLlm, argon: boolean): Promise<WriteResult> => {
  const byId = new Map(input.units.map(u => [u.id, u]));
  const raw = await llm({
    step: 'write', prompt: buildWritePrompt(input), schema: writerSchema(SUMMARY_BLOCK_TYPES),
    heavy: true, argon, temperature: STUDIO_TEMPERATURE.write, maxOutputTokens: chapterTokenCap(input.chapter.budget),
  });
  const prefix = chapterPrefix(input);
  const { blocks, dropped } = normalizeBlocks((raw as { blocks?: unknown })?.blocks, byId, prefix, input.figures);
  const sections = input.sectionIndex !== undefined ? [input.chapter.sections[input.sectionIndex]] : input.chapter.sections;
  const chapterUnits = sections.flatMap(s => s.unitIds).map(id => byId.get(id)).filter((u): u is Unit => !!u);
  return { blocks: ensureSourceErrorHints(blocks, chapterUnits, prefix), dropped };
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
      id: `${prefix}se${i + 1}`, origin: 'quelle', cites: [{ sourceId: u.sourceId, page: u.page }], unitIds: [u.id],
      type: 'callout', variant: 'hinweis', text: u.text,
    });
  });
  return out;
};
