import type { Block, Cite, Issue, Unit } from './types';
import { authorYears, blockTexts, extractFacts, hasFact, INLINE_CITE_RE, looksTruncated, resultWords } from './text';
import { summaryCorridor } from './outline';

/**
 * Schritt D1: Prüfregeln als reiner Code (Abschnitt 1.4 des Auftrags).
 * Jede Regel liefert Beanstandungen; die Pipeline repariert die betroffenen
 * Kapitel einmal und zeigt, was danach bleibt, als Warnung am Ergebnis.
 */

export interface ValidationContext {
  /** Gewählte Quellen mit Seitenzahl (0 = ohne Seiten). */
  sources: { docId: string; name: string; pageCount: number }[];
  units: Unit[];
  omittedSources: { sourceId: string; reason: string }[];
  sourceWords: number;
}

const allCites = (b: Block): Cite[] => [
  ...b.cites,
  ...(b.type === 'bullets' || b.type === 'tasks' || b.type === 'timeline' ? b.items.flatMap(i => i.cites) : []),
];

/** 1. Zitate gültig: Quelle gewählt, Seite im Dokument. */
export const checkCites = (blocks: Block[], ctx: ValidationContext): Issue[] => {
  const pages = new Map(ctx.sources.map(s => [s.docId, s.pageCount]));
  const issues: Issue[] = [];
  for (const b of blocks) for (const c of allCites(b)) {
    const count = pages.get(c.sourceId);
    if (count === undefined) issues.push({ rule: 'cites', blockId: b.id, message: `Fußnote auf eine nicht gewählte Quelle (${c.sourceId}).` });
    else if (count > 0 ? !(c.page >= 1 && c.page <= count) : c.page !== 0) {
      issues.push({ rule: 'cites', blockId: b.id, message: `Fußnote auf Seite ${c.page}, die Quelle hat ${count} Seiten.` });
    }
  }
  return issues;
};

/** 2. Abdeckung: jede Quelle zitiert oder begründet ausgelassen. */
export const checkCoverage = (blocks: Block[], ctx: ValidationContext): Issue[] => {
  const cited = new Set(blocks.flatMap(allCites).map(c => c.sourceId));
  const omitted = new Set(ctx.omittedSources.map(o => o.sourceId));
  return ctx.sources
    .filter(s => !cited.has(s.docId) && !omitted.has(s.docId))
    .map(s => ({ rule: 'coverage' as const, sourceId: s.docId, message: `„${s.name}“ kommt in der Zusammenfassung nicht vor.` }));
};

/** 3. Länge im Zielkorridor (±10 % Toleranz). */
export const checkLength = (blocks: Block[], ctx: ValidationContext): Issue[] => {
  const words = resultWords(blocks);
  const { min, max } = summaryCorridor(ctx.sourceWords);
  if (words > max * 1.1) return [{ rule: 'length', message: `Zu lang: ${words} Wörter, Ziel höchstens ${max}.` }];
  if (words < min * 0.9) return [{ rule: 'length', message: `Zu kurz: ${words} Wörter, Ziel mindestens ${min}.` }];
  return [];
};

const textsWithCites = (b: Block): { text: string; cites: Cite[] }[] => {
  if (b.type === 'bullets' || b.type === 'tasks') return b.items.map(i => ({ text: i.text, cites: i.cites.length ? i.cites : b.cites }));
  if (b.type === 'timeline') return b.items.map(i => ({ text: `${i.year} ${i.what}`, cites: i.cites }));
  return blockTexts(b).map(text => ({ text, cites: b.cites }));
};

const unitsOn = (units: Unit[], cites: Cite[]) =>
  units.filter(u => cites.some(c => c.sourceId === u.sourceId && c.page === u.page));

const unitText = (u: Unit) => [u.title, u.text, u.study?.authors, u.study?.year, u.study?.design, u.study?.result, u.study?.conclusion].filter(Boolean).join(' ');

/** 4. Zahlen (%, Jahre, "x von y") stehen in den Einheiten der zitierten Seiten. */
export const checkNumbers = (blocks: Block[], ctx: ValidationContext): Issue[] => {
  const issues: Issue[] = [];
  for (const b of blocks) {
    if (b.origin !== 'quelle' || b.type === 'heading') continue;
    for (const { text, cites } of textsWithCites(b)) {
      if (!cites.length) continue;
      const evidence = unitsOn(ctx.units, cites).map(unitText).join(' ');
      for (const fact of extractFacts(text)) {
        if (!hasFact(fact, evidence)) issues.push({ rule: 'numbers', blockId: b.id, message: `„${fact}“ steht nicht auf den zitierten Seiten.` });
      }
    }
  }
  return issues;
};

/** 5. Autor–Jahr: ein Autor hat überall dasselbe Jahr wie in den Quellen; Zeitleiste sortiert. */
export const checkAuthorYears = (blocks: Block[], ctx: ValidationContext): Issue[] => {
  const issues: Issue[] = [];
  const known = new Map<string, Set<number>>();
  for (const u of ctx.units) for (const ay of authorYears(unitText(u))) {
    if (!known.has(ay.author)) known.set(ay.author, new Set());
    known.get(ay.author)!.add(ay.year);
  }
  for (const u of ctx.units) if (u.study?.authors && u.study.year) {
    const first = u.study.authors.match(/\p{Lu}[\p{L}'’-]+/u)?.[0];
    if (first) { if (!known.has(first)) known.set(first, new Set()); known.get(first)!.add(u.study.year); }
  }
  const seenInOutput = new Map<string, Set<number>>();
  for (const b of blocks) {
    const pairs = b.type === 'study'
      ? [...authorYears(`${b.authors} (${b.year})`), ...blockTexts(b).slice(1).flatMap(authorYears)]
      : blockTexts(b).flatMap(authorYears);
    for (const { author, year } of pairs) {
      const years = known.get(author);
      if (years && !years.has(year)) {
        issues.push({ rule: 'author_year', blockId: b.id, message: `${author} (${year}) passt nicht zur Quelle (${[...years].join(', ')}).` });
      }
      if (!seenInOutput.has(author)) seenInOutput.set(author, new Set());
      seenInOutput.get(author)!.add(year);
    }
    if (b.type === 'timeline') {
      for (let i = 1; i < b.items.length; i++) {
        if (b.items[i].year < b.items[i - 1].year) { issues.push({ rule: 'author_year', blockId: b.id, message: 'Zeitleiste ist nicht chronologisch sortiert.' }); break; }
      }
    }
  }
  for (const [author, years] of seenInOutput) {
    if (years.size > 1 && known.has(author)) issues.push({ rule: 'author_year', message: `${author} steht mit verschiedenen Jahren im Text (${[...years].join(', ')}).` });
  }
  return issues;
};

/** 6. Kein abgeschnittener Text. */
export const checkTruncated = (blocks: Block[]): Issue[] =>
  blocks.flatMap(b => blockTexts(b).filter(looksTruncated).map(t => ({
    rule: 'truncated' as const, blockId: b.id, message: `Text bricht mitten im Wort ab: „${t.slice(-40)}“.`,
  })));

/** 7. Zitatdichte: keine Quellenangaben als Klartext, höchstens 3 Fußnoten je Stichpunkt/Absatz. */
export const checkCiteDensity = (blocks: Block[]): Issue[] => {
  const issues: Issue[] = [];
  for (const b of blocks) {
    for (const t of blockTexts(b)) {
      if (INLINE_CITE_RE.test(t)) issues.push({ rule: 'cite_density', blockId: b.id, message: `Quellenangabe als Text: „${t.match(INLINE_CITE_RE)![0]}“.` });
    }
    const groups = b.type === 'bullets' || b.type === 'tasks' ? b.items.map(i => i.cites) : [b.cites];
    if (b.type !== 'table' && groups.some(g => g.length > 3)) issues.push({ rule: 'cite_density', blockId: b.id, message: 'Zu viele Fußnoten an einer Stelle (höchstens 3).' });
  }
  return issues;
};

/** 8. KI-Blöcke führen keine neuen Jahreszahlen, Prozentwerte oder Autor-Jahr-Angaben ein. */
export const checkKiFacts = (blocks: Block[], ctx: ValidationContext): Issue[] => {
  const evidence = ctx.units.map(unitText).join(' ');
  const issues: Issue[] = [];
  for (const b of blocks) {
    if (b.origin !== 'ki') continue;
    for (const t of blockTexts(b)) {
      for (const fact of extractFacts(t)) {
        if (!hasFact(fact, evidence)) issues.push({ rule: 'ki_facts', blockId: b.id, message: `KI-Erklärung bringt eine neue Angabe ein: „${fact}“.` });
      }
      for (const { author, year } of authorYears(t)) {
        issues.push({ rule: 'ki_facts', blockId: b.id, message: `KI-Erklärung nennt eine Quelle: „${author} (${year})“.` });
      }
    }
  }
  return issues;
};

export const validateResult = (blocks: Block[], ctx: ValidationContext): Issue[] => [
  ...checkCites(blocks, ctx),
  ...checkCoverage(blocks, ctx),
  ...checkLength(blocks, ctx),
  ...checkNumbers(blocks, ctx),
  ...checkAuthorYears(blocks, ctx),
  ...checkTruncated(blocks),
  ...checkCiteDensity(blocks),
  ...checkKiFacts(blocks, ctx),
];
