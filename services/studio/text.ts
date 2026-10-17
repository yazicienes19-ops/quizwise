import type { Block, Unit } from './types';

/** Wörter zählen (Fettdruck-Sterne und Satzzeichen zählen nicht). */
export const countWords = (text: string): number =>
  (text.replace(/\*\*/g, ' ').match(/[\p{L}\p{N}][\p{L}\p{N}'’.\-]*/gu) ?? []).length;

/** Alle Texte eines Blocks, wie sie der Leser sieht. */
export const blockTexts = (b: Block): string[] => {
  switch (b.type) {
    case 'heading': case 'paragraph': case 'callout': return [b.text];
    case 'bullets': case 'tasks': return b.items.map(i => i.text);
    case 'table': return [...(b.caption ? [b.caption] : []), ...b.headers, ...b.rows.flat()];
    case 'study': return [`${b.authors}${b.year ? ` (${b.year})` : ''}`, b.design, b.result, b.conclusion];
    case 'figure': return [b.caption];
    case 'timeline': return b.items.map(i => `${i.year} ${i.who} ${i.what}`);
    case 'check': return [b.question, b.answer];
  }
};

export const blockWords = (b: Block): number => blockTexts(b).reduce((s, t) => s + countWords(t), 0);
export const resultWords = (blocks: Block[]): number => blocks.reduce((s, b) => s + blockWords(b), 0);

/**
 * Zahlenangaben, die exakt stimmen müssen: Prozentwerte ("58 %", "58%", "58 Prozent"),
 * Jahreszahlen (1800 bis 2099) und "x von y". Normalisiert für den Vergleich.
 */
export const extractFacts = (text: string): string[] => {
  const out = new Set<string>();
  const t = text.replace(/ | /g, ' ');
  for (const m of t.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:%|Prozent\b)/g)) out.add(`${m[1].replace(',', '.')}%`);
  for (const m of t.matchAll(/(\d+)\s+von\s+(\d+)/g)) out.add(`${m[1]}/${m[2]}`);
  // Kennwerte wie "M = 75", "n = 25", "r = 1" (Rechenbeispiele sollen nicht als Befund durchrutschen).
  for (const m of t.matchAll(/\b([MNnr])\s*=\s*(\d+(?:[.,]\d+)?)/g)) out.add(`${m[1]}=${m[2].replace(',', '.')}`);
  for (const m of t.matchAll(/(?<![\d.,])(1[89]\d\d|20\d\d)(?![\d.,]|\s*%)/g)) out.add(m[1]);
  return [...out];
};

/** Ob ein Fakt (aus extractFacts) im Text vorkommt, unabhängig von der Schreibweise. */
export const hasFact = (fact: string, text: string): boolean => extractFacts(text).includes(fact);

/**
 * Klammern oder Anführungszeichen, die geöffnet, aber nicht geschlossen werden
 * ("Input (z.B."). Nur mehr öffnende als schließende zählen: Abschneiden
 * lässt immer etwas offen, Aufzählungen wie "a)" haben dagegen nur die
 * schließende Klammer.
 */
export const unbalanced = (text: string): boolean => {
  const count = (re: RegExp) => (text.match(re) ?? []).length;
  return count(/\(/g) > count(/\)/g)
    || count(/\[/g) > count(/\]/g)
    || count(/„/g) > count(/[“”]/g)
    || count(/"/g) % 2 === 1;
};

const prefixNorm = (t: string) => t.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

const WORD_RE = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;
const words = (t: string) => t.match(WORD_RE) ?? [];

/**
 * Ausgabetext, der aus einer Einheit kopiert wurde und dort mitten im Satz
 * endet: abgeschnitten ("…zieht dies automatisch." aus "…zieht dies
 * automatisch Aufmerksamkeit auf sich."). Erkannt am Ende (die letzten 4
 * Wörter stehen so in der Einheit, danach geht der Satz ohne Satzzeichen
 * weiter) und am Anfang (die ersten 4 Wörter stehen ebenfalls darin, es ist
 * also eine Kopie und keine eigene Formulierung). Wer nur den ersten Satz
 * übernimmt, ist nicht betroffen: dort folgt in der Einheit ein Satzende.
 */
export const isTruncatedPrefix = (text: string, unitTexts: string[]): boolean => {
  // Eine Frage ist vollständig, auch wenn die Einheit danach weitergeht (Übungsfragen aus einem Beispiel).
  if (/[?!]["“”»]?\s*$/.test(text.trim())) return false;
  const out = words(prefixNorm(text));
  if (out.length < 8) return false;
  const tail = out.slice(-4);
  const head = out.slice(0, 4).join(' ');
  return unitTexts.some(u => {
    const norm = prefixNorm(u);
    const ws = [...norm.matchAll(WORD_RE)];
    const flat = ws.map(m => m[0]);
    if (!flat.join(' ').includes(head)) return false;
    for (let i = 0; i + tail.length < flat.length; i++) {
      if (!tail.every((w, k) => flat[i + k] === w)) continue;
      const last = ws[i + tail.length - 1];
      const next = ws[i + tail.length];
      const gap = norm.slice(last.index! + last[0].length, next.index);
      if (!/[.!?:;…]/u.test(gap)) return true;
    }
    return false;
  });
};

/** Endet mitten im Wort auf Auslassungspunkte ("…fehlinterp…", "Helligk...")? */
export const looksTruncated = (text: string): boolean => /\p{L}(?:…|\.\.\.)\s*$/u.test(text.trim());

/** Quellenangaben als Klartext, die nicht in den Text gehören ("[1, S. 94]", "[2:14]", "(S. 12)"). */
export const INLINE_CITE_RE = /\[\s*\d+\s*(?:[,:;]\s*(?:S\.\s*)?\d+[^\]]*)?\]|\(\s*S\.\s*\d+[^)]*\)|\[\s*Quelle\s*\d+[^\]]*\]/;

/**
 * Vollständige Quellenangaben im Text: "Simons & Levin (1998)", "Li et al., 2011",
 * "(Moray, 1959)". authors = Angabe wie geschrieben, first = erster Nachname.
 */
export const citationsIn = (text: string, opts: { loose?: boolean } = {}): { authors: string; first: string; year: number }[] => {
  const out: { authors: string; first: string; year: number }[] = [];
  // loose: auch ohne Klammer oder Komma ("Allport 1987", "Johnston und Heinz 1978"), wie Folien oft
  // zitieren. Nur für Quellentexte: im Ausgabetext wäre "Jahr 2011" sonst eine Quellenangabe.
  const re = opts.loose
    ? /(\p{Lu}[\p{L}'’-]+(?:\s+(?:&|und)\s+\p{Lu}[\p{L}'’-]+)?(?:\s+et\s+al\.?)?)\s*(?:\(\s*|,\s*|\s)((?:1[89]|20)\d\d)\b/gu
    : /(\p{Lu}[\p{L}'’-]+(?:\s+(?:&|und)\s+\p{Lu}[\p{L}'’-]+)?(?:\s+et\s+al\.?)?)\s*(?:\(\s*|,\s*)((?:1[89]|20)\d\d)\b/gu;
  for (const m of text.matchAll(re)) {
    const year = Number(m[2]);
    if (year < 1850 || year > 2100) continue;
    out.push({ authors: m[1].replace(/\s+/g, ' ').trim(), first: m[1].match(/\p{Lu}[\p{L}'’-]+/u)![0], year });
  }
  return out;
};

/** Autor-Jahr-Angaben im Text: "Treisman (1964)", "Simons & Levin (1998)", "Li et al., 2011". */
export const authorYears = (text: string): { author: string; year: number }[] => {
  const out: { author: string; year: number }[] = [];
  const re = /(\p{Lu}[\p{L}'’-]+)(?:\s+(?:&|und)\s+\p{Lu}[\p{L}'’-]+)?(?:\s+et\s+al\.?)?\s*(?:\(\s*|,\s*)((?:1[89]|20)\d\d)\b/gu;
  for (const m of text.matchAll(re)) out.push({ author: m[1], year: Number(m[2]) });
  return out;
};

/** Namen, die auf den Folien in zwei Schreibweisen stehen (ein Buchstabe Unterschied), mit Häufigkeit. */
export const nameVariants = (units: Pick<Unit, 'title' | 'text' | 'study'>[]): { forms: [string, string]; counts: [number, number] }[] => {
  const counts = new Map<string, number>();
  for (const u of units) for (const w of `${u.title ?? ''} ${u.text} ${u.study?.authors ?? ''}`.match(/\b[\p{Lu}][\p{Ll}]{4,}\b/gu) ?? []) counts.set(w, (counts.get(w) ?? 0) + 1);
  const words = [...counts.keys()];
  const oneEdit = (a: string, b: string) => {
    if (Math.abs(a.length - b.length) > 1 || a === b) return false;
    let i = 0; let j = 0; let diff = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++diff > 1) return false;
      if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
    }
    return diff + (a.length - i) + (b.length - j) <= 1;
  };
  // Nur Namen: Formen, die als Autor mit Jahr vorkommen; gewöhnliche Wörter mit Flexion („Theorie“/„Theorien“) nicht.
  const authorish = new Set(units.flatMap(u => citationsIn(`${u.title ?? ''} ${u.text}`, { loose: true }).map(c => c.first)));
  const out: { forms: [string, string]; counts: [number, number] }[] = [];
  for (let x = 0; x < words.length; x++) for (let y = x + 1; y < words.length; y++) {
    const [a, b] = [words[x], words[y]];
    if ((authorish.has(a) || authorish.has(b)) && oneEdit(a, b) && !/(?:en|n|s|e)$/.test(a.replace(b, '')) && !/(?:en|n|s|e)$/.test(b.replace(a, ''))) {
      out.push({ forms: [a, b], counts: [counts.get(a)!, counts.get(b)!] });
    }
  }
  return out;
};


/**
 * Schrittfolgen aus Folienserien: mindestens 3 Einheiten (aufsteigende Seiten derselben Quelle) mit Titeln
 * „Ablauf - Schritt“. Die Reihenfolge der Seiten ist die Reihenfolge der Schritte (Review 17.10.: eine
 * Abbildungsbeschreibung stellte den Forschungskreislauf um, die Folien 32 bis 39 zeigen ihn Schritt für Schritt).
 */
export const slideSequences = (units: Pick<Unit, 'sourceId' | 'page' | 'title'>[]): { sourceId: string; name: string; steps: string[]; from: number; to: number }[] => {
  const groups = new Map<string, { page: number; step: string }[]>();
  for (const u of units) {
    const m = u.title?.match(/^(.{4,80}?)\s+[-–]\s+(.{2,80})$/);
    // Studientitel („Autor (Jahr) - Befund“) sind keine Abläufe.
    if (!m || !u.page || /\b(1[89]|20)\d\d\b/.test(m[1])) continue;
    const k = `${u.sourceId}\u0000${m[1].trim()}`;
    groups.set(k, [...(groups.get(k) ?? []), { page: u.page, step: m[2].trim() }]);
  }
  return [...groups].flatMap(([k, list]) => {
    const steps = [...new Map(list.sort((a, b) => a.page - b.page).map(x => [x.step.toLowerCase(), x])).values()];
    return steps.length >= 3 ? [{ sourceId: k.split('\u0000')[0], name: k.split('\u0000')[1], steps: steps.map(x => x.step), from: steps[0].page, to: steps[steps.length - 1].page }] : [];
  });
};

/**
 * Einheit, die einen Ablauf einer Folienserie in anderer Reihenfolge beschreibt (Review 17.10.: die Beschreibung
 * der Übersichtsabbildung stellte die Postulate vor die statistischen Hypothesen). Verglichen werden nur
 * eindeutige Schrittnamen (kein Schritt, der in einem anderen enthalten ist), Endungen zählen nicht.
 */
export const contradictsSequence = (text: string, steps: string[], minFound = 3): boolean => {
  const stem = (w: string) => w.toLowerCase().replace(/(?:en|n|e|s)$/, '');
  const tokens = (text.match(/[\p{L}\p{N}]+/gu) ?? []).map(stem);
  // Je Schritt sein längstes Wort („Postulate und neue Fragen“ → „postulat“); ein Schlüssel, der in einem anderen
  // steckt („beobachtung“ in „beobachtungshypothes“), ist nicht eindeutig und zählt nicht.
  const keys = steps.map(st => (st.match(/[\p{L}\p{N}]+/gu) ?? []).map(stem).sort((a, b) => b.length - a.length)[0] ?? '');
  const usable = keys.filter((k, i) => k.length >= 5 && !keys.some((o, j) => j !== i && o !== k && o.includes(k)));
  const pos = usable.map(k => tokens.indexOf(k)).filter(p => p >= 0);
  return pos.length >= minFound && pos.some((p, i) => i > 0 && p < pos[i - 1]);
};
