-- QuizWise Datenbankschema
-- Ausführen in: Supabase → SQL Editor → New Query → Run

-- 1. User-Profile (wird automatisch bei Registrierung erstellt)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  full_name text,
  plan text default 'free' check (plan in ('free', 'pro')),
  api_calls_today integer default 0,
  api_calls_reset_at date default current_date,
  created_at timestamptz default now()
);

-- Automatisch ein Profil anlegen wenn sich jemand registriert
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 2. Row Level Security (RLS) — jeder Nutzer sieht nur seine eigenen Daten
alter table public.profiles enable row level security;

create policy "Nutzer sehen nur ihr eigenes Profil"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Nutzer können ihr Profil bearbeiten"
  on public.profiles for update
  using (auth.uid() = id);

-- 3. Lern-Metriken (bisher in localStorage)
create table if not exists public.metrics (
  id text,
  user_id uuid references public.profiles on delete cascade,
  topic text not null,
  confidence integer default 0,
  last_reviewed bigint,
  total_attempts integer default 0,
  correct_attempts integer default 0,
  created_at timestamptz default now(),
  primary key (user_id, topic)
);

alter table public.metrics enable row level security;
create policy "Eigene Metriken" on public.metrics
  using (auth.uid() = user_id);
create policy "Eigene Metriken einfügen" on public.metrics for insert
  with check (auth.uid() = user_id);
create policy "Eigene Metriken aktualisieren" on public.metrics for update
  using (auth.uid() = user_id);

-- 4. Karteikarten-Decks
create table if not exists public.flashcard_decks (
  id text primary key,
  user_id uuid references public.profiles on delete cascade,
  title text not null,
  cards jsonb default '[]',
  created_at timestamptz default now()
);

alter table public.flashcard_decks enable row level security;
create policy "Eigene Decks" on public.flashcard_decks
  using (auth.uid() = user_id);
create policy "Eigene Decks einfügen" on public.flashcard_decks for insert
  with check (auth.uid() = user_id);
create policy "Eigene Decks aktualisieren" on public.flashcard_decks for update
  using (auth.uid() = user_id);
create policy "Eigene Decks löschen" on public.flashcard_decks for delete
  using (auth.uid() = user_id);

-- 5. Studienplan
create table if not exists public.study_plan (
  id text primary key,
  user_id uuid references public.profiles on delete cascade,
  entries jsonb default '[]',
  exams jsonb default '[]',
  updated_at timestamptz default now()
);

alter table public.study_plan enable row level security;
create policy "Eigener Studienplan" on public.study_plan
  using (auth.uid() = user_id);
create policy "Studienplan einfügen" on public.study_plan for insert
  with check (auth.uid() = user_id);
create policy "Studienplan aktualisieren" on public.study_plan for update
  using (auth.uid() = user_id);
