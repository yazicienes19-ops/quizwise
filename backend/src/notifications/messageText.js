/**
 * Zentrale deutsche Textbausteine für alle Notification-Typen.
 * Regel (wie im restlichen Projekt per i18n-Test erzwungen): kein
 * Gedankenstrich, klare vollständige Sätze statt Wecker-Floskeln.
 */

function formatDuration(totalMinutes) {
  if (totalMinutes < 60) return `${totalMinutes} Min`;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}min`;
}

function pluralCards(n) {
  return `${n} Karteikarte${n === 1 ? '' : 'n'}`;
}

function pluralQuestions(n) {
  return `${n} Frage${n === 1 ? '' : 'n'}`;
}

function pluralBlocks(n) {
  return n === 1 ? '1 Lernblock' : `${n} Lernblöcke`;
}

module.exports = { formatDuration, pluralCards, pluralQuestions, pluralBlocks };
