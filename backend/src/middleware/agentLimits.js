const AGENT_LIMITS = { free: 50, pro: null };

const checkAgentLimit = async (req, res, next) => {
  try {
    const sb = req.supabase;
    const userId = req.user.id;
    const today = new Date().toISOString().split('T')[0];

    const { data: profile } = await sb
      .from('profiles')
      .select('plan')
      .eq('id', userId)
      .single();
    const plan = profile?.plan || 'free';

    const limit = AGENT_LIMITS[plan] ?? AGENT_LIMITS.free;
    if (limit === null) return next();

    const { data: existing } = await sb
      .from('agent_usage')
      .select('count')
      .eq('user_id', userId)
      .eq('date', today)
      .maybeSingle();

    const currentCount = existing?.count || 0;

    if (currentCount >= limit) {
      return res.status(429).json({
        error: `Agent-Limit erreicht (${limit} Nachrichten/Tag). Upgrade auf Pro für mehr Nutzung.`,
        upgradeRequired: plan === 'free',
        limit,
        used: currentCount,
      });
    }

    await sb
      .from('agent_usage')
      .upsert(
        { user_id: userId, date: today, count: currentCount + 1 },
        { onConflict: 'user_id,date' }
      );

    next();
  } catch (err) {
    console.error('Agent-Limit Fehler:', err.message);
    res.status(503).json({ error: 'Limit-Prüfung fehlgeschlagen. Bitte erneut versuchen.' });
  }
};

module.exports = { checkAgentLimit };
