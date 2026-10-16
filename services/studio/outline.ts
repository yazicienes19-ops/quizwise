import type { Unit } from './types';
import { OUTLINE_PROMPT, outlineSchema } from './prompts/outline.v1';
import { STUDIO_TEMPERATURE, type StudioLlm } from './llm';
import { countWords } from './text';

/**
 * Schritt B: Gliederung. Das Modell gruppiert, der Code sichert ab: jede
 * Einheit genau einmal, fehlende in den Abschnitt mit der nächsten Seite
 * derselben Quelle, Wortbudget je Kapitel nach Stoffmenge.
 */

export interface Section { title: string; unitIds: string[] }
export interface Chapter { title: string; sections: Section[]; budget: number }

/** Diese Typen schreibt der Code selbst (Aufgaben, Klausurinfos) oder lässt sie weg. */
export const SEPARATE_TYPES = new Set(['task', 'exam_info', 'organizational']);

const short = (u: Unit) => (u.title ? `${u.title}: ${u.text}` : u.text).replace(/\s+/g, ' ').slice(0, 140);

export const buildOutlinePrompt = (units: Unit[], sourceNames: Map<string, string>, focus?: string): string => {
  const lines = units.map(u => `${u.id} | ${u.type} | ${sourceNames.get(u.sourceId) ?? '?'}${u.page ? ` S. ${u.page}` : ''} | ${short(u)}`);
  const focusLine = focus?.trim()
    ? `\nSCHWERPUNKT des Nutzers: "${focus.trim().slice(0, 300)}". Stelle passende Kapitel nach vorn und fasse den Rest knapper zusammen, lass aber keine Einheit weg.\n`
    : '';
  return `${OUTLINE_PROMPT}\n${focusLine}\n=== EINHEITEN ===\n${lines.join('\n')}`;
};

const clean = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, 80) : '');

/** Modellantwort → Kapitel ohne doppelte oder unbekannte IDs, ohne leere Abschnitte. */
export const parseOutline = (raw: unknown, units: Unit[]): Chapter[] => {
  const known = new Set(units.map(u => u.id));
  const used = new Set<string>();
  const chapters = (raw && typeof raw === 'object' && Array.isArray((raw as { chapters?: unknown }).chapters)
    ? (raw as { chapters: { title?: unknown; sections?: { title?: unknown; unitIds?: unknown }[] }[] }).chapters : [])
    .map(c => ({
      title: clean(c.title) || 'Kapitel',
      budget: 0,
      sections: (Array.isArray(c.sections) ? c.sections : []).map(s => ({
        title: clean(s.title) || clean(c.title) || 'Abschnitt',
        unitIds: (Array.isArray(s.unitIds) ? s.unitIds : []).filter((id): id is string => {
          if (typeof id !== 'string' || !known.has(id) || used.has(id)) return false;
          used.add(id);
          return true;
        }),
      })).filter(s => s.unitIds.length),
    }))
    .filter(c => c.sections.length);
  return chapters;
};

/** Vergessene Einheiten einsortieren: zur nächsten Seite derselben Quelle, sonst in ein eigenes Kapitel. */
export const completeOutline = (chapters: Chapter[], units: Unit[], fallbackTitle = 'Weitere Inhalte'): Chapter[] => {
  const byId = new Map(units.map(u => [u.id, u]));
  const placed = new Set(chapters.flatMap(c => c.sections.flatMap(s => s.unitIds)));
  const missing = units.filter(u => !placed.has(u.id));
  const out = chapters.map(c => ({ ...c, sections: c.sections.map(s => ({ ...s, unitIds: [...s.unitIds] })) }));
  const orphans: string[] = [];
  for (const u of missing) {
    let best: Section | null = null;
    let bestDist = Infinity;
    for (const c of out) for (const s of c.sections) {
      for (const id of s.unitIds) {
        const v = byId.get(id);
        if (v?.sourceId !== u.sourceId) continue;
        const d = Math.abs(v.page - u.page);
        if (d < bestDist) { bestDist = d; best = s; }
      }
    }
    if (best && bestDist <= 3) best.unitIds.push(u.id); else orphans.push(u.id);
  }
  if (orphans.length) out.push({ title: fallbackTitle, budget: 0, sections: [{ title: fallbackTitle, unitIds: orphans }] });
  return out;
};

/** Zielkorridor der Zusammenfassung (Wörter): 25 bis 40 % der Quelle, mindestens 600, höchstens 6.000. */
export const summaryCorridor = (sourceWords: number): { min: number; max: number; target: number } => {
  const clamp = (n: number) => Math.round(Math.min(6000, Math.max(600, n)));
  const min = clamp(sourceWords * 0.25);
  const max = clamp(sourceWords * 0.4);
  return { min, max, target: Math.round((min + max) / 2) };
};

/** Budget je Kapitel proportional zur Stoffmenge seiner Einheiten, mindestens 60 Wörter. */
export const assignBudgets = (chapters: Chapter[], units: Unit[], total: number): Chapter[] => {
  const byId = new Map(units.map(u => [u.id, u]));
  const weight = (c: Chapter) => c.sections.reduce((s, sec) => s + sec.unitIds.reduce((a, id) => a + countWords(byId.get(id)?.text ?? ''), 0), 0);
  const weights = chapters.map(weight);
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  return chapters.map((c, i) => ({ ...c, budget: Math.max(60, Math.round(total * weights[i] / sum)) }));
};

export const buildOutline = async (
  units: Unit[],
  sourceNames: Map<string, string>,
  llm: StudioLlm,
  sourceWords: number,
  focus?: string,
): Promise<Chapter[]> => {
  const content = units.filter(u => !SEPARATE_TYPES.has(u.type));
  if (!content.length) return [];
  const raw = await llm({ step: 'outline', prompt: buildOutlinePrompt(content, sourceNames, focus), schema: outlineSchema, heavy: true,
    temperature: STUDIO_TEMPERATURE.outline, maxOutputTokens: 12_000,
  });
  const chapters = completeOutline(parseOutline(raw, content), content);
  return assignBudgets(chapters, content, summaryCorridor(sourceWords).target);
};
