import { supabase } from './supabaseClient';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';

const authHeaders = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Nicht eingeloggt.');
  return { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' };
};

export interface AdminUserRow {
  id: string;
  email: string | null;
  name: string | null;
  plan: string;
  adminProUntil: string | null;
  isSuspended: boolean;
  isAdmin: boolean;
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

const postAdminAction = async (path: string, body?: Record<string, unknown>): Promise<void> => {
  const headers = await authHeaders();
  const res = await fetch(`${BACKEND_URL}/api/admin/${path}`, {
    method: 'POST',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Aktion fehlgeschlagen.');
  }
};

export const grantPro = (userId: string, days: number): Promise<void> =>
  postAdminAction(`users/${userId}/grant-pro`, { days });

export const revokePro = (userId: string): Promise<void> =>
  postAdminAction(`users/${userId}/revoke-pro`);

export const suspendUser = (userId: string): Promise<void> =>
  postAdminAction(`users/${userId}/suspend`);

export const unsuspendUser = (userId: string): Promise<void> =>
  postAdminAction(`users/${userId}/unsuspend`);

export interface QuestionReportGroup {
  key: string;
  kind: 'quiz' | 'exam';
  questionText: string;
  details: { options?: string[]; correctAnswerIndices?: number[]; explanation?: string; topic?: string };
  docNames: string[];
  reasons: Record<string, number>;
  count: number;
  reporters: number;
  lastReportedAt: string;
}

export interface QuestionReportsResponse {
  groups: QuestionReportGroup[];
  total: number;
  /** true, solange backend/migration_question_reports.sql nicht ausgeführt ist. */
  setupMissing: boolean;
}

export const fetchQuestionReports = async (): Promise<QuestionReportsResponse> => {
  const headers = await authHeaders();
  const res = await fetch(`${BACKEND_URL}/api/admin/question-reports`, { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Meldungen konnten nicht geladen werden.');
  }
  const data = await res.json();
  return { groups: data.groups || [], total: data.total || 0, setupMissing: !!data.setupMissing };
};
