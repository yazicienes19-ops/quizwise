import type { LernstudioResult } from './types';
import { checkEmptyHeadings, checkStudies } from './validate';

/**
 * Gespeicherte Zusammenfassung unbrauchbar? Neue Ergebnisse tragen
 * incompleteChapters selbst; ältere (Phase 1, vor 16.10.2026) erkennt der
 * Code an leeren Überschriften und Studien ohne Aufbau und Ergebnis.
 */
export const isIncompleteResult = (r: LernstudioResult | undefined): boolean => {
  if (!r) return false;
  if (r.incompleteChapters?.length) return true;
  if (r.incompleteChapters) return false;
  return checkEmptyHeadings(r.blocks).length > 0 || checkStudies(r.blocks).length > 0;
};
