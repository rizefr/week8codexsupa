import assert from 'node:assert/strict';
import { cornellDays, cornellDaysV1, CORNELL_ID, CORNELL_START, cornellWeek, exercisesForDate, isTrainingLog, prescriptionWeekForDate, workoutForLog, weekForLog } from '../dist/src/data/cornell.js';
import { workoutDays } from '../dist/src/data/routine.js';
import { createWorkoutLog, createSetLogs, findExercise, isCreditedWorkout, setCompletionForLog, previousExercisePerformance, previousSetSummary, prefillWorkoutLogFromHistory, nextSessionRecommendation, workoutVolume, targetRIRForExercise } from '../dist/src/lib/progress.js';
import { buildXPEvents, buildDailyQuests, buildWeeklyChallenge, detectPRs, loggingQualityForWorkout, calculateGamification } from '../dist/src/lib/gamification.js';
import { buildWorkoutCoachSummary } from '../dist/src/lib/coach.js';
import { warmupCompletionSummary } from '../dist/src/data/warmups.js';
import { shortOnTimeGuidance } from '../dist/src/lib/readiness.js';
import { plannedMuscleVolume, summarizeMuscleRange, muscleTargets } from '../dist/src/lib/muscles.js';
import { bodyTrend } from '../dist/src/lib/body.js';
import { headlinePRs } from '../dist/src/lib/gamification.js';

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
  assert.ok(plan.exercises.length >= 5 && plan.exercises.length <= 8);
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
const optionalEvents = buildXPEvents({ ...weekData, workoutLogs: [...sessions, sunday, rotc] }).filter((event) => event.workoutId === sunday.id || event.workoutId === rotc.id);
assert.deepEqual(optionalEvents.map((event) => [event.key.split(':')[0], event.xp]), [['optional-session', 40]], 'Only a logged optional strength session earns a small XP award; ROTC earns none');
const sundayRun = { ...sunday, id: 'sunday-run', exerciseLogs: sunday.exerciseLogs.map((entry) => entry.cardio ? entry : { ...entry, skipped: true, skipReason: 'Run mode' }) };
assert.equal(buildXPEvents({ ...weekData, workoutLogs: [...sessions, sundayRun] }).filter((event) => event.workoutId === sundayRun.id).length, 0, 'Run mode stays XP-neutral');
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

// ---- v2 program rules -------------------------------------------------------
assert.equal(first.planVersion, 3, 'New Cornell logs carry the finalized plan version');
const v1Tuesday = { ...createWorkoutLog('2026-10-20', settings), planVersion: undefined };
assert.equal(workoutForLog(v1Tuesday), cornellDaysV1.tuesday, 'Logs without planVersion keep the v1 definitions');
assert.equal(workoutForLog(createWorkoutLog('2026-10-20', settings)).exercises.length, 6);
for (const id of ['cn-rdl', 'cn-leg-press-b', 'cn-pulldown', 'cn-incline-press']) assert.ok(findExercise(id), `v1 id ${id} still resolves`);

// Calibration happens only in cycle 1; cycle 2 week 1 uses the week-2 ramp.
assert.equal(cornellWeek('2026-12-11'), 1);
assert.equal(prescriptionWeekForDate('2026-12-11'), 2);
assert.equal(prescriptionWeekForDate('2026-10-16'), 1);
assert.ok(exercisesForDate(cornellDays.friday, '2026-12-11').every((exercise, index) => exercise.sets === cornellDays.friday.exercises[index].sets));
assert.equal(targetRIRForExercise(findExercise('cn-lateral-a'), 4), '1-2; 0-1', 'Isolation last set may reach 0-1 RIR in growth weeks');

// Finishing with most sets unlogged earns no completion credit.
const partialFriday = createWorkoutLog('2026-10-23', settings);
partialFriday.status = 'completed';
const firstSet = partialFriday.exerciseLogs[0].sets[0];
Object.assign(firstSet, { weight: '140', reps: '10', rir: '2', completed: true });
assert.ok(setCompletionForLog(partialFriday).ratio < 0.2);
assert.equal(isCreditedWorkout(partialFriday), false);
assert.equal(buildXPEvents({ settings, workoutLogs: [partialFriday], bodyWeights: [] }).filter((event) => event.kind === 'workout').length, 0);
assert.equal(buildWeeklyChallenge({ settings, workoutLogs: [partialFriday], bodyWeights: [] }, '2026-10-24').progressCurrent, 0);

// PRs: adding sets or lowering RIR at the same load is not a PR; a real load gain is, once.
const fridayAt = (date, weight, reps, rir) => {
  const log = finish(createWorkoutLog(date, settings));
  log.exerciseLogs.forEach((entry) => entry.sets.forEach((set) => Object.assign(set, { weight, reps, leftReps: reps, rightReps: reps, rir })));
  return log;
};
const calib = fridayAt('2026-10-16', '100', '10', '3');
const week2 = fridayAt('2026-10-23', '100', '10', '3');
const lowerRir = fridayAt('2026-10-30', '100', '12', '1');
assert.ok(week2.exerciseLogs[0].sets.length > calib.exerciseLogs[0].sets.length, 'Week 2 has more sets than calibration');
assert.equal(detectPRs({ settings, workoutLogs: [calib, week2, lowerRir], bodyWeights: [] }).length, 0, 'More sets or less RIR at the same load is not a PR');
const heavier = fridayAt('2026-11-06', '105', '10', '2');
const prsAfter = detectPRs({ settings, workoutLogs: [calib, week2, lowerRir, heavier], bodyWeights: [] });
const weighted = heavier.exerciseLogs.filter((entry) => !entry.cardio && findExercise(entry.exerciseId)?.trackingType === 'weighted-reps').length;
assert.equal(prsAfter.length, weighted, 'One PR per weighted exercise for a genuine load gain');
assert.ok(prsAfter.every((pr) => pr.metric === 'weight' || pr.metric === 'strength'), 'Load PRs below the rep range fall back to an effort-adjusted strength PR');


// ---- existing v1 logs keep their original rules ----------------------------
const v1Log = (() => { const log = createWorkoutLog('2026-10-16', settings); delete log.planVersion; return log; })();
assert.equal(workoutForLog(v1Log), cornellDaysV1.friday);
const v1Done = finish({ ...v1Log, exerciseLogs: exercisesForDate(cornellDaysV1.friday, v1Log.date, 1).map((exercise,index)=>({id:`old-${index}`,exerciseId:exercise.id,sets:createSetLogs(exercise),completed:false})) });
assert.equal(buildXPEvents({ settings, workoutLogs: [v1Done], bodyWeights: [] }).reduce((sum, event) => sum + event.xp, 0), 170, 'A fully logged v1 session keeps its 170 XP');
const v1Partial = { ...v1Done, exerciseLogs: v1Done.exerciseLogs.map((entry, index) => index === 0 ? entry : { ...entry, completed: false, sets: entry.sets.map((set) => ({ ...set, completed: false })) }) };
assert.equal(isCreditedWorkout(v1Partial), true, 'v1 history is not retroactively stripped of completion credit');
assert.ok(buildXPEvents({ settings, workoutLogs: [v1Partial], bodyWeights: [] }).some((event) => event.kind === 'workout'));

// ---- muscle volume model ---------------------------------------------------
const normalWeek = plannedMuscleVolume('2026-10-30', '2026-11-05');
for (const [group, target] of Object.entries(muscleTargets)) {
  if (!target.min) continue;
  const planned = normalWeek.get(group);
  assert.ok(planned >= target.min && planned <= target.max, `${group} planned ${planned} should sit inside ${target.min}-${target.max}`);
}
assert.equal(normalWeek.get('side-delts'), 9, 'Side delts trained 3x/week, 3 sets each');
const pushUpDay = finish(createWorkoutLog('2026-10-19', settings));
pushUpDay.exerciseLogs[0].cardio = { ...pushUpDay.exerciseLogs[0].cardio, duration: '45', pushUpSets: '3', completed: true };
const withPushUps = summarizeMuscleRange({ settings, workoutLogs: [pushUpDay], bodyWeights: [] }, '2026-10-16', '2026-10-22');
assert.equal(withPushUps.rows.find((row) => row.group === 'chest').sets, 3, 'ROTC hard push-up sets count as direct chest sets');
assert.equal(withPushUps.rows.find((row) => row.group === 'triceps').sets, 1.5, 'and half a set each for triceps');

// ---- body trend --------------------------------------------------------------
const weights = [0, 4, 8, 12, 16, 20].map((day, index) => ({ id: `w${index}`, date: `2026-10-${String(1 + day).padStart(2, '0')}`, weight: 142 + day * (0.5 / 7) }));
const trend = bodyTrend(weights);
assert.ok(Math.abs(trend.weeklyRateLb - 0.5) < 0.01, 'Regression slope recovers +0.5 lb/week');
assert.equal(trend.rateVerdict, 'lean-bulk pace');
const tape = bodyTrend([{ id: 'a', date: '2026-10-01', weight: 142, waistIn: 30, shouldersIn: 45 }, { id: 'b', date: '2026-11-01', weight: 144, waistIn: 30, shouldersIn: 46.5 }]);
assert.equal(tape.ratio.toFixed(2), '1.55');
assert.equal(tape.ratioChange.toFixed(2), '0.05');

// ---- PR display collapses to one headline per lift per session ---------------
const noisy = [
  { id: '1', date: '2026-10-01', workoutId: 'w', exerciseName: 'Curl', metric: 'volume', label: 'v', value: 2, previous: 1, unit: '' },
  { id: '2', date: '2026-10-01', workoutId: 'w', exerciseName: 'Curl', metric: 'weight', label: 'w', value: 30, previous: 25, unit: '' },
  { id: '3', date: '2026-10-01', workoutId: 'w', exerciseName: 'Curl', metric: 'total-reps', label: 't', value: 30, previous: 28, unit: '' },
];
assert.deepEqual(headlinePRs(noisy).map((pr) => pr.id), ['2']);

console.log('Cornell checks passed: legacy isolation, exact prior references, calibration/deload, optional PT/cardio, four-day completion, XP, cuts, warm-up exclusion.');
