
import { google } from 'googleapis';

function getGmailClient() {
  const {
    GMAIL_USER,
    GMAIL_CLIENT_ID,
    GMAIL_CLIENT_SECRET,
    GMAIL_REFRESH_TOKEN,
  } = process.env;

  if (!GMAIL_USER || !GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) {
    return null;
  }

  const oAuth2Client = new google.auth.OAuth2(
    GMAIL_CLIENT_ID,
    GMAIL_CLIENT_SECRET,
    'https://developers.google.com/oauthplayground',
  );
p
  oAuth2Client.setCredentials({ refresh_token: GMAIL_REFRESH_TOKEN });

  return google.gmail({ version: 'v1', auth: oAuth2Client });
}

function buildRawEmail({
  from,
  to,
  subject,
  html,
}: {
  from: string;
  to: string;
  subject: string;
  html: string;
}) {
  const messageParts = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    '',
    html,
  ];

  const message = messageParts.join('\n');

  return Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function sendVerificationEmail({ to, code }: { to: string; code: string }) {
  console.log('🔵 sendVerificationEmail fue llamada con:', to);

  const gmail = getGmailClient();

  if (!gmail) {
    console.log(`\n[Scan n'eat] codigo de verificación para ${to}: ${code}\n`);
    return;
  }

  const html = `
    <div style="font-family: Arial, sans-serif;">
      <h2>Scan n'eat</h2>
      <p>Tu código de verificación es:</p>
      <h1 style="letter-spacing: 8px;">${code}</h1>
      <p>Este código expira en 10 minutos.</p>
      <p>Si no solicitaste este código, por favor ignóralo.</p>
    </div>
  `;

  const raw = buildRawEmail({
    from: `Scan n'eat <${process.env.GMAIL_USER}>`,
    to,
    subject: "Scan n'eat - Código de verificación",
    html,
  });

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw },
  });

  console.log(`✅ Email enviado correctamente a ${to}`);
}