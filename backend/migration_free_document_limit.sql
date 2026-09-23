-- Free-Plan: höchstens 5 Dokumente, durchgesetzt in der Datenbank (Audit 23.09.2026).
--
-- Bisher prüfte nur der Browser (hooks/useDocuments.ts FREE_DOC_LIMIT), und das
-- Übernehmen eines geteilten Fachs umging die Grenze ganz. Produktentscheidung
-- 23.09.2026: ALLES zählt, auch übernommene Fächer.
--
-- Wirkung:
--   * Neue Zeile in documents für einen Nutzer ohne plan = 'pro' mit bereits
--     5 oder mehr Dokumenten → Fehler "FREE_DOC_LIMIT" (die App zeigt dann den
--     Upgrade-Hinweis).
--   * Aktualisierungen bestehender Dokumente laufen immer durch. Die App speichert
--     per upsert, und Postgres feuert BEFORE INSERT auch bei INSERT … ON CONFLICT
--     DO UPDATE. Deshalb wird zuerst geprüft, ob die id schon existiert.
--   * Pro (auch befristet vom Admin vergeben, admin_pro_until) = plan 'pro' → kein Limit.
--   * Bestehende Free-Konten mit mehr als 5 Dokumenten behalten alles, können aber
--     nichts Neues hinzufügen.
--
-- Parallel-Uploads: ein Transaktions-Lock pro Nutzer verhindert, dass zwei
-- gleichzeitige Uploads beide als "Dokument Nr. 5" durchrutschen.

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
  -- Upsert eines vorhandenen Dokuments = Aktualisierung, nie blockieren.
  if exists (select 1 from public.documents where id = new.id) then
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

drop trigger if exists documents_free_limit on public.documents;
create trigger documents_free_limit
  before insert on public.documents
  for each row execute function public.enforce_free_document_limit();

-- Kontrolle: muss eine Zeile "documents_free_limit" liefern.
select tgname from pg_trigger where tgname = 'documents_free_limit';
