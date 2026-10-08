// StudeArc-KI-Benchmark. Aufruf über npm run benchmark -- [Befehl] [Optionen]
//   run (Standard)   --feature quiz,karten  --model gemini-lite,claude-haiku  --repeat 3  --resume <runId>  --all
//   judge            --run <runId>   Inhaltsprüfer (Checkliste) über alle Antworten
//   evaluate         --run <runId>   Rubrik-Punkte aus Checks, Gold und Prüfern
//   report           --run <runId>   CSV, Markdown, HTML
//   human-export     --run <runId>   blinde Bewertungsseite für Menschen
//   human-import     --run <runId> --file <bewertungen.json>
// Datensatz wählen: BENCHMARK_DATASET=v1 (Standard siehe benchmark.config.ts).
import './env.ts';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { runBenchmark, BENCH_DIR } from './runners/run.ts';

const argv = process.argv.slice(2);
const cmd = argv[0] && !argv[0].startsWith('--') ? argv.shift()! : 'run';
const opt = (name: string) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined; };
const list = (name: string) => opt(name)?.split(',').map(s => s.trim()).filter(Boolean);
// Nur echte Läufe (Zeitstempel, ohne Markierung als ungültig/Test).
const latestRun = () => readdirSync(join(BENCH_DIR, 'results')).filter(d => /^\d{4}-/.test(d) && !/_(UNGUELTIG|SCHEMATEST)/.test(d)).sort().pop();
const runArg = () => opt('run') ?? latestRun() ?? (() => { throw new Error('Kein Lauf gefunden.'); })();

switch (cmd) {
  case 'run': {
    const runId = await runBenchmark({
      features: argv.includes('--all') ? undefined : list('feature'),
      models: list('model'),
      repeat: opt('repeat') ? Number(opt('repeat')) : undefined,
      resume: opt('resume'),
    });
    console.log(`\nFertig: ${runId}\nWeiter mit: npm run benchmark -- judge --run ${runId}`);
    break;
  }
  case 'judge': {
    const { runJudges } = await import('./evaluators/judge.ts');
    await runJudges(runArg(), { judges: list('judge') });
    break;
  }
  case 'evaluate': {
    const { evaluateRun } = await import('./evaluators/evaluate.ts');
    await evaluateRun(runArg());
    break;
  }
  case 'report': {
    const { buildReport } = await import('./reports/report.ts');
    await buildReport(runArg());
    break;
  }
  case 'human-export': {
    const { exportHuman } = await import('./evaluators/human.ts');
    await exportHuman(runArg(), Number(opt('share') ?? 0.1));
    break;
  }
  case 'human-import': {
    const { importHuman } = await import('./evaluators/human.ts');
    await importHuman(runArg(), opt('file')!);
    break;
  }
  default:
    throw new Error(`Unbekannter Befehl ${cmd}`);
}
