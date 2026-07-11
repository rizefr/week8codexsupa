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
  exerciseName: string;
}

function formatClock(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export function RestTimer({
  timer,
  vibrateOnDone,
  onExtend,
  onDismiss,
}: {
  timer: RestTimerState;
  vibrateOnDone: boolean;
  onExtend: () => void;
  onDismiss: () => void;
}) {
  // The 1 Hz tick lives here so the logger tree doesn't re-render every second.
  const [now, setNow] = useState(() => Date.now());
  const vibratedForRef = useRef<number | null>(null);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(interval);
  }, []);

  const remaining = Math.max(0, Math.ceil((timer.endsAt - now) / 1000));
  const done = remaining <= 0;

  useEffect(() => {
    if (!done || vibratedForRef.current === timer.endsAt) return;
    vibratedForRef.current = timer.endsAt;
    if (vibrateOnDone) navigator.vibrate?.([180, 90, 180]);
  }, [done, timer.endsAt, vibrateOnDone]);

  const progress = timer.total > 0 ? Math.min(100, Math.max(0, ((timer.total - remaining) / timer.total) * 100)) : 100;

  return (
    <div className={`rest-timer-chip${done ? " done" : ""}`} role="timer" aria-live={done ? "assertive" : "off"}>
      <div className="rest-timer-ring" style={{ "--timer-progress": `${progress}%` } as React.CSSProperties}>
        <strong>{done ? "Go" : formatClock(remaining)}</strong>
      </div>
      <div className="rest-timer-copy">
        <span>{done ? "Rest complete" : "Resting"}</span>
        <strong>{done ? "Next set — stay tight" : `After ${timer.exerciseName}`}</strong>
      </div>
      {!done && <button type="button" onClick={onExtend}>+30s</button>}
      <button type="button" onClick={onDismiss}>{done ? "Done" : "Skip"}</button>
    </div>
  );
}
