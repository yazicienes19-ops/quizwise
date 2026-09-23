import { loadDecksFromSupabase, uploadAllDecksToSupabase } from './flashcardService';
import { mergeDecks } from './deckMerge';
import { readLocalDecks, writeLocalDecks, claimLocalDecks } from './deckStore';

/**
 * Karteikarten mit der Cloud abgleichen: Cloud laden, pro Karte mit dem
 * lokalen Stand mergen (deckMerge), lokal speichern, Neueres hochladen.
 *
 * Lief früher nur beim Öffnen der Karteikarten (FlashcardSystem). Auf einem
 * neuen Gerät sah die Startseite deshalb bis dahin keine einzige fällige Karte
 * und meldete "alles im grünen Bereich" (Audit 23.09.2026). Jetzt startet
 * App.tsx den Abgleich direkt nach dem Login; FlashcardSystem ruft dieselbe
 * Funktion auf und bekommt bei gleichzeitigem Aufruf denselben laufenden Abgleich.
 *
 * Das Ergebnis landet über writeLocalDecks im deckStore; alle Halter (App,
 * FlashcardSystem) ziehen per DECKS_CHANGED_EVENT nach.
 */
const inFlight = new Map<string, Promise<void>>();

const runSync = async (userId: string): Promise<void> => {
  const cloudDecks = await loadDecksFromSupabase(userId);
  // Lokalen Stand erst NACH dem await lesen: was der Nutzer in der
  // Zwischenzeit gelernt oder angelegt hat, darf der Merge nicht verlieren.
  claimLocalDecks(userId);
  const localDecks = readLocalDecks();
  if (cloudDecks.length === 0) {
    if (localDecks.length > 0) await uploadAllDecksToSupabase(localDecks, userId);
    return;
  }
  // Cloud NICHT blind übernehmen — pro Karte mergen, sonst geht
  // Offline-Lernfortschritt dieses Geräts verloren.
  const merged = mergeDecks(localDecks, cloudDecks);
  writeLocalDecks(merged);
  // Hochladen, was die Cloud noch nicht kennt: rein lokale Decks (z.B. per
  // Link übernommen) UND Decks, deren Karten hier neuer sind (offline gelernt).
  const cloudById = new Map(cloudDecks.map(d => [d.id, d]));
  const needsUpload = merged.filter(d => {
    const cloud = cloudById.get(d.id);
    return !cloud || JSON.stringify(cloud.cards) !== JSON.stringify(d.cards);
  });
  if (needsUpload.length > 0) uploadAllDecksToSupabase(needsUpload, userId).catch(() => {});
};

export const syncDecksWithCloud = (userId: string): Promise<void> => {
  const running = inFlight.get(userId);
  if (running) return running;
  const job = runSync(userId).finally(() => inFlight.delete(userId));
  inFlight.set(userId, job);
  return job;
};
