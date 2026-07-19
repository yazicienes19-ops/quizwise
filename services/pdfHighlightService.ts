// Zitat → Koordinaten: findet die Textstelle eines Erklärer-Zitats in den
// pdf.js-Textfragmenten einer Seite und liefert Markierungs-Rechtecke in
// Seiten-Koordinaten (scale 1). Whitespace-tolerant, weil Zitate der KI und
// pdf.js-Fragmentierung nie exakt dieselben Umbrüche haben.
import type { PositionedTextItem } from './pdfPageService';

export interface HighlightRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const normQuote = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

export function findQuoteRects(items: PositionedTextItem[], quote: string): HighlightRect[] | null {
  let q = normQuote(quote).replace(/^[„"']+|[“"']+$/g, '');
  if (q.length < 4) return null;

  // Normalisierten Seitentext aufbauen; jede Position zeigt zurück auf (Item, Zeichen).
  let page = '';
  const map: { item: number; char: number }[] = [];
  items.forEach((it, idx) => {
    for (let c = 0; c < it.str.length; c++) {
      const ch = it.str[c];
      if (/\s/.test(ch)) {
        if (!page || page.endsWith(' ')) continue;
        page += ' ';
        map.push({ item: idx, char: c });
      } else {
        page += ch.toLowerCase();
        map.push({ item: idx, char: c });
      }
    }
    // Fragmentgrenze wirkt wie ein Leerzeichen (pdf.js trennt mitten im Satz)
    if (page && !page.endsWith(' ')) {
      page += ' ';
      map.push({ item: idx, char: Math.max(0, it.str.length - 1) });
    }
  });

  let start = page.indexOf(q);
  if (start < 0 && q.length > 60) {
    // Lange Zitate: Anfang reicht zum Verorten (KI paraphrasiert manchmal das Ende)
    const prefix = q.slice(0, 60).replace(/\s+\S*$/, '');
    if (prefix.length >= 12) {
      q = prefix;
      start = page.indexOf(q);
    }
  }
  if (start < 0) return null;
  const end = Math.min(start + q.length - 1, map.length - 1);

  // Pro getroffenem Item den Zeichenbereich sammeln → Teil-Rechtecke
  const ranges = new Map<number, { from: number; to: number }>();
  for (let i = start; i <= end; i++) {
    const m = map[i];
    if (!m) break;
    const r = ranges.get(m.item);
    if (!r) ranges.set(m.item, { from: m.char, to: m.char });
    else {
      r.from = Math.min(r.from, m.char);
      r.to = Math.max(r.to, m.char);
    }
  }

  const rects: HighlightRect[] = [];
  for (const [idx, r] of ranges) {
    const it = items[idx];
    if (!it.str.trim() || it.w <= 0) continue;
    const len = Math.max(1, it.str.length);
    const x0 = it.x + (r.from / len) * it.w;
    const x1 = it.x + ((r.to + 1) / len) * it.w;
    rects.push({ x: x0, y: it.y, w: Math.max(2, x1 - x0), h: it.h });
  }
  return rects.length > 0 ? rects : null;
}
