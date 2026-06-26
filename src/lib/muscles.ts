import { AppData, Exercise, MuscleGroup, WorkoutLog } from "../types";
import type { PRRecord } from "./gamification";
import { canonicalWorkoutLogs } from "./gamification";
import { addDays, todayISO } from "./date";
import { allExercises, findExercise } from "./progress";

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
  "abs-core": "Abs / core",
  quads: "Quads",
  hamstrings: "Hamstrings",
  glutes: "Glutes",
  calves: "Calves",
};

export const muscleGroupOrder = Object.keys(muscleLabels) as MuscleGroup[];

const targetTerms: Record<MuscleGroup, string[]> = {
  lats: ["lats", "lat"],
  "upper-back": ["upper back"],
  "upper-chest": ["upper chest"],
  chest: ["chest"],
  "side-delts": ["side delts", "side delt"],
  "rear-delts": ["rear delts", "rear delt"],
  "front-delts": ["front delts", "front delt", "delts"],
  biceps: ["biceps"],
  triceps: ["triceps"],
  forearms: ["forearms", "forearm"],
  "abs-core": ["abs", "core"],
  quads: ["quads", "quad"],
  hamstrings: ["hamstrings", "hamstring"],
  glutes: ["glutes", "glute"],
  calves: ["calves", "calf"],
};

function primaryMuscleForExercise(exercise: Exercise): MuscleGroup | undefined {
  const target = exercise.target.toLowerCase();
  const ranked = (exercise.muscleGroups ?? []).map((group) => ({
    group,
    index: Math.min(...targetTerms[group].map((term) => {
      const position = target.indexOf(term);
      return position < 0 ? Number.POSITIVE_INFINITY : position;
    })),
  })).sort((a, b) => a.index - b.index);
  return ranked.find((item) => Number.isFinite(item.index))?.group ?? exercise.muscleGroups?.[0];
}

export type MuscleProgress = {
  group: MuscleGroup;
  label: string;
  sets: number;
  stimulusPoints: number;
  prCount: number;
  completedWorkouts: number;
  score: number;
  intensity: 0 | 1 | 2 | 3 | 4;
  exercises: string[];
  recentPRs: string[];
  trend: "No recent work" | "Light" | "On track" | "High" | "Standout";
  mastery: "Needs Attention" | "Light" | "On Track" | "High Stimulus" | "Standout";
  nextTarget: string;
};

export function muscleMasteryState(progress: Pick<MuscleProgress, "intensity">): MuscleProgress["mastery"] {
  if (progress.intensity === 0) return "Needs Attention";
  if (progress.intensity === 1) return "Light";
  if (progress.intensity === 2) return "On Track";
  if (progress.intensity === 3) return "High Stimulus";
  return "Standout";
}

function canonicalCompletedLogs(logs: WorkoutLog[], fromDate: string, toDate: string): WorkoutLog[] {
  return canonicalWorkoutLogs(logs).filter(
    (log) => log.status === "completed" && log.date >= fromDate && log.date <= toDate,
  );
}

export function calculateMuscleProgress(
  data: AppData,
  prs: PRRecord[],
  fromDate = addDays(todayISO(), -6),
  toDate = todayISO(),
): MuscleProgress[] {
  const records = new Map<MuscleGroup, { sets: number; stimulus: number; prs: string[]; workouts: Set<string>; exercises: Set<string> }>();
  muscleGroupOrder.forEach((group) => records.set(group, { sets: 0, stimulus: 0, prs: [], workouts: new Set(), exercises: new Set() }));

  canonicalCompletedLogs(data.workoutLogs, fromDate, toDate).forEach((log) => {
    log.exerciseLogs.forEach((exerciseLog) => {
      const exercise = findExercise(exerciseLog.exerciseId);
      if (!exercise?.muscleGroups?.length) return;
      const completedSets = exerciseLog.sets.filter((set) => set.completed).length;
      if (!completedSets && !exerciseLog.completed) return;
      const primaryMuscle = primaryMuscleForExercise(exercise);
      exercise.muscleGroups.forEach((group) => {
        const record = records.get(group)!;
        record.sets += completedSets;
        record.stimulus += completedSets * (group === primaryMuscle ? 1 : 0.5);
        record.workouts.add(log.id);
        record.exercises.add(exercise.name);
      });
    });
  });

  prs.filter((pr) => pr.date >= fromDate && pr.date <= toDate).forEach((pr) => {
    const exercise = allExercises.find((item) => item.name === pr.exerciseName);
    exercise?.muscleGroups?.forEach((group) => {
      records.get(group)!.prs.push(`${pr.exerciseName}: ${pr.label}`);
    });
  });

  return muscleGroupOrder.map((group) => {
    const record = records.get(group)!;
    const stimulusPoints = Number(record.stimulus.toFixed(1));
    const score = Number((stimulusPoints + record.prs.length * 2 + Math.min(2, record.workouts.size * 0.5)).toFixed(1));
    const intensity: MuscleProgress["intensity"] = score === 0 ? 0 : score <= 2.5 ? 1 : score <= 6 ? 2 : score <= 10 ? 3 : 4;
    const trend: MuscleProgress["trend"] = ["No recent work", "Light", "On track", "High", "Standout"][intensity] as MuscleProgress["trend"];
    const exercises = Array.from(record.exercises).sort();
    return {
      group,
      label: muscleLabels[group],
      sets: record.sets,
      stimulusPoints,
      prCount: record.prs.length,
      completedWorkouts: record.workouts.size,
      score,
      intensity,
      exercises,
      recentPRs: record.prs.slice(-3).reverse(),
      trend,
      mastery: muscleMasteryState({ intensity }),
      nextTarget: exercises.length
        ? `Next target: add one clean rep or match quality on ${exercises[0]} before changing load.`
        : `Next target: complete the next scheduled workout that trains ${muscleLabels[group].toLowerCase()}.`,
    };
  });
}

export function musclesForWorkout(log: WorkoutLog): MuscleGroup[] {
  const groups = new Set<MuscleGroup>();
  log.exerciseLogs.forEach((exerciseLog) => {
    const exercise = findExercise(exerciseLog.exerciseId);
    if (!exerciseLog.completed && !exerciseLog.sets.some((set) => set.completed)) return;
    exercise?.muscleGroups?.forEach((group) => groups.add(group));
  });
  return Array.from(groups);
}

export function weeklyMuscleFocus(progress: MuscleProgress[]) {
  const ranked = [...progress].sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
  const trained = ranked.filter((item) => item.score > 0);
  const light = [...progress].sort((a, b) => a.score - b.score || a.label.localeCompare(b.label));
  return {
    leading: trained[0],
    secondary: trained[1],
    lightest: light[0],
  };
}
