// @vitest-environment node
// Eval der Lernstudio-Zusammenfassung (Phase 1) gegen echte Vorlesungs-PDFs.
// Läuft nur mit STUDIO_EVAL=1 (npm run eval:studio), sonst übersprungen; nie in npm test.
// Daten liegen nur lokal (gitignored): benchmark/datasets/lernstudio/
//   *.pdf                PDFs des Fachs (Dateiname = Quellenname)
//   expectations.json    fachspezifische Abnahme (Zahlen, Tabellen, Aufgaben …), optional
//   cache/               Extraktionen; spätere Läufe kosten nur Gliederung, Schreiben, Prüfen
// Ergebnis: benchmark/results/lernstudio/<Zeit>.json und .md
// Optional: STUDIO_EVAL_WRITER=gemini-4-argon (Schreibmodell), STUDIO_EVAL_FOCUS="…"
import { describe, it, expect } from 'vitest';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import '../env.ts';
import { GoogleGenAI } from '@google/genai';
import { runSummaryPipeline } from '../../services/studio/pipeline';
import { findDuplicatePages } from '../../services/studio/dedupe';
import { resultToMarkdown } from '../../services/studio/toMarkdown';
import { blockTexts, INLINE_CITE_RE, looksTruncated } from '../../services/studio/text';
import type { Block, Cite, PipelineSource } from '../../services/studio/types';
import type { StudioLlm } from '../../services/studio/llm';

const run = process.env.STUDIO_EVAL === '1' ? describe : describe.skip;
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
}

const pdfPages = async (file: string): Promise<string[]> => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(file)) }).promise;
  const pages: string[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const content = await (await pdf.getPage(n)).getTextContent();
    pages.push(content.items.map(i => ('str' in i ? i.str : '')).join(' ').replace(/\s+/g, ' ').trim());
  }
  return pages;
};

const MODEL_LITE = 'gemini-3.5-flash-lite';
const MODEL_HEAVY = 'gemini-3.8-flash';

const makeLlm = (usage: { calls: number; inTok: number; outTok: number; byStep: Record<string, number> }): StudioLlm => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  return async req => {
    const model = req.step === 'write' && process.env.STUDIO_EVAL_WRITER ? process.env.STUDIO_EVAL_WRITER : req.heavy ? MODEL_HEAVY : MODEL_LITE;
    const config: Record<string, unknown> = {
      temperature: req.temperature ?? 0.2, maxOutputTokens: 16384,
      responseMimeType: 'application/json', responseSchema: req.schema,
    };
    // Wie das Backend: Lite lehnt thinkingBudget 0 ab.
    if (!(model === MODEL_LITE && (req.thinkingBudget ?? 0) === 0)) config.thinkingConfig = { thinkingBudget: req.thinkingBudget ?? 0 };
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await ai.models.generateContent({ model, contents: [{ role: 'user', parts: [{ text: req.prompt }] }], config: config as never });
        usage.calls += 1;
        usage.byStep[req.step] = (usage.byStep[req.step] ?? 0) + 1;
        usage.inTok += res.usageMetadata?.promptTokenCount ?? 0;
        usage.outTok += (res.usageMetadata?.candidatesTokenCount ?? 0) + (res.usageMetadata?.thoughtsTokenCount ?? 0);
        return JSON.parse(res.text ?? '{}');
      } catch (e) {
        if (attempt >= 2 || !/429|RESOURCE_EXHAUSTED|UNAVAILABLE|overloaded|50\d/i.test(String(e))) throw e;
        await new Promise(r => setTimeout(r, 4000 * (attempt + 1)));
      }
    }
  };
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
      const pages = await pdfPages(join(DIR, f));
      sources.push({ docId: f, name: f.replace(/\.pdf$/i, ''), pages, pageCount: pages.length });
    }
    const exp: Expectations = existsSync(join(DIR, 'expectations.json')) ? JSON.parse(readFileSync(join(DIR, 'expectations.json'), 'utf8')) : {};

    const usage = { calls: 0, inTok: 0, outTok: 0, byStep: {} as Record<string, number> };
    const started = Date.now();
    const r = await runSummaryPipeline({
      sources, llm: makeLlm(usage), cache: fileCache(), focus: process.env.STUDIO_EVAL_FOCUS,
      onProgress: p => process.stdout.write(`\r${p.step} ${p.done}/${p.total}      `),
    });
    const seconds = Math.round((Date.now() - started) / 1000);

    mkdirSync(OUT, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const numberOf = (id: string) => sources.findIndex(s => s.docId === id) + 1 || undefined;
    writeFileSync(join(OUT, `${stamp}.json`), JSON.stringify(r, null, 2));
    writeFileSync(join(OUT, `${stamp}.md`), `${sources.map((s, i) => `[${i + 1}] ${s.name}`).join('\n')}\n\n${resultToMarkdown(r, numberOf)}`);

    const texts = r.blocks.flatMap(blockTexts);
    const all = texts.join('\n');
    const report: [string, boolean, string][] = [];
    const check = (name: string, ok: boolean, detail = '') => { report.push([name, ok, detail]); expect.soft(ok, `${name} ${detail}`).toBe(true); };

    const ratio = r.stats.outputWords / Math.max(1, r.stats.sourceWords);
    check('≤ 40 % der Quellwörter', ratio <= 0.4 || r.stats.outputWords <= 600, `${r.stats.outputWords}/${r.stats.sourceWords} = ${Math.round(ratio * 100)} %`);
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
    for (const n of exp.numbers ?? []) check(`Zahl ${n}`, norm(all).includes(norm(n)));
    const tables = r.blocks.filter((b): b is Extract<Block, { type: 'table' }> => b.type === 'table').map(b => blockTexts(b).join(' '));
    for (const group of exp.tables ?? []) check(`Tabelle: ${group.join(' / ')}`, tables.some(t => group.every(g => t.includes(g))));
    for (const f of exp.forbidden ?? []) {
      const hit = texts.find(t => new RegExp(f, 'i').test(t));
      check(`Nicht: /${f}/`, !hit, hit ? `„${hit.slice(0, 120)}“` : '');
    }
    const tl = r.blocks.find(b => b.type === 'timeline');
    check('Zeitleiste sortiert', !tl || (tl.type === 'timeline' && tl.items.every((it, i) => i === 0 || tl.items[i - 1].year <= it.year)));
    const taskBlock = r.blocks.find(b => b.type === 'tasks');
    for (const tsk of exp.tasks ?? []) check(`Aufgabe: ${tsk}`, !!taskBlock && blockTexts(taskBlock).some(t => t.includes(tsk)));
    const hints = r.blocks.filter(b => b.type === 'callout' && b.variant === 'hinweis').flatMap(blockTexts).join(' ');
    for (const h of exp.hints ?? []) check(`Hinweis: ${h}`, hints.toLowerCase().includes(h.toLowerCase()));
    check('Keine abgeschnittenen Texte', !texts.some(looksTruncated));
    check('Keine „[1, S. x]“ im Text', !texts.some(t => INLINE_CITE_RE.test(t)));

    const costUsd = usage.inTok / 1e6 * 0.75 + usage.outTok / 1e6 * 3.75;
    const summary = [
      '',
      `Quellen: ${sources.length}, Aufrufe: ${usage.calls} (${Object.entries(usage.byStep).map(([k, v]) => `${k} ${v}`).join(', ')}), ${seconds} s`,
      `Tokens: ${usage.inTok} ein / ${usage.outTok} aus, grob ${costUsd.toFixed(3)} $ (zum 3.8-Flash-Preis gerechnet, Lite ist billiger)`,
      `Warnungen: ${r.warnings.length}${r.warnings.length ? `\n  - ${r.warnings.join('\n  - ')}` : ''}`,
      `Ausgelassen: ${r.omittedSources.map(o => `${o.sourceId} (${o.reason})`).join('; ') || 'keine'}`,
      ...report.map(([n, ok, d]) => `${ok ? '✓' : '✗'} ${n}${d ? `  ${d}` : ''}`),
      `Ergebnis: ${join(OUT, `${stamp}.md`)}`,
    ].join('\n');
    console.log(summary);
    writeFileSync(join(OUT, `${stamp}.report.txt`), summary);
  }, 30 * 60_000);
});
