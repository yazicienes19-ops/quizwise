import { supabase } from './supabaseClient';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';

const authHeaders = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Nicht eingeloggt.');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session.access_token}`,
  };
};

export const changePassword = async (newPassword: string): Promise<void> => {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(error.message);
};

export const deleteAccount = async (): Promise<void> => {
  const headers = await authHeaders();
  const res = await fetch(`${BACKEND_URL}/api/user/account`, { method: 'DELETE', headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Konto konnte nicht gelöscht werden.');
  }
};

export const exportUserData = async (): Promise<void> => {
  const headers = await authHeaders();
  const res = await fetch(`${BACKEND_URL}/api/user/export`, { headers });
  if (!res.ok) throw new Error('Export fehlgeschlagen.');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'quizwise-daten.json';
  a.click();
  URL.revokeObjectURL(url);
};

export const getInvoices = async (): Promise<any[]> => {
  const headers = await authHeaders();
  const res = await fetch(`${BACKEND_URL}/api/stripe/invoices`, { headers });
  if (!res.ok) return [];
  const data = await res.json();
  return data.invoices || [];
};

export const cancelSubscription = async (): Promise<string> => {
  const headers = await authHeaders();
  const res = await fetch(`${BACKEND_URL}/api/stripe/cancel`, { method: 'POST', headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Kündigung fehlgeschlagen.');
  }
  const data = await res.json();
  return data.endsAt;
};
