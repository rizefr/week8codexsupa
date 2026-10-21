import { DayKey, Exercise, MuscleGroup, WorkoutDay, WorkoutLog } from "../types";
import { workoutDays as legacyDays, trainingDayKeys as legacyTrainingDays } from "./routine";
import { addDays, daysSince, todayISO } from "../lib/date";

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
export const cornellDaysV1: Record<DayKey, WorkoutDay> = {
  monday: pt("monday"), tuesday: lowerB, wednesday: upperB, thursday: pt("thursday"), friday: lowerA, saturday: upperA,
  sunday: { key: "sunday", dayName: "Sunday", title: "Optional · Aerobic Base", shortTitle: "Optional aerobic",
    subtitle: "15-30 min · skip freely when tired", exercises: [],
    intent: "Conversational jog/walk at RPE 3-4. Start with 15-20 min; walk before breathing becomes strained. No intervals before Monday PT.",
    cardio: [{ id: "cn-easy-aerobic", name: "Easy jog / walk", time: "15-30 min", intensity: "Easy, full-sentence conversational pace", notes: "After two comfortable weeks, add up to 5 minutes, capped at 30. Keep pace easy. Cycling is a lower-impact fallback." }],
    rules: ["No penalty for skipping this optional session.", "Feeling tired or sore? Full rest is the preferred alternative.", "A 15:50 two-mile pace is a test effort, not an easy-run target. Start controlled rather than sprinting the opening laps."] },
};
// ---------------------------------------------------------------------------
// Cornell v2 · Upper-priority layout (2 lower + 2 upper, delts/arms on leg days)
// New logs carry planVersion 2. Logs without it keep resolving to v1 above, so
// history, PRs, and XP for earlier sessions never change retroactively.
// ---------------------------------------------------------------------------
export const CORNELL_PLAN_VERSION = 4;
export const CABLE_FREE_START = "2026-10-21";
const isolationRIR = { setup: "3", growth: "1-2; 0-1", push: "1-2; 0-1" };
const compoundRIR = { setup: "3", growth: "1-2", push: "1-2" };
const steadyRIR = { setup: "3", growth: "2", push: "2" };
const coreCue = { setup: "Stop when control breaks", growth: "Stop when control breaks", push: "Stop when control breaks" };

function v2(base: Exercise, patch: Partial<Exercise>): Exercise {
  return { ...base, ...patch };
}
function v2Day(key: DayKey, title: string, shortTitle: string, minutes: string, exercises: Exercise[], intent: string): WorkoutDay {
  return { key, dayName: key[0].toUpperCase() + key.slice(1), shortTitle, title, exercises,
    subtitle: `Essential · about ${minutes} min including warm-up`, intent,
    rules: [
      "Cycle 1, week 1 only: at most 2 working sets per exercise at about 3 RIR to calibrate loads.",
      "Week 2: full sets at 2-3 RIR. Weeks 3-7: 1-2 RIR; isolation lifts may take the last set to 0-1 RIR.",
      "Week 8: half the sets (rounded up) at 3-4 RIR, then start the next block at full sets.",
      "Add reps first. After two comparable sessions at the top of the range and target RIR, add the smallest load step.",
    ] };
}
const byId = (days: Record<DayKey, WorkoutDay>, id: string) => {
  const found = Object.values(days).flatMap((day) => day.exercises).find((exercise) => exercise.id === id);
  if (!found) throw new Error(`Missing v1 exercise: ${id}`);
  return found;
};
const v1 = (id: string) => byId(cornellDaysV1, id);
const pair = (group: string, label: string, first: Exercise, second: Exercise, firstRest: string, secondRest: string): [Exercise, Exercise] => [
  { ...first, superset: `${label}A`, supersetGroup: group, supersetLabel: `Superset ${label}A / ${label}B · alternate`, rest: firstRest },
  { ...second, superset: `${label}B`, supersetGroup: group, supersetLabel: `Superset ${label}A / ${label}B · alternate`, rest: secondRest },
];

const lateralTue = v2(v1("cn-lateral-b"), { id: "cn2-lateral-tue", sets: 3, reps: "12-20", targetRIRByPhase: isolationRIR,
  notes: "Lead with the elbows, slight forward path, relaxed neck. Reps before load." });
const tricepsTue = v2(v1("cn-cable-triceps"), { id: "cn2-oh-triceps-tue", comparisonExerciseId: "cn-cable-triceps", sets: 3, targetRIRByPhase: isolationRIR,
  notes: "Rope or bar overhead, elbows forward, deep but pain-free stretch. Main triceps slot of the week." });
const lateralFri = v2(v1("cn-lateral-a"), { id: "cn2-lateral-fri", sets: 3, reps: "12-20", targetRIRByPhase: isolationRIR,
  notes: "Fourth side-delt exposure of the week. Strict reps; stop before swinging." });
const preacher = machine("cn2-preacher-curl", "Helen Newman Preacher Curl", 2, "10-15", ["biceps"],
  "Armpits snug to the pad, full controlled lowering. Different strength curve from incline curls.");
preacher.targetRIRByPhase = isolationRIR;

const lowerBv2 = v2Day("tuesday", "Lower B · Posterior + Arms", "Lower B + Arms", "65-75", [
  v2(v1("cn-rdl"), { targetRIRByPhase: steadyRIR }),
  v2(v1("cn-leg-press-b"), { targetRIRByPhase: compoundRIR }),
  v2(v1("cn-seated-curl-b"), { targetRIRByPhase: isolationRIR }),
  v2(v1("cn-leg-extension"), { targetRIRByPhase: isolationRIR }),
  ...pair("tue-4", "5", lateralTue, tricepsTue, "60-90 sec after 5B", "90 sec after 5A"),
  ...pair("tue-6", "6", v2(v1("cn-calf-b"), { targetRIRByPhase: isolationRIR }), v2(v1("cn-reverse-crunch"), { targetRIRByPhase: coreCue }), "60-90 sec after 6B", "60 sec after 6A"),
], "Legs first while fresh, then the upper-priority pair. Triceps here sit 48 h before Thursday push-ups.");

const upperBv2 = v2Day("wednesday", "Upper B · Back + Delts", "Upper B", "60-70", [
  v2(v1("cn-pulldown"), { targetRIRByPhase: compoundRIR }),
  v2(v1("cn-chest-press"), { targetRIRByPhase: steadyRIR }),
  v2(v1("cn-seated-row"), { targetRIRByPhase: compoundRIR }),
  ...pair("wed-4", "4", v2(v1("cn-lateral-b"), { targetRIRByPhase: isolationRIR }), v2(v1("cn-curl-b"), { targetRIRByPhase: isolationRIR }), "60-90 sec after 4B", "60-90 sec after 4A"),
  v2(v1("cn-rear-delt"), { sets: 3, targetRIRByPhase: isolationRIR }),
], "Back width and delts lead. Chest press stays at 2 RIR the day before Thursday push-ups.");

const lowerAv2 = v2Day("friday", "Lower A · Quads + Delts", "Lower A + Delts", "65-75", [
  v2(v1("cn-leg-press-a"), { targetRIRByPhase: compoundRIR }),
  v2(v1("cn-seated-curl-a"), { targetRIRByPhase: isolationRIR }),
  v2(v1("cn-split-squat"), { targetRIRByPhase: steadyRIR }),
  ...pair("fri-4", "4", v2(v1("cn-calf-a"), { targetRIRByPhase: isolationRIR }), v2(v1("cn-cable-crunch"), { targetRIRByPhase: compoundRIR }), "60-90 sec after 4B", "60-90 sec after 4A"),
  ...pair("fri-5", "5", lateralFri, preacher, "60-90 sec after 5B", "60-90 sec after 5A"),
], "Quads and hamstrings first. Thursday PT fatigue? Hold load. If time is short, drop the split squat before the delt pair.");

const upperAv2 = v2Day("saturday", "Upper A · Chest + Width", "Upper A", "65-75", [
  v2(v1("cn-incline-press"), { targetRIRByPhase: compoundRIR, muscleGroups: ["upper-chest", "chest", "front-delts", "triceps"] }),
  v2(v1("cn-assisted-pullup"), { targetRIRByPhase: compoundRIR }),
  v2(v1("cn-supported-row"), { targetRIRByPhase: compoundRIR }),
  v2(v1("cn-lateral-a"), { targetRIRByPhase: isolationRIR }),
  v2(v1("cn-pec-fly"), { targetRIRByPhase: isolationRIR }),
  ...pair("sat-6", "6", v2(v1("cn-cable-triceps"), { targetRIRByPhase: isolationRIR }), v2(v1("cn-incline-curl"), { targetRIRByPhase: isolationRIR }), "60-90 sec after 6B", "60-90 sec after 6A"),
], "Chest, lats and side delts. Work toward unassisted pull-ups; it is the clearest marker of back width.");

const sundayPull = (id: string, base: string, sets: number, notes: string) => v2(v1(base), { id, sets, targetRIRByPhase: { setup: "3", growth: "2", push: "2" }, notes });
const sundayV2: WorkoutDay = {
  key: "sunday", dayName: "Sunday", title: "Optional · Run or Pull + Arms", shortTitle: "Optional",
  subtitle: "Optional · pick one mode · skip freely when tired",
  intent: "Run mode builds the 2-mile aerobic base. Pull + arms mode adds upper-priority volume with no pressing, so Monday push-ups stay fresh. Choose one, or rest.",
  exercises: [
    { ...sundayPull("cn2-sun-pulldown", "cn-pulldown", 2, "Smooth reps at 2 RIR. Bonus volume, not a test."), comparisonExerciseId: "cn-pulldown" },
    { ...sundayPull("cn2-sun-row", "cn-seated-row", 2, "Controlled reach and squeeze."), comparisonExerciseId: "cn-seated-row" },
    ...pair("sun-3", "3", sundayPull("cn2-sun-lateral", "cn-lateral-b", 3, "Strict, light, pump-quality reps."), { ...sundayPull("cn2-sun-rear-delt", "cn-rear-delt", 2, "Shoulders down, smooth arc."), comparisonExerciseId: "cn-rear-delt" }, "60 sec after 3B", "60 sec after 3A"),
    sundayPull("cn2-sun-curl", "cn-curl-b", 2, "Clean curls; stop before elbows complain."),
  ],
  cardio: [{ id: "cn-easy-aerobic", name: "Easy jog / walk", time: "15-30 min", intensity: "Easy, full-sentence conversational pace", notes: "Run mode. Add up to 5 min after two comfortable weeks, capped at 30. Keep pace easy." }],
  rules: ["Optional: never required for weekly completion.", "Tired or sore? Full rest is the better choice.", "A 15:50 two-mile pace is test effort, not an easy-run pace."],
};

function ptV2(key: "monday" | "thursday"): WorkoutDay {
  return { ...cornellDaysV1[key], intent: "Follow your instructor's session. Log the run and your push-up sets so the muscle map counts that chest and triceps work." };
}

export const cornellDaysV2: Record<DayKey, WorkoutDay> = {
  monday: ptV2("monday"), tuesday: lowerBv2, wednesday: upperBv2, thursday: ptV2("thursday"), friday: lowerAv2, saturday: upperAv2, sunday: sundayV2,
};
/** The plan new logs use. */
// Release revision: preserve both earlier plans; new IDs keep prescriptions isolated.
function specialized(id: string, baseId: string, sets: number, notes?: string): Exercise {
  const source = byId(cornellDaysV2, baseId);
  return { ...source, id, sets, comparisonExerciseId: source.comparisonExerciseId,
    superset: undefined, supersetGroup: undefined, supersetLabel: undefined,
    rest: /after/.test(source.rest) ? "90 sec" : source.rest,
    notes: notes ?? source.notes };
}
export const cornellDaysV3: Record<DayKey, WorkoutDay> = {
  ...cornellDaysV2,
  tuesday: v2Day("tuesday", "Upper A · Upper Chest + Arms", "Chest + Arms", "60-70", [
    specialized("cn3-tue-incline", "cn-incline-press", 3, "Low incline, controlled depth. Keep 2 RIR after Monday push-ups; hold load if performance is down."),
    specialized("cn3-tue-lateral", "cn2-lateral-tue", 3),
    specialized("cn3-tue-fly", "cn-pec-fly", 2),
    ...pair("cn3-tue-arms", "4", specialized("cn3-tue-triceps", "cn2-oh-triceps-tue", 3), specialized("cn3-tue-curl", "cn-incline-curl", 2), "90 sec after 4B", "90 sec after 4A"),
    specialized("cn3-tue-abs", "cn-reverse-crunch", 2),
  ], "Upper-chest priority, then delts and arms. Monday PT counts toward pressing fatigue: no failure or push-up finisher."),
  wednesday: v2Day("wednesday", "Upper B · Back + Rear Delts", "Back + Delts", "60-70", [
    specialized("cn3-wed-pulldown", "cn-pulldown", 3),
    specialized("cn3-wed-row", "cn-seated-row", 3),
    specialized("cn3-wed-rear", "cn-rear-delt", 3),
    specialized("cn3-wed-lateral", "cn-lateral-b", 3),
    specialized("cn3-wed-curl", "cn-curl-b", 2),
  ], "No pressing before Thursday push-ups. Tuesday and Wednesday share delts/arms: leave 2 RIR when sore or reps fall."),
  friday: v2Day("friday", "Lower · Efficient Foundation", "Lower", "65-75", [
    specialized("cn3-fri-press", "cn-leg-press-a", 3),
    specialized("cn3-fri-rdl", "cn-rdl", 2),
    specialized("cn3-fri-curl", "cn-seated-curl-a", 3),
    specialized("cn3-fri-extension", "cn-leg-extension", 2),
    ...pair("cn3-fri-finish", "5", specialized("cn3-fri-calf", "cn-calf-a", 3), specialized("cn3-fri-abs", "cn-cable-crunch", 2), "90 sec after 5B", "90 sec after 5A"),
  ], "One focused lower session preserves quad, hinge, knee-flexion and calf work. Thursday running fatigue? Reduce load or use the ranked cuts; do not grind."),
  saturday: v2Day("saturday", "Upper C · Chest + Width", "Chest + Width", "65-75", [
    specialized("cn3-sat-incline", "cn-incline-press", 3),
    specialized("cn3-sat-pullup", "cn-assisted-pullup", 3),
    specialized("cn3-sat-row", "cn-supported-row", 2),
    specialized("cn3-sat-lateral", "cn-lateral-a", 3),
    ...pair("cn3-sat-arms", "5", specialized("cn3-sat-triceps", "cn-cable-triceps", 2), specialized("cn3-sat-curl", "cn-incline-curl", 2), "90 sec after 5B", "90 sec after 5A"),
  ], "Second upper-chest exposure plus back width. Keep the same incline and technique so history remains comparable."),
  sunday: { ...sundayV2, title: "Optional · Easy Run or Recovery", shortTitle: "Optional",
    intent: "Prefer 15-30 minutes of conversational jog/walk, or full rest. Pull + arms is only an alternative when recovered, not extra work to stack after Saturday.",
    exercises: sundayV2.exercises.map((exercise) => ({ ...exercise, id: exercise.id.replace("cn2-", "cn3-"), sets: Math.min(2, exercise.sets ?? 2) })) },
};
cornellDaysV3.tuesday.exercises[0].targetRIRByPhase = steadyRIR;
// v4 keeps every earlier prescription readable and removes external cable stations.
export const cornellV4SourceIds: Record<string, string> = {};
function cableFreeExercise(source: Exercise): Exercise {
  let base = source;
  if (source.name === "Overhead Cable Triceps Extension") {
    base = { ...legacy.find((exercise) => exercise.id === "wednesday-standing-db-overhead-triceps-extension")!,
      name: "Seated Two-Hand DB Overhead Triceps Extension", comparisonExerciseId: "seated-two-hand-db-overhead-triceps",
      canonicalExerciseId: "seated-two-hand-db-overhead-triceps", aliases: [], comparisonAliases: [],
      loadLabel: "Weight (lb, one DB total)", muscleGroups: ["triceps"],
      targetRIRByPhase: { setup: "2-3", growth: "1-2", push: "1-2" },
      notes: "Hold one DB securely with both hands. Use a stable seated position, ribs down, and a comfortable overhead stretch. Stop if elbows or shoulders hurt; do not force depth.",
      logHint: "Enter the total weight of the single DB. This is a new baseline, not comparable to cable-stack load." };
  } else if (source.name === "Helen Newman Lat Pulldown") {
    base = { ...cornellDaysV3.saturday.exercises[1], reps: "8-12",
      notes: "Use the chin/dip-assist machine with a repeatable comfortable grip. Enough assistance for controlled full reps; reduce assistance only after reps are stable. No cable-station setup." };
  } else if (source.name === "Helen Newman Seated Row") {
    base = { ...cornellDaysV3.saturday.exercises[2],
      notes: "Chest stays on the incline bench. Reach under control, then pull elbows back/down without shrugging or torso movement. Same setup as Saturday; record bench angle." };
  } else if (source.name === "Kneeling Cable Crunch") {
    base = { id: "weighted-floor-crunch", name: "DB-Loaded Floor Crunch", kind: "strength", trackingType: "weighted-reps",
      comparisonExerciseId: "db-loaded-floor-crunch", sets: 2, reps: "10-20", rest: "90 sec", target: "Abs/core",
      muscleGroups: ["abs-core"], loadLabel: "Weight (lb, one DB total)", loadRequired: true,
      rirRequired: false, effortMode: "control", effortCue: "Stop when controlled trunk flexion breaks.", prEligible: true,
      riskLevel: "low", primaryProgression: "add-reps-first", targetRIRByPhase: coreCue,
      notes: "Hold one light DB securely against the chest. Curl ribs toward pelvis; keep neck relaxed and avoid a full sit-up. Add clean reps before load. Skip if even a light DB cannot be positioned comfortably; do not force a painful setup.",
      logHint: "Enter the single DB's total weight; establish a fresh baseline. Cable-stack pounds do not transfer." };
  }
  const id = source.id.replace(/^cn3-/, "cn4-");
  cornellV4SourceIds[id] = source.id;
  return { ...base, id, sets: source.sets, rest: source.rest,
    superset: source.superset, supersetGroup: source.supersetGroup?.replace("cn3-", "cn4-"), supersetLabel: source.supersetLabel };
}
export const cornellDaysV4 = Object.fromEntries(Object.entries(cornellDaysV3).map(([key, workout]) => [key, {
  ...workout, exercises: workout.exercises.map(cableFreeExercise),
  rules: workout.exercises.length ? ["Full prescribed working sets from the first session; no two-set calibration cap.",
    "Use 2-3 RIR initially, then 1-2 RIR in build weeks. New movements need honest starting loads, not cable-weight conversions.",
    "Week 8 remains a deload: halve sets, rounded up, at 3-4 RIR.",
    "Add reps within the range first. Increase load or reduce assistance only after two comparable sessions at target effort."] : workout.rules,
}])) as Record<DayKey, WorkoutDay>;
export const cornellDays = cornellDaysV4;
export const OPTIONAL_DAY: DayKey = "sunday";
export const ROTC_DAYS: DayKey[] = ["monday", "thursday"];

const uniqueById = (list: Exercise[]) => Array.from(new Map(list.map((exercise) => [exercise.id, exercise])).values());
// v1 first so legacy IDs resolve to their original definitions; v2-only IDs are appended.
export const cornellExercises = uniqueById([
  ...Object.values(cornellDaysV1).flatMap((workout) => workout.exercises),
  ...Object.values(cornellDaysV2).flatMap((workout) => workout.exercises),
  ...Object.values(cornellDaysV3).flatMap((workout) => workout.exercises),
  ...Object.values(cornellDaysV4).flatMap((workout) => workout.exercises),
]);
export function cornellActive(date = todayISO()): boolean { return date >= CORNELL_START; }
export function daysForDate(date = todayISO()) { return cornellActive(date) ? cornellDays : legacyDays; }
export function cornellDaysForLog(log: Pick<WorkoutLog, "planVersion">): Record<DayKey, WorkoutDay> {
  return (log.planVersion ?? 1) >= 4 ? cornellDaysV4 : (log.planVersion ?? 1) === 3 ? cornellDaysV3 : (log.planVersion ?? 1) === 2 ? cornellDaysV2 : cornellDaysV1;
}
export function workoutForLog(log: Pick<WorkoutLog, "dayKey" | "programId"> & { planVersion?: number }): WorkoutDay {
  return (log.programId === CORNELL_ID ? cornellDaysForLog(log) : legacyDays)[log.dayKey];
}
export function trainingDaysForDate(date = todayISO()): DayKey[] { return cornellActive(date) ? cornellTrainingDays : legacyTrainingDays; }
/** Essential (scheduled) strength day. The optional Sunday session is strength work but not essential. */
export function isTrainingLog(log: Pick<WorkoutLog, "dayKey" | "programId"> & { planVersion?: number }): boolean {
  if (log.programId === CORNELL_ID && log.dayKey === OPTIONAL_DAY) return false;
  return workoutForLog(log).exercises.length > 0;
}
export function isOptionalStrengthLog(log: Pick<WorkoutLog, "dayKey" | "programId"> & { planVersion?: number }): boolean {
  return log.programId === CORNELL_ID && log.dayKey === OPTIONAL_DAY && workoutForLog(log).exercises.length > 0;
}
function cornellDayIndex(date: string, start = CORNELL_START): number {
  return Math.max(0, daysSince(start, date));
}
export function cornellWeek(date: string, start = CORNELL_START): number { return Math.floor(cornellDayIndex(date, start) / 7) % 8 + 1; }
export function cornellCycle(date: string, start = CORNELL_START): number { return Math.floor(cornellDayIndex(date, start) / 56) + 1; }
/** First and last date of the Cornell program week containing `date`. */
export function cornellWeekRange(date: string, start = CORNELL_START): { from: string; to: string } {
  const offset = Math.floor(cornellDayIndex(date, start) / 7) * 7;
  return { from: addDays(start, offset), to: addDays(start, offset + 6) };
}
export function isCalibrationWeek(date: string, start = CORNELL_START, planVersion = CORNELL_PLAN_VERSION): boolean {
  return planVersion < 4 && cornellCycle(date, start) === 1 && cornellWeek(date, start) === 1;
}
export function weekForLog(log: WorkoutLog): number { return log.programId === CORNELL_ID ? cornellWeek(log.date, log.programStartDate) : log.weekInCycle ?? 1; }
/**
 * Week used for effort prescriptions. v2 logs only calibrate in the first cycle;
 * week 1 of later cycles uses the week-2 ramp instead of a second easy week.
 */
export function prescriptionWeekForDate(date: string, planVersion = CORNELL_PLAN_VERSION, start = CORNELL_START): number {
  const week = cornellWeek(date, start);
  if (planVersion >= 4 && week === 1) return 2;
  if (planVersion >= 2 && week === 1 && !isCalibrationWeek(date, start, planVersion)) return 2;
  return week;
}
export function prescriptionWeekForLog(log: WorkoutLog): number {
  if (log.programId !== CORNELL_ID) return log.weekInCycle ?? 1;
  return prescriptionWeekForDate(log.date, log.planVersion ?? 1, log.programStartDate ?? CORNELL_START);
}
export function exercisesForDate(workout: WorkoutDay, date: string, planVersion = CORNELL_PLAN_VERSION): Exercise[] {
  if (!cornellActive(date)) return workout.exercises;
  const week = prescriptionWeekForDate(date, planVersion);
  return workout.exercises.map((exercise) => ({ ...exercise,
    sets: week === 1 ? Math.min(2, exercise.sets ?? 1) : week === 8 ? Math.ceil((exercise.sets ?? 1) / 2) : exercise.sets }));
}
