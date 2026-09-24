import { supabase } from './supabaseClient';

/**
 * Zwei-Faktor-Anmeldung per Authenticator-App (TOTP, Supabase MFA).
 *
 * Grenze: Die Abfrage geschieht in der App (components/MfaGate.tsx). Die
 * Datenbank prüft die Sicherheitsstufe (aal2) bisher nicht selbst; dafür
 * müssten die RLS-Policies um auth.jwt()->>'aal' ergänzt werden.
 */

export interface TotpSetup {
  factorId: string;
  /** SVG als data:-URL, direkt als <img src> nutzbar. */
  qrCode: string;
  secret: string;
}

export const CODE_LENGTH = 6;
export const isValidCode = (code: string): boolean => new RegExp(`^\\d{${CODE_LENGTH}}$`).test(code.trim());

/** Muss diese Sitzung noch einen zweiten Faktor bestätigen? */
export const needsSecondFactor = async (): Promise<boolean> => {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) return false;
  return data.nextLevel === 'aal2' && data.currentLevel !== 'aal2';
};

/** Bestätigte Authenticator-Faktoren des Kontos. */
export const listVerifiedTotp = async (): Promise<{ id: string; createdAt: string }[]> => {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  return (data?.totp ?? []).map(f => ({ id: f.id, createdAt: f.created_at }));
};

/** Neuen Faktor anlegen. Abgebrochene, unbestätigte Versuche werden vorher entfernt. */
export const startTotpSetup = async (): Promise<TotpSetup> => {
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const f of factors?.all ?? []) {
    if (f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `StudeArc ${new Date().toISOString().slice(0, 10)}` });
  if (error) throw error;
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
};

/** Code prüfen (Einrichtung bestätigen oder Anmeldung abschließen). */
export const verifyTotp = async (factorId: string, code: string): Promise<void> => {
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
  if (error) throw error;
};

/** Anmeldung abschließen: nimmt den ersten bestätigten Faktor. */
export const verifyLogin = async (code: string): Promise<void> => {
  const [factor] = await listVerifiedTotp();
  if (!factor) throw new Error('no_factor');
  await verifyTotp(factor.id, code);
};

export const removeTotp = async (factorId: string): Promise<void> => {
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) throw error;
};
