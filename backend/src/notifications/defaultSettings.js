/**
 * Backend-Spiegel von services/notificationSettings.ts (DEFAULT_NOTIFICATION_SETTINGS).
 * Getrennte Datei, da Frontend (TS/ESM) und Backend (JS/CommonJS) nicht
 * direkt voneinander importieren können — bei Änderung an einer Seite immer
 * auch die andere anpassen (wie schon bei countDueCards/countDueMistakes,
 * die aus demselben Grund doppelt existieren).
 */
const DEFAULT_NOTIFICATION_SETTINGS = {
  dailyReminder: {
    enabled: true,
    time: '18:00',
    onlyIfBlocksToday: true,
    skipIfGoalReached: true,
    includeWeekends: true,
  },
  blockLeadTime: {
    enabled: false,
    leadMinutes: 15,
    onlyHighPriority: false,
  },
  spacedRepetition: {
    enabled: true,
    mode: 'bundled', // 'immediate' | 'bundled' | 'threshold'
    threshold: 5, // nur relevant bei mode === 'threshold'
  },
  exams: {
    enabled: true,
    days: [7, 3, 1, 0],
  },
  motivation: {
    dailyGoalReached: true,
    weeklyGoalReached: true,
    streakSaved: true,
    streakAtRisk: true,
    newPersonalBest: true,
  },
};

module.exports = { DEFAULT_NOTIFICATION_SETTINGS };
