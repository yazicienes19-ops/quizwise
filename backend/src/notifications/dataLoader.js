const { supabaseAdmin } = require('../middleware/auth');
const { DEFAULT_NOTIFICATION_SETTINGS } = require('./defaultSettings');

/**
 * Lädt für alle übergebenen userIds in wenigen gebatchten Queries alles,
 * was die Notification-Typen zur Auswertung brauchen — analog zum
 * Batching-Muster der alten reminderCron.js (Zeile 40-43), nur auf alle
 * heutigen Datenquellen erweitert. Ein Tick lädt einmal, jeder Typ liest
 * anschließend nur noch aus der zurückgegebenen Map.
 */
async function loadContext(userIds) {
  const [decksRes, learningRes, savedRes, profilesRes] = await Promise.all([
    supabaseAdmin.from('flashcard_decks').select('user_id, cards').in('user_id', userIds),
    supabaseAdmin.from('user_learning_data')
      .select('user_id, streak, mistake_queue, exam_terms, quiz_history, exam_history, recall_history')
      .in('user_id', userIds),
    supabaseAdmin.from('user_saved_content')
      .select('user_id, recurring_sessions, calendar_sessions, block_status')
      .in('user_id', userIds),
    supabaseAdmin.from('profiles').select('id, preferences').in('id', userIds),
  ]);

  const decksByUser = new Map();
  (decksRes.data || []).forEach(row => {
    const arr = decksByUser.get(row.user_id) || [];
    arr.push({ cards: row.cards || [] });
    decksByUser.set(row.user_id, arr);
  });

  const learningByUser = new Map();
  (learningRes.data || []).forEach(row => learningByUser.set(row.user_id, row));

  const savedByUser = new Map();
  (savedRes.data || []).forEach(row => savedByUser.set(row.user_id, row));

  const settingsByUser = new Map();
  (profilesRes.data || []).forEach(row => {
    const stored = row.preferences?.notification_settings;
    settingsByUser.set(row.id, stored ? mergeSettings(stored) : DEFAULT_NOTIFICATION_SETTINGS);
  });

  const empty = { current: 0, best: 0, lastDay: null };

  return {
    forUser(userId) {
      const learning = learningByUser.get(userId) || {};
      const saved = savedByUser.get(userId) || {};
      return {
        decks: decksByUser.get(userId) || [],
        streak: learning.streak || empty,
        mistakeQueue: learning.mistake_queue || [],
        examTerms: learning.exam_terms || [],
        quizHistory: learning.quiz_history || [],
        examHistory: learning.exam_history || [],
        recallHistory: learning.recall_history || [],
        recurringSessions: saved.recurring_sessions || [],
        calendarSessions: saved.calendar_sessions || [],
        blockStatus: saved.block_status || {},
        settings: settingsByUser.get(userId) || DEFAULT_NOTIFICATION_SETTINGS,
      };
    },
  };
}

/** Fehlende Kategorien/Felder in gespeicherten Settings mit Defaults auffüllen
 *  (z.B. wenn ein neuer Notification-Typ nach dem Speichern der Settings
 *  eines Nutzers hinzugefügt wurde). Flache Merge je Kategorie reicht, da
 *  keine Kategorie verschachtelte Objekte enthält. */
function mergeSettings(stored) {
  const merged = {};
  for (const key of Object.keys(DEFAULT_NOTIFICATION_SETTINGS)) {
    merged[key] = { ...DEFAULT_NOTIFICATION_SETTINGS[key], ...(stored[key] || {}) };
  }
  return merged;
}

module.exports = { loadContext };
