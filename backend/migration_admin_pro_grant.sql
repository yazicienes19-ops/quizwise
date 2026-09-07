-- Admin-Übersicht: befristeter Pro-Zugang, von Hand vergeben (z.B. 7 Tage
-- Testphase, 1 Monat geschenkt). Läuft unabhängig vom Stripe-Flow — Stripe-
-- Webhooks (checkout.session.completed / customer.subscription.deleted)
-- bleiben unverändert, s. CLAUDE.md "Nicht anfassen: Stripe-Integration".
-- Ausführen in: Supabase → SQL Editor → New Query → Run

alter table public.profiles
  add column if not exists admin_pro_until timestamptz;

-- Account-Sperren laufen über Supabase Auth selbst (banned_until auf
-- auth.users, gesetzt per supabaseAdmin.auth.admin.updateUserById) —
-- dafür ist keine eigene Spalte nötig.
