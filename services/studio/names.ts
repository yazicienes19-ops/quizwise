import type { Unit } from './types';
import { nameVariants } from './text';
import { STUDIO_TEMPERATURE, type StudioLlm } from './llm';

/**
 * Namen, die die Folien in zwei Schreibweisen nennen (Review 17.10.: „Wellford“ 3×, „Welford“ 2×; korrekt ist
 * Welford): ein kleiner Aufruf klärt die korrekte Form, der Code vereinheitlicht die Einheiten vor dem Schreiben.
 * Ohne Antwort gilt die häufigere Form.
 */
type Named = Pick<Unit, 'title' | 'text' | 'study'>;

export const resolveNameVariants = async (units: Named[], llm: StudioLlm): Promise<Map<string, string>> => {
  const variants = nameVariants(units);
  const replace = new Map<string, string>();
  if (!variants.length) return replace;
  const context = (name: string) => units.find(u => `${u.title ?? ''} ${u.text}`.includes(name))?.text.replace(/\s+/g, ' ').slice(0, 200) ?? '';
  let answer: Record<string, string> = {};
  try {
    const raw = await llm({
      step: 'names', heavy: true, temperature: STUDIO_TEMPERATURE.names, maxOutputTokens: 800,
      prompt: `Folien schreiben diese Namen von Forschenden in zwei Formen. Nenne je Paar die korrekte Schreibweise des Namens,
wie sie in der Fachliteratur steht. Weißt du es nicht sicher, nimm die häufigere Form.
${variants.map((v, i) => `${i + 1}. ${v.forms[0]} (${v.counts[0]}×) / ${v.forms[1]} (${v.counts[1]}×), Kontext: ${context(v.forms[0]) || context(v.forms[1])}`).join('\n')}`,
      schema: { type: 'OBJECT', properties: { names: { type: 'ARRAY', items: { type: 'OBJECT', properties: { index: { type: 'INTEGER' }, correct: { type: 'STRING' } }, required: ['index', 'correct'] } } }, required: ['names'] },
    });
    for (const n of (raw as { names?: { index?: number; correct?: string }[] })?.names ?? []) if (n.index && n.correct) answer[String(n.index)] = n.correct.trim();
  } catch { answer = {}; }
  variants.forEach((v, i) => {
    const pick = answer[String(i + 1)];
    const correct = v.forms.includes(pick) ? pick : v.counts[0] >= v.counts[1] ? v.forms[0] : v.forms[1];
    const wrong = v.forms.find(f => f !== correct)!;
    replace.set(wrong, correct);
  });
  return replace;
};

/** Ersetzt die falschen Formen in Titel, Text und Studienangaben der Einheiten. */
export const applyNameFixes = <T extends Named>(units: T[], replace: Map<string, string>): T[] => {
  if (!replace.size) return units;
  const fix = (t: string) => [...replace].reduce((acc, [w, c]) => acc.replace(new RegExp(`\\b${w}\\b`, 'g'), c), t);
  return units.map(u => ({
    ...u, text: fix(u.text), ...(u.title ? { title: fix(u.title) } : {}),
    ...(u.study ? { study: { ...u.study, ...(u.study.authors ? { authors: fix(u.study.authors) } : {}) } } : {}),
  }));
};
