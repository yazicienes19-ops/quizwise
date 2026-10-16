import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Block, LernstudioResult, Unit } from './types';
import { checkEmptyHeadings, checkStudies, checkTruncated } from './validate';
import { isIncompleteResult } from './incomplete';

/**
 * Regression Phase 1.1: Die Fehler des Testlaufs vom 16.10.2026 müssen die
 * Prüfregeln erkennen.
 * 1. Synthetische Nachbildung (immer, im öffentlichen Repo).
 * 2. Der echte Testlauf docs/lernstudio/testlauf-phase1.md mit den echten
 *    Einheiten aus benchmark/datasets/lernstudio/cache/ (nur lokal, beide
 *    gitignored; fehlen sie, wird der Test übersprungen).
 */

const P = (id: string, text: string): Block => ({ id, origin: 'quelle', cites: [], type: 'paragraph', text });
const H = (id: string, level: 2 | 3, text: string): Block => ({ id, origin: 'quelle', cites: [], type: 'heading', level, text });

describe('Testlauf 16.10. (synthetisch)', () => {
  const units: Unit[] = [
    { id: 'u1', sourceId: 's', page: 128, type: 'concept', text: 'Wird der eigene Name genannt, zieht dies automatisch die Aufmerksamkeit auf sich.' },
    { id: 'u2', sourceId: 's', page: 58, type: 'concept', text: 'Erwartungen beeinflussen Reaktionen, obwohl die Behandlung keinen spezifisch wirksamen Bestandteil hat.' },
  ];
  const blocks: Block[] = [
    H('c3-h', 2, 'Aufmerksamkeit: Phänomene und Paradigmen'),
    H('c3-1', 3, 'Grundlagen, Inattentional und Change Blindness'),
    H('c4-h', 2, 'Modelle der selektiven Aufmerksamkeit'),
    P('c4-1', 'Filtertheorie: frühe Selektion nach physikalischen Merkmalen.'),
    { id: 'c4-2', origin: 'quelle', cites: [], type: 'study', authors: 'Moray', year: 1959591959, design: '', result: '', conclusion: '' },
    { id: 'c4-3', origin: 'quelle', cites: [], type: 'study', authors: 'Moray', year: 1959, design: '', result: '', conclusion: '' },
    { id: 'x-tl', origin: 'quelle', cites: [], type: 'timeline', items: [
      { year: 1959, who: 'Moray', what: 'Wird der eigene Name genannt, zieht dies automatisch.', cites: [] },
      { year: 2011, who: 'Moray; Li et al.', what: 'Probleme der Filtertheorie: Eindringen von unbeachtetem Input (z.B.', cites: [] },
      { year: 2020, who: 'Colloca & Barsky', what: 'Erwartungen beeinflussen Reaktionen, obwohl die Behandlung keinen spezifisch wirksamen.', cites: [] },
    ] },
  ];

  it('leere Überschriften', () => {
    expect(checkEmptyHeadings(blocks).map(i => i.blockId)).toEqual(['c3-h', 'c3-1']);
  });
  it('unmögliche Jahreszahl und Studien ohne Aufbau/Ergebnis', () => {
    const msgs = checkStudies(blocks).map(i => i.message);
    expect(msgs.some(m => m.includes('1959591959'))).toBe(true);
    expect(msgs.filter(m => m.includes('weder Aufbau noch Ergebnis'))).toHaveLength(2);
  });
  it('alle drei abgeschnittenen Zeitleisten-Texte', () => {
    expect(checkTruncated(blocks, units).filter(i => i.blockId === 'x-tl')).toHaveLength(3);
  });
  it('gespeichertes Ergebnis gilt als unvollständig', () => {
    const r: LernstudioResult = { formatVersion: 2, format: 'zusammenfassung', blocks, omittedSources: [], warnings: [], stats: { sourceWords: 1, outputWords: 1 } };
    expect(isIncompleteResult(r)).toBe(true);
  });
});

// ── Echter Testlauf, nur lokal ──
const ROOT = join(__dirname, '..', '..');
const TESTLAUF = join(ROOT, 'docs', 'lernstudio', 'testlauf-phase1.md');
const CACHE = join(ROOT, 'benchmark', 'datasets', 'lernstudio', 'cache');
const local = existsSync(TESTLAUF) && existsSync(CACHE) ? describe : describe.skip;

/** Markdown des Testlaufs grob zurück in Blöcke (Überschriften, Stichpunkte, Studien, Zeitleiste). */
const parseTestlauf = (md: string): Block[] => {
  const blocks: Block[] = [];
  const strip = (t: string) => t.replace(/(?:\[\d+, S\. \d+\])+/g, '').trim();
  let inTimeline = false;
  md.split('\n').forEach((line, i) => {
    const id = `l${i}`;
    const h = line.match(/^(#{3,4}) (.+)$/);
    if (h) {
      inTimeline = h[2].trim() === 'Zeitleiste';
      blocks.push(H(id, h[1].length === 3 ? 2 : 3, h[2].trim()));
      return;
    }
    const tl = inTimeline && line.match(/^- \*\*(\d+)\*\* ([^:]+): (.+)$/);
    if (tl) { blocks.push({ id, origin: 'quelle', cites: [], type: 'timeline', items: [{ year: Number(tl[1]), who: tl[2], what: strip(tl[3]), cites: [] }] }); return; }
    const st = line.match(/^\*\*(.+) \((\d+)\)\*\*$/);
    if (st) { blocks.push({ id, origin: 'quelle', cites: [], type: 'study', authors: st[1], year: Number(st[2]), design: '', result: '', conclusion: '' }); return; }
    if (line.startsWith('- ')) { blocks.push({ id, origin: 'quelle', cites: [], type: 'bullets', items: [{ text: strip(line.slice(2)), cites: [] }] }); return; }
    if (line.trim() && !line.startsWith('|') && !line.startsWith('#') && !line.startsWith('---')) blocks.push(P(id, strip(line)));
  });
  return blocks.slice(1); // Titelzeile "# Zusammenfassung (Argon)" zählt nicht.
};

local('Testlauf 16.10. (echt, lokal)', () => {
  const md = readFileSync(TESTLAUF, 'utf8').split('\n---\n**Hinweise zur Prüfung')[0];
  const blocks = parseTestlauf(md);
  const units: Unit[] = readdirSync(CACHE).filter(f => f.endsWith('.json'))
    .flatMap(f => JSON.parse(readFileSync(join(CACHE, f), 'utf8')) as Omit<Unit, 'id'>[])
    .map((u, i) => ({ ...u, id: `u${i}` }));

  it('erkennt die leeren Kapitel', () => {
    const empty = checkEmptyHeadings(blocks).map(i => i.message);
    expect(empty.some(m => m.includes('Grundlagen, Inattentional und Change Blindness'))).toBe(true);
  });
  it('erkennt „Moray (1959591959)“ und die Studien ohne Inhalt', () => {
    const msgs = checkStudies(blocks).map(i => i.message);
    expect(msgs.some(m => m.includes('1959591959'))).toBe(true);
    expect(msgs.some(m => m.includes('weder Aufbau noch Ergebnis'))).toBe(true);
  });
  it('erkennt die abgeschnittenen Texte', () => {
    const cut = checkTruncated(blocks, units).map(i => i.message).join('\n');
    expect(cut).toContain('(z.B.');
    expect(cut).toContain('zieht dies automatisch.');
    expect(cut).toContain('keinen spezifisch wirksamen.');
  });
});
