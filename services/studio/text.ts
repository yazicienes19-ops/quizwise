import type { Block } from './types';

/** Wörter zählen (Fettdruck-Sterne und Satzzeichen zählen nicht). */
export const countWords = (text: string): number =>
  (text.replace(/\*\*/g, ' ').match(/[\p{L}\p{N}][\p{L}\p{N}'’.\-]*/gu) ?? []).length;

/** Alle Texte eines Blocks, wie sie der Leser sieht. */
export const blockTexts = (b: Block): string[] => {
  switch (b.type) {
    case 'heading': case 'paragraph': case 'callout': return [b.text];
    case 'bullets': case 'tasks': return b.items.map(i => i.text);
    case 'table': return [...(b.caption ? [b.caption] : []), ...b.headers, ...b.rows.flat()];
    case 'study': return [`${b.authors} (${b.year})`, b.design, b.result, b.conclusion];
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
  for (const m of t.matchAll(/(?<![\d.,])(1[89]\d\d|20\d\d)(?![\d.,]|\s*%)/g)) out.add(m[1]);
  return [...out];
};

/** Ob ein Fakt (aus extractFacts) im Text vorkommt, unabhängig von der Schreibweise. */
export const hasFact = (fact: string, text: string): boolean => extractFacts(text).includes(fact);

/** Endet mitten im Wort auf Auslassungspunkte ("…fehlinterp…", "Helligk...")? */
export const looksTruncated = (text: string): boolean => /\p{L}(?:…|\.\.\.)\s*$/u.test(text.trim());

/** Quellenangaben als Klartext, die nicht in den Text gehören ("[1, S. 94]", "[2:14]", "(S. 12)"). */
export const INLINE_CITE_RE = /\[\s*\d+\s*(?:[,:;]\s*(?:S\.\s*)?\d+[^\]]*)?\]|\(\s*S\.\s*\d+[^)]*\)|\[\s*Quelle\s*\d+[^\]]*\]/;

/** Autor-Jahr-Angaben im Text: "Treisman (1964)", "Simons & Levin (1998)", "Li et al., 2011". */
export const authorYears = (text: string): { author: string; year: number }[] => {
  const out: { author: string; year: number }[] = [];
  const re = /(\p{Lu}[\p{L}'’-]+)(?:\s+(?:&|und)\s+\p{Lu}[\p{L}'’-]+)?(?:\s+et\s+al\.?)?\s*(?:\(\s*|,\s*)((?:1[89]|20)\d\d)\b/gu;
  for (const m of text.matchAll(re)) out.push({ author: m[1], year: Number(m[2]) });
  return out;
};
