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
  if (!pushSupported()) throw new Error('Dieser Browser unterstützt keine Push-Benachrichtigungen.');
  const reg = await navigator.serviceWorker.ready;
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Benachrichtigungen wurden nicht erlaubt.');
  const { key } = await getPushKey();
  if (!key) throw new Error('Push ist serverseitig noch nicht eingerichtet (VAPID-Schlüssel fehlen).');
  const existing = await reg.pushManager.getSubscription();
  const sub =
    existing ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(key) }));
  await savePushSubscription(sub.toJSON());
}

export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await removePushSubscription(sub.endpoint);
    await sub.unsubscribe();
  }
}
