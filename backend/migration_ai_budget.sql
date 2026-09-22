-- Monatsbudget für Gemini-Kosten (backend/src/budget/aiBudget.js).
-- Ausführen in: Supabase Dashboard → SQL Editor. Idempotent.
--
-- Solange diese Migration fehlt, läuft das Backend normal weiter, das Budget
-- ist dann aber INAKTIV (Warnung im Railway-Log).
--
-- Beide Tabellen sind nur für das Backend (Service-Role) gedacht: RLS an,
-- keine Policies, dadurch kommen Nutzer mit ihrem eigenen Token nicht heran.

create table if not exists public.ai_usage_monthly (
  user_id uuid not null references auth.users(id) on delete cascade,
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  cost_usd numeric(14, 6) not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  calls integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, month)
);

create index if not exists ai_usage_monthly_month_idx on public.ai_usage_monthly (month);

alter table public.ai_usage_monthly enable row level security;
revoke all on public.ai_usage_monthly from anon, authenticated;

-- Genau eine Zeile (id = 1). Beträge in EUR, soft_ratio = ab welchem Anteil
-- Hinweis + Sparmodus greifen.
create table if not exists public.ai_budget_settings (
  id smallint primary key default 1 check (id = 1),
  global_monthly_eur numeric(10, 2) not null default 20 check (global_monthly_eur >= 0),
  pro_user_monthly_eur numeric(10, 2) not null default 5 check (pro_user_monthly_eur >= 0),
  free_user_monthly_eur numeric(10, 2) not null default 1 check (free_user_monthly_eur >= 0),
  soft_ratio numeric(3, 2) not null default 0.80 check (soft_ratio > 0 and soft_ratio <= 1),
  updated_at timestamptz not null default now()
);

insert into public.ai_budget_settings (id) values (1) on conflict (id) do nothing;

alter table public.ai_budget_settings enable row level security;
revoke all on public.ai_budget_settings from anon, authenticated;

-- Atomar aufaddieren (parallele Anfragen desselben Nutzers).
create or replace function public.record_ai_usage(
  p_user_id uuid, p_month text, p_cost numeric, p_input bigint, p_output bigint
) returns void
language sql
as $$
  insert into public.ai_usage_monthly as u (user_id, month, cost_usd, input_tokens, output_tokens, calls)
  values (p_user_id, p_month, greatest(p_cost, 0), greatest(p_input, 0), greatest(p_output, 0), 1)
  on conflict (user_id, month) do update set
    cost_usd = u.cost_usd + excluded.cost_usd,
    input_tokens = u.input_tokens + excluded.input_tokens,
    output_tokens = u.output_tokens + excluded.output_tokens,
    calls = u.calls + 1,
    updated_at = now();
$$;

create or replace function public.get_ai_budget_status(p_user_id uuid, p_month text)
returns table (user_cost numeric, global_cost numeric)
language sql stable
as $$
  select
    coalesce((select cost_usd from public.ai_usage_monthly where user_id = p_user_id and month = p_month), 0),
    coalesce((select sum(cost_usd) from public.ai_usage_monthly where month = p_month), 0);
$$;

revoke all on function public.record_ai_usage(uuid, text, numeric, bigint, bigint) from public, anon, authenticated;
revoke all on function public.get_ai_budget_status(uuid, text) from public, anon, authenticated;
grant execute on function public.record_ai_usage(uuid, text, numeric, bigint, bigint) to service_role;
grant execute on function public.get_ai_budget_status(uuid, text) to service_role;
