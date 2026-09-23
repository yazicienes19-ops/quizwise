import { useEffect, useState } from 'react';
import { CLOUD_PULLED_EVENT } from '../services/syncService';
import { MISTAKES_UPDATED_EVENT } from '../services/mistakeReviewService';
import { STREAK_UPDATED_EVENT } from '../services/streakService';

/**
 * Zähler, der steigt, wenn sich lokal gespeicherte Lerndaten von außen ändern:
 * nach dem Cloud-Abgleich beim Login, bei neuen oder bewerteten Fehlerfragen
 * und bei einer neuen Lernserie. Als useMemo-Abhängigkeit verwendet, damit
 * Ansichten nicht auf dem Stand vom ersten Rendern stehen bleiben.
 *
 * Anlass (Audit 23.09.2026): Die Startseite las Fehlerfragen, Streak und
 * Verläufe einmalig per useMemo(..., []), noch bevor die Cloud-Daten da waren,
 * und meldete nach dem Login "alles im grünen Bereich".
 */
export const useCloudDataVersion = (): number => {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion(v => v + 1);
    const events = [CLOUD_PULLED_EVENT, MISTAKES_UPDATED_EVENT, STREAK_UPDATED_EVENT];
    events.forEach(e => window.addEventListener(e, bump));
    return () => events.forEach(e => window.removeEventListener(e, bump));
  }, []);
  return version;
};
