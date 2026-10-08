// Rechnet für jede Modellantwort die Rubrik-Punkte aus: deterministische Checks, Goldstandard,
// Prüferwertungen (Mittel beider Prüfer) und Konsistenz über Wiederholungen. Ergebnis: scores.jsonl.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Feature, TestCase } from '../features.ts';
import { resolveSource } from '../sources.ts';
import { BENCH_DIR, type RawRecord } from '../runners/run.ts';
import { RUBRICS } from './rubrics.ts';
import { loadCases, readJsonl, type JudgeRecord } from './judge.ts';

export interface Score {
  caseId: string;
  feature: Feature;
  difficulty: string;
  contextSize: string;
  edgeType?: string;
  modelId: string;
  repeat: number;
  technicalError: boolean;
  failureKind?: string;
  schemaValid: boolean;
  /** 0–100, null bei technischem Fehler. */
  quality: number | null;
  /** Anteil der Rubrik, der bewertet werden konnte (z. B. ohne Prüfer oder ohne Wiederholungen < 1). */
  coverage: number;
  /** Nur det/gold-Kriterien, auf 100 normiert: gleiche Grundlage in allen Runden (für Konsistenz). */
  qualityDet: number | null;
  judged: boolean;
  criteria: Record<string, { points: number | null; max: number; source: string; det?: number | null; judge?: number | null }>;
  /** 0, 0.5 oder 1: Anteil der Prüfer (bzw. det-Check), die einen kritischen Fehler melden. */
  critical: number;
  hallucination: number;
  groundingFailure: number;
  criticalDetails: string[];
  judgesUsed: string[];
}

// ---------- Hilfen ----------
const norm = (s: string) => s.toLowerCase().normalize('NFKC').replace(/[„“"'`´’]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const containsAny = (text: string, alts: string[]) => alts.some(a => norm(text).includes(norm(a)));
const coverage = (text: string, groups: string[][]) => groups.length ? groups.filter(g => containsAny(text, g)).length / groups.length : 1;
const inRangeScore = (v: unknown, [lo, hi]: [number, number], scale: number) => {
  const x = Number(v);
  if (!Number.isFinite(x)) return 0;
  if (x >= lo && x <= hi) return 1;
  return Math.max(0, 1 - (x < lo ? lo - x : x - hi) / scale);
};
/** Steht ein Zitat (sinngemäß wörtlich) in der Quelle? Anteil der Wörter ≥ 4 Zeichen, die in der Quelle vorkommen. */
const quoteInSource = (quote: string, source: string): number => {
  const words = norm(quote).split(' ').filter(w => w.length >= 4);
  if (!words.length) return 0;
  if (norm(source).includes(norm(quote))) return 1;
  const srcWords = new Set(norm(source).split(' '));
  return words.filter(w => srcWords.has(w)).length / words.length;
};
const parseJson = (text: string): any => { try { return JSON.parse(text); } catch { return undefined; } };
const REFUSAL = /(nicht|kein\w*)[^.]{0,80}(in der quelle|im dokument|im material|im skript|in den unterlagen|in deinem material|in den folien)|steht (dort |hier |darin )?nicht|nicht (enthalten|behandelt|erwähnt|angegeben)|keine angabe|keine informationen? (dazu|darüber|zu)/i;

type Det = { values: Record<string, number | null>; critical: string[]; schemaValid: boolean; hallucination?: boolean };

// ---------- deterministische / Gold-Prüfungen je Funktion ----------
const QUIZ_TYPES = ['mc', 'truefalse', 'open', 'matching', 'cloze', 'ranking', 'numeric', 'scenario'];
const quizQuestionValid = (q: any): boolean => {
  const idx: number[] = Array.isArray(q.correctAnswerIndices) ? q.correctAnswerIndices : [];
  const opts: string[] = Array.isArray(q.options) ? q.options : [];
  switch (q.questionType) {
    case 'mc': case 'scenario': {
      if (opts.length < 3 || !idx.length || idx.some(i => i < 0 || i >= opts.length)) return false;
      if (q.questionType === 'scenario' && !q.scenarioText) return false;
      return q.isMultipleChoice ? idx.length >= 1 : idx.length === 1;
    }
    case 'truefalse': return opts.length === 2 && idx.length === 1 && (idx[0] === 0 || idx[0] === 1);
    case 'matching': return Array.isArray(q.matchPairs) && q.matchPairs.length >= 2 && q.matchPairs.every((p: any) => p?.left && p?.right);
    case 'cloze': {
      const gaps = (String(q.clozeText ?? '').match(/__LÜCKE__/g) ?? []).length;
      return gaps >= 1 && Array.isArray(q.clozeAnswers) && q.clozeAnswers.length === gaps;
    }
    case 'ranking': return Array.isArray(q.rankingItems) && q.rankingItems.length >= 3;
    case 'numeric': return typeof q.numericAnswer === 'number' && Number.isFinite(q.numericAnswer);
    case 'open': return typeof q.explanation === 'string' && q.explanation.trim().length > 10;
    default: return false;
  }
};

const EXAM_TYPES = ['mc', 'open', 'matching', 'truefalse', 'fillblank', 'ranking', 'numeric', 'expression', 'step_by_step'];
const examQuestionValid = (q: any): boolean => {
  if (!q?.question || !(Number(q.points) > 0)) return false;
  switch (q.type) {
    case 'mc': return Array.isArray(q.options) && q.options.length >= 3 && Array.isArray(q.correctIndices) && q.correctIndices.length >= 1 && q.correctIndices.every((i: number) => i >= 0 && i < q.options.length);
    case 'truefalse': return typeof q.tfCorrect === 'boolean';
    case 'matching': return Array.isArray(q.matchLeft) && Array.isArray(q.matchRight) && Array.isArray(q.matchCorrect) && q.matchLeft.length >= 2 && q.matchCorrect.length === q.matchLeft.length;
    case 'fillblank': return typeof q.blankText === 'string' && Array.isArray(q.blanks) && q.blanks.length >= 1;
    case 'ranking': return Array.isArray(q.rankingItems) && q.rankingItems.length >= 3;
    case 'numeric': return typeof q.numericAnswer === 'number';
    case 'open': return typeof q.solution === 'string' && q.solution.trim().length > 10;
    default: return EXAM_TYPES.includes(q.type) && !!q.solution;
  }
};

const typeScore = (types: string[], count: number, allowed?: string[]) => {
  if (allowed) return types.length ? types.filter(t => allowed.includes(t)).length / types.length : 0;
  const distinct = new Set(types).size;
  const want = Math.min(4, Math.max(2, Math.ceil(count / 3)));
  return Math.min(1, distinct / want);
};

const evalDet = (c: TestCase, text: string, source: string): Det => {
  const e = c.expected;
  const j = parseJson(text);
  switch (c.feature) {
    case 'quiz': {
      if (!Array.isArray(j)) return { values: {}, critical: ['ungültiges JSON/kein Array'], schemaValid: false };
      const valid = j.map(quizQuestionValid);
      const types = j.map((q: any) => String(q.questionType));
      const cnt = Math.min(j.length, e.count) / e.count * (j.length > e.count ? e.count / j.length : 1);
      const fragetyp = 0.5 * (valid.filter(Boolean).length / Math.max(1, j.length)) + 0.25 * cnt + 0.25 * typeScore(types, e.count, e.allowedTypes);
      const refs = j.map((q: any) => quoteInSource(String(q.sourceReference ?? ''), source) >= 0.8 ? 1 : 0);
      const critical = valid.flatMap((v: boolean, i: number) => (v ? [] : [`Frage ${i + 1} (${types[i]}) unvollständig/kaputt`]));
      return { values: { fragetyp, quelltreue: refs.reduce((a: number, b: number) => a + b, 0) / Math.max(1, refs.length) }, critical, schemaValid: true };
    }
    case 'karten': {
      if (!Array.isArray(j)) return { values: {}, critical: ['ungültiges JSON/kein Array'], schemaValid: false };
      const cards = j.filter((k: any) => k?.front && k?.back);
      const fronts = cards.map((k: any) => norm(k.front));
      const dupShare = 1 - new Set(fronts).size / Math.max(1, fronts.length);
      const shortShare = cards.filter((k: any) => String(k.back).length <= 350).length / Math.max(1, cards.length);
      const countF = Math.min(1, cards.length / e.count);
      const all = cards.map((k: any) => `${k.front} ${k.back}`).join(' \n ');
      return { values: { atomar: 0.5 * shortShare + 0.5 * (1 - dupShare), abdeckung: coverage(all, e.keyFacts ?? []) * countF }, critical: [], schemaValid: cards.length > 0 };
    }
    case 'tutor': {
      const refused = REFUSAL.test(text);
      if (e.answerable === false) {
        const forbidden = (e.forbiddenPatterns ?? []).some((p: string) => new RegExp(p, 'i').test(text));
        return {
          values: { korrektheit: forbidden ? 0 : 1, unsicherheit: refused ? (forbidden ? 0.3 : 1) : 0 },
          critical: forbidden || !refused ? ['beantwortet Frage, die nicht in der Quelle steht'] : [],
          schemaValid: text.trim().length > 0, hallucination: forbidden,
        };
      }
      const cov = coverage(text, e.mustMention ?? []);
      return { values: { korrektheit: cov, unsicherheit: refused && cov < 0.5 ? 0 : 1 }, critical: refused && cov < 0.5 ? ['verweigert beantwortbare Frage'] : [], schemaValid: text.trim().length > 0 };
    }
    case 'feynman_frage': {
      if (!j || typeof j !== 'object' || !j.question) return { values: {}, critical: ['ungültiges JSON'], schemaValid: false };
      const kw: string[] = Array.isArray(j.expectedKeywords) ? j.expectedKeywords : [];
      const kwIn = kw.length ? kw.filter(k => norm(source).includes(norm(k))).length / kw.length : 0;
      const kwCount = kw.length >= 3 && kw.length <= 8 ? 1 : 0.7;
      const format = [j.question, j.conceptContext, j.topic].filter(x => typeof x === 'string' && x.trim()).length / 3 * (kw.length ? 1 : 0.5);
      let kern: number | null = null;
      if (e.topicMustEqual) kern = norm(String(j.topic ?? '')).includes(norm(e.topicMustEqual)) || norm(e.topicMustEqual).includes(norm(String(j.topic ?? '')) || '§') ? 1 : 0;
      if (e.topicMustNotEqual) kern = norm(String(j.topic ?? '')) === norm(e.topicMustNotEqual) ? 0 : 1;
      return { values: { kernbegriffe: kwIn * kwCount, format, kernthema: kern }, critical: e.topicMustNotEqual && kern === 0 ? ['Thema nicht in der Quelle, trotzdem als topic gesetzt'] : [], schemaValid: true };
    }
    case 'feynman_bewertung': {
      if (!j || typeof j !== 'object' || typeof j.score !== 'number') return { values: {}, critical: ['ungültiges JSON'], schemaValid: false };
      const fb = [j.feedback, ...(j.missingPoints ?? []), j.suggestedReview, j.probeQuestion].filter(Boolean).join(' \n ');
      const errs: { id: string; any: string[] }[] = e.errors ?? [];
      const found = errs.filter(er => containsAny(fb, er.any));
      const inRange = inRangeScore(j.score, e.scoreRange, 30);
      const fehler = errs.length ? found.length / errs.length : inRangeScore(j.score, [e.scoreRange[0], 100], 40);
      const critical = errs.filter(er => !found.includes(er)).map(er => `Fehler "${er.id}" nicht erkannt`);
      if (!errs.length && j.score < e.scoreRange[0] - 20) critical.push(`korrekte Erklärung mit ${j.score} Punkten abgewertet`);
      return { values: { fehlererkennung: fehler, vollstaendigkeit: inRange }, critical, schemaValid: true };
    }
    case 'klausur': {
      if (!Array.isArray(j)) return { values: {}, critical: ['ungültiges JSON/kein Array'], schemaValid: false };
      const valid = j.map(examQuestionValid);
      const types = j.map((q: any) => String(q.type));
      const cnt = Math.min(j.length, e.count) / e.count * (j.length > e.count ? e.count / j.length : 1);
      const typAnzahl = 0.4 * (valid.filter(Boolean).length / Math.max(1, j.length)) + 0.3 * cnt + 0.3 * typeScore(types, e.count, e.allowedTypes);
      return { values: { typ_anzahl: typAnzahl }, critical: valid.flatMap((v: boolean, i: number) => (v ? [] : [`Aufgabe ${i + 1} (${types[i]}) unvollständig/kaputt`])), schemaValid: true };
    }
    case 'korrektur': {
      if (!Array.isArray(j)) return { values: {}, critical: ['ungültiges JSON/kein Array'], schemaValid: false };
      const gold: Record<string, [number, number]> = e.points;
      const qs: any[] = c.input.questions;
      const per = Object.entries(gold).map(([id, range]) => {
        const out = j.find((x: any) => x?.id === id);
        const max = qs.find(q => q.id === id).points;
        return { id, range, max, got: out?.achievedPoints, s: out ? inRangeScore(out.achievedPoints, range, max) : 0 };
      });
      const fairItems = per.filter(p => p.range[0] === p.max || p.range[1] === 0);
      const fair = fairItems.length ? fairItems.filter(p => p.s === 1).length / fairItems.length : 1;
      const critical = per.filter(p => p.s < 0.5).map(p => `${p.id}: ${p.got ?? '—'} statt ${p.range.join('–')} P.`);
      return { values: { fachlich: per.reduce((a, p) => a + p.s, 0) / per.length, fairness: fair }, critical, schemaValid: true };
    }
    case 'rechenweg': {
      if (!Array.isArray(j)) return { values: {}, critical: ['ungültiges JSON/kein Array'], schemaValid: false };
      const vals = { fehlerschritt: 0, punkte: 0, endergebnis: 0, keine_erfundenen: 0 };
      const critical: string[] = [];
      const ids = Object.keys(e).filter(k => typeof e[k] === 'object');
      for (const id of ids) {
        const g = e[id];
        const q = c.input.questions.find((x: any) => x.id === id);
        const o = j.find((x: any) => x?.id === id);
        if (!o) { critical.push(`${id} nicht bewertet`); continue; }
        const pred = new Set<number>((o.stepFeedback ?? []).filter((s: any) => s.verdict !== 'correct').map((s: any) => Number(s.stepIndex)));
        const goldSet = new Set<number>(g.errorSteps);
        const hit = [...goldSet].filter(i => pred.has(i)).length;
        // Folgefehler (allowExtra) dürfen markiert werden, ohne als erfunden zu zählen.
        const allowed = new Set<number>([...(g.errorSteps ?? []), ...(g.allowExtra ?? [])]);
        const invented = [...pred].filter(i => !allowed.has(i)).length;
        vals.fehlerschritt += goldSet.size ? hit / goldSet.size : (pred.size ? 0 : 1);
        vals.keine_erfundenen += invented ? Math.max(0, 1 - invented / Math.max(1, pred.size)) : 1;
        vals.punkte += inRangeScore(o.achievedPoints, g.points, q.points);
        vals.endergebnis += o.finalResultCorrect === g.finalResultCorrect ? 1 : 0;
        if (!goldSet.size && pred.size) critical.push(`${id}: Fehler in korrektem Rechenweg gemeldet`);
        if (goldSet.size && !hit) critical.push(`${id}: tatsächlichen Fehler übersehen`);
      }
      for (const k of Object.keys(vals) as (keyof typeof vals)[]) vals[k] /= ids.length;
      return { values: vals, critical, schemaValid: true };
    }
    case 'leser': {
      if (!j || typeof j !== 'object' || typeof j.found !== 'boolean') return { values: {}, critical: ['ungültiges JSON'], schemaValid: false };
      if (e.found === false) {
        const ok = j.found === false;
        return { values: { zitat: ok ? 1 : 0, bezug: ok ? 1 : 0 }, critical: ok ? [] : ['erklärt Begriff, der nicht in der Quelle steht'], schemaValid: true, hallucination: !ok };
      }
      if (!j.found) return { values: { zitat: 0, bezug: 0 }, critical: ['Stelle steht in der Quelle, found=false'], schemaValid: true };
      const q = j.sourceQuote ? quoteInSource(j.sourceQuote, source) : 0;
      return { values: { zitat: j.sourceQuote ? (q >= 0.9 ? 1 : q >= 0.7 ? 0.6 : 0.2) : 0.5, bezug: coverage(String(j.answer ?? ''), e.mustMention ?? []) }, critical: j.sourceQuote && q < 0.7 ? ['Zitat steht nicht in der Quelle'] : [], schemaValid: true };
    }
    case 'studio': {
      if (!text.trim()) return { values: {}, critical: ['leer'], schemaValid: false };
      const cites = /\[\d+(,\s*S\.?\s*\d+)?\]/.test(text) ? 1 : 0;
      const srcYears = new Set(source.match(/\b(1[0-9]{3}|20[0-9]{2})\b/g) ?? []);
      const invented = [...new Set(text.match(/\b(1[0-9]{3}|20[0-9]{2})\b/g) ?? [])].filter(y => !srcYears.has(y));
      return {
        values: { abdeckung: coverage(text, e.keyPoints ?? []), quelltreue: 0.5 * cites + 0.5 * (invented.length ? 0 : 1) },
        critical: invented.length ? [`Jahreszahlen nicht in der Quelle: ${invented.join(', ')}`] : [],
        schemaValid: true, hallucination: invented.length > 0,
      };
    }
    case 'selbsttest': {
      if (!j || typeof j !== 'object' || !j.verdict) return { values: {}, critical: ['ungültiges JSON'], schemaValid: false };
      const ok = e.verdict.includes(j.verdict);
      const adjacent = (a: string, b: string) => [a, b].includes('partial');
      const urteil = ok ? 1 : e.verdict.some((v: string) => adjacent(v, j.verdict)) ? 0.25 : 0;
      return { values: { urteil, punkte: inRangeScore(j.score, e.scoreRange, 30) }, critical: urteil === 0 ? [`Urteil ${j.verdict} statt ${e.verdict.join('/')}`] : [], schemaValid: true };
    }
  }
};

// ---------- Zusammenführen ----------
export const evaluateRun = async (runId: string) => {
  const dir = join(BENCH_DIR, 'results', runId);
  const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
  const cases = loadCases(meta.datasetVersion);
  const raw = readJsonl<RawRecord>(join(dir, 'raw.jsonl'));
  const judges = readJsonl<JudgeRecord>(join(dir, 'judge.jsonl')).filter(j => j.status === 'ok');
  const sourceCache = new Map<string, string>();
  const src = (c: TestCase) => { if (!sourceCache.has(c.id)) sourceCache.set(c.id, resolveSource(c.source)); return sourceCache.get(c.id)!; };

  const scores: Score[] = raw.map(r => {
    const c = cases.get(r.caseId)!;
    const base = { caseId: r.caseId, feature: c.feature, difficulty: c.difficulty, contextSize: c.contextSize, edgeType: c.edgeType, modelId: r.modelId, repeat: r.repeat };
    if (r.status !== 'ok') {
      return { ...base, technicalError: true, failureKind: r.failureKind, schemaValid: true, quality: null, qualityDet: null, judged: false, coverage: 0, criteria: {}, critical: 0, hallucination: 0, groundingFailure: 0, criticalDetails: [], judgesUsed: [] };
    }
    const det = evalDet(c, r.text, src(c));
    const js = judges.filter(j => j.caseId === r.caseId && j.repeat === r.repeat && j.modelId === r.modelId);
    const judgeVal = (k: string) => {
      const v = js.map(j => j.kriterien[k]).filter(x => typeof x === 'number');
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
    };
    const criteria: Score['criteria'] = {};
    let pts = 0, maxAvail = 0, detPts = 0, detMax = 0;
    for (const k of RUBRICS[c.feature]) {
      let frac: number | null = null;
      const d = det.values[k.key] ?? null;
      const jv = judgeVal(k.key);
      if (!det.schemaValid) frac = 0;
      else if (k.source === 'det' || k.source === 'gold') frac = d;
      else if (k.source === 'judge') frac = jv;
      else if (k.source === 'mix') frac = d === null ? jv : jv === null ? null : (k.judgeShare! * jv + (1 - k.judgeShare!) * d);
      else if (k.source === 'runs') frac = null; // unten über Wiederholungen
      criteria[k.key] = { points: frac === null ? null : frac * k.max, max: k.max, source: k.source, det: d, judge: jv };
      if (frac !== null) { pts += frac * k.max; maxAvail += k.max; }
      const detFrac = !det.schemaValid ? 0 : (k.source === 'det' || k.source === 'gold' || k.source === 'mix') ? d : null;
      if (detFrac !== null) { detPts += detFrac * k.max; detMax += k.max; }
    }
    // kritisch / Halluzination: Mittel der Prüfer, det-Befunde zählen voll
    const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    const judgeCrit = mean(js.map(j => (j.kritische_fehler.length ? 1 : 0)));
    // Ohne Quelltext (Korrektur, Rechenweg) ist "nicht in der Quelle" kein Grounding-Maßstab:
    // Prüfer markieren dort sonst jedes Feedback mit Fachwissen als Halluzination.
    const grounded = !!c.source;
    const judgeHall = grounded ? mean(js.map(j => (j.halluzination ? 1 : 0))) : 0;
    const judgeGround = grounded ? mean(js.map(j => (j.aussagen.widerspricht_quelle + j.aussagen.nicht_in_quelle > 0 ? 1 : 0))) : 0;
    return {
      ...base, technicalError: false, schemaValid: det.schemaValid,
      quality: maxAvail ? (pts / maxAvail) * 100 : null, coverage: maxAvail / 100, criteria,
      qualityDet: detMax ? (detPts / detMax) * 100 : null, judged: js.length > 0,
      critical: det.critical.length || !det.schemaValid ? 1 : judgeCrit,
      hallucination: det.hallucination ? 1 : judgeHall,
      groundingFailure: det.hallucination ? 1 : judgeGround,
      criticalDetails: [...det.critical, ...js.flatMap(j => j.kritische_fehler.map(k => `[${j.judgeId}] ${k.typ}: ${k.beschreibung}`))],
      judgesUsed: js.map(j => j.judgeId),
    };
  });

  // Konsistenz-Kriterium (korrektur) über Wiederholungen: Spannweite der Punkte je Aufgabe.
  const groups = new Map<string, Score[]>();
  for (const s of scores) if (!s.technicalError) groups.set(`${s.caseId}|${s.modelId}`, [...(groups.get(`${s.caseId}|${s.modelId}`) ?? []), s]);
  for (const [key, list] of groups) {
    const c = cases.get(list[0].caseId)!;
    const runsCrit = RUBRICS[c.feature].find(k => k.source === 'runs');
    if (!runsCrit || list.length < 2) continue;
    const texts = raw.filter(r => `${r.caseId}|${r.modelId}` === key && r.status === 'ok').map(r => parseJson(r.text));
    const ranges = c.input.questions.map((q: any) => {
      const pts = texts.map(t => (Array.isArray(t) ? t.find((x: any) => x?.id === q.id)?.achievedPoints : undefined)).filter((x: any) => typeof x === 'number');
      return pts.length >= 2 ? (Math.max(...pts) - Math.min(...pts)) / q.points : 1;
    });
    const frac = 1 - ranges.reduce((a: number, b: number) => a + b, 0) / ranges.length;
    for (const s of list) {
      s.criteria[runsCrit.key] = { points: frac * runsCrit.max, max: runsCrit.max, source: 'runs' };
      const avail = Object.values(s.criteria).filter(x => x.points !== null);
      const p = avail.reduce((a, x) => a + (x.points ?? 0), 0), m = avail.reduce((a, x) => a + x.max, 0);
      s.quality = s.schemaValid ? (p / m) * 100 : 0;
      s.coverage = m / 100;
    }
  }
  for (const s of scores) if (!s.technicalError && !s.schemaValid) s.quality = 0;

  writeFileSync(join(dir, 'scores.jsonl'), scores.map(s => JSON.stringify(s)).join('\n') + '\n');
  const noJudge = scores.filter(s => !s.technicalError && s.judgesUsed.length === 0).length;
  console.log(`${scores.length} Antworten bewertet${noJudge ? `, davon ${noJudge} ohne Prüfer (nur det/gold)` : ''} → ${dir}/scores.jsonl`);
};
