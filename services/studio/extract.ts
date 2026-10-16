import type { PipelineSource, Unit, UnitType } from './types';
import { UNIT_TYPES } from './types';
import { EXTRACT_PROMPT, EXTRACT_PROMPT_VERSION, extractSchema } from './prompts/extract.v4';
import { SOURCE_ERRORS_PROMPT, SOURCE_ERRORS_PROMPT_VERSION, sourceErrorsSchema } from './prompts/sourceErrors.v1';
import { VERIFY_ERROR_PROMPT, VERIFY_ERROR_PROMPT_VERSION, verifyErrorSchema } from './prompts/verifyError.v1';
import { mapLimit, sha256, STUDIO_TEMPERATURE, type ExtractionCache, type StudioLlm } from './llm';
import { parseYear } from './blocks';

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
/** Ein Fenster liefert im Test höchstens ~5.000 Tokens; mehr ist eine Schleife. */
const EXTRACT_MAX_TOKENS = 10_000;

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
    const year = parseYear(u.year);
    const study = type === 'study' || u.authors ? {
      ...(str(u.authors) ? { authors: str(u.authors, 200) } : {}),
      ...(year ? { year } : {}),
      ...(str(u.design) ? { design: str(u.design) } : {}),
      ...(str(u.result) ? { result: str(u.result) } : {}),
      ...(str(u.conclusion) ? { conclusion: str(u.conclusion) } : {}),
    } : undefined;
    // Ausgedachte Werte sind nie ein Befund, auch wenn das Modell sie so einordnet.
    const illustrative = u.illustrative === true;
    out.push({
      sourceId: job.docId, page, type: illustrative && (type === 'finding' || type === 'study') ? 'example' : type, text,
      ...(str(u.title) ? { title: str(u.title, 120) } : {}),
      ...(study && Object.keys(study).length && !illustrative ? { study } : {}),
      ...(illustrative ? { illustrative: true } : {}),
      ...(type === 'practice_question' && str(u.answer) ? { answer: str(u.answer) } : {}),
    });
  }
  return out;
};

/** Seiten im Fenstertext (Marken [Seite p]), in Reihenfolge. */
export const pagesInText = (text: string): number[] => [...text.matchAll(/^\[Seite (\d+)\]$/gm)].map(m => Number(m[1]));

/**
 * Reicht der Text allein für die Seite? Nein bei kaum Text (Diagramm, Schema,
 * Bild), Spalten (" | " aus dem Text nach Position), Tabellen oder mehreren
 * Kennwerten. Nur diese Seiten bekommen bei imagePolicy "selective" ein Bild.
 */
export const pageNeedsImage = (pageText: string): boolean => {
  const body = pageText.replace(/^\[Seite \d+\]\s*/, '');
  const words = (body.match(/[\p{L}\p{N}]+/gu) ?? []).length;
  if (words < 30) return true;
  if (/ \| /.test(body)) return true;
  const numbers = (body.match(/\b\d+(?:[.,]\d+)?\s*%|\b[MNnr]\s*=\s*\d|\b\d+\s+von\s+\d+/g) ?? []).length;
  return numbers >= 2;
};

/** Text je Seite im Fenstertext (Marke [Seite p] bis zur nächsten). */
const pageChunks = (text: string): Map<number, string> => {
  const out = new Map<number, string>();
  const parts = text.split(/^(?=\[Seite \d+\]$)/m);
  for (const part of parts) {
    const m = part.match(/^\[Seite (\d+)\]/);
    if (m) out.set(Number(m[1]), part);
  }
  return out;
};

/** Bilder der Seiten eines Fensters (alle oder nur die, bei denen der Text nicht reicht), mit Seitennummern. */
const windowImages = async (src: PipelineSource, text: string): Promise<{ pages: number[]; images: string[] }> => {
  if (!src.renderPage) return { pages: [], images: [] };
  const chunks = pageChunks(text);
  const pages = pagesInText(text).filter(p => src.imagePolicy !== 'selective' || pageNeedsImage(chunks.get(p) ?? ''));
  const images: string[] = [];
  const used: number[] = [];
  for (const p of pages) {
    const img = await src.renderPage(p).catch(() => null);
    if (img) { images.push(img); used.push(p); }
  }
  return { pages: used, images };
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
  const jobs = sources.flatMap(src => extractionJobs(src, wanted.get(src.docId)).map(job => ({ job, name: src.name, src })));
  let done = 0;
  const results = await mapLimit(jobs, PARALLEL, async ({ job, name, src }) => {
    if (isCancelled?.()) return [];
    // Mit Bildern andere Antwort als ohne: eigener Cache-Eintrag.
    const hash = await sha256(`${EXTRACT_PROMPT_VERSION}${src.renderPage && job.pages ? `+img:${src.imagePolicy ?? 'all'}` : ''}\n${job.text}`);
    const cached = cache ? await cache.get(hash).catch(() => null) : null;
    let units: StoredUnit[];
    if (cached) {
      units = (cached as StoredUnit[]).map(u => ({ ...u, sourceId: job.docId }));
    } else {
      const { pages: imagePages, images } = await windowImages(src, job.text);
      const imageNote = images.length ? `\n\nSEITENBILDER beigelegt für die Seiten ${imagePages.join(', ')} (in dieser Reihenfolge).` : '';
      const raw = await llm({
        step: 'extract', prompt: `${buildExtractPrompt(name, job.text)}${imageNote}`, schema: extractSchema, heavy: false,
        temperature: STUDIO_TEMPERATURE.extract, maxOutputTokens: EXTRACT_MAX_TOKENS,
        ...(images.length ? { images } : {}),
      });
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

const SCAN_PAGES = 50;

/**
 * Schritt A2: Folienfehler im Rohtext suchen (3.8 Flash). Die Extraktion mit
 * Flash-Lite fand im Test (16.10.2026) keinen einzigen und "korrigierte" eine
 * falsch kopierte Hypothese stillschweigend; aus den Einheiten allein ist der
 * Fehler dann nicht mehr zu sehen. Gecacht wie die Extraktion.
 */
export const scanSourceErrors = async (
  sources: PipelineSource[],
  wanted: Map<string, Set<number>>,
  llm: StudioLlm,
  cache: ExtractionCache | null,
  isCancelled?: () => boolean,
): Promise<StoredUnit[]> => {
  const jobs: { src: PipelineSource; text: string; from: number; to: number }[] = [];
  for (const src of sources) {
    if (!src.pages) continue;
    for (let from = 1; from <= src.pages.length; from += SCAN_PAGES) {
      const to = Math.min(src.pages.length, from + SCAN_PAGES - 1);
      const text = windowText({ ...src, figures: [] }, from, to, wanted.get(src.docId));
      if (text) jobs.push({ src, text, from, to });
    }
  }
  const results = await mapLimit(jobs, PARALLEL, async ({ src, text, from, to }) => {
    if (isCancelled?.()) return [];
    const hash = await sha256(`${SOURCE_ERRORS_PROMPT_VERSION}\n${text}`);
    const cached = cache ? await cache.get(hash).catch(() => null) : null;
    if (cached) return (cached as StoredUnit[]).map(u => ({ ...u, sourceId: src.docId }));
    const raw = await llm({
      step: 'scan', prompt: `${SOURCE_ERRORS_PROMPT}\n\n=== QUELLE: ${src.name} ===\n${text}`, schema: sourceErrorsSchema,
      heavy: true, thinkingBudget: 1024, temperature: STUDIO_TEMPERATURE.scan, maxOutputTokens: 4000,
    });
    const list = raw && typeof raw === 'object' && Array.isArray((raw as { errors?: unknown }).errors)
      ? (raw as { errors: Record<string, unknown>[] }).errors : [];
    const need = wanted.get(src.docId);
    const units: StoredUnit[] = list
      .map(e => ({ page: Math.round(Number(e.page)), text: str(e.text, 600) }))
      .filter(e => e.text && e.page >= from && e.page <= to && (!need || need.has(e.page)))
      .map(e => ({ sourceId: src.docId, page: e.page, type: 'source_error' as const, text: e.text }));
    if (cache) await cache.set(hash, src.docId, src.pageCount, units).catch(() => {});
    return units;
  });
  return results.flat();
};

/**
 * Schritt A3: vermutete Folienfehler (aus Suche und Extraktion) am Seitenbild
 * bestätigen. Nur Bestätigte bleiben, mit neu formuliertem Text ohne
 * Foliennummer. Ohne Seitenbild keine Bestätigung, also kein Hinweis: ein
 * falscher Vorwurf ist schlimmer als ein verpasster (Abnahme 16.10.2026:
 * Folie 26 und 81 wurden fälschlich als Fehler gemeldet).
 */
export const verifySourceErrors = async (
  candidates: StoredUnit[],
  sources: PipelineSource[],
  llm: StudioLlm,
  cache: ExtractionCache | null,
  isCancelled?: () => boolean,
): Promise<StoredUnit[]> => {
  const results = await mapLimit(candidates, PARALLEL, async (c): Promise<StoredUnit[]> => {
    if (isCancelled?.()) return [];
    const src = sources.find(s => s.docId === c.sourceId);
    if (!src?.renderPage || !src.pages || c.page < 1) return [];
    const pageText = src.pages[c.page - 1] ?? '';
    const hash = await sha256(`${VERIFY_ERROR_PROMPT_VERSION}\n${c.page}\n${c.text}\n${pageText}`);
    const cached = cache ? await cache.get(hash).catch(() => null) : null;
    if (cached) return (cached as StoredUnit[]).map(u => ({ ...u, sourceId: c.sourceId }));
    const own = await src.renderPage(c.page).catch(() => null);
    if (!own) return [];
    const prev = c.page > 1 ? await src.renderPage(c.page - 1).catch(() => null) : null;
    const raw = await llm({
      step: 'verify', heavy: true, thinkingBudget: 1024, temperature: STUDIO_TEMPERATURE.verify, maxOutputTokens: 3000,
      prompt: `${VERIFY_ERROR_PROMPT}\n\nVERMUTETER FEHLER (Folie ${c.page}): ${c.text}\n\nTEXT DER FOLIE (Spalten mit " | "):\n${pageText}`,
      schema: verifyErrorSchema, images: prev ? [own, prev] : [own],
    }) as { confirmed?: unknown; text?: unknown };
    const text = str(raw?.text, 600);
    const units: StoredUnit[] = raw?.confirmed === true && text ? [{ sourceId: c.sourceId, page: c.page, type: 'source_error', text }] : [];
    if (cache) await cache.set(hash, c.sourceId, src.pageCount, units).catch(() => {});
    return units;
  });
  return results.flat();
};
