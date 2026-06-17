const express = require('express');
const Stripe = require('stripe');
const { supabase } = require('../middleware/auth');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const PRO_PRICE_ID = process.env.STRIPE_PRO_PRICE_ID;

// Hilfsfunktion: Stripe-Customer anhand der E-Mail finden
const findCustomer = async (email) => {
  const list = await stripe.customers.list({ email, limit: 1 });
  return list.data[0] || null;
};

// POST /api/stripe/create-checkout
router.post('/create-checkout', requireAuth, async (req, res, next) => {
  try {
    let customer = await findCustomer(req.user.email);
    if (!customer) {
      customer = await stripe.customers.create({
        email: req.user.email,
        metadata: { userId: req.user.id },
      });
    } else if (!customer.metadata?.userId) {
      await stripe.customers.update(customer.id, { metadata: { userId: req.user.id } });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer: customer.id,
      line_items: [{ price: PRO_PRICE_ID, quantity: 1 }],
      success_url: `${process.env.FRONTEND_URL}?upgrade=success`,
      cancel_url: `${process.env.FRONTEND_URL}?upgrade=cancelled`,
      metadata: { userId: req.user.id },
    });
    res.json({ url: session.url });
  } catch (err) { next(err); }
});

// GET /api/stripe/invoices
// Zahlungshistorie des eingeloggten Nutzers
router.get('/invoices', requireAuth, async (req, res, next) => {
  try {
    const customer = await findCustomer(req.user.email);
    if (!customer) return res.json({ invoices: [] });

    const invoices = await stripe.invoices.list({ customer: customer.id, limit: 12 });

    const formatted = invoices.data.map(inv => ({
      id: inv.id,
      date: new Date(inv.created * 1000).toLocaleDateString('de-DE'),
      amount: (inv.amount_paid / 100).toFixed(2),
      currency: inv.currency.toUpperCase(),
      status: inv.status,
      pdf: inv.invoice_pdf,
    }));

    res.json({ invoices: formatted });
  } catch (err) { next(err); }
});

// POST /api/stripe/cancel
// Abo am Ende der Laufzeit kündigen (nicht sofort)
router.post('/cancel', requireAuth, async (req, res, next) => {
  try {
    const customer = await findCustomer(req.user.email);
    if (!customer) return res.status(404).json({ error: 'Kein Abo gefunden.' });

    const subscriptions = await stripe.subscriptions.list({ customer: customer.id, status: 'active', limit: 1 });
    if (!subscriptions.data.length) return res.status(404).json({ error: 'Kein aktives Abo gefunden.' });

    // cancel_at_period_end: Nutzer behält Pro bis Periodenende, dann Free
    await stripe.subscriptions.update(subscriptions.data[0].id, { cancel_at_period_end: true });

    res.json({ success: true, endsAt: new Date(subscriptions.data[0].current_period_end * 1000).toLocaleDateString('de-DE') });
  } catch (err) { next(err); }
});

// POST /api/stripe/webhook
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.metadata?.userId;
    if (userId) {
      await supabase.from('profiles').update({ plan: 'pro' }).eq('id', userId);
      if (session.customer) {
        await stripe.customers.update(session.customer, { metadata: { userId } }).catch(() => {});
      }
      console.log(`✅ User ${userId} auf Pro upgraded`);
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object;
    const customer = await stripe.customers.retrieve(sub.customer);
    const userId = customer?.metadata?.userId;
    if (userId) {
      await supabase.from('profiles').update({ plan: 'free' }).eq('id', userId);
      console.log(`⬇️ User ${userId} zurück auf Free`);
    }
  }

  res.json({ received: true });
});

module.exports = router;
