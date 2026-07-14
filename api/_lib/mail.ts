// Versand des Login-Codes per E-Mail über Resend (https://resend.com).
// Ohne RESEND_API_KEY wird nichts verschickt – der Code landet dann im Server-Log
// (und in Preview/Dev zusätzlich in der API-Antwort, siehe auth/[action].ts),
// damit der Flow auch ohne fertiges Mail-Setup testbar ist.

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export function isMailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function sendLoginCode(email: string, code: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM || 'Hero League <login@hero-league.de>';

  if (!apiKey) {
    console.log(`[Mail nicht konfiguriert] Login-Code für ${email}: ${code}`);
    return;
  }

  const safeCode = escapeHtml(code);
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0b0f0b">
      <h2 style="margin:0 0 8px;font-size:20px">Dein Login-Code</h2>
      <p style="margin:0 0 16px;color:#444;font-size:14px">Melde dich im Hero-League-Backoffice mit diesem Code an:</p>
      <div style="font-size:34px;font-weight:800;letter-spacing:8px;background:#f2f5f4;border-radius:12px;padding:16px;text-align:center">${safeCode}</div>
      <p style="margin:16px 0 0;color:#777;font-size:12px">Der Code ist 10 Minuten gültig. Wenn du das nicht warst, ignoriere diese E-Mail.</p>
    </div>`;
  const text = `Dein Login-Code für Hero League: ${code}\nGültig für 10 Minuten. Wenn du das nicht warst, ignoriere diese E-Mail.`;

  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: 'Dein Login-Code für Hero League',
      html,
      text,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.error('Resend-Mailversand fehlgeschlagen:', res.status, detail);
    throw new Error('E-Mail konnte nicht gesendet werden.');
  }
}
