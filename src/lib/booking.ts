// Client-Helfer für die VERBINDLICHE Season-2-Buchung (Landingpage /season2).
// Läuft über den bestehenden Endpunkt /api/signup?action=booking-…
import { apiFetch } from './api';

export type PackageId = 'one' | 'two';
export type BookingStatus = 'pending' | 'paid' | 'cancelled';

export interface BookingPublicConfig {
  visible: boolean; // false = noch nicht veröffentlicht (nur seasonLabel/startInfo kommen mit)
  published: boolean;
  preview: boolean; // sichtbar, aber (noch) nicht öffentlich – Vorab-Link oder Admin
  preregOnly: boolean; // nur Vorregistrierte dürfen buchen
  open: boolean;
  canBook: boolean; // freigeschaltet – oder Testmodus für eingeloggte Admins
  testMode: boolean;
  seasonLabel: string;
  startInfo: string;
  openAt: string;
  earlyBirdUntil: string; // ISO, '' = Stichtag noch nicht festgelegt
  earlyBirdActive: boolean;
  deadlineBasis: 'booking' | 'payment';
  prices: { one: number; two: number; twoEarly: number }; // Cent
  minSquad: number;
  maxSquad: number;
  termsVersion: string;
  terms: string;
  rules: string;
  bindingNotice: string;
  termsCheckbox: string;
  jerseyCheckbox: string;
  turnstileSiteKey: string;
}

export interface BookingSummary {
  ref: string;
  status: BookingStatus;
  teamName: string;
  package: PackageId;
  priceCents: number;
  earlyBird: boolean;
  createdAt: string;
  paidAt: string | null;
  payLink: string;
  packageLabel: string;
}

export interface Prereg {
  entry: 'team' | 'player';
  teamName: string;
  contactName: string;
  phone: string;
  squadSize?: number | null;
  since?: string;
  captain?: boolean; // Captain aus Season 1
}

export interface RosterRow {
  firstName: string;
  lastName: string;
  number: number | null;
  captain: boolean;
  keeper: boolean;
}

export interface BookingPayload {
  token: string;
  teamName: string;
  contactName: string;
  phone: string;
  package: PackageId;
  roster: RosterRow[];
  logo?: string; // Data-URL (Bild oder PDF)
  note?: string;
  acceptJersey: boolean;
  acceptRules: boolean;
  acceptTerms: boolean;
}

export interface BookingAdminRow {
  id: string;
  ref: string;
  email: string;
  status: BookingStatus;
  teamName: string;
  contactName: string;
  phone: string;
  package: PackageId;
  priceCents: number;
  earlyBird: boolean;
  roster: RosterRow[];
  logoUrl: string;
  consents: {
    acceptedAt?: string;
    termsVersion?: string;
    termsText?: string;
    termsCheckbox?: string;
    jerseyCheckbox?: string;
    bindingNotice?: string;
    ip?: string;
    userAgent?: string;
    testMode?: boolean;
  };
  note: string;
  createdAt: string;
  paidAt: string | null;
  teamId: string;
  transferredAt: string | null;
}

export interface BookingInvitee {
  email: string;
  name: string;
  teamName: string;
  source: 'team' | 'player' | 'captain';
  createdAt: string | null;
  invitedAt: string | null;
  booking: BookingStatus | null;
}

export interface BookingAdminConfig {
  published: boolean;
  open: boolean;
  preregOnly: boolean;
  accessKey: string;
  seasonLabel: string;
  startInfo: string;
  openAt: string;
  earlyBirdDays: number;
  deadlineBasis: 'booking' | 'payment';
  priceOne: number;
  priceTwo: number;
  priceTwoEarly: number;
  payLinkOne: string;
  payLinkTwo: string;
  payLinkTwoEarly: string;
  minSquad: number;
  maxSquad: number;
  termsVersion: string;
  terms: string;
  rules: string;
}

// Vorab-Zugang (/season2?zugang=…) – wird bei jedem Aufruf mitgeschickt.
let accessKey = '';
export function setAccessKey(k: string) {
  accessKey = k;
}
const url = (action: string) => `/api/signup?action=${action}${accessKey ? `&key=${encodeURIComponent(accessKey)}` : ''}`;
const post = <T,>(action: string, body: unknown) => apiFetch<T>(url(action), { method: 'POST', body: JSON.stringify(body) });

export const fetchBookingConfig = () => apiFetch<BookingPublicConfig>(url('booking-config'));
export const requestBookingCode = (body: { email: string; website?: string; turnstileToken?: string }) =>
  post<{ ok: boolean; devCode?: string }>('booking-request-code', body);
export const verifyBookingCode = (email: string, code: string) =>
  post<{ ok: boolean; token: string; email: string; prereg: Prereg | null; booking: BookingSummary | null }>('booking-verify', { email, code });
export const submitBooking = (body: BookingPayload) =>
  post<{ ok: boolean; booking: BookingSummary | null; reference: string }>('booking-submit', body);

export const bookingAdminList = () => apiFetch<BookingAdminRow[]>('/api/signup?action=admin-bookings');
export const bookingAdminStatus = (id: string, status: BookingStatus, notify = true) =>
  post<{ ok: boolean }>('admin-booking-status', { id, status, notify });
export const bookingAdminConfig = () => apiFetch<BookingAdminConfig>('/api/signup?action=admin-booking-config');
export const bookingAdminSaveConfig = (cfg: BookingAdminConfig & { newKey?: boolean }) => post<BookingAdminConfig>('admin-booking-config', cfg);
export const bookingAdminDelete = (id: string) => post<{ ok: boolean }>('admin-booking-delete', { id });
export const bookingAdminTransfer = (id: string, teamId: string) => post<{ ok: boolean }>('admin-booking-transfer', { id, teamId });
export const bookingAdminInvitees = () => apiFetch<BookingInvitee[]>('/api/signup?action=admin-booking-invites');
export const bookingAdminInvite = (emails: string[]) => post<{ ok: boolean; sent: string[]; failed: string[] }>('admin-booking-invite', { emails });

// --- Anzeige-Helfer ---------------------------------------------------------
export const euro = (cents: number) =>
  `${(cents / 100).toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`;

// „Mo., 26. Oktober 2026, 23:59 Uhr" (deutsche Zeit).
export function formatDeadline(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  const date = d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Berlin' });
  const time = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
  return `${date}, ${time} Uhr`;
}

// Bild verkleinern (max. 1200 px, Transparenz bleibt) bzw. PDF unverändert → Data-URL.
export async function logoToDataUrl(file: File): Promise<string> {
  const readAsDataUrl = (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(new Error('Datei konnte nicht gelesen werden.'));
      r.readAsDataURL(blob);
    });
  if (file.type === 'application/pdf') {
    if (file.size > 3 * 1024 * 1024) throw new Error('Das PDF ist zu groß (max. 3 MB).');
    return readAsDataUrl(file);
  }
  if (!/^image\/(png|jpe?g|webp|gif|svg\+xml|heic|heif)$/i.test(file.type)) throw new Error('Bitte ein Bild (PNG, JPG, WebP) oder ein PDF wählen.');
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 1200 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bmp.width * k));
    c.height = Math.max(1, Math.round(bmp.height * k));
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    let out = c.toDataURL('image/webp', 0.92);
    if (!out.startsWith('data:image/webp')) out = c.toDataURL('image/png');
    return out;
  } catch {
    if (file.size > 3 * 1024 * 1024 || !/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
      throw new Error('Das Bild konnte nicht verarbeitet werden. Bitte als PNG oder JPG (max. 3 MB).');
    }
    return readAsDataUrl(file);
  }
}
