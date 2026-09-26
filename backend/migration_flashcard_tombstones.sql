-- Löschvermerke für Karteikarten (26.09.2026)
--
-- Problem: Der Abgleich führte Karten per Union zusammen. Eine gelöschte Karte
-- kam aus der Cloud oder von einem zweiten Gerät zurück, ein gelöschter Stapel
-- ebenso, wenn die Löschung die Cloud nicht erreichte.
--
-- deleted_card_ids: Karten-ID -> Löschzeitpunkt (ms), je Stapel.
-- deleted_at:       Stapel gelöscht; die Zeile bleibt als Vermerk stehen
--                   (cards wird dabei geleert), damit andere Geräte ihn nicht
--                   wieder hochladen.
--
-- Der Code funktioniert auch ohne diese Spalten (dann nur lokale Vermerke).
-- Idempotent, kann gefahrlos erneut laufen.

alter table public.flashcard_decks
  add column if not exists deleted_card_ids jsonb not null default '{}'::jsonb,
  add column if not exists deleted_at timestamptz;

-- Prüfen:
-- select column_name, data_type from information_schema.columns
--  where table_name = 'flashcard_decks' and column_name in ('deleted_card_ids', 'deleted_at');
