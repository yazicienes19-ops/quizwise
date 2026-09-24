/**
 * E-Mail als zweiter Kanal neben Push (Audit 23.09.2026: ohne Push-Freigabe,
 * z. B. auf dem iPhone ohne installierte App, kam keine Erinnerung an).
 *
 * Bewusst nur die planbaren Typen: tägliche Erinnerung, fällige
 * Wiederholungen, Klausur-Countdown. Blockvorlauf und Motivationsmeldungen
 * wären per Mail zu kleinteilig. Alle Meldungen eines Ticks landen in einer
 * einzigen Mail, dadurch höchstens etwa zwei Mails am Tag (08:00 Klausur,
 * Erinnerungszeit am Abend).
 */
const EMAIL_TYPE_IDS = new Set(['daily-reminder', 'spaced-repetition', 'exam-countdown']);

const APP_URL = 'https://www.studearc.com';

const escapeHtml = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Betreff aus der ersten Meldung, bei mehreren mit Zusatz. */
function buildSubject(messages) {
  if (messages.length === 1) return messages[0].title;
  const rest = messages.length - 1;
  return `${messages[0].title} und ${rest === 1 ? '1 weiterer Hinweis' : `${rest} weitere Hinweise`}`;
}

function buildEmail(messages) {
  const subject = buildSubject(messages);
  const settingsHint = 'Du bekommst diese Mail, weil du E-Mail-Erinnerungen in StudeArc eingeschaltet hast. '
    + 'Abschalten kannst du sie unter Einstellungen, Benachrichtigungen.';

  const text = [
    ...messages.map(m => `${m.title}\n${m.body}`),
    `Weiterlernen: ${APP_URL}`,
    settingsHint,
  ].join('\n\n');

  const items = messages.map(m => `
      <tr><td style="padding:0 0 18px">
        <p style="margin:0 0 4px;font-size:15px;font-weight:600;color:#1f1b14">${escapeHtml(m.title)}</p>
        <p style="margin:0;font-size:14px;line-height:1.5;color:#4a443a">${escapeHtml(m.body)}</p>
      </td></tr>`).join('');

  const html = `<!doctype html><html><body style="margin:0;background:#f6f3ec;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #e6e0d4;border-radius:12px;padding:28px">
        <tr><td style="padding:0 0 20px;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#8a6d1f;font-weight:600">StudeArc</td></tr>
        ${items}
        <tr><td style="padding:6px 0 0">
          <a href="${APP_URL}" style="display:inline-block;background:#1f1b14;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 20px;border-radius:8px">Weiterlernen</a>
        </td></tr>
        <tr><td style="padding:24px 0 0;font-size:12px;line-height:1.5;color:#6d6659">${escapeHtml(settingsHint)}</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return { subject, html, text };
}

module.exports = { EMAIL_TYPE_IDS, buildEmail, buildSubject };
