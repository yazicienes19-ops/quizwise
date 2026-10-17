import type { Block, Cite } from './types';

/**
 * Glossar: die Kapitel liefern je eine Tabelle Begriff | Erklärung; der Code führt alle Zeilen
 * zusammen, entfernt doppelte Begriffe (Belege werden vereint) und sortiert alphabetisch unter
 * Buchstaben-Überschriften. Folienfehler-Hinweise stehen am Ende in einem eigenen Abschnitt.
 */

type Row = { term: string; text: string; cites: Cite[] };

/** Sortier- und Vergleichsschlüssel: ohne Klammerzusatz, Bindestriche wie Leerzeichen, ohne Groß/klein. */
export const termKey = (term: string): string =>
  term.replace(/\*\*/g, '').replace(/\s*\(.*$/, '').replace(/[-‐–\s]+/g, ' ').trim().toLowerCase();

/** Buchstabe für die Überschrift; Umlaute zu ihrem Grundbuchstaben (Ä unter A), Ziffern unter „#“. */
const letterOf = (term: string): string => {
  const c = termKey(term).normalize('NFD').replace(/[̀-ͯ]/g, '').charAt(0).toUpperCase();
  return /[A-Z]/.test(c) ? c : '#';
};

export const mergeGlossary = (blocks: Block[]): Block[] => {
  const rows = new Map<string, Row>();
  const hints: Block[] = [];
  // Mehrere Definitionen eines Begriffs (je Autor) behalten den Autor im Begriff und bleiben eigene Zeilen.
  const keyOf = (term: string) => term.replace(/\*\*/g, '').replace(/[-‐–\s]+/g, ' ').trim().toLowerCase();
  for (const b of blocks) {
    if (b.type === 'callout' && b.variant === 'hinweis') { hints.push(b); continue; }
    if (b.type !== 'table') continue;
    b.rows.forEach((r, i) => {
      const term = (r[0] ?? '').trim();
      const text = r.slice(1).filter(Boolean).join(' ').trim();
      if (!term || !text) return;
      const cites = b.rowCites?.[i]?.length ? b.rowCites[i] : b.cites;
      const k = keyOf(term);
      const prev = rows.get(k);
      if (prev) {
        for (const c of cites) if (!prev.cites.some(x => x.sourceId === c.sourceId && x.page === c.page)) prev.cites.push(c);
        return;
      }
      rows.set(k, { term, text, cites: [...cites] });
    });
  }
  const sorted = [...rows.values()].sort((a, b) => termKey(a.term).localeCompare(termKey(b.term), 'de') || a.term.localeCompare(b.term, 'de'));
  // Ohne eigene Überschrift „Glossar“: der Titel des Ergebnisses sagt es schon.
  const out: Block[] = [];
  let letter = '';
  let group: Row[] = [];
  const flush = () => {
    if (!group.length) return;
    out.push({ id: `c1-g${letter}-h`, origin: 'quelle', cites: [], type: 'heading', level: 3, text: letter });
    out.push({
      id: `c1-g${letter}`, origin: 'quelle', cites: [], type: 'table', headers: ['Begriff', 'Erklärung'],
      rows: group.map(r => [r.term, r.text]), rowCites: group.map(r => r.cites),
    });
    group = [];
  };
  for (const r of sorted) {
    const l = letterOf(r.term);
    if (l !== letter) { flush(); letter = l; }
    group.push(r);
  }
  flush();
  if (hints.length) out.push({ id: 'x-hints-h', origin: 'quelle', cites: [], type: 'heading', level: 2, text: 'Hinweise zu den Folien' }, ...hints);
  return out;
};
