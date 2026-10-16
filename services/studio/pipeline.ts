import type { Block, ChapterDiagnostic, Issue, LernstudioResult, PipelineProgress, PipelineSource, SourcePart, Unit } from './types';
import { findDuplicatePages, sourceWordCount, withoutDuplicates } from './dedupe';
import { assignUnitIds, extractUnits } from './extract';
import { buildOutline, SEPARATE_TYPES, type Chapter } from './outline';
import { chapterHeading, writeChapterBody, type WriteInput } from './write';
import { buildExtraBlocks } from './extras';
import { checkEmptyHeadings, checkSectionCoverage, checkStudies, unitCoverage, validateResult, type ValidationContext } from './validate';
import { checkWithModel } from './check';
import { mapLimit, StudioLlmError, type ExtractionCache, type StudioLlm } from './llm';
import type { FigureRef } from './blocks';
import { resultWords } from './text';

/**
 * Lernstudio-Pipeline für die Zusammenfassung:
 * Quellen lesen (A) → Duplikate + Gliederung (B) → Schreiben je Kapitel (C)
 * → Prüfen (D: Code + Modell) → einmal reparieren (E) → Rest als Warnung.
 *
 * Phase 1.1: Ein Kapitel geht nie mehr still verloren. Scheitert es (Schleife,
 * ungültiges JSON, leere Überschrift, Abdeckung unter 70 %, Studie ohne
 * Aufbau/Ergebnis), wird es Abschnitt für Abschnitt neu geschrieben; was dann
 * noch fehlt, steht als "Kapitel X ist unvollständig" am Ergebnis.
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
  const m = blockId.match(/^c(\d+)/);
  return m ? Number(m[1]) - 1 : null;
};

/** Beanstandungen in Sätze für den Reparatur-Prompt. */
const issueLine = (i: Issue, blocks: Block[]): string => {
  const b = i.blockId ? blocks.find(x => x.id === i.blockId) : undefined;
  const where = b && b.type !== 'heading' ? `Block ${b.id} (${b.type})` : 'Kapitel';
  return `${where}: ${i.message}${i.fix ? ` Korrektur: ${i.fix}` : ''}`;
};

/** Warnung für den Nutzer (ohne interne IDs). */
const warningText = (i: Issue): string => {
  const plain = i.message.replace(/ Nimm diese Einheiten auf:.*$/, '');
  switch (i.rule) {
    case 'numbers': return `Eine Zahl ließ sich in der Quelle nicht finden: ${plain}`;
    case 'author_year': case 'chronologie': return `Bitte Jahreszahl prüfen: ${plain}`;
    case 'cites': case 'zitat_falsch': return `Eine Fußnote ist vermutlich falsch: ${plain}`;
    case 'nicht_belegt': case 'falsch': return `Bitte prüfen: ${plain}`;
    default: return plain;
  }
};

/** Beanstandungen, die ein Kapitel strukturell unbrauchbar machen (leer, Stoff fehlt, Studie halb). */
const structuralIssues = (ch: Chapter, i: number, blocks: Block[], byId: Map<string, Unit>): Issue[] => {
  const head = chapterHeading(ch.title, i);
  return [
    ...checkEmptyHeadings([head, ...blocks]),
    ...checkSectionCoverage(ch.sections, blocks, byId, head.id),
    ...checkStudies(blocks),
  ];
};

const chapterUnitIds = (ch: Chapter) => ch.sections.flatMap(s => s.unitIds);

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
  const byId = new Map(units.map(u => [u.id, u]));

  // Quellen (und Vorlesungen einer zusammengefügten PDF) ohne verwertbare Einheiten begründet auslassen.
  const omittedSources: LernstudioResult['omittedSources'] = [];
  const keptIn = (docId: string, from = 1, to = Infinity) => [...new Set([...dup.keptFor.entries()]
    .filter(([k]) => { const [id, p] = k.split(':'); return id === docId && Number(p) >= from && Number(p) <= to; })
    .map(([, v]) => names.get(v.sourceId) ?? ''))].filter(Boolean).join(', ');
  const hasContent = (docId: string, from = 0, to = Infinity) =>
    units.some(u => u.sourceId === docId && u.page >= from && u.page <= to && u.type !== 'organizational');
  for (const s of scoped) {
    const wantedPages = wanted.get(s.docId);
    const hadText = s.pages ? s.pages.some(p => p.trim()) : !!s.plain?.trim();
    if (!hadText) { omittedSources.push({ sourceId: s.docId, reason: 'Kein lesbarer Text (Scan ohne Textebene und noch keine Analyse).' }); continue; }
    if (s.pages && wantedPages && wantedPages.size === 0) {
      omittedSources.push({ sourceId: s.docId, reason: `Alle Seiten stehen auch in ${keptIn(s.docId)}; zitiert wird dort.` });
      continue;
    }
    if (!hasContent(s.docId)) { omittedSources.push({ sourceId: s.docId, reason: 'Nur Titel- und Organisationsfolien, keine Lerninhalte.' }); continue; }
    for (const part of s.parts ?? []) {
      const selected = s.pages?.some((p, i) => i + 1 >= part.from && i + 1 <= part.to && p.trim());
      if (!selected) continue;
      const own = [...(wantedPages ?? [])].some(p => p >= part.from && p <= part.to);
      if (!own) { omittedSources.push({ sourceId: s.docId, part, reason: `Alle Seiten stehen auch in ${keptIn(s.docId, part.from, part.to)}; zitiert wird dort.` }); continue; }
      if (!hasContent(s.docId, part.from, part.to)) omittedSources.push({ sourceId: s.docId, part, reason: 'Nur Titel- und Organisationsfolien, keine Lerninhalte.' });
    }
  }

  // ── B: Gliederung ──
  onProgress?.({ step: 'outline', done: 0, total: 1 });
  const chapters: Chapter[] = await buildOutline(units, names, llm, sourceWords, input.focus);
  bail();
  onProgress?.({ step: 'outline', done: 1, total: 1 });

  // ── C: Schreiben je Kapitel, mit Rückfall Abschnitt für Abschnitt ──
  const examInfo = units.filter(u => u.type === 'exam_info');
  const figuresFor = (ch: Chapter): FigureRef[] => {
    const pages = new Set(chapterUnitIds(ch).map(id => byId.get(id)).filter((u): u is Unit => !!u).map(u => `${u.sourceId}:${u.page}`));
    return input.sources.flatMap(s => (s.figures ?? [])
      .filter(f => pages.has(`${s.docId}:${f.page}`))
      .map(f => ({ ref: f.ref, sourceId: s.docId, page: f.page, title: f.title })));
  };
  const writeInput = (ch: Chapter, i: number): WriteInput => ({
    chapter: ch, chapterIndex: i, units, sourceNames: names, examInfo, figures: figuresFor(ch), focus: input.focus,
  });
  const diagnostics: ChapterDiagnostic[] = chapters.map(ch => ({
    title: ch.title, units: chapterUnitIds(ch).length, blocks: 0, dropped: [], attempts: 0, aborts: [], split: false, coverage: 0,
  }));

  /** Ein Schreibversuch; Modellfehler (Schleife, JSON) landen im Protokoll statt den Lauf zu beenden. */
  const attempt = async (inp: WriteInput, diag: ChapterDiagnostic): Promise<Block[] | null> => {
    diag.attempts += 1;
    try {
      const r = await writeChapterBody(inp, llm, !!input.argon);
      diag.dropped.push(...r.dropped);
      return r.blocks;
    } catch (err) {
      if (!(err instanceof StudioLlmError)) throw err;
      diag.aborts.push(...err.events.map(e => `${e.kind}: ${e.detail}`));
      return null;
    }
  };

  /** Ganzes Kapitel; scheitert es strukturell, jeden Abschnitt einzeln und das Bessere behalten. */
  const writeRobust = async (ch: Chapter, i: number): Promise<Block[]> => {
    const diag = diagnostics[i];
    const whole = await attempt(writeInput(ch, i), diag);
    if (whole && !structuralIssues(ch, i, whole, byId).length) return whole;
    if (cancelled()) return whole ?? [];
    diag.split = true;
    const totalUnits = Math.max(1, chapterUnitIds(ch).length);
    const parts = await mapLimit(ch.sections, 2, async (sec, k) => {
      if (cancelled()) return [];
      const budget = Math.max(60, Math.round(ch.budget * sec.unitIds.length / totalUnits));
      return (await attempt({ ...writeInput({ ...ch, budget }, i), sectionIndex: k }, diag)) ?? [];
    });
    const split = parts.flat();
    if (!whole) return split;
    const score = (blocks: Block[]) => unitCoverage(chapterUnitIds(ch), blocks, byId).ratio - structuralIssues(ch, i, blocks, byId).length * 0.05;
    return score(split) >= score(whole) ? split : whole;
  };

  let written = 0;
  onProgress?.({ step: 'write', done: 0, total: chapters.length });
  const chapterBlocks: Block[][] = await mapLimit(chapters, PARALLEL_WRITE, async (ch, i) => {
    if (cancelled()) return [];
    const blocks = await writeRobust(ch, i);
    onProgress?.({ step: 'write', done: ++written, total: chapters.length });
    return blocks;
  });
  bail();
  const extras = buildExtraBlocks(units);

  // ── D: prüfen ──
  const ctx: ValidationContext = {
    sources: input.sources.map(s => ({ docId: s.docId, name: s.name, pageCount: s.pageCount, ...(s.parts?.length ? { parts: s.parts } : {}) })),
    units, omittedSources, sourceWords, wantedPages: wanted,
  };
  const all = () => [...chapters.flatMap((ch, i) => [chapterHeading(ch.title, i), ...chapterBlocks[i]]), ...extras];
  onProgress?.({ step: 'check', done: 0, total: 2 });
  const codeIssues = [
    ...validateResult(all(), ctx),
    ...chapters.flatMap((ch, i) => checkSectionCoverage(ch.sections, chapterBlocks[i], byId, chapterHeading(ch.title, i).id)),
  ];
  const modelIssues = await checkWithModel(chapterBlocks, units, llm).catch(() => [] as Issue[]);
  bail();
  onProgress?.({ step: 'check', done: 1, total: 2 });

  // Beanstandungen den Kapiteln zuordnen.
  const perChapter = new Map<number, Issue[]>();
  const add = (i: number, issue: Issue) => perChapter.set(i, [...(perChapter.get(i) ?? []), issue]);
  const unitChapter = new Map<string, number>();
  chapters.forEach((c, i) => chapterUnitIds(c).forEach(id => unitChapter.set(id, i)));
  for (const issue of [...codeIssues, ...modelIssues]) {
    const ci = issue.blockId ? chapterOf(issue.blockId) : null;
    if (ci !== null) { add(ci, issue); continue; }
    if (issue.rule === 'coverage' && issue.sourceId) {
      const part: SourcePart | undefined = issue.part;
      const missingUnits = units.filter(u => u.sourceId === issue.sourceId && !SEPARATE_TYPES.has(u.type)
        && (!part || (u.page >= part.from && u.page <= part.to)));
      const targets = new Set(missingUnits.map(u => unitChapter.get(u.id)).filter((x): x is number => x !== undefined));
      for (const t of targets) {
        const ids = missingUnits.filter(u => unitChapter.get(u.id) === t).map(u => u.id).slice(0, 12);
        add(t, { ...issue, message: `${issue.message} Nimm diese Einheiten auf: ${ids.join(', ')}.` });
      }
      continue;
    }
    if (issue.rule === 'length') {
      const tooLong = issue.message.startsWith('Zu lang');
      chapterBlocks.forEach((blocks, i) => {
        const words = resultWords(blocks);
        if (tooLong ? words > chapters[i].budget * 1.15 : words < chapters[i].budget * 0.8) {
          add(i, { ...issue, message: `${tooLong ? 'Zu lang' : 'Zu kurz'}: ${words} Wörter, Budget ${chapters[i].budget}.` });
        }
      });
    }
    // Übrige (z. B. Modell-Hinweis ohne Kapitel) erscheinen als Warnung.
  }

  // ── E: betroffene Kapitel einmal neu schreiben; übernommen wird nur, was nicht schlechter ist ──
  const repairIdx = [...perChapter.keys()].filter(i => i < chapters.length);
  if (repairIdx.length) {
    await mapLimit(repairIdx, PARALLEL_WRITE, async i => {
      if (cancelled()) return;
      const issues = perChapter.get(i)!.map(x => issueLine(x, chapterBlocks[i]));
      const repaired = await attempt({ ...writeInput(chapters[i], i), repair: { issues, previous: chapterBlocks[i] } }, diagnostics[i]);
      if (!repaired) return;
      const cov = (b: Block[]) => unitCoverage(chapterUnitIds(chapters[i]), b, byId).ratio;
      const worse = structuralIssues(chapters[i], i, repaired, byId).length > structuralIssues(chapters[i], i, chapterBlocks[i], byId).length
        || cov(repaired) < cov(chapterBlocks[i]) - 0.05;
      if (!worse) chapterBlocks[i] = repaired;
    });
    bail();
  }

  // Nach der Reparatur: Code-Regeln über alles, Modellprüfung nur über reparierte Kapitel.
  const incompleteChapters: string[] = [];
  chapters.forEach((ch, i) => {
    const d = diagnostics[i];
    d.blocks = chapterBlocks[i].length;
    d.coverage = Math.round(unitCoverage(chapterUnitIds(ch), chapterBlocks[i], byId).ratio * 100) / 100;
    if (!chapterBlocks[i].length || checkEmptyHeadings([chapterHeading(ch.title, i), ...chapterBlocks[i]]).length
      || checkSectionCoverage(ch.sections, chapterBlocks[i], byId, '').length) incompleteChapters.push(ch.title);
  });
  const finalCode = validateResult(all(), ctx).filter(i => !(i.rule === 'empty_heading' && i.blockId && incompleteChapters.includes(chapters[chapterOf(i.blockId) ?? -1]?.title)));
  const recheck = repairIdx.length
    ? await checkWithModel(repairIdx.map(i => chapterBlocks[i]), units, llm).catch(() => [] as Issue[])
    : [];
  const untouchedModel = modelIssues.filter(i => {
    const ci = i.blockId ? chapterOf(i.blockId) : null;
    return ci === null || !repairIdx.includes(ci);
  });
  onProgress?.({ step: 'check', done: 2, total: 2 });

  const warnings = [...new Set([
    ...incompleteChapters.map(t => `Kapitel „${t}“ ist unvollständig. Bitte neu erstellen.`),
    ...[...finalCode, ...recheck, ...untouchedModel].map(warningText),
  ])];
  // Leere Kapitel ohne jeden Inhalt nicht als nackte Überschrift zeigen.
  const blocks = all().filter((b, idx, arr) => !(b.type === 'heading' && b.level === 2 && b.id.startsWith('c')
    && (idx === arr.length - 1 || (arr[idx + 1].type === 'heading' && (arr[idx + 1] as { level: number }).level <= 2))));
  return {
    formatVersion: 2,
    format: 'zusammenfassung',
    blocks,
    omittedSources,
    warnings,
    stats: { sourceWords, outputWords: resultWords(blocks) },
    incompleteChapters,
    diagnostics,
  };
};
