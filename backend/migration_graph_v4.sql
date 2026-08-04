-- Migration v4 — Wissensnetz: Beziehungstyp beim Anlegen einer Kante optional
--
-- User-Vorgabe 2026-08-04: Beim Ziehen einer Verbindung darf die Eingabe
-- eines Beziehungstyps nicht verpflichtend sein. Die Verbindung soll auch
-- ohne Bezeichnung anlegbar sein, ohne Fehler, und der Typ soll später
-- jederzeit ergänzt werden können (bereits bestehende Bearbeiten-Logik).
--
-- Dafür muss relation_type_id nullable werden (bisher NOT NULL) und der
-- Ownership-Trigger die Prüfung überspringen, wenn kein Typ gesetzt ist.
--
-- Bekannte, bewusst hingenommene Einschränkung: der bestehende UNIQUE-Index
-- graph_edges_no_duplicate_active_idx (source_node_id, target_node_id,
-- relation_type_id) behandelt NULL-Werte in Postgres als paarweise
-- verschieden — er verhindert also KEINE doppelten unbenannten Kanten auf
-- DB-Ebene. Clientseitig prüft validateNoDuplicateUntypedEdge trotzdem
-- dagegen (sofortiges Feedback im Normalfall), nur ein Duplikat durch
-- Mehrgeräte-Wettlauf wäre theoretisch nicht ausgeschlossen — dieselbe
-- Toleranz, die das Projekt an anderer Stelle für seltene Sync-Randfälle
-- bereits akzeptiert.

alter table public.graph_edges
  alter column relation_type_id drop not null;

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
  if new.relation_type_id is not null and not exists (
    select 1 from public.graph_relation_types
    where id = new.relation_type_id and (user_id = new.user_id or user_id is null)
  ) then
    raise exception 'relation_type_id ist weder eigen noch global';
  end if;
  return new;
end;
$$ language plpgsql security definer;
