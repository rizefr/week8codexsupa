import { AppData, Exercise, MuscleGroup, WorkoutLog } from "../types";
import type { PRRecord } from "./gamification";
import { canonicalWorkoutLogs } from "./gamification";
import { addDays, dayKeyForDate, todayISO } from "./date";
import { findExercise, setHasRecordedPerformance, validLoadValue, loadRequiredForExercise, validRirValue } from "./progress";
import { CORNELL_ID, cornellActive, cornellDays, cornellTrainingDays, cornellWeekRange, exercisesForDate } from "../data/cornell";

export const muscleLabels: Record<MuscleGroup, string> = {
  lats: "Lats",
  "upper-back": "Upper back",
  "upper-chest": "Upper chest",
  chest: "Chest",
  "side-delts": "Side delts",
  "rear-delts": "Rear delts",
  "front-delts": "Front delts",
  biceps: "Biceps",
  triceps: "Triceps",
  forearms: "Forearms",
  "abs-core": "Abs",
  quads: "Quads",
  hamstrings: "Hamstrings",
  glutes: "Glutes",
  calves: "Calves",
};

export const muscleGroupOrder = Object.keys(muscleLabels) as MuscleGroup[];

/** Display order grouped the way the goal is framed: V-taper first, then arms, core, legs. */
export const muscleDisplayGroups: Array<{ title: string; groups: MuscleGroup[] }> = [
  { title: "Shoulders & back", groups: ["side-delts", "rear-delts", "front-delts", "lats", "upper-back"] },
  { title: "Chest & arms", groups: ["upper-chest", "chest", "biceps", "triceps", "forearms"] },
  { title: "Core & legs", groups: ["abs-core", "quads", "hamstrings", "glutes", "calves"] },
];

/**
 * Weekly fractional-set targets for a full training week (weeks 2-7).
 * Direct sets count 1, indirect sets 0.5 (Pelland et al. 2025). Ranges are
 * individualized starting doses for an upper-priority program, not universal optima.
 */
export const muscleTargets: Record<MuscleGroup, { min: number; max: number; priority?: boolean }> = {
  "side-delts": { min: 9, max: 14, priority: true },
  lats: { min: 8, max: 14, priority: true },
  "upper-back": { min: 6, max: 12 },
  "rear-delts": { min: 4, max: 8 },
  "front-delts": { min: 2, max: 8 },
  "upper-chest": { min: 6, max: 10, priority: true },
  chest: { min: 5, max: 12 },
  biceps: { min: 8, max: 14, priority: true },
  triceps: { min: 6, max: 12, priority: true },
  forearms: { min: 0, max: 6 },
  "abs-core": { min: 4, max: 8 },
  quads: { min: 5, max: 10 },
  hamstrings: { min: 5, max: 8 },
  glutes: { min: 2, max: 6 },
  calves: { min: 3, max: 6 },
};

export type MuscleStatus = "none" | "low" | "building" | "on-target" | "above";

export const muscleStatusLabel: Record<MuscleStatus, string> = {
  none: "Not trained",
  low: "Light",
  building: "Building",
  "on-target": "On target",
  above: "Above range",
};

/** First listed muscle is the primary target (1 set); the rest are indirect (0.5). */
export function exerciseContributions(exercise: Exercise): Array<{ group: MuscleGroup; weight: number }> {
  const groups = exercise.muscleGroups ?? [];
  return groups.map((group, index) => ({ group, weight: index === 0 ? 1 : 0.5 }));
}

const pushUpContribution: Array<{ group: MuscleGroup; weight: number }> = [
  { group: "chest", weight: 1 },
  { group: "triceps", weight: 0.5 },
  { group: "front-delts", weight: 0.5 },
];

function numeric(value?: string): number {
  const match = value?.match(/\d+(\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

export interface MuscleVolume {
  group: MuscleGroup;
  label: string;
  /** Fractional hard sets. */
  sets: number;
  directSets: number;
  completedSets: number;
  sources: Array<{ name: string; sets: number }>;
  workouts: number;
}

export function emptyVolume(): Map<MuscleGroup, MuscleVolume> {
  return new Map(muscleGroupOrder.map((group) => [group, {
    group, label: muscleLabels[group], sets: 0, directSets: 0, completedSets: 0, sources: [], workouts: 0,
  }]));
}

function addSource(record: MuscleVolume, name: string, sets: number) {
  const existing = record.sources.find((source) => source.name === name);
  if (existing) existing.sets += sets;
  else record.sources.push({ name, sets });
}

/** Completed fractional sets per muscle between two dates (inclusive). */
export function calculateMuscleVolume(data: AppData, fromDate: string, toDate: string): Map<MuscleGroup, MuscleVolume> {
  const records = emptyVolume();
  const touched = new Map<MuscleGroup, Set<string>>();
  canonicalWorkoutLogs(data.workoutLogs)
    .filter((log) => log.status === "completed" && log.date >= fromDate && log.date <= toDate)
    .forEach((log) => {
      log.exerciseLogs.forEach((exerciseLog) => {
        if (exerciseLog.skipped) return;
        const pushUps = numeric(exerciseLog.cardio?.pushUpSets);
        if (pushUps > 0 && pushUps <= 20 && exerciseLog.cardio?.completed) {
          pushUpContribution.forEach(({ group, weight }) => {
            const record = records.get(group)!;
            record.sets += pushUps * weight;
            if (weight === 1) record.directSets += pushUps;
            record.completedSets += pushUps;
            addSource(record, "ROTC push-ups", pushUps * weight);
            touched.set(group, (touched.get(group) ?? new Set()).add(log.id));
          });
        }
        const exercise = findExercise(exerciseLog.exerciseId);
        if (!exercise?.muscleGroups?.length) return;
        const completed = exerciseLog.sets.filter((set) => set.completed
          && setHasRecordedPerformance(set, exercise)
          && (!loadRequiredForExercise(exercise) || validLoadValue(set.weight) > 0)
          && (!set.rir || validRirValue(set.rir))).length;
        if (!completed) return;
        exerciseContributions(exercise).forEach(({ group, weight }) => {
          const record = records.get(group)!;
          record.sets += completed * weight;
          if (weight === 1) record.directSets += completed;
          record.completedSets += completed;
          addSource(record, exerciseLog.performedExerciseName ?? exercise.name, completed * weight);
          touched.set(group, (touched.get(group) ?? new Set()).add(log.id));
        });
      });
    });
  records.forEach((record, group) => {
    record.sets = Math.round(record.sets * 10) / 10;
    record.workouts = touched.get(group)?.size ?? 0;
    record.sources.sort((a, b) => b.sets - a.sets);
  });
  return records;
}

/** Planned fractional sets for the essential sessions inside a date window. */
export function plannedMuscleVolume(fromDate: string, toDate: string): Map<MuscleGroup, number> {
  const planned = new Map<MuscleGroup, number>(muscleGroupOrder.map((group) => [group, 0]));
  for (let date = fromDate; date <= toDate; date = addDays(date, 1)) {
    if (!cornellActive(date)) continue;
    const dayKey = dayKeyForDate(date);
    if (!cornellTrainingDays.includes(dayKey)) continue;
    exercisesForDate(cornellDays[dayKey], date).forEach((exercise) => {
      exerciseContributions(exercise).forEach(({ group, weight }) => {
        planned.set(group, (planned.get(group) ?? 0) + (exercise.sets ?? 0) * weight);
      });
    });
  }
  planned.forEach((value, group) => planned.set(group, Math.round(value * 10) / 10));
  return planned;
}

/**
 * Status compares completed sets with the evidence range, scaled by how much of
 * the range this week's plan actually prescribes (deload/calibration weeks plan less).
 */
export function muscleStatus(group: MuscleGroup, sets: number, plannedScale = 1, plannedSoFar?: number): MuscleStatus {
  const target = muscleTargets[group];
  // Mid-week (or in a lighter week) the bar is what the plan has scheduled so far.
  const min = plannedSoFar !== undefined && plannedSoFar > 0 ? Math.min(target.min * plannedScale, plannedSoFar) : target.min * plannedScale;
  const max = target.max * Math.max(plannedScale, 0.5);
  if (sets <= 0) return "none";
  if (min > 0 && sets < min * 0.5) return "low";
  if (sets < min) return "building";
  if (sets > max) return "above";
  return "on-target";
}

export interface MuscleWeekSummary {
  from: string;
  to: string;
  rows: Array<MuscleVolume & { planned: number; status: MuscleStatus; target: { min: number; max: number; priority?: boolean } }>;
  onTarget: number;
  priorityOnTarget: number;
  priorityTotal: number;
  /** 1 for a full week; lower in calibration/deload weeks. */
  planScale: number;
}

const fullWeekReference = (() => {
  // A normal week-3 reference for scaling: the plan's full prescription.
  const reference = new Map<MuscleGroup, number>(muscleGroupOrder.map((group) => [group, 0]));
  cornellTrainingDays.forEach((dayKey) => {
    cornellDays[dayKey].exercises.forEach((exercise) => {
      exerciseContributions(exercise).forEach(({ group, weight }) => {
        reference.set(group, (reference.get(group) ?? 0) + (exercise.sets ?? 0) * weight);
      });
    });
  });
  return reference;
})();

export function summarizeMuscleWeek(data: AppData, date = todayISO()): MuscleWeekSummary {
  const { from, to } = cornellWeekRange(date);
  return summarizeMuscleRange(data, from, to);
}

export function summarizeMuscleRange(data: AppData, from: string, to: string): MuscleWeekSummary {
  const volume = calculateMuscleVolume(data, from, to);
  const planned = plannedMuscleVolume(from, to);
  const plannedTotal = Array.from(planned.values()).reduce((sum, value) => sum + value, 0);
  const referenceTotal = Array.from(fullWeekReference.values()).reduce((sum, value) => sum + value, 0);
  const planScale = referenceTotal ? Math.min(1, Math.max(0.4, plannedTotal / referenceTotal)) : 1;
  const rows = muscleGroupOrder.map((group) => {
    const record = volume.get(group)!;
    return {
      ...record,
      planned: planned.get(group) ?? 0,
      status: muscleStatus(group, record.sets, planScale, planned.get(group) ?? 0),
      target: muscleTargets[group],
    };
  });
  const priority = rows.filter((row) => row.target.priority);
  return {
    from,
    to,
    rows,
    onTarget: rows.filter((row) => row.status === "on-target" || row.status === "above" || (row.target.min === 0 && row.sets > 0)).length,
    priorityOnTarget: priority.filter((row) => row.status === "on-target" || row.status === "above").length,
    priorityTotal: priority.length,
    planScale,
  };
}

// ---------------------------------------------------------------------------
// Back-compatible API used by coach.ts and older views.
// ---------------------------------------------------------------------------
export type MuscleProgress = {
  group: MuscleGroup;
  label: string;
  sets: number;
  stimulusPoints: number;
  prCount: number;
  completedWorkouts: number;
  score: number;
  intensity: number;
  exercises: string[];
  recentPRs: string[];
  trend: string;
  mastery: string;
  nextTarget: string;
  status: MuscleStatus;
};

const statusIntensity: Record<MuscleStatus, number> = { none: 0, low: 1, building: 2, "on-target": 3, above: 4 };

export function muscleMasteryState(progress: { intensity: number }): string {
  return ["Not trained", "Light", "Building", "On target", "Above range"][progress.intensity] ?? "Not trained";
}

export function calculateMuscleProgress(data: AppData, prs: PRRecord[], fromDate = addDays(todayISO(), -6), toDate = todayISO()): MuscleProgress[] {
  const volume = calculateMuscleVolume(data, fromDate, toDate);
  const days = Math.max(1, Math.round((Date.parse(`${toDate}T12:00:00`) - Date.parse(`${fromDate}T12:00:00`)) / 86400000) + 1);
  const weeks = Math.max(1, days / 7);
  return muscleGroupOrder.map((group) => {
    const record = volume.get(group)!;
    const weekly = record.sets / weeks;
    // Single-day windows (a recap) compare against a per-session share of the week.
    const status = days <= 1
      ? (record.sets <= 0 ? "none" : record.sets >= 3 ? "on-target" : record.sets >= 1.5 ? "building" : "low")
      : muscleStatus(group, weekly);
    const intensity = statusIntensity[status];
    const recentPRs = prs
      .filter((pr) => pr.date >= fromDate && pr.date <= toDate && record.sources.some((source) => source.name === pr.exerciseName))
      .map((pr) => `${pr.exerciseName}: ${pr.label}`);
    const exercises = record.sources.map((source) => source.name);
    return {
      group,
      label: muscleLabels[group],
      sets: record.sets,
      stimulusPoints: record.sets,
      prCount: recentPRs.length,
      completedWorkouts: record.workouts,
      score: record.sets,
      intensity,
      exercises,
      recentPRs: recentPRs.slice(-3).reverse(),
      trend: muscleStatusLabel[status],
      mastery: muscleStatusLabel[status],
      status,
      nextTarget: exercises.length
        ? `Review the latest comparable ${exercises[0]} session before progressing; this map measures logged work, not muscle growth.`
        : `Next: complete the scheduled session that trains ${muscleLabels[group].toLowerCase()}.`,
    };
  });
}

export function musclesForWorkout(log: WorkoutLog): MuscleGroup[] {
  const groups = new Set<MuscleGroup>();
  log.exerciseLogs.forEach((exerciseLog) => {
    if (exerciseLog.skipped) return;
    if (numeric(exerciseLog.cardio?.pushUpSets) > 0) pushUpContribution.forEach(({ group }) => groups.add(group));
    const exercise = findExercise(exerciseLog.exerciseId);
    if (!exerciseLog.completed && !exerciseLog.sets.some((set) => set.completed)) return;
    exercise?.muscleGroups?.forEach((group) => groups.add(group));
  });
  return Array.from(groups);
}

export function weeklyMuscleFocus(progress: MuscleProgress[]) {
  const ranked = [...progress].sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
  const trained = ranked.filter((item) => item.score > 0);
  const tracked = progress.filter((item) => muscleTargets[item.group].min > 0);
  const light = [...tracked].sort((a, b) => a.score / muscleTargets[a.group].min - b.score / muscleTargets[b.group].min || a.label.localeCompare(b.label));
  return {
    leading: trained[0],
    secondary: trained[1],
    lightest: trained.length ? light[0] : undefined,
  };
}

/** Whether a log belongs to the Cornell program (used to scope weekly summaries). */
export function isCornellLog(log: WorkoutLog): boolean {
  return log.programId === CORNELL_ID;
}
