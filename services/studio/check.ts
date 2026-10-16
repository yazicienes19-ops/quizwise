import type { Block, Cite, Issue, Unit } from './types';
import { CHECKER_PROMPT, checkerSchema } from './prompts/checker.v1';
import type { StudioLlm } from './llm';
import { blockTexts } from './text';

/** Schritt D2: Prüfdurchlauf durch das Modell (Belege, Zahlen, Chronologie, KI-Fakten). */

const MAX_PROMPT_CHARS = 150_000;

const citeKey = (c: Cite) => `${c.sourceId}:${c.page}`;

const blockLine = (b: Block): string => {
  const cites = [...new Set([
    ...b.cites.map(citeKey),
    ...(b.type === 'bullets' || b.type === 'tasks' || b.type === 'timeline' ? b.items.flatMap(i => i.cites.map(citeKey)) : []),
  ])];
  return `[${b.id}] (${b.type}, origin ${b.origin}${cites.length ? `, Belege ${cites.join(' ')}` : ''}) ${blockTexts(b).join(' | ')}`;
};

export const buildCheckPrompt = (blocks: Block[], units: Unit[]): string => {
  const cited = new Set(blocks.flatMap(b => [
    ...b.cites, ...(b.type === 'bullets' || b.type === 'tasks' || b.type === 'timeline' ? b.items.flatMap(i => i.cites) : []),
  ]).map(citeKey));
  const evidence = units
    .filter(u => cited.has(`${u.sourceId}:${u.page}`))
    .map(u => `${u.sourceId}:${u.page} | ${u.type} | ${[u.title, u.text, u.study && JSON.stringify(u.study)].filter(Boolean).join(' ')}`);
  return `${CHECKER_PROMPT}

=== BLÖCKE ===
${blocks.filter(b => b.type !== 'heading').map(blockLine).join('\n')}

=== EINHEITEN (nach Beleg "Quelle:Seite") ===
${evidence.join('\n')}`;
};

const TYPES = new Set(['nicht_belegt', 'falsch', 'chronologie', 'zitat_falsch', 'ki_fakt']);

export const parseCheckIssues = (raw: unknown, blockIds: Set<string>): Issue[] => {
  const list = raw && typeof raw === 'object' && Array.isArray((raw as { issues?: unknown }).issues)
    ? (raw as { issues: Record<string, unknown>[] }).issues : [];
  return list
    .filter(i => typeof i.blockId === 'string' && blockIds.has(i.blockId) && TYPES.has(String(i.typ)) && typeof i.problem === 'string')
    .map(i => ({
      rule: i.typ as Issue['rule'],
      blockId: i.blockId as string,
      message: String(i.problem).slice(0, 400),
      ...(typeof i.korrektur === 'string' && i.korrektur.trim() ? { fix: i.korrektur.slice(0, 400) } : {}),
    }));
};

/** Prüft in Paketen (je Kapitel zusammenhängend), damit der Prompt nicht zu groß wird. */
export const checkWithModel = async (chapters: Block[][], units: Unit[], llm: StudioLlm): Promise<Issue[]> => {
  const packs: Block[][] = [];
  let current: Block[] = [];
  for (const ch of chapters) {
    const next = [...current, ...ch];
    if (current.length && buildCheckPrompt(next, units).length > MAX_PROMPT_CHARS) { packs.push(current); current = [...ch]; } else current = next;
  }
  if (current.length) packs.push(current);
  const results = await Promise.all(packs.map(async blocks => {
    const raw = await llm({ step: 'check', prompt: buildCheckPrompt(blocks, units), schema: checkerSchema, heavy: true, thinkingBudget: 1024, temperature: 0 });
    return parseCheckIssues(raw, new Set(blocks.map(b => b.id)));
  }));
  return results.flat();
};
