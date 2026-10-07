import { describe, it, expect } from 'vitest';
import { parseDiagram, splitDiagrams, diagramToText, hideDiagramsWhileStreaming } from './studioDiagrams';
import { checkCitations, buildStudioSources, toPlainExport } from './subjectStudio';
import type { ProcessedDocument } from '../types';

const flowJson = '{"type":"flow","title":"Emotionsregulation","steps":[{"label":"Situationsauswahl","cite":"1:261"},{"label":"Umdeutung","detail":"Bewertung ändern","cite":["1:263","9"]}]}';

describe('parseDiagram', () => {
  it('liest alle drei Typen und kappt zu lange Texte', () => {
    expect(parseDiagram(flowJson)).toMatchObject({ type: 'flow', title: 'Emotionsregulation', steps: [{ label: 'Situationsauswahl', cite: [{ n: 1, page: 261 }] }, { detail: 'Bewertung ändern' }] });
    const tree = parseDiagram('{"type":"tree","root":{"label":"Verstärkung","children":[{"label":"positiv","children":[{"label":"Lob"}]},{"label":"negativ"}]}}');
    expect(tree).toMatchObject({ type: 'tree', root: { label: 'Verstärkung', children: [{ label: 'positiv', children: [{ label: 'Lob' }] }, { label: 'negativ' }] } });
    const cmp = parseDiagram(`{"type":"compare","columns":[{"label":"Angst","points":["diffus"]},{"label":"Furcht","points":["${'x'.repeat(300)}"]}]}`);
    expect(cmp?.type).toBe('compare');
    expect((cmp as { columns: { points: string[] }[] }).columns[1].points[0].length).toBe(140);
  });

  it('verwirft kaputtes JSON, unbekannte Typen und zu dünne Grafiken', () => {
    expect(parseDiagram('{"type":"flow","steps":[{"label":"nur einer"}]}')).toBeNull();
    expect(parseDiagram('{"type":"tree","root":{"label":"A","children":[{"label":"B"}]}}')).toBeNull();
    expect(parseDiagram('{"type":"pie","steps":[]}')).toBeNull();
    expect(parseDiagram('{"type":"flow", steps: kaputt')).toBeNull();
  });
});

describe('Grafiken im Text', () => {
  const md = `Einleitung [1:2].\n\n\`\`\`diagram\n${flowJson}\n\`\`\`\n\nWeiter [1:3].\n\n\`\`\`diagram\n{kaputt}\n\`\`\``;

  it('zerlegt Text und Grafiken, kaputte verschwinden', () => {
    expect(splitDiagrams(md).map(s => s.type)).toEqual(['md', 'diagram', 'md']);
  });

  it('checkCitations prüft auch die Fußnoten in Grafiken und lässt das JSON heil', () => {
    const doc = { id: 'a', name: 'a', content: '', type: 'pdf', uploadDate: 0 } as ProcessedDocument;
    const { sources } = buildStudioSources([{ doc, pages: Array.from({ length: 262 }, (_, i) => `Seite ${i + 1}`) }]);
    const res = checkCitations(md, sources);
    const seg = splitDiagrams(res.markdown);
    expect(seg.map(s => s.type)).toEqual(['md', 'diagram', 'md']);
    const flow = (seg[1] as { diagram: { steps: { cite?: unknown }[] } }).diagram;
    // Seite 263 gibt es nicht (nur 262 Seiten) → nur Quelle; Quelle 9 gibt es nicht → weg.
    expect(flow.steps[1].cite).toEqual([{ n: 1 }]);
    expect(flow.steps[0].cite).toEqual([{ n: 1, page: 261 }]);
    expect(res.removed).toBe(1);
  });

  it('Export und Textfassung: Pfeile statt JSON', () => {
    const text = diagramToText(parseDiagram(flowJson)!);
    expect(text).toBe('**Emotionsregulation**\n\nSituationsauswahl [1:261]\n  ↓\nUmdeutung: Bewertung ändern [1:263, 9]');
    const out = toPlainExport('T', md, [{ n: 1, name: 'Skript' }]);
    expect(out).toContain('Situationsauswahl [1, S. 261]\n  ↓');
    expect(out).not.toContain('```');
  });

  it('blendet Grafiken beim Schreiben aus, auch angefangene', () => {
    expect(hideDiagramsWhileStreaming('A\n```diagram\n{"type":"fl')).toBe('A\n');
    expect(hideDiagramsWhileStreaming(md)).not.toContain('diagram');
  });
});

describe('Neue Grafiktypen', () => {
  it('Kurve: sortiert Punkte, braucht Achsen und mindestens 3 Punkte', () => {
    const c = parseDiagram('{"type":"curve","xLabel":"Erregung","yLabel":"Leistung","series":[{"label":"einfach","points":[[10,3],[0,1],[5,8]]},{"points":[[1,1]]}],"cite":"1:120"}');
    expect(c).toMatchObject({ type: 'curve', series: [{ label: 'einfach', points: [[0, 1], [5, 8], [10, 3]] }], cite: [{ n: 1, page: 120 }] });
    expect(parseDiagram('{"type":"curve","yLabel":"L","series":[{"points":[[0,1],[1,2],[2,3]]}]}')).toBeNull();
  });

  it('Vierfeldertafel: Zellen müssen zu Zeilen und Spalten passen', () => {
    const ok = '{"type":"matrix","rows":["internal","external"],"cols":["stabil","variabel"],"cells":[[{"label":"Fähigkeit"},{"label":"Anstrengung"}],[{"label":"Schwierigkeit"},{"label":"Zufall"}]]}';
    expect(parseDiagram(ok)).toMatchObject({ type: 'matrix', cells: [[{ label: 'Fähigkeit' }, { label: 'Anstrengung' }], [{ label: 'Schwierigkeit' }, { label: 'Zufall' }]] });
    expect(parseDiagram(ok.replace('{"label":"Zufall"}', ''))).toBeNull();
    expect(diagramToText(parseDiagram(ok)!)).toContain('- internal / stabil: Fähigkeit');
  });

  it('Kreislauf braucht 3 Schritte, Textfassung führt zum Anfang zurück', () => {
    const cy = parseDiagram('{"type":"cycle","steps":[{"label":"Angst"},{"label":"Vermeidung"},{"label":"Erleichterung"}]}')!;
    expect(diagramToText(cy)).toBe('Angst\n  ↓\nVermeidung\n  ↓\nErleichterung\n  ↺ Angst');
    expect(parseDiagram('{"type":"cycle","steps":[{"label":"A"},{"label":"B"}]}')).toBeNull();
  });

  it('Abbildung: erst Verweis, nach dem Ausschneiden Bild; Textfassung mit Seite', () => {
    expect(parseDiagram('{"type":"figure","ref":"A3","caption":"Aufbau"}')).toEqual({ type: 'figure', ref: 'A3', caption: 'Aufbau' });
    expect(parseDiagram('{"type":"figure","ref":"Bild 3"}')).toBeNull();
    const done = parseDiagram('{"type":"figure","image":"u/x.png","docId":"d","page":34,"title":"Auge","caption":"Querschnitt","cite":["1:34"]}')!;
    expect(diagramToText(done)).toBe('[Abbildung: Auge. Querschnitt [1:34]]');
  });
});

describe('VS-Gegenüberstellung', () => {
  const vs = '{"type":"versus","title":"Furcht vs. Angst","left":{"label":"Furcht","cite":"1:240"},"right":{"label":"Angst"},"rows":[{"aspect":"Auslöser","left":"konkrete Gefahr","right":"diffus"},{"aspect":"Dauer","left":"endet mit der Gefahr","right":"kann chronisch werden"},{"aspect":"kaputt","left":"nur links"}]}';
  it('liest beide Seiten und nur vollständige Zeilen', () => {
    const d = parseDiagram(vs);
    expect(d).toMatchObject({ type: 'versus', left: { label: 'Furcht', cite: [{ n: 1, page: 240 }] }, right: { label: 'Angst' } });
    expect((d as { rows: unknown[] }).rows).toHaveLength(2);
    expect(parseDiagram('{"type":"versus","left":{"label":"A"},"right":{"label":"B"},"rows":[{"aspect":"x","left":"a","right":"b"}]}')).toBeNull();
  });
  it('Textfassung stellt Merkmal für Merkmal gegenüber', () => {
    expect(diagramToText(parseDiagram(vs)!)).toBe('**Furcht vs. Angst**\n\nFurcht [1:240] vs. Angst\n- Auslöser: konkrete Gefahr | diffus\n- Dauer: endet mit der Gefahr | kann chronisch werden');
  });
});
