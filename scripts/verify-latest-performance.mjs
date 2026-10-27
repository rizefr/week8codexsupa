import assert from 'node:assert/strict';
import { createWorkoutLog, createSetLogs, findExercise, previousExercisePerformance, exerciseSessions, previousSetSummary } from '../dist/src/lib/progress.js';
const settings={startDate:'2026-05-25'};
function session(date,exerciseId,{status='completed',count=3}={}) {
  const log=createWorkoutLog(date,settings);
  const exercise=findExercise(exerciseId);
  const sets=createSetLogs({...exercise,sets:3}).map((set,i)=>({...set,...(i<count?{weight:'35',reps:'10',seconds:'30',leftReps:'9',rightReps:'10',rir:'2'}:{}),completed:i<count}));
  return {...log,id:`fixture-${date}-${exerciseId}`,status,exerciseLogs:[{id:`entry-${date}`,exerciseId,sets,completed:count===3,notes:'Saved reference note'}]};
}
const earlier=session('2026-10-20','cn3-tue-incline');
const newer=session('2026-10-24','cn4-sat-incline',{status:'draft'});
const empty=session('2026-10-25','cn4-tue-incline',{status:'draft',count:0});
const query=findExercise('cn4-tue-incline');
const original=JSON.stringify([earlier,newer,empty]);
assert.equal(previousExercisePerformance([empty,earlier,newer],'2026-10-27',query)?.workout.id,newer.id,'Latest recorded sets must appear across days even when the workout was not finished');
assert.equal(exerciseSessions([earlier,newer],query).length,1,'PR/progression session lookup remains completed-workout-only');
assert.equal(previousExercisePerformance([earlier,newer],'2026-10-27',query,{includeDrafts:false})?.workout.id,earlier.id,'Coaching comparisons can retain completed-workout rules');
const enteredNotChecked=session('2026-10-25','cn4-sat-incline',{status:'draft',count:0});
Object.assign(enteredNotChecked.exerciseLogs[0].sets[0],{weight:'40',reps:'8'});
assert.equal(previousExercisePerformance([earlier,enteredNotChecked],'2026-10-27',query)?.workout.id,enteredNotChecked.id,'Actual load and reps are a reference even when RIR or Done was not completed');
const manuallyIncomplete=structuredClone(enteredNotChecked);
manuallyIncomplete.exerciseLogs[0].sets[0].completionOverride='incomplete';
assert.equal(previousExercisePerformance([earlier,manuallyIncomplete],'2026-10-27',query)?.workout.id,earlier.id,'Explicitly marking a set incomplete must be respected');
const sparse=structuredClone(newer);
sparse.exerciseLogs[0].sets.forEach((set,i)=>{set.completed=i===2;if(i!==2) for(const field of ['weight','reps','seconds','leftReps','rightReps','rir']) delete set[field];});
const sparseReference=previousExercisePerformance([earlier,sparse],'2026-10-27',query);
assert.deepEqual(sparseReference.exerciseLog.sets.map(s=>s.setNumber),[3],'Retain original set numbers after filtering unrecorded rows');
for(const [oldId,newId] of [
  ['cn4-tue-lateral','cn4-sat-lateral'],
  ['cn4-tue-curl','cn4-wed-curl'],
  ['cn4-wed-pulldown','cn4-sat-pullup'],
  ['cn4-tue-triceps','cn4-sat-triceps'],
  ['cn4-wed-row','cn4-sat-row'],
  ['cn4-tue-abs','cn4-tue-abs'],
  ['friday-rkc-plank','friday-rkc-plank'],
  ['saturday-hollow-body-hold','saturday-hollow-body-hold'],
  ['tuesday-db-bulgarian-split-squat','tuesday-db-bulgarian-split-squat'],
]) {
  const old=session('2026-10-20',oldId);
  const recent=session('2026-10-24',newId,{status:'draft',count:1});
  const latest=previousExercisePerformance([old,recent],'2026-10-27',findExercise(oldId));
  assert.equal(latest?.workout.id,recent.id,`${oldId}: select latest exercise performance independently of day`);
  assert.equal(latest.exerciseLog.sets.length,1,'Only valid recorded sets should be offered, not unfinished/pre-filled rows');
  assert.ok(!previousSetSummary(latest.exerciseLog,latest.exercise).includes('- reps'));
}
const skipped={...newer,exerciseLogs:newer.exerciseLogs.map(e=>({...e,skipped:true}))};
assert.equal(previousExercisePerformance([earlier,skipped],'2026-10-27',query)?.workout.id,earlier.id);
assert.equal(previousExercisePerformance([earlier,{...newer,date:'2026-10-27'}],'2026-10-27',query)?.workout.id,earlier.id,'Do not compare the active workout against itself');
assert.equal(previousExercisePerformance([earlier,{...newer,date:'2026-10-28'}],'2026-10-27',query)?.workout.id,earlier.id,'Future workouts cannot replace prior references');
assert.equal(previousExercisePerformance([newer],'2026-10-27',findExercise('cn4-fri-press')),undefined,'A leg press is not an incline press');
assert.equal(JSON.stringify([earlier,newer,empty]),original,'Reference lookup must not mutate any saved data');
console.log('Latest performance checks passed: cross-day, draft sets, all strength tracking types, strict exclusions and no mutation.');
