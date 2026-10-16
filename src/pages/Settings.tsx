import { FormEvent, useState } from "react";
import { AppData, AppPreferences } from "../types";
import { todayISO } from "../lib/date";
import { sendMagicLink, signOutCloud } from "../lib/cloud";
import { createLocalBackup, getLocalBackups, LocalBackup } from "../lib/storage";
import { getGamificationSettings } from "../lib/gamification";
import { playRestTimerAlarm, primeRestTimerAudio } from "../components/RestTimer";
import { AppContext } from "../ui/context";
import { Card, PageHeader, SectionHeader, Segmented } from "../ui/core";
import { syncText } from "../ui/SyncPill";

export function SettingsPage({ ctx, onRepairGamification, onImport, onLoadDevSample }: { ctx: AppContext; onRepairGamification: () => void; onImport: (data: AppData) => void; onLoadDevSample: () => void }) {
  const { data, cloudStatus } = ctx;
  const settings = data.settings;
  const prefs = settings.preferences ?? {};
  const game = getGamificationSettings(settings);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [backups, setBackups] = useState<LocalBackup[]>(() => getLocalBackups());
  const [importPending, setImportPending] = useState<AppData | null>(null);
  const isLocalDev = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

  const savePrefs = (patch: Partial<AppPreferences>) => ctx.saveSettings({ ...settings, preferences: { ...prefs, ...patch } });
  const saveGame = (patch: Partial<typeof game>) => ctx.saveSettings({ ...settings, gamification: { ...game, ...patch } });

  const requestLink = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await sendMagicLink(email);
      setMessage("Magic link sent. Open it on this iPhone to sign in.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not send the magic link.");
    } finally {
      setBusy(false);
      ctx.refreshCloudStatus();
    }
  };

  const download = (payload: unknown, filename: string) => {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const readImport = async (file?: File) => {
    if (!file) return;
    try {
      const imported = JSON.parse(await file.text()) as AppData;
      if (!imported.settings || !Array.isArray(imported.workoutLogs) || !Array.isArray(imported.bodyWeights)) throw new Error("That file isn't a Cycle Tracker backup.");
      setImportPending(imported);
      setMessage(`Backup has ${imported.workoutLogs.length} workouts and ${imported.bodyWeights.length} weigh-ins. Confirm below to replace this device's data.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not read the backup.");
    }
  };

  const sync = syncText(ctx.saveState, false, cloudStatus);

  return (
    <div className="page">
      <PageHeader title="Settings" />

      <Card>
        <SectionHeader eyebrow="During workouts" title="Workout" />
        <label className="toggle-row">
          <div><strong>Keep screen awake</strong><span>Stops the phone sleeping mid-workout so the rest chime can play. Needs iOS 16.4+ (iOS 18.4+ when installed to Home Screen).</span></div>
          <input className="switch" type="checkbox" checked={prefs.keepAwake !== false} onChange={(event) => savePrefs({ keepAwake: event.target.checked })} />
        </label>
        <div className="toggle-row">
          <div><strong>Rest chime</strong><span>Plays when rest ends while the app is open. iPhone can't play sounds from a locked web app.</span></div>
          <Segmented label="Rest chime count" value={String(prefs.restChimes ?? -1)} onChange={(value) => savePrefs({ restChimes: Number(value) })} options={[{ value: "0", label: "Off" }, { value: "3", label: "3×" }, { value: "-1", label: "Until dismissed" }]} />
        </div>
        <button type="button" className="btn btn--secondary btn--sm" onClick={() => { primeRestTimerAudio(); playRestTimerAlarm(); }}>Test chime</button>
      </Card>

      <Card>
        <SectionHeader eyebrow="Motivation" title="XP, badges and celebrations" />
        <label className="toggle-row">
          <div><strong>Show XP and badges</strong><span>Turn off for a plain training log. Nothing is deleted.</span></div>
          <input className="switch" type="checkbox" checked={game.enabled} onChange={(event) => saveGame({ enabled: event.target.checked })} />
        </label>
        <label className="toggle-row">
          <div><strong>Celebrations</strong><span>Toasts and confetti for PRs, badges and level-ups.</span></div>
          <input className="switch" type="checkbox" checked={game.showCelebrations} onChange={(event) => saveGame({ showCelebrations: event.target.checked })} />
        </label>
      </Card>

      {!standalone && (
        <Card className="card--hero">
          <SectionHeader eyebrow="iPhone" title="Install on your Home Screen" detail="Opens full-screen like an app and loads offline at the gym." />
          <ol className="evidence-list muted">
            <li>Open this site in Safari.</li>
            <li>Tap the Share button, then <b>Add to Home Screen</b>.</li>
            <li>Launch Cycle Tracker from the new icon. Sign in to cloud sync once inside the installed app.</li>
          </ol>
        </Card>
      )}

      <Card>
        <SectionHeader eyebrow="Cloud sync" title={cloudStatus.signedIn ? "Signed in" : "Back up to the cloud"} detail={cloudStatus.signedIn ? `${cloudStatus.email ?? "Your account"} · ${sync.label}${cloudStatus.lastSyncAt ? ` · last sync ${new Date(cloudStatus.lastSyncAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}` : ""}` : "Sign in to keep the same logs on your phone and computer. Logs already on this device merge in after sign-in."} />
        {!cloudStatus.configured ? (
          <p className="muted small">Cloud sync isn't configured in this build.</p>
        ) : cloudStatus.signedIn ? (
          <div className="row row--wrap">
            <button type="button" className="btn btn--primary btn--sm" onClick={ctx.retrySync}>Sync now</button>
            <button type="button" className="btn btn--secondary btn--sm" disabled={busy} onClick={async () => { setBusy(true); await signOutCloud(); setBusy(false); setMessage("Signed out on this device."); ctx.refreshCloudStatus(); }}>Sign out</button>
          </div>
        ) : (
          <form className="stack" onSubmit={requestLink}>
            <label className="field">Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" required /></label>
            <button type="submit" className="btn btn--primary" disabled={busy}>{busy ? "Sending…" : "Email me a sign-in link"}</button>
          </form>
        )}
        {(message || cloudStatus.lastError) && <p className="small" style={{ marginTop: 10, color: "var(--text-2)" }}>{message || cloudStatus.lastError}</p>}
        {importPending && (
          <div className="row row--wrap" style={{ marginTop: 10 }}>
            <button type="button" className="btn btn--danger btn--sm" onClick={() => { onImport(importPending); setImportPending(null); setMessage("Backup imported. A safety snapshot of the previous data was saved first."); setBackups(getLocalBackups()); }}>Replace with backup</button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => { setImportPending(null); setMessage(""); }}>Cancel</button>
          </div>
        )}
      </Card>

      <Card>
        <SectionHeader eyebrow="Your data" title="Backup & restore" detail={backups[0] ? `Last snapshot ${new Date(backups[0].createdAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })} · ${backups.length} kept` : "No local snapshot yet."} />
        <div className="row row--wrap">
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => { const backup = createLocalBackup(data, "manual"); setBackups(getLocalBackups()); setMessage(backup ? "Snapshot saved on this device." : "Snapshot failed. Export JSON instead."); }}>Save snapshot</button>
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => download(data, `cycle-tracker-${todayISO()}.json`)}>Export JSON</button>
          <label className="btn btn--secondary btn--sm" style={{ position: "relative", overflow: "hidden" }}>
            Import JSON
            <input type="file" accept="application/json" style={{ position: "absolute", inset: 0, opacity: 0 }} onChange={(event) => readImport(event.target.files?.[0])} />
          </label>
        </div>
      </Card>

      <Card>
        <SectionHeader eyebrow="Advanced" title="Maintenance" />
        <div className="row row--wrap">
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => { onRepairGamification(); setBackups(getLocalBackups()); setMessage("Badges re-checked against your logs."); }}>Re-check badges</button>
          {isLocalDev && <button type="button" className="btn btn--secondary btn--sm" onClick={onLoadDevSample}>Load sample data (local only)</button>}
        </div>
        <p className="faint small" style={{ marginTop: 10 }}>Cornell upper-priority plan v3 · older logs retain their original plan. History is never rewritten.</p>
      </Card>
    </div>
  );
}
