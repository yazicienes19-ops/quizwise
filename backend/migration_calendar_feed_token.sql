-- ============================================================
-- StudeArc — Migration: persönlicher Kalender-Abo-Token
-- Ausführen in: Supabase → SQL Editor → New Query → Run
-- Sicher: IF NOT EXISTS, bricht bei erneutem Ausführen nicht ab
--
-- Erlaubt den Studienplaner-Kalender per .ics-Abo-Link im Handy-Kalender
-- (Apple Kalender/Google Kalender/Outlook) anzuzeigen. Der Token ist das
-- einzige "Login" für den öffentlichen Feed-Endpunkt (GET
-- /api/calendar-feed/:token.ics, kein requireAuth möglich, da Kalender-
-- Apps keine Authorization-Header senden) — deshalb ein eigenes,
-- zufälliges Token statt der echten User-ID, und ein partieller Unique-
-- Index (nur für Nutzer, die den Link schon erzeugt haben).
-- ============================================================

alter table public.profiles
  add column if not exists calendar_feed_token text;

create unique index if not exists profiles_calendar_feed_token_idx
  on public.profiles (calendar_feed_token)
  where calendar_feed_token is not null;
