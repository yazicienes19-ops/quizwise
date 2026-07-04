import { supabase } from './supabaseClient';

/**
 * pushService — Web-Push-Anmeldung für die tägliche Lern-Erinnerung.
 *
 * Ablauf: Notification-Permission → PushManager-Subscription mit dem
 * VAPID-Public-Key des Backends → Subscription ans Backend (Supabase-Tabelle
 * push_subscriptions). Der Versand passiert serverseitig per Cron.
 */

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';

const getAuthHeader = async (): Promise<Record<string, string>> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Bitte zuerst einloggen.');
  return { 'Authorization': `Bearer ${session.access_token}` };
};

export const isPushSupported = (): boolean =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

const urlBase64ToUint8Array = (base64: string): Uint8Array => {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
};

export const getExistingSubscription = async (): Promise<PushSubscription | null> => {
  if (!isPushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    return await reg.pushManager.getSubscription();
  } catch { return null; }
};

/** Meldet dieses Gerät für die tägliche Erinnerung an. Wirft bei Ablehnung/Fehler. */
export const subscribeToPush = async (): Promise<void> => {
  if (!isPushSupported()) throw new Error('Dein Browser unterstützt keine Push-Benachrichtigungen.');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Benachrichtigungen wurden nicht erlaubt.');

  const keyRes = await fetch(`${BACKEND_URL}/api/push/vapid-key`);
  const { key } = await keyRes.json();
  if (!key) throw new Error('Push ist serverseitig noch nicht konfiguriert.');

  const reg = await navigator.serviceWorker.ready;
  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key),
  });

  const authHeader = await getAuthHeader();
  const res = await fetch(`${BACKEND_URL}/api/push/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader },
    body: JSON.stringify({ subscription: subscription.toJSON() }),
  });
  if (!res.ok) throw new Error('Anmeldung fehlgeschlagen. Bitte erneut versuchen.');
};

export const unsubscribeFromPush = async (): Promise<void> => {
  const subscription = await getExistingSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe().catch(() => {});
  try {
    const authHeader = await getAuthHeader();
    await fetch(`${BACKEND_URL}/api/push/subscribe`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...authHeader },
      body: JSON.stringify({ endpoint }),
    });
  } catch { /* Backend-Cleanup best-effort — abgelaufene Endpoints räumt der Cron auf */ }
};
