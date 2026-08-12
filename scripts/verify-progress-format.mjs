import assert from "node:assert/strict";
import { workoutDays } from "../dist/src/data/routine.js";
import {
  completedSetCount,
  createWorkoutLog,
  epleyE1RM,
  exerciseSessions,
  nextSessionRecommendation,
  previousSessionNotes,
  previousExercisePerformance,
  previousSetSummary,
  setHasRecordedPerformance,
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
import { parseRestSeconds, REST_TIMER_ALARM_PATTERN, REST_TIMER_REPEAT_MS } from "../dist/src/components/RestTimer.js";
import {
  assessDeloadNeed,
  buildExerciseFlagPatterns,
  buildNextWorkoutBriefing,
  shortOnTimeGuidance,
} from "../dist/src/lib/readiness.js";

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

// A rest timer should begin as soon as performance is recorded, before load or
// RIR has to be entered. Unilateral work waits for both sides.
assert.equal(setHasRecordedPerformance(set({ reps: "8", weight: "", rir: "" }), byName("Low-Incline DB Press")), true);
assert.equal(setHasRecordedPerformance(set({ leftReps: "10" }), byName("One-Arm DB Row")), false);
assert.equal(setHasRecordedPerformance(set({ leftReps: "10", rightReps: "9" }), byName("One-Arm DB Row")), true);
assert.equal(setHasRecordedPerformance(set({ seconds: "30" }), byName("RKC Plank")), true);

const notesWorkout = logFor("2026-06-09", "Low-Incline DB Press", [set({ weight: "35", reps: "8", rir: "2", notes: "Smooth pause" })], {
  notes: "Shoulder felt good",
});
notesWorkout.exerciseLogs[0].notes = "Bench notch 3";
assert.deepEqual(
  previousSessionNotes(notesWorkout.exerciseLogs[0], notesWorkout),
  ["Bench notch 3", "Smooth pause", "Shoulder felt good"],
  "Previous-performance notes should preserve exercise, set, and session context without mutating logs.",
);

const pressSetsAtTop = (weight = "35") => Array.from({ length: 4 }, (_, index) => ({
  id: `press-top-${weight}-${index}`,
  setNumber: index + 1,
  target: "6-10",
  weight,
  reps: "10",
  rir: "2",
  completed: true,
}));
const pressSetsBuilding = Array.from({ length: 4 }, (_, index) => ({
  id: `press-build-${index}`,
  setNumber: index + 1,
  target: "6-10",
  weight: "35",
  reps: index === 0 ? "10" : "8",
  rir: "2",
  completed: true,
}));
const oneTopSession = [logFor("2026-06-01", "Low-Incline DB Press", pressSetsAtTop())];
assert.equal(
  nextSessionRecommendation(oneTopSession, "2026-06-08", byName("Low-Incline DB Press")).kind,
  "hold",
  "One top-range session is not enough evidence to add load.",
);
const repeatedTopSessions = [
  ...oneTopSession,
  logFor("2026-06-08", "Low-Incline DB Press", pressSetsAtTop()),
];
assert.equal(
  nextSessionRecommendation(repeatedTopSessions, "2026-06-15", byName("Low-Incline DB Press")).kind,
  "add-load",
  "Two confirmed top-range sessions at the same load and target RIR can support a conservative load increase.",
);
assert.equal(
  nextSessionRecommendation([logFor("2026-06-01", "Low-Incline DB Press", pressSetsBuilding)], "2026-06-08", byName("Low-Incline DB Press")).kind,
  "add-rep",
  "A valid session below the top range should suggest one clean rep, not extra sets or load.",
);
assert.equal(
  nextSessionRecommendation([
    logFor("2026-06-01", "Low-Incline DB Press", pressSetsAtTop().map(({ rir, ...setWithoutRir }) => setWithoutRir)),
  ], "2026-06-08", byName("Low-Incline DB Press")).kind,
  "insufficient",
  "A required target-RIR field must be present before the app gives progression advice.",
);

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

const skippedExerciseLog = {
  ...baseWarmupSafetyLog,
  exerciseLogs: baseWarmupSafetyLog.exerciseLogs.map((exerciseLog) => ({
    ...exerciseLog,
    skipped: true,
    skippedAt: "2026-06-10T12:30:00.000Z",
  })),
};
assert.equal(workoutVolume(skippedExerciseLog), 0, "Skipped exercise data must not count toward working-set volume.");
assert.equal(completedSetCount(skippedExerciseLog), 0, "Skipped exercise data must not count as completed sets.");
assert.equal(loggingQualityForWorkout(skippedExerciseLog), 0, "Skipped planned work must remain incomplete rather than being fabricated as a clean log.");
assert.equal(exerciseSessions([skippedExerciseLog], "Low-Incline DB Press").length, 0, "Skipped exercises must not become comparison or PR baselines.");

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

// The completion sound must be louder than the old chime and repeat at a sane
// cadence until the user dismisses the alarm dialog.
assert.ok(REST_TIMER_ALARM_PATTERN.length >= 4, "Rest completion uses a distinct alarm-style pulse pattern.");
assert.ok(Math.max(...REST_TIMER_ALARM_PATTERN.map((pulse) => pulse.gain)) >= 0.15, "Rest completion is clearly audible at a normal device volume.");
assert.ok(REST_TIMER_ALARM_PATTERN.reduce((sum, pulse) => sum + pulse.duration, 0) <= 1.5, "Each alarm cycle stays brief enough to avoid overlapping the next cycle.");
assert.ok(REST_TIMER_REPEAT_MS >= 1500 && REST_TIMER_REPEAT_MS <= 3000, "Alarm repeats until dismissal without overlapping or waiting too long.");

// Every training day has three ordered, plan-specific cut options. The choices
// must point to real items from that day and must not displace the priority
// pull-up/rear-delt work on the Saturday specialization day.
const trainingDays = ["monday", "tuesday", "wednesday", "friday", "saturday"];
for (const dayKey of trainingDays) {
  const cuts = shortOnTimeGuidance(dayKey);
  assert.equal(cuts.length, 3, `${dayKey} should offer three ranked cuts.`);
  assert.deepEqual(cuts.map((option) => option.rank), [1, 2, 3], `${dayKey} cut ranks must be stable.`);
  assert.equal(new Set(cuts.map((option) => option.exerciseId)).size, 3, `${dayKey} cut exercises must be unique.`);
  const plannedIds = new Set([
    ...workoutDays[dayKey].exercises.map((exercise) => exercise.id),
    ...(workoutDays[dayKey].cardio ?? []).map((cardio) => cardio.id),
  ]);
  assert.ok(cuts.every((option) => plannedIds.has(option.exerciseId)), `${dayKey} cuts must belong to that workout.`);
}
const saturdayCuts = shortOnTimeGuidance("saturday");
assert.equal(saturdayCuts[0].exerciseId, "saturday-feet-elevated-push-up-or-db-squeeze-press");
assert.ok(saturdayCuts.every((option) => !/pull-up|rear-delt-row/i.test(option.exerciseId)));
assert.equal(shortOnTimeGuidance("monday")[0]?.exerciseId, "monday-low-incline-db-squeeze-press");
assert.equal(shortOnTimeGuidance("tuesday")[0]?.exerciseId, "tuesday-incline-treadmill-walk");

const freshShortWorkout = createWorkoutLog("2026-06-22", { startDate: "2026-06-01", status: "active" }, "monday");
assert.ok(freshShortWorkout.exerciseLogs.every((entry) => !entry.skipped), "Every planned exercise starts selected.");

const flaggedPressLogs = [
  logFor("2026-06-01", "Low-Incline DB Press", pressSetsAtTop("35")),
  logFor("2026-06-08", "Low-Incline DB Press", pressSetsAtTop("35").map((item) => ({ ...item, reps: "9" }))),
  logFor("2026-06-15", "Low-Incline DB Press", pressSetsAtTop("35").map((item) => ({ ...item, reps: "8" }))),
];
flaggedPressLogs[1].exerciseLogs[0].flags = [{
  id: "flag-1",
  kind: "joint-discomfort",
  area: "shoulder",
  severity: "limit",
  note: "Stopped before it worsened.",
  createdAt: "2026-06-08T12:00:00.000Z",
}];
flaggedPressLogs[2].exerciseLogs[0].flags = [{
  id: "flag-2",
  kind: "joint-discomfort",
  area: "shoulder",
  severity: "limit",
  createdAt: "2026-06-15T12:00:00.000Z",
}];

const flagPatterns = buildExerciseFlagPatterns(flaggedPressLogs, "2026-06-22", "monday");
assert.equal(flagPatterns[0]?.exerciseId, byName("Low-Incline DB Press").id);
assert.equal(flagPatterns[0]?.kind, "joint-discomfort");
assert.equal(flagPatterns[0]?.sessionCount, 2);
assert.match(flagPatterns[0]?.summary ?? "", /shoulder/i);

const reassuringNoteOnly = logFor("2026-06-18", "Low-Incline DB Press", pressSetsAtTop("35"), { notes: "Shoulder felt good and stable." });
assert.deepEqual(
  buildExerciseFlagPatterns([reassuringNoteOnly], "2026-06-22", "monday"),
  [],
  "Neutral or reassuring notes must not be converted into pain/form flags.",
);

assert.equal(assessDeloadNeed(flaggedPressLogs.slice(0, 1), "2026-06-22").status, "insufficient");
assert.equal(
  assessDeloadNeed(flaggedPressLogs.map((workout) => ({ ...workout, exerciseLogs: workout.exerciseLogs.map(({ flags, ...entry }) => entry) })), "2026-06-22").status,
  "watch",
  "Two same-setup declines are a watch signal, not enough by themselves to prescribe a deload.",
);
const deloadAssessment = assessDeloadNeed(flaggedPressLogs, "2026-06-22");
assert.equal(deloadAssessment.status, "deload");
assert.ok(deloadAssessment.signals.some((signal) => signal.kind === "performance-drop"));
assert.ok(deloadAssessment.signals.some((signal) => signal.kind === "joint-discomfort"));
assert.match(deloadAssessment.recommendation, /half/i);
assert.match(deloadAssessment.recommendation, /RIR 3/i);

const emptyBriefing = buildNextWorkoutBriefing(
  { settings: { startDate: "2026-06-01" }, workoutLogs: [], bodyWeights: [] },
  "2026-06-22",
  "monday",
);
assert.equal(emptyBriefing.deload.status, "insufficient");
assert.match(emptyBriefing.tips[0]?.evidence ?? "", /No confirmed comparable evidence/i);
assert.equal(emptyBriefing.shortOnTime.length, 3);

const flagsDecoratedLog = {
  ...baseWarmupSafetyLog,
  exerciseLogs: baseWarmupSafetyLog.exerciseLogs.map((entry) => ({
    ...entry,
    flags: [{ id: "form-1", kind: "form-breakdown", severity: "notice", note: "Last rep lost position.", createdAt: "2026-06-10T12:00:00.000Z" }],
  })),
};
assert.equal(workoutVolume(flagsDecoratedLog), workoutVolume(baseWarmupSafetyLog), "Structured flags must not change volume.");
assert.equal(completedSetCount(flagsDecoratedLog), completedSetCount(baseWarmupSafetyLog), "Structured flags must not change completed-set counts.");
assert.equal(loggingQualityForWorkout(flagsDecoratedLog), loggingQualityForWorkout(baseWarmupSafetyLog), "Structured flags must not change logging quality.");

console.log("Progress formatting regression checks passed.");
