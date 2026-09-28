const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY || ANON_KEY);

const createUserClient = (accessToken) =>
  createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

const requireAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Nicht eingeloggt.' });
  }

  const token = authHeader.split(' ')[1];
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    return res.status(401).json({ error: 'Token ungültig oder abgelaufen.' });
  }

  req.user = user;
  req.supabase = createUserClient(token);
  // Service-Client für RPCs, die nur das Backend ausführen darf
  // (migration_security_2026_09_28.sql).
  req.supabaseAdmin = supabaseAdmin;
  next();
};

module.exports = { requireAuth, supabaseAdmin };
