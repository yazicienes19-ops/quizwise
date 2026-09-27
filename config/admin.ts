// Supabase User IDs der Admins (Supabase → Authentication → Users → ID kopieren)
// Muss mit backend/src/middleware/requireAdmin.js übereinstimmen. Das Demo-Konto
// (demo@quizwise.app) ist bewusst KEIN Admin mehr (27.09.2026): Es sah die Labor-Gruppe
// samt Nutzerübersicht, obwohl der Server es ablehnt; nur echte Admins sollen sie sehen.
export const ADMIN_IDS: string[] = ['efb1b348-9d63-41db-848d-5b87836dd0a1'];

export const isAdmin = (userId?: string | null): boolean =>
  !!userId && ADMIN_IDS.includes(userId);
