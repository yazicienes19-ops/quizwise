const cron = require('node-cron');
const Stripe = require('stripe');
const { supabaseAdmin } = require('../middleware/auth');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Bewusst getrennt von backend/src/routes/stripe.js (CLAUDE.md: "Nicht
// anfassen: Stripe-Integration & Webhooks") — dieser Job liest Stripe nur
// lesend, um zu prüfen, ob eine abgelaufene Admin-Vergabe einen zahlenden
// Kunden träfe, ändert an der Stripe-Integration selbst aber nichts.
async function hasActiveStripeSubscription(email) {
  if (!email) return false;
  const customers = await stripe.customers.list({ email, limit: 1 });
  const customer = customers.data[0];
  if (!customer) return false;
  const subs = await stripe.subscriptions.list({ customer: customer.id, status: 'active', limit: 1 });
  return subs.data.length > 0;
}

// Läuft täglich: Admin-Vergaben, deren Frist abgelaufen ist, zurücksetzen —
// außer der Account zahlt inzwischen wirklich über Stripe (dann nur die
// Admin-Frist löschen, Pro-Status bleibt über den echten Stripe-Flow bestehen).
async function expireProGrants() {
  const { data: expired, error } = await supabaseAdmin
    .from('profiles')
    .select('id, plan, admin_pro_until')
    .not('admin_pro_until', 'is', null)
    .lte('admin_pro_until', new Date().toISOString());
  if (error) { console.error('expireProGrants:', error.message); return; }
  if (!expired?.length) return;

  for (const profile of expired) {
    try {
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(profile.id);
      const isPayingCustomer = await hasActiveStripeSubscription(authUser?.user?.email);
      await supabaseAdmin.from('profiles').update({
        admin_pro_until: null,
        plan: isPayingCustomer ? profile.plan : 'free',
      }).eq('id', profile.id);
    } catch (err) {
      console.error(`expireProGrants (${profile.id}):`, err.message);
    }
  }
}

function startProGrantExpiryJob() {
  cron.schedule('0 3 * * *', () => {
    expireProGrants().catch(e => console.error('expireProGrants scheduler:', e.message));
  }, { timezone: 'Europe/Berlin' });
  console.log('Admin-Pro-Vergabe-Ablauf-Job aktiv (täglich 03:00, Europe/Berlin)');
}

module.exports = { startProGrantExpiryJob, expireProGrants, hasActiveStripeSubscription };
