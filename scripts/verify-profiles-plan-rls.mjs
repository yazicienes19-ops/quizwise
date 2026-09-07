// Sicherheits-Regressionstest: Kann ein normal eingeloggter Nutzer sein EIGENES
// profiles.plan-Feld per Client-SDK selbst auf 'pro' setzen (an Stripe vorbei)?
// Manuell nach jeder Änderung an RLS-Policies/Spalten-Rechten auf profiles laufen
// lassen — analog zu scripts/smoke-prod.mjs. Nutzt ein Testkonto, das am Ende
// garantiert wieder auf 'free' zurückgesetzt wird, unabhängig vom Testergebnis.
//
//   node scripts/verify-profiles-plan-rls.mjs
//
// Zugangsdaten NICHT hier hardcoden — via TEST_USER/TEST_PASS setzen, z.B. aus
// einer lokalen, gitignorten .env.test.local (s. .env.test.local Muster).

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const TEST_USER = process.env.TEST_USER;
const TEST_PASS = process.env.TEST_PASS;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !TEST_USER || !TEST_PASS) {
  console.error('❌ VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY/TEST_USER/TEST_PASS fehlen.');
  console.error('   Ausführen z.B. mit: node --env-file-if-exists=.env.test.local scripts/verify-profiles-plan-rls.mjs');
  process.exit(2);
}

let createClient;
try { ({ createClient } = await import('@supabase/supabase-js')); }
catch { console.error('@supabase/supabase-js fehlt (sollte bereits Projekt-Dependency sein).'); process.exit(2); }

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const { data, error } = await supabase.auth.signInWithPassword({ email: TEST_USER, password: TEST_PASS });
if (error || !data.session) {
  console.error('❌ Login fehlgeschlagen:', error?.message);
  process.exit(2);
}
const uid = data.user.id;

const { data: before } = await supabase.from('profiles').select('plan').eq('id', uid).single();
if (before?.plan !== 'free') {
  console.error(`❌ Testkonto ist nicht im erwarteten Ausgangszustand 'free' (ist: ${before?.plan}). Abbruch, kein Test durchgeführt.`);
  process.exit(2);
}

console.log('Versuche Selbst-Upgrade: profiles.update({ plan: "pro" }) als eingeloggter Nutzer...');
const { data: upd } = await supabase.from('profiles').update({ plan: 'pro' }).eq('id', uid).select('plan');
const { data: after } = await supabase.from('profiles').select('plan').eq('id', uid).single();

// Aufräumen zuerst, IMMER — unabhängig vom Testergebnis.
await supabase.from('profiles').update({ plan: 'free' }).eq('id', uid);

if (after?.plan === 'pro') {
  console.error('❌ SICHERHEITSLÜCKE: Selbst-Upgrade auf "pro" war erfolgreich! (update()-Antwort:', JSON.stringify(upd), ')');
  console.error('   Migration backend/migration_profiles_column_grants.sql wurde nicht/nicht korrekt ausgeführt.');
  process.exitCode = 1;
} else {
  console.log('✅ Selbst-Upgrade wurde verhindert. Plan blieb', after?.plan, '— Spalten-Rechte greifen.');
}
