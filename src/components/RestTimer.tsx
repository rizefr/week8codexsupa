import { useEffect, useRef, useState } from "react";

// Parses prescriptions like "2-3 min", "90 sec", "45-60 sec", or
// "60-90 sec after 4B" to seconds, using the upper bound of ranges.
export function parseRestSeconds(rest?: string): number {
  if (!rest) return 0;
  const match = rest.match(/(\d+)(?:\s*[-–]\s*(\d+))?\s*(min|sec)/i);
  if (!match) return 0;
  const upper = Number(match[2] ?? match[1]);
  if (!Number.isFinite(upper) || upper <= 0) return 0;
  return /min/i.test(match[3]) ? upper * 60 : upper;
}

export interface RestTimerState {
  endsAt: number;
  total: number;
  preset: number;
  exerciseName: string;
}

let restTimerAudioContext: AudioContext | null = null;

export const REST_TIMER_ALARM_PATTERN = [
  { frequency: 880, start: 0, duration: 0.22, gain: 0.30 },
  { frequency: 660, start: 0.28, duration: 0.22, gain: 0.28 },
  { frequency: 880, start: 0.56, duration: 0.22, gain: 0.32 },
  { frequency: 660, start: 0.84, duration: 0.34, gain: 0.30 },
] as const;

export const REST_TIMER_REPEAT_MS = 1800;

export function primeRestTimerAudio(): void {
  try {
    restTimerAudioContext ??= new AudioContext();
    void restTimerAudioContext.resume().catch(() => {});
  } catch {
    // Audio is optional; the visual timer and vibration still work.
  }
}

function playRestTimerAlarm(): void {
  try {
    restTimerAudioContext ??= new AudioContext();
    const context = restTimerAudioContext;
    void context.resume().catch(() => {});
    const start = context.currentTime;
    REST_TIMER_ALARM_PATTERN.forEach((pulse, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = index % 2 === 0 ? "triangle" : "sine";
      oscillator.frequency.value = pulse.frequency;
      gain.gain.setValueAtTime(0.0001, start + pulse.start);
      gain.gain.exponentialRampToValueAtTime(pulse.gain, start + pulse.start + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + pulse.start + pulse.duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start + pulse.start);
      oscillator.stop(start + pulse.start + pulse.duration + 0.02);
    });
  } catch {
    // Some mobile browsers block audio until a user gesture; stay silent.
  }
}

function formatClock(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export function RestTimer({
  timer,
  vibrateOnDone,
  soundOnDone,
  onAdjust,
  onReset,
  onToggleSound,
  onDismiss,
}: {
  timer: RestTimerState;
  vibrateOnDone: boolean;
  soundOnDone: boolean;
  onAdjust: (seconds: number) => void;
  onReset: () => void;
  onToggleSound: () => void;
  onDismiss: () => void;
}) {
  // The 1 Hz tick lives here so the logger tree doesn't re-render every second.
  const [now, setNow] = useState(() => Date.now());
  const [notificationStatus, setNotificationStatus] = useState("");
  const vibratedForRef = useRef<number | null>(null);
  const dismissButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 500);
    const refreshAfterBackground = () => setNow(Date.now());
    document.addEventListener("visibilitychange", refreshAfterBackground);
    window.addEventListener("pageshow", refreshAfterBackground);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshAfterBackground);
      window.removeEventListener("pageshow", refreshAfterBackground);
    };
  }, []);

  const remaining = Math.max(0, Math.ceil((timer.endsAt - now) / 1000));
  const done = remaining <= 0;

  useEffect(() => {
    if (!done) return;
    dismissButtonRef.current?.focus();
    if (vibratedForRef.current !== timer.endsAt && document.visibilityState === "hidden" && "Notification" in window && Notification.permission === "granted") {
      try { new Notification("Rest complete", { body: "Your next set is ready. Open the tracker to dismiss the alarm.", tag: "eli-rest-timer" }); } catch { /* Not supported on every mobile browser. */ }
    }
    const ring = () => {
      if (document.visibilityState === "hidden") return;
      if (vibrateOnDone) navigator.vibrate?.([260, 100, 260]);
      if (soundOnDone) playRestTimerAlarm();
    };
    ring();
    vibratedForRef.current = timer.endsAt;
    const interval = window.setInterval(ring, REST_TIMER_REPEAT_MS);
    return () => window.clearInterval(interval);
  }, [done, timer.endsAt, vibrateOnDone, soundOnDone]);

  const progress = timer.total > 0 ? Math.min(100, Math.max(0, ((timer.total - remaining) / timer.total) * 100)) : 100;

  return (
    <>
    <div className={`rest-timer-chip${done ? " done" : ""}`} role="timer" aria-live={done ? "assertive" : "off"}>
      <div className="rest-timer-ring" style={{ "--timer-progress": `${progress}%` } as React.CSSProperties}>
        <strong>{done ? "Go" : formatClock(remaining)}</strong>
      </div>
      <div className="rest-timer-copy">
        <span>{done ? "Rest complete" : "Resting"}</span>
        <strong>{done ? "Next set — stay tight" : `After ${timer.exerciseName}`}</strong>
      </div>
      <details className="rest-timer-controls">
        <summary aria-label="Rest timer controls">Controls</summary>
        <div>
          <button type="button" onClick={onReset}>{done ? "Start" : "Reset"}</button>
          <button type="button" onClick={() => onAdjust(-30)} disabled={remaining <= 30}>-30s</button>
          <button type="button" onClick={() => onAdjust(30)}>+30s</button>
          <button type="button" onClick={onToggleSound}>Sound {soundOnDone ? "on" : "off"}</button>
          <button type="button" onClick={() => { primeRestTimerAudio(); playRestTimerAlarm(); }}>Test alarm</button>
          {"Notification" in window && <button type="button" onClick={async () => {
            try { const permission = await Notification.requestPermission(); setNotificationStatus(permission === "granted" ? "Notifications allowed; background delivery depends on your browser." : "Notifications not allowed. The in-app alarm still works."); }
            catch { setNotificationStatus("Notifications unavailable in this browser."); }
          }}>Enable notification fallback</button>}
          <button type="button" onClick={onDismiss}>Dismiss</button>
        </div>
        <p className="muted-copy">{notificationStatus || "Use media volume. Keep the app open for a reliable alarm; locked phones may suspend browser audio."}</p>
      </details>
    </div>
    {done && (
      <div className="rest-alarm-backdrop" role="alertdialog" aria-modal="true" aria-labelledby="rest-alarm-title" onKeyDown={(event) => {
        if (event.key === "Escape") onDismiss();
        if (event.key === "Tab") {
          const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button"));
          const next = event.shiftKey ? buttons.at(-1) : buttons[0];
          if ((!event.shiftKey && document.activeElement === buttons.at(-1)) || (event.shiftKey && document.activeElement === buttons[0])) { event.preventDefault(); next?.focus(); }
        }
      }}>
        <div className="rest-alarm-dialog">
          <div className="rest-alarm-pulse" aria-hidden="true" />
          <span>Timer finished</span>
          <h2 id="rest-alarm-title">Rest complete</h2>
          <p>Next set for {timer.exerciseName}. The alarm repeats until you dismiss it.</p>
          <button ref={dismissButtonRef} type="button" className="primary-action rest-alarm-dismiss" onClick={onDismiss}>
            Dismiss alarm
          </button>
          <button type="button" className="mini-action" onClick={onToggleSound}>
            Sound {soundOnDone ? "on" : "off"}
          </button>
        </div>
      </div>
    )}
    </>
  );
}
