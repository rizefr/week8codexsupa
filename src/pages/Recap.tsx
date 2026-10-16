import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Trophy } from "../components/icons";
import { formatDate } from "../lib/date";
import { cornellWeekRange } from "../data/cornell";
import { isCreditedSession, setCompletionForLog, workoutVolume, isTrainingDay } from "../lib/progress";
import { buildWorkoutRecap, classifyPRTier, ExerciseResultRecord } from "../lib/gamification";
import { buildWorkoutCoachSummary } from "../lib/coach";
import { summarizeMuscleRange } from "../lib/muscles";
import { AppContext } from "../ui/context";
import { Card, Chip, Disclosure, displayName, EmptyState, Meter, navigate, prefersReducedMotion, SectionHeader, Tone, useCountUp } from "../ui/core";
import { MuscleMap } from "../ui/MuscleMap";

const CONFETTI = ["#5e7bff", "#e8b44c", "#35c98b", "#a07cff", "#f2f3f5"];

function Confetti() {
  const pieces = useMemo(() => Array.from({ length: 26 }, (_, index) => ({
    left: `${(index * 37) % 100}%`,
    background: CONFETTI[index % CONFETTI.length],
    animationDelay: `${(index % 9) * 0.08}s`,
    "--confetti-duration": `${1.7 + ((index * 7) % 10) / 10}s`,
  })), []);
  return <div className="confetti-layer" aria-hidden="true">{pieces.map((style, index) => <span key={index} className="confetti-piece" style={style as React.CSSProperties} />)}</div>;
}

const resultTone: Record<ExerciseResultRecord["state"], Tone> = {
  "major-pr": "gold",
  pr: "gold",
  improved: "success",
  regressed: "warn",
  baseline: "accent",
  neutral: "neutral",
};

function minutesBetween(start?: string, end?: string): number | null {
  if (!start || !end) return null;
  const minutes = Math.round((Date.parse(end) - Date.parse(start)) / 60000);
  return minutes > 0 && minutes < 360 ? minutes : null;
}

export function RecapPage({ ctx, logId, markSeen }: { ctx: AppContext; logId?: string; markSeen: (id: string) => void }) {
  const { data, gamification } = ctx;
  const recap = logId ? buildWorkoutRecap(logId, data) : null;
  const wasUnseen = useMemo(() => !!logId && !gamification.settings.seenRecaps.includes(logId), [logId]);
  const celebrate = gamification.settings.enabled && gamification.settings.showCelebrations && wasUnseen && !prefersReducedMotion();
  useEffect(() => { if (recap?.log.id) markSeen(recap.log.id); }, [recap?.log.id]);
  const xp = useCountUp(recap?.xpEarned ?? 0, celebrate);
  const [confetti, setConfetti] = useState(false);
  useEffect(() => {
    if (!celebrate || !recap || (!recap.leveledUp && !recap.prs.length)) return;
    setConfetti(true);
    const timeout = window.setTimeout(() => setConfetti(false), 2600);
    return () => window.clearTimeout(timeout);
  }, [recap?.log.id, celebrate]);

  if (!recap) {
    return <Card><EmptyState title="No recap found" detail="Open a completed workout from History." action={<button type="button" className="btn btn--primary" onClick={() => navigate("history")}>Open history</button>} /></Card>;
  }

  const log = recap.log;
  const completion = setCompletionForLog(log);
  const strength = completion.planned > 0;
  const credited = isCreditedSession(log);
  const minutes = minutesBetween(log.startedAt, log.completedAt);
  const volume = workoutVolume(log);
  const coach = buildWorkoutCoachSummary(log, data, gamification);
  const range = cornellWeekRange(log.date);
  const weekToDate = summarizeMuscleRange(data, range.from, log.date);
  const isRest = !strength && !log.exerciseLogs.some((entry) => entry.cardio) && !isTrainingDay(log.dayKey);
  const title = isRest ? "Recovery logged" : !strength ? "Session logged" : credited ? "Workout complete" : "Saved as partial";

  return (
    <div className="page">
      <Card className="card--hero recap-hero" style={{ position: "relative", overflow: "hidden" }}>
        {confetti && <Confetti />}
        <div className={`recap-hero__check${strength && !credited ? " is-partial" : ""}`}>{strength && !credited ? <AlertTriangle size={26} /> : <Check size={30} />}</div>
        <h1>{title}</h1>
        <p>{log.workoutTitle} · {formatDate(log.date, { weekday: "long" })}</p>
        {gamification.settings.enabled && recap.xpEarned > 0 && <div className="xp-burst">+{xp}<small>XP</small></div>}
        {gamification.settings.enabled && (
          <div style={{ marginTop: 14, textAlign: "left" }}>
            <div className="row row--between small"><span className="muted">Level {recap.level.level} · {recap.level.title}</span><span className="faint num">{recap.level.xpToNext} XP to go</span></div>
            <div style={{ marginTop: 6 }}><Meter value={recap.level.currentLevelXP} max={recap.level.nextLevelXP} tone="gold" label="Level progress" /></div>
            {recap.leveledUp && <p style={{ marginTop: 10 }}><Chip tone="gold" icon={<Trophy size={12} />}>Level up! Now level {recap.level.level}</Chip></p>}
          </div>
        )}
      </Card>

      {strength && !credited && (
        <div className="callout callout--warn">
          <AlertTriangle size={16} />
          <div><strong>{completion.completed} of {completion.planned} planned sets logged.</strong> Partial sessions are kept in your history but don't count toward the weekly four, streaks or completion XP. Only log work actually performed. Skipping does not create completion credit.</div>
        </div>
      )}

      {strength && (
        <div className="stat-grid stat-grid--4">
          <div className="stat"><span className="stat__label">Sets</span><strong className="stat__value">{completion.completed}<small>/ {completion.planned}</small></strong></div>
          <div className="stat"><span className="stat__label">Time</span><strong className="stat__value">{minutes ?? "—"}<small>{minutes ? "min" : ""}</small></strong></div>
          <div className="stat"><span className="stat__label">Volume</span><strong className="stat__value">{volume ? Math.round(volume / 100) / 10 : "—"}<small>{volume ? "k lb" : ""}</small></strong></div>
          <div className="stat stat--gold"><span className="stat__label">PRs</span><strong className="stat__value">{recap.prs.length}</strong></div>
        </div>
      )}

      {!strength && log.exerciseLogs.some((entry) => entry.cardio?.completed && !entry.skipped) && (
        <div className="stat-grid">
          {log.exerciseLogs.filter((entry) => entry.cardio?.completed && !entry.skipped).map((entry) => (
            <div key={entry.id} className="stat"><span className="stat__label">Duration</span><strong className="stat__value">{entry.cardio?.duration}<small>min</small></strong>{entry.cardio?.intensityNotes && <span className="stat__detail">{entry.cardio.intensityNotes}</span>}</div>
          ))}
          {log.exerciseLogs.some((entry) => entry.cardio?.pushUpSets) && (
            <div className="stat"><span className="stat__label">Push-ups</span><strong className="stat__value">{log.exerciseLogs.find((entry) => entry.cardio?.pushUpSets)?.cardio?.pushUpSets}<small>hard sets</small></strong><span className="stat__detail">{log.exerciseLogs.find((entry) => entry.cardio?.pushUpReps)?.cardio?.pushUpReps ? `${log.exerciseLogs.find((entry) => entry.cardio?.pushUpReps)?.cardio?.pushUpReps} total reps` : "Counted on the muscle map"}</span></div>
          )}
        </div>
      )}

      {!!recap.prs.length && (
        <Card className="card--gold">
          <SectionHeader eyebrow="New records" title={`${recap.prs.length} personal record${recap.prs.length === 1 ? "" : "s"}`} />
          {recap.prs.map((pr) => (
            <div key={pr.id} className="pr-row">
              <span className="pr-row__icon"><Trophy size={16} /></span>
              <div><strong>{displayName(pr.exerciseName)}</strong><span>{classifyPRTier(pr).title} · {pr.label}</span></div>
            </div>
          ))}
        </Card>
      )}

      {!!recap.exerciseResults.length && (
        <Card>
          <SectionHeader eyebrow="Versus last time" title="Exercise results" detail="Compared with your previous session at a similar effort." />
          {recap.exerciseResults.map((result) => (
            <div key={result.exerciseLogId} className="result-row">
              <div className="result-row__main"><strong>{displayName(result.exerciseName)}</strong><span>{result.detail}</span></div>
              <Chip tone={resultTone[result.state]}>{result.label}</Chip>
            </div>
          ))}
        </Card>
      )}

      {strength && (
        <Card>
          <SectionHeader eyebrow={`Week to date · ${formatDate(range.from)} – ${formatDate(log.date)}`} title="Muscle coverage" />
          <MuscleMap summary={weekToDate} compact />
        </Card>
      )}

      {!!recap.badgesUnlocked.length && (
        <Card>
          <SectionHeader eyebrow="Unlocked" title="New badges" />
          <div className="chip-row">{recap.badgesUnlocked.map((badge) => <Chip key={badge.id} tone="gold" icon={<Trophy size={12} />}>{badge.title}</Chip>)}</div>
        </Card>
      )}

      {strength && (
        <Card>
          <SectionHeader eyebrow="Next time" title={coach.nextFocus.title} detail={coach.nextFocus.detail} />
          {gamification.settings.enabled && !!recap.xpEvents.length && (
            <Disclosure summary={`XP breakdown · +${recap.xpEarned}`}>
              {recap.xpEvents.map((event) => (
                <div key={event.key} className="row row--between small" style={{ padding: "4px 0" }}><span>{event.label}</span><b className="num">+{event.xp}</b></div>
              ))}
            </Disclosure>
          )}
        </Card>
      )}

      <div className="stack">
        <button type="button" className="btn btn--primary btn--block btn--lg" onClick={() => navigate("dashboard")}>Done</button>
        <button type="button" className="btn btn--secondary btn--block" onClick={() => navigate("logger", log.id)}>Edit this log</button>
      </div>
    </div>
  );
}
