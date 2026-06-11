import { supabase } from './supabaseClient';
import type { AgentType, AgentMessage, AgentContext } from '../types';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';

const getAuthHeader = async (): Promise<Record<string, string>> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Bitte zuerst einloggen.');
  return { 'Authorization': `Bearer ${session.access_token}` };
};

export const chatWithAgent = async (
  agentType: AgentType,
  userMessage: string,
  history: AgentMessage[],
  context: AgentContext = {}
): Promise<string> => {
  const authHeader = await getAuthHeader();

  const historyPayload = history.map(m => ({ role: m.role, content: m.content }));

  const res = await fetch(`${BACKEND_URL}/api/agents/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader },
    body: JSON.stringify({ agentType, userMessage, history: historyPayload, context }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unbekannter Fehler' }));
    if (res.status === 429) throw new Error('LIMIT_REACHED');
    throw new Error(err.error || `Server-Fehler: ${res.status}`);
  }

  const data = await res.json();
  return data.text || '';
};
