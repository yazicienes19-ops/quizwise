import type { Block, Issue, LernstudioResult, PipelineProgress, PipelineSource, Unit } from './types';
import { findDuplicatePages, sourceWordCount, withoutDuplicates } from './dedupe';
import { assignUnitIds, extractUnits } from './extract';
import { buildOutline, SEPARATE_TYPES, type Chapter } from './outline';
import { writeChapter } from './write';
import { buildExtraBlocks } from './extras';
import { validateResult, type ValidationContext } from './validate';
import { checkWithModel } from './check';
import { mapLimit, type ExtractionCache, type StudioLlm } from './llm';
import type { FigureRef } from './blocks';
import { resultWords } from './text';

/**
 * Lernstudio-Pipeline für die Zusammenfassung (Phase 1):
 * Quellen lesen (A) → Duplikate + Gliederung (B) → Schreiben je Kapitel (C)
 * → Prüfen (D: Code + Modell) → einmal reparieren (E) → Rest als Warnung.
 */

export interface PipelineInput {
  /** Quellen mit vollständigen Seiten (für einen stabilen Extraktions-Cache). */
  sources: PipelineSource[];
  /** Kapitelwahl je Quelle (1-basierte Seitenbereiche); fehlt = ganzes Dokument. */
  ranges?: Map<string, [number, number][]>;
  focus?: string;
  argon?: boolean;
  llm: StudioLlm;
  cache?: ExtractionCache | null;
  onProgress?: (p: PipelineProgress) => void;
  isCancelled?: () => boolean;
}

export class PipelineCancelled extends Error {
  constructor() { super('cancelled'); }
}

const PARALLEL_WRITE = 4;

const masked = (src: PipelineSource, ranges?: [number, number][]): PipelineSource =>
  !src.pages || !ranges?.length ? src
    : { ...src, pages: src.pages.map((p, i) => (ranges.some(([a, b]) => i + 1 >= a && i + 1 <= b) ? p : '')) };

const chapterOf = (blockId: string): number | null => {
  const m = blockId.match(/^c(\d+)r?-/);
  return m ? Number(m[1]) - 1 : null;
};

/** Beanstandungen in Sätze für den Reparatur-Prompt. */
const issueLine = (i: Issue, blocks: Block[]): string => {
  const b = i.blockId ? blocks.find(x => x.id === i.blockId) : undefined;
  const where = b ? `Block ${b.id} (${b.type})` : 'Kapitel';
  return `${where}: ${i.message}${i.fix ? ` Korrektur: ${i.fix}` : ''}`;
};

/** Warnung für den Nutzer (ohne interne IDs). */
const warningText = (i: Issue): string => {
  switch (i.rule) {
    case 'coverage': return i.message;
    case 'length': return i.message;
    case 'numbers': return `Eine Zahl ließ sich in der Quelle nicht finden: ${i.message}`;
    case 'author_year': case 'chronologie': return `Bitte Jahreszahl prüfen: ${i.message}`;
    case 'cites': case 'zitat_falsch': return `Eine Fußnote ist vermutlich falsch: ${i.message}`;
    case 'nicht_belegt': case 'falsch': return `Bitte prüfen: ${i.message}`;
    default: return i.message;
  }
};

export const runSummaryPipeline = async (input: PipelineInput): Promise<LernstudioResult> => {
  const { llm, onProgress } = input;
  const cancelled = () => input.isCancelled?.() ?? false;
  const bail = () => { if (cancelled()) throw new PipelineCancelled(); };
  const names = new Map(input.sources.map(s => [s.docId, s.name]));
  const order = input.sources.map(s => s.docId);

  // ── A: Duplikate erkennen, dann nur benötigte Seiten extrahieren ──
  const scoped = input.sources.map(s => masked(s, input.ranges?.get(s.docId)));
  const dup = findDuplicatePages(scoped);
  const deduped = scoped.map(s => withoutDuplicates(s, dup));
  const wanted = new Map<string, Set<number>>();
  for (const s of deduped) {
    if (!s.pages) continue;
    wanted.set(s.docId, new Set(s.pages.map((p, i) => (p.trim() ? i + 1 : 0)).filter(Boolean)));
  }
  const sourceWords = sourceWordCount(deduped);
  onProgress?.({ step: 'read', done: 0, total: 1 });
  const stored = await extractUnits(input.sources, wanted, llm, input.cache ?? null,
    (done, total) => onProgress?.({ step: 'read', done, total }), cancelled);
  bail();
  const units = assignUnitIds(stored, order);

  // Quellen ohne verwertbare Einheiten begründet auslassen (statt still zu verschwinden).
  const omittedSources: LernstudioResult['omittedSources'] = [];
  for (const s of scoped) {
    const own = units.filter(u => u.sourceId === s.docId);
    const wantedPages = wanted.get(s.docId);
    const hadText = s.pages ? s.pages.some(p => p.trim()) : !!s.plain?.trim();
    if (!hadText) { omittedSources.push({ sourceId: s.docId, reason: 'Kein lesbarer Text (Scan ohne Textebene und noch keine Analyse).' }); continue; }
    if (s.pages && wantedPages && wantedPages.size === 0) {
      const keptIn = new Set([...dup.keptFor.entries()].filter(([k]) => k.startsWith(`${s.docId}:`)).map(([, v]) => names.get(v.sourceId) ?? ''));
      omittedSources.push({ sourceId: s.docId, reason: `Alle Seiten stehen auch in ${[...keptIn].filter(Boolean).join(', ')}; zitiert wird dort.` });
      continue;
    }
    if (!own.some(u => u.type !== 'organizational')) omittedSources.push({ sourceId: s.docId, reason: 'Nur Titel- und Organisationsfolien, keine Lerninhalte.' });
  }

  // ── B: Gliederung ──
  onProgress?.({ step: 'outline', done: 0, total: 1 });
  const chapters: Chapter[] = await buildOutline(units, names, llm, sourceWords, input.focus);
  bail();
  onProgress?.({ step: 'outline', done: 1, total: 1 });

  // ── C: Schreiben je Kapitel ──
  const examInfo = units.filter(u => u.type === 'exam_info');
  const byId = new Map(units.map(u => [u.id, u]));
  const figuresFor = (ch: Chapter): FigureRef[] => {
    const pages = new Set(ch.sections.flatMap(s => s.unitIds).map(id => byId.get(id)).filter((u): u is Unit => !!u).map(u => `${u.sourceId}:${u.page}`));
    return input.sources.flatMap(s => (s.figures ?? [])
      .filter(f => pages.has(`${s.docId}:${f.page}`))
      .map(f => ({ ref: f.ref, sourceId: s.docId, page: f.page, title: f.title })));
  };
  const writeInput = (ch: Chapter, i: number) => ({
    chapter: ch, chapterIndex: i, units, sourceNames: names, examInfo, figures: figuresFor(ch), focus: input.focus,
  });
  let written = 0;
  onProgress?.({ step: 'write', done: 0, total: chapters.length });
  const chapterBlocks: Block[][] = await mapLimit(chapters, PARALLEL_WRITE, async (ch, i) => {
    if (cancelled()) return [];
    const blocks = await writeChapter(writeInput(ch, i), llm, !!input.argon);
    onProgress?.({ step: 'write', done: ++written, total: chapters.length });
    return blocks;
  });
  bail();
  const extras = buildExtraBlocks(units);

  // ── D: prüfen ──
  const ctx: ValidationContext = {
    sources: input.sources.map(s => ({ docId: s.docId, name: s.name, pageCount: s.pageCount })),
    units, omittedSources, sourceWords,
  };
  onProgress?.({ step: 'check', done: 0, total: 2 });
  const all = () => [...chapterBlocks.flat(), ...extras];
  const codeIssues = validateResult(all(), ctx);
  const modelIssues = await checkWithModel(chapterBlocks, units, llm).catch(() => [] as Issue[]);
  bail();
  onProgress?.({ step: 'check', done: 1, total: 2 });

  // Beanstandungen den Kapiteln zuordnen.
  const perChapter = new Map<number, Issue[]>();
  const add = (i: number, issue: Issue) => perChapter.set(i, [...(perChapter.get(i) ?? []), issue]);
  const unitChapter = new Map<string, number>();
  chapters.forEach((c, i) => c.sections.forEach(s => s.unitIds.forEach(id => unitChapter.set(id, i))));
  for (const issue of [...codeIssues, ...modelIssues]) {
    const ci = issue.blockId ? chapterOf(issue.blockId) : null;
    if (ci !== null) { add(ci, issue); continue; }
    if (issue.rule === 'coverage' && issue.sourceId) {
      const missingUnits = units.filter(u => u.sourceId === issue.sourceId && !SEPARATE_TYPES.has(u.type));
      const targets = new Set(missingUnits.map(u => unitChapter.get(u.id)).filter((x): x is number => x !== undefined));
      if (targets.size) {
        for (const t of targets) {
          const ids = missingUnits.filter(u => unitChapter.get(u.id) === t).map(u => u.id).slice(0, 12);
          add(t, { ...issue, message: `${issue.message} Nimm diese Einheiten auf: ${ids.join(', ')}.` });
        }
        continue;
      }
    }
    if (issue.rule === 'length') {
      const tooLong = issue.message.startsWith('Zu lang');
      chapterBlocks.forEach((blocks, i) => {
        const words = resultWords(blocks);
        if (tooLong ? words > chapters[i].budget * 1.15 : words < chapters[i].budget * 0.8) {
          add(i, { ...issue, message: `${tooLong ? 'Zu lang' : 'Zu kurz'}: ${words} Wörter, Budget ${chapters[i].budget}.` });
        }
      });
      continue;
    }
    // Übrige (z. B. Modell-Hinweis ohne Kapitel) erscheinen als Warnung.
  }

  // ── E: betroffene Kapitel einmal neu schreiben ──
  const repairIdx = [...perChapter.keys()].filter(i => i < chapters.length);
  if (repairIdx.length) {
    await mapLimit(repairIdx, PARALLEL_WRITE, async i => {
      if (cancelled()) return;
      const issues = perChapter.get(i)!.map(x => issueLine(x, chapterBlocks[i]));
      try {
        chapterBlocks[i] = await writeChapter({ ...writeInput(chapters[i], i), repair: { issues, previous: chapterBlocks[i] } }, llm, !!input.argon);
      } catch { /* alte Fassung behalten, Beanstandungen bleiben als Warnung */ }
    });
    bail();
  }

  // Nach der Reparatur: Code-Regeln über alles, Modellprüfung nur über reparierte Kapitel.
  const finalCode = validateResult(all(), ctx);
  const recheck = repairIdx.length
    ? await checkWithModel(repairIdx.map(i => chapterBlocks[i]), units, llm).catch(() => [] as Issue[])
    : [];
  const untouchedModel = modelIssues.filter(i => {
    const ci = i.blockId ? chapterOf(i.blockId) : null;
    return ci === null || !repairIdx.includes(ci);
  });
  onProgress?.({ step: 'check', done: 2, total: 2 });

  const warnings = [...new Set([...finalCode, ...recheck, ...untouchedModel].map(warningText))];
  const blocks = all();
  return {
    formatVersion: 2,
    format: 'zusammenfassung',
    blocks,
    omittedSources,
    warnings,
    stats: { sourceWords, outputWords: resultWords(blocks) },
  };
};
