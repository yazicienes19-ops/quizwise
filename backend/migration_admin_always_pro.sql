-- Admins gelten immer als Pro (15.10.2026).
-- Anlass: Admin-Konto stand nach abgelaufener Pro-Vergabe wieder auf plan = 'free'
-- und konnte kein 6. Dokument hochladen. Spiegelt config/admin.ts und
-- backend/src/middleware/requireAdmin.js (Listen synchron halten).

update public.profiles
set plan = 'pro', admin_pro_until = null
where id in ('efb1b348-9d63-41db-848d-5b87836dd0a1');

create or replace function public.enforce_free_document_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan  text;
  v_count integer;
begin
  if exists (select 1 from public.documents where id = new.id) then
    return new;
  end if;

  -- Admins: nie begrenzen.
  if new.user_id in ('efb1b348-9d63-41db-848d-5b87836dd0a1'::uuid) then
    return new;
  end if;

  select plan into v_plan from public.profiles where id = new.user_id;
  if coalesce(v_plan, 'free') = 'pro' then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('free_doc_limit:' || new.user_id::text));

  select count(*) into v_count from public.documents where user_id = new.user_id;
  if v_count >= 5 then
    raise exception 'FREE_DOC_LIMIT: Der Free-Plan erlaubt höchstens 5 Dokumente.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- Kontrolle: muss plan = pro und admin_pro_until leer zeigen.
select id, plan, admin_pro_until from public.profiles
where id = 'efb1b348-9d63-41db-848d-5b87836dd0a1';
