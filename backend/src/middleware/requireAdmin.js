// Spiegelt config/admin.ts im Frontend (Supabase-User-IDs der Admins).
// ACHTUNG: Beide Listen manuell synchron halten, wenn sich Admins ändern.
const ADMIN_IDS = ['efb1b348-9d63-41db-848d-5b87836dd0a1'];

const requireAdmin = (req, res, next) => {
  if (!req.user || !ADMIN_IDS.includes(req.user.id)) {
    return res.status(403).json({ error: 'Dieses Feature ist nur für Admin-Accounts freigeschaltet.' });
  }
  next();
};

module.exports = { requireAdmin, ADMIN_IDS };
