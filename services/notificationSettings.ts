/**
 * notificationSettings.ts — Einstellungen für das Benachrichtigungssystem.
 * Spiegelt backend/src/notifications/defaultSettings.js (getrennte Datei,
 * da Frontend/Backend unterschiedliche Runtimes sind — bei Änderung an
 * einer Seite immer auch die andere anpassen).
 */

export interface DailyReminderSettings {
  enabled: boolean;
  time: string; // "HH:MM"
  onlyIfBlocksToday: boolean;
  skipIfGoalReached: boolean;
  includeWeekends: boolean;
}

export interface BlockLeadTimeSettings {
  enabled: boolean;
  leadMinutes: 5 | 10 | 15 | 30;
  onlyHighPriority: boolean;
}

export interface SpacedRepetitionNotifySettings {
  enabled: boolean;
  mode: 'immediate' | 'bundled' | 'threshold';
  threshold: number;
}

export interface ExamNotifySettings {
  enabled: boolean;
  days: number[]; // Teilmenge von [7, 3, 1, 0]
}

export interface MotivationSettings {
  dailyGoalReached: boolean;
  weeklyGoalReached: boolean;
  streakSaved: boolean;
  streakAtRisk: boolean;
  newPersonalBest: boolean;
}

export interface NotificationSettings {
  dailyReminder: DailyReminderSettings;
  blockLeadTime: BlockLeadTimeSettings;
  spacedRepetition: SpacedRepetitionNotifySettings;
  exams: ExamNotifySettings;
  motivation: MotivationSettings;
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
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
    mode: 'bundled',
    threshold: 5,
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

const STORAGE_KEY = 'studearc_notification_settings';

export function loadNotificationSettings(): NotificationSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const stored = JSON.parse(raw);
      return {
        dailyReminder: { ...DEFAULT_NOTIFICATION_SETTINGS.dailyReminder, ...stored.dailyReminder },
        blockLeadTime: { ...DEFAULT_NOTIFICATION_SETTINGS.blockLeadTime, ...stored.blockLeadTime },
        spacedRepetition: { ...DEFAULT_NOTIFICATION_SETTINGS.spacedRepetition, ...stored.spacedRepetition },
        exams: { ...DEFAULT_NOTIFICATION_SETTINGS.exams, ...stored.exams },
        motivation: { ...DEFAULT_NOTIFICATION_SETTINGS.motivation, ...stored.motivation },
      };
    }
  } catch { /* ignore */ }
  return DEFAULT_NOTIFICATION_SETTINGS;
}

/** Gleiches Muster wie applyFont/applyLineHeight in SettingsModal.tsx:
 *  localStorage sofort, Cloud-Sync (falls eingeloggt) nebenläufig. */
export function saveNotificationSettings(settings: NotificationSettings, userId?: string | null): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* ignore */ }
  if (userId) {
    import('./syncService').then(({ syncPreferences }) => syncPreferences(userId, { notification_settings: settings })).catch(() => {});
  }
}
