// Blinde menschliche Bewertung: exportiert eine Stichprobe als lokale HTML-Seite (Modelle anonymisiert),
// die Bewertungen werden als JSON heruntergeladen und mit human-import eingelesen.
import { mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { FEATURE_INFO, type TestCase } from '../features.ts';
import { resolveSource } from '../sources.ts';
import { BENCH_DIR, type RawRecord } from '../runners/run.ts';
import { RUBRICS } from './rubrics.ts';
import { loadCases, readJsonl } from './judge.ts';

const seeded = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

export const exportHuman = async (runId: string, share: number) => {
  const dir = join(BENCH_DIR, 'results', runId);
  const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
  const cases = loadCases(meta.datasetVersion);
  const raw = readJsonl<RawRecord>(join(dir, 'raw.jsonl')).filter(r => r.status === 'ok' && r.repeat === 1);
  const rnd = seeded(2026);
  // Je Funktion gleich viele Fälle (mind. 1), alle Modelle des Falls, Reihenfolge gemischt.
  const byFeature = new Map<string, string[]>();
  for (const c of cases.values()) byFeature.set(c.feature, [...(byFeature.get(c.feature) ?? []), c.id]);
  const items: { key: string; case: TestCase; source: string; text: string }[] = [];
  const keyMap: Record<string, { caseId: string; modelId: string; repeat: number }> = {};
  for (const ids of byFeature.values()) {
    const n = Math.max(1, Math.round(ids.length * share));
    const pick = [...ids].sort(() => rnd() - 0.5).slice(0, n);
    for (const id of pick) {
      const recs = raw.filter(r => r.caseId === id).sort(() => rnd() - 0.5);
      for (const r of recs) {
        const key = `h${Object.keys(keyMap).length + 1}`;
        keyMap[key] = { caseId: r.caseId, modelId: r.modelId, repeat: r.repeat };
        items.push({ key, case: cases.get(id)!, source: resolveSource(cases.get(id)!.source), text: r.text });
      }
    }
  }
  const hdir = join(BENCH_DIR, 'human', runId);
  mkdirSync(hdir, { recursive: true });
  // Schlüssel (welches Modell) bleibt getrennt von der Bewertungsseite.
  writeFileSync(join(hdir, 'schluessel.json'), JSON.stringify(keyMap, null, 2));
  const data = items.map(i => ({
    key: i.key, feature: FEATURE_INFO[i.case.feature].label, caseId: i.case.id,
    task: JSON.stringify(i.case.input, null, 1).slice(0, 4000), notes: i.case.notes ?? '',
    source: i.source.slice(0, 60_000), output: (() => { try { return JSON.stringify(JSON.parse(i.text), null, 1); } catch { return i.text; } })(),
    rubric: RUBRICS[i.case.feature].map(k => `${k.label} (${k.max})`),
  }));
  writeFileSync(join(hdir, 'bewerten.html'), page(runId, data));
  console.log(`${items.length} Antworten (${byFeature.size} Funktionen) → ${hdir}/bewerten.html\nNach dem Bewerten: Datei speichern, dann npm run benchmark -- human-import --run ${runId} --file <pfad>`);
};

export const importHuman = async (runId: string, file: string) => {
  const keyMap = JSON.parse(readFileSync(join(BENCH_DIR, 'human', runId, 'schluessel.json'), 'utf8'));
  const ratings: { key: string; score: number; evaluator: string; comment?: string }[] = JSON.parse(readFileSync(file, 'utf8'));
  const out = join(BENCH_DIR, 'results', runId, 'human.jsonl');
  for (const r of ratings) {
    const k = keyMap[r.key];
    if (!k || !Number.isFinite(r.score)) continue;
    appendFileSync(out, JSON.stringify({ ...k, test_case_id: k.caseId, human_score: r.score, evaluator_id: r.evaluator, comment: r.comment ?? '' }) + '\n');
  }
  console.log(`${ratings.length} Bewertungen importiert → ${out}`);
};

const page = (runId: string, data: unknown) => `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Blindbewertung</title><style>
:root{--bg:#fafaf8;--fg:#1d1d1b;--mut:#6b6b66;--line:#e3e2dc;--acc:#2f6f5e;--card:#fff}
@media (prefers-color-scheme:dark){:root{--bg:#171716;--fg:#ecebe6;--mut:#a3a29c;--line:#34332f;--acc:#7cc4ad;--card:#1f1f1d}}
body{background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif;max-width:1200px;margin:0 auto;padding:16px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}@media(max-width:800px){.grid{grid-template-columns:1fr}}
pre{white-space:pre-wrap;word-break:break-word;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px;max-height:60vh;overflow:auto;font-size:13px}
.bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;position:sticky;top:0;background:var(--bg);padding:8px 0;border-bottom:1px solid var(--line)}
button,input{font:inherit;padding:6px 12px;border-radius:10px;border:1px solid var(--line);background:var(--card);color:var(--fg)}
button.primary{background:var(--acc);color:#fff;border:0}.mut{color:var(--mut);font-size:13px}
</style></head><body>
<div class="bar"><strong id="pos"></strong><button id="prev">Zurück</button><button id="next">Weiter</button>
<label>Punkte 0–100 <input id="score" type="number" min="0" max="100" style="width:80px"></label>
<input id="comment" placeholder="Kommentar (optional)" style="flex:1;min-width:160px">
<label>Kürzel <input id="ev" style="width:70px"></label><button class="primary" id="save">Bewertungen speichern</button></div>
<p class="mut">Lauf ${runId}. Du siehst nicht, welches Modell geantwortet hat. Bewerte jede Antwort für sich nach der Rubrik, gemessen an der Quelle.</p>
<h2 id="feat"></h2><p id="rubric" class="mut"></p><p id="notes" class="mut"></p>
<div class="grid"><div><h3>Aufgabe</h3><pre id="task"></pre><h3>Quelle</h3><pre id="source"></pre></div><div><h3>Antwort</h3><pre id="output"></pre></div></div>
<script>
const D=${JSON.stringify(data)};let i=0;const R={};
try{Object.assign(R,JSON.parse(localStorage.getItem('blind_${runId}')||'{}'))}catch{}
const $=id=>document.getElementById(id);
function show(){const d=D[i];$('pos').textContent=(i+1)+' / '+D.length+' ('+Object.keys(R).length+' bewertet)';$('feat').textContent=d.feature+' · '+d.caseId;$('rubric').textContent='Rubrik: '+d.rubric.join(' · ');$('notes').textContent=d.notes?'Hinweis: '+d.notes:'';$('task').textContent=d.task;$('source').textContent=d.source||'(keine Quelle)';$('output').textContent=d.output;$('score').value=R[d.key]?.score??'';$('comment').value=R[d.key]?.comment??''}
function keep(){const v=$('score').value;if(v!==''){R[D[i].key]={key:D[i].key,score:Number(v),comment:$('comment').value,evaluator:$('ev').value||'anon'}}try{localStorage.setItem('blind_${runId}',JSON.stringify(R))}catch{}}
$('next').onclick=()=>{keep();if(i<D.length-1)i++;show()};$('prev').onclick=()=>{keep();if(i>0)i--;show()};
$('save').onclick=()=>{keep();const ev=$('ev').value||'anon';const out=Object.values(R).map(r=>({...r,evaluator:ev}));const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(out,null,1)],{type:'application/json'}));a.download='bewertungen_${runId}.json';a.click()};
show();
</script></body></html>`;
