// Inhaltsprüfer: bewertet die judge-/mix-Kriterien per Checkliste gegen die Quelle.
// Pro (Testfall, Wiederholung) sieht ein Prüfer alle Modellantworten gemischt als A, B, C …,
// nie den Modellnamen, und bewertet jede ABSOLUT nach der Rubrik.
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JUDGES, RUN, type ModelConfig } from '../benchmark.config.ts';
import { adapterFor } from '../models/index.ts';
import { FEATURE_INFO, type Feature, type TestCase } from '../features.ts';
import { resolveSource } from '../sources.ts';
import { BENCH_DIR, type RawRecord } from '../runners/run.ts';
import { RUBRICS, CRITICAL_TYPES } from './rubrics.ts';

export interface JudgeRecord {
  judgeId: string;
  caseId: string;
  repeat: number;
  modelId: string;
  label: string;
  status: 'ok' | 'error';
  error?: string;
  kriterien: Record<string, number>;
  begruendungen: Record<string, string>;
  aussagen: { gestuetzt: number; widerspricht_quelle: number; nicht_in_quelle: number };
  kritische_fehler: { typ: string; beschreibung: string }[];
  halluzination: boolean;
}

export const loadCases = (datasetVersion: string): Map<string, TestCase> => {
  const dir = join(BENCH_DIR, 'datasets', datasetVersion, 'cases');
  const map = new Map<string, TestCase>();
  for (const f of Object.keys(RUBRICS)) {
    const file = join(dir, `${f}.json`);
    if (!existsSync(file)) continue;
    for (const c of JSON.parse(readFileSync(file, 'utf8')) as TestCase[]) map.set(c.id, c);
  }
  return map;
};

export const readJsonl = <T,>(file: string): T[] =>
  existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l) as T) : [];

const describeTask = (c: TestCase): string => {
  const i = c.input;
  switch (c.feature) {
    case 'quiz': return `Erstelle ein Quiz mit ${i.count} Fragen${i.questionType ? ` (nur Typen: ${i.questionType.join(', ')})` : ' (gemischte Fragetypen)'}${i.focus ? `, Fokus: ${i.focus}` : ''}.`;
    case 'karten': return `Erstelle ${i.count} Karteikarten aus der Quelle.`;
    case 'tutor': return `Tutor-Chat. ${i.history?.length ? `Bisheriger Verlauf:\n${i.history.map((h: any) => `${h.role === 'user' ? 'Studierende' : 'Tutor'}: ${h.content}`).join('\n')}\n` : ''}Neue Frage der Studierenden: "${i.message}". Der Tutor darf nur die Quelle nutzen (kein Allgemeinwissen).`;
    case 'feynman_frage': return `Erzeuge eine Feynman-Erklärfrage zur Quelle${i.focusTopic ? ` mit Fokus "${i.focusTopic}"` : ''}.`;
    case 'feynman_bewertung': return `Bewerte diese Feynman-Erklärung.\nFrage: ${i.challenge.question}\nErklärung der Studierenden:\n"""${i.answer}"""`;
    case 'klausur': return `Erstelle eine Klausur mit ${i.count} Aufgaben, Schwierigkeit ${i.difficulty}${i.types ? `, nur Typen ${i.types.join(', ')}` : ''}.`;
    case 'korrektur': return `Korrigiere diese Klausurantworten:\n${i.questions.map((q: any) => `- [${q.id}] ${q.question} (${q.points} P.)\n  Musterlösung: ${q.solution}\n  Antwort: "${q.userAnswer}"`).join('\n')}`;
    case 'rechenweg': return `Bewerte diese Rechenwege Schritt für Schritt:\n${i.questions.map((q: any) => `- [${q.id}] ${q.question} (${q.points} P.)\n  Erwartet: ${q.expectedSteps.map((s: string, k: number) => `(${k}) ${s}`).join(' | ')}\n  Studierende: ${q.userSteps.map((s: string, k: number) => `(${k}) ${s}`).join(' | ')}`).join('\n')}`;
    case 'leser': return `Die Studierende hat im Text diese Stelle markiert und will sie erklärt bekommen: "${i.concept}".`;
    case 'studio': return `Erstelle Lernmaterial im Format "${i.format}" für das Fach ${i.subjectName}, mit Fußnoten [1] auf die Quelle.`;
    case 'selbsttest': return `Prüfe die Antwort im Selbsttest.\nFrage: ${i.question}\nMusterantwort: ${i.reference}\nAntwort der Studierenden: "${i.userAnswer}"`;
  }
};

const pretty = (text: string): string => {
  try { return JSON.stringify(JSON.parse(text), null, 1).slice(0, 40_000); } catch { return text.slice(0, 40_000); }
};

const judgeSchema = (feature: Feature) => {
  const keys = RUBRICS[feature].filter(c => c.source === 'judge' || c.source === 'mix').map(c => c.key);
  const crit = Object.fromEntries(keys.map(k => [k, { type: 'OBJECT', properties: { anteil: { type: 'NUMBER' }, begruendung: { type: 'STRING' } }, required: ['anteil', 'begruendung'] }]));
  return {
    type: 'OBJECT',
    properties: {
      bewertungen: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            label: { type: 'STRING' },
            kriterien: { type: 'OBJECT', properties: crit, required: keys },
            aussagen: { type: 'OBJECT', properties: { gestuetzt: { type: 'INTEGER' }, widerspricht_quelle: { type: 'INTEGER' }, nicht_in_quelle: { type: 'INTEGER' } }, required: ['gestuetzt', 'widerspricht_quelle', 'nicht_in_quelle'] },
            kritische_fehler: { type: 'ARRAY', items: { type: 'OBJECT', properties: { typ: { type: 'STRING', enum: CRITICAL_TYPES[feature] }, beschreibung: { type: 'STRING' } }, required: ['typ', 'beschreibung'] } },
            halluzination: { type: 'BOOLEAN' },
          },
          required: ['label', 'kriterien', 'aussagen', 'kritische_fehler', 'halluzination'],
        },
      },
    },
    required: ['bewertungen'],
  };
};

const buildPrompt = (c: TestCase, source: string, outputs: { label: string; text: string }[]): string => {
  const crits = RUBRICS[c.feature].filter(k => k.source === 'judge' || k.source === 'mix');
  return `Du bist Prüfer:in für eine Lern-App für Studierende. Bewerte mehrere anonyme KI-Antworten auf dieselbe Aufgabe.

REGELN
- Maßstab ist AUSSCHLIESSLICH die QUELLE unten. Was nicht in der Quelle steht, gilt als nicht belegt, auch wenn es allgemein stimmen mag.
- Bewerte jede Antwort ABSOLUT nach den Kriterien, nicht im Vergleich zu den anderen. Mehrere Antworten dürfen gleich gut oder gleich schlecht sein.
- Gehe als Checkliste vor: Zerlege jede Antwort in ihre Sachaussagen und prüfe jede einzeln gegen die Quelle. Zähle: gestuetzt (steht so in der Quelle), widerspricht_quelle (Quelle sagt etwas anderes), nicht_in_quelle (inhaltliche Behauptung ohne Beleg in der Quelle; Formulierungshilfen und Fragen zählen nicht).
- halluzination = true, wenn mindestens eine konkrete Sachangabe (Name, Zahl, Jahr, Zuordnung, Fakt) erfunden ist oder der Quelle widerspricht.
- kritische_fehler: nur echte, für Lernende schädliche Fehler, jeweils mit kurzer Beschreibung. Keine für Stil.
- Für jedes Kriterium: anteil von 0 bis 1 (1 = voll erfüllt) und eine kurze Begründung (1 Satz).
- Antworte für JEDE Antwort (Labels ${outputs.map(o => o.label).join(', ')}).

KRITERIEN
${crits.map(k => `- ${k.key}: ${k.label}. ${k.judgeHint ?? ''}`).join('\n')}

AUFGABE AN DIE KI (Funktion: ${FEATURE_INFO[c.feature].label})
${describeTask(c)}
${c.notes ? `\nHINWEIS FÜR PRÜFER: ${c.notes}` : ''}

=== QUELLE ===
${source || '(keine eigene Quelle; Maßstab sind Aufgabe, Musterlösung und Erwartung oben)'}
=== ENDE QUELLE ===

${outputs.map(o => `=== ANTWORT ${o.label} ===\n${pretty(o.text)}\n=== ENDE ANTWORT ${o.label} ===`).join('\n\n')}`;
};

const shuffleWithSeed = <T,>(arr: T[], seed: string): T[] => {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { h = (h * 1664525 + 1013904223) >>> 0; const j = h % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

export const runJudges = async (runId: string, opts: { judges?: string[] } = {}) => {
  const dir = join(BENCH_DIR, 'results', runId);
  const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
  const cases = loadCases(meta.datasetVersion);
  const raw = readJsonl<RawRecord>(join(dir, 'raw.jsonl')).filter(r => r.status === 'ok' && RUN.judgeRepeats.includes(r.repeat));
  const outFile = join(dir, 'judge.jsonl');
  const done = new Set(readJsonl<JudgeRecord>(outFile).filter(j => j.status === 'ok').map(j => `${j.judgeId}|${j.caseId}|${j.repeat}`));
  const judges = JUDGES.filter(j => j.enabled && (!opts.judges?.length || opts.judges.includes(j.id)));

  const groups = new Map<string, RawRecord[]>();
  for (const r of raw) groups.set(`${r.caseId}|${r.repeat}`, [...(groups.get(`${r.caseId}|${r.repeat}`) ?? []), r]);

  for (const judge of judges) {
    const todo = [...groups.entries()].filter(([k]) => !done.has(`${judge.id}|${k}`));
    console.log(`${judge.label}: ${todo.length} Gruppen`);
    const conc = 4;
    let next = 0, n = 0;
    await Promise.all(Array.from({ length: conc }, async () => {
      while (next < todo.length) {
        const [key, recs] = todo[next++];
        const c = cases.get(recs[0].caseId)!;
        const mixed = shuffleWithSeed(recs, `${judge.id}|${key}`);
        const outputs = mixed.map((r, i) => ({ label: String.fromCharCode(65 + i), text: r.text, r }));
        const rows = await judgeGroup(judge, c, outputs);
        for (const row of rows) appendFileSync(outFile, JSON.stringify(row) + '\n');
        n++;
        console.log(`[${judge.id} ${n}/${todo.length}] ${key} ${rows.every(r => r.status === 'ok') ? 'ok' : 'FEHLER ' + rows[0].error?.slice(0, 120)}`);
      }
    }));
  }
};

const judgeGroup = async (judge: ModelConfig, c: TestCase, outputs: { label: string; text: string; r: RawRecord }[]): Promise<JudgeRecord[]> => {
  const prompt = buildPrompt(c, resolveSource(c.source), outputs);
  const base = (o: typeof outputs[number]) => ({ judgeId: judge.id, caseId: c.id, repeat: o.r.repeat, modelId: o.r.modelId, label: o.label });
  let lastErr = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await adapterFor(judge).call(
        { parts: [{ text: prompt }], config: { temperature: 0, responseMimeType: 'application/json', responseSchema: judgeSchema(c.feature) } },
        judge, { maxOutputTokens: 32_768, signal: AbortSignal.timeout(900_000) });
      const parsed = JSON.parse(res.text);
      const list: any[] = parsed.bewertungen ?? parsed;
      return outputs.map(o => {
        const b = list.find(x => String(x.label).trim().toUpperCase() === o.label);
        if (!b) return { ...base(o), status: 'error' as const, error: 'Label fehlt in Prüferantwort', kriterien: {}, begruendungen: {}, aussagen: { gestuetzt: 0, widerspricht_quelle: 0, nicht_in_quelle: 0 }, kritische_fehler: [], halluzination: false };
        const kriterien: Record<string, number> = {};
        const begruendungen: Record<string, string> = {};
        for (const [k, v] of Object.entries<any>(b.kriterien ?? {})) {
          kriterien[k] = Math.max(0, Math.min(1, Number(v?.anteil ?? 0)));
          begruendungen[k] = String(v?.begruendung ?? '');
        }
        return { ...base(o), status: 'ok' as const, kriterien, begruendungen, aussagen: b.aussagen, kritische_fehler: b.kritische_fehler ?? [], halluzination: !!b.halluzination };
      });
    } catch (e: any) {
      lastErr = String(e?.message ?? e);
    }
  }
  return outputs.map(o => ({ ...base(o), status: 'error' as const, error: lastErr.slice(0, 300), kriterien: {}, begruendungen: {}, aussagen: { gestuetzt: 0, widerspricht_quelle: 0, nicht_in_quelle: 0 }, kritische_fehler: [], halluzination: false }));
};
