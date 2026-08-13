import { useEffect, useState } from 'react';
import { Bell, BellOff, Loader2, Check, Send } from 'lucide-react';
import type { SessionUser } from '../types';
import {
  pushSupported,
  pushIntended,
  pushDebug,
  syncPush,
  enablePush,
  disablePush,
  sendTestPush,
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
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState('');
  const [diag, setDiag] = useState<Awaited<ReturnType<typeof pushDebug>> | null>(null);
  const isBootstrap = user.id === 'bootstrap';

  // Sichtbarer Ist-Zustand (Erlaubnis / Abo / gemerkt) – zeigt nach einem
  // Neustart, was verloren ging, und hilft beim gezielten Nachbessern.
  useEffect(() => {
    pushDebug().then(setDiag).catch(() => {});
  }, [enabled, busy, testing]);

  const runTest = async () => {
    setTesting(true);
    setTestMsg('');
    try {
      const r = await sendTestPush();
      if (!r.configured) {
        setTestMsg('⚠️ Push ist auf dem Server nicht eingerichtet (VAPID-Schlüssel fehlen).');
      } else if (r.devices === 0) {
        setTestMsg('⚠️ Kein angemeldetes Gerät gefunden. Bitte oben Push aus- und wieder einschalten, dann erneut testen.');
      } else if (r.sent > 0) {
        setTestMsg(
          `✅ Test an ${r.devices} Gerät(e) gesendet – die Benachrichtigung sollte gleich erscheinen. Kommt nichts an, in den Handy-Einstellungen die Benachrichtigungen für diese App erlauben.`
        );
      } else {
        setTestMsg(`⚠️ Zustellung an ${r.devices} Gerät(e) fehlgeschlagen (${r.failed}). Bitte Push aus- und wieder einschalten.`);
      }
    } catch (err) {
      setTestMsg(err instanceof Error ? err.message : 'Test fehlgeschlagen.');
    } finally {
      setTesting(false);
    }
  };

  useEffect(() => {
    // Beim Öffnen den echten Zustand ermitteln UND ein evtl. vom Browser
    // verworfenes Abo automatisch wiederherstellen (wenn zuvor gewünscht).
    syncPush().then(setEnabled).catch(() => {});
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

        {/* Test: prüft sofort, ob wirklich eine Benachrichtigung ankommt. */}
        {supported && !isBootstrap && (
          <div className="mt-3">
            <button
              onClick={runTest}
              disabled={testing}
              className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer disabled:opacity-50 flex items-center gap-2 border border-white/15 bg-white/[.04] text-hl-soft hover:text-white transition-colors"
            >
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Test-Benachrichtigung senden
            </button>
            {testMsg && <p className="text-xs text-hl-soft font-sans mt-2 leading-snug">{testMsg}</p>}
          </div>
        )}

        {/* Sichtbarer Status – hilft zu sehen, was nach einem Neustart fehlt. */}
        {supported && diag && (
          <p className="text-[11px] text-hl-mute font-mono mt-3 leading-relaxed">
            Status: Erlaubnis{' '}
            <strong className={diag.permission === 'granted' ? 'text-emerald-400' : 'text-amber-400'}>
              {diag.permission === 'granted' ? 'erteilt ✓' : diag.permission === 'denied' ? 'blockiert ✗' : 'noch offen'}
            </strong>{' '}
            · Abo{' '}
            <strong className={diag.hasSubscription ? 'text-emerald-400' : 'text-amber-400'}>
              {diag.hasSubscription ? 'aktiv ✓' : 'nicht aktiv ✗'}
            </strong>{' '}
            · gemerkt{' '}
            <strong className={diag.intended ? 'text-emerald-400' : 'text-amber-400'}>
              {diag.intended ? 'ja ✓' : 'nein ✗'}
            </strong>
            {!diag.standalone && <span className="text-hl-faint"> · (im Browser geöffnet, nicht als installierte App)</span>}
          </p>
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
