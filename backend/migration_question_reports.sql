-- Gemeldete Quizfragen und Klausurbewertungen ("Frage melden" -> Admin-Dashboard).
-- Im Supabase SQL Editor ausführen. Idempotent.
create table if not exists public.question_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('quiz', 'exam')),
  reason text not null check (char_length(reason) <= 40),
  question_text text not null check (char_length(question_text) <= 2000),
  details jsonb not null default '{}'::jsonb check (pg_column_size(details) <= 20000),
  doc_name text check (doc_name is null or char_length(doc_name) <= 300),
  created_at timestamptz not null default now()
);

create index if not exists question_reports_created_at_idx on public.question_reports (created_at desc);

alter table public.question_reports enable row level security;

drop policy if exists "question_reports_insert_own" on public.question_reports;
create policy "question_reports_insert_own" on public.question_reports
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "question_reports_select_own" on public.question_reports;
create policy "question_reports_select_own" on public.question_reports
  for select to authenticated using (user_id = auth.uid());
