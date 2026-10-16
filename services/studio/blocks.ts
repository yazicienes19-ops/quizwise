import type { Block, CalloutVariant, Cite, Origin, Unit } from './types';

/**
 * Was das Modell beim Schreiben liefert: flache Blöcke (Gemini kennt keine
 * echten Unions), Belege als Einheiten-IDs statt Seitenzahlen. So kann eine
 * Fußnote nur auf eine Seite zeigen, aus der wirklich eine Einheit stammt
 * (Problem 3 der Ist-Analyse: alle Fußnoten auf Quelle 1).
 */
export interface RawBlock {
  type?: string;
  origin?: string;
  units?: string[];
  level?: number;
  text?: string;
  items?: { text?: string; units?: string[] }[];
  caption?: string;
  headers?: string[];
  rows?: { cells?: string[] }[];
  variant?: string;
  authors?: string;
  year?: number;
  design?: string;
  result?: string;
  conclusion?: string;
  figureRef?: string;
  question?: string;
  answer?: string;
}

const S = { type: 'STRING' } as const;
const STRS = { type: 'ARRAY', items: S } as const;

/** responseSchema für einen Schreib-Aufruf (Typen als Strings, wie @google/genai Type). */
export const writerSchema = (blockTypes: string[]) => ({
  type: 'OBJECT',
  properties: {
    blocks: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          type: { type: 'STRING', enum: blockTypes },
          origin: { type: 'STRING', enum: ['quelle', 'ki'] },
          units: STRS,
          level: { type: 'INTEGER' },
          text: S,
          items: { type: 'ARRAY', items: { type: 'OBJECT', properties: { text: S, units: STRS }, required: ['text'] } },
          caption: S,
          headers: STRS,
          rows: { type: 'ARRAY', items: { type: 'OBJECT', properties: { cells: STRS }, required: ['cells'] } },
          variant: { type: 'STRING', enum: ['merksatz', 'klausurfalle', 'hinweis', 'beispiel', 'einordnung'] },
          authors: S,
          year: { type: 'INTEGER' },
          design: S,
          result: S,
          conclusion: S,
          figureRef: S,
          question: S,
          answer: S,
        },
        required: ['type', 'origin'],
      },
    },
  },
  required: ['blocks'],
});

const VARIANTS: CalloutVariant[] = ['merksatz', 'klausurfalle', 'hinweis', 'beispiel', 'einordnung'];

const clean = (v: unknown): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

/** Einheiten-IDs → Fußnoten (je Quelle und Seite einmal, in Reihenfolge). */
export const citesFromUnits = (ids: unknown, byId: Map<string, Unit>): Cite[] => {
  const out: Cite[] = [];
  const seen = new Set<string>();
  for (const id of Array.isArray(ids) ? ids : []) {
    const u = typeof id === 'string' ? byId.get(id.trim()) : undefined;
    if (!u) continue;
    const key = `${u.sourceId}:${u.page}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ sourceId: u.sourceId, page: u.page });
  }
  return out;
};

export interface FigureRef { ref: string; sourceId: string; page: number; title: string }

/**
 * Rohblöcke prüfen und in Block-Typen überführen. Ungültige Blöcke fallen weg
 * (leerer Text, Tabelle ohne Zeilen, unbekannte Abbildung). IDs vergibt der Code.
 */
export const normalizeBlocks = (
  raw: unknown,
  byId: Map<string, Unit>,
  idPrefix: string,
  figures: FigureRef[] = [],
): Block[] => {
  const list = Array.isArray(raw) ? raw as RawBlock[] : [];
  const out: Block[] = [];
  const usedFigures = new Set<string>();
  list.forEach(r => {
    if (!r || typeof r !== 'object') return;
    const origin: Origin = r.origin === 'ki' ? 'ki' : 'quelle';
    const base = { id: `${idPrefix}${out.length + 1}`, origin, cites: origin === 'ki' ? [] : citesFromUnits(r.units, byId) };
    const text = clean(r.text);
    switch (r.type) {
      case 'heading': {
        if (!text) return;
        const level = r.level === 1 || r.level === 2 ? r.level : 3;
        out.push({ ...base, cites: [], type: 'heading', level, text });
        return;
      }
      case 'paragraph':
        if (text) out.push({ ...base, type: 'paragraph', text });
        return;
      case 'bullets': case 'tasks': {
        const items = (r.items ?? [])
          .map(i => ({ text: clean(i?.text), cites: origin === 'ki' ? [] : citesFromUnits(i?.units, byId) }))
          .filter(i => i.text);
        if (items.length) out.push({ ...base, type: r.type, items });
        return;
      }
      case 'table': {
        const headers = (r.headers ?? []).map(clean);
        const rows = (r.rows ?? []).map(row => (row?.cells ?? []).map(clean)).filter(row => row.some(Boolean));
        if (headers.length < 2 || !rows.length) return;
        const width = headers.length;
        out.push({
          ...base, type: 'table', headers,
          rows: rows.map(row => Array.from({ length: width }, (_, i) => row[i] ?? '')),
          ...(clean(r.caption) ? { caption: clean(r.caption) } : {}),
        });
        return;
      }
      case 'callout': {
        const variant = VARIANTS.includes(r.variant as CalloutVariant) ? r.variant as CalloutVariant : 'hinweis';
        // Beispiel und Einordnung ohne Beleg sind eigene Erklärhilfe, nie Vorlesungsinhalt.
        const kiOrigin = variant === 'einordnung' || (variant === 'beispiel' && !base.cites.length);
        if (text) out.push({ ...base, ...(kiOrigin ? { origin: 'ki', cites: [] } : {}), type: 'callout', variant, text });
        return;
      }
      case 'study': {
        const authors = clean(r.authors);
        const year = Number(r.year);
        if (!authors || !Number.isFinite(year)) return;
        out.push({
          ...base, type: 'study', authors, year: Math.round(year),
          design: clean(r.design), result: clean(r.result), conclusion: clean(r.conclusion),
        });
        return;
      }
      case 'figure': {
        const fig = figures.find(f => f.ref === clean(r.figureRef));
        if (!fig || usedFigures.has(fig.ref)) return;
        usedFigures.add(fig.ref);
        out.push({
          ...base, cites: [{ sourceId: fig.sourceId, page: fig.page }], type: 'figure',
          sourceId: fig.sourceId, page: fig.page, imageRef: fig.ref, title: fig.title,
          caption: clean(r.caption) || clean(r.text) || fig.title,
        });
        return;
      }
      case 'check': {
        const question = clean(r.question);
        const answer = clean(r.answer);
        if (question && answer) out.push({ ...base, type: 'check', question, answer });
        return;
      }
      default:
    }
  });
  return out;
};
