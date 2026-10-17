import type { Block, Cite, StudioOutputFormat, Unit } from './types';
import type { Chapter } from './outline';
import { normalizeBlocks, writerSchema, type DroppedBlock, type FigureRef } from './blocks';
import { SUMMARY_BLOCK_TYPES, SUMMARY_PROMPT } from './prompts/summary.v3';
import { SCRIPT_BLOCK_TYPES, SCRIPT_PROMPT } from './prompts/script.v1';
import { GUIDE_BLOCK_TYPES, GUIDE_PROMPT } from './prompts/guide.v1';
import { GLOSSARY_BLOCK_TYPES, GLOSSARY_PROMPT } from './prompts/glossary.v1';
import { STUDIO_TEMPERATURE, type StudioLlm } from './llm';
import { unitFlags } from './outline';
import { blockTexts } from './text';

/** Schritt C: ein Kapitel (oder ein einzelner Abschnitt) schreiben, auch Reparatur E mit Beanstandungen. */

const unitLine = (u: Unit, sourceNames: Map<string, string>) => {
  const where = `${sourceNames.get(u.sourceId) ?? '?'}${u.page ? `, S. ${u.page}` : ''}`;
  const study = u.study
    ? ` [Studie: ${[u.study.authors, u.study.year, u.study.design, u.study.result, u.study.conclusion].filter(Boolean).join(' | ')}]`
    : '';
  const answer = u.answer ? ` [Antwort: ${u.answer}]` : '';
  return `- ${u.id} (${u.type}, ${where})${unitFlags(u)}${u.title ? ` ${u.title}:` : ''} ${u.text}${study}${answer}`;
};

/**
 * Das Schreibmodell überzog sein Budget in der Abnahme (16.10.2026) um etwa
 * 30 %; es bekommt deshalb ein kleineres genannt. Geprüft wird gegen das
 * echte Budget (pipeline.ts, Kürzung über die Reparatur).
 */
export const WRITER_BUDGET_FACTOR = 0.75;
/** Argon überzog in der Abnahme stärker (bis 20 % über dem Budget trotz 0,75). */
export const WRITER_BUDGET_FACTOR_ARGON = 0.65;
export const writerBudget = (budget: number, argon = false, format: StudioOutputFormat = 'zusammenfassung'): number =>
  Math.max(40, Math.round(budget * (format === 'skript' ? WRITER_BUDGET_FACTOR_SCRIPT : argon ? WRITER_BUDGET_FACTOR_ARGON : WRITER_BUDGET_FACTOR)));
/** Skript: das Budget ist eine Größenordnung (80 bis 150 %), kein hartes Limit; etwas weniger nennen. */
export const WRITER_BUDGET_FACTOR_SCRIPT = 0.85;

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
  /** Schreiben mit Argon (anderes Budget, siehe writerBudget). */
  argon?: boolean;
  /** Zusammenfassung (Standard), Skript (Phase 2: je Abschnitt, zum Verstehen) oder Lernleitfaden (je Kapitel, Fragen mit Antworten). */
  format?: StudioOutputFormat;
  /** Skript: Titel der Nachbarabschnitte (für Leitfrage und Überleitung). */
  neighbors?: { prev?: string; next?: string };
  /** Glossar: Pflichtbegriffe des Kapitels (aus der Begriffsliste). */
  requiredTerms?: string[];
}

export interface WriteResult { blocks: Block[]; dropped: DroppedBlock[] }

/**
 * Antwortgrenze je Kapitel, an das Wortbudget gekoppelt. Gemessen (Abnahme
 * 16.10.2026): mit JSON-Struktur, Einheiten-IDs und Tabellen braucht ein
 * Budgetwort 4 bis 5 Tokens; mit 3 je Wort plus 1.500 lief das größte Kapitel
 * in 4 von 6 Läufen ans Limit. Schleifen fängt ohnehin der Stream-Wächter
 * (guardedLlm) nach wenigen hundert Tokens ab; die Grenze ist die zweite Bremse.
 */
export const chapterTokenCap = (budget: number): number => Math.min(16_000, Math.max(3_000, Math.round(budget * 5 + 2_000)));

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
    ? `\n=== ÜBERARBEITUNG ===\nDeine vorherige Fassung hatte diese Probleme. Schreib ${input.format === 'skript' ? 'den Abschnitt' : 'das Kapitel'} neu, behebe sie alle und behalte alles Richtige:\n${input.repair.issues.map(i => `- ${i}`).join('\n')}\n\nVorherige Fassung:\n${input.repair.previous.filter(b => !b.id.endsWith('-h')).map(previousLine).join('\n')}\n`
    : '';
  const script = input.format === 'skript';
  const part = input.sectionIndex !== undefined && !script
    ? `\nDu schreibst nur EINEN Abschnitt dieses Kapitels: ein heading mit seinem Titel, danach sein Inhalt.\n`
    : '';
  const neighbors = script
    ? `\nVORHERIGER ABSCHNITT: ${input.neighbors?.prev ?? '(keiner, dies ist der Anfang)'}\nNÄCHSTER ABSCHNITT: ${input.neighbors?.next ?? '(keiner, dies ist der letzte Abschnitt)'}\n`
    : '';
  const required = input.requiredTerms?.length
    ? `\nPFLICHTBEGRIFFE (je eine eigene Zeile, Schreibweise wie hier): ${input.requiredTerms.join('; ')}\n`
    : '';
  return `${script ? SCRIPT_PROMPT : input.format === 'leitfaden' ? GUIDE_PROMPT : input.format === 'glossar' ? GLOSSARY_PROMPT : SUMMARY_PROMPT}
${focus}${exam}${figs}${required}${repair}${part}${neighbors}
=== KAPITEL: ${input.chapter.title} ===
WORTBUDGET: ${writerBudget(input.chapter.budget, input.argon, input.format)} Wörter${script ? ' (ungefähr)' : ' (Obergrenze, nicht überschreiten)'}

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
    // Typ "figure" nur, wenn es Abbildungen zum Einfügen gibt (sonst hielt das Modell figure-Einheiten für Bilder).
    step: 'write', prompt: buildWritePrompt(input),
    schema: writerSchema((input.format === 'skript' ? SCRIPT_BLOCK_TYPES : input.format === 'leitfaden' ? GUIDE_BLOCK_TYPES
      : input.format === 'glossar' ? GLOSSARY_BLOCK_TYPES : SUMMARY_BLOCK_TYPES).filter(t => t !== 'figure' || input.figures.length)),
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
