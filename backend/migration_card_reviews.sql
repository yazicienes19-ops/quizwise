-- ============================================================
-- StudeArc: Wiederholungsprotokoll der Karteikarten (25.09.2026)
-- Ausführen in: Supabase → SQL Editor → New Query → Run
-- Wiederholbar (IF NOT EXISTS, Policies werden vorher entfernt).
-- ============================================================
-- Ein Eintrag pro Bewertung einer Karte. Grundlage für Lernverlauf
-- (Heatmap, Verlauf einer Karte) und für die Anpassung von FSRS an den
-- eigenen Lernverlauf (services/fsrsPersonal.ts).

CREATE TABLE IF NOT EXISTS public.card_reviews (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  card_id       text        NOT NULL,
  deck_id       text,
  reviewed_at   timestamptz NOT NULL DEFAULT now(),
  rating        smallint    NOT NULL CHECK (rating BETWEEN 1 AND 4),   -- 1 Nochmal, 2 Schwer, 3 Gut, 4 Einfach
  elapsed_days  real,        -- Tage seit der vorigen Wiederholung, NULL bei neuer Karte
  interval_days real,        -- neues Intervall
  stability     real,
  difficulty    real,
  client_id     text        -- vom Gerät vergeben, verhindert doppelte Einträge beim Nachreichen
);

CREATE INDEX IF NOT EXISTS card_reviews_user_time ON public.card_reviews (user_id, reviewed_at);
CREATE INDEX IF NOT EXISTS card_reviews_user_card ON public.card_reviews (user_id, card_id);
CREATE UNIQUE INDEX IF NOT EXISTS card_reviews_client ON public.card_reviews (user_id, client_id);

ALTER TABLE public.card_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Eigene Wiederholungen lesen" ON public.card_reviews;
DROP POLICY IF EXISTS "Eigene Wiederholungen anlegen" ON public.card_reviews;
DROP POLICY IF EXISTS "Eigene Wiederholungen löschen" ON public.card_reviews;

CREATE POLICY "Eigene Wiederholungen lesen" ON public.card_reviews
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Eigene Wiederholungen anlegen" ON public.card_reviews
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Eigene Wiederholungen löschen" ON public.card_reviews
  FOR DELETE USING (auth.uid() = user_id);

-- Kontrolle: sollte 1 Zeile mit rowsecurity = true liefern
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'card_reviews';
