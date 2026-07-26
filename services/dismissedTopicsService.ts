const STORAGE_KEY = 'studearc_dismissed_topics';

/**
 * Manuell ausgeblendete Themen (z.B. Karteileichen von längst gelöschten
 * Dokumenten, deren zugrundeliegender Quiz-/Klausur-/Feynman-Verlauf zu alt
 * ist, um noch in der Lern-Verlauf-Liste aufzutauchen und dort gelöscht zu
 * werden). Rein clientseitig: blendet aus, statt Rohdaten zu löschen — sicherer
 * als ein automatisches Aufräumen, das versehentlich noch gültige Themen
 * treffen könnte.
 */
const readAll = (): string[] => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
};

export const getDismissedTopics = (): Set<string> => new Set(readAll());

export const dismissTopic = (topic: string): void => {
  const all = readAll();
  if (all.includes(topic)) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...all, topic]));
};
