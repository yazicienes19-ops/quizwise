import { supabase } from './supabaseClient';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';

const authHeaders = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Nicht eingeloggt.');
  return { 'Authorization': `Bearer ${session.access_token}` };
};

export interface AdminUserRow {
  id: string;
  email: string | null;
  name: string | null;
  plan: string;
  createdAt: string | null;
  lastSignInAt: string | null;
  lastActiveAt: string | null;
  totalActiveSeconds: number;
  last7DaysActiveSeconds: number;
}

export const fetchAdminUsers = async (): Promise<AdminUserRow[]> => {
  const headers = await authHeaders();
  const res = await fetch(`${BACKEND_URL}/api/admin/users`, { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Nutzer konnten nicht geladen werden.');
  }
  const data = await res.json();
  return data.users || [];
};
