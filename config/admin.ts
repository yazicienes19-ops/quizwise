// Supabase User IDs der Admins (Supabase → Authentication → Users → ID kopieren)
export const ADMIN_IDS: string[] = ['HIER_SUPABASE_USER_ID_EINTRAGEN'];

export const isAdmin = (userId?: string | null): boolean =>
  !!userId && ADMIN_IDS.includes(userId);
