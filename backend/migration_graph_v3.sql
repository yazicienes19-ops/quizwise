-- Migration v3 — Wissensnetz: Dokumentmodell vereinfachen
--
-- Rein additiv im Sinne von "kein Datenverlust an genutzten Daten": excerpt/
-- page wurden nie von einer UI geschrieben (Phase 2 bis 3.0), es existieren
-- also keine echten Werte, die verloren gehen könnten.
--
-- Entscheidung (KNOWLEDGE_GRAPH_KONZEPT.md, 2026-08-02): Ein Node kennt
-- ausschließlich WELCHE Quellen zu ihm gehören, keine Position darin —
-- das Wissensnetz soll kein zweiter PDF-Reader werden.

alter table public.graph_node_documents
  drop column if exists excerpt;

alter table public.graph_node_documents
  drop column if exists page;
