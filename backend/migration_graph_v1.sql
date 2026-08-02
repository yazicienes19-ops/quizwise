-- ============================================================
-- StudeArc — Knowledge Graph Phase 1: Datenbank-Migration
-- Ausführen in: Supabase → SQL Editor → New Query → Run
-- Sicher: verwendet IF NOT EXISTS / OR REPLACE / DROP...IF EXISTS,
-- bricht bei erneutem Ausführen nicht ab.
-- Ersetzt KEINE bestehende Tabelle — reine Ergänzung.
-- Architektur/Begründungen: siehe KNOWLEDGE_GRAPH_PHASE1_PLAN.md
--
-- ID-Strategie bewusst NUR für diese vier Tabellen: uuid statt der
-- sonst in der App üblichen Math.random().toString(36)-Kurz-IDs.
-- Grund (vollständige Analyse siehe Planungsdokument): keine der
-- bestehenden Tabellen/Routen (u.a. der /shared/{id}-Link in App.tsx,
-- der auf [a-z0-9]+ prüft) ist betroffen, da diese Tabellen komplett
-- neu sind. Einfacher Primary Key statt zusammengesetztem
-- (id, user_id) wie bei mindmaps/flashcard_decks, weil eine UUID
-- praktisch kollisionsfrei ist.
-- ============================================================

create extension if not exists pgcrypto;


-- ── 1. Gemeinsame Trigger-Funktionen ──────────────────────────────────────────

-- updated_at + version werden AUSSCHLIESSLICH hier gesetzt, nie vom Client —
-- Begründung: Sync-Korrektheit (Last-Write-Wins) hängt bei diesem Feature an
-- sehr viel mehr Zeilen als bei den übrigen Tabellen der App.
create or replace function public.touch_graph_row()
returns trigger as $$
begin
  new.updated_at := now();
  new.version := coalesce(old.version, 0) + 1;
  return new;
end;
$$ language plpgsql;

-- RLS prüft nur user_id auf der Kante selbst — nicht, ob source/target-Node
-- und relation_type tatsächlich demselben Nutzer gehören. Dieser Trigger
-- schließt genau diese Lücke.
create or replace function public.assert_graph_edge_ownership()
returns trigger as $$
begin
  if not exists (
    select 1 from public.graph_nodes
    where id = new.source_node_id and user_id = new.user_id
  ) then
    raise exception 'source_node_id gehört nicht zum angegebenen Nutzer';
  end if;
  if not exists (
    select 1 from public.graph_nodes
    where id = new.target_node_id and user_id = new.user_id
  ) then
    raise exception 'target_node_id gehört nicht zum angegebenen Nutzer';
  end if;
  if not exists (
    select 1 from public.graph_relation_types
    where id = new.relation_type_id and (user_id = new.user_id or user_id is null)
  ) then
    raise exception 'relation_type_id ist weder eigen noch global';
  end if;
  return new;
end;
$$ language plpgsql security definer;

-- Analoge Absicherung für die Dokument-Verknüpfung: node_id und document_id
-- müssen beide tatsächlich dem angegebenen Nutzer gehören.
create or replace function public.assert_graph_node_document_ownership()
returns trigger as $$
begin
  if not exists (
    select 1 from public.graph_nodes
    where id = new.node_id and user_id = new.user_id
  ) then
    raise exception 'node_id gehört nicht zum angegebenen Nutzer';
  end if;
  if not exists (
    select 1 from public.documents
    where id = new.document_id and user_id = new.user_id
  ) then
    raise exception 'document_id gehört nicht zum angegebenen Nutzer';
  end if;
  return new;
end;
$$ language plpgsql security definer;


-- ── 2. Tabelle: graph_relation_types ───────────────────────────────────────────
-- user_id NULL = global/eingebaut. Sichtbar für alle (SELECT-Policy),
-- aber nicht über die App änderbar/löschbar — auth.uid() = user_id ist bei
-- user_id IS NULL nie wahr, UPDATE/DELETE-Policies greifen also nie.

create table if not exists public.graph_relation_types (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        references public.profiles(id) on delete cascade,
  label         text        not null,
  inverse_label text,
  symmetric     boolean     not null default false,
  color         text,
  icon          text,
  is_built_in   boolean     not null default false,
  sort_order    integer     not null default 0,
  created_at    timestamptz not null default now(),
  unique (user_id, label)
);

alter table public.graph_relation_types enable row level security;

drop policy if exists "Sichtbare Beziehungstypen" on public.graph_relation_types;
create policy "Sichtbare Beziehungstypen" on public.graph_relation_types
  for select using (user_id is null or auth.uid() = user_id);

drop policy if exists "Eigene Beziehungstypen anlegen" on public.graph_relation_types;
create policy "Eigene Beziehungstypen anlegen" on public.graph_relation_types
  for insert with check (auth.uid() = user_id);

drop policy if exists "Eigene Beziehungstypen ändern" on public.graph_relation_types;
create policy "Eigene Beziehungstypen ändern" on public.graph_relation_types
  for update using (auth.uid() = user_id);

drop policy if exists "Eigene Beziehungstypen löschen" on public.graph_relation_types;
create policy "Eigene Beziehungstypen löschen" on public.graph_relation_types
  for delete using (auth.uid() = user_id);

-- Eingebaute Beziehungstypen einmalig seeden. Bewusst per WHERE NOT EXISTS
-- statt ON CONFLICT: eine UNIQUE-Constraint behandelt zwei NULL-Werte in
-- user_id nicht automatisch als Duplikat, ON CONFLICT (user_id, label)
-- würde bei erneutem Ausführen also stumm weitere Kopien einfügen.
insert into public.graph_relation_types (label, inverse_label, symmetric, is_built_in, sort_order)
select v.label, v.inverse_label, v.symmetric, true, v.sort_order
from (values
  ('ist Teil von',          'enthält',               false, 1),
  ('Voraussetzung von',     'baut auf … auf',        false, 2),
  ('Beispiel für',          'hat als Beispiel',      false, 3),
  ('Ursache von',           'wird verursacht durch', false, 4),
  ('Gegensatz zu',          null,                    true,  5),
  ('gehört zusammen mit',   null,                    true,  6)
) as v(label, inverse_label, symmetric, sort_order)
where not exists (
  select 1 from public.graph_relation_types r
  where r.user_id is null and r.label = v.label
);


-- ── 3. Tabelle: graph_nodes ─────────────────────────────────────────────────────

create table if not exists public.graph_nodes (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references public.profiles(id) on delete cascade,
  collection_id text        references public.collections(id) on delete set null,
  type          text        not null default 'begriff',   -- bewusst kein CHECK-Enum, s. Planungsdokument
  title         text        not null check (length(trim(title)) > 0),
  description   text        not null default '',
  notes         text        not null default '',
  color         text,
  icon          text,
  tags          text[]      not null default '{}',
  position_x    double precision not null default 0,
  position_y    double precision not null default 0,
  pinned        boolean     not null default false,        -- reserviert für Phase 2 (Auto-Layout)
  archived_at   timestamptz,                                -- Soft Delete + Sync-Tombstone in einem Feld
  version       integer     not null default 1,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.graph_nodes enable row level security;

drop policy if exists "Eigene Graph-Nodes" on public.graph_nodes;
create policy "Eigene Graph-Nodes" on public.graph_nodes for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists graph_nodes_touch on public.graph_nodes;
create trigger graph_nodes_touch before update on public.graph_nodes
  for each row execute procedure public.touch_graph_row();

create index if not exists graph_nodes_user_idx on public.graph_nodes (user_id);
create index if not exists graph_nodes_active_by_collection_idx
  on public.graph_nodes (user_id, collection_id) where archived_at is null;
create index if not exists graph_nodes_sync_idx on public.graph_nodes (user_id, updated_at);
create index if not exists graph_nodes_tags_idx on public.graph_nodes using gin (tags);


-- ── 4. Tabelle: graph_edges ──────────────────────────────────────────────────────

create table if not exists public.graph_edges (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null references public.profiles(id) on delete cascade,
  source_node_id   uuid        not null references public.graph_nodes(id) on delete cascade,
  target_node_id   uuid        not null references public.graph_nodes(id) on delete cascade,
  relation_type_id uuid        not null references public.graph_relation_types(id) on delete restrict,
  label            text,
  archived_at      timestamptz,
  version          integer     not null default 1,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (source_node_id <> target_node_id)
);

-- Verhindert doppelte AKTIVE Kanten mit identischem Beziehungstyp zwischen
-- denselben zwei Nodes — ein archiviertes Duplikat blockiert eine neue,
-- inhaltlich gleiche Kante nicht (partieller Index statt hartem UNIQUE).
create unique index if not exists graph_edges_no_duplicate_active_idx
  on public.graph_edges (source_node_id, target_node_id, relation_type_id)
  where archived_at is null;

alter table public.graph_edges enable row level security;

drop policy if exists "Eigene Graph-Edges" on public.graph_edges;
create policy "Eigene Graph-Edges" on public.graph_edges for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists graph_edges_touch on public.graph_edges;
create trigger graph_edges_touch before update on public.graph_edges
  for each row execute procedure public.touch_graph_row();

drop trigger if exists graph_edges_ownership on public.graph_edges;
create trigger graph_edges_ownership before insert or update on public.graph_edges
  for each row execute procedure public.assert_graph_edge_ownership();

create index if not exists graph_edges_source_idx
  on public.graph_edges (user_id, source_node_id) where archived_at is null;
create index if not exists graph_edges_target_idx
  on public.graph_edges (user_id, target_node_id) where archived_at is null;
create index if not exists graph_edges_sync_idx on public.graph_edges (user_id, updated_at);


-- ── 5. Tabelle: graph_node_documents ────────────────────────────────────────────
-- Bewusst kein Tombstone/archived_at (konfliktarme, leichte Verknüpfung) und
-- bewusst kein UNIQUE(node_id, document_id) — derselbe Node darf legitim
-- mehrere Zitatstellen desselben Dokuments referenzieren.

create table if not exists public.graph_node_documents (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references public.profiles(id) on delete cascade,
  node_id     uuid        not null references public.graph_nodes(id) on delete cascade,
  document_id text        not null references public.documents(id) on delete cascade,
  excerpt     text,
  page        integer,
  created_at  timestamptz not null default now()
);

alter table public.graph_node_documents enable row level security;

drop policy if exists "Eigene Dokument-Verknüpfungen" on public.graph_node_documents;
create policy "Eigene Dokument-Verknüpfungen" on public.graph_node_documents for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists graph_node_documents_ownership on public.graph_node_documents;
create trigger graph_node_documents_ownership before insert or update on public.graph_node_documents
  for each row execute procedure public.assert_graph_node_document_ownership();

create index if not exists graph_node_documents_node_idx on public.graph_node_documents (user_id, node_id);
create index if not exists graph_node_documents_doc_idx on public.graph_node_documents (user_id, document_id);
