const express = require('express');
const { supabaseAdmin } = require('../middleware/auth');
const router = express.Router();

const DAY_MS = 24 * 60 * 60 * 1000;

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

// GET /api/admin/users
// Übersicht aller Accounts für den Admin: Plan, Registrierung, letzter Login,
// letzte Aktivität in der App, Lernzeit (gesamt + letzte 7 Tage).
router.get('/users', async (req, res, next) => {
  try {
    const [authUsers, profilesRes, activityRes] = await Promise.all([
      listAllAuthUsers(),
      supabaseAdmin.from('profiles').select('id, full_name, plan, created_at, last_active_at'),
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

module.exports = router;
