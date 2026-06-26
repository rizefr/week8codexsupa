import { AppData, BodyWeightLog, DayKey, Exercise, ExerciseLog, GamificationSettings, ProgramSettings, SetLog, WorkoutLog } from "../types";
import { getWorkoutByKey, trainingDayKeys, workoutDays } from "../data/routine";
import { addDays, dayKeyForDate, daysSince, getCycleInfo, todayISO } from "./date";
import {
  bestAssistance,
  bestSetReps,
  bestTimedSet,
  completedExerciseCount,
  completedSetCount,
  effectiveProgramStartDate,
  canonicalExerciseKey,
  exerciseMatches,
  exerciseVolume,
  findExercise,
  isTrainingDay,
  numericValue,
  previousExercisePerformance,
  setInputsAreValid,
  targetRIRForExercise,
  totalRepsForExerciseLog,
  totalSecondsForExerciseLog,
  trackingTypeForExercise,
  validLoadValue,
  validRepValue,
  validRirValue,
  validSecondValue,
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
  metric: "weight" | "reps-at-weight" | "total-reps" | "volume" | "timed" | "assistance" | "best-set";
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

export type PlayerArchetype =
  | "V-Taper Builder"
  | "Back Width Focus"
  | "Clean Logger"
  | "Recovery Discipline"
  | "Lower Body Comeback"
  | "Consistency Streak"
  | "Upper Body Push";

export interface PlayerStatus {
  archetype: PlayerArchetype;
  momentumStatus: string;
  cycleLabel: string;
  nextUnlock: string;
  weeklyProgress: string;
  reasons: string[];
}

export interface DailyQuest {
  id: string;
  title: string;
  detail: string;
  completed: boolean;
  progressCurrent: number;
  progressTarget: number;
  tone: "mission" | "quality" | "recovery" | "progress";
}

export interface WeeklyChallenge {
  id: string;
  title: string;
  detail: string;
  completed: boolean;
  progressCurrent: number;
  progressTarget: number;
  nextStep: string;
}

export type PRTierTitle =
  | "Baseline Established"
  | "Rep PR"
  | "Volume PR"
  | "Assistance Improvement"
  | "Hold-Time PR"
  | "Consistency PR";

export interface BaselineRecord {
  id: string;
  workoutId: string;
  date: string;
  exerciseName: string;
  label: string;
}

export interface AchievementPreview {
  id: string;
  title: string;
  label: string;
  progressPercent: number;
}

export interface TodayMission {
  title: string;
  subtitle: string;
  availableXP: number;
  focusCue: string;
  nextBestAction: string;
  action: "sync" | "continue-workout" | "review-recap" | "start-workout" | "rest-checkin" | "log-weight" | "progress";
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
  quests: DailyQuest[];
  weeklyChallenge: WeeklyChallenge;
  baselines: BaselineRecord[];
  lockInReasons: string[];
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
  playerStatus: PlayerStatus;
  dailyQuests: DailyQuest[];
  weeklyChallenge: WeeklyChallenge;
  achievementPreviews: AchievementPreview[];
}

export const defaultGamificationSettings: GamificationSettings = {
  enabled: true,
  showCelebrations: true,
  compactMode: false,
  version: 1,
  badgeUnlocks: {},
  seenRecaps: [],
  bodyWeightPromptSkips: [],
  showDisciplineCues: true,
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
    bodyWeightPromptSkips: Array.from(new Set(incoming?.bodyWeightPromptSkips ?? [])),
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
    bodyWeightPromptSkips: Array.from(
      new Set([
        ...(normalizedBase.bodyWeightPromptSkips ?? []),
        ...(local?.bodyWeightPromptSkips ?? []),
        ...(remote?.bodyWeightPromptSkips ?? []),
      ]),
    ),
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

function setIsFullyLogged(set: SetLog, exercise: Exercise): boolean {
  return set.completed && setInputsAreValid(set, exercise);
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
      const key = log.date;
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

function completedTrainingDatesByWeek(logs: WorkoutLog[], week: number): Set<string> {
  return new Set(logs.filter((log) => log.week === week && log.status === "completed" && isTrainingDay(log.dayKey)).map((log) => log.date));
}

function allScheduledWorkoutsComplete(logs: WorkoutLog[], week: number): boolean {
  const days = completedTrainingDatesByWeek(logs, week);
  return days.size >= trainingDayKeys.length;
}

export function detectPRs(data: AppData): PRRecord[] {
  const prs: PRRecord[] = [];
  const bestWeight = new Map<string, number>();
  const bestRepsAtWeight = new Map<string, number>();
  const bestTotalReps = new Map<string, number>();
  const bestVolume = new Map<string, number>();
  const bestTimed = new Map<string, number>();
  const bestTotalSeconds = new Map<string, number>();
  const bestBodyweightSet = new Map<string, number>();
  const bestAssistedRepsAtAssistance = new Map<string, number>();
  const bestLowAssistance = new Map<string, { assistance: number; totalReps: number }>();

  const recordIfBetter = (
    key: string,
    current: number,
    store: Map<string, number>,
    makeRecord: (previous: number) => PRRecord,
  ) => {
    const previous = store.get(key);
    if (current <= 0 || current <= (previous ?? 0)) return;
    if (previous !== undefined) prs.push(makeRecord(previous));
    store.set(key, current);
  };

  canonicalWorkoutLogs(data.workoutLogs)
    .filter((log) => log.status === "completed")
    .forEach((workout) => {
      workout.exerciseLogs.forEach((exerciseLog) => {
        const exercise = findExercise(exerciseLog.exerciseId);
        if (!exercise || exercise.prEligible === false) return;
        const name = exercise.name;
        const normalized = canonicalExerciseKey(exercise);
        const completedSets = exerciseLog.sets.filter((set) => set.completed);
        if (!completedSets.length) return;

        const trackingType = trackingTypeForExercise(exercise);
        const totalReps = totalRepsForExerciseLog(exerciseLog, exercise);
        const sessionVolume = exerciseVolume(exerciseLog);

        if (trackingType === "weighted-reps") {
          const loads = completedSets.map((set) => validLoadValue(set.weight)).filter(Boolean);
          const maxLoad = Math.max(0, ...loads);
          const unit = /db|dumbbell/i.test(name) ? "lb per DB" : "lb";
          recordIfBetter(normalized, maxLoad, bestWeight, (previous) => ({
            id: `pr:${normalized}:${workout.date}:weight`,
            date: workout.date,
            workoutId: workout.id,
            exerciseName: name,
            metric: "weight",
            label: `New best load: ${maxLoad} ${unit}`,
            value: maxLoad,
            previous,
            unit,
          }));

          completedSets.forEach((set) => {
            const load = validLoadValue(set.weight);
            const reps = exercise.unilateral ? Math.min(validRepValue(set.leftReps), validRepValue(set.rightReps)) : validRepValue(set.reps);
            if (!load || !reps) return;
            const key = `${normalized}:${load}`;
            recordIfBetter(key, reps, bestRepsAtWeight, (previous) => ({
              id: `pr:${normalized}:${workout.date}:reps-${load}`,
              date: workout.date,
              workoutId: workout.id,
              exerciseName: name,
              metric: "reps-at-weight",
              label: `${reps} reps at ${load} ${unit}`,
              value: reps,
              previous,
              unit: `reps at ${load} ${unit}`,
            }));
          });

          recordIfBetter(normalized, sessionVolume, bestVolume, (previous) => ({
            id: `pr:${normalized}:${workout.date}:volume`,
            date: workout.date,
            workoutId: workout.id,
            exerciseName: name,
            metric: "volume",
            label: `${Math.round(sessionVolume).toLocaleString()} lb logged volume`,
            value: sessionVolume,
            previous,
            unit: "lb volume",
          }));
          recordIfBetter(`${normalized}:total-reps`, totalReps, bestTotalReps, (previous) => ({
            id: `pr:${normalized}:${workout.date}:total-reps`,
            date: workout.date,
            workoutId: workout.id,
            exerciseName: name,
            metric: "total-reps",
            label: `${totalReps} total reps`,
            value: totalReps,
            previous,
            unit: "total reps",
          }));
          return;
        }

        if (trackingType === "assistance-reps") {
          completedSets.forEach((set) => {
            const assistance = validLoadValue(set.weight);
            const reps = exercise.unilateral ? Math.min(validRepValue(set.leftReps), validRepValue(set.rightReps)) : validRepValue(set.reps);
            if (!assistance || !reps) return;
            const key = `${normalized}:${assistance}`;
            recordIfBetter(key, reps, bestAssistedRepsAtAssistance, (previous) => ({
              id: `pr:${normalized}:${workout.date}:assisted-reps-${assistance}`,
              date: workout.date,
              workoutId: workout.id,
              exerciseName: name,
              metric: "assistance",
              label: `More reps at same assistance: ${reps} reps at ${assistance} lb assistance`,
              value: reps,
              previous,
              unit: `reps at ${assistance} lb assistance`,
            }));
          });

          const currentAssistance = bestAssistance(exerciseLog);
          const previousLow = bestLowAssistance.get(normalized);
          if (
            currentAssistance > 0 &&
            (!previousLow || currentAssistance < previousLow.assistance || (currentAssistance === previousLow.assistance && totalReps > previousLow.totalReps))
          ) {
            if (previousLow && currentAssistance < previousLow.assistance && totalReps >= previousLow.totalReps) {
              prs.push({
                id: `pr:${normalized}:${workout.date}:less-assistance`,
                date: workout.date,
                workoutId: workout.id,
                exerciseName: name,
                metric: "assistance",
                label: `Less assistance at same/higher reps: ${currentAssistance} lb assistance`,
                value: currentAssistance,
                previous: previousLow.assistance,
                unit: "lb assistance",
              });
            }
            bestLowAssistance.set(normalized, { assistance: currentAssistance, totalReps });
          }
          return;
        }

        if (trackingType === "timed") {
          const bestHold = bestTimedSet(exerciseLog);
          const totalSeconds = totalSecondsForExerciseLog(exerciseLog);
          recordIfBetter(normalized, bestHold, bestTimed, (previous) => ({
            id: `pr:${normalized}:${workout.date}:timed`,
            date: workout.date,
            workoutId: workout.id,
            exerciseName: name,
            metric: "timed",
            label: `${bestHold} sec best hold`,
            value: bestHold,
            previous,
            unit: "sec",
          }));
          recordIfBetter(`${normalized}:total-seconds`, totalSeconds, bestTotalSeconds, (previous) => ({
            id: `pr:${normalized}:${workout.date}:total-seconds`,
            date: workout.date,
            workoutId: workout.id,
            exerciseName: name,
            metric: "timed",
            label: `${totalSeconds} total seconds`,
            value: totalSeconds,
            previous,
            unit: "sec",
          }));
          return;
        }

        if (trackingType === "bodyweight-reps") {
          const bestSet = bestSetReps(exerciseLog, exercise);
          recordIfBetter(normalized, bestSet, bestBodyweightSet, (previous) => ({
            id: `pr:${normalized}:${workout.date}:best-set`,
            date: workout.date,
            workoutId: workout.id,
            exerciseName: name,
            metric: "best-set",
            label: `${bestSet} reps best set`,
            value: bestSet,
            previous,
            unit: "reps",
          }));
          recordIfBetter(`${normalized}:total-reps`, totalReps, bestTotalReps, (previous) => ({
            id: `pr:${normalized}:${workout.date}:total-reps`,
            date: workout.date,
            workoutId: workout.id,
            exerciseName: name,
            metric: "total-reps",
            label: `${totalReps} total reps`,
            value: totalReps,
            previous,
            unit: "total reps",
          }));
        }
      });
    });

  return prs.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
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

function currentWeekContext(data: AppData, date = todayISO()) {
  const logs = canonicalWorkoutLogs(data.workoutLogs);
  const startDate = effectiveProgramStartDate(data.settings, data.workoutLogs, date);
  const cycle = getCycleInfo(startDate, date);
  const weekLogs = logs.filter((log) => log.week === cycle.programWeek);
  return { logs, startDate, cycle, weekLogs };
}

function safePercent(value: number, target: number): number {
  if (target <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((value / target) * 100)));
}

function scheduledWorkoutComplete(logs: WorkoutLog[], dayKey: DayKey, week: number): boolean {
  return logs.some((log) => log.week === week && log.dayKey === dayKey && log.status === "completed" && isTrainingDay(log.dayKey));
}

function plannedSetTargetForMuscles(groups: string[]): number {
  return trainingDayKeys.reduce((sum, dayKey) => {
    const workout = getWorkoutByKey(dayKey);
    return sum + workout.exercises.reduce((exerciseSum, exercise) => {
      const hits = exercise.muscleGroups?.some((group) => groups.includes(group)) ?? false;
      return hits ? exerciseSum + (exercise.sets ?? 0) : exerciseSum;
    }, 0);
  }, 0);
}

function completedSetCountForMuscles(logs: WorkoutLog[], groups: string[]): number {
  return logs.reduce((sum, log) => {
    if (log.status !== "completed") return sum;
    return sum + log.exerciseLogs.reduce((exerciseSum, exerciseLog) => {
      const exercise = findExercise(exerciseLog.exerciseId);
      const hits = exercise?.muscleGroups?.some((group) => groups.includes(group)) ?? false;
      return hits ? exerciseSum + exerciseLog.sets.filter((set) => set.completed).length : exerciseSum;
    }, 0);
  }, 0);
}

function safeRirSetStats(logs: WorkoutLog[]) {
  let valid = 0;
  let targetMatched = 0;
  let riskyTooLow = 0;
  logs.forEach((log) => {
    log.exerciseLogs.forEach((exerciseLog) => {
      const exercise = findExercise(exerciseLog.exerciseId);
      if (!exercise) return;
      const risk = exercise.riskLevel === "higher" || /press|bench|pull-up|dip|row|squat|deadlift|rdl|split squat/i.test(exercise.name);
      if (!risk) return;
      const target = targetRIRForExercise(exercise, log.weekInCycle);
      const upper = /setup/i.test(target) ? 3 : /0-1|0–1/.test(target) ? 2 : 2;
      exerciseLog.sets.filter((set) => set.completed && validRirValue(set.rir)).forEach((set) => {
        valid += 1;
        const rir = numericValue(set.rir);
        if (rir >= 0 && rir <= upper) targetMatched += 1;
        if (rir <= 0.25) riskyTooLow += 1;
      });
    });
  });
  return { valid, targetMatched, riskyTooLow };
}

export function achievementProgressPreview(badge: Achievement): AchievementPreview {
  const current = Math.min(badge.progressCurrent, badge.progressTarget);
  const remaining = Math.max(0, badge.progressTarget - current);
  const unit = /workout/i.test(badge.title) ? "workout" : /week/i.test(badge.title) ? "week" : /streak/i.test(badge.title) ? "day" : "step";
  const label = badge.unlocked
    ? "Unlocked"
    : remaining === 1
      ? `1 ${unit} away`
      : `${current} / ${badge.progressTarget}`;
  return {
    id: badge.id,
    title: badge.title,
    label,
    progressPercent: safePercent(current, badge.progressTarget),
  };
}

export function classifyPRTier(pr: PRRecord): { title: PRTierTitle; label: string } {
  if (pr.metric === "volume") return { title: "Volume PR", label: pr.label };
  if (pr.metric === "assistance") return { title: "Assistance Improvement", label: pr.label };
  if (pr.metric === "timed") return { title: "Hold-Time PR", label: pr.label };
  if (pr.metric === "total-reps" || pr.metric === "reps-at-weight" || pr.metric === "best-set") {
    return { title: "Rep PR", label: pr.label };
  }
  return { title: "Consistency PR", label: pr.label };
}

export function baselineRecordsForWorkout(workout: WorkoutLog, data: AppData): BaselineRecord[] {
  return workout.exerciseLogs.flatMap((exerciseLog) => {
    const exercise = findExercise(exerciseLog.exerciseId);
    if (!exercise || exercise.prEligible === false) return [];
    if (!exerciseLog.completed && !exerciseLog.sets.some((set) => set.completed)) return [];
    if (previousExercisePerformance(data.workoutLogs, workout.date, exercise.name)) return [];
    return [{
      id: `baseline:${workout.id}:${exercise.id}`,
      workoutId: workout.id,
      date: workout.date,
      exerciseName: exercise.name,
      label: `${exercise.name} now has a baseline for future comparisons.`,
    }];
  });
}

export function buildDailyQuests(data: AppData, date = todayISO()): DailyQuest[] {
  const { startDate, cycle, logs, weekLogs } = currentWeekContext(data, date);
  const scheduledDayKey = dayKeyForDate(date);
  const todayLogs = logs.filter((log) => log.date === date);
  const activeLog = todayLogs.find((log) => log.status === "draft") ?? todayLogs.find((log) => log.status === "completed");
  const activeDayKey = activeLog?.dayKey ?? scheduledDayKey;
  const workout = getWorkoutByKey(activeDayKey);
  const weeklyWeightCount = data.bodyWeights.filter((entry) => getCycleInfo(startDate, entry.date).programWeek === cycle.programWeek).length;
  const weightLoggedToday = data.bodyWeights.some((entry) => entry.date === date);
  const weightSkippedToday = new Set(getGamificationSettings(data.settings).bodyWeightPromptSkips ?? []).has(date);
  const quests: DailyQuest[] = [];

  if (isTrainingDay(activeDayKey)) {
    const completed = activeLog?.status === "completed";
    quests.push({
      id: `complete-workout:${date}:${activeDayKey}`,
      title: `Complete ${workout.shortTitle}`,
      detail: activeLog?.isScheduleOverride ? "Schedule override counts once for today." : "Finish the scheduled routine without extra junk volume.",
      completed,
      progressCurrent: completed ? 1 : 0,
      progressTarget: 1,
      tone: "mission",
    });

    const quality = activeLog ? loggingQualityForWorkout(activeLog) : 0;
    quests.push({
      id: `clean-logging:${date}:${activeDayKey}`,
      title: "Log all working sets cleanly",
      detail: "Weight/assistance, reps or seconds, and RIR where the movement uses it.",
      completed: quality >= 90,
      progressCurrent: Math.min(90, quality),
      progressTarget: 90,
      tone: "quality",
    });

    const rirStats = safeRirSetStats(activeLog ? [activeLog] : []);
    const hasCardio = !!workout.cardio?.length;
    quests.push(hasCardio ? {
      id: `easy-cardio:${date}:${activeDayKey}`,
      title: "Keep cardio easy",
      detail: "Conversational pace only. No HIIT, no hard intervals.",
      completed: !!activeLog?.exerciseLogs.some((log) => log.cardio?.completed && !HARD_CARDIO_RE.test(log.cardio?.intensityNotes ?? "")),
      progressCurrent: activeLog?.exerciseLogs.some((log) => log.cardio?.completed) ? 1 : 0,
      progressTarget: 1,
      tone: "recovery",
    } : {
      id: `rir-discipline:${date}:${activeDayKey}`,
      title: "Stay inside target RIR on compounds",
      detail: "Hard sets count; sloppy failure does not.",
      completed: rirStats.valid > 0 && safePercent(rirStats.targetMatched, rirStats.valid) >= 80,
      progressCurrent: rirStats.valid ? safePercent(rirStats.targetMatched, rirStats.valid) : 0,
      progressTarget: 80,
      tone: "quality",
    });
  } else {
    const restComplete = !!activeLog?.restDay?.completed;
    quests.push({
      id: `rest-checkin:${date}`,
      title: "Complete recovery check-in",
      detail: "Rest counts. The plan grows from recovery, not extra lifting.",
      completed: restComplete,
      progressCurrent: restComplete ? 1 : 0,
      progressTarget: 1,
      tone: "recovery",
    });
  }

  if (weeklyWeightCount < 2 && !weightLoggedToday && !weightSkippedToday) {
    quests.push({
      id: `bodyweight:${date}`,
      title: "Log bodyweight if useful",
      detail: "Goal is 2-4 logs per week, not daily pressure.",
      completed: false,
      progressCurrent: weeklyWeightCount,
      progressTarget: 2,
      tone: "progress",
    });
  }

  const currentWeekCompleted = weekLogs.filter((log) => log.status === "completed" && isTrainingDay(log.dayKey)).length;
  if (!quests.some((quest) => quest.tone === "progress") && currentWeekCompleted >= 1) {
    quests.push({
      id: `plus-one-rep:${date}`,
      title: "Find one clean rep PR target",
      detail: "Beat a prior session by one clean rep before adding load.",
      completed: detectPRs({ ...data, workoutLogs: weekLogs }).some((pr) => pr.date === date && (pr.metric === "total-reps" || pr.metric === "reps-at-weight" || pr.metric === "best-set")),
      progressCurrent: detectPRs({ ...data, workoutLogs: weekLogs }).some((pr) => pr.date === date) ? 1 : 0,
      progressTarget: 1,
      tone: "progress",
    });
  }

  return quests.slice(0, 3);
}

export function buildWeeklyChallenge(data: AppData, date = todayISO()): WeeklyChallenge {
  const { cycle, weekLogs } = currentWeekContext(data, date);
  const completedTraining = weekLogs.filter((log) => log.status === "completed" && isTrainingDay(log.dayKey));
  const avgLogging = completedTraining.length
    ? Math.round(completedTraining.reduce((sum, log) => sum + loggingQualityForWorkout(log), 0) / completedTraining.length)
    : 0;
  const lowerComplete = scheduledWorkoutComplete(weekLogs, "tuesday", cycle.programWeek);
  const vTarget = plannedSetTargetForMuscles(["lats", "side-delts"]);
  const vDone = completedSetCountForMuscles(weekLogs, ["lats", "side-delts"]);
  const restViolations = weekLogs.filter((log) => !isTrainingDay(log.dayKey) && completedSetCount(log) > 0).length;
  const rirStats = safeRirSetStats(weekLogs);

  if (!lowerComplete && completedTraining.length > 0) {
    return {
      id: `lower-comeback:${cycle.programWeek}`,
      title: "Lower Body Comeback",
      detail: "Complete Lower + Abs so the week does not become all upper-body momentum.",
      completed: false,
      progressCurrent: 0,
      progressTarget: 1,
      nextStep: "Hit Tuesday Lower + Abs cleanly when you can.",
    };
  }
  if (avgLogging > 0 && avgLogging < 90) {
    return {
      id: `clean-logging:${cycle.programWeek}`,
      title: "Clean Logging Week",
      detail: "Reach 90%+ set logging quality across completed workouts.",
      completed: avgLogging >= 90,
      progressCurrent: avgLogging,
      progressTarget: 90,
      nextStep: "Fill missing reps, load/assistance, seconds, and RIR where needed.",
    };
  }
  if (vDone < vTarget * 0.7) {
    return {
      id: `v-taper:${cycle.programWeek}`,
      title: "V-Taper Week",
      detail: "Complete programmed lat and side-delt work. No extra volume needed.",
      completed: vDone >= vTarget,
      progressCurrent: vDone,
      progressTarget: vTarget,
      nextStep: "Let scheduled pull-ups, rows, and laterals do the work.",
    };
  }
  if (restViolations > 0 || rirStats.riskyTooLow > 0) {
    return {
      id: `no-ego:${cycle.programWeek}`,
      title: "No Ego Week",
      detail: "Keep higher-risk movements hard but clean. Rest days stay rest days.",
      completed: restViolations === 0 && rirStats.riskyTooLow === 0,
      progressCurrent: Math.max(0, 2 - restViolations - rirStats.riskyTooLow),
      progressTarget: 2,
      nextStep: "Hold form standards before chasing load or failure.",
    };
  }
  return {
    id: `perfect-week:${cycle.programWeek}`,
    title: "Perfect Week",
    detail: "Finish every scheduled workout for the program week.",
    completed: completedTraining.length >= trainingDayKeys.length,
    progressCurrent: completedTraining.length,
    progressTarget: trainingDayKeys.length,
    nextStep: completedTraining.length >= trainingDayKeys.length ? "Week complete. Keep recovery clean." : "Complete the next scheduled workout.",
  };
}

export function buildPlayerStatus(data: AppData, summary: Pick<GamificationSummary, "level" | "executionScore" | "streaks" | "achievements" | "prs">): PlayerStatus {
  const { cycle, weekLogs } = currentWeekContext(data);
  const challenge = buildWeeklyChallenge(data);
  const completedTraining = weekLogs.filter((log) => log.status === "completed" && isTrainingDay(log.dayKey));
  const avgLogging = completedTraining.length
    ? Math.round(completedTraining.reduce((sum, log) => sum + loggingQualityForWorkout(log), 0) / completedTraining.length)
    : 0;
  const vDone = completedSetCountForMuscles(weekLogs, ["lats", "side-delts"]);
  const lowerComplete = scheduledWorkoutComplete(weekLogs, "tuesday", cycle.programWeek);
  const archetype: PlayerArchetype =
    !lowerComplete && completedTraining.length > 0 ? "Lower Body Comeback" :
    vDone >= 12 ? "V-Taper Builder" :
    challenge.title === "No Ego Week" ? "Recovery Discipline" :
    avgLogging >= 90 ? "Clean Logger" :
    summary.streaks.dailyCheckIn.current >= 5 ? "Consistency Streak" :
    completedSetCountForMuscles(weekLogs, ["chest", "upper-chest", "triceps"]) >= 8 ? "Upper Body Push" :
    "Back Width Focus";
  const nextBadge = summary.achievements
    .filter((badge) => !badge.unlocked)
    .sort((a, b) => (b.progressCurrent / Math.max(1, b.progressTarget)) - (a.progressCurrent / Math.max(1, a.progressTarget)))[0];
  const today = todayISO();
  const todayLog = canonicalWorkoutLogs(data.workoutLogs).find((log) => log.date === today);
  const momentumStatus = todayLog?.status === "completed"
    ? "Workout logged today"
    : todayLog?.status === "draft"
      ? "Draft waiting"
      : summary.streaks.dailyCheckIn.current >= 3
        ? "Streak building"
        : "Ready to start";
  return {
    archetype,
    momentumStatus,
    cycleLabel: `Cycle ${cycle.cycle} · Week ${cycle.weekInCycle} of 8`,
    nextUnlock: nextBadge ? `${nextBadge.title}: ${achievementProgressPreview(nextBadge).label}` : `Level ${summary.level.level + 1}: ${summary.level.xpToNext} XP away`,
    weeklyProgress: `${completedTraining.length}/${trainingDayKeys.length} workouts this week`,
    reasons: [
      `${summary.executionScore.overall}/100 Lock-In Score`,
      `${avgLogging || summary.executionScore.logging}% logging quality`,
      `${summary.prs.filter((pr) => pr.date >= addDays(today, -6)).length} PR signals this week`,
    ],
  };
}

export function calculateGamification(data: AppData): GamificationSummary {
  const settings = getGamificationSettings(data.settings);
  const xpEvents = buildXPEvents(data);
  const totalXP = xpEvents.reduce((sum, event) => sum + event.xp, 0);
  const prs = detectPRs(data);
  const achievements = unlockAchievements(data, settings);
  const level = calculateLevelFromXP(totalXP);
  const streaks = calculateStreaks(data);
  const executionScore = calculateExecutionScore(data);
  const summarySeed = { level, executionScore, streaks, achievements, prs };
  return {
    settings,
    xpEvents,
    totalXP,
    level,
    prs,
    streaks,
    executionScore,
    activities: generateDailyActivity(data),
    achievements,
    recentBadges: achievements.filter((badge) => badge.unlocked).sort((a, b) => (b.unlockedAt ?? "").localeCompare(a.unlockedAt ?? "")).slice(0, 4),
    recentPRs: [...prs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5),
    playerStatus: buildPlayerStatus(data, summarySeed),
    dailyQuests: buildDailyQuests(data),
    weeklyChallenge: buildWeeklyChallenge(data),
    achievementPreviews: achievements.filter((badge) => !badge.unlocked).map(achievementProgressPreview).sort((a, b) => b.progressPercent - a.progressPercent).slice(0, 4),
  };
}

export function buildTodayMission(data: AppData, hasSyncIssue = false): TodayMission {
  const today = todayISO();
  const scheduledDayKey = dayKeyForDate(today);
  const startDate = effectiveProgramStartDate(data.settings, data.workoutLogs, today);
  const cycle = getCycleInfo(startDate, today);
  const todayLogs = data.workoutLogs.filter((log) => log.date === today);
  const draft = todayLogs.find((log) => log.status === "draft");
  const completed = todayLogs.find((log) => log.status === "completed");
  const activeDayKey = draft?.dayKey ?? completed?.dayKey ?? scheduledDayKey;
  const workout = workoutDays[activeDayKey];
  const gamification = calculateGamification(data);
  const weeklyWeights = data.bodyWeights.filter((entry) => getCycleInfo(startDate, entry.date).programWeek === cycle.programWeek).length;
  const weightLoggedToday = data.bodyWeights.some((entry) => entry.date === today);
  const weightSkippedToday = new Set(gamification.settings.bodyWeightPromptSkips ?? []).has(today);
  const nearLevel = gamification.level.xpToNext <= 100;
  const focusCue = nextFocusCue(data, today, activeDayKey);
  const overrideText = (draft ?? completed)?.isScheduleOverride
    ? ` · Schedule override: ${workout.shortTitle} instead of ${workoutDays[(draft ?? completed)!.scheduledDayKey ?? scheduledDayKey].shortTitle}`
    : "";
  const base = {
    title: isTrainingDay(activeDayKey) ? workout.shortTitle : "Recovery Day",
    subtitle: `Program Week ${cycle.programWeek} · Cycle ${cycle.cycle}, Week ${cycle.weekInCycle} of 8${overrideText}`,
    availableXP: isTrainingDay(activeDayKey) ? (workout.cardio ? 185 : 170) : 40,
    focusCue,
  };
  if (hasSyncIssue) return { ...base, nextBestAction: "Sync data so today starts clean.", action: "sync" };
  if (draft) return { ...base, nextBestAction: "Continue Workout", action: "continue-workout", workoutId: draft.id };
  if (completed && !gamification.settings.seenRecaps.includes(completed.id)) {
    return { ...base, nextBestAction: "Review Recap", action: "review-recap", workoutId: completed.id };
  }
  if (isTrainingDay(scheduledDayKey) && !completed) return { ...base, nextBestAction: "Start Workout", action: "start-workout" };
  if (!isTrainingDay(scheduledDayKey) && !completed?.restDay?.completed) return { ...base, nextBestAction: "Complete rest-day check-in.", action: "rest-checkin", workoutId: completed?.id };
  if (weeklyWeights < 2 && !weightLoggedToday && !weightSkippedToday) return { ...base, nextBestAction: "Log Body Weight", action: "log-weight" };
  if (nearLevel) return { ...base, nextBestAction: `You are ${gamification.level.xpToNext} XP from Level ${gamification.level.level + 1}.`, action: "progress" };
  return { ...base, nextBestAction: "Review progress.", action: "progress", workoutId: completed?.id };
}

function nextFocusCue(data: AppData, date: string, overrideDayKey?: DayKey): string {
  const dayKey = overrideDayKey ?? dayKeyForDate(date);
  if (!isTrainingDay(dayKey)) return "Recovery check-in keeps the daily streak alive without extra lifting.";
  const workout = workoutDays[dayKey];
  const firstExercise = workout.exercises[0];
  const prior = canonicalWorkoutLogs(data.workoutLogs)
    .filter((log) => log.date < date && log.status === "completed")
    .flatMap((log) => log.exerciseLogs.map((exerciseLog) => ({ log, exerciseLog, exercise: findExercise(exerciseLog.exerciseId) })))
    .filter((item) => exerciseMatches(item.exercise, firstExercise))
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
    quests: buildDailyQuests(data, log.date),
    weeklyChallenge: buildWeeklyChallenge(data, log.date),
    baselines: baselineRecordsForWorkout(log, data),
    lockInReasons: buildPlayerStatus(data, summary).reasons,
  };
}
