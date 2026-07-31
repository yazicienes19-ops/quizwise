// Design-Handoff: ~/Downloads/App-Dashboard responsive Kündigung Design.zip
// (design_handoff_studearc_email_kuendigung) — Farbtokens/Struktur 1:1 übernommen,
// nur {{Platzhalter}} durch echte Werte ersetzt und Domain auf studearc.com korrigiert.
function buildCancellationEmail({ name, endsAt, receivedAt }) {
  const greetingName = name ? `, ${name}` : '';
  const html = `<!DOCTYPE html>
<html lang="de" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<!--[if mso]>
<noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
<style>table,td,div,h1,p{font-family:Arial,Helvetica,sans-serif;}</style>
<![endif]-->
<title>Deine Kündigung bei StudeArc</title>
</head>
<body style="margin:0;padding:0;background-color:#EDE8DE;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#EDE8DE;">Deine Pro-Mitgliedschaft wurde gekündigt. Du kannst sie bis zum Ende der Laufzeit weiter nutzen.&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#EDE8DE;">
<tr>
<td align="center" style="padding:32px 16px;">

<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background-color:#FBF9F4;">

<tr>
<td align="center" style="padding:36px 40px 24px 40px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="font-family:Georgia,'Times New Roman',serif;font-size:22px;color:#1B2A4A;padding-right:2px;">Stude</td>
<td style="font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:bold;color:#A9772C;">Arc</td>
</tr></table>
</td>
</tr>

<tr><td style="padding:0 40px;"><div style="border-top:1px solid #E4DFD2;line-height:1px;font-size:1px;">&nbsp;</div></td></tr>

<tr>
<td align="center" style="padding:40px 40px 8px 40px;">
<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:#A9772C;">Kündigung bestätigt</p>
</td>
</tr>
<tr>
<td align="center" style="padding:12px 40px 0 40px;">
<h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:1.25;font-weight:normal;color:#1B2A4A;">Schade, dass du gehst${greetingName}</h1>
</td>
</tr>
<tr>
<td align="center" style="padding:16px 40px 0 40px;">
<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#5B5647;">Deine StudeArc Pro Mitgliedschaft wurde ordentlich zum Ende der aktuellen Abrechnungsperiode gekündigt. Bis dahin stehen dir alle Pro Funktionen weiterhin zur Verfügung.</p>
</td>
</tr>

<tr>
<td style="padding:32px 40px 0 40px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #E4DFD2;border-radius:14px;">
<tr>
<td style="padding:20px 24px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#8A8172;padding-bottom:10px;">Plan</td>
<td align="right" style="font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:bold;color:#1B2A4A;padding-bottom:10px;">StudeArc Pro</td>
</tr>
<tr>
<td style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#8A8172;padding-bottom:10px;">Gekündigt am</td>
<td align="right" style="font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:bold;color:#1B2A4A;padding-bottom:10px;">${receivedAt} Uhr</td>
</tr>
<tr>
<td style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#8A8172;padding-bottom:0;">Zugang bis</td>
<td align="right" style="font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:bold;color:#1B2A4A;padding-bottom:0;">${endsAt}</td>
</tr>
</table>
</td>
</tr>
</table>
</td>
</tr>

<tr>
<td align="center" style="padding:28px 40px 8px 40px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0">
<tr>
<td align="center" bgcolor="#1B2A4A" style="border-radius:10px;">
<a href="https://www.studearc.com/" target="_blank" style="display:block;padding:16px 40px;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:#FBF9F4;text-decoration:none;border-radius:10px;">Mitgliedschaft fortsetzen &#8594;</a>
</td>
</tr>
</table>
</td>
</tr>
<tr>
<td align="center" style="padding:16px 40px 0 40px;">
<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#8A8172;">Einloggen und unter Einstellungen &rarr; Abonnement fortsetzen.</p>
</td>
</tr>

<tr><td style="padding:32px 40px 0 40px;"><div style="border-top:1px solid #E4DFD2;line-height:1px;font-size:1px;">&nbsp;</div></td></tr>

<tr>
<td style="padding:28px 40px 0 40px;">
<p style="margin:0 0 10px 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:bold;letter-spacing:1.5px;text-transform:uppercase;color:#8A8172;">Bevor du gehst</p>
<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#1B2A4A;">Dein Fortschritt, deine Karten und dein Lernverlauf bleiben erhalten. Mit dem kostenlosen Plan kannst du jederzeit weiterlernen, nur mit weniger Umfang.</p>
</td>
</tr>

<tr><td style="padding:28px 40px 0 40px;"><div style="border-top:1px solid #E4DFD2;line-height:1px;font-size:1px;">&nbsp;</div></td></tr>

<tr>
<td align="center" style="padding:24px 40px 36px 40px;">
<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#8A8172;">Magst du uns sagen, woran es lag? Antworte einfach auf diese E-Mail, wir lesen jede Antwort.</p>
</td>
</tr>

</table>

<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
<tr>
<td align="center" style="padding:24px 20px;">
<p style="margin:0 0 6px 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:bold;letter-spacing:1px;color:#8A8172;">© 2026 StudeArc</p>
<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#8A8172;">Enes Yazici, [Straße Hausnummer], [PLZ Ort]</p>
</td>
</tr>
</table>

</td>
</tr>
</table>

</body>
</html>`;

  const text = `Schade, dass du gehst${greetingName}.

Deine StudeArc Pro Mitgliedschaft wurde ordentlich zum Ende der aktuellen Abrechnungsperiode gekündigt.

Plan: StudeArc Pro
Gekündigt am: ${receivedAt} Uhr
Zugang bis: ${endsAt}

Dein Fortschritt, deine Karten und dein Lernverlauf bleiben erhalten. Mit dem kostenlosen Plan kannst du jederzeit weiterlernen.

Mitgliedschaft fortsetzen: https://www.studearc.com/ (Einstellungen -> Abonnement)

Magst du uns sagen, woran es lag? Antworte einfach auf diese E-Mail.

StudeArc`;

  return { html, text };
}

module.exports = { buildCancellationEmail };
