/**
 * dashboardService — reine Hilfsfunktionen für das Dashboard (kein React, gut testbar).
 */

export type GreetingKind = 'morning' | 'day' | 'evening' | 'night';

/** Tageszeit-Bucket für die Hero-Begrüßung. Grenzen an üblichen Tagesrhythmus angelehnt. */
export const greetingKind = (hour: number): GreetingKind => {
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 17) return 'day';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
};
