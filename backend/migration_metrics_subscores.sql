-- ============================================================
-- QuizWise — Migration: Sub-Scores pro Lernmethode in metrics
-- Ausführen in: Supabase → SQL Editor → New Query → Run
-- Sicher: IF NOT EXISTS, bricht bei Konflikt nicht ab
-- App funktioniert auch ohne diese Migration (Fallback in syncMetrics
-- lässt sub_scores dann einfach weg — nur ohne Multi-Device-Sync dieses Felds)
-- ============================================================

alter table metrics add column if not exists sub_scores jsonb default '{}'::jsonb;
