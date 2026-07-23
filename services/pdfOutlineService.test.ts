import { describe, it, expect } from 'vitest';
import { parseHeadingPrefix, buildTocTree, detectHeadingCandidates } from './pdfOutlineService';
import type { PositionedTextItem } from './pdfPageService';

const item = (str: string, h: number): PositionedTextItem => ({ str, x: 0, y: 0, w: str.length * h * 0.5, h });

describe('parseHeadingPrefix', () => {
  it('erkennt Top-Level-Nummerierung ("2. Titel")', () => {
    expect(parseHeadingPrefix('2. Operante Konditionierung')).toEqual({ path: [2], title: 'Operante Konditionierung' });
  });

  it('erkennt Unterebenen ("2.1 Titel" / "2.1.1 Titel")', () => {
    expect(parseHeadingPrefix('2.1 Klassische Konditionierung')).toEqual({ path: [2, 1], title: 'Klassische Konditionierung' });
    expect(parseHeadingPrefix('2.1.1 Bedeutungstransfer')).toEqual({ path: [2, 1, 1], title: 'Bedeutungstransfer' });
  });

  it('liefert null ohne erkennbare Nummerierung', () => {
    expect(parseHeadingPrefix('Organisatorisches')).toBeNull();
    expect(parseHeadingPrefix('Lernpsychologie')).toBeNull();
  });

  it('liefert null bei Nummer ohne Titel dahinter', () => {
    expect(parseHeadingPrefix('2.1')).toBeNull();
    expect(parseHeadingPrefix('2.1   ')).toBeNull();
  });

  it('ignoriert führenden/nachfolgenden Whitespace', () => {
    expect(parseHeadingPrefix('  3. Modelllernen  ')).toEqual({ path: [3], title: 'Modelllernen' });
  });
});

describe('buildTocTree', () => {
  it('baut eine dreistufige Hierarchie aus numerierten Überschriften', () => {
    const tree = buildTocTree([
      { page: 8, title: '1. Lernen und Performanz' },
      { page: 10, title: '2.1 Klassische Konditionierung' },
      { page: 16, title: '2.1.1 Bedeutungstransfer und evaluative Konditionierung' },
      { page: 20, title: '2.2 Operante Konditionierung' },
    ]);
    expect(tree).toEqual([
      { title: 'Lernen und Performanz', page: 8, children: [] },
      {
        title: 'Klassische Konditionierung', page: 10,
        children: [{ title: 'Bedeutungstransfer und evaluative Konditionierung', page: 16, children: [] }],
      },
      { title: 'Operante Konditionierung', page: 20, children: [] },
    ]);
  });

  it('hängt einen zweiten Top-Level-Eintrag NICHT unter den ersten, wenn seine Tiefe gleich oder kleiner ist', () => {
    const tree = buildTocTree([
      { page: 1, title: '1. Einführung' },
      { page: 5, title: '2. Lernen' },
    ]);
    expect(tree.map(e => e.title)).toEqual(['Einführung', 'Lernen']);
    expect(tree[0].children).toEqual([]);
  });

  it('hängt "2.1" korrekt als NEUEN Top-Level-Zweig an, wenn "2." selbst nie als eigene Überschrift auftaucht (nicht fälschlich unter "1")', () => {
    const tree = buildTocTree([
      { page: 8, title: '1. Lernen und Performanz' },
      { page: 10, title: '2.1 Klassische Konditionierung' },
      { page: 20, title: '2.2 Operante Konditionierung' },
    ]);
    expect(tree.map(e => e.title)).toEqual(['Lernen und Performanz', 'Klassische Konditionierung', 'Operante Konditionierung']);
    expect(tree[0].children).toEqual([]);
  });

  it('springt korrekt von einer tiefen Ebene zurück auf eine höhere ("2.1.1" dann "2.2")', () => {
    const tree = buildTocTree([
      { page: 10, title: '2.1 Klassische Konditionierung' },
      { page: 16, title: '2.1.1 Bedeutungstransfer' },
      { page: 20, title: '2.2 Operante Konditionierung' },
    ]);
    expect(tree).toHaveLength(2);
    expect(tree[0].title).toBe('Klassische Konditionierung');
    expect(tree[0].children).toHaveLength(1);
    expect(tree[1].title).toBe('Operante Konditionierung');
    expect(tree[1].children).toEqual([]);
  });

  it('behandelt Einträge ohne Nummerierung als flache Top-Level-Einträge und bricht die aktuelle Verschachtelung ab', () => {
    const tree = buildTocTree([
      { page: 10, title: '2.1 Klassische Konditionierung' },
      { page: 12, title: 'Organisatorisches' },
      { page: 20, title: '2.1.1 Sollte NICHT unter 2.1 landen' },
    ]);
    expect(tree.map(e => e.title)).toEqual(['Klassische Konditionierung', 'Organisatorisches', 'Sollte NICHT unter 2.1 landen']);
    expect(tree[0].children).toEqual([]);
  });

  it('liefert eine leere Liste für eine leere Kandidatenliste', () => {
    expect(buildTocTree([])).toEqual([]);
  });
});

describe('detectHeadingCandidates', () => {
  const footerItems = () => [item('© Hochschule Fresenius', 10), item('Lernpsychologie', 10), item('12', 10)];

  it('erkennt eine großgeschriebene, textarme Folie als Titel-Kandidat', () => {
    const result = detectHeadingCandidates([
      { page: 1, items: [item('2.1 Klassische Konditionierung', 32), ...footerItems()] },
    ]);
    expect(result).toEqual([{ page: 1, title: '2.1 Klassische Konditionierung' }]);
  });

  it('erkennt eine textreiche Inhaltsfolie NICHT als Titel-Kandidat, auch mit großer Überschrift', () => {
    const longBody = Array.from({ length: 30 }, (_, i) => item(`Fließtext-Fragment Nummer ${i} mit echtem Inhalt.`, 14));
    const result = detectHeadingCandidates([
      { page: 5, items: [item('2.1 Klassische Konditionierung', 32), ...longBody] },
    ]);
    expect(result).toEqual([]);
  });

  it('fasst konsekutive Seiten mit demselben Titel zu einem Eintrag zusammen (Thema läuft über mehrere Folien)', () => {
    const result = detectHeadingCandidates([
      { page: 10, items: [item('2.1 Klassische Konditionierung', 32), ...footerItems()] },
      { page: 13, items: [item('2.1 Klassische Konditionierung', 32), ...footerItems()] },
      { page: 14, items: [item('2.1 Klassische Konditionierung', 32), ...footerItems()] },
      { page: 20, items: [item('2.2 Operante Konditionierung', 32), ...footerItems()] },
    ]);
    expect(result).toEqual([
      { page: 10, title: '2.1 Klassische Konditionierung' },
      { page: 20, title: '2.2 Operante Konditionierung' },
    ]);
  });

  it('ignoriert Seiten ohne jeden Text, statt abzustürzen', () => {
    expect(detectHeadingCandidates([{ page: 1, items: [] }])).toEqual([]);
  });

  it('erkennt keinen Kandidaten, wenn der Font kaum größer als der Rest der Seite ist (kein echter Größenkontrast)', () => {
    const result = detectHeadingCandidates([
      { page: 1, items: [item('Kurzer Titel', 15), item('Untertitel', 14)] },
    ]);
    expect(result).toEqual([]);
  });
});
