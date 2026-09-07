const express = require('express');
const { supabaseAdmin } = require('../middleware/auth');
const { ADMIN_IDS } = require('../middleware/requireAdmin');
const { hasActiveStripeSubscription } = require('../admin/expireProGrants');
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
    const [authUsers, profilesRes, activityRes] = await Promise.all([
      listAllAuthUsers(),
      supabaseAdmin.from('profiles').select('id, full_name, plan, created_at, last_active_at, admin_pro_until'),
      supabaseAdmin.from('daily_activity').select('user_id, activity_date, active_seconds'),
    ]);
    if (profilesRes.error) throw profilesRes.error;
    if (activityRes.error) throw activityRes.error;

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

module.exports = router;
