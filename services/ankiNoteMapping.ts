import { hasCloze } from './cloze';
import { parseTags } from './cardTags';

/**
 * Anki-Notizen in StudeArc-Karten umwandeln (reine Funktionen, ohne Datei-
 * und Datenbankzugriff; das Lesen des Pakets steht in ankiPackage.ts).
 *
 * Anki speichert Felder als HTML. Wir brauchen Klartext plus höchstens ein
 * Bild je Kartenseite (so viele kann eine StudeArc-Karte tragen).
 */

export interface MappedAnkiCard {
  front: string;
  back: string;
  tags: string[];
  /** Dateinamen im Anki-Medienordner; werden beim Import hochgeladen. */
  frontImage?: string;
  backImage?: string;
}

const ENTITIES: Record<string, string> = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", shy: '',
  auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß',
  ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»', bdquo: '„', ldquo: '“', rdquo: '”',
};

const decodeEntities = (s: string): string =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e] ?? m;
  });

/** Bild-Dateinamen aus <img src="…"> in Reihenfolge (Anki: relative Namen im Medienordner). */
export const extractImageNames = (html: string): string[] => {
  const out: string[] = [];
  const re = /<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const raw = decodeEntities(m[1] ?? m[2] ?? m[3] ?? '').trim();
    if (!raw || /^(https?:|data:)/i.test(raw)) continue;
    try { out.push(decodeURIComponent(raw)); } catch { out.push(raw); }
  }
  return out;
};

/** Anki-Feld (HTML) zu lesbarem Klartext: Umbrüche bleiben, Tags, Töne und Bilder fallen weg. */
export const htmlFieldToText = (html: string): string =>
  decodeEntities(
    html
      .replace(/\[sound:[^\]]*\]/gi, '')
      .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/?(div|p|h[1-6]|tr)\b[^>]*>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<li\b[^>]*>/gi, '• ')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/** Anki-Schlagwörter: durch Leerzeichen getrennt, Hierarchien mit "::". Wir behalten die letzte Ebene. */
export const mapAnkiTags = (raw: string): string[] =>
  parseTags(raw.trim().split(/\s+/).filter(Boolean).map(t => t.split('::').pop() ?? t).map(t => t.replace(/_/g, ' ')).join(','));

/**
 * Eine Notiz → eine Karte. Standard-Notiztypen: erstes Feld vorne, zweites
 * hinten, weitere Felder werden hinten angehängt. Lückentext-Notizen erkennen
 * wir am Inhalt ({{c1::…}}): der Text bleibt vorne, das Feld "Extra" wird die
 * Rückseite. So braucht es keine Auswertung der Notiztypen-Vorlagen.
 */
export const noteToCard = (fields: string[], rawTags = ''): MappedAnkiCard | null => {
  if (!fields.length) return null;
  const [first, ...rest] = fields;
  const frontImage = extractImageNames(first)[0];
  const backImage = rest.map(f => extractImageNames(f)[0]).find(Boolean);
  const front = htmlFieldToText(first);
  const back = rest.map(htmlFieldToText).filter(Boolean).join('\n\n');
  const tags = mapAnkiTags(rawTags);

  if (hasCloze(front)) {
    return { front, back, tags, ...(frontImage ? { frontImage } : {}), ...(backImage ? { backImage } : {}) };
  }
  if (!front && !frontImage) return null;
  if (!back && !backImage) return null;
  return { front, back, tags, ...(frontImage ? { frontImage } : {}), ...(backImage ? { backImage } : {}) };
};
