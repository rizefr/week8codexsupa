import assert from 'node:assert/strict';
import { cornellDays, cornellDaysV3, CORNELL_ID, exercisesForDate, workoutForLog } from '../dist/src/data/cornell.js';
import { createWorkoutLog, createSetLogs, findExercise, upgradeCurrentDraft, exerciseComparisonMatches, trackingTypeForExercise } from '../dist/src/lib/progress.js';
import { warmupsForDay } from '../dist/src/data/warmups.js';
import { shortOnTimeGuidance } from '../dist/src/lib/readiness.js';
const settings={startDate:'2026-05-25'};
const totals={tuesday:15,wednesday:14,friday:15,saturday:15};
for(const [key,day] of Object.entries(cornellDays)) {
  assert.ok(day.exercises.every(e=>!/cable|pulldown|seated row/i.test(e.name)),`${key} must avoid the external cable station`);
  assert.ok(day.exercises.every(e=>e.muscleGroups?.length),`${key} needs muscle metadata`);
  if(totals[key]) assert.equal(exercisesForDate(day,'2026-10-21').reduce((n,e)=>n+e.sets,0),totals[key]);
}
assert.equal(cornellDays.wednesday.exercises[0].trackingType,'assistance-reps');
assert.equal(cornellDays.wednesday.exercises[1].name,'Chest-Supported Incline DB Row');
assert.equal(cornellDays.tuesday.exercises[3].loadLabel,'Weight (lb, one DB total)');
assert.equal(trackingTypeForExercise(cornellDays.friday.exercises[5]),'weighted-reps');
assert.equal(cornellDays.friday.exercises[5].rirRequired,false);
for(const day of ['tuesday','wednesday','friday','saturday']) {
  assert.ok(shortOnTimeGuidance(day,CORNELL_ID).every(c=>cornellDays[day].exercises.some(e=>e.id===c.exerciseId)));
  assert.ok(shortOnTimeGuidance(day,CORNELL_ID,3).every(c=>cornellDaysV3[day].exercises.some(e=>e.id===c.exerciseId)));
  assert.ok(warmupsForDay(day,undefined,CORNELL_ID).filter(d=>d.exerciseId).every(d=>cornellDays[day].exercises.some(e=>e.id===d.exerciseId)));
}
for(const date of ['2026-10-21','2026-10-28','2026-11-04']) assert.equal(createWorkoutLog(date,settings).exerciseLogs[0].sets.length,3);
assert.equal(createWorkoutLog('2026-12-04',settings).exerciseLogs[0].sets.length,2,'Keep week-eight deload');
const draft={...createWorkoutLog('2026-10-21',settings),planVersion:3,
  exerciseLogs:exercisesForDate(cornellDaysV3.wednesday,'2026-10-21',3).map((e,i)=>({id:`old-${i}`,exerciseId:e.id,completed:false,sets:createSetLogs(e)}))};
draft.exerciseLogs[3].sets[0]={...draft.exerciseLogs[3].sets[0],weight:'15',reps:'14',rir:'2',completed:true};
const snapshot=JSON.stringify(draft);
const updated=upgradeCurrentDraft(draft);
assert.equal(JSON.stringify(draft),snapshot,'Never mutate source data');
assert.equal(updated.planVersion,4);
assert.equal(updated.exerciseLogs[3].sets.length,3);
assert.deepEqual(updated.exerciseLogs[3].sets[0],draft.exerciseLogs[3].sets[0],'Recorded retained work stays exact');
assert.equal(updated.exerciseLogs[0].exerciseId,'cn4-wed-pulldown');
assert.ok(!updated.exerciseLogs[0].sets[0].weight,'Never transfer cable weight to assistance');
assert.equal(updated.exerciseLogs.length,draft.exerciseLogs.length,'No duplicate planned work');
assert.equal(upgradeCurrentDraft(updated),updated,'Upgrade is idempotent');
const done={...draft,status:'completed'};
assert.equal(upgradeCurrentDraft(done),done);
assert.equal(workoutForLog(done),cornellDaysV3.wednesday);
const recordedCable=structuredClone(draft);
recordedCable.exerciseLogs[0].sets[0]={...recordedCable.exerciseLogs[0].sets[0],weight:'80',reps:'10',completed:true};
assert.deepEqual(upgradeCurrentDraft(recordedCable).exerciseLogs[0],recordedCable.exerciseLogs[0],'Never replace already recorded cable work');
const partialCable=structuredClone(draft);
partialCable.exerciseLogs[0].sets[0].weight='80';
assert.deepEqual(upgradeCurrentDraft(partialCable).exerciseLogs[0],partialCable.exerciseLogs[0],'Even partial load-only entry must survive unchanged under its original identity');
assert.equal(cornellDays.friday.exercises[5].replacementOptions,undefined,'No name-only swap may change weighted crunch into fake bodyweight volume');
assert.equal(exerciseComparisonMatches(findExercise('cn3-tue-triceps'),findExercise('cn4-tue-triceps')),false);
assert.equal(exerciseComparisonMatches(findExercise('cn3-wed-pulldown'),findExercise('cn4-wed-pulldown')),false);
assert.equal(exerciseComparisonMatches(findExercise('cn3-wed-row'),findExercise('cn4-wed-row')),false);
assert.equal(exerciseComparisonMatches(findExercise('cn3-fri-abs'),findExercise('cn4-fri-abs')),false);
assert.equal(exerciseComparisonMatches(findExercise('cn3-tue-incline'),findExercise('cn4-tue-incline')),true);
console.log('Cable-free plan, full sets, exact comparisons and safe draft revision checks passed.');
