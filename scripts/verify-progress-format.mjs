import assert from "node:assert/strict";
import { workoutDays } from "../dist/src/data/routine.js";
import {
  exerciseSessions,
  previousExercisePerformance,
  previousSetSummary,
} from "../dist/src/lib/progress.js";

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
assert.equal(previousExercisePerformance(matchingLogs, "2026-06-09", "DB Lateral Raise Mechanical Set")?.exercise?.name, "DB Lateral Raise Mechanical Set");
assert.notEqual(
  previousExercisePerformance(matchingLogs, "2026-06-09", "DB Lateral Raise")?.exercise?.name,
  "DB Lateral Raise Mechanical Set",
  "Strict matching must not pair normal laterals with mechanical sets.",
);
assert.equal(previousExercisePerformance(matchingLogs, "2026-06-09", "DB Squeeze Press"), undefined, "Push-up should not match DB squeeze press.");
assert.equal(previousExercisePerformance(matchingLogs, "2026-06-09", "Assisted Pull-Up")?.exercise?.name, undefined, "Heavy pull-up should not match technique/pump pull-up.");
assert.equal(previousExercisePerformance(matchingLogs, "2026-06-09", "One-Arm DB Row"), undefined, "One-arm rows should not match chest-supported rows.");
assert.equal(previousExercisePerformance(matchingLogs, "2026-06-09", "RDL")?.exercise?.name, "DB Romanian Deadlift", "Configured RDL alias should match.");
assert.equal(previousExercisePerformance(matchingLogs, "2026-06-09", "DB Skullcrusher")?.exercise?.name, "Lying DB Triceps Extension", "Configured skullcrusher alias should match.");

console.log("Progress formatting regression checks passed.");
