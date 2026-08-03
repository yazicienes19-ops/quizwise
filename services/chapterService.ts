export interface Chapter {
  index: number;
  title: string;
  content: string;
  charCount: number;
}

const HEADING_PATTERNS = [
  // Named: "Kapitel 1", "Chapter 2:", "Lektion 3", "Teil 1", "Abschnitt 2", "Thema 3"
  /^(?:Kapitel|Chapter|Lektion|Teil|Abschnitt|Section|Unit|Thema|Modul|Einheit)\s+\d+[\s:.)-]/i,
  // Numbered headings: "1. Heading", "1.1 Heading", "2.3.1 Topic"
  /^\d+(?:\.\d+)*\.?\s{1,3}[A-ZÄÖÜÀ-ɏ]/,
  // Markdown: # Heading, ## Heading, ### Heading
  /^#{1,3}\s+\S/,
  // Roman numerals: "I.", "II.", "III.", "IV."
  /^(?:I{1,3}V?|IV|VI{0,3}|IX|X{1,2})\.\s+[A-ZÄÖÜ]/,
];

/** Exportiert für pdfOutlineService.ts — dort mit dem Schriftgrößen-Signal
 *  kombiniert (siehe detectDenseChapters dort), damit nummerierte
 *  Aufzählungspunkte im Fließtext (gleiche Regex, aber Fließtextgröße) nicht
 *  fälschlich als Kapitel gewertet werden. */
export function isHeading(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < 3 || trimmed.length > 120) return false;
  return HEADING_PATTERNS.some(p => p.test(trimmed));
}

export function detectChapters(text: string): Chapter[] {
  if (!text || text.length < 200) return [];

  const lines = text.split('\n');
  const chapters: Chapter[] = [];
  let currentTitle: string | null = null;
  let currentLines: string[] = [];

  const flush = () => {
    if (currentTitle === null) return;
    const content = currentLines.join('\n').trim();
    if (content.length > 80) {
      chapters.push({
        index: chapters.length,
        title: currentTitle,
        content,
        charCount: content.length,
      });
    }
  };

  for (const line of lines) {
    if (isHeading(line)) {
      flush();
      currentTitle = line.trim();
      currentLines = [];
    } else if (currentTitle !== null) {
      currentLines.push(line);
    }
  }
  flush();

  return chapters;
}

export function extractChapterText(chapters: Chapter[]): string {
  return chapters.map(c => `${c.title}\n${c.content}`).join('\n\n---\n\n');
}

export function getTextForChapterDetection(doc: {
  content: string;
  digestText?: string;
  type: string;
}): string {
  if (doc.type === 'text' || doc.type === 'docx') return doc.content;
  if (doc.digestText) return doc.digestText;
  return '';
}

/** Wie detectChapters(), degradiert aber bei 0 erkannten Kapiteln auf ein
 *  synthetisches Ganzdokument-Kapitel — Aufrufer müssen nie den Leerfall behandeln. */
export function getChaptersOrWhole(text: string): Chapter[] {
  const chapters = detectChapters(text);
  if (chapters.length > 0) return chapters;
  if (!text || !text.trim()) return [];
  return [{ index: 0, title: 'Gesamtes Dokument', content: text.trim(), charCount: text.trim().length }];
}

/**
 * Wie getChaptersOrWhole(), nutzt bei PDFs aber die echte Seiten-Layout-
 * Erkennung (Schriftgröße/Textdichte, services/pdfOutlineService.ts) statt
 * blind den KI-Digest nach Regex-Mustern zu durchsuchen — der Digest kennt
 * keine echten Kapitelgrenzen, nur was zufällig wie "Kapitel 1" aussieht.
 * Fällt bei Fehlern (Download, kaputtes PDF) oder wenn die Layout-Erkennung
 * 0 Kapitel findet auf den bisherigen Digest-Pfad zurück, NIE auf 0 Kapitel.
 */
export async function detectChaptersForDoc(doc: {
  type: string;
  content: string;
  storagePath?: string;
  digestText?: string;
}): Promise<Chapter[]> {
  if (doc.type === 'pdf' && (doc.storagePath || doc.content)) {
    try {
      const [{ loadPdf }, { getPdfChaptersOrWhole }] = await Promise.all([
        import('./pdfPageService'),
        import('./pdfOutlineService'),
      ]);
      const base64 = doc.storagePath
        ? await (await import('./documentService')).downloadPdfAsBase64(doc.storagePath)
        : doc.content;
      const pdf = await loadPdf(base64);
      const chapters = await getPdfChaptersOrWhole(pdf);
      if (chapters.length > 0) return chapters;
    } catch {
      // Fällt unten auf den Digest-Text zurück (z.B. Download-Fehler, kaputtes PDF).
    }
  }
  return getChaptersOrWhole(getTextForChapterDetection(doc));
}
