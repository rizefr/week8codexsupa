import { DayKey, WarmupDrill, WarmupLog, WorkoutLog } from "../types";
import { isTrainingDay } from "../lib/progress";
import { CORNELL_ID, CORNELL_PLAN_VERSION, cornellDaysForLog } from "./cornell";

const easyEffort = "Easy RPE 2-4; prime joints and positions without fatigue.";

function cornellWarmups(dayKey: DayKey, planVersion = CORNELL_PLAN_VERSION): WarmupDrill[] {
  const workout = cornellDaysForLog({ planVersion })[dayKey];
  if (!workout.exercises.length) return [];
  const lower = workout.exercises[0]?.muscleGroups?.some((group) => ["quads", "hamstrings"].includes(group));
  const general: WarmupDrill[] = [
    { id: `cn-${dayKey}-walk`, dayKey, order: 1, name: "Easy walk", prescription: "2-3 min", type: "general", when: "Before lifting", why: "Raise temperature without tiring your legs.", effortTarget: easyEffort },
    { id: `cn-${dayKey}-rehearse`, dayKey, order: 2, name: lower ? "Bodyweight hinge + squat" : "Wall slides + scapular push-ups", prescription: "5-8 comfortable reps each", type: "general", when: "Before lifting", why: "Rehearse the day's positions; stop before fatigue.", effortTarget: easyEffort },
  ];
  return [...general, ...workout.exercises.slice(0, 2).map((exercise, index): WarmupDrill => ({
    id: `${exercise.id}-ramp`, dayKey, order: index + 3, name: `${exercise.name} ramp-up`, prescription: exercise.muscleGroups?.[0] === "side-delts" ? "6-8 no-load easy reps" : "1-3 progressively heavier easy sets",
    type: "pre-exercise", exerciseId: exercise.id, when: "Immediately before working sets", effortTarget: easyEffort,
    why: exercise.trackingType === "assistance-reps" ? "Start with more assistance; warm up without approaching failure." : "Start light, rehearse setup, and use fewer reps as load rises. Not working sets.",
  }))];
}

// Future warm-up edits belong here. Keep warm-ups separate from workout exercise
// logs so they never affect PRs, volume, trends, or working-set quality.
export const warmupDrillsByDay: Partial<Record<DayKey, WarmupDrill[]>> = {
  monday: [
    { id: "monday-easy-treadmill-walk", dayKey: "monday", order: 1, name: "Easy Treadmill Walk", prescription: "60-90 sec", when: "Start of workout", why: "Raises body temperature without fatigue.", type: "general", effortTarget: easyEffort },
    { id: "monday-cat-cow", dayKey: "monday", order: 2, name: "Cat-Cow", prescription: "5 reps", when: "Start of workout", why: "Loosens spine and ribcage before pulling/pressing.", type: "general", effortTarget: easyEffort },
    { id: "monday-t-spine-rotation", dayKey: "monday", order: 3, name: "Quadruped T-Spine Rotation", prescription: "4-5 reps/side", when: "Start of workout", why: "Improves upper-back position.", type: "general", effortTarget: easyEffort },
    { id: "monday-scapular-push-up", dayKey: "monday", order: 4, name: "Scapular Push-Up", prescription: "8 reps", when: "Start of workout", why: "Primes serratus and shoulder blade control.", type: "general", effortTarget: easyEffort },
    { id: "monday-pull-up-scapular-depression", dayKey: "monday", order: 5, name: "Assisted Pull-Up Scapular Depression", prescription: "5-6 reps", when: "Right before pull-ups", why: "Primes scapular depression before vertical pulling.", type: "pre-exercise", exerciseId: "monday-assisted-pull-up", effortTarget: easyEffort },
    { id: "monday-pull-up-ramp-up", dayKey: "monday", order: 6, name: "Assisted Pull-Up Ramp-Up", prescription: "1 x 4-5 easy reps", when: "Right before assisted pull-up work sets", why: "Use more assistance than work sets to groove the rep pattern.", type: "pre-exercise", exerciseId: "monday-assisted-pull-up", effortTarget: easyEffort },
    { id: "monday-low-incline-press-ramp-up", dayKey: "monday", order: 7, name: "Low-Incline DB Press Ramp-Up", prescription: "1-2 easy sets", when: "Right before low-incline DB press", why: "Practice setup and pressing path before working sets.", type: "pre-exercise", exerciseId: "monday-low-incline-db-press", effortTarget: easyEffort },
    { id: "monday-no-load-lateral-raise", dayKey: "monday", order: 8, name: "Optional No-Load Lateral Raise", prescription: "6-8 reps", when: "Right before DB lateral raises if stiff", why: "Rehearses the raise path without fatiguing side delts.", type: "pre-exercise", exerciseId: "monday-db-lateral-raise", optional: true, effortTarget: easyEffort },
  ],
  tuesday: [
    { id: "tuesday-easy-treadmill-walk", dayKey: "tuesday", order: 1, name: "Easy Treadmill Walk", prescription: "90 sec", when: "Start of workout", why: "Raises temperature without turning cardio into training.", type: "general", effortTarget: easyEffort },
    { id: "tuesday-leg-swings", dayKey: "tuesday", order: 2, name: "Leg Swings", prescription: "6 front/back + 6 side/side per leg", when: "Start of workout", why: "Opens hips through the ranges used in split squats and hinges.", type: "general", effortTarget: easyEffort },
    { id: "tuesday-ankle-rocks", dayKey: "tuesday", order: 3, name: "Knee-to-Wall Ankle Rocks", prescription: "8/side", when: "Start of workout", why: "Preps ankle motion for squatting and split squats.", type: "general", effortTarget: easyEffort },
    { id: "tuesday-hip-flexor-lunge-reach", dayKey: "tuesday", order: 4, name: "Dynamic Hip Flexor Lunge with Reach", prescription: "5/side", when: "Start of workout", why: "Preps hip extension without long static stretching.", type: "general", effortTarget: easyEffort },
    { id: "tuesday-bodyweight-hip-hinge", dayKey: "tuesday", order: 5, name: "Bodyweight Hip Hinge", prescription: "8 reps", when: "Start of workout", why: "Grooves hinge mechanics before DB RDLs.", type: "general", effortTarget: easyEffort },
    { id: "tuesday-glute-bridge", dayKey: "tuesday", order: 6, name: "Glute Bridge", prescription: "8 reps", when: "Start of workout", why: "Primes glutes without fatigue.", type: "general", effortTarget: easyEffort },
    { id: "tuesday-bodyweight-split-squat", dayKey: "tuesday", order: 7, name: "Bodyweight Split Squat", prescription: "5/leg", when: "Start of workout", why: "Rehearses the single-leg pattern before loaded sets.", type: "general", effortTarget: easyEffort },
    { id: "tuesday-bulgarian-ramp-up", dayKey: "tuesday", order: 8, name: "DB Bulgarian Split Squat Ramp-Up", prescription: "1 easy set/leg", when: "Right before Bulgarian split squat work sets", why: "Finds balance and range before loading hard sets.", type: "pre-exercise", exerciseId: "tuesday-db-bulgarian-split-squat", effortTarget: easyEffort },
    { id: "tuesday-rdl-ramp-up", dayKey: "tuesday", order: 9, name: "Light DB Romanian Deadlift Ramp-Up", prescription: "1 x 6-8", when: "Right before DB RDL work sets", why: "Checks hinge, brace, and hamstring stretch before working load.", type: "pre-exercise", exerciseId: "tuesday-db-romanian-deadlift", effortTarget: easyEffort },
  ],
  wednesday: [
    { id: "wednesday-easy-walk-march", dayKey: "wednesday", order: 1, name: "Easy Treadmill Walk or March in Place", prescription: "45-60 sec", when: "Start of workout", why: "Raises temperature without taking freshness from delts and arms.", type: "general", effortTarget: easyEffort },
    { id: "wednesday-cat-cow", dayKey: "wednesday", order: 2, name: "Cat-Cow", prescription: "5 reps", when: "Start of workout", why: "Loosens spine and ribcage for shoulder work.", type: "general", effortTarget: easyEffort },
    { id: "wednesday-wall-slides", dayKey: "wednesday", order: 3, name: "Wall Slides", prescription: "6-8 reps", when: "Start of workout", why: "Preps overhead motion and scapular control.", type: "general", effortTarget: easyEffort },
    { id: "wednesday-shoulder-cars", dayKey: "wednesday", order: 4, name: "Shoulder CARs", prescription: "2 slow reps/side", when: "Start of workout", why: "Checks shoulder range before pressing and raises.", type: "general", effortTarget: easyEffort },
    { id: "wednesday-band-external-rotation", dayKey: "wednesday", order: 5, name: "Band External Rotation", prescription: "8/side", when: "Start of workout", why: "Primes rotator cuff without turning it into fatigue work.", type: "general", effortTarget: easyEffort },
    { id: "wednesday-wrist-pumps", dayKey: "wednesday", order: 6, name: "Wrist Circles + Wrist Flexion/Extension Pumps", prescription: "10 each", when: "Start of workout", why: "Preps wrists and elbows for curls/extensions.", type: "general", effortTarget: easyEffort },
    { id: "wednesday-no-load-lateral-raise", dayKey: "wednesday", order: 7, name: "No-Load Lateral Raise", prescription: "6-8 reps", when: "Right before DB lateral raises", why: "Rehearses path while keeping lateral raises fresh.", type: "pre-exercise", exerciseId: "wednesday-db-lateral-raise", effortTarget: easyEffort },
    { id: "wednesday-shoulder-press-ramp-up", dayKey: "wednesday", order: 8, name: "Standing DB Shoulder Press Ramp-Up", prescription: "1 easy set", when: "Right before standing DB shoulder press", why: "Checks rib position and pressing path before work sets.", type: "pre-exercise", exerciseId: "wednesday-standing-db-shoulder-press", effortTarget: easyEffort },
  ],
  friday: [
    { id: "friday-easy-treadmill-walk", dayKey: "friday", order: 1, name: "Easy Treadmill Walk", prescription: "60-90 sec", when: "Start of workout", why: "Raises body temperature without fatigue.", type: "general", effortTarget: easyEffort },
    { id: "friday-cat-cow", dayKey: "friday", order: 2, name: "Cat-Cow", prescription: "5 reps", when: "Start of workout", why: "Loosens spine and ribcage before pressing and pulling.", type: "general", effortTarget: easyEffort },
    { id: "friday-t-spine-rotation", dayKey: "friday", order: 3, name: "Quadruped T-Spine Rotation", prescription: "4-5 reps/side", when: "Start of workout", why: "Improves upper-back position.", type: "general", effortTarget: easyEffort },
    { id: "friday-wall-slides", dayKey: "friday", order: 4, name: "Wall Slides", prescription: "6-8 reps", when: "Start of workout", why: "Preps shoulder position before flat pressing and dips.", type: "general", effortTarget: easyEffort },
    { id: "friday-scapular-push-up", dayKey: "friday", order: 5, name: "Scapular Push-Up", prescription: "8 reps", when: "Start of workout", why: "Primes serratus and shoulder blade control.", type: "general", effortTarget: easyEffort },
    { id: "friday-flat-press-ramp-up", dayKey: "friday", order: 6, name: "Flat DB Press or Bench Press Ramp-Up", prescription: "2 easy sets", when: "Right before flat press work sets", why: "Checks setup and pressing path before heavier work.", type: "pre-exercise", exerciseId: "friday-flat-db-press-or-barbell-bench-press", effortTarget: easyEffort },
    { id: "friday-pull-up-scapular-depression", dayKey: "friday", order: 7, name: "Assisted Pull-Up Scapular Depression", prescription: "5 reps", when: "Right before assisted pull-ups", why: "Primes scapular depression before vertical pulling.", type: "pre-exercise", exerciseId: "friday-assisted-pull-up", effortTarget: easyEffort },
    { id: "friday-dip-support-hold", dayKey: "friday", order: 8, name: "Assisted Dip Support Hold", prescription: "1 x 10 sec", when: "Right before dips if unstable", why: "Checks support position before loaded dip reps.", type: "pre-exercise", exerciseId: "friday-assisted-dip-chest-triceps-bias", optional: true, effortTarget: easyEffort },
  ],
  saturday: [
    { id: "saturday-easy-walk-march", dayKey: "saturday", order: 1, name: "Easy Treadmill Walk or March in Place", prescription: "45-60 sec", when: "Start of workout", why: "Raises temperature without turning pump day into conditioning.", type: "general", effortTarget: easyEffort },
    { id: "saturday-wall-slides", dayKey: "saturday", order: 2, name: "Wall Slides", prescription: "6 reps", when: "Start of workout", why: "Preps shoulder position for pull-ups and raises.", type: "general", effortTarget: easyEffort },
    { id: "saturday-band-external-rotation", dayKey: "saturday", order: 3, name: "Band External Rotation", prescription: "8/side", when: "Start of workout", why: "Primes rotator cuff without fatigue.", type: "general", effortTarget: easyEffort },
    { id: "saturday-wrist-pumps", dayKey: "saturday", order: 4, name: "Wrist Circles + Wrist Flexion/Extension Pumps", prescription: "10 each", when: "Start of workout", why: "Preps wrists and elbows for curls.", type: "general", effortTarget: easyEffort },
    { id: "saturday-pull-up-scapular-depression", dayKey: "saturday", order: 5, name: "Assisted Pull-Up Scapular Depression", prescription: "5 reps", when: "Right before pull-ups", why: "Primes scapular depression for clean pump reps.", type: "pre-exercise", exerciseId: "saturday-assisted-pull-up-technique-pump", effortTarget: easyEffort },
    { id: "saturday-pull-up-ramp-up", dayKey: "saturday", order: 6, name: "Assisted Pull-Up Ramp-Up", prescription: "1 x 5 easy reps", when: "Right before assisted pull-up pump sets", why: "Use more assistance than work sets to groove perfect reps.", type: "pre-exercise", exerciseId: "saturday-assisted-pull-up-technique-pump", effortTarget: easyEffort },
    { id: "saturday-no-load-lateral-raise", dayKey: "saturday", order: 7, name: "No-Load Lateral Raise", prescription: "6-8 reps", when: "Right before lateral raise mechanical set", why: "Rehearses raise path without using weighted warm-up sets.", type: "pre-exercise", exerciseId: "saturday-db-lateral-raise-mechanical-set", effortTarget: easyEffort },
    { id: "saturday-calf-ankle-prep", dayKey: "saturday", order: 8, name: "Bodyweight Calf Raise or Ankle Rocks", prescription: "8-10 reps", when: "Right before standing DB calf raises", why: "Preps ankle/calf range before loaded calf work.", type: "pre-exercise", exerciseId: "saturday-standing-db-calf-raise", effortTarget: easyEffort },
  ],
};

export const restDayPostureRoutine: WarmupDrill[] = [
  { id: "posture-chin-tucks", order: 1, name: "Chin Tucks", prescription: "8-10 reps", when: "Rest days or after lifting", why: "Light neck/posture reset without training fatigue.", type: "posture", optional: true, effortTarget: easyEffort },
  { id: "posture-wall-slides-angels", order: 2, name: "Wall Slides or Wall Angels", prescription: "6-8 reps", when: "Rest days or after lifting", why: "Maintains shoulder motion without loading.", type: "posture", optional: true, effortTarget: easyEffort },
  { id: "posture-doorway-pec-stretch", order: 3, name: "Doorway Pec Stretch", prescription: "20-30 sec/side", when: "Rest days or after lifting", why: "Use after lifting, not before heavy pressing.", type: "posture", optional: true, effortTarget: easyEffort },
  { id: "posture-childs-pose-lat-reach", order: 4, name: "Child's Pose with Lat Reach", prescription: "20-30 sec/side", when: "Rest days or after lifting", why: "Easy lat reset after training.", type: "posture", optional: true, effortTarget: easyEffort },
  { id: "posture-couch-stretch", order: 5, name: "Couch Stretch", prescription: "20-30 sec/side", when: "Rest days or after lifting", why: "Light hip flexor work outside the lifting warm-up.", type: "posture", optional: true, effortTarget: easyEffort },
  { id: "posture-dead-hang", order: 6, name: "Dead Hang", prescription: "10-20 sec x 1-2 rounds", when: "Rest days or after lifting if shoulders feel good", why: "Optional decompression; avoid long hangs before lifting.", type: "posture", optional: true, effortTarget: easyEffort },
];

export const doNotDoBeforeLifting = [
  "Long static pec stretches",
  "Long static lat stretches",
  "Long hamstring stretches",
  "Long hip flexor stretches",
  "Long dead hangs",
  "High-rep push-ups",
  "Band curls",
  "Band triceps pushdowns",
  "Band face-pull circuits",
  "Aggressive band shoulder dislocates",
  "Weighted lateral raise warm-up sets",
];

export function warmupsForDay(dayKey: DayKey, type?: WarmupDrill["type"], programId?: string, planVersion = CORNELL_PLAN_VERSION): WarmupDrill[] {
  const drills = programId === CORNELL_ID ? cornellWarmups(dayKey, planVersion) : warmupDrillsByDay[dayKey] ?? [];
  return (type ? drills.filter((drill) => drill.type === type) : drills).sort((a, b) => a.order - b.order);
}

export function preExerciseWarmupsForExercise(dayKey: DayKey, exerciseId: string, programId?: string, planVersion = CORNELL_PLAN_VERSION): WarmupDrill[] {
  return warmupsForDay(dayKey, "pre-exercise", programId, planVersion).filter((drill) => drill.exerciseId === exerciseId);
}

export function postureWarmups(): WarmupDrill[] {
  return [...restDayPostureRoutine].sort((a, b) => a.order - b.order);
}

export function drillsForLog(log?: Pick<WorkoutLog, "dayKey" | "programId" | "planVersion">): WarmupDrill[] {
  if (!log) return [];
  if (log.programId === CORNELL_ID) return cornellWarmups(log.dayKey, log.planVersion ?? 1);
  return isTrainingDay(log.dayKey) ? warmupsForDay(log.dayKey) : postureWarmups();
}

export function isWarmupComplete(warmupLog: WarmupLog | undefined, drillId: string): boolean {
  return warmupLog?.completedDrills?.[drillId] === true;
}

export function warmupCompletionSummary(log?: Pick<WorkoutLog, "dayKey" | "warmupLog" | "programId">) {
  const drills = drillsForLog(log);
  const completed = drills.filter((drill) => isWarmupComplete(log?.warmupLog, drill.id)).length;
  const general = drills.filter((drill) => drill.type === "general");
  const preExercise = drills.filter((drill) => drill.type === "pre-exercise");
  const posture = drills.filter((drill) => drill.type === "posture");
  return {
    completed,
    total: drills.length,
    generalCompleted: general.filter((drill) => isWarmupComplete(log?.warmupLog, drill.id)).length,
    generalTotal: general.length,
    preExerciseCompleted: preExercise.filter((drill) => isWarmupComplete(log?.warmupLog, drill.id)).length,
    preExerciseTotal: preExercise.length,
    postureCompleted: posture.filter((drill) => isWarmupComplete(log?.warmupLog, drill.id)).length,
    postureTotal: posture.length,
    percent: drills.length ? Math.round((completed / drills.length) * 100) : 0,
    hasWarmups: drills.length > 0,
  };
}
