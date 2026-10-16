import type { Block, Cite, Unit } from './types';

/**
 * Abschnitte am Ende, vom Code aus den Einheiten gebaut statt vom Modell
 * geschrieben: Zeitleiste (sortiert), Aufgaben aus der Vorlesung, Klausurinfos.
 * So kann dort nichts erfunden werden und die Reihenfolge stimmt immer.
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

/** Datierte Studien/Theorien, je Autor und Jahr einmal, chronologisch. */
export const timelineItems = (units: Unit[]): { year: number; who: string; what: string; cites: Cite[] }[] => {
  const seen = new Map<string, { year: number; who: string; what: string; cites: Cite[] }>();
  for (const u of units) {
    const year = u.study?.year;
    const who = u.study?.authors?.trim();
    if (!year || !who) continue;
    const key = `${who.toLowerCase()}|${year}`;
    const existing = seen.get(key);
    if (existing) {
      if (!existing.cites.some(c => c.sourceId === u.sourceId && c.page === u.page)) existing.cites.push(cite(u));
      continue;
    }
    seen.set(key, { year, who, what: firstSentence(u.title && u.title !== who ? `${u.title}. ${u.study?.result ?? u.text}` : u.study?.result ?? u.text), cites: [cite(u)] });
  }
  return [...seen.values()].sort((a, b) => a.year - b.year || a.who.localeCompare(b.who, 'de'));
};

export const buildExtraBlocks = (units: Unit[]): Block[] => {
  const blocks: Block[] = [];
  const timeline = timelineItems(units);
  if (timeline.length >= 3) {
    blocks.push({ id: 'x-tl-h', origin: 'quelle', cites: [], type: 'heading', level: 2, text: 'Zeitleiste' });
    blocks.push({ id: 'x-tl', origin: 'quelle', cites: [], type: 'timeline', items: timeline });
  }
  const tasks = units.filter(u => u.type === 'task');
  if (tasks.length) {
    blocks.push({ id: 'x-tasks-h', origin: 'quelle', cites: [], type: 'heading', level: 2, text: 'Aufgaben aus der Vorlesung' });
    blocks.push({ id: 'x-tasks', origin: 'quelle', cites: [], type: 'tasks', items: tasks.map(u => ({ text: u.text, cites: [cite(u)] })) });
  }
  const exam = units.filter(u => u.type === 'exam_info');
  if (exam.length) {
    blocks.push({ id: 'x-exam-h', origin: 'quelle', cites: [], type: 'heading', level: 2, text: 'Klausurinfos' });
    blocks.push({ id: 'x-exam', origin: 'quelle', cites: [], type: 'bullets', items: exam.map(u => ({ text: u.text, cites: [cite(u)] })) });
  }
  return blocks;
};
