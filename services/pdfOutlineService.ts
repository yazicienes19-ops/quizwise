// getEmbeddedOutlineChapters() fragt zuerst die im PDF eingebettete
// Gliederung (pdf.doc.getOutline()) ab — echte, vom Autor vergebene Titel
// samt Sprungzielen, ohne jede Text-Rekonstruktion. Ist sie nicht vorhanden
// oder unbrauchbar (bei aus PowerPoint exportierten Vorlesungsfolien enthält
// sie oft nur "Folie 1", "Folie 2", ... statt echter Themen — live an einem
// echten 296-seitigen Foliensatz geprüft: 296 Einträge, aber ausschließlich
// Foliennummern), fällt die Erkennung auf die folgenden Heuristiken zurück.
//
// buildPdfOutline()/detectHeadingCandidates(): echte Kapitelüberschriften
// stehen in deutlich größerer Schrift als der Fließtext, UND die Folie
// enthält insgesamt wenig Text (Titel-/Trennfolien vs. inhaltsreiche
// Folien). Viele folgen zusätzlich einer nummerierten Gliederung ("2.1
// Klassische Konditionierung"), die sich direkt in eine Baumtiefe übersetzen
// lässt.
import type { PdfHandle, PositionedTextItem } from './pdfPageService';
import { getPageTextItems, joinTextItems, groupIntoLines } from './pdfPageService';
import type { Chapter } from './chapterService';
import { isHeading } from './chapterService';

export interface PdfTocEntry {
  title: string;
  page: number;
  children: PdfTocEntry[];
}

export interface HeadingCandidate {
  page: number;
  title: string;
}

/** Nur Textfragmente mit sichtbarem Inhalt zählen für Höhen-/Längenschätzung. */
const median = (nums: number[]): number => {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/**
 * Erkennt eine numerische Gliederung ("2", "2.1", "2.1.1") am Anfang einer
 * erkannten Überschrift und liefert den Zahlenpfad + bereinigten Titel. Kein
 * Treffer = keine erkennbare Nummerierung (wird als flacher Top-Level-Eintrag
 * behandelt, kein Fehler).
 */
export function parseHeadingPrefix(text: string): { path: number[]; title: string } | null {
  const m = text.trim().match(/^(\d+(?:\.\d+)*)\.?\s+(.+)$/);
  if (!m) return null;
  const title = m[2].trim();
  if (!title) return null;
  return { path: m[1].split('.').map(Number), title };
}

/** true, wenn `prefix` ein echtes Präfix von `full` ist (z.B. [2] von [2,1],
 *  aber NICHT [1] von [2,1] — unterschiedliche Kapitelnummer trotz "kleinerer" Tiefe). */
function isPrefixOf(prefix: number[], full: number[]): boolean {
  if (prefix.length >= full.length) return false;
  return prefix.every((n, i) => n === full[i]);
}

/**
 * Baut aus einer flachen, seitensortierten Kandidatenliste einen verschachtelten
 * Baum: "2" wird Elternknoten von "2.1", "2.1" Elternknoten von "2.1.1". Auch
 * wenn "2" selbst nie als eigene Überschrift auftaucht, landet "2.1" korrekt
 * als neuer Top-Level-Zweig statt fälschlich unter Kapitel "1" (reine
 * Tiefen-Vergleiche ohne Zahlenpfad würden das falsch verschachteln). Einträge
 * ohne erkennbare Nummerierung werden als flache Top-Level-Einträge angehängt.
 */
export function buildTocTree(candidates: HeadingCandidate[]): PdfTocEntry[] {
  const root: PdfTocEntry[] = [];
  const stack: { path: number[]; node: PdfTocEntry }[] = [];

  for (const c of candidates) {
    const parsed = parseHeadingPrefix(c.title);
    if (!parsed) {
      root.push({ title: c.title, page: c.page, children: [] });
      stack.length = 0;
      continue;
    }
    const node: PdfTocEntry = { title: parsed.title, page: c.page, children: [] };
    while (stack.length && !isPrefixOf(stack[stack.length - 1].path, parsed.path)) stack.pop();
    (stack.length === 0 ? root : stack[stack.length - 1].node.children).push(node);
    stack.push({ path: parsed.path, node });
  }
  return root;
}

/**
 * Erkennt pro Seite die vermutliche "Titel-Zeile": deutlich größere Schrift als
 * der Median der Seite UND insgesamt wenig Text auf der Seite. Konsekutive
 * Seiten mit demselben erkannten Titel (ein Thema läuft über mehrere Folien)
 * werden zu einem einzigen Eintrag zusammengefasst.
 */
export function detectHeadingCandidates(
  pages: { page: number; items: PositionedTextItem[] }[]
): HeadingCandidate[] {
  const raw: HeadingCandidate[] = [];
  for (const { page, items } of pages) {
    const withText = items.filter(it => it.str.trim());
    if (withText.length === 0) continue;
    const heights = withText.map(it => it.h);
    const maxH = Math.max(...heights);
    const medianH = median(heights);
    const totalChars = withText.reduce((s, it) => s + it.str.length, 0);
    if (totalChars < 500 && medianH > 0 && maxH > medianH * 1.6) {
      const title = withText.filter(it => it.h >= maxH - 0.5).map(it => it.str.trim()).join(' ').trim();
      if (title) raw.push({ page, title });
    }
  }
  const deduped: HeadingCandidate[] = [];
  for (const c of raw) {
    const prev = deduped[deduped.length - 1];
    if (prev && prev.title === c.title) continue;
    deduped.push(c);
  }
  return deduped;
}

/** Ruft Textfragmente für mehrere Seiten mit begrenzter Nebenläufigkeit ab —
 *  alle 296 Seiten sequentiell abzufragen wäre unnötig langsam, alle gleichzeitig
 *  könnte den pdf.js-Worker überlasten. */
async function mapPagesLimited<T>(
  numPages: number,
  concurrency: number,
  fn: (page: number) => Promise<T>
): Promise<T[]> {
  const results: T[] = new Array(numPages);
  let next = 1;
  const worker = async () => {
    while (next <= numPages) {
      const p = next++;
      results[p - 1] = await fn(p);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, numPages) }, worker));
  return results;
}

/**
 * Baut das Inhaltsverzeichnis direkt aus dem gerenderten PDF (siehe Kommentar
 * oben — die eingebettete Gliederung ist bei Foliensätzen oft unbrauchbar).
 * Läuft einmalig im Hintergrund, sobald das PDF geladen ist.
 */
export async function buildPdfOutline(pdf: PdfHandle, concurrency = 10): Promise<PdfTocEntry[]> {
  const perPage = await mapPagesLimited(pdf.numPages, concurrency, async page => {
    const { items } = await getPageTextItems(pdf, page);
    return { page, items };
  });
  return buildTocTree(detectHeadingCandidates(perPage));
}

interface PageWithText {
  page: number;
  items: PositionedTextItem[];
  text: string;
}

async function collectPageTexts(pdf: PdfHandle, concurrency: number): Promise<PageWithText[]> {
  return mapPagesLimited(pdf.numPages, concurrency, async page => {
    const { items } = await getPageTextItems(pdf, page);
    return { page, items, text: joinTextItems(items) };
  });
}

/**
 * Schneidet aus bereits abgerufenen Seiten Kapitel-Inhalte zu, ausgehend von
 * einer beliebigen, seitensortierten {page, title}-Kandidatenliste — jedes
 * Kapitel bekommt den Text aller Seiten bis zur nächsten Kandidaten-Seite,
 * Seiten VOR dem ersten Kandidaten werden dem ersten Kapitel zugeschlagen
 * statt verworfen (z.B. Deckblatt/Intro ohne eigene Überschrift). Von
 * mehreren Erkennungswegen gemeinsam genutzt (Layout-Heuristik UND
 * eingebettete PDF-Gliederung, siehe getEmbeddedOutlineChapters), damit der
 * Content-Zuschnitt nicht doppelt implementiert werden muss.
 */
export function buildChaptersFromCandidates(candidates: HeadingCandidate[], perPage: PageWithText[]): Chapter[] {
  const chapters: Chapter[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const startPage = i === 0 ? (perPage[0]?.page ?? candidates[i].page) : candidates[i].page;
    const endPage = i + 1 < candidates.length ? candidates[i + 1].page - 1 : (perPage[perPage.length - 1]?.page ?? candidates[i].page);
    const content = perPage
      .filter(p => p.page >= startPage && p.page <= endPage)
      .map(p => p.text)
      .join('\n\n')
      .trim();
    if (!content) continue;
    chapters.push({ index: chapters.length, title: candidates[i].title, content, charCount: content.length });
  }
  return chapters;
}

/**
 * Baut echte Kapitel (Titel + voller Seitentext) aus derselben Layout-
 * Erkennung wie buildPdfOutline() — anders als dort, das nur Sprungziele für
 * die Navigation liefert, enthält jedes Kapitel hier den kompletten Text
 * aller Seiten bis zur nächsten erkannten Überschrift.
 * Reine Funktion auf bereits abgerufenen Seiten — leicht testbar ohne pdf.js.
 */
export function buildChaptersFromPages(perPage: PageWithText[]): Chapter[] {
  const candidates = detectHeadingCandidates(perPage.map(({ page, items }) => ({ page, items })));
  return buildChaptersFromCandidates(candidates, perPage);
}

/** Häufigster (gerundeter) Wert — robuster als der Median für die
 *  Fließtext-Grundgröße, da diese über die meisten Zeilen dominiert, auch
 *  wenn einzelne sehr große Überschriften den Mittelwert verzerren würden. */
function modeHeight(heights: number[]): number {
  const counts = new Map<number, number>();
  for (const h of heights) {
    const rounded = Math.round(h * 2) / 2; // auf halbe Punkte runden gegen Rundungsrauschen
    counts.set(rounded, (counts.get(rounded) ?? 0) + 1);
  }
  let best = 0;
  let bestCount = -1;
  for (const [h, c] of counts) {
    if (c > bestCount) { best = h; bestCount = c; }
  }
  return best;
}

/**
 * Zeilenbasierte Kapitel-Erkennung für textdichte PDFs (Skripte/Zusammen-
 * fassungen statt Foliensätze) — buildChaptersFromPages() scheitert hier,
 * weil echte Überschriften mitten auf vollen Textseiten stehen statt auf
 * eigenen sparsamen Titel-Seiten (die Seiten-Heuristik braucht `totalChars
 * < 500`, siehe detectHeadingCandidates).
 *
 * Kombiniert zwei Signale, von denen keins allein reicht: chapterService.
 * isHeading() (Regex-Muster wie "Kapitel 1", "2.1 Titel") UND eine gegenüber
 * dem Fließtext deutlich erhöhte Schriftgröße. Nummerierte Aufzählungspunkte
 * im Fließtext ("1. Universalismus:") matchen dieselbe Regex, stehen aber in
 * Fließtextgröße — ohne das Schriftgrößen-Signal wertet die reine Regex-
 * Suche jeden solchen Punkt fälschlich als neues Kapitel (live an einem
 * echten 86-seitigen Fresenius-Skript geprüft: 108 Fehltreffer aus
 * Aufzählungen statt der tatsächlichen ~15 echten Überschriften).
 */
/**
 * "N. Titel" OHNE Punkt zwischen den Ziffern (also NICHT "N.M") ist in
 * dichtem Fließtext fast immer ein Aufzählungspunkt, keine echte
 * Überschrift — anders als mehrstufige Nummerierung ("2.1", "3.3.1") oder
 * "Kapitel N:", die in der Praxis nie für Aufzählungen verwendet werden.
 * Gilt für BEIDE Erkennungsstufen unten (strukturiert UND unstrukturiert):
 * ohne den Ausschluss auch in der unstrukturierten Stufe blieben bei
 * "Allgemeine I.pdf" Aufzählungspunkte wie "1. Monokulare Tiefenkriterien"
 * übrig, weil sie im Dokument genauso groß formatiert sind wie echte
 * Überschriften — reine Schriftgröße reicht dort nicht als Unterscheidung,
 * die fehlende mehrstufige Nummerierung schon (Kompromiss: einzelne echte,
 * aber bare-nummerierte Überschriften in anders strukturierten Abschnitten
 * werden dadurch ihrem vorherigen Kapitel zugeschlagen statt eigenständig
 * erkannt — bewusst die sicherere Seite, siehe Live-Testergebnis in den Tests).
 */
function isBareNumberedListItem(text: string): boolean {
  const t = text.trim();
  return /^\d+\.?\s/.test(t) && !/^\d+\.\d/.test(t);
}

function isReliableDenseHeading(text: string): boolean {
  const t = text.trim();
  return isHeading(t) && !isBareNumberedListItem(t);
}

/** Für den Fallback ohne Regex-Treffer (siehe unten): eine plausible
 *  Titelzeile ist kurz, keine abgeschlossene Fließtext-Aufzählung und kein
 *  bare-nummerierter Aufzählungspunkt (siehe isBareNumberedListItem). */
function looksLikeStandaloneTitle(text: string): boolean {
  const t = text.trim();
  return t.length >= 3 && t.length <= 90 && !isBareNumberedListItem(t);
}

export function detectDenseChapters(pages: { page: number; items: PositionedTextItem[] }[]): Chapter[] {
  const perPageLines = pages.map(({ items }) => groupIntoLines(items));
  const allLines = perPageLines.flat();
  if (allLines.length === 0) return [];
  const bodyHeight = modeHeight(allLines.map(l => l.height));

  const chapters: Chapter[] = [];
  const leadingLines: string[] = [];
  let currentTitle: string | null = null;
  let currentLines: string[] = [];

  const flush = () => {
    if (currentTitle === null) return;
    const content = currentLines.join('\n').trim();
    if (!content) return;
    chapters.push({ index: chapters.length, title: currentTitle, content, charCount: content.length });
  };

  for (const lines of perPageLines) {
    for (const line of lines) {
      // Zwei Stufen: strukturiert erkannte Überschriften (Regex + moderat
      // erhöhte Schrift) ODER — falls keine Nummerierung/Schlüsselwort
      // vorliegt — eine deutlich größere, kurze Titelzeile. Zweite Stufe
      // fängt fett gedruckte Überschriften OHNE jede Nummerierung ab (live
      // gefunden: ein eingeschobener Foliensatz-Abschnitt in "Allgemeine
      // I.pdf" ohne jede Kapitel-/Nummer-Konvention, z.B. "Künstliche
      // Intelligenz (KI)") — der höhere Schwellwert (1.25 statt 1.05) hält
      // normale fett hervorgehobene Fließtext-Begriffe draußen.
      const structuredHeading = line.height > bodyHeight * 1.05 && isReliableDenseHeading(line.text);
      const unstructuredHeading = !structuredHeading && line.height >= bodyHeight * 1.25 && looksLikeStandaloneTitle(line.text);
      const looksLikeHeading = structuredHeading || unstructuredHeading;
      if (looksLikeHeading) {
        flush();
        currentTitle = line.text;
        // Text vor der ersten erkannten Überschrift dem ersten Kapitel
        // voranstellen statt zu verwerfen (nur beim allerersten Treffer relevant).
        currentLines = chapters.length === 0 ? [...leadingLines] : [];
      } else if (currentTitle !== null) {
        currentLines.push(line.text);
      } else {
        leadingLines.push(line.text);
      }
    }
  }
  flush();
  return chapters;
}

/**
 * Macht Kapiteltitel innerhalb eines Dokuments eindeutig. Wiederkehrende
 * Foliensatz-Muster (z.B. eine "Zusammenfassung"-Folie nach jedem Abschnitt)
 * erzeugen sonst mehrere Kapitel mit identischem Titel — services/
 * recallCoverageService.ts prüft Abdeckung aber nur über den normierten
 * Titel (nicht den Index), eine einzige abgefragte Wiederholung würde also
 * fälschlich ALLE gleichnamigen Abschnitte als "abgefragt" markieren (live
 * an "Allgemeine I.pdf" gefunden: derselbe Recap-Titel 6× im Dokument).
 */
export function disambiguateTitles(chapters: Chapter[]): Chapter[] {
  const seen = new Map<string, number>();
  return chapters.map(c => {
    const count = (seen.get(c.title) ?? 0) + 1;
    seen.set(c.title, count);
    return count === 1 ? c : { ...c, title: `${c.title} (${count})` };
  });
}

type OutlineNode = Awaited<ReturnType<PdfHandle['doc']['getOutline']>>[number];

/** Generische Platzhalter-Titel wie "Folie 12" / "Slide 12" — bei aus
 *  PowerPoint exportierten Foliensätzen ist die eingebettete Gliederung
 *  damit vollständig gefüllt, aber inhaltlich wertlos (live an "Allgemeine
 *  II 2026.pdf" bestätigt: 296 Einträge, ausnahmslos "Folie N"). */
const PLACEHOLDER_OUTLINE_TITLE = /^(?:Folie|Slide|Seite|Page)\s+\d+$/i;

/** Verwirft eine Gliederung, wenn die Mehrheit ihrer Einträge wie generische
 *  Platzhalter aussieht statt wie echte Themen. */
function looksLikeUsableOutline(entries: HeadingCandidate[]): boolean {
  if (entries.length === 0) return false;
  const placeholderCount = entries.filter(e => PLACEHOLDER_OUTLINE_TITLE.test(e.title)).length;
  return placeholderCount / entries.length < 0.5;
}

/** Löst ein Gliederungs-Sprungziel (explizites Ziel-Array ODER benanntes
 *  Ziel als String) in eine 1-basierte Seitenzahl auf. null bei allem, was
 *  sich nicht auflösen lässt (z.B. externe Links ohne Seiten-Ziel). */
async function resolveOutlineDestPage(pdf: PdfHandle, dest: OutlineNode['dest']): Promise<number | null> {
  try {
    const explicitDest = typeof dest === 'string' ? await pdf.doc.getDestination(dest) : dest;
    if (!Array.isArray(explicitDest) || !explicitDest[0]) return null;
    const pageIndex = await pdf.doc.getPageIndex(explicitDest[0]);
    return pageIndex + 1;
  } catch {
    return null;
  }
}

async function flattenOutline(pdf: PdfHandle, nodes: OutlineNode[], out: HeadingCandidate[]): Promise<void> {
  for (const node of nodes) {
    const title = node.title?.trim();
    if (title) {
      const page = await resolveOutlineDestPage(pdf, node.dest);
      if (page !== null && page >= 1 && page <= pdf.numPages) out.push({ page, title });
    }
    if (node.items?.length) await flattenOutline(pdf, node.items, out);
  }
}

/**
 * Nutzt die im PDF eingebettete Gliederung (Bookmarks/Outline) als
 * vorrangige Quelle für die Kapitel-Erkennung — keine Heuristik, sondern
 * vom Autor vergebene Titel + Sprungziele, also ohne die Fehlerquellen der
 * Text-Rekonstruktion (falsch klassifizierte Aufzählungspunkte, über zwei
 * Zeilen umgebrochene Titel etc.). Live an "Allgemeine I.pdf" bestätigt: 47
 * Einträge inkl. echter Hierarchie (z.B. 5 Untereinträge unter "Kapitel 1"),
 * u.a. "Zusammenfassung: Die wichtigsten Begriffe auf einen Blick" als EIN
 * sauberer Eintrag — genau der Titel, den detectDenseChapters() durch den
 * Zeilenumbruch nur als abgerissenes "Blick" erkennt.
 * Liefert null, wenn keine Gliederung vorhanden oder sie wie generische
 * Foliennummern-Platzhalter aussieht — Aufrufer fällt dann auf die
 * bestehenden Heuristiken zurück.
 */
export async function getEmbeddedOutlineChapters(pdf: PdfHandle, perPage: PageWithText[]): Promise<Chapter[] | null> {
  let outline: OutlineNode[] | null;
  try {
    outline = await pdf.doc.getOutline();
  } catch {
    return null;
  }
  if (!outline || outline.length === 0) return null;

  const flat: HeadingCandidate[] = [];
  await flattenOutline(pdf, outline, flat);
  if (!looksLikeUsableOutline(flat)) return null;

  // Baum-Reihenfolge muss nicht streng seitenaufsteigend sein (z.B. wenn
  // ein Eintrag auf dieselbe Seite wie sein erstes Kind zeigt) —
  // buildChaptersFromCandidates braucht das aber für den Seiten-Zuschnitt.
  flat.sort((a, b) => a.page - b.page);
  return buildChaptersFromCandidates(flat, perPage);
}

/** Wie buildChaptersFromPages(), degradiert aber bei 0 erkannten Kapiteln auf
 *  ein synthetisches Ganzdokument-Kapitel — analog zu
 *  chapterService.getChaptersOrWhole(), Aufrufer müssen nie den Leerfall behandeln. */
export async function getPdfChaptersOrWhole(pdf: PdfHandle, concurrency = 10): Promise<Chapter[]> {
  const perPage = await collectPageTexts(pdf, concurrency);

  const outlineChapters = await getEmbeddedOutlineChapters(pdf, perPage);
  if (outlineChapters && outlineChapters.length > 0) return disambiguateTitles(outlineChapters);

  let chapters = buildChaptersFromPages(perPage);
  // Slide-Heuristik kollabiert bei textdichten PDFs effektiv auf 1 Kapitel
  // (die ganze Titelseite-Bedingung greift dann nur einmal) — dann die
  // zeilenbasierte Variante versuchen, die für genau diesen Fall gebaut ist.
  if (chapters.length <= 1 && perPage.length > 3) {
    const dense = detectDenseChapters(perPage.map(({ page, items }) => ({ page, items })));
    if (dense.length > chapters.length) chapters = dense;
  }
  if (chapters.length > 0) return disambiguateTitles(chapters);
  const text = perPage.map(p => p.text).join('\n\n').trim();
  if (!text) return [];
  return [{ index: 0, title: 'Gesamtes Dokument', content: text, charCount: text.length }];
}
