import type { Unit } from './types';
import { OUTLINE_PROMPT, OUTLINE_SKELETON_PROMPT, outlineSchema } from './prompts/outline.v2';
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
export const SEPARATE_TYPES = new Set(['task', 'practice_question', 'exam_info', 'organizational']);

const short = (u: Unit) => (u.title ? `${u.title}: ${u.text}` : u.text).replace(/\s+/g, ' ').slice(0, 140);

/** Markierungen für Gliederung und Schreiben. */
export const unitFlags = (u: Unit): string =>
  `${u.priority ? ' [prüfungsrelevant]' : ''}${u.illustrative ? ' [Rechenbeispiel, ausgedachte Werte]' : ''}`;

const outlineLine = (u: Unit, sourceNames: Map<string, string>) =>
  `${u.id} | ${u.type}${unitFlags(u)} | ${sourceNames.get(u.sourceId) ?? '?'}${u.page ? ` S. ${u.page}` : ''} | ${short(u)}`;

/** Eine Vorlesung: ganze Quelle oder ein Teil einer zusammengefügten PDF. */
export interface Lecture { title: string; docId: string; from: number; to: number }

export const lectureIndex = (u: Unit, lectures: Lecture[]): number =>
  lectures.findIndex(l => l.docId === u.sourceId && (u.page === 0 || (u.page >= l.from && u.page <= l.to)));

export const buildOutlinePrompt = (units: Unit[], sourceNames: Map<string, string>, focus?: string): string => {
  const lines = units.map(u => outlineLine(u, sourceNames));
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

/**
 * Budget je Kapitel proportional zur Stoffmenge, mindestens 60 Wörter.
 * Stoffmenge = Wörter der Folien, aus denen die Einheiten des Kapitels stammen
 * (pageWords). Die Länge der extrahierten Texte taugt dafür nicht: Flash-Lite
 * fasst manche Folien sehr knapp, das Kapitel bekam dann zu wenig Budget und
 * verlor Ergebniszahlen (Abnahme 16.10.: "7 von 15"). Ohne Seitenwörter
 * (Quellen ohne Seiten) zählt der Text der Einheiten.
 */
export const assignBudgets = (
  chapters: Chapter[],
  units: Unit[],
  total: number,
  pageWords?: (sourceId: string, page: number) => number,
): Chapter[] => {
  const byId = new Map(units.map(u => [u.id, u]));
  const weight = (c: Chapter) => {
    const own = c.sections.flatMap(sec => sec.unitIds).map(id => byId.get(id)).filter((u): u is Unit => !!u);
    const pages = new Set(own.filter(u => u.page > 0).map(u => `${u.sourceId}:${u.page}`));
    const fromPages = pageWords ? [...pages].reduce((a, k) => { const [s, p] = [k.slice(0, k.lastIndexOf(':')), Number(k.slice(k.lastIndexOf(':') + 1))]; return a + pageWords(s, p); }, 0) : 0;
    const fromUnits = own.filter(u => u.page === 0 || !pageWords).reduce((a, u) => a + countWords(u.text), 0);
    return fromPages + fromUnits || own.reduce((a, u) => a + countWords(u.text), 0);
  };
  const weights = chapters.map(weight);
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  // Untergrenze je inhaltlicher Einheit: Folien mit Videos und Bildern haben wenig Text, aber viel Stoff.
  const floor = (c: Chapter) => MIN_WORDS_PER_UNIT * c.sections.flatMap(sec => sec.unitIds).filter(id => CONTENT_FOR_BUDGET.has(byId.get(id)?.type ?? '')).length;
  return chapters.map((c, i) => ({ ...c, budget: Math.max(60, floor(c), Math.round(total * weights[i] / sum)) }));
};

const MIN_WORDS_PER_UNIT = 15;
const CONTENT_FOR_BUDGET = new Set(['definition', 'concept', 'study', 'finding', 'comparison', 'example', 'list']);

/**
 * Wörter für die Kapitel: 85 % der Obergrenze des Korridors abzüglich
 * der Abschnitte, die der Code anhängt (Zeitleiste, Aufgaben, Übungsfragen,
 * Klausurinfos). Die zählen zur Länge, standen aber nicht im Budget; die
 * Zusammenfassung lag dadurch bei 42 % statt höchstens 40 %.
 */
/** Anteil der Obergrenze für die Kapitel: Luft für die Untergrenze je Einheit und das Überziehen des Schreibmodells. */
export const CHAPTER_SHARE = 0.85;

export const chapterWordTotal = (sourceWords: number, reservedWords: number): number => {
  const { min, max } = summaryCorridor(sourceWords);
  return Math.max(Math.round(min * 0.8), Math.round(max * CHAPTER_SHARE) - reservedWords);
};

/**
 * Feste Kapitel je Vorlesung: das Modell vergibt Titel und Abschnitte, der
 * Code hält jede Einheit in ihrem Kapitel und sortiert Vergessenes ein.
 */
export const skeletonOutline = (raw: unknown, groups: { lecture: Lecture; units: Unit[] }[]): Chapter[] => {
  const all = groups.flatMap(g => g.units);
  const parsed = parseOutline(raw, all);
  return groups.map((g, i) => {
    const own = new Set(g.units.map(u => u.id));
    const model = parsed[i];
    const sections = (model?.sections ?? [])
      .map(s => ({ ...s, unitIds: s.unitIds.filter(id => own.has(id)) }))
      .filter(s => s.unitIds.length);
    const title = model?.title && model.title !== 'Kapitel' ? model.title : g.lecture.title;
    return completeOutline([{ title, budget: 0, sections }], g.units, title)
      // Vergessene Einheiten ohne nahen Abschnitt bilden einen Abschnitt im selben Kapitel, kein neues Kapitel.
      .reduce((acc, c, k) => (k === 0 ? acc : { ...acc, sections: [...acc.sections, ...c.sections.map(s => ({ ...s, title: s.title === title ? 'Weitere Inhalte' : s.title }))] }));
  });
};

export const buildOutline = async (
  units: Unit[],
  sourceNames: Map<string, string>,
  llm: StudioLlm,
  sourceWords: number,
  focus?: string,
  /** Mehrere Vorlesungen (Quellen oder Teile einer zusammengefügten PDF): je Vorlesung ein festes Kapitel. */
  lectures: Lecture[] = [],
  /** Wörter je Folie (Stoffmenge für das Budget) und Wörter der angehängten Abschnitte. */
  budgetInfo: { pageWords?: (sourceId: string, page: number) => number; reservedWords?: number } = {},
): Promise<Chapter[]> => {
  const total = chapterWordTotal(sourceWords, budgetInfo.reservedWords ?? 0);
  const content = units.filter(u => !SEPARATE_TYPES.has(u.type));
  if (!content.length) return [];
  const groups = lectures
    .map(lecture => ({ lecture, units: content.filter(u => lectureIndex(u, lectures) === lectures.indexOf(lecture)) }))
    .filter(g => g.units.length);
  const orphans = content.filter(u => lectureIndex(u, lectures) < 0);
  if (groups.length >= 2 && !orphans.length) {
    const focusLine = focus?.trim()
      ? `\nSCHWERPUNKT des Nutzers: "${focus.trim().slice(0, 300)}". Fasse Passendes ausführlicher, den Rest knapper, lass aber keine Einheit weg.\n`
      : '';
    const prompt = `${OUTLINE_SKELETON_PROMPT}\n${focusLine}\n${groups.map((g, i) =>
      `=== KAPITEL ${i + 1} (Vorlesung: ${g.lecture.title}) ===\n${g.units.map(u => outlineLine(u, sourceNames)).join('\n')}`).join('\n\n')}`;
    const raw = await llm({ step: 'outline', prompt, schema: outlineSchema, heavy: true, temperature: STUDIO_TEMPERATURE.outline, maxOutputTokens: 12_000 });
    return assignBudgets(skeletonOutline(raw, groups), content, total, budgetInfo.pageWords);
  }
  const raw = await llm({ step: 'outline', prompt: buildOutlinePrompt(content, sourceNames, focus), schema: outlineSchema, heavy: true,
    temperature: STUDIO_TEMPERATURE.outline, maxOutputTokens: 12_000,
  });
  const chapters = completeOutline(parseOutline(raw, content), content);
  return assignBudgets(chapters, content, total, budgetInfo.pageWords);
};
