import type { Block, Cite, Unit } from './types';
import type { Chapter } from './outline';
import { GLOSSARY_TERMS_PROMPT, glossaryTermsSchema } from './prompts/glossary.v1';
import { STUDIO_TEMPERATURE, type StudioLlm } from './llm';

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
      // Sammeleinträge („Eigenschaften von …“) fallen weg; die einzelnen Begriffe stehen als eigene Zeilen da.
      if (COLLECTIVE_RE.test(term.replace(/\s*\(.*$/, ''))) return;
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
  // Gleicher Begriff mehrfach: erst ohne Zusatz, dann Zusätze ohne Jahr (Begriffsursprung, Synonym), dann Autoren nach Jahr.
  const rank = (term: string) => { const extra = term.match(/\(([^)]*)\)\s*$/)?.[1] ?? ''; return !extra ? 0 : /\b(1[89]|20)\d\d\b/.test(extra) ? 2 : 1; };
  const year = (term: string) => Number(term.match(/\b((?:1[89]|20)\d\d)\b/)?.[1] ?? 0);
  const sorted = [...rows.values()].sort((a, b) => termKey(a.term).localeCompare(termKey(b.term), 'de')
    || rank(a.term) - rank(b.term) || year(a.term) - year(b.term) || a.term.localeCompare(b.term, 'de'));
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

/** Teile eines Begriffs zum Vergleichen: Hauptteil und Klammerinhalte („Unabhängige Variable (UV)“ → beide). */
const termParts = (term: string): string[] => {
  // Endungen zählen nicht („Störvariablen“ = „Störvariable“).
  const key = (t: string) => t.replace(/\*\*/g, '').replace(/[-‐–\s/]+/g, ' ').trim().toLowerCase().split(' ').map(w => w.replace(/(?:en|n|s|e)$/, '')).join(' ');
  const inner = [...term.matchAll(/\(([^)]*)\)/g)].map(m => key(m[1])).filter(x => x && !/\b(1[89]|20)\d\d\b/.test(x));
  return [key(term.replace(/\s*\(.*$/, '')), ...inner].filter(Boolean);
};
/** Ob ein Glossareintrag einen Pflichtbegriff abdeckt (gleicher Hauptteil oder gleiche Abkürzung). */
export const coversTerm = (entry: string, required: string): boolean => {
  const a = termParts(entry);
  const b = termParts(required);
  // Pflichtbegriff mit Autor und Jahr („Lernen (Muster, 2010)“): der Eintrag muss den Autor nennen.
  const author = required.match(/\(([^)]*\b(?:1[89]|20)\d\d)[^)]*\)/)?.[1].split(/[\s,&]+/)[0];
  if (author && !entry.includes(author)) return false;
  // Gleicher Name, verschiedene Zusätze („Hypothese (H1)“, „Hypothese (H0)“): verschiedene Begriffe.
  if (a.length > 1 && b.length > 1 && !a.slice(1).some(x => b.slice(1).includes(x))) return false;
  return b.some(r => a.includes(r));
};

/**
 * Pflichtbegriffe je Kapitel (Glossar-Review 17.10.: Grundbegriffe wie Störvariable, Shadowing, H0 fehlten,
 * weil sie nur innerhalb größerer Einheiten erklärt werden). Ohne Ergebnis: leere Liste.
 */
export const buildGlossaryTerms = async (chapter: Chapter, units: Unit[], llm: StudioLlm): Promise<string[]> => {
  const byId = new Map(units.map(u => [u.id, u]));
  const own = chapter.sections.flatMap(s => s.unitIds).map(id => byId.get(id)).filter((u): u is Unit => !!u);
  if (!own.length) return [];
  // Ganzer Text der Einheit: Begriffe stehen oft weit hinten (Abnahme: bei 500 Zeichen fehlten mehrere).
  const lines = own.map(u => `- ${u.id} (${u.type}${u.illustrative ? ', Rechenbeispiel' : ''}) ${[u.title, u.text, u.study && [u.study.design, u.study.result, u.study.conclusion].filter(Boolean).join(' ')].filter(Boolean).join(': ').replace(/\s+/g, ' ').slice(0, 2000)}`);
  try {
    const raw = await llm({
      step: 'terms', prompt: `${GLOSSARY_TERMS_PROMPT}\n\n=== KAPITEL: ${chapter.title} ===\n${lines.join('\n')}`,
      schema: glossaryTermsSchema, heavy: true, temperature: STUDIO_TEMPERATURE.terms, maxOutputTokens: 4000,
    });
    const list = raw && typeof raw === 'object' && Array.isArray((raw as { terms?: unknown }).terms) ? (raw as { terms: { term?: unknown; units?: unknown }[] }).terms : [];
    const ids = new Set(own.map(u => u.id));
    const terms = list
      .filter(t => typeof t.term === 'string' && t.term.trim() && Array.isArray(t.units) && t.units.some(id => typeof id === 'string' && ids.has(id)))
      .map(t => (t.term as string).replace(/\s+/g, ' ').trim())
      .filter(t => !COLLECTIVE_RE.test(t.replace(/\s*\(.*$/, '')));
    return withCodeTerms(terms, own);
  } catch {
    return withCodeTerms([], own);
  }
};

/** Liste des Modells plus Begriffe, die der Folientext eindeutig als Begriff ausweist; ohne Doppelte. */
const withCodeTerms = (terms: string[], own: Unit[]): string[] => {
  const all = [...terms, ...codeTermCandidates(own)];
  return all.filter((t, i) => all.findIndex(x => coversTerm(x, t)) === i);
};

/**
 * Begriffe, die der Folientext selbst als Begriff kennzeichnet (Glossar-Abnahme 17.10.: die Begriffsliste des
 * Modells schwankte, H0/H1 und Hermeneutik fehlten in zwei von drei Läufen):
 * „Begriff (ABK)“, „Beschreibung (Begriff)“ mit einem einzelnen Fachwort in der Klammer, „A vs. B“.
 */
export const codeTermCandidates = (units: Unit[]): string[] => {
  const text = units.map(u => `${u.title ?? ''}. ${u.text}`).join(' ');
  const authors = new Set(units.flatMap(u => [u.study?.authors ?? '', ...(`${u.text}`.match(/\b[\p{Lu}][\p{L}]+(?=,? (?:et al\.?,? )?(?:\(|)(?:1[89]|20)\d\d)/gu) ?? [])]).flatMap(a => a.split(/[\s,&]+/)).filter(Boolean));
  const out: string[] = [];
  for (const m of text.matchAll(/([\p{Lu}][\p{L}-]{3,})\s*\(([A-Z]{1,5}\d?)\)/gu)) out.push(`${m[1]} (${m[2]})`);
  for (const m of text.matchAll(/\(([\p{Lu}][\p{Ll}-]{5,})\)/gu)) if (!authors.has(m[1])) out.push(m[1]);
  for (const m of text.matchAll(/([\p{Lu}][\p{L}-]{3,})\s+vs\.?\s+([\p{Lu}][\p{L}-]{3,})/gu)) out.push(m[1], m[2]);
  return out.filter(t => !COLLECTIVE_RE.test(t));
};

/** Sammelbegriffe („Eigenschaften von X“, „Physikalische Eigenschaften“): keine eigenen Glossareinträge. */
export const COLLECTIVE_RE = /^(?:(?:Eigenschaften|Merkmale|Arten|Formen|Aspekte|Bestandteile)\b|.*\b(?:Eigenschaften|Merkmale|Aspekte)$)/i;
