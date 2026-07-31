// Transaktions-E-Mails (z.B. Kündigungsbestätigung nach § 312k Abs. 4 BGB),
// getrennt von den Supabase-Auth-Mails (Registrierung/Passwort laufen über
// Supabase's eigenes Custom-SMTP und benutzen diesen Client nicht).
//
// Läuft über die Resend-HTTPS-API statt direktem SMTP: Railway blockiert
// ausgehende Verbindungen zu fremden Mailservern auf den SMTP-Ports (465/587)
// netzwerkseitig (verifiziert über `railway logs --network --status dropped`),
// eine HTTPS-API auf Port 443 umgeht das.
const { Resend } = require('resend');

let resend = null;
const isConfigured = () => !!(process.env.RESEND_API_KEY && process.env.MAIL_FROM_ADDRESS);

function getClient() {
  if (!isConfigured()) return null;
  if (!resend) resend = new Resend(process.env.RESEND_API_KEY);
  return resend;
}

async function sendMail({ to, subject, html, text }) {
  const client = getClient();
  if (!client) {
    console.warn(`[mailer] Resend nicht konfiguriert — Mail an ${to} ("${subject}") nicht verschickt.`);
    return { sent: false };
  }
  const { data, error } = await client.emails.send({
    from: `${process.env.MAIL_FROM_NAME || 'StudeArc'} <${process.env.MAIL_FROM_ADDRESS}>`,
    to, subject, html, text,
  });
  if (error) {
    console.error('[mailer] Resend-Fehler:', error.message || error);
    return { sent: false };
  }
  console.log('[mailer] Resend-Antwort:', JSON.stringify(data));
  return { sent: true };
}

module.exports = { sendMail, isConfigured };
