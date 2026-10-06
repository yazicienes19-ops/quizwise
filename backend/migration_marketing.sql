-- ============================================================
-- Marketing-Bereich für den KI-Manager (ai-manager-tool) und Jarvis
-- Getrennt von allen StudeArc-Lerndaten: eigene Tabellen mit Präfix marketing_,
-- Zugriff nur für Mitglieder aus marketing_members.
--   admin = Enes (alles), agent = Jarvis (nur Kampagnen lesen/anlegen/Status setzen,
--   keine Kontaktdaten, nichts löschen).
-- Normale StudeArc-Nutzer sehen hier nichts.
-- ============================================================

-- ---------- Mitglieder ----------
create table if not exists public.marketing_members (
  user_id  uuid primary key references auth.users (id) on delete cascade,
  role     text not null check (role in ('admin', 'agent'))
);
alter table public.marketing_members enable row level security;
-- Keine Policies: nur über die security-definer-Funktionen unten lesbar.

-- Enes (gleiche ID wie config/admin.ts)
insert into public.marketing_members (user_id, role)
values ('efb1b348-9d63-41db-848d-5b87836dd0a1', 'admin')
on conflict (user_id) do nothing;

-- Jarvis (Konto vorher unter Authentication → Users anlegen; fehlt es, passiert hier nichts)
insert into public.marketing_members (user_id, role)
select id, 'agent' from auth.users where email = 'jarvis@studearc.com'
on conflict (user_id) do nothing;

create or replace function public.marketing_role()
returns text
language sql stable security definer
set search_path = public
as $$
  select role from public.marketing_members where user_id = auth.uid()
$$;
revoke all on function public.marketing_role() from public, anon;
grant execute on function public.marketing_role() to authenticated;

-- ---------- Kontakte (CRM) ----------
create table if not exists public.marketing_customers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 200),
  email       text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$') unique,
  status      text not null default 'lead' check (status in ('lead', 'active', 'inactive')),
  notes       text not null default '' check (char_length(notes) <= 2000),
  created_at  timestamptz not null default now()
);

-- ---------- Kampagnen ----------
create table if not exists public.marketing_campaigns (
  id                 uuid primary key default gen_random_uuid(),
  title              text not null check (char_length(title) between 1 and 200),
  target_audience    text not null default '' check (char_length(target_audience) <= 300),
  channel            text not null default 'sonstiges'
                       check (channel in ('tiktok', 'instagram', 'x', 'email', 'kooperation', 'sonstiges')),
  generated_content  text,
  status             text not null default 'draft'
                       check (status in ('draft', 'generating', 'pending_approval', 'approved', 'rejected', 'sent', 'failed')),
  source             text not null default 'manual' check (source in ('manual', 'jarvis')),
  feedback           text not null default '' check (char_length(feedback) <= 2000),
  created_by         uuid default auth.uid() references auth.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  decided_at         timestamptz
);
create index if not exists marketing_campaigns_status_idx on public.marketing_campaigns (status, created_at desc);

-- ---------- Rechte ----------
grant select, insert, update, delete on public.marketing_customers to authenticated;
grant select, insert, update, delete on public.marketing_campaigns to authenticated;
revoke all on public.marketing_customers, public.marketing_campaigns, public.marketing_members from anon;

alter table public.marketing_customers enable row level security;
alter table public.marketing_campaigns enable row level security;

-- Kontakte: nur Admin (Jarvis sieht keine personenbezogenen Daten)
drop policy if exists "marketing_customers_admin" on public.marketing_customers;
create policy "marketing_customers_admin" on public.marketing_customers
  for all to authenticated
  using (public.marketing_role() = 'admin')
  with check (public.marketing_role() = 'admin');

-- Kampagnen: Admin alles
drop policy if exists "marketing_campaigns_admin" on public.marketing_campaigns;
create policy "marketing_campaigns_admin" on public.marketing_campaigns
  for all to authenticated
  using (public.marketing_role() = 'admin')
  with check (public.marketing_role() = 'admin');

-- Kampagnen: Jarvis lesen, anlegen, ändern (Freigabe-Buttons), aber nicht löschen
drop policy if exists "marketing_campaigns_agent_select" on public.marketing_campaigns;
create policy "marketing_campaigns_agent_select" on public.marketing_campaigns
  for select to authenticated using (public.marketing_role() = 'agent');
drop policy if exists "marketing_campaigns_agent_insert" on public.marketing_campaigns;
create policy "marketing_campaigns_agent_insert" on public.marketing_campaigns
  for insert to authenticated with check (public.marketing_role() = 'agent' and source = 'jarvis');
drop policy if exists "marketing_campaigns_agent_update" on public.marketing_campaigns;
create policy "marketing_campaigns_agent_update" on public.marketing_campaigns
  for update to authenticated
  using (public.marketing_role() = 'agent')
  with check (public.marketing_role() = 'agent');
