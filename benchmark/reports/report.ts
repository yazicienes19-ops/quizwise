// Aggregation + Bericht (CSV, Markdown, HTML) für einen Lauf.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { MODELS, GATES, PRODUCT_WEIGHTS } from '../benchmark.config.ts';
import { FEATURE_INFO, FEATURES, type Feature } from '../features.ts';
import { BENCH_DIR, type RawRecord } from '../runners/run.ts';
import { readJsonl, type JudgeRecord } from '../evaluators/judge.ts';
import type { Score } from '../evaluators/evaluate.ts';
import { RUBRICS } from '../evaluators/rubrics.ts';
import { bootstrapCI, ct, fmt, mean, median, pairedDiff, pct, percentile, sec, stddev, usd } from './stats.ts';

interface Agg {
  modelId: string;
  feature: Feature | 'gesamt';
  calls: number;
  quality: number;
  qualityMedian: number;
  qualityCI: [number, number];
  /** Testfall-Mittel der Qualität (über Wiederholungen), Grundlage für gepaarte Vergleiche. */
  caseQuality: Map<string, number>;
  technicalRate: number;
  timeoutRate: number;
  apiErrorRate: number;
  schemaFailureRate: number;
  criticalRate: number;
  hallucinationRate: number;
  groundingFailureRate: number;
  successRate: number;
  reliability: number;
  ttft: number[];
  wall: number[];
  costMean: number;
  costMedian: number;
  costPerSuccess: number;
  consistencyStd: number;
  consistencyRange: number;
  consistencyScore: number;
  gates: { quality: boolean; critical: boolean; schema: boolean; technical: boolean };
  productionReady: boolean;
  productScore: number;
  qualityRankScore: number;
  costEfficiency: number;
}

const label = (id: string) => MODELS.find(m => m.id === id)?.label ?? id;

const aggregate = (modelId: string, feature: Agg['feature'], raw: RawRecord[], scores: Score[]): Agg => {
  const R = raw.filter(r => r.modelId === modelId && (feature === 'gesamt' || r.feature === feature));
  const S = scores.filter(s => s.modelId === modelId && (feature === 'gesamt' || s.feature === feature));
  const ok = S.filter(s => !s.technicalError);
  // Qualität und kritische Fehler nur aus geprüften Antworten (Prüfer laufen nur für RUN.judgeRepeats);
  // gibt es keine geprüften, fallen sie auf alle zurück (dann nur det/gold).
  const judgedOk = ok.some(s => s.judged) ? ok.filter(s => s.judged) : ok;
  const q = judgedOk.map(s => s.quality ?? 0);
  const caseQuality = new Map<string, number>();
  const byCase = new Map<string, number[]>();
  for (const s of judgedOk) byCase.set(s.caseId, [...(byCase.get(s.caseId) ?? []), s.quality ?? 0]);
  for (const [k, v] of byCase) caseQuality.set(k, mean(v));
  // Konsistenz: det/gold-Punkte über alle Runden desselben Falls
  const detByCase = new Map<string, number[]>();
  for (const s of ok) if (s.qualityDet !== null) detByCase.set(s.caseId, [...(detByCase.get(s.caseId) ?? []), s.schemaValid ? s.qualityDet : 0]);
  const technicalRate = S.length ? S.filter(s => s.technicalError).length / S.length : NaN;
  const schemaFailureRate = ok.length ? ok.filter(s => !s.schemaValid).length / ok.length : NaN;
  const criticalRate = mean(judgedOk.map(s => s.critical));
  const success = judgedOk.filter(s => s.schemaValid && s.critical < 0.5).length / Math.max(1, judgedOk.length) * ok.length;
  const reliability = 100 * (1 - (technicalRate || 0)) * (1 - (schemaFailureRate || 0)) * (1 - (criticalRate || 0));
  const ranges = [...detByCase.values()].filter(v => v.length >= 2);
  const consistencyRange = ranges.length ? mean(ranges.map(v => Math.max(...v) - Math.min(...v))) : NaN;
  const okRaw = R.filter(r => r.status === 'ok');
  const costs = okRaw.map(r => r.totalCost);
  const totalCost = R.reduce((a, r) => a + r.totalCost, 0);
  const gates = {
    quality: mean(q) >= GATES.minQuality,
    critical: criticalRate < GATES.maxCriticalErrorRate,
    schema: schemaFailureRate < GATES.maxSchemaFailureRate,
    technical: technicalRate < GATES.maxTechnicalFailureRate,
  };
  return {
    modelId, feature, calls: S.length,
    quality: mean(q), qualityMedian: median(q), qualityCI: bootstrapCI([...caseQuality.values()]), caseQuality,
    technicalRate,
    timeoutRate: S.length ? S.filter(s => s.failureKind === 'timeout').length / S.length : NaN,
    apiErrorRate: S.length ? S.filter(s => s.technicalError && s.failureKind !== 'timeout').length / S.length : NaN,
    schemaFailureRate, criticalRate,
    hallucinationRate: mean(judgedOk.map(s => s.hallucination)),
    groundingFailureRate: mean(judgedOk.map(s => s.groundingFailure)),
    successRate: S.length ? success / S.length : NaN,
    reliability,
    ttft: okRaw.map(r => r.ttftMs).filter((x): x is number => x !== null),
    wall: okRaw.map(r => r.totalWallMs),
    costMean: mean(costs), costMedian: median(costs), costPerSuccess: success ? totalCost / success : NaN,
    consistencyStd: ranges.length ? mean(ranges.map(stddev)) : NaN,
    consistencyRange,
    consistencyScore: Number.isFinite(consistencyRange) ? Math.max(0, 100 - consistencyRange) : NaN,
    gates, productionReady: Object.values(gates).every(Boolean),
    productScore: NaN, qualityRankScore: NaN, costEfficiency: NaN,
  };
};

/** Produkt-Score je Gruppe (Feature): Latenz und Kosten relativ zum Besten der Gruppe. */
const scoreGroup = (aggs: Agg[]) => {
  const p95s = aggs.map(a => percentile(a.wall, 95)).filter(Number.isFinite);
  const costs = aggs.map(a => a.costMean).filter(x => Number.isFinite(x) && x > 0);
  const bestP95 = Math.min(...p95s), bestCost = Math.min(...costs);
  for (const a of aggs) {
    const lat = bestP95 / percentile(a.wall, 95);
    const cost = bestCost / a.costMean;
    const q = (a.quality || 0) / 100, r = a.reliability / 100;
    a.productScore = 100 * (PRODUCT_WEIGHTS.quality * q + PRODUCT_WEIGHTS.reliability * r + PRODUCT_WEIGHTS.latency * (lat || 0) + PRODUCT_WEIGHTS.cost * (cost || 0));
    a.qualityRankScore = 100 * (PRODUCT_WEIGHTS.quality * q + PRODUCT_WEIGHTS.reliability * r) / (PRODUCT_WEIGHTS.quality + PRODUCT_WEIGHTS.reliability);
    a.costEfficiency = a.costMean > 0 ? (a.quality || 0) / (a.costMean * 100 * 1000) : NaN; // Qualitätspunkte je 1 € … hier je Cent pro 1000 Tasks
  }
};

const pareto = (aggs: Agg[]) => aggs.filter(a => !aggs.some(b => b !== a
  && b.quality >= a.quality && b.costMean <= a.costMean && median(b.wall) <= median(a.wall)
  && (b.quality > a.quality || b.costMean < a.costMean || median(b.wall) < median(a.wall))));

const relCost = (a: number, b: number) => {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return '–';
  const r = a / b - 1;
  return r < 0 ? `${fmt(-r * 100, 0)} % günstiger` : `${fmt(r * 100, 0)} % teurer`;
};
const relTime = (a: number, b: number) => {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return '–';
  const r = a / b;
  return r >= 1 ? `${fmt(r, 1)}× so langsam` : `${fmt(1 / r, 1)}× so schnell`;
};

export const buildReport = async (runId: string) => {
  const dir = join(BENCH_DIR, 'results', runId);
  if (!existsSync(join(dir, 'scores.jsonl'))) throw new Error('scores.jsonl fehlt: zuerst npm run benchmark -- evaluate');
  const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
  const raw = readJsonl<RawRecord>(join(dir, 'raw.jsonl'));
  const scores = readJsonl<Score>(join(dir, 'scores.jsonl'));
  const judges = readJsonl<JudgeRecord>(join(dir, 'judge.jsonl')).filter(j => j.status === 'ok');
  const human = readJsonl<{ caseId: string; repeat: number; modelId: string; human_score: number; evaluator_id: string }>(join(dir, 'human.jsonl'));
  const modelIds: string[] = meta.models.map((m: any) => m.id);
  const features = FEATURES.filter(f => scores.some(s => s.feature === f));

  const overall = modelIds.map(m => aggregate(m, 'gesamt', raw, scores));
  scoreGroup(overall);
  const perFeature = new Map<Feature, Agg[]>();
  for (const f of features) {
    const aggs = modelIds.map(m => aggregate(m, f, raw, scores));
    scoreGroup(aggs);
    perFeature.set(f, aggs);
  }

  // ---------- Empfehlungen + Management-Aussagen ----------
  const statements: string[] = [];
  const recommendations: { feature: Feature; model: string; why: string; ready: boolean }[] = [];
  for (const f of features) {
    const aggs = perFeature.get(f)!;
    const ready = aggs.filter(a => a.productionReady).sort((a, b) => b.productScore - a.productScore);
    const byQuality = [...aggs].sort((a, b) => b.quality - a.quality);
    const pick = ready[0] ?? byQuality[0];
    const others = aggs.filter(a => a !== pick);
    const cmp = others.map(o => {
      const d = pairedDiff(pick.caseQuality, o.caseQuality);
      const sig = d.significant ? '' : ', statistisch nicht eindeutig';
      return `ggü. ${label(o.modelId)}: Qualität ${fmt(pick.quality)} vs. ${fmt(o.quality)} (Δ ${d.meanDiff >= 0 ? '+' : ''}${fmt(d.meanDiff)}, 95 %-KI ${fmt(d.ci[0])} bis ${fmt(d.ci[1])}${sig}); ${label(pick.modelId)} ist ${relCost(pick.costMean, o.costMean)} (${ct(pick.costMean)} vs. ${ct(o.costMean)} je Task) und bei p95 ${relTime(percentile(pick.wall, 95), percentile(o.wall, 95))} (${sec(percentile(pick.wall, 95))} vs. ${sec(percentile(o.wall, 95))})`;
    });
    recommendations.push({
      feature: f, model: pick.modelId, ready: pick.productionReady,
      why: pick.productionReady
        ? `bester Produkt-Score (${fmt(pick.productScore)}) unter den Modellen, die alle Production Gates erfüllen`
        : `KEIN Modell erfüllt alle Production Gates; höchste Qualität hat ${label(pick.modelId)} (${fmt(pick.quality)})`,
    });
    statements.push(`**${FEATURE_INFO[f].label}** (heute: ${FEATURE_INFO[f].prodModel}): ${pick.productionReady ? 'Empfehlung' : 'Bestes, aber NICHT produktionsreif'}: **${label(pick.modelId)}**.\n  - ${cmp.join('\n  - ')}`);
  }

  // ---------- CSV ----------
  const csvEsc = (v: unknown) => { const s = String(v ?? ''); return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const toCsv = (rows: Record<string, unknown>[]) => rows.length ? [Object.keys(rows[0]).join(';'), ...rows.map(r => Object.values(r).map(csvEsc).join(';'))].join('\n') : '';
  writeFileSync(join(dir, 'requests.csv'), toCsv(raw.map(r => {
    const s = scores.find(x => x.caseId === r.caseId && x.modelId === r.modelId && x.repeat === r.repeat);
    return {
      case_id: r.caseId, feature: r.feature, model: r.modelId, repeat: r.repeat, status: r.status, failure: r.failureKind ?? '',
      quality: s?.quality?.toFixed(1) ?? '', schema_valid: s?.schemaValid ?? '', critical: s?.critical ?? '', hallucination: s?.hallucination ?? '',
      input_tokens: r.inputTokens, output_tokens: r.outputTokens, thinking_tokens: r.thinkingTokens, total_tokens: r.totalTokens,
      input_cost_usd: r.inputCost.toFixed(6), output_cost_usd: r.outputCost.toFixed(6), total_cost_usd: r.totalCost.toFixed(6),
      request_start: r.requestStart, ttft_ms: r.ttftMs ?? '', completion_ms: r.completionMs ?? '', total_wall_ms: r.totalWallMs, attempts: r.attempts,
    };
  })));
  const summaryRows = [...overall, ...[...perFeature.values()].flat()].map(a => ({
    feature: a.feature, model: a.modelId, calls: a.calls, quality: fmt(a.quality), quality_ci_lo: fmt(a.qualityCI[0]), quality_ci_hi: fmt(a.qualityCI[1]),
    reliability: fmt(a.reliability), success_rate: pct(a.successRate), technical_rate: pct(a.technicalRate), timeout_rate: pct(a.timeoutRate),
    schema_failure_rate: pct(a.schemaFailureRate), critical_rate: pct(a.criticalRate), hallucination_rate: pct(a.hallucinationRate), grounding_failure_rate: pct(a.groundingFailureRate),
    ttft_p50_ms: Math.round(percentile(a.ttft, 50)), wall_mean_ms: Math.round(mean(a.wall)), wall_p50_ms: Math.round(percentile(a.wall, 50)), wall_p90_ms: Math.round(percentile(a.wall, 90)), wall_p95_ms: Math.round(percentile(a.wall, 95)), wall_min_ms: Math.round(Math.min(...a.wall)), wall_max_ms: Math.round(Math.max(...a.wall)),
    cost_mean_usd: a.costMean.toFixed(6), cost_median_usd: a.costMedian.toFixed(6), cost_per_success_usd: a.costPerSuccess.toFixed(6),
    consistency_std: fmt(a.consistencyStd), consistency_range: fmt(a.consistencyRange), consistency_score: fmt(a.consistencyScore),
    product_score: fmt(a.productScore), production_ready: a.productionReady,
  }));
  writeFileSync(join(dir, 'summary.csv'), toCsv(summaryRows));

  // ---------- Prüfer-Übereinstimmung und Mensch ----------
  const judgeIds = [...new Set(judges.map(j => j.judgeId))];
  let judgeAgreement = '';
  if (judgeIds.length === 2) {
    const [a, b] = judgeIds;
    const pairs: [number, number][] = [];
    for (const ja of judges.filter(j => j.judgeId === a)) {
      const jb = judges.find(j => j.judgeId === b && j.caseId === ja.caseId && j.repeat === ja.repeat && j.modelId === ja.modelId);
      if (!jb) continue;
      const keys = Object.keys(ja.kriterien).filter(k => k in jb.kriterien);
      if (keys.length) pairs.push([mean(keys.map(k => ja.kriterien[k])), mean(keys.map(k => jb.kriterien[k]))]);
    }
    const mad = mean(pairs.map(([x, y]) => Math.abs(x - y))) * 100;
    const bias = new Map<string, number>();
    for (const m of modelIds) {
      const d: number[] = [];
      for (const ja of judges.filter(j => j.judgeId === a && j.modelId === m)) {
        const jb = judges.find(j => j.judgeId === b && j.caseId === ja.caseId && j.repeat === ja.repeat && j.modelId === m);
        if (!jb) continue;
        const keys = Object.keys(ja.kriterien).filter(k => k in jb.kriterien);
        d.push((mean(keys.map(k => ja.kriterien[k])) - mean(keys.map(k => jb.kriterien[k]))) * 100);
      }
      bias.set(m, mean(d));
    }
    judgeAgreement = `Mittlere absolute Abweichung der beiden Prüfer: ${fmt(mad)} Punkte (auf 0–100 je Kriterium, n = ${pairs.length}).\n\nDifferenz ${a} − ${b} je bewertetem Modell (positiv = ${a} wertet milder): ${modelIds.map(m => `${label(m)} ${fmt(bias.get(m)!)}`).join(' · ')}. Bevorzugt ein Prüfer die eigene Modellfamilie, zeigt sich das hier als systematisch höherer Wert.`;
  }
  let humanAgreement = 'Noch keine menschlichen Bewertungen importiert.';
  if (human.length) {
    const pairs = human.map(h => [h.human_score, scores.find(s => s.caseId === h.caseId && s.repeat === h.repeat && s.modelId === h.modelId)?.quality ?? NaN]).filter(([, q]) => Number.isFinite(q));
    const mad = mean(pairs.map(([hh, q]) => Math.abs(hh - q)));
    humanAgreement = `${human.length} blinde menschliche Bewertungen. Mittlere absolute Abweichung Mensch vs. automatische Qualität: ${fmt(mad)} Punkte; Mittel Mensch ${fmt(mean(pairs.map(p => p[0])))} vs. automatisch ${fmt(mean(pairs.map(p => p[1])))}.`;
  }

  // ---------- Markdown ----------
  const md: string[] = [];
  const repeats = meta.run.repeat;
  md.push(`# StudeArc KI-Benchmark: ${runId}`);
  md.push(`Datensatz **${meta.datasetVersion}** · ${meta.cases} Testfälle · ${repeats} Wiederholung(en) · Git ${meta.gitCommit} · ${meta.startedAt?.slice(0, 16)}`);
  if (repeats < 3) md.push(`\n> **Probelauf:** nur ${repeats} Wiederholung und wenige Fälle je Funktion. Konfidenzintervalle sind entsprechend breit, Konsistenz ist nicht messbar. Für Entscheidungen den vollen Lauf abwarten.`);
  md.push(`\n## Management-Zusammenfassung\n`);
  for (const s of statements) md.push(`- ${s}`);
  md.push(`\n## Empfehlung je Funktion\n\n| Funktion | Modell | Begründung |\n|---|---|---|`);
  for (const r of recommendations) md.push(`| ${FEATURE_INFO[r.feature].label} | ${r.ready ? '' : '⚠️ '}${label(r.model)} | ${r.why} |`);

  md.push(`\n## Production Gates\n\nProduktentscheidungen, keine Naturgesetze: Qualität ≥ ${GATES.minQuality}, kritische Fehler < ${GATES.maxCriticalErrorRate * 100} %, Schemafehler < ${GATES.maxSchemaFailureRate * 100} %, technische Fehler < ${GATES.maxTechnicalFailureRate * 100} %. Modelle, die ein Gate verfehlen, gelten als **nicht produktionsreif**, auch wenn sie billig oder schnell sind.`);

  md.push(`\n## Tabelle 1 – Gesamt\n\n| Modell | Qualität (95 %-KI) | Reliability | p50 | p95 | Kosten/Task | Produkt-Score | Produktionsreif |\n|---|---|---|---|---|---|---|---|`);
  for (const a of [...overall].sort((x, y) => y.productScore - x.productScore)) md.push(`| ${label(a.modelId)} | ${fmt(a.quality)} (${fmt(a.qualityCI[0])}–${fmt(a.qualityCI[1])}) | ${fmt(a.reliability)} | ${sec(percentile(a.wall, 50))} | ${sec(percentile(a.wall, 95))} | ${ct(a.costMean)} | ${fmt(a.productScore)} | ${a.productionReady ? 'ja' : 'nein'} |`);

  md.push(`\n## Tabelle 2 – pro Funktion\n\n| Funktion | Modell | Qualität | Krit. Fehler | p50 | p95 | Kosten/Task | Produkt-Score | Gates |\n|---|---|---|---|---|---|---|---|---|`);
  for (const [f, aggs] of perFeature) for (const a of aggs) md.push(`| ${FEATURE_INFO[f].label} | ${label(a.modelId)} | ${fmt(a.quality)} | ${pct(a.criticalRate, 0)} | ${sec(percentile(a.wall, 50))} | ${sec(percentile(a.wall, 95))} | ${ct(a.costMean)} | ${fmt(a.productScore)} | ${Object.entries(a.gates).filter(([, v]) => !v).map(([k]) => k).join(', ') || 'alle erfüllt'} |`);

  md.push(`\n## Tabelle 3 – Fehler\n\n| Modell | Halluzination | Grounding-Fehler | Schemafehler | Timeout | Technischer Fehler | Krit. Fehler |\n|---|---|---|---|---|---|---|`);
  for (const a of overall) md.push(`| ${label(a.modelId)} | ${pct(a.hallucinationRate)} | ${pct(a.groundingFailureRate)} | ${pct(a.schemaFailureRate)} | ${pct(a.timeoutRate)} | ${pct(a.apiErrorRate)} | ${pct(a.criticalRate)} |`);
  md.push(`\nTechnische Fehler (API, Netz, Timeout) sind getrennt von Modellfehlern (Schema, Inhalt) ausgewiesen.`);

  md.push(`\n## Tabelle 4 – Kosten\n\n| Modell | Kosten/Task | Median | je erfolgreichem Task | je 100 | je 1.000 | je 10.000 |\n|---|---|---|---|---|---|---|`);
  for (const a of overall) md.push(`| ${label(a.modelId)} | ${ct(a.costMean)} | ${ct(a.costMedian)} | ${ct(a.costPerSuccess)} | ${usd(a.costMean * 100)} | ${usd(a.costMean * 1000)} | ${usd(a.costMean * 10000)} |`);
  md.push(`\nKosten aus echten Token-Zahlen × Listenpreis (benchmark.config.ts), ohne Cache-Rabatt. Denk-Tokens zählen als Ausgabe.`);

  md.push(`\n## Tabelle 5 – Konsistenz\n\n| Modell | Mittel | StdAbw | Spannweite | Consistency Score |\n|---|---|---|---|---|`);
  for (const a of overall) md.push(`| ${label(a.modelId)} | ${fmt(a.quality)} | ${fmt(a.consistencyStd)} | ${fmt(a.consistencyRange)} | ${fmt(a.consistencyScore)} |`);
  md.push(`\nConsistency Score = 100 − mittlere Spannweite der det/gold-Punkte über die Wiederholungen desselben Testfalls (Prüfer bewerten nur Runde 1). Qualität, kritische Fehler und Halluzinationen stammen aus den geprüften Antworten (Runde 1); Schema-, technische Fehler, Latenz und Kosten aus allen Runden.`);

  md.push(`\n## Latenz im Detail\n\n| Funktion | Modell | TTFT p50 | Mittel | p50 | p90 | p95 | Min | Max |\n|---|---|---|---|---|---|---|---|---|`);
  for (const [f, aggs] of perFeature) for (const a of aggs) md.push(`| ${FEATURE_INFO[f].label} | ${label(a.modelId)} | ${sec(percentile(a.ttft, 50))} | ${sec(mean(a.wall))} | ${sec(percentile(a.wall, 50))} | ${sec(percentile(a.wall, 90))} | ${sec(percentile(a.wall, 95))} | ${sec(Math.min(...a.wall))} | ${sec(Math.max(...a.wall))} |`);
  md.push(`\nGemessen über direkte API-Aufrufe (gestreamt), ohne CLI-Startzeit; Warm-up nicht gewertet. Gesamtzeit inkl. eventueller Wiederholungen nach technischen Fehlern.`);

  md.push(`\n## Rankings\n`);
  const rank = (title: string, key: (a: Agg) => number, fmtv: (a: Agg) => string) => {
    md.push(`**${title}**\n`);
    [...overall].sort((x, y) => key(y) - key(x)).forEach((a, i) => md.push(`${i + 1}. ${label(a.modelId)}: ${fmtv(a)}${a.productionReady ? '' : ' (nicht produktionsreif)'}`));
    md.push('');
  };
  rank('1. Quality Ranking (Qualität + Reliability)', a => a.qualityRankScore, a => fmt(a.qualityRankScore));
  rank('2. Cost-Efficiency Ranking (Qualitätspunkte je Cent pro 1.000 Tasks)', a => a.costEfficiency, a => fmt(a.costEfficiency, 2));
  rank('3. Product Ranking (Produkt-Score)', a => a.productScore, a => fmt(a.productScore));
  md.push(`**Pareto-Analyse** (nicht gleichzeitig bei Qualität, Kosten und p50 dominiert):\n`);
  md.push(`- Gesamt: ${pareto(overall).map(a => label(a.modelId)).join(', ')}`);
  for (const [f, aggs] of perFeature) md.push(`- ${FEATURE_INFO[f].label}: ${pareto(aggs).map(a => label(a.modelId)).join(', ')}`);

  md.push(`\n## Prüfer und Menschen\n\n${judgeAgreement || 'Nur ein Prüfer oder keine Prüferdaten.'}\n\n${humanAgreement}`);

  md.push(`\n## Rubriken\n`);
  for (const f of features) md.push(`- **${FEATURE_INFO[f].label}:** ${RUBRICS[f].map(k => `${k.label} ${k.max} (${k.source})`).join(' · ')}`);

  md.push(`\n## Anbieter-Unterschiede (dokumentiert)\n`);
  const notes = new Map<string, Set<string>>();
  for (const r of raw) for (const n of r.providerNotes) { const k = `${label(r.modelId)}`; notes.set(k, (notes.get(k) ?? new Set()).add(n)); }
  for (const [m, ns] of notes) md.push(`- ${m}: ${[...ns].join('; ')}`);
  if (meta.schemaModes) md.push(`- Claude-Schemas: ${JSON.stringify(meta.schemaModes)} (tool = zu komplex für Structured Outputs, Werkzeugaufruf ohne Format-Garantie)`);

  writeFileSync(join(dir, 'report.md'), md.join('\n') + '\n');
  writeFileSync(join(dir, 'report.html'), toHtml(runId, md.join('\n')));
  console.log(`Bericht: ${dir}/report.md, report.html, summary.csv, requests.csv`);
};

// Minimaler Markdown→HTML-Umsetzer für Tabellen, Listen, Überschriften, Fett.
const toHtml = (title: string, md: string) => {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  const out: string[] = [];
  const lines = md.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith('|')) {
      const rows: string[] = [];
      while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++]);
      i--;
      const cells = (r: string) => r.slice(1, -1).split('|').map(c => c.trim());
      out.push(`<div class="tw"><table><thead><tr>${cells(rows[0]).map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows.slice(2).map(r => `<tr>${cells(r).map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
    } else if (l.startsWith('# ')) out.push(`<h1>${inline(l.slice(2))}</h1>`);
    else if (l.startsWith('## ')) out.push(`<h2>${inline(l.slice(3))}</h2>`);
    else if (l.startsWith('  - ')) out.push(`<li class="sub">${inline(l.slice(4))}</li>`);
    else if (l.startsWith('- ')) out.push(`<li>${inline(l.slice(2))}</li>`);
    else if (/^\d+\. /.test(l)) out.push(`<li class="n">${inline(l)}</li>`);
    else if (l.startsWith('> ')) out.push(`<p class="note">${inline(l.slice(2))}</p>`);
    else if (l.trim()) out.push(`<p>${inline(l)}</p>`);
  }
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>KI-Benchmark ${esc(title)}</title>
<style>
:root{--bg:#fafaf8;--fg:#1d1d1b;--mut:#6b6b66;--line:#e3e2dc;--acc:#2f6f5e;--warn:#9a5b00}
@media (prefers-color-scheme:dark){:root{--bg:#171716;--fg:#ecebe6;--mut:#a3a29c;--line:#34332f;--acc:#7cc4ad;--warn:#e0a54a}}
body{background:var(--bg);color:var(--fg);font:15px/1.55 system-ui,-apple-system,sans-serif;max-width:1180px;margin:0 auto;padding:24px 16px}
h1{font-size:22px}h2{font-size:17px;margin-top:32px;border-bottom:1px solid var(--line);padding-bottom:4px}
.tw{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:13px;margin:8px 0}
th,td{border-bottom:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}th{color:var(--mut);font-weight:600}
li{margin:4px 0 4px 18px}li.sub{margin-left:40px;color:var(--mut);font-size:14px}li.n{list-style:none;margin-left:0}.note{border-left:3px solid var(--warn);padding:6px 10px;color:var(--fg)}
strong{color:var(--acc)}
</style></head><body>${out.join('\n')}</body></html>`;
};
