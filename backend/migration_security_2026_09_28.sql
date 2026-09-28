-- StudeArc — Migration: Sicherheits-Check 28.09.2026
-- Ausführen in: Supabase Dashboard → SQL Editor. Wiederholbar.
--
-- VORAUSSETZUNG: Backend-Stand mit middleware/limits.js über req.supabaseAdmin
-- muss auf Railway laufen, sonst schlägt der Limit-Check nach Teil 1 fehl.
-- Das Frontend fällt vor/nach dieser Migration automatisch auf den passenden
-- Lesepfad zurück (services/sharedLinkRpc.ts), Reihenfolge dort egal.

-- ── Teil 1: Zähler-Funktionen nur noch für das Backend ──────────────────────
-- Beide waren per /rest/v1/rpc ohne Login aufrufbar (Postgres gibt EXECUTE
-- standardmäßig an PUBLIC). Damit ließ sich der eigene Tageszähler per
-- beliebigem p_today zurücksetzen, fremde Limits verbrauchen und Lernzeiten
-- in der Admin-Übersicht fälschen. Das Backend ruft beide mit dem Service-Key.
revoke all on function public.check_and_increment_api_calls(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.check_and_increment_api_calls(uuid, text, boolean) to service_role;

revoke all on function public.record_activity_heartbeat(uuid, integer) from public, anon, authenticated;
grant execute on function public.record_activity_heartbeat(uuid, integer) to service_role;

-- Ältere Überladung ohne p_exam_workflow (migration_atomic_usage_counter.sql),
-- falls migration_exam_guarantee_fix_overload.sql sie nicht schon entfernt hat.
do $$
begin
  if to_regprocedure('public.check_and_increment_api_calls(uuid, text)') is not null then
    execute 'revoke all on function public.check_and_increment_api_calls(uuid, text) from public, anon, authenticated';
  end if;
end $$;

-- ── Teil 2: Geteilte Fächer/Decks nur noch per konkretem Link ───────────────
-- Vorher: SELECT USING (true) → jeder konnte ALLE geteilten Fächer samt
-- Dokumenttext, Besitzername und Nutzer-ID auflisten. Jetzt: Besitzer sieht
-- seine eigenen Zeilen (nötig für upsert/RETURNING), alle anderen lesen genau
-- eine Zeile per ID über die Funktionen unten, ohne owner_id.
drop policy if exists "Geteiltes Fach öffentlich lesbar" on public.shared_collections;
drop policy if exists "Eigene geteilte Fächer lesen" on public.shared_collections;
create policy "Eigene geteilte Fächer lesen" on public.shared_collections
  for select using (auth.uid() = owner_id);

drop policy if exists "Geteilte Decks öffentlich lesbar" on public.shared_decks;
drop policy if exists "Eigene geteilte Decks lesen" on public.shared_decks;
create policy "Eigene geteilte Decks lesen" on public.shared_decks
  for select using (auth.uid() = owner_id);

create or replace function public.get_shared_collection(p_id text)
returns table (id text, owner_name text, name text, emoji text, color text, documents jsonb, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.owner_name, c.name, c.emoji, c.color, c.documents, c.created_at
  from public.shared_collections c
  where c.id = p_id;
$$;

create or replace function public.get_shared_deck(p_id text)
returns table (id text, owner_name text, name text, cards jsonb, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select d.id, d.owner_name, d.name, d.cards, d.created_at
  from public.shared_decks d
  where d.id = p_id;
$$;

revoke all on function public.get_shared_collection(text) from public;
revoke all on function public.get_shared_deck(text) from public;
grant execute on function public.get_shared_collection(text) to anon, authenticated;
grant execute on function public.get_shared_deck(text) to anon, authenticated;

-- ── Kontrolle ───────────────────────────────────────────────────────────────
-- Erwartung: anon/authenticated = false bei den Zähler-Funktionen, true bei get_shared_*.
select p.proname,
       has_function_privilege('anon', p.oid, 'execute')          as anon,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in ('check_and_increment_api_calls', 'record_activity_heartbeat', 'get_shared_collection', 'get_shared_deck');
