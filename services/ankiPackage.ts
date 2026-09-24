import { unzipSync } from 'fflate';
import { decompress as zstdDecompress } from 'fzstd';
import type { Database, SqlJsStatic } from 'sql.js';
import { noteToCard, type MappedAnkiCard } from './ankiNoteMapping';

/**
 * Anki-Pakete (.apkg) im Browser lesen, samt Bildern.
 * Aufbau laut Anki-Quellcode (rslib/src/import_export/package):
 *  - alt:  collection.anki2 bzw. collection.anki21 (SQLite), Datei "media"
 *          als JSON {"0": "bild.png"}, die Bilder heißen "0", "1", …
 *  - neu:  collection.anki21b (SQLite, zstd-komprimiert), "media" als
 *          zstd-komprimiertes Protobuf MediaEntries, Bilder ebenfalls
 *          zstd-komprimiert und nach ihrer Position benannt.
 * Neue Pakete enthalten zusätzlich eine alte collection.anki2 mit nur einem
 * Hinweis "bitte Anki aktualisieren"; darum hat anki21b Vorrang.
 */

export interface AnkiPackage {
  deckName: string | null;
  cards: MappedAnkiCard[];
  skipped: number;
  /** Bilddaten zu einem Dateinamen aus dem Medienordner (bereits entpackt). */
  getMedia: (name: string) => Uint8Array | undefined;
}

export class AnkiPackageError extends Error {
  constructor(public code: 'not-apkg' | 'too-new' | 'empty') { super(code); }
}

// ── Protobuf (nur das Nötigste: MediaEntries) ────────────────────────────────
const readVarint = (buf: Uint8Array, pos: number): [number, number] => {
  let result = 0; let shift = 0; let b: number;
  do {
    b = buf[pos++];
    result += (b & 0x7f) * 2 ** shift;
    shift += 7;
  } while (b & 0x80 && pos < buf.length);
  return [result, pos];
};

interface MediaEntryRaw { name: string; legacyZipName?: number }

/** MediaEntries { repeated MediaEntry entries = 1 }; MediaEntry { name = 1; legacy_zip_filename = 255 }. */
export const decodeMediaEntries = (buf: Uint8Array): MediaEntryRaw[] => {
  const dec = new TextDecoder();
  const entries: MediaEntryRaw[] = [];
  let pos = 0;
  while (pos < buf.length) {
    let key: number; [key, pos] = readVarint(buf, pos);
    const field = Math.floor(key / 8); const wire = key & 7;
    if (wire !== 2) { // unerwartet: überspringen
      if (wire === 0) [, pos] = readVarint(buf, pos); else break;
      continue;
    }
    let len: number; [len, pos] = readVarint(buf, pos);
    const sub = buf.subarray(pos, pos + len); pos += len;
    if (field !== 1) continue;
    const entry: MediaEntryRaw = { name: '' };
    let p = 0;
    while (p < sub.length) {
      let k: number; [k, p] = readVarint(sub, p);
      const f = Math.floor(k / 8); const w = k & 7;
      if (w === 2) {
        let l: number; [l, p] = readVarint(sub, p);
        if (f === 1) entry.name = dec.decode(sub.subarray(p, p + l));
        p += l;
      } else if (w === 0) {
        let v: number; [v, p] = readVarint(sub, p);
        if (f === 255) entry.legacyZipName = v;
      } else break;
    }
    entries.push(entry);
  }
  return entries;
};

// ── SQLite laden (nur beim Import, WASM-Datei wird dann nachgeladen) ─────────
let sqlPromise: Promise<SqlJsStatic> | null = null;
const loadSql = (): Promise<SqlJsStatic> => {
  if (!sqlPromise) {
    sqlPromise = Promise.all([
      import('sql.js'),
      import('sql.js/dist/sql-wasm-browser.wasm?url'),
    ]).then(([mod, wasm]) => mod.default({ locateFile: () => wasm.default }));
  }
  return sqlPromise;
};

const rows = (db: Database, sql: string): unknown[][] => {
  try { return db.exec(sql)[0]?.values ?? []; } catch { return []; }
};

/** Name des Stapels mit den meisten Karten ("Eltern::Kind" → "Kind"). */
const readDeckName = (db: Database, latest: boolean): string | null => {
  const top = rows(db, 'SELECT did FROM cards GROUP BY did ORDER BY COUNT(*) DESC LIMIT 1')[0]?.[0];
  if (top === undefined) return null;
  let full: string | undefined;
  if (latest) {
    full = rows(db, `SELECT name FROM decks WHERE id = ${Number(top)}`)[0]?.[0] as string | undefined;
  } else {
    const json = rows(db, 'SELECT decks FROM col')[0]?.[0] as string | undefined;
    try { full = json ? JSON.parse(json)[String(top)]?.name : undefined; } catch { /* beschädigt */ }
  }
  if (!full || full === 'Default') return null;
  return full.split(/\u001f|::/).pop()?.trim() || null;
};

export const readApkg = async (
  bytes: Uint8Array,
  opts: { initSql?: () => Promise<SqlJsStatic> } = {},
): Promise<AnkiPackage> => {
  let zip: Record<string, Uint8Array>;
  try { zip = unzipSync(bytes); } catch { throw new AnkiPackageError('not-apkg'); }

  const latest = !!zip['collection.anki21b'];
  const colBytes = latest
    ? zstdDecompress(zip['collection.anki21b'])
    : zip['collection.anki21'] ?? zip['collection.anki2'];
  if (!colBytes) throw new AnkiPackageError('not-apkg');

  // Medienliste: Dateiname im Paket → Anki-Dateiname
  const zipNameByMedia = new Map<string, string>();
  if (zip.media) {
    if (latest) {
      decodeMediaEntries(zstdDecompress(zip.media)).forEach((e, i) => {
        if (e.name) zipNameByMedia.set(e.name, String(e.legacyZipName ?? i));
      });
    } else {
      try {
        const map = JSON.parse(new TextDecoder().decode(zip.media)) as Record<string, string>;
        Object.entries(map).forEach(([zipName, name]) => zipNameByMedia.set(name, zipName));
      } catch { /* ohne Medienliste weiter, nur ohne Bilder */ }
    }
  }

  const SQL = await (opts.initSql ?? loadSql)();
  const db = new SQL.Database(colBytes);
  try {
    const noteRows = rows(db, 'SELECT flds, tags FROM notes ORDER BY id');
    if (!noteRows.length) throw new AnkiPackageError('empty');
    const cards: MappedAnkiCard[] = [];
    let skipped = 0;
    for (const [flds, tags] of noteRows) {
      const card = noteToCard(String(flds ?? '').split('\u001f'), String(tags ?? ''));
      if (card) cards.push(card); else skipped++;
    }
    const deckName = readDeckName(db, latest);

    const cache = new Map<string, Uint8Array | undefined>();
    const getMedia = (name: string) => {
      if (cache.has(name)) return cache.get(name);
      const zipName = zipNameByMedia.get(name);
      const raw = zipName !== undefined ? zip[zipName] : undefined;
      let data: Uint8Array | undefined;
      try { data = raw && latest ? zstdDecompress(raw) : raw; } catch { data = undefined; }
      cache.set(name, data);
      return data;
    };
    return { deckName, cards, skipped, getMedia };
  } finally {
    db.close();
  }
};

/** Bild-Typ anhand des Dateinamens (für den Upload als Kartenbild). */
export const imageMimeFor = (name: string): string | null => {
  const ext = name.split('.').pop()?.toLowerCase();
  return ext === 'png' ? 'image/png'
    : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
    : ext === 'gif' ? 'image/gif'
    : ext === 'webp' ? 'image/webp'
    : ext === 'svg' ? null // SVG lässt der Bildkarten-Speicher nicht zu
    : null;
};
