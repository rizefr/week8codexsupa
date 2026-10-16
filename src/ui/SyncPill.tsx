import { getCloudStatus } from "../lib/cloud";
import { SaveState } from "./context";
import { cx } from "./core";

export function syncText(saveState: SaveState, loading: boolean, cloudStatus: ReturnType<typeof getCloudStatus>): { label: string; tone: "cloud" | "local" | "issue" | "saving" } {
  if (loading) return { label: "Loading", tone: "saving" };
  if (saveState === "saving") return { label: "Saving…", tone: "saving" };
  if (saveState === "syncIssue" || cloudStatus.pendingSync || cloudStatus.lastError) return { label: "Sync issue · retry", tone: "issue" };
  if (saveState === "offline" || !cloudStatus.online) return { label: "Offline · saved on device", tone: "local" };
  if (cloudStatus.signedIn && cloudStatus.lastSyncAt) return { label: "Cloud sync confirmed", tone: "cloud" };
  if (cloudStatus.signedIn) return { label: "Signed in · sync unconfirmed", tone: "local" };
  return { label: "Saved on this device", tone: "local" };
}

export function SyncPill({ saveState, loading, cloudStatus, onRetry }: { saveState: SaveState; loading: boolean; cloudStatus: ReturnType<typeof getCloudStatus>; onRetry: () => void }) {
  const { label, tone } = syncText(saveState, loading, cloudStatus);
  const actionable = tone === "issue";
  return (
    <button type="button" className="sync-pill" onClick={actionable ? onRetry : undefined} disabled={!actionable && false} title={cloudStatus.lastError || undefined} aria-label={`Sync status: ${label}`}>
      <span className={cx("sync-dot", `is-${tone}`)} />
      {label}
    </button>
  );
}
