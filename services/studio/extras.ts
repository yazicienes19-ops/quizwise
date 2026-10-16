import type { Block, Cite, Unit } from './types';
import { citationsIn, countWords } from './text';
import { TIMELINE_PROMPT, timelineSchema } from './prompts/timeline.v1';
import { STUDIO_TEMPERATURE, type StudioLlm } from './llm';

/**
 * Abschnitte am Ende, vom Code aus den Einheiten gebaut: Zeitleiste
 * (Themenstrang und Satz je Eintrag vom Modell, Daten und Reihenfolge vom
 * Code), Aufgaben aus der Vorlesung, Übungsfragen aus der Vorlesung,
 * Klausurinfos. Texte werden nie gekürzt.
 */

const cite = (u: Unit): Cite => ({ sourceId: u.sourceId, page: u.page });

/** Abkürzungen mit Punkt, die kein Satzende sind ("z.B.", "d. h.", "et al."). */
const ABBREV = /\b(?:z\.\s?B|d\.\s?h|u\.\s?a|u\.\s?U|v\.\s?a|o\.\s?Ä|bzw|vs|ca|ggf|evtl|inkl|bspw|sog|vgl|Nr|Abb|Kap|S|al|Dr|Prof)\.$/u;

/**
 * Erster vollständiger Satz, nie gekürzt (Phase 1.1: die alte Fassung schnitt
 * bei 160 Zeichen ab und hängte einen Punkt an, das sah wie ein ganzer Satz aus).
 */
export const firstSentence = (t: string): string => {
  const s = t.replace(/\s+/g, ' ').trim();
  const re = /[.!?](?=\s|$)/g;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    const head = s.slice(0, m.index + 1);
    if (m[0] === '.' && ABBREV.test(head)) continue;
    return head;
  }
  return s;
};

export interface TimelineCandidate { id: string; who: string; first: string; year: number; unit: Unit }

/**
 * Datierte Quellenangaben: je Paar aus Autor und Jahr ein Kandidat, auch wenn
 * eine Einheit mehrere nennt ("Eindringen von Input (Moray, 1959) … (Li et al., 2011)"
 * ergibt Moray 1959 und Li et al. 2011, nicht "Moray; Li et al." 2011).
 * Rechenbeispiele zählen nicht.
 */
export const timelineCandidates = (units: Unit[]): TimelineCandidate[] => {
  const byKey = new Map<string, TimelineCandidate>();
  for (const u of units) {
    if (u.illustrative || u.type === 'organizational' || u.type === 'task' || u.type === 'exam_info') continue;
    const pairs = [
      ...(u.study?.authors && u.study.year ? citationsIn(`${u.study.authors} (${u.study.year})`) : []),
      ...citationsIn(`${u.title ?? ''} ${u.text}`),
    ];
    for (const c of pairs) {
      const key = `${c.first.toLowerCase()}|${c.year}`;
      if (byKey.has(key)) continue;
      byKey.set(key, { id: `t${byKey.size + 1}`, who: c.authors, first: c.first, year: c.year, unit: u });
    }
  }
  return [...byKey.values()];
};

const MAX_WHAT_WORDS = 20;

/** Zeitleiste: Modell wählt den Strang und schreibt "was"; ohne brauchbare Antwort keine Zeitleiste. */
export const buildTimeline = async (units: Unit[], llm: StudioLlm): Promise<{ year: number; who: string; what: string; cites: Cite[] }[]> => {
  const cands = timelineCandidates(units);
  if (cands.length < 3) return [];
  const lines = cands.map(c => `${c.id} | ${c.who} | ${c.year} | ${c.unit.title ?? ''} | ${c.unit.text.replace(/\s+/g, ' ').slice(0, 300)}`);
  let raw: unknown;
  try {
    raw = await llm({
      step: 'timeline', prompt: `${TIMELINE_PROMPT}\n\n=== QUELLENANGABEN ===\n${lines.join('\n')}`, schema: timelineSchema,
      heavy: true, temperature: STUDIO_TEMPERATURE.timeline, maxOutputTokens: 3000,
    });
  } catch {
    return [];
  }
  const items = raw && typeof raw === 'object' && Array.isArray((raw as { items?: unknown }).items) ? (raw as { items: { id?: unknown; what?: unknown }[] }).items : [];
  const out: { year: number; who: string; what: string; cites: Cite[] }[] = [];
  for (const it of items) {
    const c = cands.find(x => x.id === it.id);
    const what = typeof it.what === 'string' ? it.what.replace(/\s+/g, ' ').trim() : '';
    if (!c || !what || countWords(what) > MAX_WHAT_WORDS) continue;
    // Kein doppelter Autor ("Deutsch & Deutsch: Deutsch & Deutsch, 1963") und kein leerer Satz.
    const cleaned = what.replace(new RegExp(`^${c.who.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[,:(]?\\s*(\\d{4}\\)?)?\\s*[:,]?\\s*`, 'i'), '').trim();
    if (countWords(cleaned) < 3 || out.some(o => o.who === c.who && o.year === c.year)) continue;
    out.push({ year: c.year, who: c.who, what: /[.!?]$/.test(cleaned) ? cleaned : `${cleaned}.`, cites: [cite(c.unit)] });
  }
  return out.length >= 3 ? out.sort((a, b) => a.year - b.year || a.who.localeCompare(b.who, 'de')) : [];
};

const shingles = (t: string): Set<string> => {
  const w = t.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const out = new Set<string>();
  for (let i = 0; i + 3 <= w.length; i++) out.add(w.slice(i, i + 3).join(' '));
  return out;
};
const jaccard = (a: Set<string>, b: Set<string>) => {
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const x of a) if (b.has(x)) n += 1;
  return n / (a.size + b.size - n);
};

/** Gleiche oder fast gleiche Texte zusammenführen; die Fundstellen bleiben alle als Fußnote. */
export const mergeNearDuplicates = (units: Unit[], threshold = 0.8): { text: string; cites: Cite[]; unit: Unit }[] => {
  const out: { text: string; cites: Cite[]; unit: Unit; sh: Set<string> }[] = [];
  for (const u of units) {
    const sh = shingles(u.text);
    const same = out.find(o => o.text === u.text || jaccard(o.sh, sh) >= threshold);
    if (same) { if (!same.cites.some(c => c.sourceId === u.sourceId && c.page === u.page)) same.cites.push(cite(u)); continue; }
    out.push({ text: u.text, cites: [cite(u)], unit: u, sh });
  }
  return out.map(({ text, cites, unit }) => ({ text, cites, unit }));
};

export const buildExtraBlocks = (units: Unit[], timeline: { year: number; who: string; what: string; cites: Cite[] }[] = []): Block[] => {
  const blocks: Block[] = [];
  if (timeline.length >= 3) {
    blocks.push({ id: 'x-tl-h', origin: 'quelle', cites: [], type: 'heading', level: 2, text: 'Zeitleiste' });
    blocks.push({ id: 'x-tl', origin: 'quelle', cites: [], type: 'timeline', items: timeline });
  }
  const tasks = mergeNearDuplicates(units.filter(u => u.type === 'task'));
  if (tasks.length) {
    blocks.push({ id: 'x-tasks-h', origin: 'quelle', cites: [], type: 'heading', level: 2, text: 'Aufgaben aus der Vorlesung' });
    blocks.push({ id: 'x-tasks', origin: 'quelle', cites: [], type: 'tasks', items: tasks.map(t => ({ text: t.text, cites: t.cites })) });
  }
  const questions = mergeNearDuplicates(units.filter(u => u.type === 'practice_question'));
  if (questions.length) {
    blocks.push({ id: 'x-quiz-h', origin: 'quelle', cites: [], type: 'heading', level: 2, text: 'Übungsfragen aus der Vorlesung' });
    questions.forEach((q, i) => {
      blocks.push(q.unit.answer
        ? { id: `x-quiz-${i + 1}`, origin: 'quelle', cites: q.cites, unitIds: [q.unit.id], type: 'check', question: q.text, answer: q.unit.answer }
        : { id: `x-quiz-${i + 1}`, origin: 'quelle', cites: [], unitIds: [q.unit.id], type: 'tasks', items: [{ text: q.text, cites: q.cites }] });
    });
  }
  const exam = units.filter(u => u.type === 'exam_info');
  if (exam.length) {
    blocks.push({ id: 'x-exam-h', origin: 'quelle', cites: [], type: 'heading', level: 2, text: 'Klausurinfos' });
    blocks.push({ id: 'x-exam', origin: 'quelle', cites: [], type: 'bullets', items: exam.map(u => ({ text: u.text, cites: [cite(u)] })) });
  }
  return blocks;
};
