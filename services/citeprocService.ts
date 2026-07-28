import type { MultiStyleCitation } from '../types';
import { getLocale } from '../i18n';

export interface CitationSourceInput {
  authors: string;
  title: string;
  year: string;
  journal?: string;
  url?: string;
  doi?: string;
  type: 'article' | 'book' | 'other';
  isWeb?: boolean;
}

interface CslPerson {
  family: string;
  given: string;
}

interface CslJsonItem {
  id: string;
  type: string;
  title: string;
  author?: CslPerson[];
  issued?: { 'date-parts': number[][] };
  'container-title'?: string;
  URL?: string;
  DOI?: string;
}

const STYLE_FILES = {
  apa: 'apa.csl',
  mla: 'modern-language-association.csl',
  harvard: 'harvard-cite-them-right.csl',
  chicago: 'chicago-notes-bibliography.csl',
} as const;

type StyleKey = keyof typeof STYLE_FILES;

/** Kein türkisches CSL-Locale verfügbar — deutscher Fallback (unverändertes bisheriges Verhalten für TR). */
const CITATION_LOCALES: Record<string, string> = { en: 'en-US' };
const citationLocale = (): string => CITATION_LOCALES[getLocale()] ?? 'de-DE';

function parseFirstLastName(name: string): CslPerson {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { family: parts[0] ?? '', given: '' };
  return { family: parts[parts.length - 1], given: parts.slice(0, -1).join(' ') };
}

/**
 * Zwei unterschiedliche Autor:innen-Konventionen kommen in diesem Feld vor:
 * die Scholar-Suche (OpenAlex, backend/src/routes/search.js) liefert
 * "Vorname Nachname, Vorname2 Nachname2", das manuelle Quellen-Formular in
 * TermPaperSystem.tsx wirbt dagegen mit dem Platzhalter
 * "Müller, A. & Schmidt, B." (Nachname zuerst, "&" zwischen Personen).
 * Trennzeichen zwischen Personen sind daher NUR "&"/"and"/"und"/";" (nie ein
 * bloßes Komma, das ist innerhalb eines "Nachname, Vorname"-Namens genauso
 * üblich). Ob ein Komma-Block EIN Nachname-zuerst-Name oder MEHRERE
 * Vorname-zuerst-Namen ist, wird daran unterschieden, ob der erste Teil ein
 * Leerzeichen enthält ("Albert Einstein" = schon ein voller Name, also
 * Personen-Trenner) oder nicht ("Einstein" = bloßer Nachname, also
 * Namens-interner Trenner). citeproc bekommt trotzdem IMMER die volle Liste
 * statt einer vorab gekürzten "et al."-Version, da jeder CSL-Stil seine
 * eigene et-al-Schwelle selbst anwenden muss.
 */
export function parseAuthorNames(authorsStr: string): CslPerson[] {
  const trimmed = authorsStr.trim();
  if (!trimmed) return [];
  const chunks = trimmed
    .split(/\s+(?:und|and|&)\s+|;\s*/i)
    .map(c => c.trim())
    .filter(Boolean);

  return chunks.flatMap((chunk): CslPerson[] => {
    if (!chunk.includes(',')) return [parseFirstLastName(chunk)];
    const commaParts = chunk.split(',').map(p => p.trim()).filter(Boolean);
    if (commaParts[0].includes(' ')) {
      return commaParts.map(parseFirstLastName);
    }
    return [{ family: commaParts[0], given: commaParts.slice(1).join(', ') }];
  });
}

export function mapSourceType(type: 'article' | 'book' | 'other', isWeb?: boolean): string {
  if (type === 'article') return 'article-journal';
  if (type === 'book') return 'book';
  return isWeb ? 'webpage' : 'document';
}

export function buildCslItem(source: CitationSourceInput): CslJsonItem {
  const item: CslJsonItem = {
    id: 'src',
    type: mapSourceType(source.type, source.isWeb),
    title: source.title,
  };
  const author = parseAuthorNames(source.authors);
  if (author.length > 0) item.author = author;
  const yearNum = parseInt(source.year, 10);
  if (Number.isFinite(yearNum)) item.issued = { 'date-parts': [[yearNum]] };
  if (source.journal) item['container-title'] = source.journal;
  if (source.url) item.URL = source.url;
  if (source.doi) item.DOI = source.doi;
  return item;
}

let wasmModulePromise: Promise<typeof import('@citeproc-rs/wasm')> | null = null;
function loadWasm() {
  if (!wasmModulePromise) wasmModulePromise = import('@citeproc-rs/wasm');
  return wasmModulePromise;
}

const styleCache = new Map<StyleKey, string>();
async function loadStyle(key: StyleKey): Promise<string> {
  const cached = styleCache.get(key);
  if (cached) return cached;
  const res = await fetch(`/csl/styles/${STYLE_FILES[key]}`);
  if (!res.ok) throw new Error(`CSL-Stil konnte nicht geladen werden: ${key}`);
  const text = await res.text();
  styleCache.set(key, text);
  return text;
}

const localeCache = new Map<string, string | null>();
async function fetchLocaleFile(lang: string): Promise<string | null> {
  if (localeCache.has(lang)) return localeCache.get(lang)!;
  try {
    const res = await fetch(`/csl/locales/locales-${lang}.xml`);
    const text = res.ok ? await res.text() : null;
    localeCache.set(lang, text);
    return text;
  } catch {
    localeCache.set(lang, null);
    return null;
  }
}

async function createDriver(styleKey: StyleKey) {
  const [{ Driver }, style] = await Promise.all([loadWasm(), loadStyle(styleKey)]);
  const driver = new Driver({
    style,
    format: 'plain',
    localeOverride: citationLocale(),
    fetcher: { fetchLocale: fetchLocaleFile as (lang: string) => Promise<string> },
  });
  await driver.fetchLocales();
  return driver;
}

/**
 * @citeproc-rs/wasm@0.2.0 gibt `allClusters` trotz des `.d.ts`-Typs `Map<string, string>`
 * zur Laufzeit tatsächlich als einfaches Objekt zurück (per Runtime-Check verifiziert) —
 * daher hier über einen Cast per Bracket-Zugriff statt `.get()`.
 */
function getCluster(render: { allClusters: Map<string, string> }, id: string): string {
  return (render.allClusters as unknown as Record<string, string>)[id] ?? '';
}

async function renderInTextStyle(styleKey: 'apa' | 'mla' | 'harvard', item: CslJsonItem) {
  const driver = await createDriver(styleKey);
  try {
    driver.insertReference(item);
    driver.initClusters([
      { id: 'default', cites: [{ id: item.id }] },
      { id: 'composite', cites: [{ id: item.id }], mode: 'Composite' },
      { id: 'direct', cites: [{ id: item.id, locator: 'XX', label: 'page' }] },
    ]);
    driver.setClusterOrder([{ id: 'default' }, { id: 'composite' }, { id: 'direct' }]);
    const render = driver.fullRender();
    return {
      entry: render.bibEntries[0]?.value ?? '',
      default: getCluster(render, 'default'),
      composite: getCluster(render, 'composite'),
      direct: getCluster(render, 'direct'),
    };
  } finally {
    driver.free();
  }
}

async function renderChicago(item: CslJsonItem) {
  const driver = await createDriver('chicago');
  try {
    driver.insertReference(item);
    driver.initClusters([
      { id: 'note1', cites: [{ id: item.id }] },
      { id: 'note2', cites: [{ id: item.id }] },
    ]);
    driver.setClusterOrder([{ id: 'note1', note: 1 }, { id: 'note2', note: 2 }]);
    const render = driver.fullRender();
    return {
      bibliography: render.bibEntries[0]?.value ?? '',
      fullNote: getCluster(render, 'note1'),
      shortNote: getCluster(render, 'note2'),
    };
  } finally {
    driver.free();
  }
}

export async function formatAllStyles(source: CitationSourceInput): Promise<MultiStyleCitation> {
  const item = buildCslItem(source);
  const [apa, mla, harvard, chicago] = await Promise.all([
    renderInTextStyle('apa', item),
    renderInTextStyle('mla', item),
    renderInTextStyle('harvard', item),
    renderChicago(item),
  ]);
  return {
    apa: { entry: apa.entry, inTextKlammer: apa.default, inTextNarrativ: apa.composite },
    mla: { entry: mla.entry, inText: mla.default },
    harvard: { entry: harvard.entry, inText: harvard.default, direct: harvard.direct },
    chicago: { fullNote: chicago.fullNote, shortNote: chicago.shortNote, bibliography: chicago.bibliography },
  };
}
