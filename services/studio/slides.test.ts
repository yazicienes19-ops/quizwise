// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Block, PipelineSource, Unit } from './types';
import type { StudioLlm, StudioLlmRequest } from './llm';
import { hiddenItemFlags, layoutPageText, layoutPageTextWithHidden, visiblePart, HIDDEN_TEXT_MARK, type PositionedTextItem } from '../pdfPageService';
import { filterHiddenText, scanSourceErrors } from './extract';
import { extractUnits, verifySourceErrors } from './extract';
import { checkNumbers, checkTables } from './validate';
import { normalizeBlocks } from './blocks';
import { markPriority } from './priority';
import { runSummaryPipeline } from './pipeline';

/**
 * Abnahme 16.10.2026, zweite Runde: Werte in Spalten, Folienfehler nur mit
 * Bestätigung am Bild, Tabellenform, Folientitel als Beleg, Aufgaben als
 * Wichtigkeits-Signal.
 */

const item = (str: string, x: number, y: number, w = str.length * 7, h = 18): PositionedTextItem => ({ str, x, y, w, h });

describe('Text nach Position', () => {
  it('Spalten bleiben ihrer Überschrift zugeordnet, auch wenn der PDF-Strom sie vertauscht', () => {
    // Reihenfolge wie im PDF-Strom der Folie: rechte Spalte (M = 30) vor der linken (M = 90).
    const items = [
      item('Gruppe 1: μ Mit Handy', 46, 250), item('Gruppe 2: μ Ohne Handy', 530, 256),
      item('M', 616, 336), item('= 30', 636, 336), item('M', 106, 337), item('= 90', 126, 337),
      item('Falsifikation', 84, 500),
    ];
    expect(layoutPageText(items).split('\n')).toEqual([
      'Gruppe 1: μ Mit Handy | Gruppe 2: μ Ohne Handy',
      'M = 90 | M = 30',
      'Falsifikation',
    ]);
  });
});

describe('Verborgener Text (Pixeltest)', () => {
  // Bild 100 x 40 (Maßstab 1): links ein "Wort" mit dunklen Pixeln, rechts eine weiße Fläche über Text.
  const w = 100, h = 40;
  const rgba = new Uint8ClampedArray(w * h * 4).fill(255);
  for (let y = 10; y < 20; y++) for (let x = 10; x < 40; x += 3) { const i = (y * w + x) * 4; rgba[i] = rgba[i + 1] = rgba[i + 2] = 0; }
  const items = [item('Hypothese:', 10, 10, 30, 10), item('Musik hören, erinnern weniger', 60, 10, 35, 10)];
  it('verdeckter Text wird erkannt und getrennt markiert', () => {
    const flags = hiddenItemFlags(items, rgba, w, h, 1);
    expect(flags).toEqual([false, true]);
    const text = layoutPageTextWithHidden(items, flags);
    expect(text).toBe(`Hypothese:\n${HIDDEN_TEXT_MARK}\nMusik hören, erinnern weniger`);
    expect(visiblePart(text)).toBe('Hypothese:');
  });
  it('die Suche nach Folienfehlern sieht verborgenen Text nie', async () => {
    const prompts: string[] = [];
    const pages = [`Hypothese:\n${HIDDEN_TEXT_MARK}\nMusik hören, erinnern weniger`];
    await scanSourceErrors([{ docId: 'g', name: 'G', pageCount: 1, pages }], new Map([['g', new Set([1])]]), async req => { prompts.push(req.prompt); return { errors: [] }; }, null);
    expect(prompts[0]).toContain('Hypothese:');
    expect(prompts[0]).not.toContain('Musik');
  });
});

describe('Verborgenen Text sichten', () => {
  const page = `Beispiel 2: Handys\nHypothese:\n${HIDDEN_TEXT_MARK}\nDas Handy verschlechtert die Konzentration.\nMusik beim Lernen verschlechtert das Erinnern.\nEine Gruppe mit Handy, eine ohne.`;
  const src = (renderPage?: (p: number) => Promise<string | null>): PipelineSource => ({ docId: 'g', name: 'G', pageCount: 1, pages: [page], ...(renderPage ? { renderPage } : {}) });
  it('unpassende verborgene Zeilen werden entfernt, passende bleiben', async () => {
    const reqs: StudioLlmRequest[] = [];
    const llm: StudioLlm = async req => { reqs.push(req); return { reason: 'Zeile 2 gehört zum Musik-Beispiel', keep: ['1', '3'] }; };
    const [out] = await filterHiddenText([src(async () => 'img')], new Map([['g', new Set([1])]]), llm, null);
    expect(out.pages![0]).toBe(`Beispiel 2: Handys\nHypothese:\n${HIDDEN_TEXT_MARK}\nDas Handy verschlechtert die Konzentration.\nEine Gruppe mit Handy, eine ohne.`);
    expect(reqs[0].images).toEqual(['img']);
  });
  it('ohne Bild oder bei Fehler bleibt nur der sichtbare Text', async () => {
    const [noImg] = await filterHiddenText([src()], new Map([['g', new Set([1])]]), async () => ({ keep: ['1'] }), null);
    expect(noImg.pages![0]).toBe('Beispiel 2: Handys\nHypothese:');
    const [err] = await filterHiddenText([src(async () => 'img')], new Map([['g', new Set([1])]]), async () => { throw new Error('x'); }, null);
    expect(err.pages![0]).toBe('Beispiel 2: Handys\nHypothese:');
  });
});

// Echte Folie 26 (nur lokal, gitignored): Mit Handy = 90, Ohne Handy = 30, Falsifikation.
const PDF = join(__dirname, '..', '..', 'benchmark', 'datasets', 'lernstudio', 'Allgemeine Psychologie 1 (gesamt).pdf');
(existsSync(PDF) ? describe : describe.skip)('Folie 26 (echt, lokal)', () => {
  it('Folie 24: die Musik-Hypothese steht nur verdeckt in der Datei', async () => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const { createCanvas } = await import('@napi-rs/canvas');
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(PDF)) }).promise;
    const page = await pdf.getPage(24);
    const vp = page.getViewport({ scale: 1 });
    const items = (await page.getTextContent()).items.filter(i => 'str' in i && i.str).map(i => {
      const it = i as { str: string; transform: number[]; width: number; height: number };
      const h = it.height || Math.abs(it.transform[3]) || 10;
      return { str: it.str, x: it.transform[4], y: vp.height - it.transform[5] - h, w: it.width, h };
    });
    const scale = 1000 / vp.width;
    const rvp = page.getViewport({ scale });
    const canvas = createCanvas(Math.round(rvp.width), Math.round(rvp.height));
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx as never, viewport: rvp, canvas: canvas as never }).promise;
    const text = layoutPageTextWithHidden(items, hiddenItemFlags(items, ctx.getImageData(0, 0, canvas.width, canvas.height).data as unknown as Uint8ClampedArray, canvas.width, canvas.height, scale));
    expect(visiblePart(text)).toContain('Hypothese');
    expect(visiblePart(text)).not.toContain('Musik');
    expect(text.split(HIDDEN_TEXT_MARK)[1]).toContain('Musik');
  });
  it('Text nach Position: 90 links (mit Handy), 30 rechts (ohne Handy)', async () => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(PDF)) }).promise;
    const page = await pdf.getPage(26);
    const vp = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items = content.items.filter(i => 'str' in i && i.str).map(i => {
      const it = i as { str: string; transform: number[]; width: number; height: number };
      const h = it.height || Math.abs(it.transform[3]) || 10;
      return { str: it.str, x: it.transform[4], y: vp.height - it.transform[5] - h, w: it.width, h };
    });
    const lines = layoutPageText(items).split('\n');
    const head = lines.findIndex(l => /Mit Handy.*\|.*Ohne Handy/.test(l));
    const values = lines.findIndex(l => /M = 90 \| M = 30/.test(l));
    expect(head).toBeGreaterThanOrEqual(0);
    expect(values).toBeGreaterThan(head);
    expect(lines.some(l => l.includes('Falsifikation'))).toBe(true);
  });
});

const src = (extra: Partial<PipelineSource> = {}): PipelineSource => ({
  docId: 'g', name: 'Gesamt', pageCount: 3,
  pages: ['Titel Logik der Forschung Beispiel Handy (Skowronek et al., 2023)', 'Gruppe 1 Mit Handy | Gruppe 2 Ohne Handy\nM = 90 | M = 30\nFalsifikation', 'Rauchen und Noten r = 1'],
  ...extra,
});

describe('Folienfehler nur mit Bestätigung am Seitenbild', () => {
  const candidates = [
    { sourceId: 'g', page: 2, type: 'source_error' as const, text: 'Falsifikation ist falsch, die Werte stützen H1.' },
    { sourceId: 'g', page: 1, type: 'source_error' as const, text: 'Auf Folie 1 steht die Hypothese aus dem Musik-Beispiel.' },
  ];
  it('nur Bestätigtes bleibt, mit neuem Text; das Seitenbild (und das davor) geht mit', async () => {
    const reqs: StudioLlmRequest[] = [];
    const llm: StudioLlm = async req => {
      reqs.push(req);
      return req.prompt.includes('Folie 2')
        ? { reason: 'Mit Handy steht M = 90, ohne Handy M = 30; Falsifikation ist korrekt.', confirmed: false }
        : { reason: 'Hypothese gehört zum Musik-Beispiel.', confirmed: true, text: 'Beim Handy-Beispiel steht vermutlich versehentlich die Hypothese zum Lernen mit Musik.' };
    };
    const out = await verifySourceErrors(candidates, [src({ renderPage: async p => `img${p}` })], llm, null);
    expect(out).toEqual([{ sourceId: 'g', page: 1, type: 'source_error', text: 'Beim Handy-Beispiel steht vermutlich versehentlich die Hypothese zum Lernen mit Musik.' }]);
    expect(reqs.find(r => r.prompt.includes('Folie 2'))?.images).toEqual(['img2', 'img1']);
  });
  it('ohne Seitenbild kein Hinweis (ein falscher Vorwurf ist schlimmer als ein verpasster)', async () => {
    const llm: StudioLlm = async () => ({ confirmed: true, reason: 'x', text: 'y' });
    expect(await verifySourceErrors(candidates, [src()], llm, null)).toEqual([]);
  });
  it('Pipeline: vermutete Fehler erreichen das Schreibmodell nie; den Hinweis setzt der Code mit genau einer Folie', async () => {
    const writes: string[] = [];
    const checks: string[] = [];
    const llm: StudioLlm = async req => {
      if (req.step === 'check') checks.push(req.prompt);
      if (req.step === 'extract') return { units: [
        { page: 1, type: 'study', text: 'Handy-Beispiel (Skowronek et al., 2023).', authors: 'Skowronek et al.', year: '2023', design: 'Zwei Gruppen', result: 'kein Ergebnis berichtet' },
        { page: 2, type: 'example', illustrative: true, text: 'Mit Handy M = 90, ohne Handy M = 30: Falsifikation.' },
        { page: 1, type: 'source_error', text: 'Auf Folie 1 steht eine Hypothese aus dem anderen Beispiel.' },
      ] };
      if (req.step === 'scan') return { errors: [{ page: 2, text: 'Auf Folie 2 ist Falsifikation falsch.' }] };
      if (req.step === 'verify') return req.prompt.includes('Folie 2') ? { confirmed: false, reason: 'Spalten richtig gelesen' } : { confirmed: true, reason: 'ok', text: 'Hier steht vermutlich versehentlich die Hypothese aus dem Musik-Beispiel.' };
      if (req.step === 'outline') return { chapters: [{ title: 'Logik der Forschung', sections: [{ title: 'A', unitIds: [...req.prompt.matchAll(/^(u\d+) \|/gm)].map(m => m[1]) }] }] };
      if (req.step === 'write') {
        writes.push(req.prompt);
        const ids = [...req.prompt.matchAll(/^- (u\d+) /gm)].map(m => m[1]);
        // Erste Fassung mit Quellenangabe im Text: erzwingt eine Reparatur, die das Kapitel neu schreibt.
        const repair = req.prompt.includes('=== ÜBERARBEITUNG ===');
        return { blocks: [
          { type: 'heading', origin: 'quelle', heading: { text: 'A' } },
          { type: 'bullets', origin: 'quelle', bullets: { items: ids.map(id => ({ text: repair ? `Inhalt ${id}` : `Inhalt ${id} [1, S. 2]`, units: [id] })) } },
          { type: 'callout', origin: 'quelle', callout: { variant: 'merksatz', text: 'Merke.', units: ids.slice(0, 1) } },
        ] };
      }
      return { issues: [], items: [], topic: 'x' };
    };
    const r = await runSummaryPipeline({ sources: [src({ renderPage: async p => `img${p}` })], llm });
    expect(writes.some(w => /Hypothese aus dem|Falsifikation ist falsch|source_error/.test(w))).toBe(false);
    // Der Hinweis übersteht die Reparatur (er wird erst danach eingesetzt).
    expect(writes.some(w => w.includes('=== ÜBERARBEITUNG ==='))).toBe(true);
    const hints = r.blocks.filter((b): b is Extract<Block, { type: 'callout' }> => b.type === 'callout' && b.variant === 'hinweis');
    expect(hints.map(h => [h.text, h.cites])).toEqual([
      ['Auf Folie 1: Hier steht vermutlich versehentlich die Hypothese aus dem Musik-Beispiel.', [{ sourceId: 'g', page: 1 }]],
    ]);
    // Auch die Prüfung nach der Reparatur sieht den Hinweis nicht (sie beanstandete ihn sonst als Lerninhalt).
    expect(checks.length).toBeGreaterThanOrEqual(2);
    expect(checks.some(c => c.includes('versehentlich die Hypothese'))).toBe(false);
  });
});

describe('Extraktion mit Seitenbildern', () => {
  it('je Seite im Fenster ein Bild, in Reihenfolge; eigener Cache-Eintrag', async () => {
    const reqs: StudioLlmRequest[] = [];
    const llm: StudioLlm = async req => { reqs.push(req); return { units: [] }; };
    const store = new Map<string, unknown[]>();
    const cache = { get: async (h: string) => store.get(h) ?? null, set: async (h: string, _d: string, _p: number, u: unknown[]) => { store.set(h, u); } };
    const wanted = new Map([['g', new Set([1, 2, 3])]]);
    await extractUnits([src({ renderPage: async p => `img${p}` })], wanted, llm, cache);
    expect(reqs[0].images).toEqual(['img1', 'img2', 'img3']);
    await extractUnits([src()], wanted, llm, cache);
    expect(reqs).toHaveLength(2);
    expect(reqs[1].images).toBeUndefined();
  });
});

describe('Tabellen, Folientitel als Beleg, Aufgaben als Signal', () => {
  const byId = new Map<string, Unit>();
  it('Zeile mit falscher Zellenzahl und Zelle mit zwei Datensätzen', () => {
    const { blocks } = normalizeBlocks([{ type: 'table', origin: 'quelle', table: {
      headers: ['Szenario', 'Werte', 'Folgerung'],
      rows: [
        { cells: ['Szenario 1', 'M = 75 vs. M = 90', 'bestätigt'], units: [] },
        { cells: ['Szenario 2', 'M = 90 vs. M = 30', 'Falsifikation / M = 60 vs. M = 60 (Falsifikation der H1)'], units: [] },
        { cells: ['Szenario 4', 'nur zwei'], units: [] },
      ],
    } }], byId, 'c1-');
    const msgs = checkTables(blocks).map(i => i.message);
    expect(msgs.some(m => m.includes('Zeile 3 hat 2 statt 3 Zellen'))).toBe(true);
    expect(msgs.some(m => m.includes('Zeile 2: eine Zelle enthält zwei Datensätze'))).toBe(true);
    const ok = normalizeBlocks([{ type: 'table', origin: 'quelle', table: { headers: ['Gruppe', 'M'], rows: [{ cells: ['Mit Handy', '90'], units: [] }, { cells: ['Ohne Handy', '30'], units: [] }] } }], byId, 'c1-').blocks;
    expect(checkTables(ok)).toEqual([]);
  });
  it('Jahr aus dem Folientitel gilt als belegt', () => {
    const units: Unit[] = [{ id: 'u1', sourceId: 'g', page: 1, type: 'study', text: 'Handy-Beispiel.' }];
    const blocks: Block[] = [{ id: 'b', origin: 'quelle', cites: [{ sourceId: 'g', page: 1 }], type: 'paragraph', text: 'Skowronek et al. (2023) prüften das Handy-Beispiel.' }];
    const ctx = { sources: [{ docId: 'g', name: 'G', pageCount: 3 }], units, omittedSources: [], sourceWords: 100 };
    expect(checkNumbers(blocks, ctx)).toHaveLength(1);
    expect(checkNumbers(blocks, { ...ctx, pageText: () => src().pages![0] })).toEqual([]);
  });
  it('worauf sich eine Aufgabe bezieht, ist prüfungsrelevant', () => {
    const units: Unit[] = [
      { id: 'u1', sourceId: 'g', page: 34, type: 'figure', text: 'Forschungskreislauf: Beobachtung, Hypothese, Experiment, Prüfung, Theorie.' },
      { id: 'u2', sourceId: 'g', page: 50, type: 'concept', text: 'Validität bezeichnet die Gültigkeit einer Messung.' },
      { id: 'u3', sourceId: 'g', page: 41, type: 'task', text: 'Erstellen Sie einen Forschungskreislauf zu einem eigenen Thema: Beobachtung, Hypothese, Experiment.' },
    ];
    expect(markPriority(units).filter(u => u.priority).map(u => u.id)).toEqual(['u1']);
  });
});
