// Öffentlicher .ics-Abo-Feed für den Handy-Kalender-Sync — bewusst OHNE
// requireAuth (Kalender-Apps auf dem Handy senden keinen Authorization-
// Header), das Token selbst ist das einzige Geheimnis. Siehe
// migration_calendar_feed_token.sql und routes/user.js (Token-Erzeugung).

const express = require('express');
const { supabaseAdmin } = require('../middleware/auth');
const { buildIcsFeed } = require('../utils/icsBuilder');
const router = express.Router();

const TOKEN_RE = /^[a-f0-9]{48}$/;

router.get('/:token.ics', async (req, res, next) => {
  try {
    const { token } = req.params;
    if (!TOKEN_RE.test(token)) return res.status(404).send('Not found');

    const { data: profile, error: profileErr } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('calendar_feed_token', token)
      .maybeSingle();
    if (profileErr || !profile) return res.status(404).send('Not found');

    const userId = profile.id;
    const [learningRes, savedRes, collectionsRes] = await Promise.all([
      supabaseAdmin.from('user_learning_data').select('exam_terms').eq('user_id', userId).maybeSingle(),
      supabaseAdmin.from('user_saved_content').select('recurring_sessions, calendar_sessions').eq('user_id', userId).maybeSingle(),
      supabaseAdmin.from('collections').select('id, name').eq('user_id', userId),
    ]);

    const ics = buildIcsFeed({
      examTerms: learningRes.data?.exam_terms || [],
      recurringSessions: savedRes.data?.recurring_sessions || [],
      calendarSessions: savedRes.data?.calendar_sessions || [],
      collections: collectionsRes.data || [],
    });

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="studearc.ics"');
    // Handy-Kalender-Apps holen den Feed periodisch selbst ab (typ. alle paar
    // Stunden) — kurzes Server-seitiges Caching dämpft Lastspitzen, ohne
    // Änderungen spürbar zu verzögern.
    res.setHeader('Cache-Control', 'public, max-age=900');
    res.send(ics);
  } catch (err) { next(err); }
});

module.exports = router;
