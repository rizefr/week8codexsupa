import { useEffect, useRef } from "react";

type WakeLockSentinelLike = { release: () => Promise<void>; released?: boolean };

/**
 * Keeps the screen on while `active` (Screen Wake Lock API). iOS Safari supports
 * it from 16.4; Home Screen web apps from iOS 18.4. Silently does nothing elsewhere.
 * The lock drops when the page is hidden, so it is re-requested on return.
 */
export function useWakeLock(active: boolean) {
  const sentinel = useRef<WakeLockSentinelLike | null>(null);
  useEffect(() => {
    const nav = navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> } };
    if (!active || !nav.wakeLock) return;
    let cancelled = false;
    const request = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const lock = await nav.wakeLock!.request("screen");
        if (cancelled) {
          void lock.release();
          return;
        }
        sentinel.current = lock;
      } catch {
        // Denied (low battery mode, unsupported context). The app still works.
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible" && (!sentinel.current || sentinel.current.released)) void request();
    };
    void request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel.current?.release().catch(() => undefined);
      sentinel.current = null;
    };
  }, [active]);
}
