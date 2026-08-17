import { importPKCS8, SignJWT } from 'jose';

// ===========================================================================
// Google-Sheets-Anbindung (nur Server). Authentifizierung über einen Google-
// Service-Account (Roboter-Konto). Zugangsdaten kommen ausschließlich aus den
// Vercel-Umgebungsvariablen – niemals aus dem Frontend.
//   GOOGLE_SA_EMAIL         – client_email des Service-Accounts
//   GOOGLE_SA_PRIVATE_KEY   – private_key (PEM, mit \n)
//   GOOGLE_SHEET_ID         – ID des Ziel-Spreadsheets
// ===========================================================================

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

let cachedToken: { token: string; exp: number } | null = null;

function creds(): { email: string; privateKey: string; sheetId: string } {
  const email = process.env.GOOGLE_SA_EMAIL;
  const rawKey = process.env.GOOGLE_SA_PRIVATE_KEY;
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!email || !rawKey || !sheetId) {
    throw new Error(
      'Google-Zugang fehlt. Bitte GOOGLE_SA_EMAIL, GOOGLE_SA_PRIVATE_KEY und GOOGLE_SHEET_ID in Vercel setzen (auch für Preview).'
    );
  }
  // Umschließende Anführungszeichen entfernen und \n in echte Zeilenumbrüche wandeln.
  const privateKey = rawKey.replace(/^"|"$/g, '').replace(/\\n/g, '\n');
  return { email, privateKey, sheetId };
}

export function sheetId(): string {
  return creds().sheetId;
}

// Access-Token holen (mit kleinem Cache, ~1 h gültig).
export async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.token;

  const { email, privateKey } = creds();
  let key;
  try {
    key = await importPKCS8(privateKey, 'RS256');
  } catch {
    throw new Error('GOOGLE_SA_PRIVATE_KEY ist kein gültiger Schlüssel (kompletten BEGIN…END-Block einfügen).');
  }
  const assertion = await new SignJWT({ scope: SCOPE })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(email)
    .setSubject(email)
    .setAudience(TOKEN_URL)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error('Google-Login fehlgeschlagen: ' + t.slice(0, 240));
  }
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error('Google-Login lieferte kein Token.');
  cachedToken = { token: data.access_token, exp: now + (data.expires_in || 3600) };
  return cachedToken.token;
}

// Verbindungstest: Titel + Blattnamen des Spreadsheets lesen (schreibt nichts).
export async function sheetInfo(): Promise<{ title: string; sheets: string[] }> {
  const token = await getAccessToken();
  const id = sheetId();
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=properties.title,sheets.properties.title`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) {
    const t = await res.text();
    if (res.status === 403)
      throw new Error('Kein Zugriff: Sheet mit der Service-Account-E-Mail als „Bearbeiter" teilen. (' + t.slice(0, 160) + ')');
    if (res.status === 404) throw new Error('Sheet nicht gefunden – GOOGLE_SHEET_ID prüfen.');
    throw new Error('Sheet-Zugriff fehlgeschlagen: ' + t.slice(0, 200));
  }
  const data = (await res.json()) as {
    properties?: { title?: string };
    sheets?: { properties?: { title?: string } }[];
  };
  return {
    title: data.properties?.title ?? '',
    sheets: (data.sheets ?? []).map((s) => s.properties?.title ?? '').filter(Boolean),
  };
}
