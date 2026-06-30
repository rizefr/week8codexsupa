import {
  BodyWeightLog,
  DayKey,
  Exercise,
  ExerciseTrackingType,
  ExerciseLog,
  ProgramPhase,
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

export function normalizeExerciseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function canonicalExerciseKey(exerciseOrName?: Exercise | string): string {
  if (!exerciseOrName) return "unknown";
  if (typeof exerciseOrName !== "string") {
    return exerciseOrName.canonicalExerciseId ?? normalizeExerciseName(exerciseOrName.name);
  }
  const normalized = normalizeExerciseName(exerciseOrName);
  const match = allExercises.find((exercise) => {
    const names = [exercise.name, exercise.commonName, ...(exercise.aliases ?? [])].filter(Boolean) as string[];
    return names.some((name) => normalizeExerciseName(name) === normalized);
  });
  return match?.canonicalExerciseId ?? normalized;
}

export function comparisonExerciseKey(exerciseOrName?: Exercise | string): string {
  if (!exerciseOrName) return "unknown";
  if (typeof exerciseOrName !== "string") {
    return exerciseOrName.comparisonExerciseId ?? normalizeExerciseName(exerciseOrName.name);
  }
  const normalized = normalizeExerciseName(exerciseOrName);
  const match = allExercises.find((exercise) => {
    const strictNames = [
      exercise.name,
      exercise.commonName,
      ...(exercise.comparisonAliases ?? []),
    ].filter(Boolean) as string[];
    return strictNames.some((name) => normalizeExerciseName(name) === normalized);
  });
  return match?.comparisonExerciseId ?? (match ? normalizeExerciseName(match.name) : normalized);
}

export function exerciseMatches(exercise: Exercise | undefined, query: Exercise | string): boolean {
  if (!exercise) return false;
  return canonicalExerciseKey(exercise) === canonicalExerciseKey(query);
}

export function exerciseComparisonMatches(exercise: Exercise | undefined, query: Exercise | string): boolean {
  if (!exercise) return false;
  return comparisonExerciseKey(exercise) === comparisonExerciseKey(query);
}

export function exerciseDisplayName(exercise: Exercise | undefined, exerciseLog?: ExerciseLog): string {
  if (!exercise) return exerciseLog?.performedExerciseName ?? "Workout item";
  return exerciseLog?.performedExerciseName ?? exercise.name;
}

export function exerciseAliasLabel(exercise?: Exercise): string {
  if (!exercise?.commonName && !exercise?.aliases?.length) return "";
  if (exercise.commonName) return `Also called ${exercise.commonName}`;
  const firstAlias = exercise.aliases?.[0];
  return firstAlias ? `Also called ${firstAlias}` : "";
}

export function programPhaseFromWeekInCycle(weekInCycle = 1): ProgramPhase {
  const normalized = ((Math.max(1, weekInCycle) - 1) % 8) + 1;
  if (normalized <= 2) return "setup";
  if (normalized <= 6) return "growth";
  return "push";
}

export function trackingTypeForExercise(exercise?: Exercise): ExerciseTrackingType {
  if (!exercise) return "weighted-reps";
  if (exercise.trackingType) return exercise.trackingType;
  if (exercise.kind === "timed") return "timed";
  if (exercise.kind === "cardio") return "cardio";
  if (exercise.kind === "rest") return "rest-checkin";
  if (/assisted pull-up|assisted dip/i.test(exercise.name)) return "assistance-reps";
  if (/walkout|reverse crunch|dead bug|plank|hollow|push-up/i.test(exercise.name)) return "bodyweight-reps";
  return "weighted-reps";
}

export function targetRIRForExercise(exercise: Exercise, weekInCycle = 1): string {
  const phase = programPhaseFromWeekInCycle(weekInCycle);
  const fallback = trackingTypeForExercise(exercise) === "timed" || trackingTypeForExercise(exercise) === "bodyweight-reps"
    ? "Stop when control breaks"
    : "1-2";
  return exercise.targetRIRByPhase?.[phase] ?? fallback;
}

export function targetRIRForSet(exercise: Exercise, weekInCycle: number | undefined, setNumber: number): string {
  const target = targetRIRForExercise(exercise, weekInCycle);
  if (!target.includes(";")) return target;
  const [base, final] = target.split(";").map((value) => value.trim());
  return exercise.sets && setNumber === exercise.sets ? final.replace(/^final set\s*/i, "") : base;
}

export function loadLabelForExercise(exercise?: Exercise): string {
  if (!exercise) return "Weight (lb)";
  if (exercise.loadLabel) return exercise.loadLabel;
  const trackingType = trackingTypeForExercise(exercise);
  if (trackingType === "assistance-reps") return "Assistance (lb)";
  if (/db|dumbbell/i.test(exercise.name)) return "Weight (lb per DB)";
  return "Weight (lb)";
}

export function shouldShowLoadInput(exercise?: Exercise): boolean {
  const trackingType = trackingTypeForExercise(exercise);
  return trackingType === "weighted-reps" || trackingType === "assistance-reps";
}

export function loadRequiredForExercise(exercise?: Exercise): boolean {
  return shouldShowLoadInput(exercise) && exercise?.loadRequired !== false;
}

export function rirRequiredForExercise(exercise?: Exercise): boolean {
  if (!exercise) return true;
  const trackingType = trackingTypeForExercise(exercise);
  if (trackingType === "cardio" || trackingType === "rest-checkin") return false;
  if (exercise.rirRequired !== undefined) return exercise.rirRequired;
  return trackingType !== "timed";
}

export function effortLabelForExercise(exercise?: Exercise): string {
  if (!exercise) return "Target RIR";
  if (exercise.effortMode === "control" || !rirRequiredForExercise(exercise)) return "Control cue";
  if (exercise.effortMode === "easy") return "Effort target";
  return "Target RIR";
}

export function loadIsAssistance(exercise?: Exercise): boolean {
  return trackingTypeForExercise(exercise) === "assistance-reps";
}

export function validLoadValue(value?: string): number {
  const parsed = numericValue(value);
  return parsed > 0 && parsed <= 500 ? parsed : 0;
}

export function validRepValue(value?: string): number {
  const parsed = numericValue(value);
  return parsed > 0 && parsed <= 100 ? parsed : 0;
}

export function validSecondValue(value?: string): number {
  const parsed = numericValue(value);
  return parsed > 0 && parsed <= 600 ? parsed : 0;
}

export function validRirValue(value?: string): boolean {
  if (!value) return false;
  const parsed = numericValue(value);
  return parsed >= 0 && parsed <= 10;
}

export function setInputsAreValid(set: SetLog, exercise: Exercise): boolean {
  const trackingType = trackingTypeForExercise(exercise);
  const performanceValid = trackingType === "timed"
    ? validSecondValue(set.seconds) > 0
    : exercise.unilateral
      ? validRepValue(set.leftReps) > 0 && validRepValue(set.rightReps) > 0
      : validRepValue(set.reps) > 0;
  if (!performanceValid) return false;
  if (loadRequiredForExercise(exercise) && !validLoadValue(set.weight)) return false;
  if (rirRequiredForExercise(exercise) && !validRirValue(set.rir)) return false;
  return true;
}

export function autoCompletedSet(set: SetLog, exercise: Exercise): SetLog {
  return {
    ...set,
    completed: set.completionOverride !== "incomplete" && setInputsAreValid(set, exercise),
  };
}

export function cardioInputsAreValid(duration?: string): boolean {
  const value = numericValue(duration);
  return value > 0 && value <= 600;
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

export function createWorkoutLog(date: string, settings: ProgramSettings, performedDayKey: DayKey = dayKeyForDate(date)): WorkoutLog {
  const scheduledDayKey = dayKeyForDate(date);
  const dayKey = performedDayKey;
  const workout = getWorkoutByKey(performedDayKey);
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
    scheduledDayKey,
    performedDayKey,
    isScheduleOverride: performedDayKey !== scheduledDayKey,
    workoutTitle: workout.title,
    status: "draft",
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    exerciseLogs,
  };
}

export function getOrCreateLog(date: string, logs: WorkoutLog[], settings: ProgramSettings, performedDayKey?: DayKey): WorkoutLog {
  if (performedDayKey) {
    return logs.find((log) => log.date === date && log.dayKey === performedDayKey) ?? createWorkoutLog(date, settings, performedDayKey);
  }
  return (
    logs.find((log) => log.date === date && log.status === "draft") ??
    logs.find((log) => log.date === date && log.status === "completed") ??
    logs.find((log) => log.date === date) ??
    createWorkoutLog(date, settings)
  );
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
  if (trackingTypeForExercise(exercise) === "timed") return validSecondValue(set.seconds);
  if (exercise?.unilateral) {
    const left = validRepValue(set.leftReps);
    const right = validRepValue(set.rightReps);
    if (left || right) return left + right;
    return validRepValue(set.reps);
  }
  return validRepValue(set.reps);
}

export function setVolume(set: SetLog, exercise?: Exercise): number {
  if (trackingTypeForExercise(exercise) !== "weighted-reps") return 0;
  const weight = validLoadValue(set.weight);
  return weight * repsForSet(set, exercise) * (exercise?.volumeMultiplier ?? 1);
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
      const previous = previousExercisePerformance(logs, log.date, exercise);
      if (!previous) return exerciseLog;
      if (!shouldShowLoadInput(exercise)) return exerciseLog;
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
  if (!exerciseLog.sets.length) {
    const cardio = exerciseLog.cardio;
    if (!cardio?.duration) return "";
    return [
      `${cardio.duration} min`,
      cardio.incline ? `incline ${cardio.incline}` : "",
      cardio.speed ? `${cardio.speed} mph` : "",
    ].filter(Boolean).join(" · ");
  }
  const showLoad = shouldShowLoadInput(exercise);
  const loadLabel = loadIsAssistance(exercise) ? "lb assistance" : "lb";
  return exerciseLog.sets
    .map((set) => {
      const performance = previousSetPerformance(set, exercise);
      return showLoad ? `S${set.setNumber}: ${set.weight || "-"} ${loadLabel} x ${performance}` : `S${set.setNumber}: ${performance}`;
    })
    .join(" · ");
}

function previousSetPerformance(set: SetLog, exercise?: Exercise): string {
  if (trackingTypeForExercise(exercise) === "timed") return `${set.seconds || "-"} sec`;
  if (exercise?.unilateral) {
    const left = validRepValue(set.leftReps) ? set.leftReps : "";
    const right = validRepValue(set.rightReps) ? set.rightReps : "";
    if (left || right) return `L ${left || "-"} / R ${right || "-"} reps`;
    if (validRepValue(set.reps)) return `${set.reps} reps/side`;
    return "- reps/side";
  }
  return `${set.reps || "-"} reps`;
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
  const trackingType = trackingTypeForExercise(exercise);
  if (exercise.primaryProgression === "control-quality" || trackingType === "bodyweight-reps") {
    return "Progress with cleaner reps and control first. Do not add load or extra volume.";
  }
  if (trackingTypeForExercise(exercise) === "timed") {
    return "Add seconds only while bracing stays clean. Stop when control breaks.";
  }
  if (exercise.canonicalExerciseId === "db-romanian-deadlift") {
    return "Add reps before load. If grip or lower back limits the set, hold load steady and clean up tempo/range.";
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
  if (hitTop && trackingType === "assistance-reps") return "Reduce assistance next time only if reps and form stayed solid.";
  if (hitTop && trackingType === "weighted-reps") return "Add weight next time if form, range, sleep, and joints were solid.";
  if (hitTop) return "Make the reps cleaner or add a small rep target next time; do not add load unless the routine calls for it.";
  return trackingType === "assistance-reps" ? "Keep assistance the same and add clean reps next time." : "Keep the same load/variation and add clean reps next time.";
}

export function exerciseSessions(
  logs: WorkoutLog[],
  exerciseQuery: Exercise | string,
  options: { matchMode?: "strict" | "family" } = {},
) {
  const matches = options.matchMode === "family" ? exerciseMatches : exerciseComparisonMatches;
  return logs
    .filter((log) => log.status === "completed")
    .flatMap((log) =>
      log.exerciseLogs
        .map((exerciseLog) => ({ workout: log, exerciseLog, exercise: findExercise(exerciseLog.exerciseId) }))
        .filter((item) => matches(item.exercise, exerciseQuery)),
    )
    .sort((a, b) => a.workout.date.localeCompare(b.workout.date));
}

export function previousExercisePerformance(logs: WorkoutLog[], currentDate: string, exerciseQuery: Exercise | string) {
  return exerciseSessions(logs, exerciseQuery)
    .filter((item) => item.workout.date < currentDate)
    .at(-1);
}

export function compareLastTwoExerciseSessions(logs: WorkoutLog[], exerciseName: string): "Improved" | "Held steady" | "Regressed" | "New" {
  const sessions = exerciseSessions(logs, exerciseName);
  if (sessions.length < 2) return "New";
  const previous = sessions.at(-2)!;
  const current = sessions.at(-1)!;
  const trackingType = trackingTypeForExercise(current.exercise);
  const previousMetric = progressMetricValue(previous.exerciseLog, previous.exercise);
  const currentMetric = progressMetricValue(current.exerciseLog, current.exercise);
  if (trackingType === "assistance-reps") {
    const previousAssist = bestAssistance(previous.exerciseLog);
    const currentAssist = bestAssistance(current.exerciseLog);
    if (currentMetric > previousMetric || (currentMetric >= previousMetric && currentAssist > 0 && previousAssist > 0 && currentAssist < previousAssist)) return "Improved";
    if (currentMetric < previousMetric) return "Regressed";
    return "Held steady";
  }
  if (currentMetric > previousMetric) return "Improved";
  if (currentMetric < previousMetric) return "Regressed";
  return "Held steady";
}

export function totalRepsForExerciseLog(log: ExerciseLog, exercise?: Exercise): number {
  return log.sets.filter((set) => set.completed).reduce((sum, set) => sum + (trackingTypeForExercise(exercise) === "timed" ? 0 : repsForSet(set, exercise)), 0);
}

export function totalSecondsForExerciseLog(log: ExerciseLog): number {
  return log.sets.filter((set) => set.completed).reduce((sum, set) => sum + validSecondValue(set.seconds), 0);
}

export function bestSetReps(log: ExerciseLog, exercise?: Exercise): number {
  return Math.max(0, ...log.sets.filter((set) => set.completed).map((set) => {
    if (exercise?.unilateral) {
      const left = validRepValue(set.leftReps);
      const right = validRepValue(set.rightReps);
      if (left && right) return Math.min(left, right);
      return Math.max(left, right, validRepValue(set.reps));
    }
    return validRepValue(set.reps);
  }));
}

export function bestTimedSet(log: ExerciseLog): number {
  return Math.max(0, ...log.sets.filter((set) => set.completed).map((set) => validSecondValue(set.seconds)));
}

export function bestAssistance(log: ExerciseLog): number {
  const values = log.sets.filter((set) => set.completed).map((set) => validLoadValue(set.weight)).filter(Boolean);
  return values.length ? Math.min(...values) : 0;
}

export function progressMetricValue(log: ExerciseLog, exercise?: Exercise): number {
  const trackingType = trackingTypeForExercise(exercise);
  if (trackingType === "weighted-reps") return exerciseVolume(log);
  if (trackingType === "timed") return totalSecondsForExerciseLog(log);
  return totalRepsForExerciseLog(log, exercise);
}

export function trendMetricLabels(exercise?: Exercise) {
  const trackingType = trackingTypeForExercise(exercise);
  if (trackingType === "assistance-reps") {
    return { primary: "Total Reps", secondary: "Assistance Trend", best: "Best Assisted Set", tableMetric: "Total Reps" };
  }
  if (trackingType === "bodyweight-reps") {
    return { primary: "Total Reps", secondary: "Best Set", best: "Best Set", tableMetric: "Total Reps" };
  }
  if (trackingType === "timed") {
    return { primary: "Total Seconds", secondary: "Best Hold", best: "Best Hold", tableMetric: "Total Seconds" };
  }
  return { primary: "Total Volume", secondary: "Load Trend", best: "Best Set", tableMetric: "Total Volume" };
}
