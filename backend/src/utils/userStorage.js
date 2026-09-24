// Dateien eines Nutzers im Storage finden und löschen (Konto-Löschung).
// Die Tabellen räumt ON DELETE CASCADE beim Löschen des Auth-Users ab, die
// Buckets nicht. Pfade beginnen immer mit <userId>/ (Storage-RLS prüft das
// erste Segment):
//   document-files: <userId>/<docId>/<dateiname> (services/documentService.ts)
//   card-images:    <userId>/<cardId>-<zufall>.<ext> (services/cardImages.ts)
// Quelle 1: storage_path aus documents. Quelle 2: Ordner-Listing, damit auch
// Dateien ohne Tabellenzeile (abgebrochene Uploads) erfasst werden.
const DOCUMENT_BUCKET = 'document-files';
const CARD_IMAGE_BUCKET = 'card-images';
const LIST_LIMIT = 1000;

/** Ein fehlender Bucket (Migration noch nicht ausgeführt) ist kein Fehler. */
const isMissingBucket = (error) => /not found/i.test(error?.message || '');

/** Alle Dateien unter <userId>/ eines Buckets, eine Ordnerebene tief. */
async function listUserFolder(admin, bucketName, userId) {
  const bucket = admin.storage.from(bucketName);
  const { data: entries, error } = await bucket.list(userId, { limit: LIST_LIMIT });
  if (error) {
    if (isMissingBucket(error)) return [];
    throw error;
  }
  const paths = [];
  for (const entry of entries || []) {
    // Ordner haben keine id, Dateien direkt unter <userId>/ schon.
    if (entry.id) { paths.push(`${userId}/${entry.name}`); continue; }
    const { data: files, error: fileErr } = await bucket.list(`${userId}/${entry.name}`, { limit: LIST_LIMIT });
    if (fileErr) throw fileErr;
    (files || []).forEach(f => paths.push(`${userId}/${entry.name}/${f.name}`));
  }
  return paths;
}

async function collectUserStoragePaths(admin, userId) {
  const docPaths = new Set();
  const { data: docs, error: docsErr } = await admin
    .from('documents').select('storage_path').eq('user_id', userId).not('storage_path', 'is', null);
  if (docsErr) throw docsErr;
  (docs || []).forEach(d => docPaths.add(d.storage_path));
  (await listUserFolder(admin, DOCUMENT_BUCKET, userId)).forEach(p => docPaths.add(p));

  return {
    [DOCUMENT_BUCKET]: [...docPaths],
    [CARD_IMAGE_BUCKET]: await listUserFolder(admin, CARD_IMAGE_BUCKET, userId),
  };
}

/** Löscht alle Dateien des Nutzers; wirft bei Fehlern, damit das Konto dann bestehen bleibt. */
async function deleteUserStorage(admin, userId) {
  const byBucket = await collectUserStoragePaths(admin, userId);
  let removed = 0;
  for (const [bucketName, paths] of Object.entries(byBucket)) {
    // Storage-API nimmt große Listen, aber in Blöcken bleibt ein Fehler eingrenzbar.
    for (let i = 0; i < paths.length; i += 100) {
      const { error } = await admin.storage.from(bucketName).remove(paths.slice(i, i + 100));
      if (error) throw error;
      removed += Math.min(100, paths.length - i);
    }
  }
  return removed;
}

module.exports = { collectUserStoragePaths, deleteUserStorage, DOCUMENT_BUCKET, CARD_IMAGE_BUCKET };
