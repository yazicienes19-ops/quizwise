import { supabase } from './supabaseClient';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';

// Erstellt eine Stripe-Zahlungsseite und leitet den Nutzer dorthin weiter
export const startCheckout = async (): Promise<void> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Bitte zuerst einloggen.');

  const res = await fetch(`${BACKEND_URL}/api/stripe/create-checkout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
  });

  if (!res.ok) throw new Error('Checkout konnte nicht erstellt werden.');

  const { url } = await res.json();
  // Nutzer zur Stripe-Zahlungsseite weiterleiten
  window.location.href = url;
};
