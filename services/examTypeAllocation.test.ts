import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'fake-token' } } }),
    },
  },
}));

import { generateFullExam } from './geminiService';

const respondEmpty = () => ({ ok: true, json: async () => ({ text: '[]' }) });

/** Liest die Stückzahlen aus dem FRAGETYPEN-VERTEILUNG-Block des gesendeten Prompts. */
const allocatedCounts = (): Record<string, number> => {
  const prompt: string = JSON.parse((global.fetch as any).mock.calls[0][1].body).parts.map((p: any) => p.text ?? '').join('\n');
  const block = prompt.split('FRAGETYPEN-VERTEILUNG')[1].split('ALLGEMEINE REGELN')[0];
  const counts: Record<string, number> = {};
  for (const m of block.matchAll(/^- (\d+) .*?\(type "([a-z_]+)"\)/gm)) counts[m[2]] = Number(m[1]);
  return counts;
};
const sum = (c: Record<string, number>) => Object.values(c).reduce((s, n) => s + n, 0);

describe('generateFullExam — Aufgabentyp-Verteilung', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue(respondEmpty());
  });

  it('verteilt bei weniger Aufgaben als Typen exakt die geforderte Anzahl (kein Widerspruch im Prompt)', async () => {
    await generateFullExam({ text: 'Material' }, undefined, { count: 5, difficulty: 'mittel' });
    const counts = allocatedCounts();
    expect(sum(counts)).toBe(5);
  });

  it('gibt jedem gewählten Typ mindestens eine Aufgabe, wenn genug Aufgaben da sind', async () => {
    await generateFullExam({ text: 'Material' }, undefined, { count: 10, difficulty: 'mittel', types: ['mc', 'open', 'truefalse'] });
    const counts = allocatedCounts();
    expect(sum(counts)).toBe(10);
    expect(Object.keys(counts).sort()).toEqual(['mc', 'open', 'truefalse']);
    expect(Object.values(counts).every(n => n >= 1)).toBe(true);
  });

  it('bleibt bei großen Klausuren exakt bei der Gesamtzahl', async () => {
    await generateFullExam({ text: 'Material' }, undefined, { count: 20, difficulty: 'mittel' });
    const counts = allocatedCounts();
    expect(sum(counts)).toBe(20);
    expect(Object.keys(counts)).toHaveLength(7);
  });
});

describe('generateFullExam — Transferaufgaben (08.10.2026)', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue(respondEmpty());
  });

  it('MC, Transfer und Freitext: Transfer erscheint als eigener Block, Schema kennt nur echte Typen', async () => {
    await generateFullExam({ text: 'Material' }, undefined, { count: 10, difficulty: 'mittel', types: ['mc', 'transfer', 'open'] });
    const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
    const prompt: string = body.parts.map((p: any) => p.text ?? '').join('\n');
    const block = prompt.split('FRAGETYPEN-VERTEILUNG')[1].split('ALLGEMEINE REGELN')[0];
    const transfer = Number(block.match(/^- (\d+) Transferaufgabe/m)?.[1]);
    const mc = Number(block.match(/^- (\d+) MC/m)?.[1]);
    const open = Number(block.match(/^- (\d+) Freitext/m)?.[1]);
    expect(transfer).toBeGreaterThanOrEqual(2);
    expect(mc + transfer + open).toBe(10);
    expect(block).not.toMatch(/Zuordnung|Lückentext|Sortierung|Wahr\/Falsch|Numerisch/);
    expect(body.config.responseSchema.items.properties.type.enum.sort()).toEqual(['mc', 'open']);
  });
});
