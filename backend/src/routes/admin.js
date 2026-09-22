const express = require('express');
const { supabaseAdmin } = require('../middleware/auth');
const { ADMIN_IDS } = require('../middleware/requireAdmin');
const { hasActiveStripeSubscription } = require('../admin/expireProGrants');
const { EUR_PER_USD, currentMonth, getSettings, invalidateSettings, isSetupMissing } = require('../budget/aiBudget');
const router = express.Router();

const DAY_MS = 24 * 60 * 60 * 1000;
// GoTrue akzeptiert keine unbegrenzte Sperre — 10 Jahre sind praktisch
// dauerhaft und bleiben sicher unter dem serverseitigen Limit.
const BAN_DURATION = '87600h';

// Alle Auth-User laden (paginiert, Supabase liefert max. 1000 pro Seite).
async function listAllAuthUsers() {
  const users = [];
  let page = 1;
  for (;;) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) break;
    page++;
  }
  return users;
}

const isBanned = (authUser) => {
  if (!authUser?.banned_until) return false;
  return new Date(authUser.banned_until).getTime() > Date.now();
};

// GET /api/admin/users
// Übersicht aller Accounts für den Admin: Plan, Registrierung, letzter Login,
// letzte Aktivität in der App, Lernzeit (gesamt + letzte 7 Tage), Sperrstatus.
router.get('/users', async (req, res, next) => {
  try {
    const [authUsers, profilesRes, activityRes, costRes] = await Promise.all([
      listAllAuthUsers(),
      supabaseAdmin.from('profiles').select('id, full_name, plan, created_at, last_active_at, admin_pro_until'),
      supabaseAdmin.from('daily_activity').select('user_id, activity_date, active_seconds'),
      supabaseAdmin.from('ai_usage_monthly').select('user_id, cost_usd').eq('month', currentMonth()),
    ]);
    if (profilesRes.error) throw profilesRes.error;
    if (activityRes.error) throw activityRes.error;
    // Fehlt die Budget-Migration noch, bleibt die Spalte leer statt die ganze Liste zu blockieren.
    if (costRes.error && !isSetupMissing(costRes.error)) throw costRes.error;
    const costByUser = new Map((costRes.data || []).map(r => [r.user_id, Number(r.cost_usd) * EUR_PER_USD]));

    const profileMap = new Map((profilesRes.data || []).map(p => [p.id, p]));

    const since7Str = new Date(Date.now() - 7 * DAY_MS).toISOString().split('T')[0];
    const totalSecondsByUser = new Map();
    const last7SecondsByUser = new Map();
    for (const row of activityRes.data || []) {
      totalSecondsByUser.set(row.user_id, (totalSecondsByUser.get(row.user_id) || 0) + row.active_seconds);
      if (row.activity_date >= since7Str) {
        last7SecondsByUser.set(row.user_id, (last7SecondsByUser.get(row.user_id) || 0) + row.active_seconds);
      }
    }

    const users = authUsers.map(u => {
      const profile = profileMap.get(u.id);
      return {
        id: u.id,
        email: u.email || null,
        name: profile?.full_name || null,
        plan: profile?.plan || 'free',
        adminProUntil: profile?.admin_pro_until || null,
        isSuspended: isBanned(u),
        isAdmin: ADMIN_IDS.includes(u.id),
        createdAt: profile?.created_at || u.created_at,
        lastSignInAt: u.last_sign_in_at || null,
        lastActiveAt: profile?.last_active_at || null,
        totalActiveSeconds: totalSecondsByUser.get(u.id) || 0,
        last7DaysActiveSeconds: last7SecondsByUser.get(u.id) || 0,
        monthCostEur: costRes.error ? null : (costByUser.get(u.id) || 0),
      };
    });

    users.sort((a, b) => {
      const av = new Date(a.lastActiveAt || a.lastSignInAt || 0).getTime();
      const bv = new Date(b.lastActiveAt || b.lastSignInAt || 0).getTime();
      return bv - av;
    });

    res.json({ users, total: users.length });
  } catch (err) { next(err); }
});

// POST /api/admin/users/:userId/grant-pro  { days: number }
// Befristeter Pro-Zugang unabhängig von Stripe (Testphase, Geschenk-Abo, …).
router.post('/users/:userId/grant-pro', async (req, res, next) => {
  try {
    const days = Math.round(Number(req.body?.days));
    if (!Number.isFinite(days) || days < 1 || days > 3650) {
      return res.status(400).json({ error: 'Anzahl Tage muss zwischen 1 und 3650 liegen.' });
    }
    const adminProUntil = new Date(Date.now() + days * DAY_MS).toISOString();
    const { error } = await supabaseAdmin.from('profiles')
      .update({ plan: 'pro', admin_pro_until: adminProUntil })
      .eq('id', req.params.userId);
    if (error) throw error;
    res.json({ success: true, plan: 'pro', adminProUntil });
  } catch (err) { next(err); }
});

// POST /api/admin/users/:userId/revoke-pro
// Weigert sich bei einem echten zahlenden Stripe-Kunden — der Zugang würde
// sonst entzogen, obwohl der Nutzer weiter belastet wird. Kündigung dafür
// über Stripe, nicht hier.
router.post('/users/:userId/revoke-pro', async (req, res, next) => {
  try {
    const { data: authUser, error: authErr } = await supabaseAdmin.auth.admin.getUserById(req.params.userId);
    if (authErr) throw authErr;
    if (await hasActiveStripeSubscription(authUser?.user?.email)) {
      return res.status(409).json({ error: 'Dieser Account hat ein aktives Stripe-Abo. Pro-Zugang bitte über Stripe kündigen, nicht hier entziehen.' });
    }
    const { error } = await supabaseAdmin.from('profiles')
      .update({ plan: 'free', admin_pro_until: null })
      .eq('id', req.params.userId);
    if (error) throw error;
    res.json({ success: true, plan: 'free' });
  } catch (err) { next(err); }
});

// POST /api/admin/users/:userId/suspend
router.post('/users/:userId/suspend', async (req, res, next) => {
  try {
    if (ADMIN_IDS.includes(req.params.userId)) {
      return res.status(400).json({ error: 'Admin-Accounts können nicht gesperrt werden.' });
    }
    const { error } = await supabaseAdmin.auth.admin.updateUserById(req.params.userId, { ban_duration: BAN_DURATION });
    if (error) throw error;
    res.json({ success: true, isSuspended: true });
  } catch (err) { next(err); }
});

// POST /api/admin/users/:userId/unsuspend
router.post('/users/:userId/unsuspend', async (req, res, next) => {
  try {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(req.params.userId, { ban_duration: 'none' });
    if (error) throw error;
    res.json({ success: true, isSuspended: false });
  } catch (err) { next(err); }
});

// GET /api/admin/question-reports
// Von Nutzern gemeldete Quizfragen und Klausurbewertungen (Tabelle
// question_reports, s. backend/migration_question_reports.sql), gruppiert nach
// Frage: häufigste zuerst. Fehlt die Tabelle noch, meldet die Route das
// ausdrücklich statt eines 500ers, damit das Dashboard den Grund anzeigt.
router.get('/question-reports', async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin.from('question_reports')
      .select('id, user_id, kind, reason, question_text, details, doc_name, created_at')
      .order('created_at', { ascending: false })
      .limit(1000);
    if (error) {
      const missing = error.code === '42P01' || error.code === 'PGRST205' || /question_reports/.test(error.message || '');
      if (missing) return res.json({ groups: [], total: 0, setupMissing: true });
      throw error;
    }
    const groups = new Map();
    for (const r of data || []) {
      const key = `${r.kind}|${String(r.question_text).trim().toLowerCase().replace(/\s+/g, ' ')}`;
      let g = groups.get(key);
      if (!g) {
        g = { key, kind: r.kind, questionText: r.question_text, details: r.details || {}, docNames: [], reasons: {}, count: 0, reporters: new Set(), lastReportedAt: r.created_at };
        groups.set(key, g);
      }
      g.count++;
      g.reasons[r.reason] = (g.reasons[r.reason] || 0) + 1;
      g.reporters.add(r.user_id);
      if (r.doc_name && !g.docNames.includes(r.doc_name)) g.docNames.push(r.doc_name);
    }
    const out = [...groups.values()]
      .map(g => ({ ...g, reporters: g.reporters.size }))
      .sort((a, b) => b.count - a.count || String(b.lastReportedAt).localeCompare(String(a.lastReportedAt)));
    res.json({ groups: out, total: (data || []).length, setupMissing: false });
  } catch (err) { next(err); }
});

// GET /api/admin/ai-budget
// Monatsbudget für Gemini: Einstellungen + Verbrauch im laufenden Monat.
router.get('/ai-budget', async (req, res, next) => {
  try {
    const month = currentMonth();
    const { data, error } = await supabaseAdmin.from('ai_usage_monthly')
      .select('cost_usd, input_tokens, output_tokens, calls')
      .eq('month', month);
    if (error) {
      if (isSetupMissing(error)) return res.json({ setupMissing: true, month });
      throw error;
    }
    const sum = (k) => (data || []).reduce((acc, r) => acc + Number(r[k] || 0), 0);
    res.json({
      setupMissing: false,
      month,
      settings: await getSettings(),
      globalCostEur: sum('cost_usd') * EUR_PER_USD,
      calls: sum('calls'),
      inputTokens: sum('input_tokens'),
      outputTokens: sum('output_tokens'),
      activeUsers: (data || []).length,
    });
  } catch (err) { next(err); }
});

// PUT /api/admin/ai-budget  { globalMonthlyEur, proUserMonthlyEur, freeUserMonthlyEur, softRatio }
router.put('/ai-budget', async (req, res, next) => {
  try {
    const b = req.body || {};
    const money = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 0 && n <= 100000 ? Math.round(n * 100) / 100 : null; };
    const update = {
      global_monthly_eur: money(b.globalMonthlyEur),
      pro_user_monthly_eur: money(b.proUserMonthlyEur),
      free_user_monthly_eur: money(b.freeUserMonthlyEur),
      soft_ratio: Number(b.softRatio),
    };
    if (Object.values(update).some(v => v === null) || !(update.soft_ratio > 0 && update.soft_ratio <= 1)) {
      return res.status(400).json({ error: 'Beträge müssen zwischen 0 und 100000 € liegen, die Warnschwelle zwischen 1 und 100 %.' });
    }
    const { error } = await supabaseAdmin.from('ai_budget_settings')
      .upsert({ id: 1, ...update, updated_at: new Date().toISOString() });
    if (error) throw error;
    invalidateSettings();
    res.json({ success: true, settings: await getSettings() });
  } catch (err) { next(err); }
});

module.exports = router;
