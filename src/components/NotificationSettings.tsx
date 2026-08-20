import { useEffect, useState } from 'react';
import { Bell, BellOff, Loader2, Check, Send, AlertTriangle } from 'lucide-react';
import type { SessionUser } from '../types';
import { apiFetch } from '../lib/api';
import {
  pushSupported,
  pushIntended,
  syncPush,
  enablePush,
  disablePush,
  getNotifyPrefs,
  setNotifyPrefs,
} from '../lib/push';

export default function NotificationSettings({ user }: { user: SessionUser }) {
  const [supported] = useState(pushSupported());
  // Gemerkte Wahl sofort anzeigen (persistiert lokal); syncPush korrigiert danach.
  const [enabled, setEnabled] = useState(() => pushIntended());
  const [busy, setBusy] = useState(false);
  const [muteWeekends, setMuteWeekends] = useState(false);
  const [muteUntil, setMuteUntil] = useState('');
  const [savedOk, setSavedOk] = useState(false);
  const [serverStatus, setServerStatus] = useState<{ canSend: boolean; subscriptions: number } | null>(null);
  const [testMsg, setTestMsg] = useState('');
  const isBootstrap = user.id === 'bootstrap';

  useEffect(() => {
    // Beim Öffnen den echten Zustand ermitteln UND ein evtl. vom Browser
    // verworfenes Abo automatisch wiederherstellen (wenn zuvor gewünscht).
    syncPush().then(setEnabled).catch(() => {});
    // Server-Diagnose: Kann überhaupt gesendet werden (VAPID gesetzt)?
    apiFetch<{ canSend: boolean; subscriptions: number }>('/api/push?resource=status')
      .then(setServerStatus)
      .catch(() => {});
    if (!isBootstrap) {
      getNotifyPrefs()
        .then((p) => {
          setMuteWeekends(!!p.muteWeekends);
          setMuteUntil(p.muteUntil ?? '');
        })
        .catch(() => {});
    }
  }, [isBootstrap]);

  const togglePush = async () => {
    setBusy(true);
    try {
      if (enabled) {
        await disablePush();
        setEnabled(false);
      } else {
        await enablePush();
        setEnabled(true);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Push konnte nicht geändert werden.');
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    setBusy(true);
    setTestMsg('');
    try {
      const r = await apiFetch<{ configured: boolean; subscriptions: number; sent: number; error?: string }>(
        '/api/push?resource=test',
        { method: 'POST' }
      );
      if (!r.configured) setTestMsg('⚠️ Der Server kann noch nicht senden (VAPID-Schlüssel fehlen in Vercel).');
      else if (r.subscriptions === 0) setTestMsg('Kein Gerät registriert – bitte oben „Push aktivieren" tippen und erneut testen.');
      else if (r.sent > 0 && !r.error) setTestMsg('✅ Gesendet – die Test-Meldung müsste gleich ankommen.');
      else if (r.error && /\b(410|404)\b/.test(r.error))
        setTestMsg(
          'Die Push-Anmeldung dieses Geräts war veraltet und wurde entfernt. Bitte oben „Push deaktivieren", dann „Push aktivieren" (die App erneuert die Anmeldung jetzt automatisch) und noch einmal testen.'
        );
      else setTestMsg(`Senden fehlgeschlagen (${r.error ?? 'unbekannt'}). Bitte die VAPID-Schlüssel prüfen.`);
    } catch (err) {
      setTestMsg(err instanceof Error ? err.message : 'Test fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  const savePrefs = async () => {
    setBusy(true);
    try {
      await setNotifyPrefs({ muteWeekends, muteUntil: muteUntil || null });
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2500);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-lg space-y-6">
      {/* Push auf diesem Gerät */}
      <div>
        <h4 className="font-display font-bold text-white uppercase tracking-tight mb-1">Handy-Benachrichtigungen</h4>
        <p className="text-xs text-hl-mute font-sans mb-3">
          Erhalte Push-Nachrichten auf dieses Gerät – bei Chat-Nachrichten in deinen Gruppen, Erwähnungen und Zuweisungen.
          {' '}Am besten die <strong className="text-hl-soft">App installieren</strong> (Zum Home-Bildschirm hinzufügen), dann klappt auch die Zahl am App-Icon.
        </p>
        {serverStatus && !serverStatus.canSend && (
          <div className="flex items-start gap-2 mb-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Der Server kann aktuell <strong>keine</strong> Benachrichtigungen versenden – die VAPID-Schlüssel fehlen
              in Vercel (<code>VAPID_PUBLIC_KEY</code> / <code>VAPID_PRIVATE_KEY</code>). Bis die gesetzt sind, kommt
              trotz „aktiv" nichts an.
            </span>
          </div>
        )}
        {!supported ? (
          <p className="text-sm text-hl-faint">Dieser Browser unterstützt keine Push-Benachrichtigungen.</p>
        ) : (
          <button
            onClick={togglePush}
            disabled={busy}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer disabled:opacity-50 flex items-center gap-2 border transition-colors ${
              enabled
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                : 'bg-brand-accent-light hover:bg-brand-accent text-white border-transparent'
            }`}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : enabled ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
            {enabled ? 'Push auf diesem Gerät deaktivieren' : 'Push auf diesem Gerät aktivieren'}
          </button>
        )}
        {supported && (
          <div className="mt-3">
            <button
              onClick={sendTest}
              disabled={busy}
              className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider border border-white/15 bg-white/5 hover:bg-white/10 text-hl-soft cursor-pointer disabled:opacity-50 flex items-center gap-2"
            >
              <Send className="w-4 h-4" /> Test-Benachrichtigung an mich senden
            </button>
            {testMsg && <p className="mt-2 text-xs text-hl-soft font-sans">{testMsg}</p>}
          </div>
        )}
      </div>

      {/* Nicht stören */}
      <div className="border-t border-white/5 pt-5">
        <h4 className="font-display font-bold text-white uppercase tracking-tight mb-1">Nicht stören</h4>
        <p className="text-xs text-hl-mute font-sans mb-3">Pausiert die Push-Nachrichten (z.B. Wochenende oder Urlaub). Im Backoffice siehst du trotzdem alles.</p>
        {isBootstrap ? (
          <p className="text-sm text-hl-faint">Mit einem echten Account (E-Mail-Login) einstellbar.</p>
        ) : (
          <>
            <label className="flex items-center gap-2.5 mb-3 cursor-pointer">
              <input type="checkbox" checked={muteWeekends} onChange={(e) => setMuteWeekends(e.target.checked)} className="w-4 h-4 accent-brand-accent-light" />
              <span className="text-sm text-hl-soft font-sans">Am Wochenende (Sa/So) keine Push-Nachrichten</span>
            </label>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-sm text-hl-soft font-sans">Pausieren bis:</span>
              <input type="date" value={muteUntil} onChange={(e) => setMuteUntil(e.target.value)} className="bg-[#060E0F] border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-brand-accent-light" />
              {muteUntil && (
                <button onClick={() => setMuteUntil('')} className="text-xs text-hl-mute hover:text-white cursor-pointer">
                  zurücksetzen
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button onClick={savePrefs} disabled={busy} className="px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-brand-accent-light hover:bg-brand-accent text-white cursor-pointer disabled:opacity-50">
                Speichern
              </button>
              {savedOk && (
                <span className="text-xs text-emerald-400 font-sans flex items-center gap-1">
                  <Check className="w-4 h-4" /> Gespeichert
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
