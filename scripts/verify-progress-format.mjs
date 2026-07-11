import assert from "node:assert/strict";
import { workoutDays } from "../dist/src/data/routine.js";
import {
  completedSetCount,
  epleyE1RM,
  exerciseSessions,
  previousExercisePerformance,
  previousSetSummary,
  weeklySummaries,
  workoutVolume,
} from "../dist/src/lib/progress.js";
import {
  availableXPForDay,
  baselineRecordsForWorkout,
  buildXPEvents,
  detectPRs,
  loggingQualityForWorkout,
  unlockAchievements,
} from "../dist/src/lib/gamification.js";
import { todayISO, toISODate } from "../dist/src/lib/date.js";
import { parseRestSeconds } from "../dist/src/components/RestTimer.js";

const exercises = Object.values(workoutDays).flatMap((day) => day.exercises);
const byName = (name) => {
  const exercise = exercises.find((item) => item.name === name);
  assert.ok(exercise, `Missing exercise fixture: ${name}`);
  return exercise;
};

const summaryFor = (exerciseName, sets) =>
  previousSetSummary({ id: "exercise-log", exerciseId: "fixture", completed: true, sets }, byName(exerciseName));

const logFor = (date, exerciseName, sets, overrides = {}) => {
  const exercise = byName(exerciseName);
  return {
    id: `log-${date}-${exercise.id}`,
    date,
    week: 1,
    cycle: 1,
    weekInCycle: 1,
    dayKey: "monday",
    workoutTitle: "Fixture",
    status: "completed",
    startedAt: `${date}T00:00:00.000Z`,
    updatedAt: `${date}T00:00:00.000Z`,
    exerciseLogs: [{
      id: `entry-${exercise.id}`,
      exerciseId: exercise.id,
      completed: true,
      sets,
    }],
    ...overrides,
  };
};

const set = (patch) => ({
  id: `set-${Math.random().toString(36).slice(2)}`,
  setNumber: 1,
  target: "8-12",
  completed: true,
  ...patch,
});

const weighted = summaryFor("Low-Incline DB Press", [
  { id: "s1", setNumber: 1, target: "6-10", weight: "35", reps: "8", rir: "2", completed: true },
  { id: "s2", setNumber: 2, target: "6-10", weight: "35", reps: "7", rir: "2", completed: true },
]);
assert.match(weighted, /35 lb/);
assert.match(weighted, /8 reps/);
assert.match(weighted, /7 reps/);

const assisted = summaryFor("Assisted Pull-Up", [
  { id: "s1", setNumber: 1, target: "6-10", weight: "70", reps: "8", rir: "2", completed: true },
]);
assert.match(assisted, /70 lb assistance/);
assert.match(assisted, /8 reps/);

const legacyUnilateral = summaryFor("DB Bulgarian Split Squat", [
  { id: "s1", setNumber: 1, target: "8-12/leg", weight: "25", reps: "10", rir: "2", completed: true },
]);
assert.doesNotMatch(legacyUnilateral, /-\/-/);
assert.match(legacyUnilateral, /10 reps\/side/);

const modernUnilateral = summaryFor("One-Arm DB Row", [
  { id: "s1", setNumber: 1, target: "8-12/side", weight: "50", leftReps: "11", rightReps: "10", rir: "2", completed: true },
]);
assert.match(modernUnilateral, /L 11 \/ R 10 reps/);

const bodyweight = summaryFor("Reverse Crunch", [
  { id: "s1", setNumber: 1, target: "10-15", reps: "15", completed: true },
]);
assert.doesNotMatch(bodyweight, /lb|weight/i);
assert.match(bodyweight, /15 reps/);

const timed = summaryFor("RKC Plank", [
  { id: "s1", setNumber: 1, target: "20-40 sec", seconds: "35", completed: true },
]);
assert.doesNotMatch(timed, /reps/);
assert.match(timed, /35 sec/);

const cardioSummary = previousSetSummary({
  id: "cardio-log",
  exerciseId: "tuesday-incline-treadmill-walk",
  completed: true,
  sets: [],
  cardio: { duration: "15", incline: "8", speed: "3.0", intensityNotes: "Easy", completed: true },
});
assert.match(cardioSummary, /15 min/);
assert.match(cardioSummary, /incline 8/);
assert.match(cardioSummary, /3.0 mph/);

const matchingLogs = [
  logFor("2026-06-01", "DB Lateral Raise", [set({ weight: "15", reps: "18" })]),
  logFor("2026-06-02", "DB Lateral Raise Mechanical Set", [set({ weight: "15", reps: "18" })], { dayKey: "saturday" }),
  logFor("2026-06-03", "Feet-Elevated Push-Up", [set({ reps: "15", rir: "2" })], { dayKey: "saturday" }),
  logFor("2026-06-04", "Assisted Pull-Up Technique/Pump", [set({ weight: "90", reps: "12" })], { dayKey: "saturday" }),
  logFor("2026-06-05", "Chest-Supported Incline DB Row", [set({ weight: "40", reps: "12" })]),
  logFor("2026-06-06", "DB Romanian Deadlift", [set({ weight: "45", reps: "10" })], { dayKey: "tuesday" }),
  logFor("2026-06-07", "Lying DB Triceps Extension", [set({ weight: "20", reps: "12" })], { dayKey: "friday" }),
  logFor("2026-06-08", "DB Lateral Raise", [set({ weight: "15", reps: "20" })], { dayKey: "wednesday" }),
];

assert.equal(exerciseSessions(matchingLogs, "DB Lateral Raise").length, 2, "Exact same exercise name should match across days.");
assert.equal(previousExercisePerformance(matchingLogs, "2026-06-09", "DB Lateral Raise")?.exercise?.name, "DB Lateral Raise");
assert.equal(previousExercisePerformance(matchingLogs, "2026-06-09", byName("DB Lateral Raise"))?.exercise?.name, "DB Lateral Raise");
assert.equal(previousExercisePerformance(matchingLogs, "2026-06-09", "DB Lateral Raise Mechanical Set")?.exercise?.name, "DB Lateral Raise Mechanical Set");
assert.notEqual(
  previousExercisePerformance(matchingLogs, "2026-06-09", "DB Lateral Raise")?.exercise?.name,
  "DB Lateral Raise Mechanical Set",
  "Strict matching must not pair normal laterals with mechanical sets.",
);
assert.equal(previousExercisePerformance(matchingLogs, "2026-06-09", "DB Squeeze Press"), undefined, "Push-up should not match DB squeeze press.");
assert.equal(previousExercisePerformance(matchingLogs, "2026-06-09", "Assisted Pull-Up")?.exercise?.name, undefined, "Heavy pull-up should not match technique/pump pull-up.");
assert.equal(previousExercisePerformance(matchingLogs, "2026-06-09", byName("Assisted Pull-Up"))?.exercise?.name, undefined, "Object-based heavy pull-up lookup should not match technique/pump pull-up.");
assert.equal(previousExercisePerformance(matchingLogs, "2026-06-09", "One-Arm DB Row"), undefined, "One-arm rows should not match chest-supported rows.");
assert.equal(previousExercisePerformance(matchingLogs, "2026-06-09", "RDL")?.exercise?.name, "DB Romanian Deadlift", "Configured RDL alias should match.");
assert.equal(previousExercisePerformance(matchingLogs, "2026-06-09", "DB Skullcrusher")?.exercise?.name, "Lying DB Triceps Extension", "Configured skullcrusher alias should match.");

const baseWarmupSafetyLog = logFor("2026-06-10", "Low-Incline DB Press", [
  { id: "s1", setNumber: 1, target: "6-10", weight: "35", reps: "8", rir: "2", completed: true },
  { id: "s2", setNumber: 2, target: "6-10", weight: "35", reps: "8", rir: "2", completed: true },
]);
const warmupDecoratedLog = {
  ...baseWarmupSafetyLog,
  warmupLog: {
    completedDrills: {
      "monday-easy-treadmill-walk": true,
      "monday-low-incline-press-ramp-up": true,
    },
    notes: "Used 15 lb ramp-up DBs for easy reps.",
    updatedAt: "2026-06-10T12:00:00.000Z",
  },
};
assert.equal(workoutVolume(warmupDecoratedLog), workoutVolume(baseWarmupSafetyLog), "Warm-up metadata must not affect working-set volume.");
assert.equal(completedSetCount(warmupDecoratedLog), completedSetCount(baseWarmupSafetyLog), "Warm-up metadata must not affect completed working-set count.");
assert.equal(loggingQualityForWorkout(warmupDecoratedLog), loggingQualityForWorkout(baseWarmupSafetyLog), "Warm-up metadata must not affect logging quality.");
assert.equal(previousExercisePerformance([warmupDecoratedLog], "2026-06-11", "Easy Treadmill Walk"), undefined, "Warm-up drills must not become previous exercise sessions.");
assert.deepEqual(detectPRs({ settings: { startDate: "2026-06-01" }, workoutLogs: [warmupDecoratedLog], bodyWeights: [] }), [], "Warm-up metadata must not create PR records.");

const partialWorkout = logFor("2026-06-11", "Low-Incline DB Press", [
  { id: "partial", setNumber: 1, target: "6-10", completed: false },
]);
assert.equal(
  previousExercisePerformance([baseWarmupSafetyLog, partialWorkout], "2026-06-12", "Low-Incline DB Press")?.workout.id,
  baseWarmupSafetyLog.id,
  "An empty completed exercise row must not hide the last confirmed performance.",
);
assert.deepEqual(
  baselineRecordsForWorkout(partialWorkout, { settings: { startDate: "2026-06-01" }, workoutLogs: [partialWorkout], bodyWeights: [] }),
  [],
  "A planned exercise without a valid completed set must not establish a baseline.",
);

// --- Gamification engine invariants ---

// Streak XP must track the consecutive run, resetting after gaps.
const streakData = {
  settings: { startDate: "2026-06-01", status: "active" },
  workoutLogs: [],
  bodyWeights: ["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-07", "2026-06-08"].map((date, index) => ({
    id: `bw-${index}`,
    date,
    weight: 142,
    updatedAt: `${date}T09:00:00.000Z`,
  })),
};
const streakEvents = buildXPEvents(streakData).filter((event) => event.kind === "streak");
assert.equal(streakEvents.length, 3, "Streak XP fires only on consecutive action days (days 2, 3, and the second day of the new run).");
assert.equal(streakEvents.find((event) => event.date === "2026-06-08")?.xp, 7, "Streak XP must reset to the start of the curve after a gap.");
assert.ok(buildXPEvents(streakData).some((event) => event.kind === "comeback" && event.date === "2026-06-07"), "Returning after a gap earns the comeback bonus.");

// Quests and weekly challenges remain display-only; available XP reflects only
// the established deterministic workout/rest event formula.
assert.equal(availableXPForDay("monday"), 170 + (workoutDays.monday.cardio?.length ? 15 : 0));
assert.equal(availableXPForDay("sunday"), 40, "Rest day: check-in 25 + allowed easy walk 15.");
assert.equal(buildXPEvents(streakData).some((event) => event.kind === "quest" || event.kind === "challenge"), false);

// Epley e1RM.
assert.ok(Math.abs(epleyE1RM(100, 10) - 133.3333) < 0.001);
assert.equal(epleyE1RM(100, 1), 100);
assert.equal(epleyE1RM(0, 10), 0);

// Persisted badge unlocks are authoritative — no re-locking when metrics disagree.
const emptyData = { settings: { startDate: todayISO(), status: "active" }, workoutLogs: [], bodyWeights: [] };
const memory = { badgeUnlocks: { "ten-workouts": "2026-01-01" }, seenRecaps: [], bodyWeightPromptSkips: [] };
const badges = unlockAchievements(emptyData, memory);
const persisted = badges.find((badge) => badge.id === "ten-workouts");
assert.ok(persisted?.unlocked, "Badge with a persisted unlock must stay unlocked.");
assert.equal(persisted?.progressCurrent, persisted?.progressTarget);
assert.equal(badges.length, 19, "15 original + 4 new badge definitions.");

// weeklySummaries no longer pads new programs out to 8 empty weeks.
assert.equal(weeklySummaries([], { startDate: todayISO(), status: "active" }).length, 1);

// Local calendar dates must not shift when converted through UTC.
assert.equal(toISODate(new Date(2026, 0, 1, 23, 30)), "2026-01-01");

// Rest prescriptions start a timer at the conservative upper bound.
assert.equal(parseRestSeconds("2-3 min"), 180);
assert.equal(parseRestSeconds("60-90 sec after 4B"), 90);
assert.equal(parseRestSeconds("As needed"), 0);

console.log("Progress formatting regression checks passed.");
