// Führt alle aufgezeichneten App-Anfragen gegen alle aktiven Modelle aus.
// Speichert JEDEN Aufruf (auch Fehler) in results/<runId>/raw.jsonl; nichts wird gelöscht oder ausgewählt.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { MODELS, RUN, DATASET_VERSION, priceFor, type ModelConfig } from '../benchmark.config.ts';
import { adapterFor } from '../models/index.ts';
import { prepareSchemas } from '../models/anthropic.ts';
import { ModelCallError, type AppRequest } from '../models/types.ts';

export const BENCH_DIR = join(import.meta.dirname, '..');

export interface RawRecord {
  runId: string;
  datasetVersion: string;
  caseId: string;
  feature: string;
  modelId: string;
  repeat: number;
  status: 'ok' | 'technical_error';
  failureKind?: string;
  failureMessage?: string;
  attempts: number;
  text: string;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  totalTokens: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
  requestStart: string;
  ttftMs: number | null;
  completionMs: number | null;
  totalWallMs: number;
  stopReason: string | null;
  providerNotes: string[];
}

interface Job { caseId: string; feature: string; request: AppRequest; model: ModelConfig; repeat: number }

// Fester Seed: gleiche Reihenfolge bei jedem Lauf, Modelle trotzdem zeitlich gemischt.
const shuffle = <T,>(arr: T[], seed = 42): T[] => {
  const a = [...arr];
  let s = seed;
  const rnd = () => ((s = (s * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

export const callWithPolicy = async (model: ModelConfig, request: AppRequest) => {
  const maxOutputTokens = request.examWorkflow ? RUN.maxOutputTokensExam : RUN.maxOutputTokens;
  const wallStart = performance.now();
  const requestStart = new Date().toISOString();
  let attempts = 0;
  let lastErr: ModelCallError | null = null;
  for (let a = 0; a <= RUN.retries; a++) {
    attempts++;
    try {
      const r = await adapterFor(model).call(request, model, { maxOutputTokens, signal: AbortSignal.timeout(RUN.timeoutMs) });
      return { ok: true as const, r, attempts, requestStart, totalWallMs: performance.now() - wallStart };
    } catch (e: any) {
      lastErr = e instanceof ModelCallError ? e : new ModelCallError('api_error', String(e?.message ?? e), false);
      if (!lastErr.retryable || a === RUN.retries) break;
      await new Promise(res => setTimeout(res, 1000 * 2 ** a));
    }
  }
  return { ok: false as const, err: lastErr!, attempts, requestStart, totalWallMs: performance.now() - wallStart };
};

const toRecord = (runId: string, job: Job, res: Awaited<ReturnType<typeof callWithPolicy>>): RawRecord => {
  const base = { runId, datasetVersion: DATASET_VERSION, caseId: job.caseId, feature: job.feature, modelId: job.model.id, repeat: job.repeat, attempts: res.attempts, requestStart: res.requestStart, totalWallMs: Math.round(res.totalWallMs) };
  if (!res.ok) {
    return { ...base, status: 'technical_error', failureKind: res.err.kind, failureMessage: res.err.message.slice(0, 500), text: '', inputTokens: 0, outputTokens: 0, thinkingTokens: 0, totalTokens: 0, inputCost: 0, outputCost: 0, totalCost: 0, ttftMs: null, completionMs: null, stopReason: null, providerNotes: [] };
  }
  const r = res.r;
  const p = priceFor(job.model, r.inputTokens);
  const inputCost = r.inputTokens / 1e6 * p.inputPricePerMillion;
  const outputCost = r.outputTokens / 1e6 * p.outputPricePerMillion;
  return {
    ...base, status: 'ok', text: r.text,
    inputTokens: r.inputTokens, outputTokens: r.outputTokens, thinkingTokens: r.thinkingTokens, totalTokens: r.inputTokens + r.outputTokens,
    inputCost, outputCost, totalCost: inputCost + outputCost,
    ttftMs: r.ttftMs === null ? null : Math.round(r.ttftMs), completionMs: Math.round(r.completionMs),
    stopReason: r.stopReason, providerNotes: r.providerNotes,
  };
};

const WARMUP_REQUEST: AppRequest = { parts: [{ text: 'Antworte nur mit: ok' }], config: { temperature: 0, thinkingConfig: { thinkingBudget: 0 } } };

export const runBenchmark = async (opts: { features?: string[]; models?: string[]; repeat?: number; resume?: string }) => {
  const dsDir = join(BENCH_DIR, 'datasets', DATASET_VERSION);
  const reqFile = join(dsDir, 'requests.jsonl');
  if (!existsSync(reqFile)) throw new Error(`${reqFile} fehlt: zuerst npm run benchmark:capture`);
  const requests = readFileSync(reqFile, 'utf8').trim().split('\n').map(l => JSON.parse(l) as { caseId: string; feature: string; request: AppRequest })
    .filter(r => !opts.features?.length || opts.features.includes(r.feature));
  const models = MODELS.filter(m => m.enabled && (!opts.models?.length || opts.models.some(x => m.id === x || m.id.startsWith(x))));
  if (!models.length) throw new Error('Kein Modell ausgewählt/aktiv.');
  const repeat = opts.repeat ?? RUN.repeat;

  const runId = opts.resume ?? `${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}_${DATASET_VERSION}`;
  const outDir = join(BENCH_DIR, 'results', runId);
  mkdirSync(outDir, { recursive: true });
  const rawFile = join(outDir, 'raw.jsonl');
  const done = new Set<string>();
  if (opts.resume && existsSync(rawFile)) {
    for (const l of readFileSync(rawFile, 'utf8').trim().split('\n').filter(Boolean)) {
      const r = JSON.parse(l) as RawRecord;
      done.add(`${r.caseId}|${r.modelId}|${r.repeat}`);
    }
  } else {
    let commit = 'unbekannt';
    try { commit = execSync('git rev-parse --short HEAD', { cwd: BENCH_DIR }).toString().trim(); } catch { /* egal */ }
    writeFileSync(join(outDir, 'meta.json'), JSON.stringify({
      runId, datasetVersion: DATASET_VERSION, gitCommit: commit, startedAt: new Date().toISOString(),
      models, run: { ...RUN, repeat }, features: [...new Set(requests.map(r => r.feature))], cases: requests.length,
    }, null, 2));
  }

  // Warm-up (verworfen)
  console.log(`Warm-up: ${RUN.warmup} Anfragen je Modell (nicht gewertet)`);
  await Promise.all(models.map(async m => { for (let i = 0; i < RUN.warmup; i++) await callWithPolicy(m, WARMUP_REQUEST); }));
  const schemas = [...new Map(requests.filter(r => r.request.config?.responseSchema).map(r => [JSON.stringify(r.request.config!.responseSchema), r.request.config!.responseSchema])).values()];
  const claudeModels = [...new Set(models.filter(m => m.provider === 'anthropic').map(m => m.apiModel))];
  for (const apiModel of claudeModels) {
    console.log(`Schemas für ${apiModel} vorbereiten (${schemas.length} Stück, nicht gewertet) …`);
    const modes = await prepareSchemas(schemas, apiModel);
    console.log(modes);
    const metaFile = join(outDir, 'meta.json');
    const meta = JSON.parse(readFileSync(metaFile, 'utf8'));
    writeFileSync(metaFile, JSON.stringify({ ...meta, schemaModes: { ...(meta.schemaModes ?? {}), [apiModel]: modes } }, null, 2));
  }

  const jobs: Job[] = shuffle(requests.flatMap(r => models.flatMap(m =>
    Array.from({ length: repeat }, (_, k) => ({ caseId: r.caseId, feature: r.feature, request: r.request, model: m, repeat: k + 1 })))))
    .filter(j => !done.has(`${j.caseId}|${j.model.id}|${j.repeat}`));
  console.log(`${runId}: ${jobs.length} Aufrufe (${requests.length} Fälle × ${models.length} Modelle × ${repeat})`);

  const byProvider = new Map<string, Job[]>();
  for (const j of jobs) byProvider.set(j.model.provider, [...(byProvider.get(j.model.provider) ?? []), j]);
  let finished = 0;
  const t0 = Date.now();
  await Promise.all([...byProvider.values()].map(queue => {
    let next = 0;
    return Promise.all(Array.from({ length: RUN.concurrencyPerProvider }, async () => {
      while (next < queue.length) {
        const job = queue[next++];
        const rec = toRecord(runId, job, await callWithPolicy(job.model, job.request));
        appendFileSync(rawFile, JSON.stringify(rec) + '\n');
        finished++;
        const tag = rec.status === 'ok' ? `${(rec.totalWallMs / 1000).toFixed(1)} s ${(rec.totalCost * 100).toFixed(3)} ct` : `FEHLER ${rec.failureKind}`;
        console.log(`[${finished}/${jobs.length} ${Math.round((Date.now() - t0) / 1000)} s] ${job.caseId} ${job.model.id} #${job.repeat}: ${tag}`);
      }
    }));
  }));
  writeFileSync(join(outDir, 'meta.json'), JSON.stringify({ ...JSON.parse(readFileSync(join(outDir, 'meta.json'), 'utf8')), finishedAt: new Date().toISOString() }, null, 2));
  return runId;
};
