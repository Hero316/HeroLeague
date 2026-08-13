// Client-Seite für Web-Push (Handy-Benachrichtigungen) + Einstellungen.
import { apiFetch } from './api';

export const getPushKey = () => apiFetch<{ key: string }>('/api/push?resource=key');
export const savePushSubscription = (subscription: unknown) =>
  apiFetch('/api/push', { method: 'POST', body: JSON.stringify({ subscription }) });
export const removePushSubscription = (endpoint: string) =>
  apiFetch('/api/push?resource=unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint }) });

export interface NotifyPrefs {
  muteWeekends?: boolean;
  muteUntil?: string | null;
}
export const getNotifyPrefs = () => apiFetch<NotifyPrefs>('/api/push?resource=prefs');
export const setNotifyPrefs = (prefs: NotifyPrefs) =>
  apiFetch<NotifyPrefs>('/api/push?resource=prefs', { method: 'POST', body: JSON.stringify(prefs) });

export interface TestPushResult {
  configured: boolean; // VAPID serverseitig eingerichtet?
  devices: number; // wie viele Geräte dieses Nutzers sind angemeldet
  sent: number; // erfolgreich zugestellt (an den Push-Dienst übergeben)
  failed: number;
}
// Sendet SOFORT eine Test-Benachrichtigung an alle Geräte des Nutzers.
export const sendTestPush = () => apiFetch<TestPushResult>('/api/push?resource=test', { method: 'POST' });

function urlB64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

// Wunsch des Nutzers pro Gerät merken ("ich will hier Push"). Browser verwerfen
// ein Push-Abo gelegentlich von selbst (z.B. nach längerer Zeit / Update) – dann
// wäre der Schalter nach dem Neustart wieder aus. Mit diesem Merker stellen wir
// das Abo beim App-Start automatisch wieder her (siehe syncPush).
const PUSH_INTENT_KEY = 'hl-push-intent';
function setPushIntent(on: boolean): void {
  try {
    if (on) localStorage.setItem(PUSH_INTENT_KEY, '1');
    else localStorage.removeItem(PUSH_INTENT_KEY);
  } catch {
    /* localStorage evtl. blockiert – dann eben nicht merken */
  }
}
export function pushIntended(): boolean {
  try {
    return localStorage.getItem(PUSH_INTENT_KEY) === '1';
  } catch {
    return false;
  }
}

function isIos(): boolean {
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}
function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

// Diagnose des aktuellen Push-Zustands auf diesem Gerät – für die sichtbare
// Status-Zeile in den Einstellungen. So sehen wir, was nach einem Neustart weg
// ist: die Browser-Erlaubnis, das Abo selbst, oder der gemerkte Wunsch.
export async function pushDebug(): Promise<{
  supported: boolean;
  permission: string; // 'granted' | 'denied' | 'default' | 'unsupported'
  hasSubscription: boolean;
  intended: boolean;
  standalone: boolean;
}> {
  const supported = pushSupported();
  const permission = typeof Notification !== 'undefined' ? Notification.permission : 'unsupported';
  let hasSubscription = false;
  if (supported) {
    try {
      const reg = await navigator.serviceWorker.ready;
      hasSubscription = !!(await reg.pushManager.getSubscription());
    } catch {
      /* egal */
    }
  }
  return { supported, permission, hasSubscription, intended: pushIntended(), standalone: isStandalone() };
}

export async function isPushEnabled(): Promise<boolean> {
  if (!pushSupported()) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    return !!(await reg.pushManager.getSubscription());
  } catch {
    return false;
  }
}

export async function enablePush(): Promise<void> {
  if (!pushSupported()) {
    if (isIos() && !isStandalone()) {
      throw new Error(
        'Auf dem iPhone gehen Benachrichtigungen nur in der installierten App: unten auf „Teilen" tippen → „Zum Home-Bildschirm", dann die App von dort öffnen und hier Benachrichtigungen erlauben.'
      );
    }
    throw new Error('Dieser Browser unterstützt keine Push-Benachrichtigungen.');
  }
  // Wurde es früher blockiert, fragt der Browser NICHT erneut – man muss es in
  // den Einstellungen wieder erlauben. Klare Anleitung geben.
  if (Notification.permission === 'denied') {
    throw new Error(
      isIos()
        ? 'Benachrichtigungen sind blockiert. iPhone: Einstellungen → Apps/Safari bzw. die installierte App „Hero League" → Benachrichtigungen erlauben. Danach hier erneut versuchen.'
        : 'Benachrichtigungen sind für diese Seite blockiert. Im Browser links neben der Adresse auf das Schloss/⋮ tippen → Website-Einstellungen → Benachrichtigungen auf „Erlauben" stellen, dann erneut versuchen.'
    );
  }
  const reg = await navigator.serviceWorker.ready;
  const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Benachrichtigungen wurden nicht erlaubt. Bitte beim Nachfragen auf „Erlauben" tippen.');
  // Wunsch SOFORT merken (bevor die Netz-Schritte kommen): Selbst wenn das
  // Speichern gleich scheitert, stellt syncPush() beim nächsten Start das Abo
  // automatisch wieder her – der Schalter „vergisst" nichts mehr.
  setPushIntent(true);
  const { key } = await getPushKey();
  if (!key) throw new Error('Push ist serverseitig noch nicht eingerichtet (VAPID-Schlüssel fehlen).');
  const existing = await reg.pushManager.getSubscription();
  const sub =
    existing ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(key) }));
  await savePushSubscription(sub.toJSON());
}

export async function disablePush(): Promise<void> {
  setPushIntent(false); // Wunsch zurücknehmen – zuerst, damit syncPush nicht gegenhält
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await removePushSubscription(sub.endpoint);
    await sub.unsubscribe();
  }
}

// Selbstheilung: Gleicht beim App-Start aufrufen (wenn angemeldet). Hat der
// Nutzer auf diesem Gerät Push gewollt (Merker gesetzt) und ist die Erlaubnis
// noch erteilt, aber das Abo vom Browser verworfen worden, wird es hier neu
// angelegt und serverseitig aufgefrischt. Gibt zurück, ob Push jetzt aktiv ist.
// Wirft NIE – rein best-effort.
export async function syncPush(): Promise<boolean> {
  if (!pushSupported()) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    // Besteht schon ein Abo, dieses IMMER serverseitig auffrischen (heilt vom
    // Server entfernte Zeilen) und den Wunsch-Merker setzen – sonst zeigt der
    // Schalter „an", der Server kennt das Gerät aber nicht mehr.
    if (sub) {
      try {
        await savePushSubscription(sub.toJSON());
      } catch {
        /* z.B. kurz nicht angemeldet – Abo bleibt lokal bestehen */
      }
      setPushIntent(true);
      return true;
    }
    // Kein Abo vorhanden: nur wiederherstellen, wenn gewünscht UND erlaubt.
    if (Notification.permission !== 'granted' || !pushIntended()) return false;
    const { key } = await getPushKey();
    if (!key) return false;
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(key) });
    try {
      await savePushSubscription(sub.toJSON());
    } catch {
      /* Abo bleibt lokal bestehen; nächster Start heilt nach */
    }
    return true;
  } catch {
    return false;
  }
}
