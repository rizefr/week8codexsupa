import assert from 'node:assert/strict';
import { createWorkoutLog, setCompletionForLog, isCreditedWorkout, findExercise } from '../dist/src/lib/progress.js';
import { calculateMuscleVolume, plannedMuscleVolume } from '../dist/src/lib/muscles.js';
import { cornellDaysV1, cornellDaysV2, cornellDays, workoutForLog } from '../dist/src/data/cornell.js';
const settings = {startDate:'2026-05-25'};
const log = createWorkoutLog('2026-10-30', settings);
assert.equal(log.planVersion, 3);
assert.equal(workoutForLog({...log,planVersion:1}),cornellDaysV1.friday);
assert.equal(workoutForLog({...log,planVersion:2}),cornellDaysV2.friday);
const snapshot = JSON.stringify(log);
const skipped = {...log,status:'completed',exerciseLogs:log.exerciseLogs.map((e,i)=>({...e,skipped:i>0,sets:e.sets.map(s=>({...s,weight:'100',reps:'10',rir:'2',completed:true}))}))};
assert.equal(isCreditedWorkout(skipped),false,'Skipping most work must not manufacture full-session credit');
assert.equal(setCompletionForLog(skipped).planned,15,'Original prescribed sets remain denominator');
const invalid={...log,status:'completed',exerciseLogs:log.exerciseLogs.map(e=>({...e,sets:e.sets.map(s=>({...s,completed:true}))}))};
assert.equal(calculateMuscleVolume({settings,workoutLogs:[invalid],bodyWeights:[]},log.date,log.date).get('quads').sets,0,'Empty completed flags cannot create muscle stimulus');
assert.equal(JSON.stringify(log),snapshot);
const volume=plannedMuscleVolume('2026-10-30','2026-11-05');
assert.equal(volume.get('upper-chest'),6);
assert.equal(volume.get('side-delts'),9);
assert.equal(volume.get('quads'),5);
assert.equal(volume.get('hamstrings'),5);
assert.equal(Object.values(cornellDays).filter(d=>d.key !== 'sunday' && d.exercises.some(e=>e.id.startsWith('cn3'))).length,4);
for(const d of Object.values(cornellDays)) for(const e of d.exercises) {
  assert.ok(findExercise(e.id));
  assert.equal(findExercise(e.id).sets,e.sets,'Exercise registry must preserve each version-specific prescription');
}
console.log('Release safety and upper-priority allocation checks passed');
