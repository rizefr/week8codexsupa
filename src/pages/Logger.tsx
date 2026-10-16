import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronLeft, Footprints, Info, Play, Timer, Trash2, Trophy, Zap } from "../components/icons";
import { Exercise, ExerciseLog, SetLog, WorkoutLog } from "../types";
import { formatDate, todayISO } from "../lib/date";
import { CORNELL_ID, isTrainingLog, OPTIONAL_DAY, prescriptionWeekForLog, weekForLog, workoutForLog } from "../data/cornell";
import { preExerciseWarmupsForExercise, warmupCompletionSummary, warmupsForDay } from "../data/warmups";
import {
  autoCompletedSet,
  cardioInputsAreValid,
  CREDIT_THRESHOLD,
  effortLabelForExercise,
  loadIsAssistance,
  loadLabelForExercise,
  nextSessionRecommendation,
  previousExercisePerformance,
  previousSessionNotes,
  rirRequiredForExercise,
  setCompletionForLog,
  setHasRecordedPerformance,
  shouldShowLoadInput,
  targetRIRForSet,
  trackingTypeForExercise,
  findExercise,
} from "../lib/progress";
import { buildExerciseHelp } from "../lib/coach";
import { buildNextWorkoutBriefing } from "../lib/readiness";
import { parseRestSeconds } from "../components/RestTimer";
import { AppContext } from "../ui/context";
import { Card, Chip, cx, Disclosure, displayName, EmptyState, Meter, navigate, Sheet } from "../ui/core";
import { ExerciseHelp } from "./Plan";
import { ExerciseFlags, ShortOnTimeSelector, updateWarmupDrill, WarmupChecklist } from "./LoggerParts";

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

function elapsedLabel(startedAt: string, now: number): string {
  const minutes = Math.max(0, Math.round((now - Date.parse(startedAt)) / 60000));
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

function compactPrevious(set: SetLog | undefined, exercise: Exercise): string {
  if (!set || !set.completed) return "—";
  const tracking = trackingTypeForExercise(exercise);
  const reps = tracking === "timed" ? `${set.seconds}s` : exercise.unilateral ? `${set.leftReps || set.reps}/${set.rightReps || set.reps}` : set.reps;
  if (!shouldShowLoadInput(exercise)) return `${reps}`;
  return `${set.weight}×${reps}`;
}

/** Values to suggest for an empty field: this session's previous set, then last session's same set. */
function suggestions(exerciseLog: ExerciseLog, index: number, previous: ExerciseLog | undefined) {
  const above = exerciseLog.sets.slice(0, index).reverse().find((set) => set.completed) ?? exerciseLog.sets.slice(0, index).reverse().find((set) => set.weight || set.reps);
  const prior = previous?.sets[index] ?? previous?.sets.at(-1);
  // Last session's matching set wins; otherwise repeat the set just done.
  return {
    weight: above?.weight || prior?.weight || "",
    reps: prior?.reps || above?.reps || "",
    leftReps: prior?.leftReps || above?.leftReps || "",
    rightReps: prior?.rightReps || above?.rightReps || "",
    seconds: prior?.seconds || above?.seconds || "",
  };
}

function SetRow({ set, index, exercise, exerciseLog, previous, week, readOnly, onUpdate }: {
  set: SetLog;
  index: number;
  exercise: Exercise;
  exerciseLog: ExerciseLog;
  previous?: ExerciseLog;
  week: number;
  readOnly: boolean;
  onUpdate: (patch: Partial<SetLog>) => void;
}) {
  const tracking = trackingTypeForExercise(exercise);
  const showLoad = shouldShowLoadInput(exercise);
  const showRir = rirRequiredForExercise(exercise);
  const hint = suggestions(exerciseLog, index, previous);
  const rirTarget = targetRIRForSet(exercise, week, set.setNumber);
  const rirHint = rirTarget.match(/\d+/)?.[0] ?? "";
  const rowRef = useRef<HTMLDivElement>(null);

  const quickComplete = () => {
    if (readOnly) return;
    if (set.completed) {
      onUpdate({ completionOverride: "incomplete" });
      return;
    }
    const patch: Partial<SetLog> = { completionOverride: undefined };
    if (showLoad && !set.weight && hint.weight) patch.weight = hint.weight;
    if (tracking === "timed") {
      if (!set.seconds && hint.seconds) patch.seconds = hint.seconds;
    } else if (exercise.unilateral) {
      if (!set.leftReps && hint.leftReps) patch.leftReps = hint.leftReps;
      if (!set.rightReps && hint.rightReps) patch.rightReps = hint.rightReps;
    } else if (!set.reps && hint.reps) patch.reps = hint.reps;
    // Actual RIR must be entered by the athlete, never copied from a target.
    const merged = autoCompletedSet({ ...set, ...patch }, exercise);
    onUpdate(patch);
    if (!merged.completed) {
      const firstEmpty = rowRef.current?.querySelector<HTMLInputElement>("input:placeholder-shown");
      firstEmpty?.focus();
    }
  };

  const input = (field: "weight" | "reps" | "leftReps" | "rightReps" | "seconds" | "rir", placeholder: string, mode: "decimal" | "numeric", label: string) => (
    <input
      className="set-input"
      value={(set[field] as string | undefined) ?? ""}
      placeholder={placeholder}
      inputMode={mode}
      enterKeyHint="next"
      aria-label={`Set ${set.setNumber} ${label}`}
      readOnly={readOnly}
      onChange={(event) => onUpdate({ [field]: event.target.value })}
    />
  );

  const ready = !set.completed && (!!set.reps || !!set.weight || !!hint.reps);
  return (
    <div ref={rowRef} className={cx("set-row", set.completed && "is-done", `cols-${(showLoad ? 1 : 0) + (exercise.unilateral ? 2 : 1) + (showRir ? 1 : 0)}`)}>
      <span className="set-row__num">{set.setNumber}</span>
      <span className="set-row__prev" title="Last session">{compactPrevious(previous?.sets[index], exercise)}<small>{set.target}{showRir ? ` · ${rirTarget.replace(/ /g, "")}` : ""}</small></span>
      {showLoad && input("weight", hint.weight || (loadIsAssistance(exercise) ? "assist" : "lb"), "decimal", loadIsAssistance(exercise) ? "assistance pounds" : "weight")}
      {tracking === "timed"
        ? input("seconds", hint.seconds || "sec", "numeric", "seconds")
        : exercise.unilateral
          ? <>{input("leftReps", hint.leftReps || "L", "numeric", "left reps")}{input("rightReps", hint.rightReps || "R", "numeric", "right reps")}</>
          : input("reps", hint.reps || "reps", "numeric", "reps")}
      {showRir && input("rir", rirHint || "RIR", "decimal", "reps in reserve")}
      <button
        type="button"
        className={cx("set-check", set.completed && "is-done", ready && "is-ready")}
        onClick={quickComplete}
        disabled={readOnly}
        aria-pressed={set.completed}
        aria-label={set.completed ? `Set ${set.setNumber} done. Tap to mark not done` : `Complete set ${set.setNumber}${hint.reps ? " with suggested values" : ""}`}
      >
        <Check size={18} />
      </button>
    </div>
  );
}

function ExerciseCard({ ctx, log, exerciseLog, index, onChange, readOnly, onOptions }: {
  ctx: AppContext;
  log: WorkoutLog;
  exerciseLog: ExerciseLog;
  index: number;
  onChange: (next: ExerciseLog) => void;
  readOnly: boolean;
  onOptions: () => void;
}) {
  const exercise = findExercise(exerciseLog.exerciseId)!;
  const previous = useMemo(() => previousExercisePerformance(ctx.data.workoutLogs, log.date, exercise), [ctx.data.workoutLogs, log.date, exercise]);
  const recommendation = useMemo(() => nextSessionRecommendation(ctx.data.workoutLogs, log.date, exercise), [ctx.data.workoutLogs, log.date, exercise]);
  const week = prescriptionWeekForLog(log);
  const showRir = rirRequiredForExercise(exercise);
  const showLoad = shouldShowLoadInput(exercise);
  const done = exerciseLog.sets.length > 0 && exerciseLog.sets.every((set) => set.completed);
  const name = displayName(exerciseLog.performedExerciseName ?? exercise.name);
  const effort = showRir ? `${targetRIRForSet(exercise, week, 1)} RIR` : effortLabelForExercise(exercise) === "Control cue" ? "to control" : "";

  if (exerciseLog.skipped) {
    return (
      <Card className="ex-card is-skipped" id={`ex-${exerciseLog.id}`}>
        <div className="ex-card__head">
          <span className="ex-card__index">{exercise.superset ?? index + 1}</span>
          <div className="ex-card__name"><h3>{name}</h3><p>Skipped · {exerciseLog.skipReason ?? "no reason given"}</p></div>
          {!readOnly && <button type="button" className="btn btn--secondary btn--sm" onClick={() => { const { skipped, skippedAt, skipReason, ...rest } = exerciseLog; onChange(rest); }}>Restore</button>}
        </div>
      </Card>
    );
  }

  const updateSet = (setId: string, patch: Partial<SetLog>) => {
    const before = exerciseLog.sets.find((set) => set.id === setId);
    let sets = exerciseLog.sets.map((set) => (set.id === setId ? autoCompletedSet({ ...set, ...patch }, exercise) : set));
    const after = sets.find((set) => set.id === setId);
    if (before && after && !readOnly) {
      // Rest starts as soon as the set's performance is recorded.
      if (!setHasRecordedPerformance(before, exercise) && setHasRecordedPerformance(after, exercise)) ctx.startRest(exercise);
      // Carry the load forward to the next empty set.
      if (showLoad && after.weight && after.weight !== before.weight) {
        const position = sets.findIndex((set) => set.id === setId);
        const next = sets[position + 1];
        if (next && !next.weight && !next.completed) sets = sets.map((set, i) => (i === position + 1 ? { ...set, weight: after.weight } : set));
      }
    }
    onChange({ ...exerciseLog, sets, completed: sets.length > 0 ? sets.every((set) => set.completed) : exerciseLog.completed });
  };

  const headerCols = (showLoad ? 1 : 0) + (exercise.unilateral ? 2 : 1) + (showRir ? 1 : 0);
  const tracking = trackingTypeForExercise(exercise);
  // Calibration/deload guidance is shown once at the top of the page, not per card.
  const weekWide = /^(Calibrate|Deload) this week$/.test(recommendation.title);
  const showTip = !readOnly && recommendation.kind !== "insufficient" && !weekWide;
  return (
    <Card className={cx("ex-card", done && "is-done")} id={`ex-${exerciseLog.id}`}>
      <div className="ex-card__head">
        <span className="ex-card__index">{done ? <Check size={16} /> : exercise.superset ?? index + 1}</span>
        <div className="ex-card__name">
          <h3>{name}</h3>
          <p>{exerciseLog.sets.length} × {exercise.reps ?? exercise.seconds}{effort ? ` · ${effort}` : ""} · rest {exercise.rest.replace(/ after .*/, "")}</p>
          {showLoad && <p>{loadLabelForExercise(exercise)}</p>}
        </div>
        <button type="button" className="icon-btn" onClick={onOptions} aria-label={`Options and help for ${name}`}><Info size={18} /></button>
      </div>
      {(exercise.supersetLabel || exerciseLog.performedExerciseName || (exerciseLog.flags?.length ?? 0) > 0) && (
        <div className="ex-card__chips">
          {exercise.supersetLabel && <Chip tone="violet">{exercise.supersetLabel.split("·")[0].trim()}</Chip>}
          {exerciseLog.performedExerciseName && <Chip tone="warn">Swap for {exercise.name}</Chip>}
          {!!exerciseLog.flags?.length && <Chip tone="danger" icon={<AlertTriangle size={12} />}>{exerciseLog.flags.length} flag</Chip>}
        </div>
      )}
      {showTip && (
        <div className={cx("next-tip", `tone-${recommendation.kind}`)}>
          {recommendation.kind === "add-load" || recommendation.kind === "reduce-assistance" ? <Zap size={16} /> : <Trophy size={16} />}
          <span><strong>{recommendation.title}.</strong> {recommendation.detail}</span>
        </div>
      )}
      <div className="set-grid">
        <div className={cx("set-row", "is-head", `cols-${headerCols}`)} aria-hidden="true">
          <span>#</span>
          <span>Prev</span>
          {showLoad && <span>{loadIsAssistance(exercise) ? "Assist" : "lb"}</span>}
          {tracking === "timed" ? <span>Sec</span> : exercise.unilateral ? <><span>L</span><span>R</span></> : <span>Reps</span>}
          {showRir && <span>RIR</span>}
          <span>✓</span>
        </div>
        {exerciseLog.sets.map((set, setIndex) => (
          <SetRow key={set.id} set={set} index={setIndex} exercise={exercise} exerciseLog={exerciseLog} previous={previous?.exerciseLog} week={week} readOnly={readOnly} onUpdate={(patch) => updateSet(set.id, patch)} />
        ))}
      </div>
      {previous && !!previousSessionNotes(previous.exerciseLog, previous.workout).length && (
        <p className="faint small" style={{ marginTop: 8 }}>Last note ({formatDate(previous.workout.date)}): {previousSessionNotes(previous.exerciseLog, previous.workout)[0]}</p>
      )}
      {!previous && !readOnly && <p className="faint small" style={{ marginTop: 8 }}>First time logging this movement. This session becomes the baseline.</p>}
    </Card>
  );
}

function CardioCard({ log, exerciseLog, onChange, readOnly }: { log: WorkoutLog; exerciseLog: ExerciseLog; onChange: (next: ExerciseLog) => void; readOnly: boolean }) {
  const cardio = workoutForLog(log).cardio?.find((item) => item.id === exerciseLog.exerciseId);
  const isRotc = exerciseLog.exerciseId.startsWith("cn-rotc");
  const update = (patch: Partial<NonNullable<ExerciseLog["cardio"]>>) => {
    const next = { ...exerciseLog.cardio, ...patch } as NonNullable<ExerciseLog["cardio"]>;
    next.completed = cardioInputsAreValid(next.duration);
    onChange({ ...exerciseLog, completed: next.completed, cardio: next });
  };
  if (exerciseLog.skipped) {
    return (
      <Card className="ex-card is-skipped">
        <div className="ex-card__head">
          <span className="ex-card__index"><Footprints size={15} /></span>
          <div className="ex-card__name"><h3>{cardio?.name ?? "Cardio"}</h3><p>Skipped · {exerciseLog.skipReason}</p></div>
          {!readOnly && <button type="button" className="btn btn--secondary btn--sm" onClick={() => { const { skipped, skippedAt, skipReason, ...rest } = exerciseLog; onChange(rest); }}>Restore</button>}
        </div>
      </Card>
    );
  }
  const field = (key: "duration" | "incline" | "speed" | "pushUpSets" | "pushUpReps", label: string, placeholder: string) => (
    <label className="field">
      {label}
      <input value={exerciseLog.cardio?.[key] ?? ""} onChange={(event) => update({ [key]: event.target.value })} inputMode="decimal" placeholder={placeholder} readOnly={readOnly} />
    </label>
  );
  return (
    <Card className={cx("ex-card", exerciseLog.cardio?.completed && "is-done")}>
      <div className="ex-card__head">
        <span className="ex-card__index">{exerciseLog.cardio?.completed ? <Check size={16} /> : <Footprints size={15} />}</span>
        <div className="ex-card__name"><h3>{cardio?.name ?? "Cardio"}</h3><p>{cardio?.time} · {cardio?.intensity}</p></div>
      </div>
      <div className="form-grid" style={{ marginTop: 12 }}>
        {field("duration", "Minutes", "min")}
        {isRotc ? field("pushUpSets", "Hard push-up sets", "e.g. 3") : log.programId !== CORNELL_ID ? field("incline", "Incline %", "%") : null}
        {isRotc && field("pushUpReps", "Total push-ups", "reps")}
        {!isRotc && log.programId !== CORNELL_ID && field("speed", "Speed (mph)", "mph")}
        <label className="field span-2">
          {isRotc ? "What you did" : "How it felt"}
          <input value={exerciseLog.cardio?.intensityNotes ?? ""} onChange={(event) => update({ intensityNotes: event.target.value })} placeholder={isRotc ? "2-mile run 16:10, push-up ladder…" : "Easy, full sentences"} readOnly={readOnly} />
        </label>
      </div>
      {isRotc && <p className="faint small" style={{ marginTop: 8 }}>Count a push-up set as hard if it ended within about 3 reps of failure. Hard sets feed chest and triceps on the muscle map.</p>}
      {cardio?.notes && !isRotc && <p className="faint small" style={{ marginTop: 8 }}>{cardio.notes}</p>}
    </Card>
  );
}

function ExerciseOptions({ ctx, log, exerciseLog, onChange, onClose, readOnly }: { ctx: AppContext; log: WorkoutLog; exerciseLog: ExerciseLog; onChange: (next: ExerciseLog) => void; onClose: () => void; readOnly: boolean }) {
  const exercise = findExercise(exerciseLog.exerciseId)!;
  const [reason, setReason] = useState("Short on time");
  const help = buildExerciseHelp(exercise);
  const drills = preExerciseWarmupsForExercise(log.dayKey, exercise.id, log.programId, log.planVersion ?? 1);
  return (
    <div className="stack">
      <div className="callout"><Info size={16} /><div><strong>Coaching cue.</strong> {exercise.notes}{exercise.logHint ? ` ${exercise.logHint}` : ""}</div></div>
      {!!drills.length && (
        <Disclosure summary={`Ramp-up · ${drills.length} step`} defaultOpen>
          <WarmupChecklist drills={drills} warmupLog={log.warmupLog} readOnly={readOnly} onToggle={(id, done) => ctx.saveWorkout(updateWarmupDrill(log, id, done))} />
        </Disclosure>
      )}
      <ExerciseHelp exercise={exercise} />
      {!readOnly && (
        <>
          <label className="field">
            Notes for next time
            <textarea value={exerciseLog.notes ?? ""} onChange={(event) => onChange({ ...exerciseLog, notes: event.target.value })} placeholder="Seat 4, grip width, felt it in…" />
          </label>
          <Disclosure summary="Joint or form check">
            <ExerciseFlags exerciseLog={exerciseLog} onChange={onChange} readOnly={readOnly} />
          </Disclosure>
          {!!help?.replacements.length && (
            <Disclosure summary="Machine busy? Swap exercise">
              {exerciseLog.performedExerciseName && (
                <button type="button" className="btn btn--secondary btn--block" onClick={() => { const { performedExerciseName, replacementForExerciseId, replacementReason, ...rest } = exerciseLog; onChange(rest); }}>Use {exercise.name} again</button>
              )}
              {help.replacements.map((replacement) => (
                <button key={replacement.name} type="button" className="list-row" onClick={() => { onChange({ ...exerciseLog, performedExerciseName: replacement.name, replacementForExerciseId: exercise.id, replacementReason: replacement.reason }); onClose(); }}>
                  <span className="list-row__main"><strong>{replacement.name}</strong><span>{replacement.reason}</span></span>
                </button>
              ))}
            </Disclosure>
          )}
          {parseRestSeconds(exercise.rest) > 0 && (
            <button type="button" className="btn btn--secondary btn--block" onClick={() => { ctx.startRest(exercise); onClose(); }}><Timer size={17} /> Start rest timer</button>
          )}
          <Disclosure summary="Skip this exercise today">
            <p>Skipped work earns no completion, PR or volume credit. Logged sets stay saved.</p>
            <label className="field">Reason<input value={reason} onChange={(event) => setReason(event.target.value)} /></label>
            <button type="button" className="btn btn--danger btn--block" disabled={!reason.trim()} onClick={() => { onChange({ ...exerciseLog, skipped: true, skippedAt: new Date().toISOString(), skipReason: reason.trim(), completed: false }); onClose(); }}>Skip {exercise.name}</button>
          </Disclosure>
        </>
      )}
    </div>
  );
}

export function LoggerPage({ ctx, logId, restDock }: { ctx: AppContext; logId?: string; restDock: React.ReactNode }) {
  const log = ctx.data.workoutLogs.find((item) => item.id === logId);
  const now = useNow(30000);
  const [optionsFor, setOptionsFor] = useState<string | null>(null);
  const [finishOpen, setFinishOpen] = useState(false);
  const [shortOpen, setShortOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);

  useEffect(() => {
    const cards = Array.from(document.querySelectorAll<HTMLElement>(".ex-card[id^='ex-']"));
    if (!cards.length || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (visible) setCurrentId(visible.target.id.replace(/^ex-/, ""));
    }, { rootMargin: "-160px 0px -55% 0px" });
    cards.forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [log?.id, log?.exerciseLogs.length]);

  if (!log) {
    return <Card><EmptyState title="Workout not found" detail="It may have been deleted or not synced to this device yet." action={<button type="button" className="btn btn--primary" onClick={() => ctx.startWorkout(todayISO())}><Play size={17} /> Start today</button>} /></Card>;
  }

  const readOnly = false;
  const isDraft = log.status === "draft";
  const workout = workoutForLog(log);
  const save = (next: WorkoutLog) => ctx.saveWorkout(next);
  const updateExercise = (next: ExerciseLog) => save({ ...log, exerciseLogs: log.exerciseLogs.map((item) => (item.id === next.id ? next : item)) });
  const completion = setCompletionForLog(log);
  const strengthLogs = log.exerciseLogs.filter((entry) => !!findExercise(entry.exerciseId));
  const cardioLogs = log.exerciseLogs.filter((entry) => !findExercise(entry.exerciseId));
  const training = isTrainingLog(log) || strengthLogs.length > 0;
  const briefing = buildNextWorkoutBriefing(ctx.data, log.date, log.dayKey);
  const generalWarmups = training ? warmupsForDay(log.dayKey, "general", log.programId, log.planVersion ?? 1) : [];
  const warmupSummary = warmupCompletionSummary(log);
  const isOptionalDay = log.programId === CORNELL_ID && log.dayKey === OPTIONAL_DAY && strengthLogs.length > 0 && cardioLogs.length > 0;
  const runMode = isOptionalDay && strengthLogs.every((entry) => entry.skipped);
  const liftMode = isOptionalDay && cardioLogs.every((entry) => entry.skipped);
  const optionsLog = optionsFor ? log.exerciseLogs.find((entry) => entry.id === optionsFor) : undefined;
  const unloggedExercises = strengthLogs.filter((entry) => !entry.skipped && !entry.sets.some((set) => set.completed)).length;
  const credited = completion.planned > 0 && completion.ratio >= CREDIT_THRESHOLD;
  const cardioOnly = !strengthLogs.some((entry) => !entry.skipped);

  const setMode = (mode: "run" | "lift" | "both") => {
    const stamp = new Date().toISOString();
    save({
      ...log,
      exerciseLogs: log.exerciseLogs.map((entry) => {
        const isStrength = !!findExercise(entry.exerciseId);
        const shouldSkip = (mode === "run" && isStrength) || (mode === "lift" && !isStrength);
        if (shouldSkip) return { ...entry, skipped: true, skippedAt: stamp, skipReason: mode === "run" ? "Run mode" : "Pull + arms mode", completed: false };
        if (entry.skipped && (entry.skipReason === "Run mode" || entry.skipReason === "Pull + arms mode")) {
          const { skipped, skippedAt, skipReason, ...rest } = entry;
          return rest;
        }
        return entry;
      }),
    });
  };

  const applyCuts = (included: Set<string>) => {
    const rankById = new Map(briefing.shortOnTime.map((option) => [option.exerciseId, option.rank]));
    save({
      ...log,
      exerciseLogs: log.exerciseLogs.map((entry) => {
        if (!included.has(entry.exerciseId)) {
          if (entry.skipped) return entry;
          const rank = rankById.get(entry.exerciseId);
          return { ...entry, skipped: true, skippedAt: new Date().toISOString(), skipReason: rank ? `Short on time · cut #${rank}` : "Short on time", completed: false };
        }
        if (!entry.skipped) return entry;
        const { skipped, skippedAt, skipReason, ...rest } = entry;
        return { ...rest, completed: rest.sets.length ? rest.sets.every((set) => set.completed) : !!rest.cardio?.completed };
      }),
    });
    setShortOpen(false);
  };

  const finish = () => {
    const completed: WorkoutLog = {
      ...log,
      status: "completed",
      completedAt: log.completedAt ?? new Date().toISOString(),
      exerciseLogs: log.exerciseLogs.map((entry) => ({
        ...entry,
        completed: !entry.skipped && (entry.completed || (!!entry.sets.length && entry.sets.every((set) => set.completed)) || !!entry.cardio?.completed),
      })),
    };
    save(completed);
    ctx.clearRest();
    setFinishOpen(false);
    navigate("recap", completed.id);
  };

  const scrollTo = (id: string) => {
    const element = document.getElementById(`ex-${id}`);
    element?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  };

  return (
    <div className="page" style={{ animation: "none" }}>
      <div className="wk-top">
        <div className="wk-top__row">
          <button type="button" className="icon-btn" onClick={() => navigate(isDraft ? "dashboard" : "recap", isDraft ? undefined : log.id)} aria-label="Back"><ChevronLeft size={20} /></button>
          <div className="wk-top__title">
            <strong>{workout.title}</strong>
            <span>
              {formatDate(log.date, { weekday: "short" })}
              {log.programId === CORNELL_ID ? ` · Week ${weekForLog(log)}` : ` · Week ${log.week}`}
              {isDraft ? ` · ${elapsedLabel(log.startedAt, now)}` : " · editing completed log"}
            </span>
          </div>
          <button type="button" className="btn btn--primary btn--sm" onClick={() => (isDraft ? setFinishOpen(true) : navigate("recap", log.id))}>
            {isDraft ? "Finish" : "Done"}
          </button>
        </div>
        {training && completion.planned > 0 && (
          <div className="wk-progress">
            <Meter value={completion.completed} max={completion.planned} tone={completion.completed >= completion.planned ? "success" : "accent"} label="Sets completed" />
          </div>
        )}
        {strengthLogs.length > 1 && (
          <nav className="ex-nav" aria-label="Jump to exercise">
            {log.exerciseLogs.map((entry, index) => {
              const exercise = findExercise(entry.exerciseId);
              const label = exercise ? displayName(exercise.name).replace(/^DB /, "") : workout.cardio?.find((item) => item.id === entry.exerciseId)?.name ?? "Cardio";
              const done = entry.sets.length ? entry.sets.every((set) => set.completed) : !!entry.cardio?.completed;
              return (
                <button key={entry.id} type="button" className={cx(done && "is-done", entry.skipped && "is-skipped", currentId === entry.id && "is-current")} onClick={() => scrollTo(entry.id)}>
                  <i>{done ? "✓" : exercise?.superset ?? index + 1}</i>
                  {label}
                </button>
              );
            })}
          </nav>
        )}
      </div>

      {isOptionalDay && isDraft && (
        <Card className="card--tight">
          <p className="eyebrow" style={{ marginBottom: 8 }}>Optional session · pick a mode</p>
          <div className="segmented" role="tablist" aria-label="Optional session mode">
            <button type="button" className={cx("segmented__option", runMode && "is-active")} onClick={() => setMode("run")}>Easy run</button>
            <button type="button" className={cx("segmented__option", liftMode && "is-active")} onClick={() => setMode("lift")}>Pull + arms</button>
            <button type="button" className={cx("segmented__option", !runMode && !liftMode && "is-active")} onClick={() => setMode("both")}>Both</button>
          </div>
          <p className="faint small" style={{ marginTop: 8 }}>Tired or sore? Skip today; it's optional.</p>
        </Card>
      )}

      {(briefing.deload.status === "deload" || briefing.deload.status === "watch") && isDraft && (
        <div className="callout callout--warn"><AlertTriangle size={16} /><div><strong>{briefing.deload.title}.</strong> {briefing.deload.recommendation}</div></div>
      )}

      {isDraft && training && log.programId === CORNELL_ID && [1, 8].includes(prescriptionWeekForLog(log)) && (
        <div className="callout callout--accent">
          <Info size={16} />
          <div>{prescriptionWeekForLog(log) === 1
            ? <><strong>Calibration week.</strong> Two working sets per exercise, stopping about 3 reps short of failure. Pick honest starting loads; old numbers are references, not targets.</>
            : <><strong>Deload week.</strong> Half the usual sets at 3-4 RIR, same exercises, no load increases. Next week starts the new block.</>}</div>
        </div>
      )}

      {training && !!generalWarmups.length && (
        <Disclosure summary={<span>Warm-up · {warmupSummary.completed}/{warmupSummary.total} <span className="faint small" style={{ fontWeight: 600 }}>· 5-8 min, easy</span></span>}>
          <WarmupChecklist drills={generalWarmups} warmupLog={log.warmupLog} readOnly={readOnly} onToggle={(id, done) => save(updateWarmupDrill(log, id, done))} />
        </Disclosure>
      )}

      {!training && !cardioLogs.length && workout.restOptions && (
        <Card>
          <p className="muted">{workout.subtitle}</p>
          <div className="stack" style={{ marginTop: 12 }}>
            {(["full-rest", "easy-walk", "recovery-checkin"] as const).map((mode) => (
              <button key={mode} type="button" className="btn btn--secondary btn--block" onClick={() => { save({ ...log, status: "completed", completedAt: new Date().toISOString(), restDay: { mode, intensityNotes: mode === "easy-walk" ? "Easy, conversational pace" : "Recovery respected.", duration: mode === "easy-walk" ? "20" : undefined, completed: true } }); navigate("recap", log.id); }}>
                {mode === "full-rest" ? "Full rest done" : mode === "easy-walk" ? "Easy walk done" : "Recovery check-in"}
              </button>
            ))}
          </div>
        </Card>
      )}

      {log.exerciseLogs.map((entry, index) => (
        findExercise(entry.exerciseId)
          ? <ExerciseCard key={entry.id} ctx={ctx} log={log} exerciseLog={entry} index={index} onChange={updateExercise} readOnly={readOnly} onOptions={() => setOptionsFor(entry.id)} />
          : <CardioCard key={entry.id} log={log} exerciseLog={entry} onChange={updateExercise} readOnly={readOnly} />
      ))}

      <Card>
        <label className="field">
          Session notes
          <textarea value={log.notes ?? ""} onChange={(event) => save({ ...log, notes: event.target.value })} placeholder="Sleep, energy, joints, what to change next time…" />
        </label>
      </Card>

      <div className="stack">
        {isDraft && training && briefing.shortOnTime.length > 0 && (
          <button type="button" className="btn btn--secondary btn--block" onClick={() => setShortOpen(true)}><Timer size={17} /> Short on time?</button>
        )}
        <button type="button" className="btn btn--primary btn--block btn--lg" onClick={() => (isDraft ? setFinishOpen(true) : navigate("recap", log.id))}>
          <Check size={18} /> {isDraft ? "Finish workout" : "Done editing"}
        </button>
        <button type="button" className="btn btn--ghost btn--block" onClick={() => setDeleteOpen(true)}><Trash2 size={16} /> Delete this log</button>
      </div>

      {restDock && <div className="finish-bar">{restDock}</div>}

      <Sheet open={!!optionsLog} onClose={() => setOptionsFor(null)} title={optionsLog ? displayName(optionsLog.performedExerciseName ?? findExercise(optionsLog.exerciseId)?.name ?? "Exercise") : ""}>
        {optionsLog && <ExerciseOptions ctx={ctx} log={log} exerciseLog={optionsLog} onChange={updateExercise} onClose={() => setOptionsFor(null)} readOnly={readOnly} />}
      </Sheet>

      <Sheet open={shortOpen} onClose={() => setShortOpen(false)} title="Short on time">
        <ShortOnTimeSelector log={log} options={briefing.shortOnTime} onApply={applyCuts} />
      </Sheet>

      <Sheet
        open={finishOpen}
        onClose={() => setFinishOpen(false)}
        title="Finish workout?"
        footer={<>
          <button type="button" className="btn btn--primary btn--block btn--lg" onClick={finish}>{credited || cardioOnly ? "Finish" : "Finish as partial"}</button>
          <button type="button" className="btn btn--ghost btn--block" onClick={() => setFinishOpen(false)}>Keep logging</button>
        </>}
      >
        <div className="stack">
          {training && !cardioOnly && (
            <div className="stat-grid">
              <div className="stat"><span className="stat__label">Sets logged</span><strong className="stat__value">{completion.completed}<small>/ {completion.planned}</small></strong></div>
              <div className="stat"><span className="stat__label">Time</span><strong className="stat__value">{elapsedLabel(log.startedAt, now).replace(" min", "")}<small>min</small></strong></div>
            </div>
          )}
          {!credited && !cardioOnly && (
            <div className="callout callout--warn">
              <AlertTriangle size={16} />
              <div>
                <strong>Partial session.</strong> Fewer than {Math.round(CREDIT_THRESHOLD * 100)}% of planned sets are logged{unloggedExercises ? `, and ${unloggedExercises} exercise${unloggedExercises === 1 ? " has" : "s have"} no sets` : ""}. Your work is saved. Skips stay honest: they do not turn unperformed work into completion credit.
              </div>
            </div>
          )}
          {credited && <div className="callout callout--success"><Check size={16} /><div><strong>Counts as a full session.</strong> Nice work. Your recap shows PRs and muscle impact.</div></div>}
          {cardioOnly && <p className="muted small">Saves this session and your notes.</p>}
        </div>
      </Sheet>

      <Sheet
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete this workout log?"
        footer={<>
          <button type="button" className="btn btn--danger btn--block" onClick={() => { ctx.deleteWorkout(log.id); ctx.clearRest(); setDeleteOpen(false); navigate("history"); }}>Delete permanently</button>
          <button type="button" className="btn btn--ghost btn--block" onClick={() => setDeleteOpen(false)}>Cancel</button>
        </>}
      >
        <p className="muted">Removes the log from this device and from cloud sync if you're signed in. A local backup snapshot is saved first.</p>
      </Sheet>
    </div>
  );
}
