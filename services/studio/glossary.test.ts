import { describe, it, expect } from 'vitest';
import type { Block, PipelineSource } from './types';
import type { StudioLlm, StudioLlmRequest } from './llm';
import { runSummaryPipeline, warningText } from './pipeline';
import { mergeGlossary } from './glossary';
import { checkGlossaryChapter } from './validate';

/** Phase A: Glossar über die Pipeline. Synthetische Daten, keine echten Folien, kein Netz. */

const table = (id: string, rows: [string, string, number][]): Block => ({
  id, origin: 'quelle', cites: [], type: 'table', headers: ['Begriff', 'Erklärung'],
  rows: rows.map(([t, e]) => [t, e]), rowCites: rows.map(([, , p]) => [{ sourceId: 'd', page: p }]),
});

describe('Glossar', () => {
  it('führt Kapitel alphabetisch zusammen, Umlaute unter dem Grundbuchstaben, doppelte Begriffe einmal mit allen Belegen', () => {
    const blocks: Block[] = [
      { id: 'c1-h', origin: 'quelle', cites: [], type: 'heading', level: 2, text: 'Kapitel 1' },
      table('c1-1', [['Reiz', 'Was einwirkt.', 1], ['Äquivalenz', 'Gleichwertigkeit.', 2]]),
      { id: 'c2-h', origin: 'quelle', cites: [], type: 'heading', level: 2, text: 'Kapitel 2' },
      table('c2-1', [['Abruf', 'Holen aus dem Speicher.', 5], ['reiz', 'Was von außen einwirkt.', 6]]),
      { id: 'c2-se3', origin: 'quelle', cites: [{ sourceId: 'd', page: 3 }], type: 'callout', variant: 'hinweis', text: 'Auf Folie 3: vermutlich vertauscht.' },
    ];
    const out = mergeGlossary(blocks);
    expect(out.map(b => (b.type === 'heading' ? `#${b.text}` : b.type === 'table' ? b.rows.map(r => r[0]).join(',') : b.type))).toEqual([
      '#A', 'Abruf,Äquivalenz', '#R', 'Reiz', '#Hinweise zu den Folien', 'callout',
    ]);
    const r = out.find(b => b.type === 'table' && b.rows[0][0] === 'Reiz');
    expect(r?.type === 'table' && r.rowCites?.[0].map(c => c.page)).toEqual([1, 6]);
  });

  it('Kapitelregel: jede Zeile belegt, Erklärung kurz, Begriffe vollständig, keiner doppelt', () => {
    const units = [
      { id: 'u1', sourceId: 'd', page: 1, type: 'definition' as const, text: 'Reiz: was einwirkt.' },
      { id: 'u2', sourceId: 'd', page: 2, type: 'concept' as const, text: 'Abruf: holen.' },
      { id: 'u3', sourceId: 'd', page: 3, type: 'study' as const, text: 'Studie zum Abruf.' },
    ];
    const t: Block = { ...table('c1-1', [['Reiz', 'Was einwirkt.', 1], ['Reiz', `${'sehr '.repeat(46)}lang`, 1]]), unitIds: ['u1'] };
    if (t.type === 'table') t.rowCites![1] = [];
    expect(checkGlossaryChapter(units, [t], 'c1-h').map(i => i.message)).toEqual([
      '„Reiz“ ohne Beleg: in "units" die Einheiten angeben.',
      'Erklärung zu „Reiz“ hat 47 Wörter, höchstens 45. Kürzer fassen.',
      '„Reiz“ steht doppelt. Eine Zeile je Begriff.',
      'Begriffe fehlen (je eine Zeile): u2.',
    ]);
  });

  it('Pipeline: nur Tabellen, keine Übungsfragen, keine Zeitleiste, Ergebnis alphabetisch', async () => {
    const calls: StudioLlmRequest[] = [];
    const llm: StudioLlm = async req => {
      calls.push(req);
      if (req.step === 'extract') return { units: [...req.prompt.matchAll(/\[Seite (\d+)\]\n([^\n]+)/g)].map(m => ({ page: Number(m[1]), type: 'concept', text: m[2] })) };
      if (req.step === 'outline') return { chapters: [{ title: 'Gedächtnis', sections: [{ title: 'A', unitIds: [...req.prompt.matchAll(/^(u\d+) \|/gm)].map(m => m[1]) }] }] };
      if (req.step === 'write') {
        const lines = [...req.prompt.matchAll(/^- (u\d+) \([^)]*\) (.+)$/gm)];
        return { blocks: [{ type: 'table', origin: 'quelle', table: { headers: ['Begriff', 'Erklärung'],
          rows: lines.map(m => ({ cells: [m[2].split(' ')[0], m[2]], units: [m[1]] })).reverse() } }] };
      }
      return { issues: [], errors: [], items: [] };
    };
    const source: PipelineSource = { docId: 'd', name: 'Gedächtnis', pageCount: 2, pages: ['Speicher hält Inhalte über die Zeit', 'Abruf holt Inhalte aus dem Speicher'] };
    const r = await runSummaryPipeline({ sources: [source], llm, format: 'glossar' });
    expect(calls.some(c => c.step === 'practice' || c.step === 'timeline')).toBe(false);
    expect(r.format).toBe('glossar');
    const rows = r.blocks.filter(b => b.type === 'table').flatMap(b => (b.type === 'table' ? b.rows.map(x => x[0]) : []));
    expect(rows).toEqual(['Abruf', 'Speicher']);
  });

  it('Hinweise für Nutzer ohne interne Einheiten-IDs', () => {
    expect(warningText({ rule: 'guide_structure', message: 'Begriffe fehlen (je eine Zeile): u5, u85.' })).toBe('2 Fachbegriffe der Folien fehlen als eigene Zeile.');
    expect(warningText({ rule: 'guide_structure', message: 'Begriffe fehlen in „Kernbegriffe“ (eigene Zeile) oder „Modelle und Abläufe“: u7.' })).toBe('Ein Fachbegriff der Folien fehlt als eigene Zeile.');
    expect(warningText({ rule: 'result_missing', message: 'Ergebnisse fehlen: 46%, 78% (u108); 31% (u9). Nimm jeden Wert einzeln und exakt auf.' })).toBe('Ergebniszahlen der Folien fehlen im Text: 46%, 78%; 31%.');
  });
});
