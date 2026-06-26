import assert from "node:assert/strict";
import { workoutDays } from "../dist/src/data/routine.js";
import { previousSetSummary } from "../dist/src/lib/progress.js";

const exercises = Object.values(workoutDays).flatMap((day) => day.exercises);
const byName = (name) => {
  const exercise = exercises.find((item) => item.name === name);
  assert.ok(exercise, `Missing exercise fixture: ${name}`);
  return exercise;
};

const summaryFor = (exerciseName, sets) =>
  previousSetSummary({ id: "exercise-log", exerciseId: "fixture", completed: true, sets }, byName(exerciseName));

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

console.log("Progress formatting regression checks passed.");
