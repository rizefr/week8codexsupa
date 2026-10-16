import { useEffect, useRef, useState } from "react";
import { Minus, Plus, X } from "./icons";

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

export function playRestTimerAlarm(): void {
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

export function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

const STORAGE_KEY = "cycle-tracker:rest-timer";

/** Persist the running timer so an iOS tab reload or app switch keeps the countdown. */
export function saveRestTimer(timer: RestTimerState | null) {
  try {
    if (timer) localStorage.setItem(STORAGE_KEY, JSON.stringify(timer));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage can be unavailable in private mode; the in-memory timer still works.
  }
}

export function loadRestTimer(): RestTimerState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RestTimerState;
    // Drop timers that finished long ago (e.g. yesterday's session).
    if (!parsed.endsAt || Date.now() - parsed.endsAt > 10 * 60 * 1000) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Docked rest timer. When rest ends it plays a short chime a limited number of
 * times (no endless alarm, no modal), then shows how long you have overrun.
 * Returning to the app well after the timer ended stays silent.
 */
export function RestDock({
  timer,
  chimes,
  onAdjust,
  onDismiss,
}: {
  timer: RestTimerState;
  chimes: number;
  onAdjust: (seconds: number) => void;
  onDismiss: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const chimedFor = useRef<number | null>(null);
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    const refresh = () => setNow(Date.now());
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("pageshow", refresh);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("pageshow", refresh);
    };
  }, []);
  const remainingMs = timer.endsAt - now;
  const done = remainingMs <= 0;
  const overrun = done ? Math.floor(-remainingMs / 1000) : 0;

  useEffect(() => {
    if (!done || chimedFor.current === timer.endsAt) return;
    chimedFor.current = timer.endsAt;
    // Only chime if the user is here within a few seconds of the end.
    if (Date.now() - timer.endsAt > 10 * 60 * 1000 || chimes === 0) return;
    let count = 0;
    const ring = () => {
      if (document.visibilityState !== "visible") return;
      navigator.vibrate?.([200, 80, 200]);
      playRestTimerAlarm();
      count += 1;
    };
    ring();
    const interval = window.setInterval(() => {
      if (chimes > 0 && count >= chimes) {
        window.clearInterval(interval);
        return;
      }
      ring();
    }, REST_TIMER_REPEAT_MS);
    return () => window.clearInterval(interval);
  }, [done, timer.endsAt, chimes]);

  const progress = timer.total > 0 ? Math.min(1, Math.max(0, 1 - remainingMs / (timer.total * 1000))) : 1;
  const radius = 19;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className={`rest-dock${done ? " is-done" : ""}`} role="timer" aria-live={done ? "polite" : "off"} aria-label={done ? "Rest complete" : `Resting, ${formatClock(remainingMs / 1000)} left`}>
      <div className="rest-dock__ring" aria-hidden="true">
        <svg width="46" height="46" viewBox="0 0 46 46">
          <circle cx="23" cy="23" r={radius} className="rest-dock__track" />
          <circle cx="23" cy="23" r={radius} className="rest-dock__fill" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - progress)} transform="rotate(-90 23 23)" />
        </svg>
      </div>
      <div className="rest-dock__text">
        <strong className="rest-dock__time">{done ? `+${formatClock(overrun)}` : formatClock(Math.ceil(remainingMs / 1000))}</strong>
        <span>{done ? "Rest done · next set" : `Rest · ${timer.exerciseName}`}</span>
      </div>
      <div className="rest-dock__actions">
        {!done && <button type="button" className="icon-btn" onClick={() => onAdjust(-30)} aria-label="Subtract 30 seconds"><Minus size={16} /></button>}
        {!done && <button type="button" className="icon-btn" onClick={() => onAdjust(30)} aria-label="Add 30 seconds"><Plus size={16} /></button>}
        <button type="button" className="icon-btn" onClick={onDismiss} aria-label={done ? "Dismiss timer" : "Skip rest"}><X size={16} /></button>
      </div>
    </div>
  );
}
