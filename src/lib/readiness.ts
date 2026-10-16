import { AppData, DayKey, Exercise, ExerciseFlag, ExerciseFlagKind, ExerciseFlagSeverity, ExerciseLog, WorkoutLog } from "../types";
import { workoutDays } from "../data/routine";
import { CORNELL_ID, cornellActive, cornellDays, cornellDaysV1, cornellDaysV2, daysForDate, workoutForLog } from "../data/cornell";
import {
  exerciseSessions,
  findExercise,
  nextSessionRecommendation,
  previousSessionNotes,
  totalRepsForExerciseLog,
  totalSecondsForExerciseLog,
  trackingTypeForExercise,
  validLoadValue,
} from "./progress";

export interface ShortOnTimeOption {
  exerciseId: string;
  rank: number;
  title: string;
  preferredAction: string;
  rationale: string;
  sourceRule: string;
}

// Ranked by the cost of removing the item from this specific 8-week routine,
// not by claiming that an exercise is universally ineffective. The ranking
// preserves each day's priority compounds and unique muscle work, then removes
// redundant accessory volume. It combines the routine's reduce-volume order
// with current resistance-training evidence on exercise priority, direct vs.
// indirect sets, and diminishing returns from additional weekly volume.
const shortOnTimeByDay: Partial<Record<DayKey, ShortOnTimeOption[]>> = {
  monday: [
    {
      exerciseId: "monday-low-incline-db-squeeze-press",
      rank: 1,
      title: "Low-Incline DB Squeeze Press",
      preferredAction: "First cut: skip the extra chest pump work.",
      rationale: "Upper chest already receives the day's four priority press sets and more pressing later in the week.",
      sourceRule: "Routine redundancy + weekly chest volume",
    },
    {
      exerciseId: "monday-incline-db-curl",
      rank: 2,
      title: "Incline DB Curl",
      preferredAction: "Second cut: keep the pull-ups and remove this direct curl slot.",
      rationale: "Biceps still receive pull-up work plus dedicated Wednesday and Saturday curl volume.",
      sourceRule: "Direct/indirect set overlap",
    },
    {
      exerciseId: "monday-db-lateral-raise",
      rank: 3,
      title: "DB Lateral Raise",
      preferredAction: "Third cut only when the session must be much shorter.",
      rationale: "Side delts retain dedicated work Wednesday, Friday, and Saturday, but this cut costs more because delts are a program priority.",
      sourceRule: "Weekly redundancy; higher tradeoff",
    },
  ],
  tuesday: [
    {
      exerciseId: "tuesday-incline-treadmill-walk",
      rank: 1,
      title: "Easy incline walk",
      preferredAction: "Skip the post-lifting walk if the clock is tight.",
      rationale: "The plan removes Tuesday cardio before cutting the main lower-body work.",
      sourceRule: "When To Reduce Volume · Step 4",
    },
    {
      exerciseId: "tuesday-dead-bug",
      rank: 2,
      title: "Dead Bug",
      preferredAction: "Second cut: keep the loaded lower-body work and reverse crunches.",
      rationale: "Core already has direct work Tuesday, Friday, and Saturday; this is the least costly strength-item cut today.",
      sourceRule: "Weekly core overlap",
    },
    {
      exerciseId: "tuesday-hamstring-walkout",
      rank: 3,
      title: "Hamstring Walkout",
      preferredAction: "Third cut only; keep the DB RDL as the priority hinge.",
      rationale: "The RDL supplies the main progressive hamstring work. Removing this accessory is a larger compromise than cutting cardio or one core drill.",
      sourceRule: "Primary hinge preserved; higher tradeoff",
    },
  ],
  wednesday: [
    {
      exerciseId: "wednesday-cross-body-hammer-curl",
      rank: 1,
      title: "Cross-Body Hammer Curl",
      preferredAction: "First cut: remove the extra elbow-flexor accessory.",
      rationale: "Biceps and forearms retain pull-ups, incline curls, rows, and Saturday curl work.",
      sourceRule: "Direct/indirect set overlap",
    },
    {
      exerciseId: "wednesday-standing-db-shoulder-press",
      rank: 2,
      title: "Standing DB Shoulder Press",
      preferredAction: "Second cut: preserve side- and rear-delt isolation first.",
      rationale: "Front delts and triceps already receive substantial pressing Monday and Friday; side and rear delts are the more specific goals today.",
      sourceRule: "Program goal specificity + pressing overlap",
    },
    {
      exerciseId: "wednesday-standing-db-overhead-triceps-extension",
      rank: 3,
      title: "Standing DB Overhead Triceps Extension",
      preferredAction: "Third cut only after the two more redundant slots.",
      rationale: "Triceps retain press, dip, and extension work elsewhere, but this movement adds unique long-head emphasis, so the tradeoff is higher.",
      sourceRule: "Weekly triceps overlap; higher tradeoff",
    },
  ],
  friday: [
    {
      exerciseId: "friday-db-pullover",
      rank: 1,
      title: "DB Pullover",
      preferredAction: "First cut: keep the pull-up and row as the priority back work.",
      rationale: "This accessory overlaps lats/chest already trained by the day's main lifts and is named in the plan's later reduction step.",
      sourceRule: "When To Reduce Volume · Step 5",
    },
    {
      exerciseId: "friday-assisted-dip-chest-triceps-bias",
      rank: 2,
      title: "Assisted Dip",
      preferredAction: "Second cut: preserve the flat press, pull-up, and row.",
      rationale: "Chest and triceps retain flat pressing and extensions; the plan also names dip volume as reducible.",
      sourceRule: "When To Reduce Volume · Step 5",
    },
    {
      exerciseId: "friday-rkc-plank",
      rank: 3,
      title: "RKC Plank",
      preferredAction: "Third cut only if the main upper-body session is already complete.",
      rationale: "Core retains Tuesday and Saturday work. This preserves every progressive Friday press and pull before removing more lifting.",
      sourceRule: "Weekly core overlap; higher tradeoff",
    },
  ],
  saturday: [
    {
      exerciseId: "saturday-feet-elevated-push-up-or-db-squeeze-press",
      rank: 1,
      title: "Feet-Elevated Push-Up",
      preferredAction: "First full exercise to skip when recovery or time is limited.",
      rationale: "This is the plan's first named volume reduction.",
      sourceRule: "When To Reduce Volume · Step 1",
    },
    {
      exerciseId: "saturday-hammer-curl",
      rank: 2,
      title: "Hammer Curl",
      preferredAction: "Second full-exercise cut after the push-up slot.",
      rationale: "The plan reduces Saturday biceps volume early, and elbow flexors already receive substantial weekly direct and pulling work.",
      sourceRule: "When To Reduce Volume · Step 3",
    },
    {
      exerciseId: "saturday-hollow-body-hold",
      rank: 3,
      title: "Hollow Body Hold",
      preferredAction: "Third cut: keep the specialization lifts and remove the redundant core finisher.",
      rationale: "Core retains Tuesday and Friday work. The lateral-raise mechanical set stays because the plan says to remove partials before removing strict delt work.",
      sourceRule: "Weekly core overlap; strict delt work preserved",
    },
  ],
};

export function shortOnTimeGuidance(dayKey: DayKey, programId?: string, planVersion = 3): ShortOnTimeOption[] {
  if (programId === CORNELL_ID) {
    if (planVersion >= 3) {
      const cuts: Partial<Record<DayKey, Array<[string, string]>>> = {
        tuesday: [["cn3-tue-abs", "Friday abs and ROTC remain; this costs direct ab work."], ["cn3-tue-curl", "Wednesday and Saturday curls remain."], ["cn3-tue-fly", "Both weekly incline-press slots remain; upper chest and delts stay protected."]],
        wednesday: [["cn3-wed-curl", "Two other direct curl slots remain."], ["cn3-wed-lateral", "Tuesday and Saturday side-delt slots remain."], ["cn3-wed-rear", "Rows provide indirect rear-delt work, but this removes the direct slot."]],
        friday: [["cn3-fri-abs", "Tuesday abs and ROTC remain."], ["cn3-fri-extension", "Leg press preserves quad work; this reduces the already modest leg dose."], ["cn3-fri-calf", "Higher-tradeoff cut: this is the only direct calf slot. Keep it whenever possible."]],
        saturday: [["cn3-sat-curl", "Tuesday and Wednesday curls remain."], ["cn3-sat-triceps", "Tuesday direct work and presses remain."], ["cn3-sat-row", "Wednesday rows remain; keep incline press and pull-ups for the main priorities."]],
      };
      return (cuts[dayKey] ?? []).map(([id, rationale], index) => ({ exerciseId: id, rank: index + 1,
        title: cornellDays[dayKey].exercises.find((exercise) => exercise.id === id)!.name,
        preferredAction: `Optional cut #${index + 1}; never automatic.`, rationale,
        sourceRule: "Upper-priority weekly overlap and fatigue tradeoff" }));
    }
    const choices: Partial<Record<DayKey, Array<[string, string]>>> = {
      friday: [["cn-split-squat", "Leg press preserves the main quad/glute work; this removes the extra unilateral slot."], ["cn-cable-crunch", "Core still has Tuesday work and ROTC. This reduces direct ab-hypertrophy work."], ["cn2-preacher-curl", "Three other curl slots remain this week; side-delt work stays protected."]],
      saturday: [["cn-incline-curl", "Pulling and Wednesday curls remain."], ["cn-cable-triceps", "Pressing and ROTC still train triceps; this costs the week's direct long-head work."], ["cn-pec-fly", "Both priority presses remain. This reduces chest-specific weekly volume."]],
      tuesday: [["cn-leg-extension", "Leg press and Friday split squats retain quad work."], ["cn-reverse-crunch", "Friday direct abs and ROTC remain."], ["cn-calf-b", "Friday calves remain; a higher-tradeoff cut."]],
      wednesday: [["cn-curl-b", "Saturday curls and all pulling remain."], ["cn-rear-delt", "Rows retain some rear-delt stimulus, but this removes direct work."], ["cn-seated-row", "Saturday rowing remains. Keep the pulldown for back width."]],
    };
    return (choices[dayKey] ?? []).map(([id, rationale], index) => ({ exerciseId: id, rank: index + 1,
      title: (cornellDaysV2[dayKey].exercises.find((exercise) => exercise.id === id) ?? cornellDaysV1[dayKey].exercises.find((exercise) => exercise.id === id))?.name ?? id,
      preferredAction: `Optional cut #${index + 1}; never automatic.`, rationale,
      sourceRule: "Cornell weekly coverage and fatigue tradeoff, not an exercise-effectiveness ranking" }));
  }
  return (shortOnTimeByDay[dayKey] ?? []).slice(0, 3);
}

export interface ExerciseFlagPattern {
  exerciseId: string;
  exerciseName: string;
  kind: ExerciseFlagKind;
  area?: string;
  severity: ExerciseFlagSeverity;
  sessionCount: number;
  latestDate: string;
  summary: string;
  action: string;
}

const severityOrder: Record<ExerciseFlagSeverity, number> = { notice: 1, limit: 2, stop: 3 };

function explicitLegacyFlags(exerciseLog: ExerciseLog, workoutDate: string): ExerciseFlag[] {
  const text = [exerciseLog.notes, ...exerciseLog.sets.map((set) => set.notes)].filter(Boolean).join(" ");
  if (!text) return [];
  const flags: ExerciseFlag[] = [];
  const jointMatch = text.match(/\b(shoulder|elbow|wrist|lower back|low back|hip|knee|ankle)\b.{0,32}\b(pain|hurt|ache|pinch|irritat(?:ed|ion)|discomfort)\b|\b(pain|hurt|ache|pinch|irritat(?:ed|ion)|discomfort)\b.{0,32}\b(shoulder|elbow|wrist|lower back|low back|hip|knee|ankle)\b/i);
  if (jointMatch) {
    const area = (jointMatch[1] ?? jointMatch[4] ?? "joint").toLowerCase();
    flags.push({
      id: `legacy-joint-${workoutDate}-${exerciseLog.id}`,
      kind: "joint-discomfort",
      area,
      severity: /sharp|stop|worsen/i.test(text) ? "stop" : "limit",
      note: "Explicitly recorded in prior notes.",
      createdAt: `${workoutDate}T12:00:00.000Z`,
    });
  }
  if (/form (?:broke|breakdown)|lost (?:position|form)|technique broke|round(?:ed|ing)|sloppy reps?/i.test(text)) {
    flags.push({
      id: `legacy-form-${workoutDate}-${exerciseLog.id}`,
      kind: "form-breakdown",
      severity: /stopped|stop|repeated/i.test(text) ? "limit" : "notice",
      note: "Explicitly recorded in prior notes.",
      createdAt: `${workoutDate}T12:00:00.000Z`,
    });
  }
  return flags;
}

function exerciseFlags(exerciseLog: ExerciseLog, workoutDate: string): ExerciseFlag[] {
  return [...(exerciseLog.flags ?? []), ...explicitLegacyFlags(exerciseLog, workoutDate)];
}

export function buildExerciseFlagPatterns(
  logs: WorkoutLog[],
  currentDate: string,
  dayKey?: DayKey,
): ExerciseFlagPattern[] {
  const plannedIds = dayKey ? new Set(daysForDate(currentDate)[dayKey].exercises.map((exercise) => exercise.id)) : null;
  const grouped = new Map<string, { exerciseId: string; kind: ExerciseFlagKind; area?: string; flags: Array<{ flag: ExerciseFlag; date: string }> }>();

  logs
    .filter((workout) => workout.status === "completed" && workout.date < currentDate)
    .forEach((workout) => workout.exerciseLogs.forEach((entry) => {
      if (entry.skipped || (plannedIds && !plannedIds.has(entry.exerciseId))) return;
      exerciseFlags(entry, workout.date).forEach((flag) => {
        const key = `${entry.exerciseId}:${flag.kind}:${flag.area ?? ""}`;
        const group = grouped.get(key) ?? { exerciseId: entry.exerciseId, kind: flag.kind, area: flag.area, flags: [] };
        group.flags.push({ flag, date: workout.date });
        grouped.set(key, group);
      });
    }));

  return [...grouped.values()].map((group) => {
    const uniqueDates = [...new Set(group.flags.map((item) => item.date))].sort();
    const severity = group.flags.reduce<ExerciseFlagSeverity>((highest, item) => (
      severityOrder[item.flag.severity] > severityOrder[highest] ? item.flag.severity : highest
    ), "notice");
    const exerciseName = findExercise(group.exerciseId)?.name ?? "Exercise";
    const label = group.kind === "joint-discomfort" ? `${group.area ?? "Joint"} discomfort` : "Form breakdown";
    return {
      exerciseId: group.exerciseId,
      exerciseName,
      kind: group.kind,
      area: group.area,
      severity,
      sessionCount: uniqueDates.length,
      latestDate: uniqueDates.at(-1)!,
      summary: `${label} was flagged in ${uniqueDates.length} session${uniqueDates.length === 1 ? "" : "s"}.`,
      action: group.kind === "joint-discomfort"
        ? "Do not progress load. Use the plan's range/load adjustment or configured replacement, and stop for sharp or worsening pain."
        : "Hold load and keep the planned sets only while clean form is repeatable.",
    };
  }).sort((a, b) => b.sessionCount - a.sessionCount || b.latestDate.localeCompare(a.latestDate));
}

export type DeloadStatus = "insufficient" | "clear" | "watch" | "deload";
export type DeloadSignalKind = "performance-drop" | "joint-discomfort" | "warmup-heavy" | "soreness" | "sleep" | "appetite" | "motivation";

export interface DeloadSignal {
  kind: DeloadSignalKind;
  summary: string;
  evidence: string;
}

export interface DeloadAssessment {
  status: DeloadStatus;
  title: string;
  summary: string;
  recommendation: string;
  signals: DeloadSignal[];
}

function completedExerciseSets(entry: ExerciseLog, exercise: Exercise) {
  const sets = entry.sets.filter((set) => set.completed);
  return sets.length === (exercise.sets ?? 0) ? sets : [];
}

function comparableSignature(entry: ExerciseLog, exercise: Exercise): string {
  const sets = completedExerciseSets(entry, exercise);
  if (!sets.length) return "";
  const trackingType = trackingTypeForExercise(exercise);
  if (trackingType === "weighted-reps" || trackingType === "assistance-reps") {
    return `${trackingType}:${sets.map((set) => validLoadValue(set.weight).toFixed(2)).join("|")}`;
  }
  return `${trackingType}:${sets.length}`;
}

function performanceValue(entry: ExerciseLog, exercise: Exercise): number {
  return trackingTypeForExercise(exercise) === "timed"
    ? totalSecondsForExerciseLog(entry)
    : totalRepsForExerciseLog(entry, exercise);
}

function repeatedPerformanceDrop(logs: WorkoutLog[], currentDate: string): DeloadSignal | null {
  const exerciseIds = new Set(logs.flatMap((workout) => workout.exerciseLogs.map((entry) => entry.exerciseId)));
  for (const exerciseId of exerciseIds) {
    const exercise = findExercise(exerciseId);
    if (!exercise || trackingTypeForExercise(exercise) === "cardio") continue;
    const sessions = exerciseSessions(logs, exercise)
      .filter((session) => session.workout.date < currentDate)
      .slice(-3);
    if (sessions.length < 3) continue;
    const signatures = sessions.map((session) => comparableSignature(session.exerciseLog, exercise));
    if (!signatures[0] || new Set(signatures).size !== 1) continue;
    const values = sessions.map((session) => performanceValue(session.exerciseLog, exercise));
    if (values.some((value) => value <= 0)) continue;
    const firstDrop = values[1] <= values[0] * 0.95;
    const secondDrop = values[2] <= values[1] * 0.95;
    if (firstDrop && secondDrop) {
      return {
        kind: "performance-drop",
        summary: `${exercise.name} declined across two consecutive comparable repeats.`,
        evidence: `Same setup compared on ${sessions.map((session) => session.workout.date).join(", ")}.`,
      };
    }
  }
  return null;
}

const recoveryNoteRules: Array<{ kind: Exclude<DeloadSignalKind, "performance-drop" | "joint-discomfort">; pattern: RegExp; summary: string }> = [
  { kind: "warmup-heavy", pattern: /warm-?ups? (?:felt|were|was) (?:unusually )?heavy/i, summary: "Warm-ups were explicitly logged as unusually heavy more than once." },
  { kind: "soreness", pattern: /soreness (?:did not|didn't|hasn'?t) (?:clear|gone)|still sore/i, summary: "Uncleared soreness was explicitly logged more than once." },
  { kind: "sleep", pattern: /sleep (?:got|was|is) worse|bad sleep|sleeping worse/i, summary: "Worsening sleep was explicitly logged more than once." },
  { kind: "appetite", pattern: /appetite (?:dropped|down|low)|no appetite/i, summary: "A marked appetite drop was explicitly logged more than once." },
  { kind: "motivation", pattern: /motivation (?:crashed|down|low)|no motivation/i, summary: "A motivation crash was explicitly logged more than once." },
];

function recoveryNoteSignals(logs: WorkoutLog[], currentDate: string): DeloadSignal[] {
  const recent = logs.filter((workout) => workout.status === "completed" && workout.date < currentDate).slice(-8);
  return recoveryNoteRules.flatMap((rule) => {
    const dates = recent.filter((workout) => {
      const text = [
        workout.notes,
        ...workout.exerciseLogs.flatMap((entry) => [entry.notes, ...entry.sets.map((set) => set.notes)]),
      ].filter(Boolean).join(" ");
      return rule.pattern.test(text);
    }).map((workout) => workout.date);
    return dates.length >= 2 ? [{ kind: rule.kind, summary: rule.summary, evidence: `Explicit notes on ${dates.slice(-2).join(" and ")}.` }] : [];
  });
}

export function assessDeloadNeed(logs: WorkoutLog[], currentDate: string): DeloadAssessment {
  const completed = logs.filter((workout) => workout.status === "completed" && workout.date < currentDate);
  if (completed.length < 3) {
    return {
      status: "insufficient",
      title: "Not enough deload evidence",
      summary: "The app needs at least three completed sessions and supported recovery signals before calling a pattern.",
      recommendation: "Follow the normal plan and keep logging objective performance and any real recovery issues.",
      signals: [],
    };
  }

  const signals: DeloadSignal[] = [];
  const performance = repeatedPerformanceDrop(completed, currentDate);
  if (performance) signals.push(performance);
  const repeatedJoint = buildExerciseFlagPatterns(completed, currentDate).find((pattern) => pattern.kind === "joint-discomfort" && pattern.sessionCount >= 2);
  if (repeatedJoint) {
    signals.push({
      kind: "joint-discomfort",
      summary: `${repeatedJoint.exerciseName}: ${repeatedJoint.summary}`,
      evidence: `Most recent explicit flag: ${repeatedJoint.latestDate}.`,
    });
  }
  signals.push(...recoveryNoteSignals(completed, currentDate));

  if (signals.length >= 2) {
    return {
      status: "deload",
      title: "Plan-aligned deload signal",
      summary: `${signals.length} separate routine-defined recovery signals are present. This is guidance, not a diagnosis.`,
      recommendation: "For the deload, keep the same exercises, cut all sets in half, stay around RIR 3, use no failure, and keep cardio easy.",
      signals,
    };
  }
  if (signals.length === 1) {
    return {
      status: "watch",
      title: "One recovery signal to watch",
      summary: "One supported signal is present, but the routine calls for two or more before reducing volume broadly.",
      recommendation: "Hold progression, keep execution clean, and log whether a second plan-defined signal appears.",
      signals,
    };
  }
  return {
    status: "clear",
    title: "No deload pattern confirmed",
    summary: "Recent logs do not show two routine-defined recovery signals.",
    recommendation: "Continue the plan. This does not override how you feel today or any sharp/worsening pain.",
    signals: [],
  };
}

export interface WorkoutBriefingTip {
  exerciseId?: string;
  title: string;
  detail: string;
  evidence: string;
  tone: "neutral" | "progress" | "hold" | "warning";
}

export interface NextWorkoutBriefing {
  dayKey: DayKey;
  deload: DeloadAssessment;
  flagPatterns: ExerciseFlagPattern[];
  shortOnTime: ShortOnTimeOption[];
  tips: WorkoutBriefingTip[];
}

function excerpt(value: string, maxLength = 120): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > maxLength ? `${compact.slice(0, maxLength - 1)}…` : compact;
}

export function buildNextWorkoutBriefing(data: AppData, currentDate: string, dayKey: DayKey): NextWorkoutBriefing {
  const activeLog = data.workoutLogs.find((log) => log.date === currentDate && log.dayKey === dayKey);
  const workout = activeLog ? workoutForLog(activeLog) : daysForDate(currentDate)[dayKey];
  const programId = activeLog ? activeLog.programId : cornellActive(currentDate) ? CORNELL_ID : undefined;
  const deload = assessDeloadNeed(data.workoutLogs.filter((log) => log.programId === programId), currentDate);
  const flagPatterns = buildExerciseFlagPatterns(data.workoutLogs, currentDate, dayKey);
  const tips: WorkoutBriefingTip[] = flagPatterns.slice(0, 2).map((pattern) => ({
    exerciseId: pattern.exerciseId,
    title: `${pattern.exerciseName}: ${pattern.kind === "joint-discomfort" ? "joint flag" : "form flag"}`,
    detail: pattern.action,
    evidence: `${pattern.summary} Latest: ${pattern.latestDate}.`,
    tone: pattern.severity === "stop" ? "warning" : "hold",
  }));

  const comparisons = workout.exercises.map((exercise) => {
    const recommendation = nextSessionRecommendation(data.workoutLogs, currentDate, exercise);
    const previous = exerciseSessions(data.workoutLogs, exercise).filter((session) => session.workout.date < currentDate).at(-1);
    const notes = previous ? previousSessionNotes(previous.exerciseLog, previous.workout) : [];
    return { exercise, recommendation, previous, notes };
  });
  const confirmed = comparisons.filter((item) => item.recommendation.kind !== "insufficient");
  const candidates = confirmed.length ? confirmed : comparisons.slice(0, 1);
  for (const item of candidates) {
    if (tips.length >= 3) break;
    const noteContext = item.notes.length ? ` Previous note: ${excerpt(item.notes[0])}` : "";
    tips.push({
      exerciseId: item.exercise.id,
      title: `${item.exercise.name}: ${item.recommendation.title}`,
      detail: `${item.recommendation.detail}${noteContext}`,
      evidence: item.recommendation.evidence,
      tone: item.recommendation.kind === "add-load" || item.recommendation.kind === "add-rep" || item.recommendation.kind === "add-time" || item.recommendation.kind === "reduce-assistance"
        ? "progress"
        : item.recommendation.kind === "hold" ? "hold" : "neutral",
    });
  }

  if (!workout.exercises.length) {
    tips.push({
      title: workout.title,
      detail: workout.intent ?? "Use the planned rest or easy-walk option. Do not add lifting to manufacture progress.",
      evidence: "Follow the day's plan; this is not an extra strength session.",
      tone: "neutral",
    });
  }

  return {
    dayKey,
    deload,
    flagPatterns,
    shortOnTime: shortOnTimeGuidance(dayKey, programId, activeLog?.planVersion ?? (activeLog ? 1 : 3)),
    tips: tips.slice(0, 3),
  };
}
