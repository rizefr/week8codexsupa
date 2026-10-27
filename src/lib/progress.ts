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
import { CABLE_FREE_START, CORNELL_ID, CORNELL_PLAN_VERSION, CORNELL_START, cornellActive, cornellDays, cornellExercises, cornellV4SourceIds, daysForDate, exercisesForDate, isCalibrationWeek, isTrainingLog, prescriptionWeekForDate, prescriptionWeekForLog, trainingDaysForDate } from "../data/cornell";
import { addDays, dayKeyForDate, daysSince, getCycleInfo, getProgramWeek, todayISO } from "./date";

export const allExercises = [...Object.values(workoutDays).flatMap((day) => day.exercises), ...cornellExercises];

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
  if (exercise.id.startsWith("cn") && weekInCycle === 8 && rirRequiredForExercise(exercise)) return "3-4";
  if (exercise.id.startsWith("cn") && weekInCycle === 2 && rirRequiredForExercise(exercise)) return "2-3";
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

export function setHasRecordedPerformance(set: SetLog, exercise: Exercise): boolean {
  const trackingType = trackingTypeForExercise(exercise);
  if (trackingType === "timed") return validSecondValue(set.seconds) > 0;
  if (exercise.unilateral) {
    const bothSides = validRepValue(set.leftReps) > 0 && validRepValue(set.rightReps) > 0;
    return bothSides || validRepValue(set.reps) > 0;
  }
  return validRepValue(set.reps) > 0;
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

export function exerciseLogHasComparablePerformance(log: ExerciseLog, exercise = findExercise(log.exerciseId)): boolean {
  if (log.skipped) return false;
  if (!exercise) return !!log.cardio?.completed && cardioInputsAreValid(log.cardio.duration);
  const trackingType = trackingTypeForExercise(exercise);
  return log.sets.some((set) => {
    if (!set.completed) return false;
    if (trackingType === "timed") return validSecondValue(set.seconds) > 0;
    const repsValid = exercise.unilateral
      ? (validRepValue(set.leftReps) > 0 && validRepValue(set.rightReps) > 0) || validRepValue(set.reps) > 0
      : validRepValue(set.reps) > 0;
    if (!repsValid) return false;
    return !loadRequiredForExercise(exercise) || validLoadValue(set.weight) > 0;
  });
}

export function exerciseNameForId(exerciseId: string): string {
  const exercise = findExercise(exerciseId);
  if (exercise) return exercise.name;
  const cardio = [...Object.values(workoutDays), ...Object.values(cornellDays)]
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
  const workout = daysForDate(date)[performedDayKey];
  // Sunday's optional strength block is opt-in: pick run or pull + arms in the logger.
  const effectiveStartDate = settings.startDate || date;
  const cycleInfo = getCycleInfo(effectiveStartDate, date);
  const exerciseLogs: ExerciseLog[] = [
    ...exercisesForDate(workout, date).map((exercise) => ({
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
    ...(cornellActive(date) ? { programId: CORNELL_ID, programStartDate: CORNELL_START, planVersion: CORNELL_PLAN_VERSION } : {}),
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

/** Apply the requested revision only to a current draft when it is opened.
 * Completed/older logs are never changed; recorded cable work remains honest.
 */
export function upgradeCurrentDraft(log: WorkoutLog): WorkoutLog {
  if (log.status !== "draft" || log.programId !== CORNELL_ID || log.date < CABLE_FREE_START || (log.planVersion ?? 1) >= 4 || log.planVersion !== 3) return log;
  const used = new Set<string>();
  const planned = exercisesForDate(cornellDays[log.dayKey], log.date);
  const exerciseLogs = planned.map((exercise): ExerciseLog => {
    const old = log.exerciseLogs.find((entry) => entry.exerciseId === cornellV4SourceIds[exercise.id]);
    if (!old) return { id: createId("exercise"), exerciseId: exercise.id, completed: false, sets: createSetLogs(exercise) };
    used.add(old.id);
    const oldExercise = findExercise(old.exerciseId);
    const sameMovement = exerciseComparisonMatches(oldExercise, exercise);
    const recorded = old.sets.some((set) => set.completed || set.completionOverride ||
      [set.weight, set.reps, set.leftReps, set.rightReps, set.seconds, set.rir, set.notes].some((value) => String(value ?? "").trim())) ||
      !!old.performedExerciseName || !!old.notes || !!old.flags?.length;
    if (!sameMovement && recorded) return old;
    if (!sameMovement) return { ...old, exerciseId: exercise.id, completed: false, sets: createSetLogs(exercise) };
    const extra = createSetLogs(exercise).slice(old.sets.length);
    const sets = [...old.sets, ...extra];
    return { ...old, exerciseId: exercise.id, sets, completed: !old.skipped && sets.every((set) => set.completed) };
  });
  return { ...log, planVersion: 4, exerciseLogs: [...exerciseLogs, ...log.exerciseLogs.filter((entry) => !used.has(entry.id))] };
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
  if (log.skipped) return 0;
  const exercise = findExercise(log.exerciseId);
  return log.sets.reduce((total, set) => total + setVolume(set, exercise), 0);
}

export function workoutVolume(log: WorkoutLog): number {
  return log.exerciseLogs.reduce((total, exerciseLog) => total + exerciseVolume(exerciseLog), 0);
}

export function completedSetCount(log: WorkoutLog): number {
  return log.exerciseLogs.reduce((total, exerciseLog) => total + (exerciseLog.skipped ? 0 : exerciseLog.sets.filter((set) => set.completed).length), 0);
}

// Estimated 1RM via the Epley formula. Display-only: PR detection stays on
// measured loads/reps, never on estimates.
export function epleyE1RM(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

export function bestSessionE1RM(log: ExerciseLog, exercise = findExercise(log.exerciseId)): number {
  if (log.skipped) return 0;
  if (trackingTypeForExercise(exercise) !== "weighted-reps") return 0;
  return log.sets.reduce((best, set) => {
    if (!set.completed) return best;
    const weight = validLoadValue(set.weight);
    const reps = exercise?.unilateral
      ? Math.min(validRepValue(set.leftReps) || validRepValue(set.reps), validRepValue(set.rightReps) || validRepValue(set.reps))
      : validRepValue(set.reps);
    return Math.max(best, epleyE1RM(weight, reps));
  }, 0);
}

/** Planned working sets on non-skipped strength exercises, and how many were completed. */
export function setCompletionForLog(log: WorkoutLog): { planned: number; completed: number; ratio: number } {
  let planned = 0;
  let completed = 0;
  log.exerciseLogs.forEach((exerciseLog) => {
    const exercise = findExercise(exerciseLog.exerciseId);
    if (!exercise) return;
    if (exerciseLog.skipped && (log.planVersion ?? 1) < 3) return;
    planned += exerciseLog.sets.length;
    if (!exerciseLog.skipped) completed += exerciseLog.sets.filter((set) => set.completed && ((log.planVersion ?? 1) < 3 || setInputsAreValid(set, exercise))).length;
  });
  return { planned, completed, ratio: planned ? completed / planned : 0 };
}

/** Minimum share of planned (non-skipped) sets a v2 session needs before it earns completion credit. */
export const CREDIT_THRESHOLD = 0.75;

/**
 * Whether a completed log counts as a finished session for XP, streaks, badges and
 * weekly completion. v2 Cornell logs must have most planned sets logged; earlier
 * logs keep their original rule so history never loses credit retroactively.
 */
export function isCreditedSession(log: WorkoutLog): boolean {
  if (log.status !== "completed") return false;
  if (log.programId !== CORNELL_ID || (log.planVersion ?? 1) < 2) return true;
  const { planned, ratio } = setCompletionForLog(log);
  return planned > 0 && ratio >= CREDIT_THRESHOLD;
}

export function isCreditedWorkout(log: WorkoutLog): boolean {
  return isTrainingLog(log) && isCreditedSession(log);
}

/**
 * Strength estimate that accounts for effort: reps + reps-in-reserve approximates
 * reps-to-failure, so 10 reps at 3 RIR and 12 reps at 1 RIR score the same. That
 * keeps calibration weeks and RIR changes from masquerading as strength gains.
 */
export function rirAdjustedE1RM(weight: number, reps: number, rir?: string): number {
  if (weight <= 0 || reps <= 0) return 0;
  const reserve = validRirValue(rir) ? Math.min(5, Math.max(0, numericValue(rir))) : 0;
  return weight * (1 + (reps + reserve) / 30);
}

function strengthRepsForSet(set: SetLog, exercise?: Exercise): number {
  if (exercise?.unilateral) {
    const left = validRepValue(set.leftReps);
    const right = validRepValue(set.rightReps);
    if (left && right) return Math.min(left, right);
    return validRepValue(set.reps);
  }
  return validRepValue(set.reps);
}

/** Best effort-adjusted strength estimate in a session, with the set that produced it. */
export function bestSessionStrength(log: ExerciseLog, exercise = findExercise(log.exerciseId)): { value: number; set?: SetLog } {
  if (log.skipped || trackingTypeForExercise(exercise) !== "weighted-reps") return { value: 0 };
  return log.sets.reduce<{ value: number; set?: SetLog }>((best, set) => {
    if (!set.completed) return best;
    const value = rirAdjustedE1RM(validLoadValue(set.weight), strengthRepsForSet(set, exercise), set.rir);
    return value > best.value ? { value, set } : best;
  }, { value: 0 });
}

export function minRepTarget(target?: string): number | null {
  if (!target) return null;
  const numbers = [...target.matchAll(/\d+/g)].map((match) => Number(match[0]));
  return numbers.length ? Math.min(...numbers) : null;
}

export function completedExerciseCount(log: WorkoutLog): number {
  return log.exerciseLogs.filter((exerciseLog) => !exerciseLog.skipped && (exerciseLog.completed || exerciseLog.cardio?.completed)).length;
}

export function totalProgramWorkouts(): number {
  return trainingDayKeys.length * 8;
}

export function completedProgramWorkouts(logs: WorkoutLog[]): number {
  return logs.filter(isCreditedWorkout).length;
}

export function completedWorkoutsThisWeek(logs: WorkoutLog[], settings: ProgramSettings, date = todayISO()): number {
  const week = getProgramWeek(settings.startDate || date, date);
  return new Set(logs.filter((log) => log.week === week && isCreditedWorkout(log)).map((log) => log.date)).size;
}

export function plannedTrainingDaysElapsedThisWeek(settings: ProgramSettings, date = todayISO()): number {
  const week = getProgramWeek(settings.startDate || date, date);
  const startOffset = (week - 1) * 7;
  const elapsed = Math.max(0, Math.min(6, daysSince(settings.startDate, date) - startOffset));
  let count = 0;
  for (let i = 0; i <= elapsed; i += 1) {
    const dayKey = dayKeyForDate(addDays(settings.startDate, startOffset + i));
    if (trainingDaysForDate(date).includes(dayKey)) count += 1;
  }
  return count;
}

export function weeklySummaries(logs: WorkoutLog[], settings: ProgramSettings) {
  const maxLoggedWeek = Math.max(
    1,
    ...logs.map((log) => log.week || getProgramWeek(settings.startDate || log.date, log.date)),
    getProgramWeek(settings.startDate || todayISO(), todayISO()),
  );
  return Array.from({ length: maxLoggedWeek }, (_, index) => {
    const week = index + 1;
    const weekLogs = logs.filter((log) => log.week === week && log.status === "completed");
    const trainingLogs = weekLogs.filter(isTrainingLog);
    const notes = weekLogs.map((log) => log.notes).filter(Boolean) as string[];
    return {
      week,
      cycle: Math.floor((week - 1) / 8) + 1,
      weekInCycle: ((week - 1) % 8) + 1,
      completed: trainingLogs.length,
      scheduled: trainingDaysForDate(weekLogs[0]?.date ?? addDays(settings.startDate || todayISO(), (week - 1) * 7)).length,
      sets: weekLogs.reduce((sum, log) => sum + completedSetCount(log), 0),
      volume: weekLogs.reduce((sum, log) => sum + workoutVolume(log), 0),
      missed: Math.max(0, trainingDaysForDate(weekLogs[0]?.date ?? addDays(settings.startDate, (week - 1) * 7)).length - trainingLogs.length),
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
  if (cornellActive(date)) {
    const cycle = getCycleInfo(CORNELL_START, date).cycle;
    return new Set(logs.filter((log) => log.programId === CORNELL_ID && isCreditedWorkout(log) && getCycleInfo(log.programStartDate ?? CORNELL_START, log.date).cycle === cycle).map((log) => log.date)).size;
  }
  const cycle = getCycleInfo(settings.startDate || date, date).cycle;
  return logs.filter((log) => log.status === "completed" && isTrainingLog(log) && (log.cycle ?? Math.floor((log.week - 1) / 8) + 1) === cycle).length;
}

export function cycleWorkoutTarget(): number {
  return trainingDaysForDate().length * 8;
}

export function prefillWorkoutLogFromHistory(log: WorkoutLog, logs: WorkoutLog[]): WorkoutLog {
  // Calibration weeks (and every v1 Cornell log) stay deliberately blank.
  if (log.programId === CORNELL_ID && ((log.planVersion ?? 1) < 2 || isCalibrationWeek(log.date, log.programStartDate, log.planVersion))) return log;
  return {
    ...log,
    exerciseLogs: log.exerciseLogs.map((exerciseLog) => {
      const exercise = findExercise(exerciseLog.exerciseId);
      if (!exercise) return exerciseLog;
      const previous = previousExercisePerformance(logs, log.date, exercise);
      if (!previous) return exerciseLog;
      if (daysSince(previous.workout.date, log.date) > 28) return exerciseLog;
      if (!shouldShowLoadInput(exercise)) return exerciseLog;
      return {
        ...exerciseLog,
        sets: exerciseLog.sets.map((set, index) => ({
          ...set,
          weight: previous.exerciseLog.sets.find((prior) => prior.setNumber === set.setNumber)?.weight ?? set.weight,
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
  if (hitTop && trackingType === "assistance-reps") return "Top range reached. Repeat it cleanly; reduce assistance only after comparable sessions confirm it.";
  if (hitTop && trackingType === "weighted-reps") return "Top range reached. Repeat it at target RIR; add weight only after comparable sessions confirm it.";
  if (hitTop) return "Make the reps cleaner or add a small rep target next time; do not add load unless the routine calls for it.";
  return trackingType === "assistance-reps" ? "Keep assistance the same and add clean reps next time." : "Keep the same load/variation and add clean reps next time.";
}

function recordedReferenceSets(log: ExerciseLog, exercise?: Exercise): SetLog[] {
  if (log.skipped || !exercise) return [];
  return log.sets.filter((set) => set.completionOverride !== "incomplete" &&
    setHasRecordedPerformance(set, exercise) && (!loadRequiredForExercise(exercise) || validLoadValue(set.weight) > 0));
}

export function exerciseSessions(
  logs: WorkoutLog[],
  exerciseQuery: Exercise | string,
  options: { matchMode?: "strict" | "family"; includeDrafts?: boolean } = {},
) {
  const matches = options.matchMode === "family" ? exerciseMatches : exerciseComparisonMatches;
  return logs
    .filter((log) => log.status === "completed" || (options.includeDrafts && log.status === "draft"))
    .flatMap((log) =>
      log.exerciseLogs
        .map((exerciseLog) => ({ workout: log, exerciseLog, exercise: findExercise(exerciseLog.exerciseId) }))
        .filter((item) => matches(item.exercise, exerciseQuery) && (options.includeDrafts
          ? recordedReferenceSets(item.exerciseLog, item.exercise).length > 0
          : exerciseLogHasComparablePerformance(item.exerciseLog, item.exercise))),
    )
    .sort((a, b) => a.workout.date.localeCompare(b.workout.date));
}

export function previousExercisePerformance(logs: WorkoutLog[], currentDate: string, exerciseQuery: Exercise | string, options: { includeDrafts?: boolean } = {}) {
  const includeDrafts = options.includeDrafts ?? true;
  const latest = exerciseSessions(logs, exerciseQuery, { includeDrafts })
    .filter((item) => item.workout.date < currentDate)
    .at(-1);
  if (!latest || !includeDrafts) return latest;
  // A saved set is useful as a reference even if Finish Workout was never tapped.
  // Return only recorded sets, without changing the saved workout or PR baseline.
  return { ...latest, exerciseLog: { ...latest.exerciseLog,
    sets: recordedReferenceSets(latest.exerciseLog, latest.exercise),
  } };
}

export function previousSessionNotes(exerciseLog: ExerciseLog, workout?: WorkoutLog): string[] {
  const notes = [
    exerciseLog.notes,
    ...exerciseLog.sets.map((set) => set.notes),
    exerciseLog.cardio?.intensityNotes,
    workout?.notes,
  ];
  return Array.from(new Set(notes.map((note) => note?.trim()).filter((note): note is string => Boolean(note))));
}

export type NextSessionRecommendationKind = "insufficient" | "hold" | "add-rep" | "add-load" | "reduce-assistance" | "add-time";

export interface NextSessionRecommendation {
  kind: NextSessionRecommendationKind;
  title: string;
  detail: string;
  evidence: string;
}

function targetRirRange(target: string): { min: number; max: number } | null {
  const values = [...target.matchAll(/\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
  if (!values.length) return null;
  return { min: Math.min(...values), max: Math.max(...values) };
}

function completedPlannedSets(log: ExerciseLog, exercise: Exercise): SetLog[] {
  if (log.skipped) return [];
  const sets = log.sets.filter((set) => set.completed && setHasRecordedPerformance(set, exercise));
  return sets.length === (exercise.sets ?? 0) ? sets : [];
}

function repTargetForRecommendation(exercise: Exercise): number | null {
  return topRepTarget(exercise.reps ?? exercise.seconds);
}

function repsForProgression(set: SetLog, exercise: Exercise): number {
  if (trackingTypeForExercise(exercise) === "timed") return validSecondValue(set.seconds);
  if (exercise.unilateral) {
    const left = validRepValue(set.leftReps);
    const right = validRepValue(set.rightReps);
    if (left && right) return Math.min(left, right);
  }
  return validRepValue(set.reps);
}

function sessionMeetsTopRangeAndRir(log: ExerciseLog, exercise: Exercise, weekInCycle?: number): boolean {
  const top = repTargetForRecommendation(exercise);
  const sets = completedPlannedSets(log, exercise);
  if (!top || !sets.length) return false;
  return sets.every((set) => {
    if (repsForProgression(set, exercise) < top) return false;
    if (!rirRequiredForExercise(exercise)) return true;
    const range = targetRirRange(targetRIRForSet(exercise, weekInCycle, set.setNumber));
    const actual = numericValue(set.rir);
    return !!range && validRirValue(set.rir) && actual >= range.min && actual <= range.max;
  });
}

function sessionLoadSignature(log: ExerciseLog, exercise: Exercise): string {
  if (!shouldShowLoadInput(exercise)) return "no-load";
  return completedPlannedSets(log, exercise).map((set) => validLoadValue(set.weight).toFixed(2)).join("|");
}

export function nextSessionRecommendation(
  logs: WorkoutLog[],
  currentDate: string,
  exercise: Exercise,
): NextSessionRecommendation {
  const currentWeek = prescriptionWeekForDate(currentDate);
  if (exercise.id.startsWith("cn") && [1, 8].includes(currentWeek)) {
    return { kind: "hold", title: currentWeek === 1 ? "Calibrate this week" : "Deload this week",
      detail: !shouldShowLoadInput(exercise)
        ? "Use the reduced planned sets. Stop when control breaks; progress clean reps, not added load."
        : currentWeek === 1 ? "Choose a load that leaves about 3 clean reps. Use the reduced planned sets; do not chase old numbers." : "Use half the normal sets at 3-4 RIR. No load increase this week.",
      evidence: "Current Cornell cycle prescription, not an inference from old performance." };
  }
  const sessions = exerciseSessions(logs, exercise).filter((session) => session.workout.date < currentDate);
  const latest = sessions.at(-1);
  if (!latest) {
    return {
      kind: "insufficient",
      title: "Build a confirmed baseline",
      detail: "Log the planned working sets cleanly before the app suggests progression.",
      evidence: "No confirmed comparable evidence from a prior session.",
    };
  }

  if (daysSince(latest.workout.date, currentDate) > 28) {
    return { kind: "insufficient", title: "Recalibrate after a gap",
      detail: "Use a comfortable load at the current RIR target. Old performance stays visible, but is not a load prescription.",
      evidence: `Last confirmed session: ${latest.workout.date}, more than four weeks ago.` };
  }

  const latestSets = completedPlannedSets(latest.exerciseLog, exercise);
  const noteText = previousSessionNotes(latest.exerciseLog, latest.workout).join(" ");
  if (!latestSets.length) {
    return {
      kind: "insufficient",
      title: "Not enough comparable work",
      detail: "Repeat the planned sets before changing load or volume.",
      evidence: `Latest confirmed session: ${latest.workout.date}.`,
    };
  }
  if (containsPainOrRegression(noteText)) {
    return {
      kind: "hold",
      title: "Hold steady",
      detail: "Keep the planned work conservative and resolve the logged pain or regression signal before progressing.",
      evidence: `Safety note found in the ${latest.workout.date} session.`,
    };
  }

  const trackingType = trackingTypeForExercise(exercise);
  if (trackingType === "cardio" || trackingType === "rest-checkin") {
    return {
      kind: "hold",
      title: "Keep it easy",
      detail: "Follow the programmed conversational intensity; this is not a strength-progression target.",
      evidence: `Based on the ${latest.workout.date} session.`,
    };
  }

  const missingRequiredRir = rirRequiredForExercise(exercise) && latestSets.some((set) => !validRirValue(set.rir));
  if (missingRequiredRir) {
    return {
      kind: "insufficient",
      title: "RIR evidence is incomplete",
      detail: "Keep the current setup. Log actual RIR on the planned sets before changing load or difficulty.",
      evidence: `The ${latest.workout.date} session is usable as history, but not enough for progression advice.`,
    };
  }

  const tooHard = rirRequiredForExercise(exercise) && latestSets.some((set) => {
    const range = targetRirRange(targetRIRForSet(exercise, prescriptionWeekForLog(latest.workout), set.setNumber));
    return !!range && validRirValue(set.rir) && numericValue(set.rir) < range.min;
  });
  if (tooHard) {
    return {
      kind: "hold",
      title: "Hold the current difficulty",
      detail: "The last session pushed past the target RIR. Match clean reps without adding load or sets.",
      evidence: `Target-RIR check from ${latest.workout.date}.`,
    };
  }

  const hitTop = sessionMeetsTopRangeAndRir(latest.exerciseLog, exercise, prescriptionWeekForLog(latest.workout));
  const previous = sessions.at(-2);
  const repeatedTop = !!previous &&
    sessionMeetsTopRangeAndRir(previous.exerciseLog, exercise, prescriptionWeekForLog(previous.workout)) &&
    sessionLoadSignature(previous.exerciseLog, exercise) === sessionLoadSignature(latest.exerciseLog, exercise);

  if (trackingType === "weighted-reps" && hitTop && repeatedTop) {
    return {
      kind: "add-load",
      title: "Ready for a small load increase",
      detail: "Two comparable sessions reached the full top range at target RIR. Add the smallest practical load and keep the same planned sets.",
      evidence: `Confirmed on ${previous!.workout.date} and ${latest.workout.date}.`,
    };
  }
  if (trackingType === "assistance-reps" && hitTop && repeatedTop) {
    return {
      kind: "reduce-assistance",
      title: "Reduce assistance slightly",
      detail: "Reps were stable at the top range twice. Use slightly less assistance without changing the planned set count.",
      evidence: `Confirmed on ${previous!.workout.date} and ${latest.workout.date}.`,
    };
  }
  if (hitTop) {
    return {
      kind: "hold",
      title: "Confirm it once more",
      detail: trackingType === "weighted-reps"
        ? "Repeat this load at the top range and target RIR before increasing weight."
        : "Repeat the same clean performance before making the variation harder.",
      evidence: `One qualifying session on ${latest.workout.date}.`,
    };
  }

  const top = repTargetForRecommendation(exercise);
  const firstSetBelowTop = top ? latestSets.find((set) => repsForProgression(set, exercise) < top) : undefined;
  if (trackingType === "timed") {
    return {
      kind: "add-time",
      title: "Add controlled time",
      detail: firstSetBelowTop ? `Try one more controlled second on set ${firstSetBelowTop.setNumber}. Stop when position breaks.` : "Match the hold with cleaner control.",
      evidence: `Based on ${latest.workout.date}; no extra sets added.`,
    };
  }
  return {
    kind: "add-rep",
    title: "Add one clean rep",
    detail: firstSetBelowTop
      ? `Try +1 rep on set ${firstSetBelowTop.setNumber} at the same ${trackingType === "assistance-reps" ? "assistance" : "load or variation"}. Keep the planned set count.`
      : "Match the current setup and improve one clean rep before changing difficulty.",
    evidence: `Based on the confirmed ${latest.workout.date} session.`,
  };
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
  if (log.skipped) return 0;
  return log.sets.filter((set) => set.completed).reduce((sum, set) => sum + (trackingTypeForExercise(exercise) === "timed" ? 0 : repsForSet(set, exercise)), 0);
}

export function totalSecondsForExerciseLog(log: ExerciseLog): number {
  if (log.skipped) return 0;
  return log.sets.filter((set) => set.completed).reduce((sum, set) => sum + validSecondValue(set.seconds), 0);
}

export function bestSetReps(log: ExerciseLog, exercise?: Exercise): number {
  if (log.skipped) return 0;
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
  if (log.skipped) return 0;
  return Math.max(0, ...log.sets.filter((set) => set.completed).map((set) => validSecondValue(set.seconds)));
}

export function bestAssistance(log: ExerciseLog): number {
  if (log.skipped) return 0;
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
