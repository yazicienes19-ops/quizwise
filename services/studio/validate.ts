import type { Block, Cite, Issue, SourcePart, Unit } from './types';
import { authorYears, blockTexts, citationsIn, extractFacts, hasFact, INLINE_CITE_RE, isTruncatedPrefix, looksTruncated, resultWords, unbalanced } from './text';
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
  /** Rohtext einer Seite (mit Folientitel) als zusätzlicher Beleg für Zahlen und Quellenangaben. */
  pageText?: (sourceId: string, page: number) => string;
  sourceWords: number;
}

const allCites = (b: Block): Cite[] => [
  ...b.cites,
  ...(b.type === 'bullets' || b.type === 'tasks' || b.type === 'timeline' ? b.items.flatMap(i => i.cites) : []),
  ...(b.type === 'table' ? (b.rowCites ?? []).flat() : []),
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

/** Haupttext: die Kapitel (Blöcke c…), ohne Zeitleiste, Aufgaben, Übungsfragen und Klausurinfos. */
export const mainTextWords = (blocks: Block[]): number => resultWords(blocks.filter(b => b.id.startsWith('c')));

/**
 * 3. Länge im Zielkorridor (±10 % Toleranz), gemessen am Haupttext. Die
 * Abschnitte vom Code zählen nicht mit (Entscheidung 16.10.2026).
 */
export const checkLength = (blocks: Block[], ctx: ValidationContext): Issue[] => {
  const words = mainTextWords(blocks);
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
      const evidence = [...unitsOn(ctx.units, cites).map(unitText), ...cites.map(c => ctx.pageText?.(c.sourceId, c.page) ?? '')].join(' ');
      for (const fact of extractFacts(text)) {
        if (!hasFact(fact, evidence)) issues.push({ rule: 'numbers', blockId: b.id, message: `„${fact}“ steht nicht auf den zitierten Seiten.` });
      }
    }
  }
  return issues;
};

const normAuthor = (a: string) => a.toLowerCase().replace(/\bund\b/g, '&').replace(/\s+/g, ' ').replace(/\.$/, '').trim();

/**
 * 5. Autor–Jahr: jede Quellenangabe im Text (vollständige Autorenangabe +
 * Jahr) muss so in einer Einheit vorkommen. Derselbe Autor mit verschiedenen
 * Jahren ist erlaubt (Levin & Simons 1997 und Levin et al. 2000 sind zwei
 * Studien); gewarnt wird nur, wenn das Paar nirgends in den Quellen steht.
 * Dazu: Zeitleiste sortiert.
 */
export const checkAuthorYears = (blocks: Block[], ctx: ValidationContext): Issue[] => {
  const known = new Set<string>();
  const firstYears = new Set<string>();
  const pageTexts = ctx.pageText ? [...new Set(ctx.units.map(u => `${u.sourceId}\u0000${u.page}`))].map(k => { const [s, p] = k.split('\u0000'); return ctx.pageText!(s, Number(p)); }) : [];
  for (const t of pageTexts) for (const c of citationsIn(t, { loose: true })) { known.add(`${normAuthor(c.authors)}|${c.year}`); firstYears.add(`${c.first.toLowerCase()}|${c.year}`); }
  for (const u of ctx.units) {
    const pairs = [...citationsIn(unitText(u), { loose: true }), ...(u.study?.authors && u.study.year ? citationsIn(`${u.study.authors} (${u.study.year})`) : [])];
    for (const c of pairs) { known.add(`${normAuthor(c.authors)}|${c.year}`); firstYears.add(`${c.first.toLowerCase()}|${c.year}`); }
  }
  const issues: Issue[] = [];
  for (const b of blocks) {
    const texts = b.type === 'study' ? [`${b.authors}${b.year ? ` (${b.year})` : ''}`, ...blockTexts(b).slice(1)]
      : b.type === 'timeline' ? b.items.map(i => `${i.who} (${i.year})`) : blockTexts(b);
    for (const c of texts.flatMap(t => citationsIn(t))) {
      const exact = known.has(`${normAuthor(c.authors)}|${c.year}`);
      // Kurzform ("Simons (1999)" für "Simons & Chabris (1999)") gilt, wenn Erstautor und Jahr passen;
      // ebenso "Rosenthal-Effekt (1968)" für "Rosenthal & Jacobson, 1968".
      const firstName = c.first.split('-')[0].toLowerCase();
      if (!exact && !firstYears.has(`${c.first.toLowerCase()}|${c.year}`) && !firstYears.has(`${firstName}|${c.year}`)) {
        issues.push({ rule: 'author_year', blockId: b.id, message: `„${c.authors} (${c.year})“ steht so in keiner Quelle.` });
      }
    }
    if (b.type === 'timeline') {
      for (let i = 1; i < b.items.length; i++) {
        if (b.items[i].year < b.items[i - 1].year) { issues.push({ rule: 'author_year', blockId: b.id, message: 'Zeitleiste ist nicht chronologisch sortiert.' }); break; }
      }
    }
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
      // Nur Texte, die der Code aus Einheiten übernimmt (Zeitleiste, Aufgaben …): das Schreibmodell
      // formuliert um und schreibt Tabellenzellen als Stichworte, dort schlug die Regel fälschlich an.
      : b.id.startsWith('x-') && isTruncatedPrefix(t, unitTexts) ? 'endet mitten im Satz der Quelle'
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
// example zählt mit (Abnahme 16.10.: ohne fiel das H0/H1-Beispiel weg); 70 % lassen Raum zum Kürzen.
// figure: Schemata wie der Forschungskreislauf stehen nur im Bild (Abnahme 16.10.: fehlte sonst).
export const CONTENT_TYPES = new Set(['definition', 'concept', 'study', 'finding', 'comparison', 'example', 'figure']);
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

/** Genau ein Merksatz je Kapitel (Kapitel = Blöcke nach einer Überschrift der Ebene 2). */
export const checkMerksatz = (chapterBlocks: Block[], chapterBlockId: string, title: string): Issue[] => {
  const n = chapterBlocks.filter(b => b.type === 'callout' && b.variant === 'merksatz').length;
  if (n === 1) return [];
  return [{ rule: 'merksatz', blockId: chapterBlockId, message: n === 0 ? `Kapitel „${title}“ hat keinen Merksatz. Ergänze genau einen.` : `Kapitel „${title}“ hat ${n} Merksätze. Behalte genau einen.` }];
};

/** Jede Einheit source_error (Folienfehler) braucht einen Hinweis mit Beleg auf ihre Seite. */
export const checkSourceErrorHints = (blocks: Block[], units: Unit[]): Issue[] =>
  units.filter(u => u.type === 'source_error')
    .filter(u => !blocks.some(b => b.type === 'callout' && b.variant === 'hinweis' && b.cites.some(c => c.sourceId === u.sourceId && c.page === u.page)))
    .map(u => ({ rule: 'source_error_hint' as const, sourceId: u.sourceId, message: `Folienfehler ohne Hinweis (S. ${u.page}): ${u.text}` }));

/**
 * Rechenbeispiel als Studienergebnis: Werte, die nur in Einheiten mit
 * ausgedachten Werten stehen (illustrative), dürfen nicht als Ergebnis einer
 * Studie erscheinen, also weder in study.result noch in einem Text mit
 * Autor und Jahr (Abnahme 16.10.: "M = 75/90" als Ergebnis von Skowronek et al.).
 */
export const checkIllustrative = (blocks: Block[], units: Unit[]): Issue[] => {
  const illustrative = units.filter(u => u.illustrative).map(unitText).join(' ');
  if (!illustrative) return [];
  const real = units.filter(u => !u.illustrative).map(unitText).join(' ');
  const onlyIllustrative = (t: string) => extractFacts(t).filter(f => !/^(1[89]|20)\d\d$/.test(f) && hasFact(f, illustrative) && !hasFact(f, real));
  const issues: Issue[] = [];
  for (const b of blocks) {
    const texts = b.type === 'study' ? [b.result, b.conclusion] : b.type === 'table' ? [] : blockTexts(b).filter(t => citationsIn(t).length);
    const facts = texts.flatMap(onlyIllustrative);
    if (facts.length) {
      issues.push({ rule: 'illustrative_result', blockId: b.id, message: `Werte aus einem Rechenbeispiel stehen als Studienergebnis da (${[...new Set(facts)].join(', ')}). Als Rechenbeispiel kennzeichnen oder als Szenarien-Tabelle zeigen.` });
    }
  }
  return issues;
};

const shingles3 = (t: string): Set<string> => {
  const w = (t.toLowerCase().replace(/\*\*/g, '').match(/[\p{L}\p{N}]+/gu) ?? []);
  const out = new Set<string>();
  for (let i = 0; i + 3 <= w.length; i++) out.add(w.slice(i, i + 3).join(' '));
  return out;
};
const overlap = (a: Set<string>, b: Set<string>) => {
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const x of a) if (b.has(x)) n += 1;
  return n / Math.min(a.size, b.size);
};
export const REPETITION_MIN = 0.6;

/**
 * Keine Wiederholung im Kapitel: zwei Texte aus verschiedenen Blöcken, die
 * großteils dasselbe sagen (Anteil gemeinsamer Wortdreier am kürzeren Text),
 * oder eine Studie als Block und zusätzlich als Stichpunkt mit Autor und Jahr.
 */
export const checkRepetition = (chapterBlocks: Block[]): Issue[] => {
  const entries = chapterBlocks.filter(b => b.type !== 'heading' && b.type !== 'table').flatMap(b =>
    (b.type === 'bullets' || b.type === 'tasks' ? b.items.map(i => i.text) : [blockTexts(b).join(' ')])
      .map(text => ({ b, text, sh: shingles3(text) })))
    .filter(e => e.sh.size >= 4);
  const issues: Issue[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < entries.length; i++) for (let j = i + 1; j < entries.length; j++) {
    const a = entries[i], c = entries[j];
    if (a.b.id === c.b.id || seen.has(`${a.b.id}|${c.b.id}`)) continue;
    if (overlap(a.sh, c.sh) >= REPETITION_MIN) {
      seen.add(`${a.b.id}|${c.b.id}`);
      issues.push({ rule: 'repetition', blockId: c.b.id, message: `Wiederholung: „${c.text.slice(0, 60)}“ sagt dasselbe wie ein früherer Block. Nur einmal aufnehmen.` });
    }
  }
  const studies = chapterBlocks.filter((b): b is Extract<Block, { type: 'study' }> => b.type === 'study' && !!b.year);
  const key = (c: { sourceId: string; page: number }) => `${c.sourceId}:${c.page}`;
  for (const b of chapterBlocks) {
    if (b.type !== 'bullets' && b.type !== 'paragraph') continue;
    const entries = b.type === 'bullets' ? b.items.map(i => ({ text: i.text, cites: i.cites.length ? i.cites : b.cites })) : [{ text: b.text, cites: b.cites }];
    for (const { text: t, cites } of entries) for (const c of citationsIn(t)) {
      // Nur echte Doppelung: dieselbe Studie UND dieselben Folien. Weitere Experimente derselben
      // Autoren auf anderen Folien (z. B. Helligkeit und Ähnlichkeit bei Most et al.) sind neuer Stoff.
      const st = studies.find(s => s.year === c.year && s.authors.toLowerCase().includes(c.first.toLowerCase())
        && cites.length > 0 && cites.every(x => s.cites.some(y => key(y) === key(x))));
      if (st && !seen.has(`${st.id}|${b.id}`)) {
        seen.add(`${st.id}|${b.id}`);
        issues.push({ rule: 'repetition', blockId: b.id, message: `Wiederholung: ${c.authors} (${c.year}) steht schon als Studie im Kapitel. Den Stichpunkt streichen.` });
      }
    }
  }
  return issues;
};

/** Bezeichner, die einen eigenen Datensatz einleiten ("Szenario 2", "Gruppe 1", "Bedingung B"). */
const RECORD_LABEL = /\b(?:Szenario|Beispiel|Fall|Gruppe|Bedingung|Studie|Experiment|Variante)\s+(?:\d+|[A-H])\b/gi;

/**
 * Tabellen: jede Zeile hat so viele Zellen wie Spalten, und eine Zelle
 * enthält nicht zwei Datensätze (Abnahme 16.10.: "Szenario 2 … / M = 60 vs.
 * M = 60 …" in einer Zelle). Zwei Datensätze = zwei Bezeichner wie
 * "Szenario 2" und "Szenario 3", oder Kennwerte in einer Spalte, die sonst
 * keine hat. (Erwähnt eine Zelle nur den Namen einer anderen Zeile, etwa
 * "zeitgleich mit Psychoanalyse", ist das kein zweiter Datensatz.)
 */
export const checkTables = (blocks: Block[]): Issue[] => blocks.flatMap((b): Issue[] => {
  if (b.type !== 'table') return [];
  const out: Issue[] = [];
  if (b.shapeError) out.push({ rule: 'table_shape', blockId: b.id, message: `Tabelle „${b.caption ?? b.headers.join(' | ')}“: ${b.shapeError}. Jede Zeile braucht genau ${b.headers.length} Zellen.` });
  const kennwerte = (t: string) => extractFacts(t).filter(f => !/^(1[89]|20)\d\d$/.test(f)).length;
  b.rows.forEach((r, i) => r.forEach((cell, k) => {
    const labels = new Set((cell.match(RECORD_LABEL) ?? []).map(x => x.toLowerCase().replace(/\s+/g, ' ')));
    // Werte in einer Spalte, die sonst keine hat, während die Zeile ihre Werte schon in einer anderen
    // Spalte trägt: der nächste Datensatz ist in die Zelle gerutscht.
    const column = b.rows.filter((_, j) => j !== i).map(row => row[k] ?? '');
    const leaked = kennwerte(cell) > 0 && column.length >= 1 && column.every(c => kennwerte(c) === 0)
      && r.some((c, j) => j !== k && kennwerte(c) > 0);
    if (labels.size >= 2 || leaked) {
      out.push({ rule: 'table_shape', blockId: b.id, message: `Tabelle „${b.caption ?? b.headers.join(' | ')}“, Zeile ${i + 1}: eine Zelle enthält zwei Datensätze. Je Datensatz eine eigene Zeile.` });
    }
  }));
  return out;
});

/** Prüfungsrelevante Einheiten (Wiederholungs-/Quizfolien) müssen vorkommen. */
export const checkPriority = (unitIds: string[], blocks: Block[], units: Map<string, Unit>, chapterBlockId: string): Issue[] => {
  const used = new Set(blocks.flatMap(b => b.unitIds ?? []));
  const missing = unitIds.filter(id => units.get(id)?.priority && !used.has(id));
  return missing.length ? [{ rule: 'priority_missing', blockId: chapterBlockId, message: `Prüfungsrelevanter Stoff fehlt (steht auf Wiederholungs- oder Quizfolien). Nimm diese Einheiten auf: ${missing.join(', ')}.` }] : [];
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
  ...checkSourceErrorHints(blocks, ctx.units),
  ...checkTables(blocks),
  ...checkIllustrative(blocks, ctx.units),
  ...checkCiteDensity(blocks),
  ...checkKiFacts(blocks, ctx),
];
