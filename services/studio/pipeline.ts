import type { Block, ChapterDiagnostic, Issue, LernstudioResult, PipelineProgress, PipelineSource, SourcePart, StudioOutputFormat, Unit } from './types';
import { findDuplicatePages, sourceWordCount, withoutDuplicates } from './dedupe';
import { assignUnitIds, extractUnits, filterHiddenText, hasScenarioValues, isContentless, scanSourceErrors, verifySourceErrors } from './extract';
import { buildOutline, corridorFor, SEPARATE_TYPES, type Chapter, type Lecture } from './outline';
import { chapterHeading, writeChapterBody, type WriteInput } from './write';
import { buildGlossaryTerms, mergeGlossary } from './glossary';
import { buildExtraBlocks, buildPracticeQuestions, buildTimeline, timelineCandidates } from './extras';
import { markPriority } from './priority';
import { partOf, slideIn } from './parts';
import { checkEmptyHeadings, checkFaqChapter, CONTENT_TYPES, checkGlossaryChapter, checkGuideStructure, faqSectionCoverage, checkGuideTerms, checkMerksatz, glossaryTermCoverage, checkResultNumbers, checkPriority, checkScriptSections, checkRepetition, checkSectionCoverage, checkStudies, unitCoverage, validateResult, mainTextWords, type ValidationContext } from './validate';
import { checkWithModel } from './check';
import { mapLimit, StudioLlmError, type ExtractionCache, type StudioLlm } from './llm';
import type { FigureRef } from './blocks';
import { countWords, resultWords } from './text';

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
  /** Zusammenfassung (Standard) oder Skript (Phase 2: je Abschnitt geschrieben, zum Verstehen). */
  format?: StudioOutputFormat;
}

export class PipelineCancelled extends Error {
  constructor() { super('cancelled'); }
}

const PARALLEL_WRITE = 4;
/** Ein Kapitel darf sein Budget um höchstens 15 % überschreiten, sonst wird es gekürzt neu geschrieben. */
const LENGTH_TOLERANCE = 1.15;
/** Skript: Budget ist die Mitte von 80 bis 150 % der Quelle; ein Kapitel darf etwa diesen Korridor ausschöpfen. */
const SCRIPT_LENGTH_MAX = 1.3;
/** Leitfaden: Fragen mit Musterantworten überziehen das Kapitelbudget (Abnahme 17.10.: 1,3 bis 1,4), das Ganze lag trotzdem mitten im Korridor. */
const GUIDE_LENGTH_MAX = 1.5;
/** Leitfaden: unvollständig erst unter 80 % Abdeckung des ganzen Kapitels. */
const GUIDE_COVERAGE_MIN = 0.8;
const SCRIPT_LENGTH_MIN = 0.7;

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
export const warningText = (i: Issue): string => {
  // Einheiten-IDs braucht nur die Reparatur; Nutzer sehen eine Anzahl (Glossar-Test 17.10.: „… : u124.“).
  const plain = i.message.replace(/ Nimm diese Einheiten auf:.*$/, '')
    .replace(/\s*\(u\d+\)/g, '')
    .replace(/^Begriffe fehlen[^:]*:\s*((?:u\d+(?:,\s*)?)+)\.?$/, (_, list: string) => {
      const n = list.split(',').length;
      return `${n === 1 ? 'Ein Fachbegriff' : `${n} Fachbegriffe`} der Folien ${n === 1 ? 'fehlt' : 'fehlen'} als eigene Zeile.`;
    });
  switch (i.rule) {
    case 'numbers': return `Eine Zahl ließ sich in der Quelle nicht finden: ${plain}`;
    case 'result_missing': return `Ergebniszahlen der Folien fehlen im Text: ${plain.replace(/^Ergebnisse fehlen:\s*/, '').replace(/\.?\s*Nimm jeden Wert.*$/, '')}.`;
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
  const format: StudioOutputFormat = input.format ?? 'zusammenfassung';
  const script = format === 'skript';
  const guide = format === 'leitfaden';
  const glossary = format === 'glossar';
  const faq = format === 'faq';
  const cancelled = () => input.isCancelled?.() ?? false;
  const bail = () => { if (cancelled()) throw new PipelineCancelled(); };
  const names = new Map(input.sources.map(s => [s.docId, s.name]));
  const order = input.sources.map(s => s.docId);

  // ── A: Duplikate erkennen, dann nur benötigte Seiten extrahieren ──
  // Verborgenen Text zuerst sichten: was nicht zur sichtbaren Folie passt, sieht kein späterer Schritt.
  onProgress?.({ step: 'read', done: 0, total: 1 });
  const preWanted = new Map(input.sources.filter(s => s.pages).map(s => {
    const m = masked(s, input.ranges?.get(s.docId));
    return [s.docId, new Set(m.pages!.map((p, i) => (p.trim() ? i + 1 : 0)).filter(Boolean))] as const;
  }));
  const sources = await filterHiddenText(input.sources, preWanted, llm, input.cache ?? null, cancelled);
  bail();
  const scoped = sources.map(s => masked(s, input.ranges?.get(s.docId)));
  const dup = findDuplicatePages(scoped);
  const deduped = scoped.map(s => withoutDuplicates(s, dup));
  const wanted = new Map<string, Set<number>>();
  for (const s of deduped) {
    if (!s.pages) continue;
    wanted.set(s.docId, new Set(s.pages.map((p, i) => (p.trim() ? i + 1 : 0)).filter(Boolean)));
  }
  const sourceWords = sourceWordCount(deduped);
  onProgress?.({ step: 'read', done: 0, total: 1 });
  const [stored, scanned] = await Promise.all([
    extractUnits(sources, wanted, llm, input.cache ?? null, (done, total) => onProgress?.({ step: 'read', done, total }), cancelled),
    // Folienfehler im Rohtext (die Extraktion glättet sie sonst weg); ohne Ergebnis geht es ohne weiter.
    scanSourceErrors(sources, wanted, llm, input.cache ?? null, cancelled).catch(() => []),
  ]);
  bail();
  // Vermutete Folienfehler (Suche + Extraktion) nur mit Bestätigung am Seitenbild; je Seite einer.
  const candidates = [...scanned, ...stored.filter(u => u.type === 'source_error')]
    .filter((u, i, all) => all.findIndex(x => x.sourceId === u.sourceId && x.page === u.page) === i);
  const confirmed = await verifySourceErrors(candidates, scoped, llm, input.cache ?? null, cancelled).catch(() => []);
  bail();
  // Auch für gespeicherte Extraktionen: ohne Werte kein Rechenbeispiel.
  const checked = stored.filter(u => u.type !== 'source_error')
    .map(u => (u.illustrative && !hasScenarioValues(u.text) ? (({ illustrative: _, ...rest }) => rest)(u) : u))
    // Ohne Lerninhalt (nur Folientitel, nur Organisatorisches): nicht als Pflichtstoff behandeln.
    .map(u => (u.type !== 'organizational' && u.type !== 'task' && u.type !== 'practice_question' && u.type !== 'exam_info' && isContentless(u) ? { ...u, type: 'organizational' as const } : u));
  const units = markPriority(assignUnitIds([...checked, ...confirmed], order));
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

  // ── B: Gliederung, je Vorlesung ein festes Kapitel (Quelle oder Teil einer zusammengefügten PDF) ──
  const omittedWhole = new Set(omittedSources.filter(o => !o.part).map(o => o.sourceId));
  const lectures: Lecture[] = scoped.filter(s => !omittedWhole.has(s.docId)).flatMap(s => (s.parts?.length
    ? s.parts.filter(p => !omittedSources.some(o => o.sourceId === s.docId && o.part?.from === p.from)).map(p => ({ title: p.title, docId: s.docId, from: p.from, to: p.to }))
    : [{ title: s.name, docId: s.docId, from: 0, to: Number.MAX_SAFE_INTEGER }]));
  onProgress?.({ step: 'outline', done: 0, total: 1 });
  // Budget: Stoffmenge aus den Folien; die angehängten Abschnitte (Aufgaben, Übungsfragen, Klausurinfos,
  // Zeitleiste mit höchstens ~15 Einträgen zu je ~12 Wörtern) vorab abziehen.
  const pageWords = (sourceId: string, page: number) => countWords(deduped.find(s => s.docId === sourceId)?.pages?.[page - 1] ?? '');
  // Glossar: keine angehängten Abschnitte.
  const reservedWords = glossary || faq ? 0 : units.filter(u => u.type === 'task' || u.type === 'practice_question' || u.type === 'exam_info')
    .reduce((a, u) => a + countWords(`${u.text} ${u.answer ?? ''}`), 0) + Math.min(15, timelineCandidates(units).length) * 12;
  const chapters: Chapter[] = await buildOutline(units, names, llm, sourceWords, input.focus, lectures, { pageWords, reservedWords }, format);
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
  // Glossar: Pflichtbegriffe je Kapitel vorab (eigener kleiner Aufruf je Kapitel).
  const requiredTerms: string[][] = glossary ? await mapLimit(chapters, PARALLEL_WRITE, ch => buildGlossaryTerms(ch, units, llm)) : [];
  bail();
  const writeInput = (ch: Chapter, i: number): WriteInput => ({
    chapter: ch, chapterIndex: i, units, sourceNames: names, examInfo, figures: figuresFor(ch), focus: input.focus, argon: !!input.argon, format,
    ...(requiredTerms[i]?.length ? { requiredTerms: requiredTerms[i] } : {}),
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

  /** Ein Abschnitt (Skript, Rückfall der Zusammenfassung), Budget nach Anteil der Einheiten. */
  const writeSection = (ch: Chapter, i: number, k: number, repair?: WriteInput['repair']) => {
    const totalUnits = Math.max(1, chapterUnitIds(ch).length);
    const budget = Math.max(60, Math.round(ch.budget * ch.sections[k].unitIds.length / totalUnits));
    const neighbors = { prev: ch.sections[k - 1]?.title ?? chapters[i - 1]?.title, next: ch.sections[k + 1]?.title ?? chapters[i + 1]?.title };
    return attempt({ ...writeInput({ ...ch, budget }, i), sectionIndex: k, neighbors, ...(repair ? { repair } : {}) }, diagnostics[i]);
  };

  /** Ganzes Kapitel; scheitert es strukturell, jeden Abschnitt einzeln und das Bessere behalten. Skript: immer je Abschnitt. */
  const writeRobust = async (ch: Chapter, i: number): Promise<Block[]> => {
    const diag = diagnostics[i];
    if (script) return (await mapLimit(ch.sections, 3, async (_, k) => (cancelled() ? [] : (await writeSection(ch, i, k)) ?? []))).flat();
    const whole = await attempt(writeInput(ch, i), diag);
    // Leitfaden: Aufbau gilt je Kapitel (Kernbegriffe, Fragen …), abschnittsweise ergäbe er sich mehrfach; ein zweiter Versuch statt Aufteilen.
    if (guide || glossary || faq) return whole ?? (cancelled() ? [] : (await attempt(writeInput(ch, i), diag)) ?? []);
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
  // Zeitleiste nur in der Zusammenfassung; das Skript erzählt die Studien im Text, der Leitfaden hat „Wichtige Studien“.
  const timelinePromise = script || guide || glossary || faq ? Promise.resolve([]) : buildTimeline(units, llm);
  // Glossar: nur Begriffe, keine Übungsfragen, Aufgaben oder Klausurinfos.
  const practicePromise = glossary || faq ? Promise.resolve(null) : buildPracticeQuestions(units, llm).catch(() => null);
  const chapterBlocks: Block[][] = await mapLimit(chapters, PARALLEL_WRITE, async (ch, i) => {
    if (cancelled()) return [];
    const blocks = await writeRobust(ch, i);
    onProgress?.({ step: 'write', done: ++written, total: chapters.length });
    return blocks;
  });
  bail();
  const extras = glossary || faq ? [] : buildExtraBlocks(units, await timelinePromise, await practicePromise);


  // ── D: prüfen ──
  const ctx: ValidationContext = {
    sources: input.sources.map(s => ({ docId: s.docId, name: s.name, pageCount: s.pageCount, ...(s.parts?.length ? { parts: s.parts } : {}) })),
    units, omittedSources, sourceWords, wantedPages: wanted,
    // Folientext als Beleg für Zahlen und Quellenangaben (Titel wie "(Skowronek et al., 2023)" fehlen oft in den Einheiten).
    pageText: (sourceId, page) => scoped.find(s => s.docId === sourceId)?.pages?.[page - 1] ?? '',
    format,
  };
  const all = () => [...chapters.flatMap((ch, i) => [chapterHeading(ch.title, i), ...chapterBlocks[i]]), ...extras];
  onProgress?.({ step: 'check', done: 0, total: 2 });
  const chapterIssues = (i: number): Issue[] => {
    const ch = chapters[i];
    const head = chapterHeading(ch.title, i).id;
    const words = resultWords(chapterBlocks[i]);
    // Glossar: nur Begriffe, keine Abdeckung aller Einheiten (Studien, Beispiele gehören nicht hinein).
    // Häufige Fragen: je Abschnitt eine Frage, belegte Antworten; Wiederholung über die Antworten.
    if (faq) {
      // Mindestens eine Frage je Abschnitt und etwa eine je 5 inhaltliche Einheiten (Abnahme: 3 Fragen bei 16 Einheiten).
      const content = chapterUnitIds(ch).filter(id => CONTENT_TYPES.has(byId.get(id)?.type ?? '')).length;
      return [
        ...checkFaqChapter(ch.sections, chapterBlocks[i], head, Math.max(ch.sections.length, Math.ceil(content / 5))),
        ...checkRepetition(chapterBlocks[i]),
        // Prüfungsrelevantes (Wiederholungs- und Quizfolien) bekommt eine Frage (Abnahme: Cocktail-Party fehlte).
        ...checkPriority(chapterUnitIds(ch), chapterBlocks[i], byId, head),
      ];
    }
    if (glossary) return checkGlossaryChapter(chapterUnitIds(ch).map(id => byId.get(id)).filter((u): u is Unit => !!u), chapterBlocks[i], head, requiredTerms[i], units);
    return [
      ...checkSectionCoverage(ch.sections, chapterBlocks[i], byId, head),
      ...(script ? checkScriptSections(chapterBlocks[i], head) : guide ? checkGuideStructure(chapterBlocks[i], head) : checkMerksatz(chapterBlocks[i], head, ch.title)),
      ...(guide ? [
        ...checkResultNumbers(chapterUnitIds(ch).map(id => byId.get(id)).filter((u): u is Unit => !!u), chapterBlocks[i], head),
        ...checkGuideTerms(chapterUnitIds(ch).map(id => byId.get(id)).filter((u): u is Unit => !!u), chapterBlocks[i], head),
      ] : []),
      ...checkRepetition(chapterBlocks[i]),
      ...checkPriority(chapterUnitIds(ch), chapterBlocks[i], byId, head),
      // Länge je Kapitel durchsetzen (nicht nur warnen): zu lange Kapitel werden gekürzt neu geschrieben.
      // Leitfaden: je Kapitel nur kürzen, wenn das Ganze über dem Korridor liegt (Fragen machen Kapitel ungleich lang).
      ...((!guide || mainTextWords(all()) > corridorFor(format, sourceWords).max * 1.1) && words > ch.budget * (script ? SCRIPT_LENGTH_MAX : guide ? GUIDE_LENGTH_MAX : LENGTH_TOLERANCE)
        ? [{ rule: 'length' as const, blockId: head, message: `Zu lang: ${words} Wörter, höchstens ${Math.round(ch.budget * (script ? SCRIPT_LENGTH_MAX : guide ? GUIDE_LENGTH_MAX : 1))}. Kürze, ohne Einheiten wegzulassen.` }]
        : []),
      // Skript: zu knapp heißt zu wenig erklärt.
      ...(script && words < ch.budget * SCRIPT_LENGTH_MIN
        ? [{ rule: 'length' as const, blockId: head, message: `Zu kurz für ein Skript: ${words} Wörter, mindestens ${Math.round(ch.budget * SCRIPT_LENGTH_MIN)}. Erkläre ausführlicher.` }]
        : []),
    ];
  };
  const codeIssues = [
    ...validateResult(all(), ctx).filter(i => i.rule !== 'length'),
    ...chapters.flatMap((_, i) => chapterIssues(i)),
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
    if (issue.rule === 'source_error_hint' && issue.sourceId) {
      const u = units.find(x => x.type === 'source_error' && issue.message.includes(x.text));
      const t = u ? unitChapter.get(u.id) : undefined;
      if (t !== undefined) add(t, issue);
    }
    // Übrige (z. B. Modell-Hinweis ohne Kapitel) erscheinen als Warnung.
  }

  // ── E: betroffene Kapitel einmal neu schreiben; übernommen wird nur, was nicht schlechter ist ──
  const repairIdx = [...perChapter.keys()].filter(i => i < chapters.length);
  if (repairIdx.length && script) {
    // Skript: nur die betroffenen Abschnitte neu schreiben (Blöcke c{Kapitel}[r]s{Abschnitt}-…).
    await mapLimit(repairIdx, PARALLEL_WRITE, async i => {
      const ch = chapters[i];
      const bySection = new Map<number, Issue[]>();
      for (const issue of perChapter.get(i)!) {
        const m = issue.blockId?.match(/^c\d+r?s(\d+)-/);
        const ks = m ? [Number(m[1]) - 1]
          : [...new Set((issue.message.match(/\bu\d+\b/g) ?? []).map(id => ch.sections.findIndex(sec => sec.unitIds.includes(id))).filter(k => k >= 0))];
        for (const k of ks) bySection.set(k, [...(bySection.get(k) ?? []), issue]);
      }
      for (const [k, list] of bySection) {
        if (cancelled()) return;
        const inSection = new RegExp(`^c${i + 1}r?s${k + 1}-`);
        const before = chapterBlocks[i];
        const previous = before.filter(b => inSection.test(b.id));
        const repaired = await writeSection(ch, i, k, { issues: list.map(x => issueLine(x, previous)), previous });
        if (!repaired) continue;
        const issuesBefore = chapterIssues(i).length;
        const covBefore = unitCoverage(chapterUnitIds(ch), before, byId).ratio;
        const at = before.findIndex(b => inSection.test(b.id));
        const next = before.filter(b => !inSection.test(b.id));
        next.splice(at < 0 ? next.length : at, 0, ...repaired);
        chapterBlocks[i] = next;
        if (chapterIssues(i).length > issuesBefore || unitCoverage(chapterUnitIds(ch), next, byId).ratio < covBefore - 0.05) chapterBlocks[i] = before;
      }
    });
    bail();
  } else if (repairIdx.length) {
    await mapLimit(repairIdx, PARALLEL_WRITE, async i => {
      if (cancelled()) return;
      const issues = perChapter.get(i)!.map(x => issueLine(x, chapterBlocks[i]));
      const repaired = await attempt({ ...writeInput(chapters[i], i), repair: { issues, previous: chapterBlocks[i] } }, diagnostics[i]);
      if (!repaired) return;
      const cov = (b: Block[]) => unitCoverage(chapterUnitIds(chapters[i]), b, byId).ratio;
      const before = chapterBlocks[i];
      const issuesBefore = chapterIssues(i).length;
      chapterBlocks[i] = repaired;
      // Übernommen wird nur, was nicht schlechter ist: Struktur, Abdeckung, Kapitel-Regeln (Länge, Merksatz …).
      const worse = structuralIssues(chapters[i], i, repaired, byId).length > structuralIssues(chapters[i], i, before, byId).length
        || cov(repaired) < cov(before) - 0.05
        || chapterIssues(i).length > issuesBefore;
      if (worse) chapterBlocks[i] = before;
    });
    bail();
  }

  const placeHints = () => {
    // Folienfehler: den Hinweis setzt der Code ins Kapitel mit der nächstgelegenen Folie derselben Quelle.
    // Das Schreibmodell sieht vermutete Fehler nie, sie können den Inhalt also nicht verändern.
    for (const err of units.filter(u => u.type === 'source_error')) {
      let best = -1;
      let dist = Infinity;
      chapters.forEach((ch, i) => chapterUnitIds(ch).forEach(id => {
        const u = byId.get(id);
        if (u?.sourceId === err.sourceId && Math.abs(u.page - err.page) < dist) { dist = Math.abs(u.page - err.page); best = i; }
      }));
      if (best < 0) continue;
      const part = partOf(input.sources.find(s => s.docId === err.sourceId)?.parts, err.page);
      const where = part ? `Auf Folie ${slideIn(part, err.page)} („${part.title}“)` : `Auf Folie ${err.page}`;
      chapterBlocks[best] = [...chapterBlocks[best].filter(b => !(b.type === 'callout' && b.variant === 'hinweis' && b.cites.some(c => c.sourceId === err.sourceId && c.page === err.page))), {
        id: `c${best + 1}-se${err.page}`, origin: 'quelle', cites: [{ sourceId: err.sourceId, page: err.page }], unitIds: [err.id],
        type: 'callout', variant: 'hinweis', text: `${where}: ${err.text.replace(/^Auf (?:der )?Folie \d+[^:]*:\s*/i, '')}`,
      }];
    }
  };
  // Erst nach der Reparatur einsetzen: sie schreibt Kapitel neu und hätte die Hinweise sonst gelöscht.
  placeHints();

  // Nach der Reparatur: Code-Regeln über alles, Modellprüfung nur über reparierte Kapitel.
  const incompleteChapters: string[] = [];
  chapters.forEach((ch, i) => {
    const d = diagnostics[i];
    d.blocks = chapterBlocks[i].length;
    d.coverage = Math.round(unitCoverage(chapterUnitIds(ch), chapterBlocks[i], byId).ratio * 100) / 100;
    if (!chapterBlocks[i].length || checkEmptyHeadings([chapterHeading(ch.title, i), ...chapterBlocks[i]]).length
      // Leitfaden ordnet nach Art (Begriffe, Studien, Fragen), nicht nach Abschnitten: dort zählt das ganze Kapitel.
      || (faq ? faqSectionCoverage(ch.sections, chapterBlocks[i]) < GUIDE_COVERAGE_MIN
        : glossary ? glossaryTermCoverage(chapterUnitIds(ch).map(id => byId.get(id)).filter((u): u is Unit => !!u), chapterBlocks[i]) < GUIDE_COVERAGE_MIN
        : guide ? d.coverage < GUIDE_COVERAGE_MIN : checkSectionCoverage(ch.sections, chapterBlocks[i], byId, '').length)) incompleteChapters.push(ch.title);
  });
  const finalCode = [
    ...validateResult(all(), ctx).filter(i => i.rule !== 'length'),
    ...chapters.flatMap((_, i) => chapterIssues(i)).filter(i => i.rule !== 'section_coverage'),
  ].filter(i => !(i.rule === 'empty_heading' && i.blockId && incompleteChapters.includes(chapters[chapterOf(i.blockId) ?? -1]?.title)));
  // Folienfehler-Hinweise setzt der Code; der Prüfer sähe sie sonst als Lerninhalt und beanstandete sie.
  const recheck = repairIdx.length
    ? await checkWithModel(repairIdx.map(i => chapterBlocks[i].filter(b => !/-se\d+$/.test(b.id))), units, llm).catch(() => [] as Issue[])
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
  // Leere Kapitel ohne jeden Inhalt nicht als nackte Überschrift zeigen. Glossar: alle Kapitel alphabetisch zusammengeführt.
  const blocks = glossary ? mergeGlossary(all()) : all().filter((b, idx, arr) => !(b.type === 'heading' && b.level === 2 && b.id.startsWith('c')
    && (idx === arr.length - 1 || (arr[idx + 1].type === 'heading' && (arr[idx + 1] as { level: number }).level <= 2))));
  return {
    formatVersion: 2,
    format,
    blocks,
    omittedSources,
    warnings,
    stats: { sourceWords, outputWords: resultWords(blocks), mainWords: mainTextWords(blocks) },
    incompleteChapters,
    diagnostics,
  };
};
