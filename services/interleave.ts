/**
 * interleave.ts — Themen-Durchmischung (Interleaving) für Lern-Sessions.
 *
 * Lernwissenschaftlicher Hintergrund: Interleaving (Themen abwechseln statt
 * blocken) verbessert die Langzeit-Retention. Diese Funktion ordnet Items so,
 * dass nie zwei aufeinanderfolgende denselben Key (Thema/Dokument) haben —
 * sofern rechnerisch möglich.
 */

/**
 * Greedy Round-Robin: verteilt Items so, dass aufeinanderfolgende Items
 * möglichst unterschiedliche Keys haben. Deterministisch (kein Zufall),
 * Insertion-Order innerhalb eines Keys bleibt erhalten.
 *
 * Ist eine konfliktfreie Anordnung unmöglich (z.B. AAAB), clustern die
 * Rest-Items am Ende.
 */
export function interleaveByKey<T>(items: T[], keyFn: (item: T) => string): T[] {
  if (items.length <= 1) return [...items];

  // Buckets pro Key, Insertion-Order der Keys erhalten
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(item);
    else buckets.set(key, [item]);
  }

  const result: T[] = [];
  let lastKey: string | null = null;

  while (result.length < items.length) {
    // Größten Bucket wählen, dessen Key ≠ zuletzt platzierter Key
    // (Tie-Break: zuerst gesehener Key gewinnt → deterministisch)
    let chosenKey: string | null = null;
    let chosenSize = 0;
    for (const [key, bucket] of buckets) {
      if (bucket.length === 0 || key === lastKey) continue;
      if (bucket.length > chosenSize) { chosenKey = key; chosenSize = bucket.length; }
    }

    if (chosenKey === null) {
      // Nur noch der Last-Key-Bucket übrig → Rest anhängen (unvermeidbares Cluster)
      const rest = lastKey !== null ? buckets.get(lastKey) : undefined;
      if (rest && rest.length > 0) result.push(...rest.splice(0));
      break;
    }

    const bucket = buckets.get(chosenKey)!;
    result.push(bucket.shift()!);
    lastKey = chosenKey;
  }

  return result;
}
