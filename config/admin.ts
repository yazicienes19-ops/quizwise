// Supabase User IDs der Admins (Supabase → Authentication → Users → ID kopieren)
export const ADMIN_IDS: string[] = ['efb1b348-9d63-41db-848d-5b87836dd0a1'];

export const isAdmin = (userId?: string | null): boolean =>
  !!userId && ADMIN_IDS.includes(userId);
