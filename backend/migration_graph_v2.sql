-- Migration v2 — Wissensnetz: Hierarchie-Ebene pro Node
--
-- Rein additiv, kein Datenverlust, keine bestehende Zeile wird berührt.
-- hierarchy_level ist NULLable und hat bewusst KEINEN Default — "noch nicht
-- festgelegt" ist ein gültiger, dauerhafter Zustand (s. KNOWLEDGE_GRAPH_KONZEPT.md
-- Abschnitt 5: wird nie automatisch aus type/Position/Kantenanzahl abgeleitet,
-- ausschließlich vom Nutzer bewusst gesetzt).
--
-- Anders als `type` (bewusst offener String ohne CHECK, s. migration_graph_v1.sql)
-- ist die Hierarchie eine echte, stabile, geschlossene Menge von drei Stufen —
-- ein CHECK-Constraint ist hier deshalb sinnvoll und günstig, kein Widerspruch
-- zur Offenheit von `type`.

alter table public.graph_nodes
  add column if not exists hierarchy_level text;

alter table public.graph_nodes
  drop constraint if exists graph_nodes_hierarchy_level_check;

alter table public.graph_nodes
  add constraint graph_nodes_hierarchy_level_check
  check (hierarchy_level is null or hierarchy_level in ('hauptthema', 'unterthema', 'detail'));
