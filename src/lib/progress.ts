import {
  BodyWeightLog,
  DayKey,
  Exercise,
  ExerciseLog,
  ProgramSettings,
  SetLog,
  WorkoutLog,
} from "../types";
import { getWorkoutByKey, trainingDayKeys, workoutDays } from "../data/routine";
import { addDays, dayKeyForDate, daysSince, getCycleInfo, getProgramWeek, todayISO } from "./date";

export const allExercises = Object.values(workoutDays).flatMap((day) => day.exercises);

export function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function findExercise(exerciseId: string): Exercise | undefined {
  return allExercises.find((exercise) => exercise.id === exerciseId);
}

export function exerciseNameForId(exerciseId: string): string {
  const exercise = findExercise(exerciseId);
  if (exercise) return exercise.name;
  const cardio = Object.values(workoutDays)
    .flatMap((day) => day.cardio ?? [])
    .find((item) => item.id === exerciseId);
  return cardio?.name ?? "Workout item";
}

export function createSetLogs(exercise: Exercise): SetLog[] {
  const setCount = exercise.sets ?? 0;
  return Array.from({ length: setCount }, (_, index) => ({
    id: createId("set"),
    setNumber: index + 1,
    target: exercise.seconds ?? exercise.reps ?? "",
    completed: false,
  }));
}

export function createWorkoutLog(date: string, settings: ProgramSettings): WorkoutLog {
  const dayKey = dayKeyForDate(date);
  const workout = getWorkoutByKey(dayKey);
  const effectiveStartDate = settings.startDate || date;
  const cycleInfo = getCycleInfo(effectiveStartDate, date);
  const exerciseLogs: ExerciseLog[] = [
    ...workout.exercises.map((exercise) => ({
      id: createId("exercise"),
      exerciseId: exercise.id,
      completed: false,
      sets: createSetLogs(exercise),
    })),
    ...(workout.cardio ?? []).map((cardio) => ({
      id: createId("cardio"),
      exerciseId: cardio.id,
      completed: false,
      sets: [],
      cardio: {
        duration: "",
        incline: "",
        speed: "",
        intensityNotes: cardio.intensity,
        completed: false,
      },
    })),
  ];
  return {
    id: createId("workout"),
    date,
    week: cycleInfo.programWeek,
    cycle: cycleInfo.cycle,
    weekInCycle: cycleInfo.weekInCycle,
    dayKey,
    workoutTitle: workout.title,
    status: "draft",
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    exerciseLogs,
  };
}

export function getOrCreateLog(date: string, logs: WorkoutLog[], settings: ProgramSettings): WorkoutLog {
  const dayKey = dayKeyForDate(date);
  return logs.find((log) => log.date === date && log.dayKey === dayKey) ?? createWorkoutLog(date, settings);
}

export function isTrainingDay(dayKey: DayKey): boolean {
  return trainingDayKeys.includes(dayKey);
}

export function numericValue(value?: string): number {
  if (!value) return 0;
  const match = value.match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

export function repsForSet(set: SetLog, exercise?: Exercise): number {
  if (exercise?.kind === "timed") return numericValue(set.seconds);
  if (exercise?.unilateral) {
    return numericValue(set.leftReps) + numericValue(set.rightReps);
  }
  return numericValue(set.reps);
}

export function setVolume(set: SetLog, exercise?: Exercise): number {
  if (exercise?.kind !== "strength") return 0;
  const weight = numericValue(set.weight);
  return weight * repsForSet(set, exercise);
}

export function exerciseVolume(log: ExerciseLog): number {
  const exercise = findExercise(log.exerciseId);
  return log.sets.reduce((total, set) => total + setVolume(set, exercise), 0);
}

export function workoutVolume(log: WorkoutLog): number {
  return log.exerciseLogs.reduce((total, exerciseLog) => total + exerciseVolume(exerciseLog), 0);
}

export function completedSetCount(log: WorkoutLog): number {
  return log.exerciseLogs.reduce((total, exerciseLog) => total + exerciseLog.sets.filter((set) => set.completed).length, 0);
}

export function completedExerciseCount(log: WorkoutLog): number {
  return log.exerciseLogs.filter((exerciseLog) => exerciseLog.completed || exerciseLog.cardio?.completed).length;
}

export function totalProgramWorkouts(): number {
  return trainingDayKeys.length * 8;
}

export function completedProgramWorkouts(logs: WorkoutLog[]): number {
  return logs.filter((log) => log.status === "completed" && isTrainingDay(log.dayKey)).length;
}

export function completedWorkoutsThisWeek(logs: WorkoutLog[], settings: ProgramSettings, date = todayISO()): number {
  const week = getProgramWeek(settings.startDate || date, date);
  return logs.filter((log) => log.status === "completed" && log.week === week && isTrainingDay(log.dayKey)).length;
}

export function plannedTrainingDaysElapsedThisWeek(settings: ProgramSettings, date = todayISO()): number {
  const week = getProgramWeek(settings.startDate || date, date);
  const startOffset = (week - 1) * 7;
  const elapsed = Math.max(0, Math.min(6, daysSince(settings.startDate, date) - startOffset));
  let count = 0;
  for (let i = 0; i <= elapsed; i += 1) {
    const dayKey = dayKeyForDate(addDays(settings.startDate, startOffset + i));
    if (isTrainingDay(dayKey)) count += 1;
  }
  return count;
}

export function weeklySummaries(logs: WorkoutLog[], settings: ProgramSettings) {
  const maxLoggedWeek = Math.max(
    8,
    ...logs.map((log) => log.week || getProgramWeek(settings.startDate || log.date, log.date)),
    getProgramWeek(settings.startDate || todayISO(), todayISO()),
  );
  return Array.from({ length: maxLoggedWeek }, (_, index) => {
    const week = index + 1;
    const weekLogs = logs.filter((log) => log.week === week && log.status === "completed");
    const trainingLogs = weekLogs.filter((log) => isTrainingDay(log.dayKey));
    const notes = weekLogs.map((log) => log.notes).filter(Boolean) as string[];
    return {
      week,
      cycle: Math.floor((week - 1) / 8) + 1,
      weekInCycle: ((week - 1) % 8) + 1,
      completed: trainingLogs.length,
      sets: weekLogs.reduce((sum, log) => sum + completedSetCount(log), 0),
      volume: weekLogs.reduce((sum, log) => sum + workoutVolume(log), 0),
      missed: Math.max(0, trainingDayKeys.length - trainingLogs.length),
      notes,
      warning: hasRecoveryWarning(logs, week, settings),
    };
  });
}

export function effectiveProgramStartDate(settings: ProgramSettings, logs: WorkoutLog[], fallback = todayISO()): string {
  if (settings.startDate) return settings.startDate;
  return [...logs].sort((a, b) => a.date.localeCompare(b.date))[0]?.date ?? fallback;
}

export function refreshProgramFields(log: WorkoutLog, startDate: string): WorkoutLog {
  const cycleInfo = getCycleInfo(startDate || log.date, log.date);
  return {
    ...log,
    week: cycleInfo.programWeek,
    cycle: cycleInfo.cycle,
    weekInCycle: cycleInfo.weekInCycle,
  };
}

export function completedWorkoutsInCurrentCycle(logs: WorkoutLog[], settings: ProgramSettings, date = todayISO()): number {
  const cycle = getCycleInfo(settings.startDate || date, date).cycle;
  return logs.filter((log) => log.status === "completed" && isTrainingDay(log.dayKey) && (log.cycle ?? Math.floor((log.week - 1) / 8) + 1) === cycle).length;
}

export function cycleWorkoutTarget(): number {
  return trainingDayKeys.length * 8;
}

export function prefillWorkoutLogFromHistory(log: WorkoutLog, logs: WorkoutLog[]): WorkoutLog {
  return {
    ...log,
    exerciseLogs: log.exerciseLogs.map((exerciseLog) => {
      const exercise = findExercise(exerciseLog.exerciseId);
      if (!exercise) return exerciseLog;
      const previous = previousExercisePerformance(logs, log.date, exercise.name);
      if (!previous) return exerciseLog;
      return {
        ...exerciseLog,
        sets: exerciseLog.sets.map((set, index) => ({
          ...set,
          weight: previous.exerciseLog.sets[index]?.weight ?? set.weight,
        })),
      };
    }),
  };
}

export function previousSetSummary(exerciseLog: ExerciseLog, exercise?: Exercise): string {
  if (!exerciseLog.sets.length) return "";
  return exerciseLog.sets
    .map((set) => {
      const performance = exercise?.kind === "timed"
        ? `${set.seconds || "-"} sec`
        : exercise?.unilateral
          ? `${set.leftReps || "-"}/${set.rightReps || "-"} reps`
          : `${set.reps || "-"} reps`;
      return `S${set.setNumber}: ${set.weight || "-"} lb x ${performance}`;
    })
    .join(" · ");
}

export function hasRecoveryWarning(logs: WorkoutLog[], week: number, _settings: ProgramSettings): boolean {
  const weekLogs = logs
    .filter((log) => log.week === week && log.status === "completed")
    .sort((a, b) => a.date.localeCompare(b.date));
  const warningTerms = /pain|ache|pinch|sharp|sore|tired|exhausted|sleep|motivation|regress|dropped/i;
  if (weekLogs.some((log) => warningTerms.test(log.notes ?? ""))) return true;
  const volumes = weekLogs.map(workoutVolume).filter((volume) => volume > 0);
  if (volumes.length < 3) return false;
  const last = volumes.at(-1) ?? 0;
  const previous = volumes.at(-2) ?? 0;
  const before = volumes.at(-3) ?? 0;
  return last < previous && previous < before;
}

export function latestBodyWeight(weights: BodyWeightLog[]): BodyWeightLog | undefined {
  return [...weights].sort((a, b) => b.date.localeCompare(a.date)).at(0);
}

export function sevenDayAverage(weights: BodyWeightLog[]): number | null {
  const sorted = [...weights].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);
  if (sorted.length < 7) return null;
  return sorted.reduce((sum, item) => sum + item.weight, 0) / sorted.length;
}

export function bodyWeightChange(weights: BodyWeightLog[]): number | null {
  const sorted = [...weights].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 2) return null;
  return sorted.at(-1)!.weight - sorted[0].weight;
}

export function topRepTarget(target?: string): number | null {
  if (!target) return null;
  const numbers = [...target.matchAll(/\d+/g)].map((match) => Number(match[0]));
  if (!numbers.length) return null;
  return Math.max(...numbers);
}

export function containsPainOrRegression(text: string): boolean {
  return /pain|pinch|sharp|ache|hurt|irritation|regress|dropped|worse|shortened|sleep bad|bad sleep|heavy warm/i.test(text);
}

export function progressionAdvice(log: ExerciseLog): string {
  const exercise = findExercise(log.exerciseId);
  if (!exercise) return "Log this consistently before changing anything.";
  const text = `${log.notes ?? ""} ${log.sets.map((set) => set.notes ?? "").join(" ")}`;
  if (containsPainOrRegression(text)) {
    return "Hold steady or reduce range/volume. Pain or regression language was logged.";
  }
  if (exercise.kind === "timed") {
    return "Add seconds only while bracing stays clean. Stop when control breaks.";
  }
  const top = topRepTarget(exercise.reps);
  if (!top) return "Keep chasing cleaner reps before changing load.";
  const completedSets = log.sets.filter((set) => set.completed);
  if (completedSets.length !== (exercise.sets ?? 0)) return "Finish all planned sets before progressing.";
  const hitTop = completedSets.every((set) => {
    if (exercise.unilateral) {
      return numericValue(set.leftReps) >= top && numericValue(set.rightReps) >= top;
    }
    return numericValue(set.reps) >= top;
  });
  if (hitTop) return "Add weight next time if form, range, sleep, and joints were solid.";
  return "Keep the same weight and add clean reps next time.";
}

export function exerciseSessions(logs: WorkoutLog[], exerciseName: string) {
  return logs
    .filter((log) => log.status === "completed")
    .flatMap((log) =>
      log.exerciseLogs
        .map((exerciseLog) => ({ workout: log, exerciseLog, exercise: findExercise(exerciseLog.exerciseId) }))
        .filter((item) => item.exercise?.name === exerciseName),
    )
    .sort((a, b) => a.workout.date.localeCompare(b.workout.date));
}

export function previousExercisePerformance(logs: WorkoutLog[], currentDate: string, exerciseName: string) {
  return exerciseSessions(logs, exerciseName)
    .filter((item) => item.workout.date < currentDate)
    .at(-1);
}

export function compareLastTwoExerciseSessions(logs: WorkoutLog[], exerciseName: string): "Improved" | "Held steady" | "Regressed" | "New" {
  const sessions = exerciseSessions(logs, exerciseName);
  if (sessions.length < 2) return "New";
  const previous = sessions.at(-2)!;
  const current = sessions.at(-1)!;
  const previousVolume = exerciseVolume(previous.exerciseLog);
  const currentVolume = exerciseVolume(current.exerciseLog);
  if (currentVolume > previousVolume) return "Improved";
  if (currentVolume < previousVolume) return "Regressed";
  return "Held steady";
}
