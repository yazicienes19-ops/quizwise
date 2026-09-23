import { describe, it, expect } from 'vitest';
import { buildUserExport, USER_TABLES } from '../utils/userExport';

// Minimaler Supabase-Doppelgänger: from(table).select().eq(col, id)[.maybeSingle()]
const fakeAdmin = (db, { missing = [] } = {}) => ({
  from: (table) => ({
    select: () => ({
      eq: (col, id) => {
        const result = missing.includes(table)
          ? { data: null, error: { code: 'PGRST205', message: `Could not find the table '${table}'` } }
          : { data: (db[table] || []).filter(r => r[col] === id), error: null };
        return Object.assign(Promise.resolve(result), {
          maybeSingle: async () => ({ data: result.data?.[0] ?? null, error: result.error }),
        });
      },
    }),
  }),
  storage: {
    from: () => ({ createSignedUrl: async (path) => ({ data: { signedUrl: `https://files/${path}?sig` }, error: null }) }),
  },
});

const U = 'user-1';
const db = {
  profiles: [{ id: U, plan: 'free', calendar_feed_token: 'geheim' }, { id: 'other', plan: 'pro' }],
  documents: [
    { id: 'd1', user_id: U, storage_path: `${U}/d1/skript.pdf`, content_text: null },
    { id: 'd2', user_id: U, storage_path: null, content_text: 'Notiz' },
    { id: 'x', user_id: 'other', storage_path: 'other/x/a.pdf' },
  ],
  user_learning_data: [{ user_id: U, quiz_history: [{ id: 'q1' }] }],
  graph_nodes: [{ id: 'n1', user_id: U, title: 'Konditionierung' }],
  push_subscriptions: [{ user_id: U, subscription: { endpoint: 'e', keys: { auth: 'k' } } }],
  shared_decks: [{ id: 's1', owner_id: U }],
};

describe('buildUserExport', () => {
  it('exportiert jede Nutzertabelle, nur mit eigenen Zeilen', async () => {
    const out = await buildUserExport(fakeAdmin(db), { id: U, email: 'a@b.de' });
    for (const [table] of USER_TABLES) expect(out.tables).toHaveProperty(table);
    expect(out.tables.documents.map(d => d.id)).toEqual(['d1', 'd2']);
    expect(out.tables.user_learning_data[0].quiz_history).toHaveLength(1);
    expect(out.tables.graph_nodes[0].title).toBe('Konditionierung');
    expect(out.tables.shared_decks).toHaveLength(1);
    expect(out.account).toEqual({ id: U, email: 'a@b.de' });
  });

  it('schwärzt Zugangsschlüssel statt sie mitzugeben', async () => {
    const out = await buildUserExport(fakeAdmin(db), { id: U });
    expect(out.tables.profiles[0].calendar_feed_token).not.toBe('geheim');
    expect(JSON.stringify(out.tables.push_subscriptions)).not.toContain('"auth"');
  });

  it('liefert Download-Links nur für Dokumente mit Datei', async () => {
    const out = await buildUserExport(fakeAdmin(db), { id: U });
    expect(out.files).toEqual([{ documentId: 'd1', path: `${U}/d1/skript.pdf`, downloadUrl: `https://files/${U}/d1/skript.pdf?sig`, validForDays: 7 }]);
  });

  it('überspringt Tabellen, die es in dieser Datenbank nicht gibt', async () => {
    const out = await buildUserExport(fakeAdmin(db, { missing: ['mindmaps'] }), { id: U });
    expect(out.tables).not.toHaveProperty('mindmaps');
    expect(out.notInThisDatabase).toEqual(['mindmaps']);
  });
});
