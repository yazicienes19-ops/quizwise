const express = require('express');
const { supabaseAdmin } = require('../middleware/auth');
const router = express.Router();

// GET /api/user/profile
router.get('/profile', async (req, res, next) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data: profile, error } = await req.supabase
      .from('profiles')
      .select('full_name, plan, api_calls_today, api_calls_reset_at, created_at, preferences')
      .eq('id', req.user.id)
      .single();
    if (error) throw error;
    const used = profile.api_calls_reset_at === today ? profile.api_calls_today : 0;
    const limit = profile.plan === 'pro' ? null : 20;
    res.json({
      name: profile.full_name,
      email: req.user.email,
      plan: profile.plan,
      usage: { used, limit, remaining: limit ? limit - used : null },
      preferences: profile.preferences || {},
    });
  } catch (err) { next(err); }
});

// GET /api/user/export
// Alle Nutzerdaten als JSON — DSGVO Recht auf Datenmitnahme
router.get('/export', async (req, res, next) => {
  try {
    const userId = req.user.id;

    const sb = req.supabase;
    const [profileRes, metricsRes, decksRes, planRes] = await Promise.all([
      sb.from('profiles').select('*').eq('id', userId).single(),
      sb.from('metrics').select('*').eq('user_id', userId),
      sb.from('flashcard_decks').select('*').eq('user_id', userId),
      sb.from('study_plan').select('*').eq('user_id', userId).single(),
    ]);

    const exportData = {
      exportedAt: new Date().toISOString(),
      account: { email: req.user.email, ...profileRes.data },
      metrics: metricsRes.data || [],
      flashcardDecks: decksRes.data || [],
      studyPlan: planRes.data || null,
    };

    res.setHeader('Content-Disposition', 'attachment; filename="quizwise-data.json"');
    res.setHeader('Content-Type', 'application/json');
    res.json(exportData);
  } catch (err) { next(err); }
});

// DELETE /api/user/account
// Konto vollständig löschen — DSGVO Recht auf Vergessenwerden
router.delete('/account', async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Supabase Admin API: löscht User aus auth.users
    // Dank CASCADE werden auch profiles, metrics, decks etc. gelöscht
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) throw error;

    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
