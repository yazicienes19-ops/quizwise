import { supabase } from '../supabaseClient';
import type { ExtractionCache } from './llm';
import { EXTRACT_PROMPT_VERSION } from './prompts/extract.v5';

/**
 * Extraktions-Cache je Konto: im Speicher für die Sitzung, dauerhaft in
 * studio_extractions (migration_studio_v2.sql). Fehlt die Tabelle, bleibt
 * es beim Speicher-Cache; die Pipeline läuft trotzdem.
 * Nicht im localStorage: Einheiten ganzer Skripte sprengen sonst das Quota.
 */
const memory = new Map<string, unknown[]>();

export const extractionCache = (userId: string | undefined): ExtractionCache => ({
  get: async hash => {
    const key = `${userId ?? 'local'}:${hash}`;
    if (memory.has(key)) return memory.get(key)!;
    if (!userId) return null;
    const { data, error } = await supabase
      .from('studio_extractions')
      .select('units')
      .eq('content_hash', hash)
      .eq('prompt_version', EXTRACT_PROMPT_VERSION)
      .limit(1);
    if (error || !data?.length) return null;
    const units = (data[0] as { units: unknown[] }).units;
    memory.set(key, units);
    return units;
  },
  set: async (hash, docId, pageCount, units) => {
    memory.set(`${userId ?? 'local'}:${hash}`, units);
    if (!userId) return;
    await supabase.from('studio_extractions').upsert({
      user_id: userId, content_hash: hash, prompt_version: EXTRACT_PROMPT_VERSION,
      doc_id: docId, page_count: pageCount, units,
    });
  },
});
