-- Admin-Übersicht: Aktivitäts-Tracking für "wer lernt wann wie lange".
-- Ausführen in: Supabase → SQL Editor → New Query → Run
--
-- Der Client meldet per Heartbeat (alle 60s, solange der Tab sichtbar ist)
-- wie viele Sekunden seit dem letzten Heartbeat aktiv genutzt wurden. Damit
-- lässt sich Lernzeit pro Tag ohne fragile Session-Start/-Ende-Logik erfassen
-- (robust gegen Tab-Schließen/Crash, kein "Session-Ende"-Event nötig).

alter table public.profiles
  add column if not exists last_active_at timestamptz;

create table if not exists public.daily_activity (
  user_id uuid references public.profiles on delete cascade,
  activity_date date not null,
  active_seconds integer not null default 0,
  primary key (user_id, activity_date)
);

alter table public.daily_activity enable row level security;

create policy "Eigene Aktivität lesen" on public.daily_activity for select
  using (auth.uid() = user_id);

-- Atomarer Upsert+Increment (Race-Condition-sicher bei parallelen Tabs),
-- analog check_and_increment_api_calls in migration_atomic_usage_counter.sql.
-- SECURITY DEFINER: der Client selbst hat keine INSERT/UPDATE-Policy auf
-- daily_activity — nur der Backend-Service-Key darf diese Funktion aufrufen.
create or replace function public.record_activity_heartbeat(p_user_id uuid, p_seconds integer)
returns void
language plpgsql
security definer
as $$
begin
  insert into public.daily_activity (user_id, activity_date, active_seconds)
  values (p_user_id, current_date, greatest(p_seconds, 0))
  on conflict (user_id, activity_date)
  do update set active_seconds = public.daily_activity.active_seconds + greatest(p_seconds, 0);

  update public.profiles set last_active_at = now() where id = p_user_id;
end;
$$;
