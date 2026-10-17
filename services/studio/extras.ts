import type { Block, Cite, Unit } from './types';
import { citationsIn, countWords } from './text';
import { TIMELINE_PROMPT, timelineSchema } from './prompts/timeline.v1';
import { PRACTICE_PROMPT, practiceSchema } from './prompts/practice.v1';
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

export interface PracticeItem { question: string; answer: string; answerFromSlide: boolean; unitIds: string[] }

const words = (t: string) => new Set(t.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
/** Antwort sagt nur die Frage nach (oder ein Teil von ihr), statt sie zu beantworten. */
export const answerRepeatsQuestion = (question: string, answer: string): boolean => {
  const a = words(answer);
  if (!a.size) return true;
  const q = words(question);
  let shared = 0;
  for (const w of a) if (q.has(w)) shared += 1;
  return shared / a.size >= 0.8;
};
/** Bloße Ja/Nein-Antwort ohne Begründung. */
const bareYesNo = (answer: string) => /^(ja|nein|richtig|falsch|stimmt|stimmt nicht)([\s,./]+(ja|nein|richtig|falsch))*[.!]?$/i.test(answer.trim());

export const practiceProblems = (items: PracticeItem[]): string[] => items.flatMap((it, i) => {
  if (!it.answer.trim()) return [`Eintrag ${i + 1}: keine Antwort.`];
  if (answerRepeatsQuestion(it.question, it.answer)) return [`Eintrag ${i + 1}: die Antwort wiederholt nur die Frage.`];
  if (bareYesNo(it.answer)) return [`Eintrag ${i + 1}: „${it.answer}“ ohne Begründung.`];
  return [];
});

/**
 * Übungsfragen aus der Vorlesung aufbereiten: Teilfragen bündeln, jede Frage
 * mit Antwort (fehlt sie auf der Folie, schreibt sie das Modell aus dem Stoff
 * und sie wird als Erklärhilfe markiert), Lückentexte beschriftet, Textteile
 * aus bestätigten Folienfehlern raus, rhetorische Einstiegsfragen weg.
 * null = kein brauchbares Ergebnis (dann der einfache Weg aus den Einheiten).
 */
export const buildPracticeQuestions = async (units: Unit[], llm: StudioLlm): Promise<PracticeItem[] | null> => {
  const questions = units.filter(u => u.type === 'practice_question');
  if (!questions.length) return [];
  const near = (u: Unit, q: Unit) => u.sourceId === q.sourceId && u.page >= q.page - 1 && u.page <= q.page + 3;
  const context = units.filter(u => !['practice_question', 'organizational', 'source_error', 'exam_info'].includes(u.type) && questions.some(q => near(u, q)));
  const errors = units.filter(u => u.type === 'source_error' && questions.some(q => q.sourceId === u.sourceId && q.page === u.page));
  const flat = (t: string, n: number) => t.replace(/\s+/g, ' ').trim().slice(0, n);
  const prompt = `${PRACTICE_PROMPT}

=== ÜBUNGSFRAGEN ===
${questions.map(q => `${q.id} | S. ${q.page} | ${flat(q.text, 600)}${q.answer ? ` | Antwort: ${flat(q.answer, 600)}` : ''}`).join('\n')}

=== STOFF RUND UM DIE FRAGEN ===
${context.map(u => `S. ${u.page} | ${u.type}${u.illustrative ? ' [Rechenbeispiel]' : ''} | ${flat([u.title, u.text].filter(Boolean).join(': '), 400)}`).join('\n') || '(keiner)'}

=== BESTÄTIGTE FOLIENFEHLER ===
${errors.map(e => `S. ${e.page} | ${flat(e.text, 400)}`).join('\n') || '(keine)'}`;
  const ids = new Set(questions.map(q => q.id));
  const parse = (raw: unknown): PracticeItem[] => {
    const list = raw && typeof raw === 'object' && Array.isArray((raw as { items?: unknown }).items) ? (raw as { items: Record<string, unknown>[] }).items : [];
    return list.map(it => ({
      question: typeof it.question === 'string' ? it.question.replace(/\s+/g, ' ').trim() : '',
      answer: typeof it.answer === 'string' ? it.answer.trim() : '',
      answerFromSlide: it.answerFromSlide === true,
      unitIds: (Array.isArray(it.units) ? it.units : []).filter((id): id is string => typeof id === 'string' && ids.has(id.trim())).map(id => id.trim()),
    })).filter(it => it.question && it.unitIds.length);
  };
  let items: PracticeItem[] = [];
  let note = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      items = parse(await llm({
        step: 'practice', prompt: note ? `${prompt}\n\n=== ÜBERARBEITUNG ===\nBehebe in deiner Liste:\n${note}` : prompt,
        schema: practiceSchema, heavy: true, temperature: STUDIO_TEMPERATURE.practice, maxOutputTokens: 6000,
      }));
    } catch {
      return null;
    }
    const problems = practiceProblems(items);
    if (!problems.length) break;
    note = problems.join('\n');
  }
  const good = items.filter(it => !practiceProblems([it]).length);
  return good.length ? good : null;
};

export const buildExtraBlocks = (
  units: Unit[],
  timeline: { year: number; who: string; what: string; cites: Cite[] }[] = [],
  practice: PracticeItem[] | null = null,
): Block[] => {
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
  const byId = new Map(units.map(u => [u.id, u]));
  if (practice?.length) {
    blocks.push({ id: 'x-quiz-h', origin: 'quelle', cites: [], type: 'heading', level: 2, text: 'Übungsfragen aus der Vorlesung' });
    practice.forEach((p, i) => {
      const cites = [...new Map(p.unitIds.map(id => byId.get(id)).filter((u): u is Unit => !!u).map(u => [`${u.sourceId}:${u.page}`, cite(u)])).values()];
      blocks.push({
        id: `x-quiz-${i + 1}`, origin: 'quelle', cites, unitIds: p.unitIds, type: 'check', question: p.question, answer: p.answer,
        ...(p.answerFromSlide ? {} : { answerOrigin: 'ki' as const }),
      });
    });
  } else {
    // Ohne aufbereitete Liste: Fragen wie auf der Folie; eine Antwort, die nur die Frage wiederholt, zählt nicht.
    const questions = mergeNearDuplicates(units.filter(u => u.type === 'practice_question'));
    if (questions.length) {
      blocks.push({ id: 'x-quiz-h', origin: 'quelle', cites: [], type: 'heading', level: 2, text: 'Übungsfragen aus der Vorlesung' });
      questions.forEach((q, i) => {
        const answer = q.unit.answer && !answerRepeatsQuestion(q.text, q.unit.answer) ? q.unit.answer : '';
        blocks.push(answer
          ? { id: `x-quiz-${i + 1}`, origin: 'quelle', cites: q.cites, unitIds: [q.unit.id], type: 'check', question: q.text, answer }
          : { id: `x-quiz-${i + 1}`, origin: 'quelle', cites: [], unitIds: [q.unit.id], type: 'tasks', items: [{ text: q.text, cites: q.cites }] });
      });
    }
  }
  const exam = units.filter(u => u.type === 'exam_info');
  if (exam.length) {
    blocks.push({ id: 'x-exam-h', origin: 'quelle', cites: [], type: 'heading', level: 2, text: 'Klausurinfos' });
    blocks.push({ id: 'x-exam', origin: 'quelle', cites: [], type: 'bullets', items: exam.map(u => ({ text: u.text, cites: [cite(u)] })) });
  }
  return blocks;
};
