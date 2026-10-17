// @vitest-environment node
// Eval der Lernstudio-Zusammenfassung (Phase 1) gegen echte Vorlesungs-PDFs.
// Läuft nur mit STUDIO_EVAL=1 (npm run eval:studio), sonst übersprungen; nie in npm test.
// Daten liegen nur lokal (gitignored): benchmark/datasets/lernstudio/
//   *.pdf                PDFs des Fachs (Dateiname = Quellenname)
//   expectations.json    fachspezifische Abnahme (Zahlen, Tabellen, Aufgaben …), optional
//   cache/               Extraktionen; spätere Läufe kosten nur Gliederung, Schreiben, Prüfen
// Ergebnis: benchmark/results/lernstudio/<Zeit>.json und .md
// Optional: STUDIO_EVAL_WRITER=gemini-4-argon (Schreibmodell), STUDIO_EVAL_PLAN=free (alles Flash-Lite), STUDIO_EVAL_FOCUS="…"
import { describe, it, expect } from 'vitest';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import '../env.ts';
import { GoogleGenAI } from '@google/genai';
import { runSummaryPipeline } from '../../services/studio/pipeline';
import { extractUnits, pageNeedsImage } from '../../services/studio/extract';
import { findDuplicatePages } from '../../services/studio/dedupe';
import { resultToMarkdown } from '../../services/studio/toMarkdown';
import { blockTexts, contradictsSequence, INLINE_CITE_RE, looksTruncated } from '../../services/studio/text';
import { checkEmptyHeadings, checkFaqChapter, checkGuideStructure, checkRepetition, checkScriptSections, checkTables } from '../../services/studio/validate';
import { partsFromOutline } from '../../services/pdfOutlineService';
import { hiddenItemFlags, layoutPageTextWithHidden } from '../../services/pdfPageService';
import type { Block, Cite, PipelineSource, SourcePart } from '../../services/studio/types';
import { guardedLlm, type LlmEvent, type StudioLlm, type StudioTransport } from '../../services/studio/llm';
import { createRequire } from 'node:module';

const MODE = process.env.STUDIO_EVAL_MODE ?? 'full';
/** Format: zusammenfassung (Standard), skript (Phase 2) oder leitfaden (Phase A): STUDIO_EVAL_FORMAT=… */
const FORMAT = (['skript', 'leitfaden', 'glossar', 'faq'].includes(process.env.STUDIO_EVAL_FORMAT ?? '') ? process.env.STUDIO_EVAL_FORMAT : 'zusammenfassung') as 'zusammenfassung' | 'skript' | 'leitfaden' | 'glossar' | 'faq';
const SCRIPT = FORMAT === 'skript';
const GUIDE = FORMAT === 'leitfaden';
/** Glossar: nur Begriffe; Zahlen, Vergleichstabellen, Aufgaben und Abschnitte der Zusammenfassung gelten nicht. */
const GLOSSARY = FORMAT === 'glossar';
/** Häufige Fragen: wie Glossar ohne Zahlen- und Abschnittsprüfungen der Zusammenfassung. */
const FAQ = FORMAT === 'faq';
const LIGHT = GLOSSARY || FAQ;
const run = process.env.STUDIO_EVAL === '1' && MODE === 'full' ? describe : describe.skip;
// Nur Extraktion messen, ohne Cache: STUDIO_EVAL_MODE=extract STUDIO_EVAL_IMAGES=all|selective|none
const runExtract = process.env.STUDIO_EVAL === '1' && MODE === 'extract' ? describe : describe.skip;
const DIR = join(__dirname, '..', 'datasets', 'lernstudio');
const CACHE = join(DIR, 'cache');
const OUT = join(__dirname, '..', 'results', 'lernstudio');

interface Expectations {
  /** Quellen (Dateiname ohne .pdf), die zitiert sein müssen. */
  mustCite?: string[];
  /** Zahlen, die genau so vorkommen müssen (z. B. "58 %"). */
  numbers?: string[];
  /** Tabellen: jede Gruppe von Begriffen muss gemeinsam in einer Tabelle stehen. */
  tables?: string[][];
  /** Regex (Flags i): darf in keinem Satz vorkommen (z. B. falsche Kausalität). */
  forbidden?: string[];
  /** Teilstring, der unter "Aufgaben aus der Vorlesung" stehen muss. */
  tasks?: string[];
  /** Teilstring, der in einem Hinweis-Callout stehen muss (Folienfehler). */
  hints?: string[];
  /** Teilstrings, die NICHT unter "Aufgaben aus der Vorlesung" stehen dürfen (Demos, Studien). */
  notInTasks?: string[];
  /** Einträge, die in der Zeitleiste stehen müssen (Autor, Jahr). */
  timeline?: { who: string; year: number }[];
  /** Autoren, die nicht in die Zeitleiste gehören (anderer Themenstrang). */
  timelineForbidden?: string[];
  /** Teilstrings, die in keiner Warnung stehen dürfen (Fehlwarnungen). */
  warningsForbidden?: string[];
  /** Leitfaden: Begriffe, die als eigene Zeile in den Kernbegriffen stehen müssen. */
  guideTerms?: string[];
  /** Abläufe: Schritte in dieser Reihenfolge (Namen wie auf den Folien), geprüft in jedem Text (alle Formate). */
  orderedSteps?: string[][];
  /** Häufige Fragen: Inhalte (Alternativen mit „|“), die in einer Frage oder Antwort vorkommen müssen. */
  faqMust?: string[];
  /** Glossar: Grundbegriffe (Alternativen mit „|“) und Einträge, die nicht vorkommen dürfen. */
  glossaryTerms?: string[];
  glossaryForbiddenTerms?: string[];
  /** Begriffsgruppen (ohne Groß-/Kleinschreibung), die gemeinsam in einem Block stehen müssen. */
  together?: string[][];
  /** Überschriften, die vorkommen müssen. */
  headings?: string[];
  /** Seiten, auf die KEIN Folienfehler-Hinweis zeigen darf ("page:26" = Fehlmeldung). */
  hintsForbidden?: string[];
  /** Teilstrings, die in den Kapiteln (nicht nur in Aufgaben) vorkommen müssen. */
  contentContains?: string[];
}

const pdfPages = async (file: string): Promise<{ pages: string[]; parts: SourcePart[] | null; renderPage: (p: number) => Promise<string | null> }> => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(file)) }).promise;
  // Wie die App (renderStudioPage): je Seite ein Render-Durchgang, Text nach Position, verborgener Text
  // per Pixeltest gesondert markiert, Seitenbild 1000 px breit als JPEG (über @napi-rs/canvas).
  const { createCanvas } = await import('@napi-rs/canvas');
  const pages: string[] = [];
  const images = new Map<number, string>();
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const vp = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items = content.items.filter(i => 'str' in i && i.str).map(i => {
      const it = i as { str: string; transform: number[]; width: number; height: number };
      const h = it.height || Math.abs(it.transform[3]) || 10;
      return { str: it.str, x: it.transform[4], y: vp.height - it.transform[5] - h, w: it.width, h };
    });
    const scale = 1000 / vp.width;
    const rvp = page.getViewport({ scale });
    const canvas = createCanvas(Math.round(rvp.width), Math.round(rvp.height));
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx as never, viewport: rvp, canvas: canvas as never }).promise;
    const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    pages.push(layoutPageTextWithHidden(items, hiddenItemFlags(items, rgba as unknown as Uint8ClampedArray, canvas.width, canvas.height, scale)));
    images.set(n, (await canvas.encode('jpeg', 70)).toString('base64'));
  }
  const renderPage = async (p: number) => images.get(p) ?? null;
  // Zusammengefügte PDF: Vorlesungen aus der Gliederung, wie in der App (getMergedPdfParts).
  const outline = (await pdf.getOutline().catch(() => null)) ?? [];
  const entries = await Promise.all(outline.map(async node => {
    let page: number | null = null;
    try {
      const dest = typeof node.dest === 'string' ? await pdf.getDestination(node.dest) : node.dest;
      if (Array.isArray(dest) && dest[0]) page = (await pdf.getPageIndex(dest[0])) + 1;
    } catch { /* ohne Seite */ }
    return { title: node.title?.trim() ?? '', page, hasChildren: !!node.items?.length };
  }));
  return { pages, parts: partsFromOutline(entries, pdf.numPages), renderPage };
};

const MODEL_LITE = 'gemini-3.5-flash-lite';
const MODEL_HEAVY = 'gemini-3.8-flash';

// Preise wie das Backend (backend/src/config/geminiModels.js), damit die Kosten je Lauf vergleichbar sind.
const { costOfUsage } = createRequire(import.meta.url)('../../backend/src/config/geminiModels.js') as {
  costOfUsage: (model: string, usage: unknown) => number;
};

/** "default" = Standardtemperatur des Modells (Google rät bei Gemini 3.x dazu), sonst die der Pipeline. */
const TEMP_DEFAULT = process.env.STUDIO_EVAL_TEMP === 'default';

interface Usage { calls: number; usd: number; estimated: number; byStep: Record<string, number>; events: LlmEvent[]; stepUsd?: Record<string, number>; stepMs?: Record<string, number>; images?: number }

/**
 * Wie in der App: gestreamt, mit Kostenbremse (guardedLlm bricht bei
 * Schleifen ab und versucht es direkt neu). Abgebrochene Antworten liefern
 * keine Token-Zählung; ihre Kosten werden aus der Textlänge geschätzt.
 */
const makeLlm = (usage: Usage, rawDir?: string): StudioLlm => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  let n = 0;
  // Rohantworten je Aufruf (Fehlersuche: was das Modell lieferte, bevor der Code filtert).
  const dump = (step: string, prompt: string, text: string, finish?: string) => {
    if (!rawDir) return;
    mkdirSync(rawDir, { recursive: true });
    writeFileSync(join(rawDir, `${String(++n).padStart(3, '0')}-${step}.json`), JSON.stringify({ finish, prompt, text }, null, 1));
  };
  const transport: StudioTransport = async (req, onText, signal) => {
    // STUDIO_EVAL_PLAN=free: wie das Backend für Free (selectModel gibt Free immer Flash-Lite).
    const free = process.env.STUDIO_EVAL_PLAN === 'free';
    const model = free ? MODEL_LITE : req.step === 'write' && process.env.STUDIO_EVAL_WRITER ? process.env.STUDIO_EVAL_WRITER : req.heavy ? MODEL_HEAVY : MODEL_LITE;
    const limit = model.includes('argon') ? 32768 : 16384;
    const config: Record<string, unknown> = {
      maxOutputTokens: Math.min(limit, req.maxOutputTokens ?? limit),
      responseMimeType: 'application/json', responseSchema: req.schema, abortSignal: signal,
    };
    if (!TEMP_DEFAULT && req.temperature !== undefined) config.temperature = req.temperature;
    // Wie das Backend: Lite lehnt thinkingBudget 0 ab.
    if (!(model === MODEL_LITE && (req.thinkingBudget ?? 0) === 0)) config.thinkingConfig = { thinkingBudget: req.thinkingBudget ?? 0 };
    const t0 = Date.now();
    for (let attempt = 0; ; attempt++) {
      let text = '';
      let finish: string | undefined;
      let meta: unknown;
      try {
        const parts = [{ text: req.prompt }, ...(req.images ?? []).map(data => ({ inlineData: { data, mimeType: 'image/jpeg' } }))];
        const stream = await ai.models.generateContentStream({ model, contents: [{ role: 'user', parts }], config: config as never });
        for await (const chunk of stream) {
          if (chunk.usageMetadata) meta = chunk.usageMetadata;
          if (chunk.candidates?.[0]?.finishReason) finish = chunk.candidates[0].finishReason;
          text += chunk.text ?? '';
          onText(text);
          if (signal.aborted) break;
        }
        if (signal.aborted) throw new DOMException('aborted', 'AbortError');
        return { text, finish };
      } catch (e) {
        if (!signal.aborted && attempt < 2 && /429|RESOURCE_EXHAUSTED|UNAVAILABLE|overloaded|50\d/i.test(String(e))) {
          await new Promise(r => setTimeout(r, 4000 * (attempt + 1)));
          continue;
        }
        throw e;
      } finally {
        usage.calls += 1;
        usage.byStep[req.step] = (usage.byStep[req.step] ?? 0) + 1;
        const full = meta && finish ? meta : { promptTokenCount: Math.round(req.prompt.length / 4), candidatesTokenCount: Math.round(text.length / 3.5) };
        if (!(meta && finish)) usage.estimated += 1;
        const cost = costOfUsage(model, full);
        usage.usd += cost;
        usage.stepUsd = { ...usage.stepUsd, [req.step]: (usage.stepUsd?.[req.step] ?? 0) + cost };
        usage.stepMs = { ...usage.stepMs, [req.step]: (usage.stepMs?.[req.step] ?? 0) + (Date.now() - t0) };
        usage.images = (usage.images ?? 0) + (req.images?.length ?? 0);
        dump(req.step, req.prompt, text, finish ?? (signal.aborted ? 'ABORTED' : undefined));
      }
    }
  };
  return guardedLlm(transport, { onEvent: e => { usage.events.push(e); process.stdout.write(`\n  ! ${e.step} ${e.kind}: ${e.detail}\n`); } });
};

const fileCache = () => {
  mkdirSync(CACHE, { recursive: true });
  return {
    get: async (h: string) => (existsSync(join(CACHE, `${h}.json`)) ? JSON.parse(readFileSync(join(CACHE, `${h}.json`), 'utf8')) : null),
    set: async (h: string, _d: string, _p: number, units: unknown[]) => { writeFileSync(join(CACHE, `${h}.json`), JSON.stringify(units)); },
  };
};

const cites = (b: Block): Cite[] => [...b.cites, ...('items' in b ? (b.items as { cites: Cite[] }[]).flatMap(i => i.cites) : [])];

run('Lernstudio-Eval (live)', () => {
  it('Zusammenfassung erfüllt die Abnahme', async () => {
    const files = readdirSync(DIR).filter(f => f.toLowerCase().endsWith('.pdf')).sort((a, b) => a.localeCompare(b, 'de', { numeric: true }));
    expect(files.length, `Keine PDFs in ${DIR}`).toBeGreaterThan(0);
    const sources: PipelineSource[] = [];
    for (const f of files) {
      const { pages, parts, renderPage } = await pdfPages(join(DIR, f));
      sources.push({ docId: f, name: f.replace(/\.pdf$/i, ''), pages, pageCount: pages.length, renderPage, ...(parts ? { parts } : {}) });
    }
    const exp: Expectations = existsSync(join(DIR, 'expectations.json')) ? JSON.parse(readFileSync(join(DIR, 'expectations.json'), 'utf8')) : {};

    const usage: Usage = { calls: 0, usd: 0, estimated: 0, byStep: {}, events: [] };
    const started = Date.now();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const r = await runSummaryPipeline({
      format: FORMAT,
      sources, llm: makeLlm(usage, join(OUT, `${stamp}-raw`)), cache: fileCache(), focus: process.env.STUDIO_EVAL_FOCUS,
      argon: !!process.env.STUDIO_EVAL_WRITER,
      onProgress: p => process.stdout.write(`\r${p.step} ${p.done}/${p.total}      `),
    });
    const seconds = Math.round((Date.now() - started) / 1000);

    mkdirSync(OUT, { recursive: true });
    const numberOf = (id: string) => sources.findIndex(s => s.docId === id) + 1 || undefined;
    writeFileSync(join(OUT, `${stamp}.json`), JSON.stringify(r, null, 2));
    const refs = sources.map((s, i) => ({ n: i + 1, docId: s.docId, name: s.name, ...(s.parts ? { parts: s.parts } : {}) }));
    writeFileSync(join(OUT, `${stamp}.md`), `${sources.map((s, i) => `[${i + 1}] ${s.name}`).join('\n')}\n\n${resultToMarkdown(r, numberOf, refs)}`);

    const texts = r.blocks.flatMap(blockTexts);
    const all = texts.join('\n');
    const report: [string, boolean, string][] = [];
    const check = (name: string, ok: boolean, detail = '') => { report.push([name, ok, detail]); expect.soft(ok, `${name} ${detail}`).toBe(true); };

    // Länge am Haupttext (Entscheidung 16.10.: Zeitleiste, Aufgaben, Übungsfragen, Klausurinfos zählen nicht).
    const mainWords = r.stats.mainWords ?? r.stats.outputWords;
    const ratio = mainWords / Math.max(1, r.stats.sourceWords);
    // Entscheidung 16.10.: 40 % mit 10 % Toleranz (höchstens 44 %), wie der Validator.
    if (SCRIPT) check('Skript: Haupttext 80 bis 150 % (±10 %) der Quellwörter', ratio >= 0.72 && ratio <= 1.65, `${mainWords}/${r.stats.sourceWords} = ${Math.round(ratio * 100)} %`);
    else if (FAQ) check('FAQ: Haupttext 15 bis 40 % (±10 %) der Quellwörter', ratio >= 0.13 && ratio <= 0.44, `${mainWords}/${r.stats.sourceWords} = ${Math.round(ratio * 100)} %`);
    else if (GLOSSARY) check('Glossar: Haupttext 10 bis 35 % (±10 %) der Quellwörter', ratio >= 0.09 && ratio <= 0.39, `${mainWords}/${r.stats.sourceWords} = ${Math.round(ratio * 100)} %`);
    else if (GUIDE) check('Leitfaden: Haupttext 30 bis 60 % (±10 %) der Quellwörter', ratio >= 0.27 && ratio <= 0.66, `${mainWords}/${r.stats.sourceWords} = ${Math.round(ratio * 100)} %`);
    else check('Haupttext ≤ 40 % (+10 % Toleranz) der Quellwörter', ratio <= 0.44 || mainWords <= 600, `${mainWords}/${r.stats.sourceWords} = ${Math.round(ratio * 100)} %`);
    const cited = new Set(r.blocks.flatMap(cites).map(c => c.sourceId));
    const omitted = new Set(r.omittedSources.map(o => o.sourceId));
    check('Jede Quelle zitiert oder begründet ausgelassen', sources.every(s => cited.has(s.docId) || omitted.has(s.docId)),
      sources.filter(s => !cited.has(s.docId) && !omitted.has(s.docId)).map(s => s.name).join(', '));
    for (const name of exp.mustCite ?? []) check(`Quelle zitiert: ${name}`, sources.some(s => s.name.includes(name) && cited.has(s.docId)));
    const counts = new Map(sources.map(s => [s.docId, s.pageCount]));
    const badCites = r.blocks.flatMap(cites).filter(c => !(c.page >= 1 && c.page <= (counts.get(c.sourceId) ?? 0)));
    check('Alle Zitate auf existierende Seiten', badCites.length === 0, `${badCites.length} ungültig`);
    const dup = findDuplicatePages(sources);
    const onDup = r.blocks.flatMap(cites).filter(c => dup.dropped.get(c.sourceId)?.has(c.page));
    check('Einzel-PDF vor Sammeldatei', onDup.length === 0, `${onDup.length} Zitate auf doppelte Seiten`);
    const norm = (t: string) => t.replace(/ | /g, ' ').replace(/\s*%/g, ' %');
    for (const n of LIGHT ? [] : exp.numbers ?? []) check(`Zahl ${n}`, norm(all).includes(norm(n)));
    const tables = r.blocks.filter((b): b is Extract<Block, { type: 'table' }> => b.type === 'table').map(b => blockTexts(b).join(' '));
    for (const group of LIGHT ? [] : exp.tables ?? []) check(`Tabelle: ${group.join(' / ')}`, tables.some(t => group.every(g => t.includes(g))));
    for (const f of exp.forbidden ?? []) {
      const hit = texts.find(t => new RegExp(f, 'i').test(t));
      check(`Nicht: /${f}/`, !hit, hit ? `„${hit.slice(0, 120)}“` : '');
    }
    // Reihenfolge eines Ablaufs (Review 17.10.: Deduktion an den Anfang des Forschungskreislaufs gestellt).
    for (const steps of exp.orderedSteps ?? []) {
      const bad = r.blocks.flatMap(b => {
        // Bei Fragen nur die Antwort (die Frage nennt oft den Namen des Ablaufs, z. B. „…- und Theorienbildung“).
        // Tabellen Zeile für Zeile, Listen Punkt für Punkt (eine Begriffstabelle ist kein Ablauf).
        const parts = b.type === 'check' ? [b.answer] : b.type === 'table' ? b.rows.map(r => r.join(' '))
          : b.type === 'bullets' || b.type === 'tasks' ? b.items.map(i => i.text) : [blockTexts(b).join(' ')];
        // Gleiche Logik wie die Pipeline (eindeutige Schlüsselwörter je Schritt, Endungen egal).
        // Nur Texte, die den Ablauf aufzählen (mindestens 5 Schritte).
        return parts.filter(t => contradictsSequence(t, steps, 5)).map(t => t.slice(0, 120));
      });
      check(`Ablauf in Folienreihenfolge: ${steps.length} Schritte`, bad.length === 0, bad.map(x => `„${x}“`).join(' | '));
    }
    const tl = r.blocks.find(b => b.type === 'timeline');
    check('Zeitleiste sortiert', !tl || (tl.type === 'timeline' && tl.items.every((it, i) => i === 0 || tl.items[i - 1].year <= it.year)));
    const taskBlock = r.blocks.find(b => b.type === 'tasks');
    for (const tsk of LIGHT ? [] : exp.tasks ?? []) check(`Aufgabe: ${tsk}`, !!taskBlock && blockTexts(taskBlock).some(t => t.includes(tsk)));
    const hints = r.blocks.filter(b => b.type === 'callout' && b.variant === 'hinweis').flatMap(blockTexts).join(' ');
    // "page:24" = ein Hinweis zitiert Seite 24; sonst Teilstring im Text.
    const hintBlocks = r.blocks.filter(b => b.type === 'callout' && b.variant === 'hinweis');
    for (const h of exp.hints ?? []) {
      const page = h.match(/^page:(\d+)$/)?.[1];
      check(`Hinweis: ${h}`, page ? hintBlocks.some(b => b.cites.some(c => c.page === Number(page))) : hints.toLowerCase().includes(h.toLowerCase()));
    }
    for (const n of exp.notInTasks ?? []) check(`Keine Aufgabe: ${n}`, !taskBlock || !blockTexts(taskBlock).some(t => t.includes(n)));
    const tlItems = tl?.type === 'timeline' ? tl.items : [];
    for (const t of SCRIPT || GUIDE || LIGHT ? [] : exp.timeline ?? []) check(`Zeitleiste: ${t.who} ${t.year}`, tlItems.some(i => i.who.includes(t.who) && i.year === t.year), tlItems.filter(i => i.who.includes(t.who)).map(i => `${i.who} ${i.year}`).join(', '));
    for (const w of SCRIPT || GUIDE || LIGHT ? [] : exp.timelineForbidden ?? []) check(`Nicht in der Zeitleiste: ${w}`, !tlItems.some(i => i.who.includes(w)));
    for (const w of exp.warningsForbidden ?? []) check(`Keine Warnung zu ${w}`, !r.warnings.some(x => x.includes(w)), r.warnings.filter(x => x.includes(w)).join(' | '));
    for (const g of LIGHT ? [] : exp.together ?? []) check(`Zusammen: ${g.join(' / ')}`, r.blocks.some(b => { const t = blockTexts(b).join(' ').toLowerCase(); return g.every(x => t.includes(x.toLowerCase())); }));
    const headingTexts = r.blocks.filter(b => b.type === 'heading').map(b => (b.type === 'heading' ? b.text : ''));
    for (const h of LIGHT ? [] : exp.headings ?? []) check(`Abschnitt: ${h}`, headingTexts.includes(h));
    for (const h of exp.hintsForbidden ?? []) {
      const page = Number(h.replace('page:', ''));
      check(`Kein Hinweis auf S. ${page}`, !hintBlocks.some(b => b.cites.some(c => c.page === page)));
    }
    const chapterText = r.blocks.filter(b => b.id.startsWith('c')).flatMap(blockTexts).join(' ').toLowerCase();
    for (const c of LIGHT ? [] : exp.contentContains ?? []) check(`Im Kapiteltext: ${c}`, chapterText.includes(c.toLowerCase()));
    const tableIssues = checkTables(r.blocks);
    check('Tabellen: Zellen = Spalten, ein Datensatz je Zelle', tableIssues.length === 0, tableIssues.map(i => i.message.slice(0, 90)).join(' | '));
    // Je Kapitel (Überschrift Ebene 2 aus dem Schreiben, nicht die Extras): genau ein Merksatz, keine Wiederholung.
    const chapterRuns: Block[][] = [];
    for (const b of r.blocks) {
      if (b.type === 'heading' && b.level === 2) { chapterRuns.push(b.id.startsWith('c') ? [] : (null as unknown as Block[])); continue; }
      const cur = chapterRuns[chapterRuns.length - 1];
      if (cur) cur.push(b);
    }
    const chaptersOnly = chapterRuns.filter(Boolean);
    const merk = chaptersOnly.map(c => c.filter(b => b.type === 'callout' && b.variant === 'merksatz').length);
    if (GUIDE) {
      const structure = chaptersOnly.flatMap(c => checkGuideStructure(c, 'c'));
      check('Leitfaden: je Kapitel Kernbegriffe, Verständnisfragen, Klausurfragen; jede Frage belegt und beantwortet', structure.length === 0, structure.map(x => x.message.slice(0, 90)).join(' | '));
      const termRows = r.blocks.filter(b => b.type === 'table' && b.id.startsWith('c')).reduce((a, b) => a + (b.type === 'table' ? b.rows.length : 0), 0);
      const qs = r.blocks.filter(b => b.type === 'check' && b.id.startsWith('c')).length;
      const ki = r.blocks.filter(b => b.origin === 'ki' && b.id.startsWith('c')).length;
      check('Leitfaden: keine Erklärhilfen (nur Folieninhalt)', ki === 0, `${ki} Blöcke mit origin ki`);
      const defs = r.blocks.filter(b => b.type === 'table' && b.id.startsWith('c')).flatMap(blockTexts).join(' ');
      for (const g of exp.tables ?? []) check(`Leitfaden: Begriffe/Autoren ${g.join(' / ')} in den Tabellen`, g.every(x => defs.includes(x)));
      // Zentrale Begriffe als eigene Zeile (erste Spalte) in den Kernbegriffen.
      const firstCol = r.blocks.filter(b => b.type === 'table' && b.id.startsWith('c')).flatMap(b => (b.type === 'table' ? b.rows.map(row => row[0]) : []));
      // Schreibweise wie auf der Folie zählt mit („Cocktail Party Phänomen“ = „Cocktail-Party-Phänomen“).
      const norm = (t: string) => t.toLowerCase().replace(/\s*\(.*$/, '').replace(/[-\s]+/g, ' ').trim();
      for (const term of exp.guideTerms ?? []) check(`Leitfaden: Kernbegriff ${term}`, firstCol.some(c => norm(c) === norm(term)));
      console.log(`Leitfaden: ${termRows} Tabellenzeilen, ${qs} Fragen`);
    } else if (FAQ) {
      const qs = r.blocks.filter((b): b is Extract<Block, { type: 'check' }> => b.type === 'check' && b.id.startsWith('c'));
      const structure = chaptersOnly.flatMap(c => checkFaqChapter([], c, 'c'));
      check('FAQ: jede Antwort belegt, beantwortet die Frage, höchstens 90 Wörter, keine Frage doppelt', structure.length === 0, structure.map(x => x.message.slice(0, 90)).join(' | '));
      // Nach Thema gegliedert gibt es auch kleine Kapitel: je Kapitel mindestens 2, insgesamt mindestens 20 Fragen.
      check('FAQ: mindestens 2 Fragen je Kapitel, 20 insgesamt', chaptersOnly.every(c => c.filter(b => b.type === 'check').length >= 2) && qs.length >= 20, `${chaptersOnly.map(c => c.filter(b => b.type === 'check').length).join(', ')} = ${qs.length}`);
      const faqText = qs.map(q => `${q.question} ${q.answer}`).join(' ').toLowerCase().replace(/-/g, ' ');
      for (const term of exp.guideTerms ?? []) check(`FAQ: Thema ${term}`, faqText.includes(term.toLowerCase().replace(/-/g, ' ')));
      const ki = r.blocks.filter(b => b.origin === 'ki').length;
      check('FAQ: keine Erklärhilfen', ki === 0, `${ki}`);
      for (const must of exp.faqMust ?? []) check(`FAQ: enthält ${must}`, must.split('|').some(m => qs.some(q => `${q.question} ${q.answer}`.includes(m))));
      console.log(`FAQ: ${qs.length} Fragen`);
    } else if (GLOSSARY) {
      const tbls = r.blocks.filter((b): b is Extract<Block, { type: 'table' }> => b.type === 'table' && b.id.startsWith('c'));
      const rowsAll = tbls.flatMap(b => b.rows.map((row, i) => ({ term: row[0], text: row.slice(1).join(' '), cites: b.rowCites?.[i] ?? [] })));
      const key = (t: string) => t.toLowerCase().replace(/\s*\(.*$/, '').replace(/[-\s]+/g, ' ').trim();
      const sortedOk = rowsAll.every((x, i) => i === 0 || key(rowsAll[i - 1].term).localeCompare(key(x.term), 'de') <= 0);
      check('Glossar: alphabetisch sortiert', sortedOk);
      const keys = rowsAll.map(x => x.term.toLowerCase().replace(/[-\s]+/g, ' ').trim());
      const dups = keys.filter((k, i) => keys.indexOf(k) !== i);
      check('Glossar: kein Begriff doppelt', dups.length === 0, dups.join(', '));
      const uncited = rowsAll.filter(x => !x.cites.length).map(x => x.term);
      check('Glossar: jede Zeile mit Fußnote', uncited.length === 0, uncited.slice(0, 5).join(', '));
      const long = rowsAll.filter(x => (x.text.match(/\S+/g) ?? []).length > 45).map(x => x.term);
      check('Glossar: Erklärung höchstens 45 Wörter', long.length === 0, long.slice(0, 5).join(', '));
      const firstCol = rowsAll.map(x => x.term);
      for (const term of exp.guideTerms ?? []) check(`Glossar: Begriff ${term}`, firstCol.some(c => key(c) === key(term)));
      // Grundbegriffe (Glossar-Review 17.10.): Alternativen mit „|“, Treffer irgendwo im Begriff (auch in der Klammer).
      const loose = (t: string) => t.toLowerCase().replace(/[-\s]+/g, ' ');
      for (const alts of exp.glossaryTerms ?? []) check(`Glossar: Grundbegriff ${alts}`, firstCol.some(c => alts.split('|').some(a => new RegExp(`(^|[^\\p{L}])${loose(a).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:n|en|s|e)?(?=$|[^\\p{L}])`, 'u').test(loose(c)))));
      for (const t of exp.glossaryForbiddenTerms ?? []) check(`Glossar: kein Eintrag „${t}“`, !firstCol.some(c => key(c) === key(t)));
      for (const g of exp.tables ?? []) check(`Glossar: ${g.join(' / ')} vorhanden`, g.every(x => rowsAll.some(r => `${r.term} ${r.text}`.includes(x))));
      const ki = r.blocks.filter(b => b.origin === 'ki').length;
      check('Glossar: keine Erklärhilfen', ki === 0, `${ki}`);
      console.log(`Glossar: ${rowsAll.length} Begriffe`);
    } else if (!SCRIPT) check('Genau ein Merksatz je Kapitel', merk.every(n => n === 1), merk.join(', '));
    else {
      const structure = chaptersOnly.flatMap(c => checkScriptSections(c, 'c'));
      check('Skript: jeder Abschnitt mit Leitfrage, Kurz gecheckt, Überleitung', structure.length === 0, structure.map(x => x.message.slice(0, 90)).join(' | '));
      const sections = r.blocks.filter(b => b.type === 'heading' && b.level === 3 && b.id.startsWith('c')).length;
      const checks = r.blocks.filter(b => b.type === 'check').length;
      const ki = r.blocks.filter(b => b.origin === 'ki').length;
      check('Skript: Erklärhilfen vorhanden und markiert', ki > 0, `${ki} Blöcke mit origin ki`);
      check('Skript: Erklärhilfen ohne neue Fakten', !r.warnings.some(w => /Erklärhilfe (bringt|nennt)/.test(w)), r.warnings.filter(w => /Erklärhilfe (bringt|nennt)/.test(w)).join(' | '));
      console.log(`Skript: ${sections} Abschnitte, ${checks} Fragen „Kurz gecheckt“, ${ki} Erklärhilfen`);
    }
    const reps = chaptersOnly.flatMap(c => checkRepetition(c));
    check('Keine Wiederholung im Kapitel', reps.length === 0, reps.map(x => x.message.slice(0, 80)).join(' | '));
    check('Keine abgeschnittenen Texte', !texts.some(looksTruncated));
    check('Keine „[1, S. x]“ im Text', !texts.some(t => INLINE_CITE_RE.test(t)));

    const diag = r.diagnostics ?? [];
    const loops = usage.events.filter(e => e.kind === 'loop').length;
    check('Keine Schleife', loops === 0, `${loops} abgebrochen`);
    check('Kein leeres oder unvollständiges Kapitel', !(r.incompleteChapters?.length), (r.incompleteChapters ?? []).join(', '));
    check('Keine leere Überschrift', checkEmptyHeadings(r.blocks).length === 0);
    const writer = process.env.STUDIO_EVAL_PLAN === 'free' ? `${MODEL_LITE} (alle Schritte, wie Free)` : process.env.STUDIO_EVAL_WRITER || MODEL_HEAVY;
    const summary = [
      '',
      `Schreibmodell: ${writer}, Temperatur: ${TEMP_DEFAULT ? 'Standard des Modells' : 'Pipeline (0,1 bis 0,3)'}`,
      `Quellen: ${sources.length}${sources.some(s => s.parts) ? ` (Vorlesungen: ${sources.flatMap(s => s.parts ?? []).map(p => p.title).join(', ')})` : ''}, Aufrufe: ${usage.calls} (${Object.entries(usage.byStep).map(([k, v]) => `${k} ${v}`).join(', ')}), ${seconds} s`,
      `Kosten: ${usage.usd.toFixed(3)} $${usage.estimated ? ` (${usage.estimated} abgebrochene Aufrufe geschätzt)` : ''}`,
      `Abbrüche: ${usage.events.length ? usage.events.map(e => `${e.step} ${e.kind} (${e.detail})`).join('; ') : 'keine'}`,
      `Kapitel (Einheiten → Blöcke, verworfen, Versuche, Abdeckung):`,
      ...diag.map(d => `  ${d.title}: ${d.units} → ${d.blocks}, verworfen ${d.dropped.length}${d.dropped.length ? ` [${d.dropped.map(x => `${x.type}: ${x.reason}`).join('; ')}]` : ''}, ${d.attempts} Versuch(e)${d.split ? ', abschnittsweise' : ''}${d.aborts.length ? `, Abbrüche: ${d.aborts.join('; ')}` : ''}, ${Math.round(d.coverage * 100)} %`),
      `Länge: Haupttext ${mainWords}, gesamt ${r.stats.outputWords} / ${r.stats.sourceWords} Wörter`,
      `Übungsfragen: ${r.blocks.filter(b => b.id.startsWith('x-quiz-')).length}, Lückentext zum Handy-Beispiel: ${r.blocks.some(b => b.id.startsWith('x-quiz-') && /Handy/.test(blockTexts(b).join(' '))) ? 'ja' : 'nein'}`,
      `Warnungen: ${r.warnings.length}${r.warnings.length ? `\n  - ${r.warnings.join('\n  - ')}` : ''}`,
      `Ausgelassen: ${r.omittedSources.map(o => `${o.part?.title ?? o.sourceId} (${o.reason})`).join('; ') || 'keine'}`,
      ...report.map(([n, ok, d]) => `${ok ? '✓' : '✗'} ${n}${d ? `  ${d}` : ''}`),
      `Ergebnis: ${join(OUT, `${stamp}.md`)}`,
    ].join('\n');
    console.log(summary);
    // Eine Zeile je Lauf für den Vergleich über mehrere Läufe (Abnahme: 3 je Modell).
    appendFileSync(join(OUT, 'runs.jsonl'), `${JSON.stringify({
      stamp, format: FORMAT, writer, temperature: TEMP_DEFAULT ? 'default' : 'pipeline', usd: Math.round(usage.usd * 1000) / 1000, seconds,
      chapters: diag.length, dropped: diag.reduce((a, d) => a + d.dropped.length, 0), loops, aborts: usage.events.length,
      split: diag.filter(d => d.split).length, incomplete: r.incompleteChapters ?? [], emptyHeadings: checkEmptyHeadings(r.blocks).length,
      words: r.stats.outputWords, mainWords, warnings: r.warnings.length, failed: report.filter(([, ok]) => !ok).map(([n]) => n),
    })}\n`);
    writeFileSync(join(OUT, `${stamp}.report.txt`), summary);
  }, 30 * 60_000);
});

runExtract('Lernstudio-Eval: Extraktion messen (live, ohne Cache)', () => {
  it('Kosten, Dauer, Folie 26, Forschungskreislauf', async () => {
    const policy = (process.env.STUDIO_EVAL_IMAGES ?? 'all') as 'all' | 'selective' | 'none';
    const files = readdirSync(DIR).filter(f => f.toLowerCase().endsWith('.pdf'));
    const sources: PipelineSource[] = [];
    for (const f of files) {
      const { pages, renderPage } = await pdfPages(join(DIR, f));
      sources.push({ docId: f, name: f.replace(/\.pdf$/i, ''), pages, pageCount: pages.length,
        ...(policy !== 'none' ? { renderPage, imagePolicy: policy === 'selective' ? 'selective' as const : 'all' as const } : {}) });
    }
    const wanted = new Map(sources.map(s => [s.docId, new Set(s.pages!.map((p, i) => (p.trim() ? i + 1 : 0)).filter(Boolean))]));
    const usage: Usage = { calls: 0, usd: 0, estimated: 0, byStep: {}, events: [] };
    const t0 = Date.now();
    const units = await extractUnits(sources, wanted, makeLlm(usage), null);
    const seconds = Math.round((Date.now() - t0) / 1000);
    const pages = [...wanted.values()].reduce((a, s) => a + s.size, 0);
    const needImage = sources.flatMap(s => s.pages!.map(p => p)).filter(p => p.trim() && pageNeedsImage(p)).length;
    const p26 = units.filter(u => u.page === 26).map(u => `${u.type}${u.illustrative ? ' (illustrativ)' : ''}: ${u.text}`);
    const kreis = units.filter(u => /kreislauf/i.test(`${u.title ?? ''} ${u.text}`) && u.type !== 'task').map(u => `S. ${u.page} ${u.type}: ${u.text.slice(0, 160)}`);
    const right26 = units.some(u => u.page === 26 && /mit Handy\W{0,12}(M\s*=\s*)?90|90\s*\(mit Handy|M\s*=\s*90[^.]{0,25}mit Handy/i.test(u.text))
      && !units.some(u => u.page === 26 && /mit Handy\W{0,12}(M\s*=\s*)?30|30\s*\(mit Handy/i.test(u.text));
    const summary = [
      `Bilder: ${policy}, Seiten: ${pages}, davon mit Bild: ${usage.images ?? 0} (Heuristik "Text reicht nicht": ${needImage})`,
      `Kosten: ${usage.usd.toFixed(4)} $ (${(usage.usd / pages * 1000).toFixed(3)} $ je 1.000 Seiten → ${(usage.usd / pages * 300).toFixed(3)} $ für 300 Seiten)`,
      `Dauer: ${seconds} s (${(seconds / pages).toFixed(2)} s je Seite, 4 parallel → 300 Seiten etwa ${Math.round(seconds / pages * 300)} s)`,
      `Aufrufe: ${usage.calls}, Einheiten: ${units.length}`,
      `Folie 26 richtig (Mit Handy 90, Ohne Handy 30): ${right26 ? 'ja' : 'NEIN'}`,
      ...p26.map(t => `  ${t.slice(0, 220)}`),
      `Forschungskreislauf (ohne Aufgaben): ${kreis.length ? 'ja' : 'NEIN'}`,
      ...kreis.map(t => `  ${t}`),
    ].join('\n');
    console.log(summary);
    mkdirSync(OUT, { recursive: true });
    writeFileSync(join(OUT, `extract-${policy}-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`), summary);
  }, 30 * 60_000);
});
