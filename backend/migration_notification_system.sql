-- ============================================================
-- QuizWise — Migration: Intelligentes Benachrichtigungssystem
-- Ausführen in: Supabase → SQL Editor → New Query → Run
-- Sicher: IF NOT EXISTS, bricht bei erneutem Ausführen nicht ab
--
-- 1. block_status auf user_saved_content: Erledigt-Status der
--    Studienplaner-Lernblöcke, bisher nur lokal im Browser
--    (localStorage 'studearc_block_status'). Erst mit dieser Spalte
--    können Benachrichtigungen exakt sagen "noch X Blöcke offen" und
--    ein "Tagesziel/Wochenziel erreicht" auf Basis erledigter Blöcke
--    erkennen.
-- 2. notification_log: verhindert doppelten Versand derselben
--    Benachrichtigung (z.B. nicht 2x am selben Tag die tägliche
--    Erinnerung). Ein (user_id, dedup_key)-Paar wird nur einmal
--    eingefügt — INSERT ... ON CONFLICT DO NOTHING im Backend.
-- 3. push_subscriptions: existiert bereits live (angelegt bei
--    Einführung von Web Push), war aber bisher in keiner Migrations-
--    datei im Repo dokumentiert. CREATE TABLE IF NOT EXISTS holt das
--    nach, ohne den bestehenden Tabellenstand zu verändern.
-- ============================================================

alter table public.user_saved_content
  add column if not exists block_status jsonb not null default '{}'::jsonb;

create table if not exists public.push_subscriptions (
  endpoint      text primary key,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  subscription  jsonb not null,
  created_at    timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

-- Falls die Tabelle bereits existiert und diese Policy schon angelegt wurde,
-- schlägt diese Zeile mit "policy already exists" fehl — einfach überspringen.
create policy "Eigene Push-Subscription verwalten" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.notification_log (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  dedup_key  text not null,
  sent_at    timestamptz not null default now(),
  primary key (user_id, dedup_key)
);

alter table public.notification_log enable row level security;

-- Nur das Backend (service role) schreibt/liest hier — kein Client-Zugriff.
-- Keine Policy für authenticated/anon nötig; service role umgeht RLS ohnehin.
