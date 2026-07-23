import type { BloomLevel, ExamQuestion, ExamTypePreset } from '../types';

export const BLOOM_LEVEL_LABELS: Record<BloomLevel, string> = {
  erinnern: 'Erinnern', verstehen: 'Verstehen', anwenden: 'Anwenden',
  analysieren: 'Analysieren', bewerten: 'Bewerten', erschaffen: 'Erschaffen',
};

export const BLOOM_LEVELS: BloomLevel[] = ['erinnern', 'verstehen', 'anwenden', 'analysieren', 'bewerten', 'erschaffen'];

/**
 * Zielprofile in Prozent, kein exaktes Soll — bei 10-20 Fragen ohnehin nicht exakt
 * erreichbar. Fließt als weiche Gewichtung in den Generierungs-Prompt ein
 * (buildBloomTargetLine), keine Nachgenerierungs-/Validierungsschleife.
 * "erschaffen" bewusst bei 0 in allen Presets — in einer zeitlich begrenzten
 * Klausur wird selten echtes Neu-Konstruieren verlangt.
 */
export const EXAM_TYPE_BLOOM_TARGETS: Record<ExamTypePreset, Record<BloomLevel, number>> = {
  wissensabfrage:       { erinnern: 45, verstehen: 35, anwenden: 15, analysieren: 5,  bewerten: 0,  erschaffen: 0 },
  universitaetsklausur: { erinnern: 10, verstehen: 20, anwenden: 35, analysieren: 25, bewerten: 10, erschaffen: 0 },
  transfer:             { erinnern: 5,  verstehen: 15, anwenden: 45, analysieren: 25, bewerten: 10, erschaffen: 0 },
  gemischt:             { erinnern: 20, verstehen: 25, anwenden: 25, analysieren: 20, bewerten: 10, erschaffen: 0 },
};

export function buildBloomTargetLine(preset: ExamTypePreset): string {
  const targets = EXAM_TYPE_BLOOM_TARGETS[preset];
  const parts = BLOOM_LEVELS
    .filter(level => targets[level] > 0)
    .map(level => `${targets[level]}% ${BLOOM_LEVEL_LABELS[level]}`);
  return `\nZIEL-VERTEILUNG DER KOGNITIVEN ANFORDERUNG (Näherungswert, KEINE exakte Quote — als Gewichtung beim Generieren verstehen, nicht als starre Vorgabe): ca. ${parts.join(', ')}.\n`;
}

/**
 * Tatsächliche Bloom-Verteilung einer generierten/abgelegten Klausur in Prozent,
 * gerundet. Fragen ohne bloomLevel (z.B. Klassifikation fehlgeschlagen oder
 * ältere Klausur von vor Phase 2a) zählen nicht mit — weder im Zähler noch im
 * Nenner, damit fehlende Labels die Verteilung nicht künstlich verzerren.
 */
export function computeActualBloomDistribution(questions: { bloomLevel?: BloomLevel }[]): Record<BloomLevel, number> {
  const empty = Object.fromEntries(BLOOM_LEVELS.map(l => [l, 0])) as Record<BloomLevel, number>;
  const labeled = questions.filter(q => q.bloomLevel);
  if (labeled.length === 0) return empty;
  const counts = { ...empty };
  labeled.forEach(q => { counts[q.bloomLevel as BloomLevel]++; });
  const result = { ...empty };
  BLOOM_LEVELS.forEach(l => { result[l] = Math.round((counts[l] / labeled.length) * 100); });
  return result;
}

/**
 * Merged Klassifikations-Ergebnisse in die Originalfragen. Fragen ohne Treffer in
 * `labels` behalten `bloomLevel: undefined` — kein erzwungener Default, damit sie
 * einfach aus einer späteren Ist-Verteilungs-Anzeige herausfallen statt eine falsche
 * Stufe vorzutäuschen.
 */
export function mergeBloomLevels(
  questions: ExamQuestion[],
  labels: { id: string; bloomLevel?: BloomLevel }[]
): ExamQuestion[] {
  const byId = new Map(labels.filter(l => l.bloomLevel).map(l => [l.id, l.bloomLevel]));
  return questions.map(q => byId.has(q.id) ? { ...q, bloomLevel: byId.get(q.id) } : q);
}
