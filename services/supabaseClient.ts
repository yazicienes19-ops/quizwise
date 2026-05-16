import { createClient } from '@supabase/supabase-js';

// Der anon Key ist sicher im Frontend — er erlaubt nur was Supabase-Regeln erlauben
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
