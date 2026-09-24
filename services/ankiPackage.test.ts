import { describe, it, expect } from 'vitest';
import { zipSync } from 'fflate';
import { zstdCompressSync } from 'node:zlib';
import initSqlJs from 'sql.js';
import { readApkg, decodeMediaEntries, imageMimeFor } from './ankiPackage';

const initSql = () => initSqlJs();
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);

/** Minimales Anki-Paket nach dem Aufbau in rslib/src/import_export/package. */
const buildApkg = async (latest: boolean): Promise<Uint8Array> => {
  const SQL = await initSql();
  const db = new SQL.Database();
  db.run('CREATE TABLE notes (id INTEGER PRIMARY KEY, flds TEXT, tags TEXT)');
  db.run('CREATE TABLE cards (id INTEGER PRIMARY KEY, nid INTEGER, did INTEGER)');
  db.run("INSERT INTO notes VALUES (1, 'Welches Organ?<img src=\"herz bild.png\">\u001fDas Herz', ' anatomie ')");
  db.run("INSERT INTO notes VALUES (2, '{{c1::Pawlow}} erforschte Hunde\u001f', '')");
  db.run("INSERT INTO notes VALUES (3, '\u001fnur hinten', '')");
  db.run('INSERT INTO cards VALUES (10, 1, 42), (11, 2, 42), (12, 3, 42)');
  if (latest) {
    db.run('CREATE TABLE decks (id INTEGER PRIMARY KEY, name TEXT)');
    db.run("INSERT INTO decks VALUES (42, 'Medizin\u001fAnatomie')");
  } else {
    db.run('CREATE TABLE col (decks TEXT)');
    db.run(`INSERT INTO col VALUES ('${JSON.stringify({ 42: { name: 'Medizin::Anatomie' } })}')`);
  }
  const col = db.export(); db.close();

  if (!latest) {
    return zipSync({ 'collection.anki21': col, media: new TextEncoder().encode('{"0": "herz bild.png"}'), 0: PNG });
  }
  // MediaEntries { entries = 1 { name = 1 } } von Hand kodiert
  const name = new TextEncoder().encode('herz bild.png');
  const entry = new Uint8Array([0x0a, name.length, ...name]);
  const media = new Uint8Array([0x0a, entry.length, ...entry]);
  return zipSync({
    'collection.anki2': new Uint8Array([1, 2, 3]), // Hinweis-Sammlung alter Clients, muss ignoriert werden
    'collection.anki21b': new Uint8Array(zstdCompressSync(col)),
    media: new Uint8Array(zstdCompressSync(media)),
    0: new Uint8Array(zstdCompressSync(PNG)),
  });
};

describe('readApkg', () => {
  for (const latest of [false, true]) {
    it(`liest ${latest ? 'neue (zstd)' : 'alte'} Pakete samt Bild und Stapelname`, async () => {
      const pkg = await readApkg(await buildApkg(latest), { initSql });
      expect(pkg.deckName).toBe('Anatomie');
      expect(pkg.cards).toHaveLength(2);
      expect(pkg.skipped).toBe(1);
      expect(pkg.cards[0]).toMatchObject({ front: 'Welches Organ?', back: 'Das Herz', frontImage: 'herz bild.png', tags: ['anatomie'] });
      expect(pkg.cards[1].front).toBe('{{c1::Pawlow}} erforschte Hunde');
      expect(Array.from(pkg.getMedia('herz bild.png') ?? [])).toEqual(Array.from(PNG));
      expect(pkg.getMedia('fehlt.png')).toBeUndefined();
    });
  }

  it('meldet Dateien, die kein Anki-Paket sind', async () => {
    await expect(readApkg(new Uint8Array([1, 2, 3]), { initSql })).rejects.toMatchObject({ code: 'not-apkg' });
    await expect(readApkg(zipSync({ 'x.txt': new Uint8Array([1]) }), { initSql })).rejects.toMatchObject({ code: 'not-apkg' });
  });
});

describe('Hilfsfunktionen', () => {
  it('dekodiert MediaEntries samt legacy_zip_filename', () => {
    const name = new TextEncoder().encode('a.png');
    const entry = new Uint8Array([0x0a, name.length, ...name, 0xf8, 0x0f, 7]); // Feld 255, varint 7
    expect(decodeMediaEntries(new Uint8Array([0x0a, entry.length, ...entry]))).toEqual([{ name: 'a.png', legacyZipName: 7 }]);
  });
  it('erkennt Bildtypen, lässt SVG und Ton weg', () => {
    expect(imageMimeFor('a.JPG')).toBe('image/jpeg');
    expect(imageMimeFor('a.svg')).toBeNull();
    expect(imageMimeFor('a.mp3')).toBeNull();
  });
});
