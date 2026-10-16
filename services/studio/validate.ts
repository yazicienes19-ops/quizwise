import type { Block, Cite, Issue, SourcePart, Unit } from './types';
import { authorYears, blockTexts, extractFacts, hasFact, INLINE_CITE_RE, isTruncatedPrefix, looksTruncated, resultWords, unbalanced } from './text';
import { summaryCorridor } from './outline';

/**
 * Schritt D1: Prüfregeln als reiner Code (Abschnitt 1.4 des Auftrags).
 * Jede Regel liefert Beanstandungen; die Pipeline repariert die betroffenen
 * Kapitel einmal und zeigt, was danach bleibt, als Warnung am Ergebnis.
 */

export interface ValidationContext {
  /** Gewählte Quellen mit Seitenzahl (0 = ohne Seiten); parts = Vorlesungen einer zusammengefügten PDF. */
  sources: { docId: string; name: string; pageCount: number; parts?: SourcePart[] }[];
  units: Unit[];
  omittedSources: { sourceId: string; reason: string; part?: SourcePart }[];
  /** Seiten je Quelle, die in die Zusammenfassung gehören (gewählt, nicht doppelt); fehlt = alle. */
  wantedPages?: Map<string, Set<number>>;
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

/**
 * 2. Abdeckung: jede Quelle zitiert oder begründet ausgelassen. Bei einer
 * zusammengefügten PDF gilt das je Vorlesung (Gliederungseintrag), sonst
 * fiele eine fehlende Vorlesung nicht auf (Testlauf 16.10.: eine Sammeldatei).
 */
export const checkCoverage = (blocks: Block[], ctx: ValidationContext): Issue[] => {
  const cites = blocks.flatMap(allCites);
  const cited = new Set(cites.map(c => c.sourceId));
  const omitted = new Set(ctx.omittedSources.filter(o => !o.part).map(o => o.sourceId));
  const issues: Issue[] = [];
  for (const s of ctx.sources) {
    if (omitted.has(s.docId)) continue;
    if (!cited.has(s.docId)) {
      issues.push({ rule: 'coverage', sourceId: s.docId, message: `„${s.name}“ kommt in der Zusammenfassung nicht vor.` });
      continue;
    }
    for (const part of s.parts ?? []) {
      const wanted = ctx.wantedPages?.get(s.docId);
      if (wanted && ![...wanted].some(p => p >= part.from && p <= part.to)) continue;
      if (ctx.omittedSources.some(o => o.sourceId === s.docId && o.part?.from === part.from)) continue;
      if (cites.some(c => c.sourceId === s.docId && c.page >= part.from && c.page <= part.to)) continue;
      issues.push({ rule: 'coverage', sourceId: s.docId, part, message: `„${part.title}“ (in „${s.name}“) kommt in der Zusammenfassung nicht vor.` });
    }
  }
  return issues;
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

/**
 * 6. Kein abgeschnittener Text: Auslassungspunkte mitten im Wort, offene
 * Klammern/Anführungszeichen, oder der Anfang eines Einheitentexts, dessen
 * Satz in der Quelle weitergeht (Testlauf 16.10.: "…zieht dies automatisch.").
 */
export const checkTruncated = (blocks: Block[], units: Unit[] = []): Issue[] => {
  const unitTexts = units.map(u => u.text);
  // Zeitleiste: je Eintrag nur der Text (Jahr und Autor davor verdecken sonst den Satzanfang).
  return blocks.flatMap(b => (b.type === 'timeline' ? b.items.map(i => i.what) : blockTexts(b)).filter(Boolean).flatMap(t => {
    const why = looksTruncated(t) ? 'bricht mitten im Wort ab'
      : unbalanced(t) ? 'hat eine offene Klammer oder ein offenes Anführungszeichen'
      : isTruncatedPrefix(t, unitTexts) ? 'endet mitten im Satz der Quelle'
      : null;
    return why ? [{ rule: 'truncated' as const, blockId: b.id, message: `Text ${why}: „${t.slice(-50)}“.` }] : [];
  }));
};

/** a) Keine Überschrift ohne Inhalt bis zur nächsten gleich- oder höherrangigen Überschrift. */
export const checkEmptyHeadings = (blocks: Block[]): Issue[] => {
  const issues: Issue[] = [];
  blocks.forEach((b, i) => {
    if (b.type !== 'heading') return;
    let content = false;
    for (let j = i + 1; j < blocks.length; j++) {
      const n = blocks[j];
      if (n.type === 'heading' && n.level <= b.level) break;
      if (n.type !== 'heading') { content = true; break; }
    }
    if (!content) issues.push({ rule: 'empty_heading', blockId: b.id, message: `Die Überschrift „${b.text}“ hat keinen Inhalt.` });
  });
  return issues;
};

/** Inhaltliche Einheiten, die in einem Abschnitt vorkommen müssen. */
export const CONTENT_TYPES = new Set(['definition', 'concept', 'study', 'finding', 'comparison']);
export const SECTION_COVERAGE_MIN = 0.7;

/** Anteil der inhaltlichen Einheiten, die die Blöcke über unitIds aufnehmen (1, wenn es keine gibt). */
export const unitCoverage = (unitIds: string[], blocks: Block[], units: Map<string, Unit>): { ratio: number; missing: string[] } => {
  const content = unitIds.filter(id => CONTENT_TYPES.has(units.get(id)?.type ?? ''));
  if (!content.length) return { ratio: 1, missing: [] };
  const used = new Set(blocks.flatMap(b => b.unitIds ?? []));
  const missing = content.filter(id => !used.has(id));
  return { ratio: (content.length - missing.length) / content.length, missing };
};

/**
 * b) Abdeckung je Gliederungsabschnitt: mindestens 70 % der zugewiesenen
 * inhaltlichen Einheiten (definition, concept, study, finding, comparison)
 * werden von den Blöcken des Kapitels aufgenommen.
 */
export const checkSectionCoverage = (
  sections: { title: string; unitIds: string[] }[],
  blocks: Block[],
  units: Map<string, Unit>,
  chapterBlockId: string,
): Issue[] => sections.flatMap(sec => {
  const { ratio, missing } = unitCoverage(sec.unitIds, blocks, units);
  return ratio >= SECTION_COVERAGE_MIN ? [] : [{
    rule: 'section_coverage' as const, blockId: chapterBlockId,
    message: `Abschnitt „${sec.title}“ deckt nur ${Math.round(ratio * 100)} % seines Stoffs ab. Nimm diese Einheiten auf: ${missing.join(', ')}.`,
  }];
});

const yearOk = (y: number | undefined) => y === undefined || (Number.isInteger(y) && y >= 1850 && y <= 2100);

/** c) Studien brauchen Aufbau und Ergebnis; Jahre (Studie, Zeitleiste) liegen zwischen 1850 und 2100. */
export const checkStudies = (blocks: Block[]): Issue[] =>
  blocks.flatMap((b): Issue[] => {
    if (b.type === 'timeline') {
      const bad = b.items.find(i => !yearOk(i.year));
      return bad ? [{ rule: 'study_incomplete', blockId: b.id, message: `Unmögliche Jahreszahl in der Zeitleiste: ${bad.year}.` }] : [];
    }
    if (b.type !== 'study') return [];
    const out: Issue[] = [];
    if (!yearOk(b.year)) out.push({ rule: 'study_incomplete', blockId: b.id, message: `Die Studie „${b.authors}“ hat eine unmögliche Jahreszahl (${b.year}).` });
    if (!b.design || !b.result) out.push({ rule: 'study_incomplete', blockId: b.id, message: `Die Studie „${b.authors}“ hat ${!b.design && !b.result ? 'weder Aufbau noch Ergebnis' : !b.design ? 'keinen Aufbau' : 'kein Ergebnis'}.` });
    return out;
  });

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
  ...checkTruncated(blocks, ctx.units),
  ...checkEmptyHeadings(blocks),
  ...checkStudies(blocks),
  ...checkCiteDensity(blocks),
  ...checkKiFacts(blocks, ctx),
];
