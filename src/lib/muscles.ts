import { AppData, MuscleGroup, WorkoutLog } from "../types";
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

export type MuscleProgress = {
  group: MuscleGroup;
  label: string;
  sets: number;
  prCount: number;
  completedWorkouts: number;
  score: number;
  intensity: 0 | 1 | 2 | 3 | 4;
  exercises: string[];
  trend: "No recent work" | "Light" | "On track" | "High" | "Standout";
  nextTarget: string;
};

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
  const records = new Map<MuscleGroup, { sets: number; prs: number; workouts: Set<string>; exercises: Set<string> }>();
  muscleGroupOrder.forEach((group) => records.set(group, { sets: 0, prs: 0, workouts: new Set(), exercises: new Set() }));

  canonicalCompletedLogs(data.workoutLogs, fromDate, toDate).forEach((log) => {
    log.exerciseLogs.forEach((exerciseLog) => {
      const exercise = findExercise(exerciseLog.exerciseId);
      if (!exercise?.muscleGroups?.length) return;
      const completedSets = exerciseLog.sets.filter((set) => set.completed).length;
      if (!completedSets && !exerciseLog.completed) return;
      exercise.muscleGroups.forEach((group) => {
        const record = records.get(group)!;
        record.sets += completedSets;
        record.workouts.add(log.id);
        record.exercises.add(exercise.name);
      });
    });
  });

  prs.filter((pr) => pr.date >= fromDate && pr.date <= toDate).forEach((pr) => {
    const exercise = allExercises.find((item) => item.name === pr.exerciseName);
    exercise?.muscleGroups?.forEach((group) => {
      records.get(group)!.prs += 1;
    });
  });

  return muscleGroupOrder.map((group) => {
    const record = records.get(group)!;
    const score = record.sets + record.prs * 3 + Math.min(3, record.workouts.size);
    const intensity: MuscleProgress["intensity"] = score === 0 ? 0 : score <= 3 ? 1 : score <= 7 ? 2 : score <= 12 ? 3 : 4;
    const trend: MuscleProgress["trend"] = ["No recent work", "Light", "On track", "High", "Standout"][intensity] as MuscleProgress["trend"];
    const exercises = Array.from(record.exercises).sort();
    return {
      group,
      label: muscleLabels[group],
      sets: record.sets,
      prCount: record.prs,
      completedWorkouts: record.workouts.size,
      score,
      intensity,
      exercises,
      trend,
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
