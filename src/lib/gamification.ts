import { AppData, BodyWeightLog, DayKey, Exercise, ExerciseLog, GamificationSettings, ProgramSettings, SetLog, WorkoutLog } from "../types";
import { getWorkoutByKey, trainingDayKeys, workoutDays } from "../data/routine";
import { addDays, dayKeyForDate, daysSince, getCycleInfo, todayISO } from "./date";
import {
  completedExerciseCount,
  completedSetCount,
  effectiveProgramStartDate,
  exerciseVolume,
  findExercise,
  isTrainingDay,
  numericValue,
  workoutVolume,
} from "./progress";

export type XPEventKind =
  | "workout"
  | "logging"
  | "pr"
  | "bodyweight"
  | "rest"
  | "weekly"
  | "clean-week"
  | "streak"
  | "comeback";

export interface XPEvent {
  key: string;
  kind: XPEventKind;
  date: string;
  label: string;
  xp: number;
  workoutId?: string;
  programWeek?: number;
}

export interface LevelInfo {
  level: number;
  title: string;
  totalXP: number;
  currentLevelXP: number;
  nextLevelXP: number;
  progressPercent: number;
  xpToNext: number;
}

export interface PRRecord {
  id: string;
  date: string;
  workoutId: string;
  exerciseName: string;
  metric: "weight" | "reps-at-weight" | "total-reps" | "volume" | "timed";
  label: string;
  value: number;
  previous?: number;
  unit: string;
}

export interface StreakStats {
  workout: {
    current: number;
    best: number;
  };
  dailyCheckIn: {
    current: number;
    best: number;
    graceUsedThisWeek: boolean;
  };
  weeklyCompletion: {
    current: number;
    best: number;
  };
  comebackReady: boolean;
}

export interface DailyActivity {
  date: string;
  state: "none" | "rest" | "started" | "completed" | "full" | "high";
  xp: number;
  summary: string;
  hasWorkout: boolean;
  hasBodyWeight: boolean;
  hasPR: boolean;
}

export interface ExecutionScore {
  overall: number;
  label: string;
  consistency: number;
  logging: number;
  recovery: number;
  progression: number;
  bodyWeight: number;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  unlocked: boolean;
  unlockedAt?: string;
  progressCurrent: number;
  progressTarget: number;
}

export interface TodayMission {
  title: string;
  subtitle: string;
  availableXP: number;
  focusCue: string;
  nextBestAction: string;
  action: "sync" | "continue-workout" | "review-recap" | "start-workout" | "rest-checkin" | "log-weight";
  workoutId?: string;
}

export interface WorkoutRecap {
  log: WorkoutLog;
  xpEarned: number;
  xpEvents: XPEvent[];
  level: LevelInfo;
  workoutScore: number;
  exercisesCompleted: number;
  setsCompleted: number;
  loggingQuality: number;
  prs: PRRecord[];
  badgesUnlocked: Achievement[];
  streakText: string;
  nextFocus: string;
}

export interface GamificationSummary {
  settings: GamificationSettings;
  xpEvents: XPEvent[];
  totalXP: number;
  level: LevelInfo;
  prs: PRRecord[];
  streaks: StreakStats;
  executionScore: ExecutionScore;
  activities: DailyActivity[];
  achievements: Achievement[];
  recentBadges: Achievement[];
  recentPRs: PRRecord[];
}

export const defaultGamificationSettings: GamificationSettings = {
  enabled: true,
  showCelebrations: true,
  compactMode: false,
  version: 1,
  badgeUnlocks: {},
  seenRecaps: [],
};

const HARD_CARDIO_RE = /\b(HIIT|sprint|running|run|interval|max effort|hard stair|stairmaster interval|all out)\b/i;
const PAIN_RE = /pain|pinch|sharp|ache|hurt|irritation|regress|dropped|worse|shortened|sleep bad|bad sleep|heavy warm/i;

export function getGamificationSettings(settings?: ProgramSettings): GamificationSettings {
  const incoming = settings?.gamification;
  return {
    ...defaultGamificationSettings,
    ...(incoming ?? {}),
    badgeUnlocks: { ...(incoming?.badgeUnlocks ?? {}) },
    seenRecaps: Array.from(new Set(incoming?.seenRecaps ?? [])),
  };
}

export function mergeGamificationSettings(
  base?: GamificationSettings,
  local?: GamificationSettings,
  remote?: GamificationSettings,
): GamificationSettings {
  const normalizedBase = { ...defaultGamificationSettings, ...(base ?? {}) };
  const localUnlocks = local?.badgeUnlocks ?? {};
  const remoteUnlocks = remote?.badgeUnlocks ?? {};
  const badgeUnlocks: Record<string, string> = { ...(normalizedBase.badgeUnlocks ?? {}) };
  [...Object.entries(localUnlocks), ...Object.entries(remoteUnlocks)].forEach(([id, unlockedAt]) => {
    const current = badgeUnlocks[id];
    if (!current || unlockedAt < current) badgeUnlocks[id] = unlockedAt;
  });
  return {
    ...normalizedBase,
    badgeUnlocks,
    seenRecaps: Array.from(new Set([...(normalizedBase.seenRecaps ?? []), ...(local?.seenRecaps ?? []), ...(remote?.seenRecaps ?? [])])),
  };
}

export function mergeProgramSettingsGamification(base: ProgramSettings, local?: ProgramSettings, remote?: ProgramSettings): ProgramSettings {
  return {
    ...base,
    gamification: mergeGamificationSettings(base.gamification, local?.gamification, remote?.gamification),
  };
}

export function normalizedExerciseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\bor\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function validWeight(value?: string): number {
  const parsed = numericValue(value);
  return parsed > 0 && parsed <= 500 ? parsed : 0;
}

function validReps(value?: string): number {
  const parsed = numericValue(value);
  return parsed > 0 && parsed <= 100 ? parsed : 0;
}

function validSeconds(value?: string): number {
  const parsed = numericValue(value);
  return parsed > 0 && parsed <= 600 ? parsed : 0;
}

function validRir(value?: string): boolean {
  if (!value) return false;
  const parsed = numericValue(value);
  return parsed >= 0 && parsed <= 10;
}

function exerciseRequiresWeight(exercise: Exercise): boolean {
  if (exercise.kind !== "strength") return false;
  if (/walkout|reverse crunch|dead bug|plank|hollow|push-up/i.test(exercise.name)) return false;
  return /db|dumbbell|barbell|bench|press|row|curl|raise|extension|pull-up|dip|squat|deadlift|rdl|calf|pullover/i.test(exercise.name);
}

function setHasValidReps(set: SetLog, exercise: Exercise): boolean {
  if (exercise.kind === "timed") return validSeconds(set.seconds) > 0;
  if (exercise.unilateral) return validReps(set.leftReps) > 0 && validReps(set.rightReps) > 0;
  return validReps(set.reps) > 0;
}

function setIsFullyLogged(set: SetLog, exercise: Exercise): boolean {
  if (!set.completed || !setHasValidReps(set, exercise)) return false;
  if (exerciseRequiresWeight(exercise) && !validWeight(set.weight)) return false;
  return validRir(set.rir);
}

function exerciseLogFullyLogged(log: ExerciseLog): boolean {
  const exercise = findExercise(log.exerciseId);
  if (!exercise) return !!log.cardio?.completed;
  if (!exercise.sets) return true;
  return log.sets.length === exercise.sets && log.sets.every((set) => setIsFullyLogged(set, exercise));
}

export function loggingQualityForWorkout(log: WorkoutLog): number {
  const planned = log.exerciseLogs.filter((exerciseLog) => !!findExercise(exerciseLog.exerciseId));
  const setCount = planned.reduce((sum, exerciseLog) => sum + exerciseLog.sets.length, 0);
  if (!setCount) return log.restDay?.completed ? 100 : 0;
  const fullyLogged = planned.reduce((sum, exerciseLog) => {
    const exercise = findExercise(exerciseLog.exerciseId);
    if (!exercise) return sum;
    return sum + exerciseLog.sets.filter((set) => setIsFullyLogged(set, exercise)).length;
  }, 0);
  return Math.round((fullyLogged / setCount) * 100);
}

function hasHardCardio(log: WorkoutLog): boolean {
  const haystack = [
    log.notes ?? "",
    log.restDay?.intensityNotes ?? "",
    ...log.exerciseLogs.map((exerciseLog) => `${exerciseLog.notes ?? ""} ${exerciseLog.cardio?.intensityNotes ?? ""}`),
  ].join(" ");
  return HARD_CARDIO_RE.test(haystack);
}

function hasPainOrRegression(log: WorkoutLog): boolean {
  const haystack = [
    log.notes ?? "",
    ...log.exerciseLogs.map((exerciseLog) => `${exerciseLog.notes ?? ""} ${exerciseLog.sets.map((set) => set.notes ?? "").join(" ")}`),
  ].join(" ");
  return PAIN_RE.test(haystack);
}

export function canonicalWorkoutLogs(logs: WorkoutLog[]): WorkoutLog[] {
  const byDay = new Map<string, WorkoutLog>();
  [...logs]
    .sort((a, b) => {
      const aTime = Date.parse(a.updatedAt ?? a.completedAt ?? a.startedAt);
      const bTime = Date.parse(b.updatedAt ?? b.completedAt ?? b.startedAt);
      return aTime - bTime;
    })
    .forEach((log) => {
      const key = `${log.date}:${log.dayKey}`;
      const current = byDay.get(key);
      if (!current) {
        byDay.set(key, log);
        return;
      }
      if (log.status === "completed" && current.status !== "completed") {
        byDay.set(key, log);
        return;
      }
      if (log.status === current.status) byDay.set(key, log);
    });
  return Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function bodyWeightDates(weights: BodyWeightLog[]): Set<string> {
  return new Set(weights.filter((entry) => Number.isFinite(entry.weight) && entry.weight > 0).map((entry) => entry.date));
}

function weekDates(startDate: string, week: number): string[] {
  return Array.from({ length: 7 }, (_, index) => addDays(startDate, (week - 1) * 7 + index));
}

function completedTrainingDatesByWeek(logs: WorkoutLog[], week: number): Set<DayKey> {
  return new Set(logs.filter((log) => log.week === week && log.status === "completed" && isTrainingDay(log.dayKey)).map((log) => log.dayKey));
}

function allScheduledWorkoutsComplete(logs: WorkoutLog[], week: number): boolean {
  const days = completedTrainingDatesByWeek(logs, week);
  return trainingDayKeys.every((dayKey) => days.has(dayKey));
}

export function detectPRs(data: AppData): PRRecord[] {
  const prs: PRRecord[] = [];
  const bestWeight = new Map<string, number>();
  const bestRepsAtWeight = new Map<string, number>();
  const bestTotalReps = new Map<string, number>();
  const bestVolume = new Map<string, number>();
  const bestTimed = new Map<string, number>();

  canonicalWorkoutLogs(data.workoutLogs)
    .filter((log) => log.status === "completed")
    .forEach((workout) => {
      workout.exerciseLogs.forEach((exerciseLog) => {
        const exercise = findExercise(exerciseLog.exerciseId);
        if (!exercise) return;
        const name = exercise.name;
        const normalized = normalizedExerciseName(name);
        const completedSets = exerciseLog.sets.filter((set) => set.completed);
        if (!completedSets.length) return;

        const weights = completedSets.map((set) => validWeight(set.weight)).filter(Boolean);
        const totalReps = completedSets.reduce((sum, set) => {
          if (exercise.kind === "timed") return sum;
          if (exercise.unilateral) return sum + validReps(set.leftReps) + validReps(set.rightReps);
          return sum + validReps(set.reps);
        }, 0);
        const sessionVolume = exerciseVolume(exerciseLog);
        const timedBest = Math.max(0, ...completedSets.map((set) => validSeconds(set.seconds)));

        const maxWeight = Math.max(0, ...weights);
        if (maxWeight > 0 && maxWeight > (bestWeight.get(normalized) ?? 0)) {
          prs.push({
            id: `pr:${normalized}:${workout.date}:weight`,
            date: workout.date,
            workoutId: workout.id,
            exerciseName: name,
            metric: "weight",
            label: `New best load: ${maxWeight} lb${/db|dumbbell/i.test(name) ? " per dumbbell" : ""}`,
            value: maxWeight,
            previous: bestWeight.get(normalized),
            unit: /db|dumbbell/i.test(name) ? "lb per dumbbell" : "lb",
          });
          bestWeight.set(normalized, maxWeight);
        }

        completedSets.forEach((set) => {
          const weight = validWeight(set.weight);
          const reps = exercise.unilateral ? Math.min(validReps(set.leftReps), validReps(set.rightReps)) : validReps(set.reps);
          if (!weight || !reps) return;
          const key = `${normalized}:${weight}`;
          if (reps > (bestRepsAtWeight.get(key) ?? 0)) {
            prs.push({
              id: `pr:${normalized}:${workout.date}:reps-${weight}`,
              date: workout.date,
              workoutId: workout.id,
              exerciseName: name,
              metric: "reps-at-weight",
              label: `${reps} reps at ${weight} lb${/db|dumbbell/i.test(name) ? " per dumbbell" : ""}`,
              value: reps,
              previous: bestRepsAtWeight.get(key),
              unit: `reps at ${weight} lb`,
            });
            bestRepsAtWeight.set(key, reps);
          }
        });

        if (totalReps > 0 && totalReps > (bestTotalReps.get(normalized) ?? 0)) {
          prs.push({
            id: `pr:${normalized}:${workout.date}:total-reps`,
            date: workout.date,
            workoutId: workout.id,
            exerciseName: name,
            metric: "total-reps",
            label: `${totalReps} total reps`,
            value: totalReps,
            previous: bestTotalReps.get(normalized),
            unit: "total reps",
          });
          bestTotalReps.set(normalized, totalReps);
        }

        if (sessionVolume > 0 && sessionVolume > (bestVolume.get(normalized) ?? 0)) {
          prs.push({
            id: `pr:${normalized}:${workout.date}:volume`,
            date: workout.date,
            workoutId: workout.id,
            exerciseName: name,
            metric: "volume",
            label: `${Math.round(sessionVolume).toLocaleString()} lb volume`,
            value: sessionVolume,
            previous: bestVolume.get(normalized),
            unit: "lb volume",
          });
          bestVolume.set(normalized, sessionVolume);
        }

        if (exercise.kind === "timed" && timedBest > (bestTimed.get(normalized) ?? 0)) {
          prs.push({
            id: `pr:${normalized}:${workout.date}:timed`,
            date: workout.date,
            workoutId: workout.id,
            exerciseName: name,
            metric: "timed",
            label: `${timedBest} sec hold`,
            value: timedBest,
            previous: bestTimed.get(normalized),
            unit: "sec",
          });
          bestTimed.set(normalized, timedBest);
        }
      });
    });

  return prs.filter((pr) => pr.previous !== undefined).sort((a, b) => a.date.localeCompare(b.date));
}

export function calculateLevelFromXP(totalXP: number): LevelInfo {
  let level = 1;
  let remaining = Math.max(0, totalXP);
  let needed = 400;
  while (remaining >= needed) {
    remaining -= needed;
    level += 1;
    needed = 400 + (level - 1) * 125;
  }
  const title = levelTitle(level);
  return {
    level,
    title,
    totalXP,
    currentLevelXP: remaining,
    nextLevelXP: needed,
    progressPercent: Math.round((remaining / needed) * 100),
    xpToNext: needed - remaining,
  };
}

function levelTitle(level: number): string {
  if (level >= 25) return "Elite Execution";
  if (level >= 20) return "Cycle Finisher";
  if (level >= 15) return "Rep PR Machine";
  if (level >= 10) return "Aesthetic Builder";
  if (level >= 7) return "Hypertrophy Hunter";
  if (level >= 5) return "Volume Apprentice";
  if (level >= 3) return "Consistency Rookie";
  if (level >= 2) return "Locked In";
  return "Beginner Builder";
}

export function buildXPEvents(data: AppData): XPEvent[] {
  const logs = canonicalWorkoutLogs(data.workoutLogs);
  const prRecords = detectPRs(data);
  const events = new Map<string, XPEvent>();
  const bodyDates = bodyWeightDates(data.bodyWeights);
  const startDate = effectiveProgramStartDate(data.settings, data.workoutLogs);
  const today = todayISO();
  const maxWeek = getCycleInfo(startDate, today).programWeek;

  const add = (event: XPEvent) => {
    if (!events.has(event.key)) events.set(event.key, event);
  };

  bodyDates.forEach((date) => {
    add({ key: `bodyweight:${date}`, kind: "bodyweight", date, label: "Body weight logged", xp: 10 });
  });

  logs.forEach((log) => {
    const dayKey = log.dayKey;
    const workout = getWorkoutByKey(dayKey);
    const isTraining = isTrainingDay(dayKey);
    const isCompleted = log.status === "completed";
    const hasEasyCardio = log.exerciseLogs.some((exerciseLog) => exerciseLog.cardio?.completed && !HARD_CARDIO_RE.test(exerciseLog.cardio?.intensityNotes ?? ""));
    const allExercisesComplete = workout.exercises.length > 0 && workout.exercises.every((exercise) => {
      const exerciseLog = log.exerciseLogs.find((item) => item.exerciseId === exercise.id);
      return !!exerciseLog && (exerciseLog.completed || exerciseLog.sets.every((set) => set.completed));
    });
    const fullLogging = workout.exercises.length > 0 && workout.exercises.every((exercise) => {
      const exerciseLog = log.exerciseLogs.find((item) => item.exerciseId === exercise.id);
      return !!exerciseLog && exerciseLogFullyLogged(exerciseLog);
    });

    if (isTraining && isCompleted) {
      add({ key: `workout-complete:${log.date}:${dayKey}`, kind: "workout", date: log.date, label: `${workout.shortTitle} complete`, xp: 100, workoutId: log.id });
      if (allExercisesComplete) {
        add({ key: `exercise-complete:${log.date}:${dayKey}`, kind: "logging", date: log.date, label: "Every planned exercise completed", xp: 40, workoutId: log.id });
      }
      if (fullLogging) {
        add({ key: `full-logging:${log.date}:${dayKey}`, kind: "logging", date: log.date, label: "Full set logging", xp: 30, workoutId: log.id });
      }
      if (hasEasyCardio) {
        add({ key: `easy-cardio:${log.date}:${dayKey}`, kind: "rest", date: log.date, label: "Easy cardio completed", xp: 15, workoutId: log.id });
      }
    }

    if (!isTraining && log.restDay?.completed) {
      add({ key: `rest-checkin:${log.date}`, kind: "rest", date: log.date, label: "Recovery check-in", xp: 25, workoutId: log.id });
      if (log.restDay.mode === "easy-walk" && !HARD_CARDIO_RE.test(log.restDay.intensityNotes ?? "")) {
        add({ key: `easy-walk:${log.date}`, kind: "rest", date: log.date, label: "Allowed easy walk", xp: 15, workoutId: log.id });
      }
    }
  });

  const prsByWorkout = new Map<string, PRRecord[]>();
  prRecords.forEach((pr) => {
    const list = prsByWorkout.get(pr.workoutId) ?? [];
    list.push(pr);
    prsByWorkout.set(pr.workoutId, list);
  });
  prsByWorkout.forEach((prs, workoutId) => {
    prs.slice(0, 3).forEach((pr) => {
      add({ key: pr.id, kind: "pr", date: pr.date, label: `PR: ${pr.exerciseName}`, xp: 25, workoutId });
    });
  });

  for (let week = 1; week <= maxWeek; week += 1) {
    if (allScheduledWorkoutsComplete(logs, week)) {
      const date = weekDates(startDate, week).at(-1) ?? today;
      add({ key: `weekly-completion:${week}`, kind: "weekly", date, label: `Program Week ${week} complete`, xp: 150, programWeek: week });
      const weekLogs = logs.filter((log) => log.week === week);
      const clean = weekLogs.every((log) => !hasHardCardio(log)) && weekLogs.filter((log) => !isTrainingDay(log.dayKey)).every((log) => !completedSetCount(log));
      if (clean) {
        add({ key: `clean-week:${week}`, kind: "clean-week", date, label: `Clean execution week`, xp: 100, programWeek: week });
      }
    }
  }

  const actionDates = dailyActionDates(data);
  actionDates.forEach((date, index) => {
    const previous = actionDates[index - 1];
    const gap = previous ? daysSince(previous, date) - 1 : 0;
    if (gap >= 2) {
      add({ key: `comeback:${date}`, kind: "comeback", date, label: "Comeback check-in", xp: 20 });
    }
    const streakBonus = Math.min(15, 5 + index + 1);
    if (index > 0) add({ key: `streak:${date}`, kind: "streak", date, label: "Consistency streak", xp: streakBonus });
  });

  return Array.from(events.values()).sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
}

function dailyActionDates(data: AppData): string[] {
  const dates = new Set<string>();
  canonicalWorkoutLogs(data.workoutLogs).forEach((log) => {
    if (log.status === "completed" && isTrainingDay(log.dayKey)) dates.add(log.date);
    if (log.restDay?.completed) dates.add(log.date);
    if (log.exerciseLogs.some((exerciseLog) => exerciseLog.cardio?.completed)) dates.add(log.date);
  });
  bodyWeightDates(data.bodyWeights).forEach((date) => dates.add(date));
  return Array.from(dates).sort();
}

export function calculateStreaks(data: AppData): StreakStats {
  const logs = canonicalWorkoutLogs(data.workoutLogs);
  const completedTrainingDates = logs.filter((log) => log.status === "completed" && isTrainingDay(log.dayKey)).map((log) => log.date).sort();
  const actionDates = dailyActionDates(data);
  const startDate = effectiveProgramStartDate(data.settings, data.workoutLogs);
  const today = todayISO();
  const currentWeek = getCycleInfo(startDate, today).programWeek;

  return {
    workout: scheduledWorkoutStreak(completedTrainingDates, startDate, today),
    dailyCheckIn: forgivingDailyStreak(actionDates, startDate, today),
    weeklyCompletion: weeklyCompletionStreak(logs, currentWeek),
    comebackReady: actionDates.length ? daysSince(actionDates.at(-1)!, today) >= 2 : false,
  };
}

function scheduledWorkoutStreak(completedDates: string[], startDate: string, today: string): { current: number; best: number } {
  const completed = new Set(completedDates);
  let current = 0;
  let best = 0;
  const totalDays = Math.max(0, daysSince(startDate, today));
  for (let offset = 0; offset <= totalDays; offset += 1) {
    const date = addDays(startDate, offset);
    if (!isTrainingDay(dayKeyForDate(date))) continue;
    if (completed.has(date)) current += 1;
    else current = 0;
    best = Math.max(best, current);
  }
  return { current, best };
}

function forgivingDailyStreak(actionDates: string[], startDate: string, today: string): StreakStats["dailyCheckIn"] {
  if (!actionDates.length) return { current: 0, best: 0, graceUsedThisWeek: false };
  const actionSet = new Set(actionDates);
  let best = 0;
  let run = 0;
  let graceUsedThisWeek = false;
  const start = actionDates[0] < startDate ? actionDates[0] : startDate;
  const totalDays = Math.max(0, daysSince(start, today));
  let weeklyGrace = new Map<number, number>();
  for (let offset = 0; offset <= totalDays; offset += 1) {
    const date = addDays(start, offset);
    const week = getCycleInfo(startDate, date).programWeek;
    if (actionSet.has(date)) {
      run += 1;
    } else {
      const used = weeklyGrace.get(week) ?? 0;
      if (used < 1) {
        weeklyGrace.set(week, used + 1);
        run += 1;
        if (week === getCycleInfo(startDate, today).programWeek) graceUsedThisWeek = true;
      } else {
        run = 0;
      }
    }
    best = Math.max(best, run);
  }
  return { current: run, best, graceUsedThisWeek };
}

function weeklyCompletionStreak(logs: WorkoutLog[], currentWeek: number): { current: number; best: number } {
  const completeWeeks = new Set<number>();
  for (let week = 1; week <= currentWeek; week += 1) {
    if (allScheduledWorkoutsComplete(logs, week)) completeWeeks.add(week);
  }
  const weeks = Array.from(completeWeeks).sort((a, b) => a - b);
  if (!weeks.length) return { current: 0, best: 0 };
  let run = 1;
  let best = 1;
  for (let index = 1; index < weeks.length; index += 1) {
    run = weeks[index] === weeks[index - 1] + 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  let current = 0;
  for (let week = currentWeek; week >= 1; week -= 1) {
    if (!completeWeeks.has(week)) break;
    current += 1;
  }
  return { current, best };
}

export function calculateExecutionScore(data: AppData): ExecutionScore {
  const logs = canonicalWorkoutLogs(data.workoutLogs);
  const startDate = effectiveProgramStartDate(data.settings, data.workoutLogs);
  const today = todayISO();
  const currentWeek = getCycleInfo(startDate, today).programWeek;
  const lookbackWeeks = Array.from({ length: Math.min(8, currentWeek) }, (_, index) => currentWeek - index).filter((week) => week > 0);
  const relevantLogs = logs.filter((log) => lookbackWeeks.includes(log.week));
  const dueTrainingDays = lookbackWeeks.length * trainingDayKeys.length;
  const completedTraining = relevantLogs.filter((log) => log.status === "completed" && isTrainingDay(log.dayKey)).length;
  const consistency = scorePercent(completedTraining, Math.max(1, dueTrainingDays));

  const completedLogs = relevantLogs.filter((log) => log.status === "completed" && isTrainingDay(log.dayKey));
  const logging = completedLogs.length
    ? Math.round(completedLogs.reduce((sum, log) => sum + loggingQualityForWorkout(log), 0) / completedLogs.length)
    : 70;

  const recoveryPenalties =
    relevantLogs.filter((log) => hasHardCardio(log)).length * 18 +
    relevantLogs.filter((log) => !isTrainingDay(log.dayKey) && completedSetCount(log) > 0).length * 25 +
    relevantLogs.filter((log) => hasPainOrRegression(log)).length * 6;
  const recovery = Math.max(45, 100 - recoveryPenalties);

  const prs = detectPRs({ ...data, workoutLogs: relevantLogs });
  const volumes = completedLogs.map(workoutVolume).filter((volume) => volume > 0);
  const progression = prs.length
    ? 95
    : volumes.length < 2
      ? 75
      : volumes.at(-1)! >= volumes[0] * 0.92
        ? 82
        : 68;

  const thisWeekWeightLogs = data.bodyWeights.filter((entry) => getCycleInfo(startDate, entry.date).programWeek === currentWeek).length;
  const bodyWeight = thisWeekWeightLogs >= 2 && thisWeekWeightLogs <= 4 ? 100 : thisWeekWeightLogs === 1 || thisWeekWeightLogs >= 5 ? 85 : 70;

  const overall = Math.round(consistency * 0.4 + logging * 0.25 + recovery * 0.15 + progression * 0.1 + bodyWeight * 0.1);
  return {
    overall,
    label: executionLabel(overall),
    consistency,
    logging,
    recovery,
    progression,
    bodyWeight,
  };
}

function scorePercent(value: number, target: number): number {
  return Math.max(0, Math.min(100, Math.round((value / target) * 100)));
}

function executionLabel(score: number): string {
  if (score >= 90) return "Locked In";
  if (score >= 80) return "Strong Week";
  if (score >= 70) return "Solid, Needs Cleanup";
  if (score >= 60) return "Inconsistent";
  return "Reset and Rebuild";
}

export function generateDailyActivity(data: AppData): DailyActivity[] {
  const logs = canonicalWorkoutLogs(data.workoutLogs);
  const xpEvents = buildXPEvents(data);
  const prs = detectPRs(data);
  const weights = bodyWeightDates(data.bodyWeights);
  const startDate = effectiveProgramStartDate(data.settings, data.workoutLogs);
  const today = todayISO();
  const days = Math.max(56, daysSince(startDate, today) + 1);

  return Array.from({ length: days }, (_, index) => {
    const date = addDays(today, index - days + 1);
    const dayLogs = logs.filter((log) => log.date === date);
    const dayXP = xpEvents.filter((event) => event.date === date).reduce((sum, event) => sum + event.xp, 0);
    const hasPR = prs.some((pr) => pr.date === date);
    const completed = dayLogs.some((log) => log.status === "completed" && isTrainingDay(log.dayKey));
    const started = dayLogs.some((log) => log.status === "draft" && isTrainingDay(log.dayKey));
    const rest = dayLogs.some((log) => log.restDay?.completed);
    const full = dayLogs.some((log) => loggingQualityForWorkout(log) >= 95 && log.status === "completed");
    const state: DailyActivity["state"] = hasPR || dayXP >= 180 ? "high" : full ? "full" : completed ? "completed" : started ? "started" : rest ? "rest" : "none";
    const summaryParts = [
      completed ? "Workout completed" : started ? "Workout started" : rest ? "Recovery check-in" : "",
      weights.has(date) ? "Body weight logged" : "",
      hasPR ? "PR day" : "",
      dayXP ? `${dayXP} XP` : "",
    ].filter(Boolean);
    return {
      date,
      state,
      xp: dayXP,
      summary: summaryParts.join(" · ") || "No logged activity",
      hasWorkout: completed || started,
      hasBodyWeight: weights.has(date),
      hasPR,
    };
  });
}

export function unlockAchievements(data: AppData, memory: GamificationSettings): Achievement[] {
  const logs = canonicalWorkoutLogs(data.workoutLogs);
  const completedWorkouts = logs.filter((log) => log.status === "completed" && isTrainingDay(log.dayKey));
  const prs = detectPRs(data);
  const streaks = calculateStreaks(data);
  const xpEvents = buildXPEvents(data);
  const startDate = effectiveProgramStartDate(data.settings, data.workoutLogs);
  const currentWeek = getCycleInfo(startDate, todayISO()).programWeek;
  const fullWeeks = Array.from({ length: currentWeek }, (_, index) => index + 1).filter((week) => allScheduledWorkoutsComplete(logs, week));
  const cleanWeeks = xpEvents.filter((event) => event.kind === "clean-week").length;
  const comeback = xpEvents.some((event) => event.kind === "comeback");

  const definitions: Array<Omit<Achievement, "unlocked" | "unlockedAt">> = [
    { id: "first-workout", title: "First Workout Logged", description: "Complete your first scheduled workout.", progressCurrent: completedWorkouts.length, progressTarget: 1 },
    { id: "perfect-logging-day", title: "Perfect Logging Day", description: "Complete a workout with every set fully logged.", progressCurrent: completedWorkouts.some((log) => loggingQualityForWorkout(log) >= 100) ? 1 : 0, progressTarget: 1 },
    { id: "first-pr", title: "First PR", description: "Set your first conservative PR.", progressCurrent: prs.length, progressTarget: 1 },
    { id: "five-workouts", title: "5 Workouts Completed", description: "Complete 5 scheduled workouts.", progressCurrent: completedWorkouts.length, progressTarget: 5 },
    { id: "ten-workouts", title: "10 Workouts Completed", description: "Complete 10 scheduled workouts.", progressCurrent: completedWorkouts.length, progressTarget: 10 },
    { id: "twenty-five-workouts", title: "25 Workouts Completed", description: "Complete 25 scheduled workouts.", progressCurrent: completedWorkouts.length, progressTarget: 25 },
    { id: "first-full-week", title: "First Full Week Completed", description: "Complete every scheduled workout in a program week.", progressCurrent: fullWeeks.length, progressTarget: 1 },
    { id: "seven-day-checkin", title: "7-Day Check-In Streak", description: "Build a 7-day daily check-in streak.", progressCurrent: streaks.dailyCheckIn.best, progressTarget: 7 },
    { id: "fourteen-day-checkin", title: "14-Day Check-In Streak", description: "Build a 14-day daily check-in streak.", progressCurrent: streaks.dailyCheckIn.best, progressTarget: 14 },
    { id: "rest-day-discipline", title: "Rest Day Discipline", description: "Complete 4 recovery/rest check-ins.", progressCurrent: logs.filter((log) => log.restDay?.completed).length, progressTarget: 4 },
    { id: "first-cycle", title: "First Cycle Completed", description: "Complete 40 scheduled workouts in a cycle.", progressCurrent: completedWorkouts.filter((log) => (log.cycle ?? 1) === 1).length, progressTarget: 40 },
    { id: "body-weight-tracker", title: "Body Weight Tracker", description: "Log body weight 8 times.", progressCurrent: bodyWeightDates(data.bodyWeights).size, progressTarget: 8 },
    { id: "no-missed-week", title: "No Missed Workouts This Week", description: "Finish a program week with no missed scheduled workouts.", progressCurrent: fullWeeks.includes(currentWeek) ? 1 : 0, progressTarget: 1 },
    { id: "comeback-workout", title: "Comeback Workout", description: "Return after missing multiple days.", progressCurrent: comeback ? 1 : 0, progressTarget: 1 },
    { id: "clean-execution-week", title: "Clean Execution Week", description: "Finish a week without hard-cardio or rest-day lifting flags.", progressCurrent: cleanWeeks, progressTarget: 1 },
  ];

  return definitions.map((badge) => {
    const unlocked = badge.progressCurrent >= badge.progressTarget;
    const existing = memory.badgeUnlocks[badge.id];
    return {
      ...badge,
      progressCurrent: Math.min(badge.progressCurrent, badge.progressTarget),
      unlocked,
      unlockedAt: existing ?? (unlocked ? firstMeaningfulDate(data) : undefined),
    };
  });
}

function firstMeaningfulDate(data: AppData): string {
  return [
    ...data.workoutLogs.map((log) => log.date),
    ...data.bodyWeights.map((entry) => entry.date),
    todayISO(),
  ].sort()[0];
}

export function calculateGamification(data: AppData): GamificationSummary {
  const settings = getGamificationSettings(data.settings);
  const xpEvents = buildXPEvents(data);
  const totalXP = xpEvents.reduce((sum, event) => sum + event.xp, 0);
  const prs = detectPRs(data);
  const achievements = unlockAchievements(data, settings);
  return {
    settings,
    xpEvents,
    totalXP,
    level: calculateLevelFromXP(totalXP),
    prs,
    streaks: calculateStreaks(data),
    executionScore: calculateExecutionScore(data),
    activities: generateDailyActivity(data),
    achievements,
    recentBadges: achievements.filter((badge) => badge.unlocked).sort((a, b) => (b.unlockedAt ?? "").localeCompare(a.unlockedAt ?? "")).slice(0, 4),
    recentPRs: [...prs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5),
  };
}

export function buildTodayMission(data: AppData, hasSyncIssue = false): TodayMission {
  const today = todayISO();
  const dayKey = dayKeyForDate(today);
  const workout = workoutDays[dayKey];
  const startDate = effectiveProgramStartDate(data.settings, data.workoutLogs, today);
  const cycle = getCycleInfo(startDate, today);
  const todayLogs = data.workoutLogs.filter((log) => log.date === today && log.dayKey === dayKey);
  const draft = todayLogs.find((log) => log.status === "draft");
  const completed = todayLogs.find((log) => log.status === "completed");
  const gamification = calculateGamification(data);
  const weeklyWeights = data.bodyWeights.filter((entry) => getCycleInfo(startDate, entry.date).programWeek === cycle.programWeek).length;
  const nearLevel = gamification.level.xpToNext <= 100;
  const focusCue = nextFocusCue(data, today);
  const base = {
    title: isTrainingDay(dayKey) ? workout.shortTitle : "Recovery Day",
    subtitle: `Program Week ${cycle.programWeek} · Cycle ${cycle.cycle}, Week ${cycle.weekInCycle} of 8`,
    availableXP: isTrainingDay(dayKey) ? (workout.cardio ? 185 : 170) : 40,
    focusCue,
  };
  if (hasSyncIssue) return { ...base, nextBestAction: "Sync data so today starts clean.", action: "sync" };
  if (draft) return { ...base, nextBestAction: "Continue Workout", action: "continue-workout", workoutId: draft.id };
  if (completed && !gamification.settings.seenRecaps.includes(completed.id)) {
    return { ...base, nextBestAction: "Review Recap", action: "review-recap", workoutId: completed.id };
  }
  if (isTrainingDay(dayKey)) return { ...base, nextBestAction: "Start today's workout.", action: "start-workout" };
  if (!completed?.restDay?.completed) return { ...base, nextBestAction: "Complete rest-day check-in.", action: "rest-checkin", workoutId: completed?.id };
  if (weeklyWeights < 2) return { ...base, nextBestAction: "Log body weight.", action: "log-weight" };
  if (nearLevel) return { ...base, nextBestAction: `You are ${gamification.level.xpToNext} XP from Level ${gamification.level.level + 1}.`, action: "log-weight" };
  return { ...base, nextBestAction: "Review progress.", action: "review-recap", workoutId: completed?.id };
}

function nextFocusCue(data: AppData, date: string): string {
  const dayKey = dayKeyForDate(date);
  if (!isTrainingDay(dayKey)) return "Recovery check-in keeps the daily streak alive without extra lifting.";
  const workout = workoutDays[dayKey];
  const firstExercise = workout.exercises[0];
  const prior = canonicalWorkoutLogs(data.workoutLogs)
    .filter((log) => log.date < date && log.status === "completed")
    .flatMap((log) => log.exerciseLogs.map((exerciseLog) => ({ log, exerciseLog, exercise: findExercise(exerciseLog.exerciseId) })))
    .filter((item) => item.exercise?.name === firstExercise?.name)
    .at(-1);
  if (prior) return `Next target: add 1 clean rep on ${prior.exercise?.name} before increasing weight.`;
  return workout.intent ?? `Focus: ${workout.subtitle}.`;
}

export function buildWorkoutRecap(workoutId: string, data: AppData): WorkoutRecap | null {
  const log = data.workoutLogs.find((item) => item.id === workoutId);
  if (!log) return null;
  const summary = calculateGamification(data);
  const xpEvents = summary.xpEvents.filter((event) => event.workoutId === workoutId || (event.date === log.date && event.kind === "pr"));
  const xpEarned = xpEvents.reduce((sum, event) => sum + event.xp, 0);
  const prs = summary.prs.filter((pr) => pr.workoutId === workoutId);
  const badgesUnlocked = summary.achievements.filter((badge) => badge.unlocked && !summary.settings.badgeUnlocks[badge.id]).slice(0, 3);
  const loggingQuality = loggingQualityForWorkout(log);
  const workoutScore = Math.round(
    (log.status === "completed" ? 45 : 0) +
      (completedExerciseCount(log) / Math.max(1, log.exerciseLogs.length)) * 20 +
      loggingQuality * 0.25 +
      Math.min(10, prs.length * 4),
  );
  return {
    log,
    xpEarned,
    xpEvents,
    level: summary.level,
    workoutScore: Math.max(0, Math.min(100, workoutScore)),
    exercisesCompleted: completedExerciseCount(log),
    setsCompleted: completedSetCount(log),
    loggingQuality,
    prs,
    badgesUnlocked,
    streakText: `${summary.streaks.workout.current} workout · ${summary.streaks.dailyCheckIn.current} daily check-in`,
    nextFocus: nextFocusCue(data, addDays(log.date, 1)),
  };
}
