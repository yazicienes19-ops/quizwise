import { useEffect } from 'react';
import { sendActivityHeartbeat } from '../services/userService';
import { STUDY_TIME_EVENT } from '../services/studyTimeService';

const HEARTBEAT_SECONDS = 60;

/**
 * Meldet alle 60s, solange der Tab sichtbar ist, dass der eingeloggte Account
 * aktiv die App nutzt (fürs Admin-Dashboard, s. services/adminService.ts).
 * Bei verstecktem Tab wird kein Heartbeat gesendet — Lernzeit soll reale
 * Nutzung abbilden, kein offen gelassenes Browser-Tab.
 */
export const useActivityHeartbeat = (userId?: string | null): void => {
  useEffect(() => {
    if (!userId) return;
    const tick = () => {
      if (document.visibilityState === 'visible') {
        sendActivityHeartbeat(HEARTBEAT_SECONDS)
          .then(() => window.dispatchEvent(new CustomEvent(STUDY_TIME_EVENT)))
          .catch(() => {});
      }
    };
    const id = window.setInterval(tick, HEARTBEAT_SECONDS * 1000);
    return () => window.clearInterval(id);
  }, [userId]);
};
