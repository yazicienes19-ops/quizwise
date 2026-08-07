import type { RecallResult } from './recallHistoryService';

/**
 * recallGaps.ts — leitet aus der bestehenden Feynman-Historie (RecallResult[])
 * her, welche Themen als Nächstes bevorzugt bzw. kurz ausgesetzt werden sollen.
 *
 * Bewusst KEINE neue Persistenz/Migration und KEIN neuer KI-Call — "Lernlücken"
 * sind eine reine Herleitung aus bereits gespeicherten Daten (topic/score/
 * missingPoints/timestamp existieren schon in recallHistoryService.ts), analog
 * zu services/bloomProgression.ts beim Quiz-Feature. Ändert nichts an Bewertung/
 * UI — nur, welche Themenwerte in generateRecallChallenge(...) einfließen.
 */

/** Gleicher Schwellwert wie updateTopicMetric (services/topicConfidence.ts)
 *  für "richtig beantwortet" — für Konsistenz app-weit übernommen. */
export const SUCCESS_THRESHOLD = 70;

/** Cool-down-Fenster für kürzlich ERFOLGREICH gemeisterte Themen — bestehender
 *  Wert aus dem bisherigen recentRecallTopics() (services/recallSteering.ts). */
const COOLDOWN_WINDOW = 8;

/** Mindestanzahl Fehlversuche, ab der ein (mindestens einmal erfolgreiches)
 *  Thema als "häufig wiederholter Fehler" gilt (Stufe 2). */
const REPEATED_FAILURE_THRESHOLD = 2;

export interface TopicGapState {
  attempts: number;
  failedAttempts: number;
  everSucceeded: boolean;
  lastAttemptAt: number;
  lastSucceeded: boolean;
  /** Deduplizierte missingPoints aus den letzten Versuchen — "was noch fehlt",
   *  nicht nur der Score. */
  missingConcepts: string[];
}

const norm = (s: string): string => s.trim().toLowerCase();

/** Zustand EINES Themas aus der kompletten Recall-Historie. Kein Treffer ->
 *  neutraler Leerzustand (Thema wurde noch nie per Feynman geübt). */
export function computeTopicGapState(topic: string, results: RecallResult[]): TopicGapState {
  const key = norm(topic);
  const matches = results.filter(r => r.topic && norm(r.topic) === key);
  if (matches.length === 0) {
    return { attempts: 0, failedAttempts: 0, everSucceeded: false, lastAttemptAt: 0, lastSucceeded: false, missingConcepts: [] };
  }
  const sorted = [...matches].sort((a, b) => b.timestamp - a.timestamp); // neueste zuerst
  const failedAttempts = sorted.filter(r => r.score < SUCCESS_THRESHOLD).length;
  const everSucceeded = sorted.some(r => r.score >= SUCCESS_THRESHOLD);
  const missingConcepts = [...new Set(sorted.slice(0, 5).flatMap(r => r.missingPoints ?? []))];
  return {
    attempts: sorted.length,
    failedAttempts,
    everSucceeded,
    lastAttemptAt: sorted[0].timestamp,
    lastSucceeded: sorted[0].score >= SUCCESS_THRESHOLD,
    missingConcepts,
  };
}

/**
 * Priorisiert Themen für die nächste Feynman-Herausforderung aus der
 * kompletten Historie, unabhängig von `candidateTopics` (das ist nur die
 * Stufe-4-Rückfallreihenfolge, z.B. schwache Themen aus dem Lernprofil).
 *
 * Reihenfolge in preferTopics:
 * 1. Nie erfolgreich erklärt (mind. 1 Versuch, nie score >= SUCCESS_THRESHOLD)
 * 2. Häufig wiederholte Fehler (schon mal erfolgreich, aber >= 2 Fehlversuche)
 * 3. Kürzlich gescheitert (letzter Versuch war ein Fehlschlag), nach Aktualität
 * 4. candidateTopics als Rückfall (z.B. schwache Themen aus dem Lernprofil)
 *
 * excludeTopics enthält NUR Themen, deren LETZTER Versuch erfolgreich war,
 * innerhalb eines kurzen Aktualitäts-Fensters — der eigentliche Fix ggü. der
 * alten Logik (die JEDES kürzlich behandelte Thema ausschloss, unabhängig vom
 * Ergebnis, und dadurch gerade schlecht erklärte Themen eher seltener statt
 * häufiger wiederholte). Ein Thema landet nie in beiden Listen gleichzeitig —
 * exclude gewinnt im Konfliktfall (ein kürzlich gemeistertes Thema ruht kurz,
 * selbst wenn es historisch auch mal `repeatedFailures` erfüllt hätte).
 */
export function rankTopicsForNextChallenge(
  candidateTopics: string[],
  results: RecallResult[],
): { preferTopics: string[]; excludeTopics: string[] } {
  const historyTopics = [...new Set(results.map(r => r.topic?.trim()).filter((t): t is string => !!t))];
  const gapByTopic = new Map<string, TopicGapState>(historyTopics.map(t => [t, computeTopicGapState(t, results)]));

  // Cool-down: letzte COOLDOWN_WINDOW unterschiedliche Themen der gesamten
  // Historie (unabhängig vom Ergebnis), davon nur die mit erfolgreichem letzten Versuch.
  const recentDistinct: string[] = [];
  const recentSeen = new Set<string>();
  for (const r of [...results].sort((a, b) => b.timestamp - a.timestamp)) {
    const topic = r.topic?.trim();
    if (!topic) continue;
    const key = norm(topic);
    if (recentSeen.has(key)) continue;
    recentSeen.add(key);
    recentDistinct.push(topic);
    if (recentDistinct.length >= COOLDOWN_WINDOW) break;
  }
  const excludeTopics = recentDistinct.filter(t => gapByTopic.get(t)?.lastSucceeded);
  const excludeSet = new Set(excludeTopics.map(norm));

  const byRecency = [...historyTopics].sort(
    (a, b) => gapByTopic.get(b)!.lastAttemptAt - gapByTopic.get(a)!.lastAttemptAt
  );

  const neverSucceeded = historyTopics.filter(t => {
    const g = gapByTopic.get(t)!;
    return g.attempts > 0 && !g.everSucceeded;
  });
  const repeatedFailures = [...historyTopics]
    .filter(t => {
      const g = gapByTopic.get(t)!;
      return g.everSucceeded && g.failedAttempts >= REPEATED_FAILURE_THRESHOLD;
    })
    .sort((a, b) => gapByTopic.get(b)!.failedAttempts - gapByTopic.get(a)!.failedAttempts);
  const recentlyFailed = byRecency.filter(t => {
    const g = gapByTopic.get(t)!;
    return g.everSucceeded && !g.lastSucceeded;
  });

  const seen = new Set<string>();
  const preferTopics: string[] = [];
  const pushUnique = (list: string[]) => {
    for (const t of list) {
      const key = norm(t);
      if (seen.has(key) || excludeSet.has(key)) continue;
      seen.add(key);
      preferTopics.push(t);
    }
  };
  pushUnique(neverSucceeded);
  pushUnique(repeatedFailures);
  pushUnique(recentlyFailed);
  pushUnique(candidateTopics);

  return { preferTopics, excludeTopics };
}
