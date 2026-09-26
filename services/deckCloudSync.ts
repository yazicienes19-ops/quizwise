import { loadDecksFromSupabase, uploadAllDecksToSupabase, deleteDeckFromSupabase } from './flashcardService';
import { mergeDecks } from './deckMerge';
import { readLocalDecks, writeLocalDecks, claimLocalDecks, readDeletedDeckIds } from './deckStore';

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
  const localDeleted = Object.keys(readDeletedDeckIds());
  // Hier gelöscht, in der Cloud noch nicht (offline oder Tab vor Ablauf von
  // "Rückgängig" geschlossen): Löschung jetzt nachtragen.
  const cloudDeletedIds = new Set(cloudDecks.filter(d => d.deletedAt).map(d => d.id));
  localDeleted
    .filter(id => !cloudDeletedIds.has(id) && cloudDecks.some(d => d.id === id))
    .forEach(id => { deleteDeckFromSupabase(id, userId).catch(() => {}); });
  const liveCloud = cloudDecks.filter(d => !d.deletedAt);
  if (liveCloud.length === 0 && cloudDeletedIds.size === 0) {
    if (localDecks.length > 0) await uploadAllDecksToSupabase(localDecks, userId);
    return;
  }
  // Cloud NICHT blind übernehmen — pro Karte mergen, sonst geht
  // Offline-Lernfortschritt dieses Geräts verloren.
  const merged = mergeDecks(localDecks, cloudDecks, localDeleted);
  writeLocalDecks(merged);
  // Hochladen, was die Cloud noch nicht kennt: rein lokale Decks (z.B. per
  // Link übernommen) UND Decks, deren Karten oder Löschvermerke hier neuer sind.
  const cloudById = new Map(liveCloud.map(d => [d.id, d]));
  const needsUpload = merged.filter(d => {
    const cloud = cloudById.get(d.id);
    return !cloud
      || JSON.stringify(cloud.cards) !== JSON.stringify(d.cards)
      || JSON.stringify(cloud.deletedCardIds ?? {}) !== JSON.stringify(d.deletedCardIds ?? {});
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
