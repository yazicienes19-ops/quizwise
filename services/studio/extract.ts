import type { PipelineSource, Unit, UnitType } from './types';
import { UNIT_TYPES } from './types';
import { EXTRACT_PROMPT, EXTRACT_PROMPT_VERSION, extractSchema } from './prompts/extract.v1';
import { mapLimit, sha256, type ExtractionCache, type StudioLlm } from './llm';

/**
 * Schritt A: Einheiten je Quelle. Feste Fenster zu 15 Seiten; im Fenstertext
 * stehen nur gewählte, nicht doppelte Seiten (Sammeldateien kosten so nichts
 * doppelt). Cache über den Fenstertext: dieselbe Auswahl trifft immer, eine
 * andere Kapitelwahl nur in unveränderten Fenstern. Quellen ohne Seiten
 * (Text, DOCX, Digest) laufen in Textstücken mit page 0.
 */

export const WINDOW_PAGES = 15;
const PLAIN_CHUNK = 12_000;
const PARALLEL = 4;

/** Einheit, wie sie im Cache liegt (ohne Lauf-ID). */
export type StoredUnit = Omit<Unit, 'id'>;

interface Job { docId: string; pageCount: number; text: string; pages: [number, number] | null }

const windowText = (src: PipelineSource, from: number, to: number, need?: Set<number>): string => {
  const parts: string[] = [];
  for (let p = from; p <= to; p++) {
    if (need && !need.has(p)) continue;
    const body = (src.pages![p - 1] ?? '').replace(/\s+/g, ' ').trim();
    const figs = (src.figures ?? []).filter(f => f.page === p);
    if (!body && !figs.length) continue;
    parts.push(`[Seite ${p}]\n${body}${figs.map(f => `\n[Abbildung: ${f.title}. ${f.description}]`).join('')}`);
  }
  return parts.join('\n\n');
};

/** Fenster einer Quelle; `need` = Seiten, die gebraucht werden (gewählt und nicht doppelt), fehlt = alle. */
export const extractionJobs = (src: PipelineSource, need?: Set<number>): Job[] => {
  if (!src.pages) {
    const text = (src.plain ?? '').trim();
    const jobs: Job[] = [];
    for (let i = 0; i < text.length; i += PLAIN_CHUNK) {
      jobs.push({ docId: src.docId, pageCount: 0, text: text.slice(i, i + PLAIN_CHUNK), pages: null });
    }
    return jobs;
  }
  const jobs: Job[] = [];
  for (let from = 1; from <= src.pages.length; from += WINDOW_PAGES) {
    const to = Math.min(src.pages.length, from + WINDOW_PAGES - 1);
    const text = windowText(src, from, to, need);
    if (text) jobs.push({ docId: src.docId, pageCount: src.pageCount, text, pages: [from, to] });
  }
  return jobs;
};

const str = (v: unknown, max = 2000): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** Rohantwort prüfen: Seiten nur aus dem Fenster, Typen nur bekannte, leere Texte weg. */
export const parseUnits = (raw: unknown, job: Job): StoredUnit[] => {
  const list = (raw && typeof raw === 'object' && Array.isArray((raw as { units?: unknown }).units))
    ? (raw as { units: Record<string, unknown>[] }).units : [];
  const out: StoredUnit[] = [];
  for (const u of list) {
    const type = UNIT_TYPES.includes(u.type as UnitType) ? u.type as UnitType : null;
    const text = str(u.text);
    if (!type || !text) continue;
    let page = Math.round(Number(u.page));
    if (job.pages) {
      if (!(page >= job.pages[0] && page <= job.pages[1])) continue;
    } else page = 0;
    const year = Math.round(Number(u.year));
    const study = type === 'study' || u.authors ? {
      ...(str(u.authors) ? { authors: str(u.authors, 200) } : {}),
      ...(year >= 1800 && year <= 2100 ? { year } : {}),
      ...(str(u.design) ? { design: str(u.design) } : {}),
      ...(str(u.result) ? { result: str(u.result) } : {}),
      ...(str(u.conclusion) ? { conclusion: str(u.conclusion) } : {}),
    } : undefined;
    out.push({
      sourceId: job.docId, page, type, text,
      ...(str(u.title) ? { title: str(u.title, 120) } : {}),
      ...(study && Object.keys(study).length ? { study } : {}),
    });
  }
  return out;
};

const buildExtractPrompt = (name: string, text: string) =>
  `${EXTRACT_PROMPT}\n\n=== QUELLE: ${name} ===\n${text}`;

/** Einheiten aller Quellen, nur aus den benötigten Seiten. */
export const extractUnits = async (
  sources: PipelineSource[],
  /** Benötigte Seiten je Quelle; fehlt = alle (Quellen ohne Seiten immer alle). */
  wanted: Map<string, Set<number>>,
  llm: StudioLlm,
  cache: ExtractionCache | null,
  onJobDone?: (done: number, total: number) => void,
  isCancelled?: () => boolean,
): Promise<StoredUnit[]> => {
  const jobs = sources.flatMap(src => extractionJobs(src, wanted.get(src.docId)).map(job => ({ job, name: src.name })));
  let done = 0;
  const results = await mapLimit(jobs, PARALLEL, async ({ job, name }) => {
    if (isCancelled?.()) return [];
    const hash = await sha256(`${EXTRACT_PROMPT_VERSION}\n${job.text}`);
    const cached = cache ? await cache.get(hash).catch(() => null) : null;
    let units: StoredUnit[];
    if (cached) {
      units = (cached as StoredUnit[]).map(u => ({ ...u, sourceId: job.docId }));
    } else {
      const raw = await llm({ step: 'extract', prompt: buildExtractPrompt(name, job.text), schema: extractSchema, heavy: false, temperature: 0.1 });
      units = parseUnits(raw, job);
      if (cache) await cache.set(hash, job.docId, job.pageCount, units).catch(() => {});
    }
    onJobDone?.(++done, jobs.length);
    const need = wanted.get(job.docId);
    return job.pages && need ? units.filter(u => need.has(u.page)) : units;
  });
  return results.flat();
};

/** Laufende Kurz-IDs ("u1", "u2" …) in Quellen- und Seitenreihenfolge. */
export const assignUnitIds = (units: StoredUnit[], sourceOrder: string[]): Unit[] =>
  [...units]
    .sort((a, b) => sourceOrder.indexOf(a.sourceId) - sourceOrder.indexOf(b.sourceId) || a.page - b.page)
    .map((u, i) => ({ ...u, id: `u${i + 1}` }));
