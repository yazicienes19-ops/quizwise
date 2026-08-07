import type { BloomLevel } from '../types';

/**
 * bloomProgression.ts — reine Bloom-Stufen-Logik für die adaptive Quiz-Schwierigkeit.
 *
 * Bewusst KEIN zweiter KI-Klassifikations-Call (anders als beim Klausursimulator,
 * services/bloomPresets.ts classifyBloomLevels) — die Zielstufe wird VOR der
 * Generierung ermittelt und ins Prompt gegeben, die KI liefert bloomLevel direkt
 * im selben Call mit. Dieses Modul kennt nur die reine Stufen-Arithmetik, keine
 * KI-Aufrufe, keine App-Zustände — leicht testbar.
 */

/** 4 automatisch erreichbare Stufen. "bewerten"/"erschaffen" bleiben außen vor —
 *  wie schon bei EXAM_TYPE_BLOOM_TARGETS (bloomPresets.ts), wo "erschaffen" immer
 *  0% ist: eine zeitlich begrenzte Quiz-Session eskaliert nicht automatisch dahin. */
export const BLOOM_STAGE_ORDER: BloomLevel[] = ['erinnern', 'verstehen', 'anwenden', 'analysieren'];

const MAX_STAGE = BLOOM_STAGE_ORDER.length - 1;
const ADVANCE_AFTER = 3; // aufeinanderfolgende richtige Antworten AUF der aktuellen Stufe
const REGRESS_AFTER = 2; // aufeinanderfolgende falsche Antworten

/**
 * Spielt eine chronologische (älteste zuerst) Folge von Richtig/Falsch für EIN
 * Thema durch einen Stufen-Automaten. Steigt erst nach `ADVANCE_AFTER`
 * aufeinanderfolgenden richtigen Antworten eine Stufe (nicht nach einer
 * einzigen), sinkt nach `REGRESS_AFTER` aufeinanderfolgenden falschen Antworten
 * genau eine Stufe (graduell, kein Sprung auf den Anfang).
 */
export function computeBloomStage(chronological: boolean[]): BloomLevel {
  let stage = 0;
  let correctStreak = 0;
  let wrongStreak = 0;

  for (const isCorrect of chronological) {
    if (isCorrect) {
      correctStreak++;
      wrongStreak = 0;
      if (correctStreak >= ADVANCE_AFTER) {
        stage = Math.min(MAX_STAGE, stage + 1);
        correctStreak = 0;
      }
    } else {
      wrongStreak++;
      correctStreak = 0;
      if (wrongStreak >= REGRESS_AFTER) {
        stage = Math.max(0, stage - 1);
        wrongStreak = 0;
      }
    }
  }

  return BLOOM_STAGE_ORDER[stage];
}

/**
 * Leichtgewichtige Eimer-Zuordnung für die Live-Session-Ebene (innerhalb EINES
 * laufenden Quiz, s. services/adaptiveQuizOrder.ts) — reagiert schneller/gröber
 * als computeBloomStage, weil hier keine Stufen-Historie über Sessions hinweg
 * existiert, nur der aktuelle Streak dieser einen Sitzung.
 */
export function stageForLiveStreak(streak: number): BloomLevel {
  if (streak >= 5) return 'analysieren';
  if (streak >= 3) return 'anwenden';
  if (streak >= 2) return 'verstehen';
  return 'erinnern';
}
