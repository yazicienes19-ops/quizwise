const checkUsageLimit = async (req, res, next) => {
  const sb = req.supabase;
  const userId = req.user.id;
  const today  = new Date().toISOString().split('T')[0];

  const { data, error } = await sb.rpc('check_and_increment_api_calls', {
    p_user_id: userId,
    p_today:   today,
  });

  if (error) {
    console.error('Usage-Limit RPC Fehler:', error);
    return res.status(500).json({ error: 'Serverfehler beim Limit-Check.' });
  }

  if (data?.error) {
    return res.status(500).json({ error: data.error });
  }

  if (!data?.allowed) {
    return res.status(429).json({
      error:           'Tageslimit erreicht.',
      plan:            data.plan,
      limit:           data.limit,
      used:            data.used,
      upgradeRequired: data.plan === 'free',
    });
  }

  req.usage = {
    plan:      data.plan,
    used:      data.used,
    limit:     data.limit,
    remaining: data.limit === null ? null : data.limit - data.used,
  };

  next();
};

module.exports = { checkUsageLimit };
