-- ============================================================
-- QuizWise — Migration: UPDATE-Policy für shared_decks
-- Ausführen in: Supabase → SQL Editor → New Query → Run
-- Sicher: DROP POLICY IF EXISTS davor, bricht bei erneutem Ausführen nicht ab
--
-- Bisher hatte shared_decks nur SELECT (öffentlich) + INSERT (Owner) —
-- erneutes Teilen eines bereits geteilten Decks (z.B. nach neuen Karten)
-- scheiterte am Unique-Constraint auf id und der Link blieb für immer auf
-- dem Stand des ersten Teilens einfrieren. shareDeck() nutzt jetzt upsert()
-- statt insert(), dafür braucht es diese UPDATE-Policy.
-- ============================================================

drop policy if exists "Eigene Decks aktualisieren" on public.shared_decks;

create policy "Eigene Decks aktualisieren" on public.shared_decks
  for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
