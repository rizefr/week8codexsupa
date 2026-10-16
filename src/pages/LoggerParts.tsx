import { useEffect, useState } from "react";
import { Check } from "../components/icons";
import { ExerciseFlag, ExerciseLog, WarmupDrill, WorkoutLog } from "../types";
import { isWarmupComplete } from "../data/warmups";
import { createId, exerciseNameForId, findExercise } from "../lib/progress";
import { workoutForLog } from "../data/cornell";
import { NextWorkoutBriefing } from "../lib/readiness";
import { cx } from "../ui/core";

export function updateWarmupDrill(log: WorkoutLog, drillId: string, completed: boolean): WorkoutLog {
  const completedDrills = { ...(log.warmupLog?.completedDrills ?? {}) };
  if (completed) completedDrills[drillId] = true;
  else delete completedDrills[drillId];
  return { ...log, warmupLog: { ...log.warmupLog, completedDrills, updatedAt: new Date().toISOString() } };
}

export function WarmupChecklist({ drills, warmupLog, onToggle, readOnly }: { drills: WarmupDrill[]; warmupLog?: WorkoutLog["warmupLog"]; onToggle: (drillId: string, completed: boolean) => void; readOnly?: boolean }) {
  if (!drills.length) return null;
  return (
    <div>
      {drills.map((drill) => {
        const done = isWarmupComplete(warmupLog, drill.id);
        return (
          <div key={drill.id} className={cx("drill", done && "is-done")}>
            <button type="button" className="drill__check" disabled={readOnly} onClick={() => onToggle(drill.id, !done)} aria-pressed={done} aria-label={`${done ? "Unmark" : "Mark"} ${drill.name} done`}>
              <Check size={16} />
            </button>
            <div>
              <strong>{drill.name}</strong>
              <span>{drill.prescription}{drill.optional ? " · optional" : ""} · {drill.why}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ExerciseFlags({ exerciseLog, onChange, readOnly }: { exerciseLog: ExerciseLog; onChange: (log: ExerciseLog) => void; readOnly: boolean }) {
  const flags = exerciseLog.flags ?? [];
  const joint = flags.find((flag) => flag.kind === "joint-discomfort");
  const form = flags.find((flag) => flag.kind === "form-breakdown");
  const updateFlag = (kind: ExerciseFlag["kind"], enabled: boolean, patch: Partial<ExerciseFlag> = {}) => {
    const existing = flags.find((flag) => flag.kind === kind);
    const others = flags.filter((flag) => flag.kind !== kind);
    const next = enabled
      ? [...others, {
          id: existing?.id ?? createId(`flag-${kind}`),
          kind,
          severity: patch.severity ?? existing?.severity ?? "notice",
          area: patch.area ?? existing?.area,
          note: patch.note ?? existing?.note,
          createdAt: existing?.createdAt ?? new Date().toISOString(),
        }]
      : others;
    onChange({ ...exerciseLog, flags: next.length ? next : undefined });
  };
  return (
    <div className="stack" style={{ gap: 8 }}>
      <label className="toggle-row">
        <div><strong>Joint discomfort</strong><span>Shoulder, elbow, knee… Informs the next briefing; not a diagnosis.</span></div>
        <input className="switch" type="checkbox" checked={!!joint} disabled={readOnly} onChange={(event) => updateFlag("joint-discomfort", event.target.checked)} />
      </label>
      {joint && (
        <div className="form-grid">
          <label className="field">
            Area
            <select disabled={readOnly} value={joint.area ?? "other"} onChange={(event) => updateFlag("joint-discomfort", true, { area: event.target.value })}>
              {["shoulder", "elbow", "wrist", "lower back", "hip", "knee", "ankle", "other"].map((area) => <option key={area} value={area}>{area}</option>)}
            </select>
          </label>
          <label className="field">
            Effect
            <select disabled={readOnly} value={joint.severity} onChange={(event) => updateFlag("joint-discomfort", true, { severity: event.target.value as ExerciseFlag["severity"] })}>
              <option value="notice">Noticed it</option>
              <option value="limit">Limited the exercise</option>
              <option value="stop">Stopped the exercise</option>
            </select>
          </label>
        </div>
      )}
      <label className="toggle-row">
        <div><strong>Form broke down</strong><span>Lost position or range on working sets.</span></div>
        <input className="switch" type="checkbox" checked={!!form} disabled={readOnly} onChange={(event) => updateFlag("form-breakdown", event.target.checked)} />
      </label>
      {form && (
        <label className="field">
          Effect
          <select disabled={readOnly} value={form.severity} onChange={(event) => updateFlag("form-breakdown", true, { severity: event.target.value as ExerciseFlag["severity"] })}>
            <option value="notice">One rep lost position</option>
            <option value="limit">Repeated breakdown</option>
            <option value="stop">Stopped the exercise</option>
          </select>
        </label>
      )}
    </div>
  );
}

export function ShortOnTimeSelector({ log, options, onApply }: { log: WorkoutLog; options: NextWorkoutBriefing["shortOnTime"]; onApply: (included: Set<string>) => void }) {
  const signature = log.exerciseLogs.map((entry) => `${entry.exerciseId}:${entry.skipped ? 0 : 1}`).join("|");
  const [included, setIncluded] = useState<Set<string>>(() => new Set(log.exerciseLogs.filter((entry) => !entry.skipped).map((entry) => entry.exerciseId)));
  useEffect(() => {
    setIncluded(new Set(log.exerciseLogs.filter((entry) => !entry.skipped).map((entry) => entry.exerciseId)));
  }, [signature]);
  const rankById = new Map(options.map((option) => [option.exerciseId, option]));
  const name = (id: string) => findExercise(id)?.name ?? workoutForLog(log).cardio?.find((item) => item.id === id)?.name ?? exerciseNameForId(id);
  const toggle = (id: string) => setIncluded((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const cut = log.exerciseLogs.filter((entry) => !included.has(entry.exerciseId)).length;
  return (
    <div className="stack">
      <p className="muted small">Ranked by the smallest cost to your week. Priority lifts and the only direct work for a muscle are protected first. Cuts earn no completion, PR or volume credit; restore them any time.</p>
      <div>
        {log.exerciseLogs.map((entry) => {
          const option = rankById.get(entry.exerciseId);
          const on = included.has(entry.exerciseId);
          return (
            <label key={entry.id} className="toggle-row">
              <div>
                <strong style={{ textDecoration: on ? "none" : "line-through", color: on ? "var(--text)" : "var(--text-3)" }}>{name(entry.exerciseId)}</strong>
                <span>{option ? `Suggested cut #${option.rank} · ${option.rationale}` : "Keep if possible"}</span>
              </div>
              <input className="switch" type="checkbox" checked={on} onChange={() => toggle(entry.exerciseId)} />
            </label>
          );
        })}
      </div>
      <button type="button" className="btn btn--primary btn--block" onClick={() => onApply(new Set(included))}>
        {cut ? `Apply · cut ${cut}` : "Keep full plan"}
      </button>
    </div>
  );
}
