-- Fix: migration_exam_guarantee.sql hat mit CREATE OR REPLACE FUNCTION eine
-- ZWEITE Funktion mit anderer Parameteranzahl erzeugt statt die alte zu
-- ersetzen (Postgres unterscheidet Funktionen auch nach Signatur/Arity) —
-- PostgREST konnte danach zwischen den beiden Überladungen nicht mehr
-- entscheiden ("Could not choose the best candidate function", PGRST203),
-- der Limit-Check schlug dadurch bei JEDEM Gemini-Call fehl (500 statt
-- Durchlass). Ausführen in: Supabase Dashboard → SQL Editor.

DROP FUNCTION IF EXISTS public.check_and_increment_api_calls(uuid, text);
