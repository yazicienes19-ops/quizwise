// Monatsbudget für Gemini-Kosten (s. backend/migration_ai_budget.sql).
//
// Zwei Deckel, beide in EUR und im Admin-Dashboard änderbar:
//   - global: alle Nutzer zusammen (Schutz vor einer Überraschungsrechnung)
//   - pro Nutzer: je nach Plan (verhindert, dass Einzelne das Budget allein aufbrauchen)
// Stufen je Deckel: bis soft_ratio (Standard 80 %) normal, danach "soft"
// (Hinweis + Pro fällt auf MODEL_LITE zurück), ab 100 % "hard" (gesperrt bis
// zum Monatswechsel). Maßgeblich ist die strengere der beiden Stufen.
//
// Kosten werden nach jedem Aufruf aus Geminis usageMetadata verbucht. Parallele
// Anfragen können den Deckel dadurch um wenige Cent überschreiten, das ist
// bewusst in Kauf genommen (kein Reservieren vor dem Aufruf).
const { ADMIN_IDS } = require('../middleware/requireAdmin');
const { costOfUsage } = require('../config/geminiModels');

// Erst beim ersten DB-Zugriff laden: auth.js baut beim Import sofort einen
// Supabase-Client und braucht dafür die Env-Variablen (fehlen in Unit-Tests).
const db = () => require('../middleware/auth').supabaseAdmin;

// Preise sind in USD, Deckel in EUR. 1:1 gerechnet, solange der Euro mehr als
// einen Dollar wert ist, überschätzt das die Kosten leicht (sichere Seite).
const EUR_PER_USD = 1;

const DEFAULT_SETTINGS = {
  global_monthly_eur: 20,
  pro_user_monthly_eur: 5,
  free_user_monthly_eur: 1,
  soft_ratio: 0.8,
};

// Monatswechsel nach deutscher Zeit, nicht UTC (sonst endet der Monat um 01:00/02:00).
const currentMonth = (date = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit' })
    .format(date).slice(0, 7);

const isSetupMissing = (error) =>
  ['42P01', '42883', 'PGRST202', 'PGRST205'].includes(error?.code) ||
  /ai_usage_monthly|ai_budget_settings|get_ai_budget_status|record_ai_usage/.test(error?.message || '');

let warnedMissing = false;
const warnMissingOnce = () => {
  if (warnedMissing) return;
  warnedMissing = true;
  console.warn('KI-Budget: Tabellen fehlen, Budget ist INAKTIV. backend/migration_ai_budget.sql in Supabase ausführen.');
};

let settingsCache = null;
let settingsCachedAt = 0;
const SETTINGS_TTL_MS = 60 * 1000;

const getSettings = async () => {
  if (settingsCache && Date.now() - settingsCachedAt < SETTINGS_TTL_MS) return settingsCache;
  const { data, error } = await db().from('ai_budget_settings').select('*').eq('id', 1).maybeSingle();
  if (error) throw error;
  settingsCache = { ...DEFAULT_SETTINGS, ...(data || {}) };
  for (const k of Object.keys(DEFAULT_SETTINGS)) settingsCache[k] = Number(settingsCache[k]);
  settingsCachedAt = Date.now();
  return settingsCache;
};

const invalidateSettings = () => { settingsCache = null; };

const LEVEL_RANK = { ok: 0, soft: 1, hard: 2 };

const levelFor = (costEur, limitEur, softRatio) => {
  if (!(limitEur > 0)) return 'hard';
  if (costEur >= limitEur) return 'hard';
  if (costEur >= limitEur * softRatio) return 'soft';
  return 'ok';
};

// Reine Logik (testbar): Stufe aus Verbrauch + Einstellungen.
const evaluateBudget = ({ userCostEur, globalCostEur, plan, settings }) => {
  const userLimit = plan === 'pro' ? settings.pro_user_monthly_eur : settings.free_user_monthly_eur;
  const user = levelFor(userCostEur, userLimit, settings.soft_ratio);
  const global = levelFor(globalCostEur, settings.global_monthly_eur, settings.soft_ratio);
  const level = LEVEL_RANK[global] >= LEVEL_RANK[user] ? global : user;
  return { level, scope: level === 'ok' ? null : (level === global ? 'global' : 'user') };
};

// Liefert { level: 'ok' | 'soft' | 'hard', scope }. Admins werden gezählt,
// aber nie gebremst oder gesperrt (damit du im Notfall weiter testen kannst).
const getBudgetStatus = async (userId, plan) => {
  try {
    const settings = await getSettings();
    const { data, error } = await db().rpc('get_ai_budget_status', {
      p_user_id: userId,
      p_month: currentMonth(),
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    const result = evaluateBudget({
      userCostEur: Number(row?.user_cost || 0) * EUR_PER_USD,
      globalCostEur: Number(row?.global_cost || 0) * EUR_PER_USD,
      plan,
      settings,
    });
    if (ADMIN_IDS.includes(userId)) return { level: 'ok', scope: null };
    return result;
  } catch (err) {
    if (isSetupMissing(err)) { warnMissingOnce(); return { level: 'ok', scope: null }; }
    throw err;
  }
};

// Nicht blockierend aufrufen: ein Fehler beim Verbuchen darf die Antwort an
// den Nutzer nicht kaputt machen.
const recordUsage = async (userId, model, usage, opts = {}) => {
  if (!userId || !usage) return;
  try {
    const cost = costOfUsage(model, usage, opts);
    const { error } = await db().rpc('record_ai_usage', {
      p_user_id: userId,
      p_month: currentMonth(),
      p_cost: cost,
      p_input: usage.promptTokenCount || 0,
      p_output: (usage.candidatesTokenCount || 0) + (usage.thoughtsTokenCount || 0),
    });
    if (error) throw error;
  } catch (err) {
    if (isSetupMissing(err)) return warnMissingOnce();
    console.error('KI-Budget: Verbrauch konnte nicht verbucht werden:', err.message);
  }
};

// Fehlerobjekt für den Express-Error-Handler (403 statt 429: 429 deutet das
// Frontend als Free-Tageslimit und zeigt dann den Upgrade-Hinweis).
const budgetExhaustedError = (scope) => {
  const err = new Error('BUDGET_EXHAUSTED: Das Kontingent für diesen Monat ist aufgebraucht.');
  err.statusCode = 403;
  err.expose = true;
  err.code = 'BUDGET_EXHAUSTED';
  err.scope = scope;
  return err;
};

const getPlan = async (userId) => {
  const { data } = await db().from('profiles').select('plan').eq('id', userId).maybeSingle();
  return data?.plan || 'free';
};

module.exports = {
  EUR_PER_USD,
  DEFAULT_SETTINGS,
  currentMonth,
  getSettings,
  invalidateSettings,
  evaluateBudget,
  getBudgetStatus,
  recordUsage,
  budgetExhaustedError,
  getPlan,
  isSetupMissing,
};
