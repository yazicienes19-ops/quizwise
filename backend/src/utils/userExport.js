// Vollständiger Datenexport (Art. 15 und 20 DSGVO) für GET /api/user/export.
//
// Bis 23.09.2026 exportierte die Route nur profiles, metrics, flashcard_decks
// und study_plan. Jetzt: jede Tabelle mit Nutzerbezug, dazu für hochgeladene
// Dateien befristete Download-Links, damit auch die Originale mitgenommen
// werden können.
//
// Neue Tabelle mit Nutzerdaten? Hier in USER_TABLES eintragen, sonst fehlt
// sie im Export.

const USER_TABLES = [
  // [Tabelle, Spalte mit der Nutzer-ID]
  ['metrics', 'user_id'],
  ['collections', 'user_id'],
  ['documents', 'user_id'],
  ['flashcard_decks', 'user_id'],
  ['user_learning_data', 'user_id'],
  ['user_saved_content', 'user_id'],
  ['study_plan', 'user_id'],
  ['graph_nodes', 'user_id'],
  ['graph_edges', 'user_id'],
  ['graph_node_documents', 'user_id'],
  ['graph_relation_types', 'user_id'],
  ['mindmaps', 'user_id'],
  ['daily_activity', 'user_id'],
  ['ai_usage_monthly', 'user_id'],
  ['question_reports', 'user_id'],
  ['notification_log', 'user_id'],
  ['push_subscriptions', 'user_id'],
  ['shared_decks', 'owner_id'],
  ['shared_collections', 'owner_id'],
];

// Zugangsschlüssel, keine Inhalte: wer sie kennt, kommt an Daten heran.
const REDACT = {
  profiles: ['calendar_feed_token'],
  push_subscriptions: ['subscription'],
};

const FILE_LINK_SECONDS = 7 * 24 * 60 * 60;
const STORAGE_BUCKET = 'document-files';

// Tabelle existiert in dieser Datenbank (noch) nicht: überspringen statt den
// ganzen Export scheitern zu lassen.
const isMissingTable = (err) =>
  !!err && (err.code === '42P01' || err.code === 'PGRST205' || /does not exist|could not find the table/i.test(err.message || ''));

const redact = (table, rows) => {
  const fields = REDACT[table];
  if (!fields) return rows;
  return rows.map(row => {
    const copy = { ...row };
    for (const f of fields) if (f in copy) copy[f] = '[aus Sicherheitsgründen entfernt]';
    return copy;
  });
};

/**
 * @param {object} admin  Supabase-Client mit Service-Rolle
 * @param {{ id: string, email?: string }} user
 */
const buildUserExport = async (admin, user) => {
  const userId = user.id;
  const tables = {};
  const skipped = [];

  const { data: profile, error: profileErr } = await admin.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (profileErr && !isMissingTable(profileErr)) throw profileErr;
  tables.profiles = redact('profiles', profile ? [profile] : []);

  for (const [table, column] of USER_TABLES) {
    const { data, error } = await admin.from(table).select('*').eq(column, userId);
    if (error) {
      if (isMissingTable(error)) { skipped.push(table); continue; }
      throw error;
    }
    tables[table] = redact(table, data || []);
  }

  // Befristete Download-Links für hochgeladene Originaldateien.
  const files = [];
  for (const doc of tables.documents || []) {
    if (!doc.storage_path) continue;
    const { data, error } = await admin.storage.from(STORAGE_BUCKET).createSignedUrl(doc.storage_path, FILE_LINK_SECONDS);
    files.push({
      documentId: doc.id,
      path: doc.storage_path,
      downloadUrl: error ? null : data?.signedUrl ?? null,
      validForDays: 7,
    });
  }

  return {
    exportedAt: new Date().toISOString(),
    format: 'studearc-export-v2',
    account: { id: userId, email: user.email ?? null },
    tables,
    files,
    ...(skipped.length ? { notInThisDatabase: skipped } : {}),
  };
};

module.exports = { buildUserExport, USER_TABLES };
