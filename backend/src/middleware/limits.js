const { supabase } = require('./auth');

const LIMITS = {
  free: 20,
  demo: Infinity,
  pro: Infinity,
};

// Diese Funktion wird nach requireAuth ausgeführt.
// Sie prüft: "Hat der Nutzer noch Anfragen übrig heute?"
const checkUsageLimit = async (req, res, next) => {
  const userId = req.user.id;

  // Profil aus der Datenbank laden
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('plan, api_calls_today, api_calls_reset_at')
    .eq('id', userId)
    .single();

  if (error || !profile) {
    return res.status(500).json({ error: 'Profil nicht gefunden.' });
  }

  const today = new Date().toISOString().split('T')[0]; // "2026-05-15"

  // Zähler zurücksetzen wenn ein neuer Tag begonnen hat
  if (profile.api_calls_reset_at !== today) {
    await supabase
      .from('profiles')
      .update({ api_calls_today: 0, api_calls_reset_at: today })
      .eq('id', userId);
    profile.api_calls_today = 0;
  }

  const limit = LIMITS[profile.plan] || LIMITS.free;

  // Limit erreicht?
  if (profile.api_calls_today >= limit) {
    return res.status(429).json({
      error: 'Tageslimit erreicht.',
      plan: profile.plan,
      limit,
      used: profile.api_calls_today,
      upgradeRequired: profile.plan === 'free',
    });
  }

  // Zähler erhöhen
  await supabase
    .from('profiles')
    .update({ api_calls_today: profile.api_calls_today + 1 })
    .eq('id', userId);

  // Infos für die Route verfügbar machen
  req.usage = {
    plan: profile.plan,
    used: profile.api_calls_today + 1,
    limit,
    remaining: limit === Infinity ? null : limit - profile.api_calls_today - 1,
  };

  next();
};

module.exports = { checkUsageLimit };
