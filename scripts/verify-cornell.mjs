import assert from 'node:assert/strict';
import { cornellDays, CORNELL_ID, CORNELL_START, cornellWeek, isTrainingLog, workoutForLog, weekForLog } from '../dist/src/data/cornell.js';
import { workoutDays } from '../dist/src/data/routine.js';
import { createWorkoutLog, findExercise, previousExercisePerformance, previousSetSummary, prefillWorkoutLogFromHistory, nextSessionRecommendation, workoutVolume, targetRIRForExercise } from '../dist/src/lib/progress.js';
import { buildXPEvents, buildDailyQuests, buildWeeklyChallenge, detectPRs, loggingQualityForWorkout, calculateGamification } from '../dist/src/lib/gamification.js';
import { buildWorkoutCoachSummary } from '../dist/src/lib/coach.js';
import { warmupCompletionSummary } from '../dist/src/data/warmups.js';
import { shortOnTimeGuidance } from '../dist/src/lib/readiness.js';

const settings = { startDate: '2026-05-25' };
const legacy = createWorkoutLog('2026-08-10', settings);
const before = JSON.stringify(legacy);
assert.equal(legacy.programId, undefined);
assert.equal(workoutForLog(legacy), workoutDays.monday);
const first = createWorkoutLog(CORNELL_START, settings);
assert.equal(first.programId, CORNELL_ID);
assert.equal(weekForLog(first), 1);
assert.equal(isTrainingLog(first), true);
assert.ok(first.exerciseLogs.every((entry) => entry.sets.length <= 2));
assert.equal(cornellWeek('2026-10-23'), 2);
assert.equal(cornellWeek('2026-12-04'), 8);
assert.equal(cornellWeek('2026-12-11'), 1);
const deload = createWorkoutLog('2026-12-04', settings);
assert.equal(deload.exerciseLogs[0].sets.length, 2);
assert.equal(targetRIRForExercise(findExercise(deload.exerciseLogs[0].exerciseId), weekForLog(deload)), '3-4');
assert.equal(nextSessionRecommendation([], deload.date, findExercise(deload.exerciseLogs[0].exerciseId)).kind, 'hold');

for (const day of ['tuesday', 'wednesday', 'friday', 'saturday']) {
  const plan = cornellDays[day];
  assert.ok(plan.exercises.length >= 5 && plan.exercises.length <= 7);
  for (const exercise of plan.exercises) {
    assert.ok(findExercise(exercise.id));
    assert.ok(exercise.muscleGroups.length);
    assert.ok(exercise.targetRIRByPhase);
  }
  const cuts = shortOnTimeGuidance(day, CORNELL_ID);
  assert.equal(cuts.length, 3);
  assert.ok(cuts.every((cut) => plan.exercises.some((exercise) => exercise.id === cut.exerciseId)));
  assert.ok(cuts.every((cut) => !plan.exercises.slice(0, 2).some((exercise) => exercise.id === cut.exerciseId)));
}

function finish(log) {
  return { ...log, status: 'completed', exerciseLogs: log.exerciseLogs.map((entry) => ({ ...entry, completed: true,
    sets: entry.sets.map((set) => ({ ...set, weight: '30', reps: '10', leftReps: '10', rightReps: '10', rir: '3', completed: true })),
    ...(entry.cardio ? { cardio: { ...entry.cardio, duration: '20', completed: true } } : {}),
  })) };
}
const complete = finish(first);
const data = { settings, workoutLogs: [complete], bodyWeights: [] };
assert.equal(calculateGamification(data).achievements.find((badge) => badge.id === 'first-cycle').progressTarget, 32);
const partial = { ...complete, exerciseLogs: complete.exerciseLogs.map((entry, index) => index === 0 ? entry : { ...entry, skipped: true }) };
const partialData = { ...data, workoutLogs: [partial] };
assert.deepEqual(buildWorkoutCoachSummary(partial, partialData, calculateGamification(partialData)).bodyParts, ['quads', 'glutes']);
assert.equal(loggingQualityForWorkout(complete), 100);
assert.equal(buildXPEvents(data).filter((event) => event.workoutId === complete.id).reduce((sum, event) => sum + event.xp, 0), 170);
assert.equal(detectPRs(data).length, 0, 'First session is baseline only');
const withWarmup = { ...complete, warmupLog: { completedDrills: { 'cn-friday-walk': true }, notes: 'easy' } };
assert.equal(warmupCompletionSummary(withWarmup).completed, 1);
assert.equal(workoutVolume(withWarmup), workoutVolume(complete));
assert.equal(loggingQualityForWorkout(withWarmup), loggingQualityForWorkout(complete));

const sessions = ['2026-10-20', '2026-10-21', '2026-10-23', '2026-10-24'].map((date) => finish(createWorkoutLog(date, settings)));
const weekData = { settings, workoutLogs: sessions, bodyWeights: [] };
assert.equal(buildWeeklyChallenge(weekData, '2026-10-25').progressCurrent, 4);
assert.equal(buildWeeklyChallenge(weekData, '2026-10-25').completed, true);
const sunday = finish(createWorkoutLog('2026-10-25', settings));
const rotc = finish(createWorkoutLog('2026-10-26', settings));
assert.equal(isTrainingLog(sunday), false);
assert.equal(isTrainingLog(rotc), false);
assert.equal(sunday.restDay, undefined);
assert.equal(buildXPEvents({ ...weekData, workoutLogs: [...sessions, sunday, rotc] }).filter((event) => event.workoutId === sunday.id || event.workoutId === rotc.id).length, 0);
assert.match(buildDailyQuests({ ...weekData, workoutLogs: [...sessions, rotc] }, rotc.date)[0].title, /ROTC/);
assert.equal(buildWeeklyChallenge({ ...weekData, workoutLogs: [...sessions, sunday] }, '2026-10-25').progressCurrent, 4);
assert.equal(buildWeeklyChallenge({ ...weekData, workoutLogs: [...sessions.slice(0, 3), { ...sessions[2], id: 'duplicate' }] }, '2026-10-25').completed, false);

const oldPress = legacy.exerciseLogs.find((entry) => findExercise(entry.exerciseId)?.name === 'Low-Incline DB Press');
oldPress.sets.forEach((set) => Object.assign(set, { weight: '40', reps: '8', rir: '2', completed: true }));
oldPress.notes = 'Fixture setup note';
legacy.status = 'completed';
const preserved = JSON.stringify(legacy);
const saturday = createWorkoutLog('2026-10-17', settings);
const press = findExercise(saturday.exerciseLogs[0].exerciseId);
assert.equal(previousExercisePerformance([legacy], saturday.date, press).workout.id, legacy.id);
assert.match(previousSetSummary(oldPress, press), /40 lb x 8 reps/);
assert.ok(prefillWorkoutLogFromHistory(saturday, [legacy]).exerciseLogs[0].sets.every((set) => !set.weight));
const recent = finish(saturday);
recent.exerciseLogs[0].sets.forEach((set) => { set.weight = '35'; });
assert.equal(previousExercisePerformance([legacy, recent], '2026-10-24', press).workout.id, recent.id);
assert.match(previousSetSummary(previousExercisePerformance([legacy, recent], '2026-10-24', press).exerciseLog, press), /35 lb/);
assert.equal(previousExercisePerformance([legacy], saturday.date, findExercise('cn-chest-press')), undefined);
assert.equal(JSON.stringify(legacy), preserved, 'Derived calculations cannot mutate history');
assert.notEqual(before, preserved, 'Test fixture deliberately has completed values');
console.log('Cornell checks passed: legacy isolation, exact prior references, calibration/deload, optional PT/cardio, four-day completion, XP, cuts, warm-up exclusion.');
