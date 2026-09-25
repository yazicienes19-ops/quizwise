/**
 * Schriftarten der Einstellungen als CSS-Stacks. Eine Quelle für die
 * Einstellungen und das Übernehmen der Cloud-Einstellung nach dem Login
 * (vorher griff die gespeicherte Schrift erst beim nächsten Laden, weil nur
 * index.html sie beim Start setzte). index.html hat eine eigene Kopie, weil
 * das Skript dort vor dem Bundle läuft.
 */
export const FONT_STACKS = {
  'inter':        "'Inter', system-ui, sans-serif",
  'garamond':     "'EB Garamond', Georgia, serif",
  'dm-sans':      "'DM Sans', system-ui, sans-serif",
  'lato':         "'Lato', system-ui, sans-serif",
  'nunito':       "'Nunito', system-ui, sans-serif",
  'merriweather': "'Merriweather', Georgia, serif",
} as const;

export type FontChoice = keyof typeof FONT_STACKS;

/** Setzt Schrift und Zeilenabstand sofort auf der Seite; unbekannte Werte werden ignoriert. */
export function applyTypography(fontChoice?: string | null, lineHeight?: string | null): void {
  const root = document.documentElement.style;
  if (fontChoice && fontChoice in FONT_STACKS) root.setProperty('--font-app', FONT_STACKS[fontChoice as FontChoice]);
  if (lineHeight) root.setProperty('--line-height-app', lineHeight);
}
