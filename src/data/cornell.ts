import { DayKey, Exercise, MuscleGroup, WorkoutDay, WorkoutLog } from "../types";
import { workoutDays as legacyDays, trainingDayKeys as legacyTrainingDays } from "./routine";
import { daysSince, todayISO } from "../lib/date";

// Versioned plan: never repurpose legacy exercise IDs or rewrite past logs.
export const CORNELL_START = "2026-10-16";
export const CORNELL_ID = "cornell-v1" as const;
export const cornellTrainingDays: DayKey[] = ["tuesday", "wednesday", "friday", "saturday"];
const legacy = Object.values(legacyDays).flatMap((day) => day.exercises);
function retained(name: string, id: string, sets: number, reps: string, notes: string): Exercise {
  const source = legacy.find((exercise) => exercise.name === name);
  if (!source) throw new Error(`Missing legacy exercise: ${name}`);
  return { ...source, id, sets, reps, notes, superset: undefined, supersetGroup: undefined, supersetLabel: undefined,
    targetRIRByPhase: { setup: "3", growth: "1-2", push: "1-2" } };
}
function machine(id: string, name: string, sets: number, reps: string, muscles: MuscleGroup[], notes: string, rest = "90-120 sec"): Exercise {
  return { id, name, comparisonExerciseId: id.replace(/-[ab]$/, ""), kind: "strength", trackingType: "weighted-reps",
    sets, reps, rest, target: muscles.join(", ").replace(/-/g, " "), muscleGroups: muscles, notes,
    loadLabel: "Weight (lb on this machine)", loadRequired: true, rirRequired: true, prEligible: true,
    riskLevel: "moderate", primaryProgression: "add-reps-first", effortMode: "rir",
    targetRIRByPhase: { setup: "3", growth: "1-2", push: "1-2" },
    logHint: "Record the machine and seat setting in notes. Stack labels are not comparable across different machines." };
}
function day(key: DayKey, title: string, exercises: Exercise[], intent: string): WorkoutDay {
  return { key, dayName: key[0].toUpperCase() + key.slice(1), shortTitle: title, title, exercises,
    subtitle: "Essential · about 60-75 min including warm-up", intent,
    rules: ["Week 1: at most 2 working sets per exercise, about 3 reps in reserve. Recalibrate loads; old numbers are references, not targets.",
      "Week 2: normal sets at 2-3 RIR. Weeks 3-7: 1-2 RIR unless the exercise specifies 2. Do not add sets to chase XP.",
      "Week 8: halve working sets (round up), 3-4 RIR. Repeat a new cycle only after reviewing recovery.",
      "Add reps first. After two comparable sessions reach the top range at target RIR, use the smallest load increase."] };
}
const lowerA = day("friday", "Lower A · Quads + Abs", [
  machine("cn-leg-press-a", "Helen Newman Leg Press", 3, "8-12", ["quads", "glutes"], "Use a repeatable foot position and depth; keep pelvis supported.", "2-3 min"),
  machine("cn-seated-curl-a", "Helen Newman Seated Leg Curl", 3, "10-15", ["hamstrings"], "Set the pad securely; control the lengthened position."),
  retained("DB Bulgarian Split Squat", "cn-split-squat", 2, "8-12/leg", "Light, controlled sets; use support for balance. Keep 2 RIR after setup week."),
  machine("cn-calf-a", "Helen Newman Calf Press", 3, "10-15", ["calves"], "Pause in the stretch; no bouncing or shortened reps."),
  machine("cn-cable-crunch", "Kneeling Cable Crunch", 2, "10-15", ["abs-core"], "Flex the trunk under control, not a hip hinge. Stop if control breaks."),
], "Quads and hamstrings first. Thursday ROTC fatigue? Hold load and use the optional cuts, not rushed reps.");
const upperA = day("saturday", "Upper A · Chest + Width", [
  retained("Low-Incline DB Press", "cn-incline-press", 3, "6-10", "Use a low incline and controlled depth. Stop short of technical failure."),
  machine("cn-assisted-pullup", "Helen Newman Assisted Pull-Up", 3, "6-10", ["lats", "biceps"], "Use a repeatable grip. More assistance makes the set easier.", "2-3 min"),
  retained("Chest-Supported Incline DB Row", "cn-supported-row", 3, "8-12", "Keep chest supported; avoid shrugging to finish reps."),
  retained("DB Lateral Raise", "cn-lateral-a", 3, "12-20", "Strict reps; stop before swinging. Reps before load."),
  machine("cn-pec-fly", "Helen Newman Pec Fly", 2, "10-15", ["chest"], "Use comfortable shoulder depth, not a forced stretch."),
  machine("cn-cable-triceps", "Overhead Cable Triceps Extension", 2, "10-15", ["triceps"], "Keep upper arms steady. Reduce range/load if elbows object."),
  retained("Incline DB Curl", "cn-incline-curl", 2, "10-15", "No shoulder swing. Pair with triceps only if equipment is free."),
], "Chest, back width, and side delts. Optional arm pairing saves time without shortening compound rests.");
upperA.exercises[1] = { ...upperA.exercises[1], trackingType: "assistance-reps", loadLabel: "Assistance (lb)", primaryProgression: "reduce-assistance-after-reps" };
const lowerB = day("tuesday", "Lower B · Posterior + Abs", [
  retained("DB Romanian Deadlift", "cn-rdl", 2, "8-12", "Keep 2 RIR outside setup/deload. Hips back, DBs close; stop if back position or hamstring control fails."),
  machine("cn-leg-press-b", "Helen Newman Leg Press", 3, "10-15", ["quads", "glutes"], "Same machine/setup as Friday; progress within this rep range.", "2-3 min"),
  machine("cn-leg-extension", "Helen Newman Leg Extension", 2, "10-15", ["quads"], "Controlled full comfortable range; no kicking."),
  machine("cn-seated-curl-b", "Helen Newman Seated Leg Curl", 2, "10-15", ["hamstrings"], "Keep hips down and control the return."),
  machine("cn-calf-b", "Helen Newman Calf Press", 2, "10-15", ["calves"], "Pause in the stretched position; no bouncing."),
  { ...retained("Reverse Crunch", "cn-reverse-crunch", 2, "10-15", "Curl pelvis under control. Progress clean reps, not added load."),
    targetRIRByPhase: { setup: "Stop when control breaks", growth: "Stop when control breaks", push: "Stop when control breaks" } },
], "Recover from Monday PT before adding load. Thursday running is still two days away; no hard finisher.");
lowerB.exercises[0].targetRIRByPhase = { setup: "3", growth: "2", push: "2" };
const upperB = day("wednesday", "Upper B · Back + Delts", [
  machine("cn-pulldown", "Helen Newman Lat Pulldown", 3, "8-12", ["lats", "biceps"], "Repeat the same grip and seat setup; avoid leaning back to turn it into a row.", "2-3 min"),
  machine("cn-chest-press", "Helen Newman Chest Press", 3, "8-12", ["chest", "front-delts", "triceps"], "Keep 2 RIR to protect Thursday push-up practice.", "2-3 min"),
  machine("cn-seated-row", "Helen Newman Seated Row", 2, "8-12", ["upper-back", "lats"], "Controlled reach; no torso heave."),
  retained("DB Lateral Raise", "cn-lateral-b", 3, "12-20", "Strict reps and relaxed neck. Stop before shrugging."),
  machine("cn-rear-delt", "Helen Newman Rear Delt Fly", 2, "12-20", ["rear-delts", "upper-back"], "Keep shoulders down, avoid forced end range."),
  retained("Incline DB Curl", "cn-curl-b", 2, "10-15", "Keep reps clean. Skip this accessory first if time is tight."),
], "Back and shoulders lead. No extra push-up burnout before Thursday ROTC.");
upperB.exercises[1].targetRIRByPhase = { setup: "3", growth: "2", push: "2" };
function pt(key: "monday" | "thursday"): WorkoutDay {
  return { key, dayName: key === "monday" ? "Monday" : "Thursday", title: "ROTC · Run + Calisthenics", shortTitle: "ROTC PT",
    subtitle: "Fixed session · not an additional gym workout", exercises: [],
    intent: "Follow your instructor's running and calisthenics. Record what actually happened; no extra intervals or gym lifting required.",
    cardio: [{ id: `cn-rotc-${key}`, name: "ROTC session", time: "Actual minutes", intensity: "Record actual intensity", notes: "Log running/calisthenics duration and details. This is not a recovery-day or strength PR." }] };
}
export const cornellDays: Record<DayKey, WorkoutDay> = {
  monday: pt("monday"), tuesday: lowerB, wednesday: upperB, thursday: pt("thursday"), friday: lowerA, saturday: upperA,
  sunday: { key: "sunday", dayName: "Sunday", title: "Optional · Aerobic Base", shortTitle: "Optional aerobic",
    subtitle: "15-30 min · skip freely when tired", exercises: [],
    intent: "Conversational jog/walk at RPE 3-4. Start with 15-20 min; walk before breathing becomes strained. No intervals before Monday PT.",
    cardio: [{ id: "cn-easy-aerobic", name: "Easy jog / walk", time: "15-30 min", intensity: "Easy, full-sentence conversational pace", notes: "After two comfortable weeks, add up to 5 minutes, capped at 30. Keep pace easy. Cycling is a lower-impact fallback." }],
    rules: ["No penalty for skipping this optional session.", "Feeling tired or sore? Full rest is the preferred alternative.", "A 15:50 two-mile pace is a test effort, not an easy-run target. Start controlled rather than sprinting the opening laps."] },
};
export const cornellExercises = Object.values(cornellDays).flatMap((workout) => workout.exercises);
export function cornellActive(date = todayISO()): boolean { return date >= CORNELL_START; }
export function daysForDate(date = todayISO()) { return cornellActive(date) ? cornellDays : legacyDays; }
export function workoutForLog(log: Pick<WorkoutLog, "dayKey" | "programId">): WorkoutDay {
  return (log.programId === CORNELL_ID ? cornellDays : legacyDays)[log.dayKey];
}
export function trainingDaysForDate(date = todayISO()): DayKey[] { return cornellActive(date) ? cornellTrainingDays : legacyTrainingDays; }
export function isTrainingLog(log: Pick<WorkoutLog, "dayKey" | "programId">): boolean { return workoutForLog(log).exercises.length > 0; }
export function cornellWeek(date: string, start = CORNELL_START): number { return Math.floor(Math.max(0, daysSince(start, date)) / 7) % 8 + 1; }
export function weekForLog(log: WorkoutLog): number { return log.programId === CORNELL_ID ? cornellWeek(log.date, log.programStartDate) : log.weekInCycle ?? 1; }
export function exercisesForDate(workout: WorkoutDay, date: string): Exercise[] {
  const week = cornellWeek(date);
  if (!cornellActive(date)) return workout.exercises;
  return workout.exercises.map((exercise) => ({ ...exercise,
    sets: week === 1 ? Math.min(2, exercise.sets ?? 1) : week === 8 ? Math.ceil((exercise.sets ?? 1) / 2) : exercise.sets }));
}
