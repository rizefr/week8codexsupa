import { AppData, DayKey, Exercise, ExerciseFlag, ExerciseFlagKind, ExerciseFlagSeverity, ExerciseLog, WorkoutLog } from "../types";
import { workoutDays } from "../data/routine";
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
  title: string;
  preferredAction: string;
  rationale: string;
  sourceRule: string;
}

// These entries are a direct UI interpretation of the routine's existing
// "When To Reduce Volume" table. Main lifts are intentionally absent.
const shortOnTimeByDay: Partial<Record<DayKey, ShortOnTimeOption[]>> = {
  tuesday: [
    {
      exerciseId: "tuesday-incline-treadmill-walk",
      title: "Easy incline walk",
      preferredAction: "Skip the post-lifting walk if the clock is tight.",
      rationale: "The plan removes Tuesday cardio before cutting the main lower-body work.",
      sourceRule: "When To Reduce Volume · Step 4",
    },
  ],
  friday: [
    {
      exerciseId: "friday-assisted-dip-chest-triceps-bias",
      title: "Assisted Dip",
      preferredAction: "Trim one set first; skip only if the session still must end.",
      rationale: "Keep the flat press, pull-up, and row. The plan reduces dip/pullover volume later in the cut order.",
      sourceRule: "When To Reduce Volume · Step 5",
    },
    {
      exerciseId: "friday-db-pullover",
      title: "DB Pullover",
      preferredAction: "Trim one set first; skip only if the session still must end.",
      rationale: "This is lower priority than Friday's main press, pull-up, and row work.",
      sourceRule: "When To Reduce Volume · Step 5",
    },
  ],
  saturday: [
    {
      exerciseId: "saturday-feet-elevated-push-up-or-db-squeeze-press",
      title: "Feet-Elevated Push-Up",
      preferredAction: "First full exercise to skip when recovery or time is limited.",
      rationale: "This is the plan's first named volume reduction.",
      sourceRule: "When To Reduce Volume · Step 1",
    },
    {
      exerciseId: "saturday-db-lateral-raise-mechanical-set",
      title: "Lateral Raise Mechanical Set",
      preferredAction: "Drop partials first; skip the full movement only if necessary.",
      rationale: "The plan preserves strict reps before removing the mechanical-set partials.",
      sourceRule: "When To Reduce Volume · Step 2",
    },
    {
      exerciseId: "saturday-hammer-curl",
      title: "Hammer Curl",
      preferredAction: "Trim one set first; skip only after the earlier Saturday cuts.",
      rationale: "The plan reduces one Saturday biceps set before changing main workouts.",
      sourceRule: "When To Reduce Volume · Step 3",
    },
  ],
};

export function shortOnTimeGuidance(dayKey: DayKey): ShortOnTimeOption[] {
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
  const plannedIds = dayKey ? new Set(workoutDays[dayKey].exercises.map((exercise) => exercise.id)) : null;
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
  const workout = workoutDays[dayKey];
  const deload = assessDeloadNeed(data.workoutLogs, currentDate);
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
      evidence: item.recommendation.kind === "insufficient"
        ? "No confirmed comparable evidence from a prior session."
        : item.recommendation.evidence,
      tone: item.recommendation.kind === "add-load" || item.recommendation.kind === "add-rep" || item.recommendation.kind === "add-time" || item.recommendation.kind === "reduce-assistance"
        ? "progress"
        : item.recommendation.kind === "hold" ? "hold" : "neutral",
    });
  }

  if (!workout.exercises.length) {
    tips.push({
      title: "Recovery day",
      detail: "Use the planned rest or easy-walk option. Do not add lifting to manufacture progress.",
      evidence: "Today is a scheduled recovery day.",
      tone: "neutral",
    });
  }

  return {
    dayKey,
    deload,
    flagPatterns,
    shortOnTime: shortOnTimeGuidance(dayKey),
    tips: tips.slice(0, 3),
  };
}
