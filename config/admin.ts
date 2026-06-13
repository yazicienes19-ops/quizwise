// Supabase User IDs der Admins (Supabase → Authentication → Users → ID kopieren)
export const ADMIN_IDS: string[] = ['2e6f5e0f-0420-4d0f-bb5a-284bc2d6aa5e'];

export const isAdmin = (userId?: string | null): boolean =>
  !!userId && ADMIN_IDS.includes(userId);
