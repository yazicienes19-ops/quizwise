import type { Block, CalloutVariant, Cite, Origin, Unit } from './types';

/**
 * Was das Modell beim Schreiben liefert und wie der Code es prüft.
 *
 * Schema (Phase 1.1): je Blocktyp ein eigenes Unterobjekt mit festen
 * Pflichtfeldern und fester Reihenfolge (Text zuerst). Das alte flache Schema
 * mit allen Feldern für alle Typen und einem Zahlenfeld "year" ließ Argon und
 * 3.8 Flash im Live-Test (16.10.2026) Merksätze als {variant, year} ohne Text
 * und Studien ohne Aufbau/Ergebnis liefern; im Zahlenfeld liefen sie in
 * Ziffernschleifen (bis 32.000 Ziffern), danach fehlte der Rest des Kapitels.
 * Deshalb gibt es im Schema keine Zahlenfelder mehr: Jahre sind Text und der
 * Code akzeptiert nur 1850 bis 2100.
 *
 * Belege kommen als Einheiten-IDs statt Seitenzahlen. So kann eine Fußnote
 * nur auf eine Seite zeigen, aus der wirklich eine Einheit stammt.
 */

const S = { type: 'STRING' } as const;
const STRS = { type: 'ARRAY', items: S } as const;
const UNITS = { type: 'ARRAY', items: S, description: 'IDs der Einheiten, aus denen der Inhalt stammt (höchstens 3, bei study bis 5)' } as const;

const obj = (properties: Record<string, unknown>, required: string[]) => ({
  type: 'OBJECT', properties, required, propertyOrdering: Object.keys(properties),
});

export const CALLOUT_VARIANTS: CalloutVariant[] = ['merksatz', 'klausurfalle', 'hinweis', 'beispiel', 'einordnung', 'leitfrage', 'bruecke'];

const BLOCK_SCHEMAS: Record<string, unknown> = {
  heading: obj({ text: S }, ['text']),
  paragraph: obj({ text: S, units: UNITS }, ['text', 'units']),
  bullets: obj({ items: { type: 'ARRAY', items: obj({ text: S, units: UNITS }, ['text', 'units']) } }, ['items']),
  table: obj({
    caption: S,
    headers: STRS,
    rows: { type: 'ARRAY', items: obj({ cells: STRS, units: UNITS }, ['cells', 'units']) },
  }, ['headers', 'rows']),
  // „hinweis“ (blauer Kasten = Folienfehler) setzt nur der Code; das Schreibmodell bekommt ihn nicht angeboten.
  callout: obj({ variant: { type: 'STRING', enum: CALLOUT_VARIANTS.filter(v => v !== 'hinweis') }, text: S, units: UNITS }, ['variant', 'text', 'units']),
  study: obj({
    authors: S,
    year: { type: 'STRING', description: 'Jahr mit vier Ziffern, z. B. "1999"; leer lassen, wenn die Einheit keins nennt' },
    design: S, result: S, conclusion: S, units: UNITS,
  }, ['authors', 'design', 'result', 'units']),
  figure: obj({ figureRef: S, caption: S }, ['figureRef', 'caption']),
  check: obj({ question: S, answer: S, units: UNITS }, ['question', 'answer']),
};

/** responseSchema für einen Schreib-Aufruf (Typen als Strings, wie @google/genai Type). */
export const writerSchema = (blockTypes: string[]) => {
  const sub = Object.fromEntries(blockTypes.filter(t => BLOCK_SCHEMAS[t]).map(t => [t, BLOCK_SCHEMAS[t]]));
  return obj({
    blocks: {
      type: 'ARRAY',
      items: obj({ type: { type: 'STRING', enum: blockTypes }, origin: { type: 'STRING', enum: ['quelle', 'ki'] }, ...sub }, ['type', 'origin']),
    },
  }, ['blocks']);
};

/** Längster erlaubter Text eines Feldes; alles darüber gilt als Schleife (wie der Stream-Wächter). */
export const MAX_FIELD_CHARS = 1500;

/** Jahr aus Text oder Zahl: genau vier Ziffern, 1850 bis 2100, sonst undefined. */
export const parseYear = (v: unknown): number | undefined => {
  const s = typeof v === 'number' ? String(v) : typeof v === 'string' ? v.trim() : '';
  if (!/^\d{4}$/.test(s)) return undefined;
  const y = Number(s);
  return y >= 1850 && y <= 2100 ? y : undefined;
};

// Interne Einheiten-IDs wie „(u30)“ oder „(u3, u4)“ gehören nie in den Text.
const UNIT_REF = /\s*\((?:u\d+(?:,\s*)?)+\)/g;
const clean = (v: unknown): string => (typeof v === 'string' ? v.replace(UNIT_REF, '').replace(/\s+/g, ' ').trim() : '');

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

const knownIds = (ids: unknown, byId: Map<string, Unit>): string[] =>
  (Array.isArray(ids) ? ids : []).filter((id): id is string => typeof id === 'string' && byId.has(id.trim())).map(id => id.trim());

export interface FigureRef { ref: string; sourceId: string; page: number; title: string }

/** Verworfener Rohblock mit Grund (Protokoll je Kapitel). */
export interface DroppedBlock { type: string; reason: string }

type Raw = Record<string, unknown>;
const sub = (r: Raw, key: string): Raw => (r[key] && typeof r[key] === 'object' ? r[key] as Raw : {});
const arr = (v: unknown): Raw[] => (Array.isArray(v) ? v.filter((x): x is Raw => !!x && typeof x === 'object') : []);

/**
 * Rohblöcke prüfen und in Block-Typen überführen. Was nicht passt, fällt weg,
 * aber nie still: jeder verworfene Block steht mit Grund in `dropped`.
 * IDs vergibt der Code.
 */
export const normalizeBlocks = (
  raw: unknown,
  byId: Map<string, Unit>,
  idPrefix: string,
  figures: FigureRef[] = [],
): { blocks: Block[]; dropped: DroppedBlock[] } => {
  const list = arr(raw);
  const out: Block[] = [];
  const dropped: DroppedBlock[] = [];
  const usedFigures = new Set<string>();
  const drop = (type: string, reason: string) => { dropped.push({ type, reason }); };
  const tooLong = (...texts: string[]) => texts.some(t => t.length > MAX_FIELD_CHARS);

  for (const r of list) {
    const type = typeof r.type === 'string' ? r.type : '?';
    const d = sub(r, type);
    const origin: Origin = r.origin === 'ki' ? 'ki' : 'quelle';
    const ids = knownIds(d.units, byId);
    const base = { id: `${idPrefix}${out.length + 1}`, origin, cites: origin === 'ki' ? [] : citesFromUnits(ids, byId), ...(ids.length ? { unitIds: ids } : {}) };
    let text = clean(d.text);
    if (!Object.keys(d).length) { drop(type, 'Unterobjekt fehlt'); continue; }
    switch (type) {
      case 'heading':
        if (!text) { drop(type, 'ohne Text'); break; }
        out.push({ ...base, cites: [], type: 'heading', level: 3, text });
        break;
      case 'paragraph':
        if (!text) { drop(type, 'ohne Text'); break; }
        if (tooLong(text)) { drop(type, 'Text zu lang'); break; }
        out.push({ ...base, type: 'paragraph', text });
        break;
      case 'bullets': {
        const rawItems = arr(d.items);
        const items = rawItems
          .map(i => ({ text: clean(i.text), ids: knownIds(i.units, byId) }))
          .filter(i => i.text && !tooLong(i.text));
        if (!items.length) { drop(type, rawItems.length ? 'Stichpunkte ohne Text' : 'ohne Stichpunkte'); break; }
        const all = [...new Set(items.flatMap(i => i.ids))];
        out.push({
          ...base, ...(all.length ? { unitIds: all } : {}), type: 'bullets',
          items: items.map(i => ({ text: i.text, cites: origin === 'ki' ? [] : citesFromUnits(i.ids, byId) })),
        });
        break;
      }
      case 'table': {
        const headers = (Array.isArray(d.headers) ? d.headers : []).map(clean);
        const rawRows = arr(d.rows).map(row => ({ cells: (Array.isArray(row.cells) ? row.cells : []).map(clean), ids: knownIds(row.units, byId) }))
          .filter(row => row.cells.some(Boolean));
        if (headers.length < 2) { drop(type, 'weniger als 2 Spalten'); break; }
        if (!rawRows.length) { drop(type, 'ohne Zeilen'); break; }
        if (tooLong(...rawRows.flatMap(row => row.cells))) { drop(type, 'Zelle zu lang'); break; }
        const width = headers.length;
        // Mehr Zellen als Spalten: das Modell hat einen Text auf mehrere Zellen verteilt (Leitfaden-Abnahme 17.10.:
        // „Begriff | Satz 1 | Satz 2“); der Rest wandert in die letzte Spalte, statt abgeschnitten zu werden.
        for (const row of rawRows) if (row.cells.length > width) row.cells = [...row.cells.slice(0, width - 1), row.cells.slice(width - 1).filter(Boolean).join(' ')];
        // Weniger Zellen als Spalten: aufgefüllt, aber gemeldet (Prüfregel table_shape).
        const badRows = rawRows.map((row, i) => (row.cells.length !== width ? `Zeile ${i + 1} hat ${row.cells.length} statt ${width} Zellen` : '')).filter(Boolean);
        const rowCites = rawRows.map(row => (origin === 'ki' ? [] : citesFromUnits(row.ids, byId)));
        const all = [...new Set([...ids, ...rawRows.flatMap(row => row.ids)])];
        const caption = clean(d.caption);
        out.push({
          ...base, ...(all.length ? { unitIds: all } : {}),
          // Ohne eigene Belege der Tabelle: alle Zeilenbelege (die Tabelle hat dann trotzdem eine Fußnote).
          cites: base.cites.length || origin === 'ki' ? base.cites : citesFromUnits(all, byId),
          type: 'table', headers,
          rows: rawRows.map(row => Array.from({ length: width }, (_, i) => row.cells[i] ?? '')),
          ...(rowCites.some(c => c.length) ? { rowCites } : {}),
          ...(caption ? { caption } : {}),
          ...(badRows.length ? { shapeError: badRows.join('; ') } : {}),
        });
        break;
      }
      case 'callout': {
        // Vom Modell geschriebene „hinweis“-Kästen sähen wie Folienfehler aus (Skript-Abnahme 17.10.: Rechenbeispiel
        // als blauer Hinweis auf Folie 26); sie werden Beispiele. Unbekannte Varianten ebenso.
        const variant = CALLOUT_VARIANTS.includes(d.variant as CalloutVariant) && d.variant !== 'hinweis' ? d.variant as CalloutVariant : 'beispiel';
        if (!text) { drop(`callout:${variant}`, 'ohne Text'); break; }
        if (tooLong(text)) { drop(`callout:${variant}`, 'Text zu lang'); break; }
        // Beispiel und Einordnung ohne Beleg sind eigene Erklärhilfe, nie Vorlesungsinhalt;
        // Leitfrage und Überleitung (Skript) sind Gliederungshilfe ohne Fußnote.
        // Klausurfallen nur aus Folieninhalt: eine Falle ohne Beleg wäre eine erfundene Prüfungsaussage.
        if (variant === 'klausurfalle' && (base.origin === 'ki' || !base.cites.length)) { drop('callout:klausurfalle', 'ohne Folienbeleg'); break; }
        // „A vs. B: woran man sie unterscheidet: …“ (Prompt-Vorlage mitgeschrieben) wird zu „A vs. B: …“.
        if (variant === 'klausurfalle') text = text.replace(/:\s*woran man (?:sie|beide) (?:unterscheidet|auseinanderhält)\s*:?\s*/i, ': ');
        const kiOrigin = variant === 'einordnung' || (variant === 'beispiel' && !base.cites.length);
        if (variant === 'leitfrage' || variant === 'bruecke') {
          out.push({ ...base, origin: 'quelle', cites: [], type: 'callout', variant, text });
          break;
        }
        out.push({ ...base, ...(kiOrigin ? { origin: 'ki' as const, cites: [] } : {}), type: 'callout', variant, text });
        break;
      }
      case 'study': {
        const authors = clean(d.authors);
        const fields = { design: clean(d.design), result: clean(d.result), conclusion: clean(d.conclusion) };
        if (!authors) { drop(type, 'ohne Autor'); break; }
        if (authors.length > 200 || tooLong(...Object.values(fields))) { drop(type, 'Text zu lang'); break; }
        // Jahr aus der belegten Einheit derselben Autoren, wenn das Modell sich vertippt (Leitfaden-Abnahme 17.10.:
        // „Li et al. (1911)“ statt 2011, die eine Reparatur behob es nicht).
        const first = authors.split(/[\s,&]+/)[0]?.toLowerCase();
        const fromUnit = ids.map(id => byId.get(id)?.study).find(st => st?.year && st.authors?.split(/[\s,&]+/)[0]?.toLowerCase() === first)?.year;
        const parsed = parseYear(d.year);
        const year = fromUnit && parsed !== fromUnit ? fromUnit : parsed;
        out.push({ ...base, type: 'study', authors, ...(year ? { year } : {}), ...fields });
        break;
      }
      case 'figure': {
        const fig = figures.find(f => f.ref === clean(d.figureRef));
        if (!fig) { drop(type, 'unbekannte Abbildung'); break; }
        if (usedFigures.has(fig.ref)) { drop(type, 'Abbildung doppelt'); break; }
        usedFigures.add(fig.ref);
        out.push({
          ...base, cites: [{ sourceId: fig.sourceId, page: fig.page }], type: 'figure',
          sourceId: fig.sourceId, page: fig.page, imageRef: fig.ref, title: fig.title,
          caption: clean(d.caption) || fig.title,
        });
        break;
      }
      case 'check': {
        const question = clean(d.question);
        const answer = clean(d.answer);
        if (!question || !answer) { drop(type, 'Frage oder Antwort fehlt'); break; }
        out.push({ ...base, type: 'check', question, answer });
        break;
      }
      default:
        drop(type, 'unbekannter Typ');
    }
  }
  return { blocks: out, dropped };
};
