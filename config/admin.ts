// Supabase User IDs der Admins (Supabase → Authentication → Users → ID kopieren)
// Zweiter Eintrag: demo@quizwise.app, dedizierter Test-/Smoke-Account (s. scripts/smoke-prod.mjs).
export const ADMIN_IDS: string[] = ['efb1b348-9d63-41db-848d-5b87836dd0a1', '03a34100-12f5-4e63-b247-69f9feff5561'];

export const isAdmin = (userId?: string | null): boolean =>
  !!userId && ADMIN_IDS.includes(userId);
