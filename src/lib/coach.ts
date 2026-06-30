import { AppData, BodyWeightLog, Exercise, ExerciseLog, MuscleGroup, ReplacementOption, SetLog, WorkoutLog } from "../types";
import { trainingDayKeys } from "../data/routine";
import { warmupCompletionSummary } from "../data/warmups";
import { getCycleInfo, todayISO } from "./date";
import {
  bestAssistance,
  bestTimedSet,
  canonicalExerciseKey,
  completedSetCount,
  completedWorkoutsThisWeek,
  effectiveProgramStartDate,
  exerciseAliasLabel,
  exerciseDisplayName,
  exerciseSessions,
  exerciseVolume,
  findExercise,
  isTrainingDay,
  numericValue,
  previousExercisePerformance,
  progressionAdvice,
  repsForSet,
  rirRequiredForExercise,
  targetRIRForExercise,
  topRepTarget,
  totalRepsForExerciseLog,
  trackingTypeForExercise,
  validLoadValue,
  validRirValue,
  workoutVolume,
} from "./progress";
import { calculateMuscleProgress, weeklyMuscleFocus } from "./muscles";
import { detectPRs, loggingQualityForWorkout, type GamificationSummary, type PRRecord } from "./gamification";

export type CoachTone = "win" | "focus" | "hold" | "recovery" | "discipline";

export interface CoachInsight {
  title: string;
  detail: string;
  tone: CoachTone;
}

export interface ExerciseCoachFeedback {
  exerciseName: string;
  insights: CoachInsight[];
}

export interface WorkoutCoachSummary {
  wins: CoachInsight[];
  nextFocus: CoachInsight;
  exerciseNotes: ExerciseCoachFeedback[];
  lockInReasons: string[];
  disciplineCue: string;
  bodyParts: MuscleGroup[];
}

export interface DashboardCoachSummary {
  recentWin: string;
  weeklyCue: string;
  nextBadge: string;
  disciplineCue: string;
  lockInReasons: string[];
}

export interface ExerciseHelpContent {
  title: string;
  subtitle?: string;
  alias?: string;
  faqs: Array<{ question: string; answer: string }>;
  replacements: ReplacementOption[];
}

export interface BodyCompositionSummary {
  latest?: BodyWeightLog;
  latestBodyFat?: BodyWeightLog;
  leanMass?: number;
  fatMass?: number;
  bodyFatTrend?: number;
  note: string;
}

function clampList<T>(items: T[], limit: number): T[] {
  return items.slice(0, limit);
}

function completedSets(log: ExerciseLog): SetLog[] {
  return log.sets.filter((set) => set.completed);
}

function setRepsForAdvice(set: SetLog, exercise: Exercise): number {
  if (exercise.unilateral) {
    const left = numericValue(set.leftReps);
    const right = numericValue(set.rightReps);
    return left > 0 && right > 0 ? Math.min(left, right) : Math.max(left, right);
  }
  return repsForSet(set, exercise);
}

function averageRir(sets: SetLog[]): number | null {
  const values = sets.map((set) => (validRirValue(set.rir) ? numericValue(set.rir) : null)).filter((value): value is number => value !== null);
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function isCompoundLike(exercise: Exercise): boolean {
  return /press|bench|pull-up|dip|row|squat|deadlift|rdl|split squat|pullover/i.test(exercise.name);
}

function movementSpecificInsight(exerciseLog: ExerciseLog, exercise: Exercise): CoachInsight | null {
  const key = canonicalExerciseKey(exercise);
  const trackingType = trackingTypeForExercise(exercise);
  const text = `${exerciseLog.notes ?? ""} ${exerciseLog.sets.map((set) => set.notes ?? "").join(" ")}`;

  if (key === "db-romanian-deadlift") {
    if (/lower back|back hurt|back pain|grip|forearm/i.test(text)) {
      return {
        title: "RDL: hold steady",
        detail: "If grip or low back is limiting, keep load fixed, shorten range if needed, and make the hinge cleaner before adding weight.",
        tone: "recovery",
      };
    }
    return {
      title: "RDL progression",
      detail: "Add reps first. Do not chase failure; hamstring stretch and back position matter more than load.",
      tone: "focus",
    };
  }

  if (trackingType === "assistance-reps") {
    return {
      title: "Assistance logic",
      detail: "Treat assistance as support, not load. Reduce assistance only after reps stay stable or improve.",
      tone: "focus",
    };
  }

  if (key === "db-lateral-raise" || key === "db-lateral-raise-mechanical") {
    return {
      title: "Lateral raise rule",
      detail: "Add reps before load. Keep traps quiet and stop the set when shoulder path gets sloppy.",
      tone: "focus",
    };
  }

  if (trackingType === "bodyweight-reps") {
    return {
      title: "Bodyweight progression",
      detail: "Progress with cleaner reps and control. Do not add load or extra sets.",
      tone: "focus",
    };
  }

  if (trackingType === "timed") {
    return {
      title: "Core progression",
      detail: "Add seconds only while ribs, pelvis, and breathing stay controlled.",
      tone: "focus",
    };
  }

  return null;
}

function sameLoadImprovement(current: ExerciseLog, previous: ExerciseLog, exercise: Exercise): number {
  const currentLoads = completedSets(current).map((set) => validLoadValue(set.weight)).filter(Boolean);
  const previousLoads = completedSets(previous).map((set) => validLoadValue(set.weight)).filter(Boolean);
  if (!currentLoads.length || !previousLoads.length) return 0;
  const currentLoad = Math.max(...currentLoads);
  const previousLoad = Math.max(...previousLoads);
  if (currentLoad !== previousLoad) return 0;
  return totalRepsForExerciseLog(current, exercise) - totalRepsForExerciseLog(previous, exercise);
}

function setDropMessage(sets: SetLog[], exercise: Exercise): CoachInsight | null {
  if (sets.length < 3 || trackingTypeForExercise(exercise) === "timed") return null;
  const first = setRepsForAdvice(sets[0], exercise);
  const last = setRepsForAdvice(sets[sets.length - 1], exercise);
  if (first > 0 && last > 0 && (first - last >= 4 || last <= first * 0.65)) {
    return {
      title: "Reps fell off late",
      detail: "Keep the load steady and use the full rest window before chasing more reps.",
      tone: "hold",
    };
  }
  return null;
}

function rirMessage(sets: SetLog[], exercise: Exercise, weekInCycle?: number): CoachInsight | null {
  if (!rirRequiredForExercise(exercise)) return null;
  const avg = averageRir(sets);
  if (avg === null) return null;
  const target = targetRIRForExercise(exercise, weekInCycle);
  if (/setup/i.test(target)) return null;
  if (avg >= 4) {
    return {
      title: "Effort was conservative",
      detail: "Next time, aim 1-2 clean reps closer while keeping the same form standard.",
      tone: "focus",
    };
  }
  if (avg <= 0.25 && isCompoundLike(exercise)) {
    return {
      title: "Keep compounds clean",
      detail: "This is close to failure. Hold the line on range, tempo, and joint comfort.",
      tone: "recovery",
    };
  }
  return null;
}

function topRangeMessage(sets: SetLog[], exercise: Exercise): CoachInsight | null {
  const top = topRepTarget(exercise.reps);
  if (!top || sets.length !== (exercise.sets ?? 0)) return null;
  const hitTop = sets.every((set) => setRepsForAdvice(set, exercise) >= top);
  if (!hitTop) return null;
  const trackingType = trackingTypeForExercise(exercise);
  if (trackingType === "assistance-reps") {
    return {
      title: "Top range hit",
      detail: "Reduce assistance next time only if reps stay stable and the pull stays clean.",
      tone: "win",
    };
  }
  if (trackingType === "weighted-reps") {
    return {
      title: "Top range hit",
      detail: "Add load next time only if form, joints, sleep, and range of motion stayed solid.",
      tone: "win",
    };
  }
  return {
    title: "Rep target reached",
    detail: "Make the reps cleaner before changing the variation. No extra volume needed.",
    tone: "win",
  };
}

function comparisonMessage(current: ExerciseLog, workout: WorkoutLog, data: AppData, exercise: Exercise): CoachInsight | null {
  const previous = previousExercisePerformance(data.workoutLogs, workout.date, exercise);
  if (!previous) {
    return {
      title: "Baseline logged",
      detail: "This gives the app a real comparison point for the next repeat session.",
      tone: "focus",
    };
  }

  const trackingType = trackingTypeForExercise(exercise);
  if (trackingType === "assistance-reps") {
    const currentAssist = bestAssistance(current);
    const previousAssist = bestAssistance(previous.exerciseLog);
    const repDelta = totalRepsForExerciseLog(current, exercise) - totalRepsForExerciseLog(previous.exerciseLog, exercise);
    if (currentAssist > 0 && previousAssist > 0 && currentAssist < previousAssist && repDelta >= 0) {
      return { title: "Assistance improved", detail: "Less assistance with reps maintained is the right pull-up/dip progression.", tone: "win" };
    }
    if (repDelta > 0 && currentAssist === previousAssist) {
      return { title: "More reps at same assistance", detail: `You added ${repDelta} total reps. Keep assistance steady until the range is stable.`, tone: "win" };
    }
    return null;
  }

  if (trackingType === "timed") {
    const delta = bestTimedSet(current) - bestTimedSet(previous.exerciseLog);
    if (delta > 0) return { title: "Hold improved", detail: `Best hold increased by ${delta} seconds with the same control standard.`, tone: "win" };
    return null;
  }

  if (trackingType === "weighted-reps") {
    const repDelta = sameLoadImprovement(current, previous.exerciseLog, exercise);
    if (repDelta > 0) {
      return { title: "Same load, more reps", detail: `${exercise.name} improved by ${repDelta} total reps at the same load.`, tone: "win" };
    }
    const volumeDelta = exerciseVolume(current) - exerciseVolume(previous.exerciseLog);
    if (volumeDelta > 0) {
      return { title: "Session volume up", detail: `${Math.round(volumeDelta).toLocaleString()} more logged volume than last time.`, tone: "win" };
    }
    return null;
  }

  const repDelta = totalRepsForExerciseLog(current, exercise) - totalRepsForExerciseLog(previous.exerciseLog, exercise);
  if (repDelta > 0) return { title: "Reps up", detail: `${exercise.name} improved by ${repDelta} total reps.`, tone: "win" };
  return null;
}

export function buildExerciseFeedback(exerciseLog: ExerciseLog, workout: WorkoutLog, data: AppData): ExerciseCoachFeedback | null {
  const exercise = findExercise(exerciseLog.exerciseId);
  if (!exercise) return null;
  const sets = completedSets(exerciseLog);
  if (!sets.length) return null;
  const insights = [
    comparisonMessage(exerciseLog, workout, data, exercise),
    topRangeMessage(sets, exercise),
    setDropMessage(sets, exercise),
    rirMessage(sets, exercise, workout.weekInCycle),
    movementSpecificInsight(exerciseLog, exercise),
  ].filter((item): item is CoachInsight => Boolean(item));

  if (!insights.length) {
    insights.push({
      title: "Execution logged",
      detail: progressionAdvice(exerciseLog),
      tone: "focus",
    });
  }

  return {
    exerciseName: exerciseDisplayName(exercise, exerciseLog),
    insights: clampList(insights, 2),
  };
}

export function buildExerciseHelp(exercise?: Exercise): ExerciseHelpContent | null {
  if (!exercise) return null;
  const trackingType = trackingTypeForExercise(exercise);
  const key = canonicalExerciseKey(exercise);
  const alias = exerciseAliasLabel(exercise);
  const faqs: ExerciseHelpContent["faqs"] = [];

  if (key === "db-romanian-deadlift") {
    faqs.push(
      {
        question: "Lower back hurts during RDL?",
        answer: "Stop for sharp pain. Otherwise reduce load, shorten range, brace harder, keep DBs close, and hinge from the hips instead of squatting it.",
      },
      {
        question: "Grip gives out before hamstrings?",
        answer: "Hold load steady, slow the eccentric, and keep clean reps. If grip keeps stealing the target, manually choose a lower-grip replacement.",
      },
      {
        question: "Cannot judge RIR 1-2?",
        answer: "Use rep speed and form quality. RIR is an estimate; do not force ugly reps just to match a target.",
      },
    );
  } else if (trackingType === "assistance-reps") {
    faqs.push({
      question: "How do I progress assisted work?",
      answer: "Add reps first. Reduce assistance only when reps and range stay stable. Lower assistance is better only if performance does not fall apart.",
    });
  } else if (trackingType === "bodyweight-reps" || trackingType === "timed") {
    faqs.push({
      question: "How do I progress this?",
      answer: trackingType === "timed" ? "Add seconds only while control stays clean." : "Add cleaner reps before changing the variation. Do not add random load.",
    });
  } else if (key === "db-lateral-raise" || key === "db-lateral-raise-mechanical") {
    faqs.push({
      question: "When should I add weight?",
      answer: "Only after reps are high and clean. If traps take over or the path changes, stay at the same load.",
    });
  } else {
    faqs.push({
      question: "What should I focus on?",
      answer: progressionAdvice({ id: "help", exerciseId: exercise.id, completed: false, sets: [] }),
    });
  }

  return {
    title: `${exercise.name} Help`,
    subtitle: exercise.movementPattern,
    alias,
    faqs,
    replacements: exercise.replacementOptions ?? [],
  };
}

function recentPRsForWorkout(log: WorkoutLog, prs: PRRecord[]): PRRecord[] {
  return prs.filter((pr) => pr.workoutId === log.id);
}

export function buildWorkoutCoachSummary(log: WorkoutLog, data: AppData, gamification: GamificationSummary): WorkoutCoachSummary {
  const prs = recentPRsForWorkout(log, gamification.prs);
  const quality = loggingQualityForWorkout(log);
  const sets = completedSetCount(log);
  const warmup = warmupCompletionSummary(log);
  const noteText = `${log.notes ?? ""} ${log.exerciseLogs.map((exerciseLog) => `${exerciseLog.notes ?? ""} ${exerciseLog.sets.map((set) => set.notes ?? "").join(" ")}`).join(" ")}`;
  const exerciseNotes = clampList(log.exerciseLogs.map((exerciseLog) => buildExerciseFeedback(exerciseLog, log, data)).filter((item): item is ExerciseCoachFeedback => Boolean(item)), 5);
  const bodyParts = log.exerciseLogs
    .flatMap((exerciseLog) => findExercise(exerciseLog.exerciseId)?.muscleGroups ?? [])
    .filter((group, index, groups) => groups.indexOf(group) === index);

  const wins: CoachInsight[] = [];
  if (prs.length) wins.push({ title: `${prs.length} real PR${prs.length === 1 ? "" : "s"}`, detail: prs[0].label, tone: "win" });
  if (quality >= 95) wins.push({ title: "Logging quality locked", detail: `${quality}% of planned set data was complete.`, tone: "win" });
  if (warmup.total && warmup.completed) wins.push({ title: "Warm-up logged", detail: `${warmup.completed}/${warmup.total} prep drills tracked separately from work sets.`, tone: "win" });
  if (sets) wins.push({ title: "Planned work banked", detail: `${sets} completed sets counted toward the routine.`, tone: "win" });
  if (!wins.length) wins.push({ title: "Workout saved", detail: "The log is preserved and ready for comparison next time.", tone: "focus" });

  const firstFocus = exerciseNotes.flatMap((note) => note.insights).find((insight) => insight.tone === "hold" || insight.tone === "recovery" || insight.tone === "focus");
  const warmupReminder = /lower back|back pain|back hurt|grip|hinge/i.test(noteText)
    ? { title: "Warm-up reminder", detail: "Next time, do the hinge prep and light RDL ramp-up before work sets.", tone: "recovery" as const }
    : /shoulder|pinch|irritation|unstable/i.test(noteText)
      ? { title: "Warm-up reminder", detail: "Next time, use wall slides, external rotation, and scap prep before pressing or dips.", tone: "recovery" as const }
      : null;
  const nextFocus = firstFocus ?? warmupReminder ?? {
    title: "Next time",
    detail: "Repeat the plan and add clean reps before changing load.",
    tone: "focus" as const,
  };

  return {
    wins: clampList(wins, 3),
    nextFocus,
    exerciseNotes,
    lockInReasons: [
      `${quality}% logging quality`,
      prs.length ? `${prs.length} PR signal${prs.length === 1 ? "" : "s"}` : "baseline data strengthened",
      `${sets} sets completed`,
    ],
    disciplineCue: gamification.settings.showDisciplineCues === false
      ? ""
      : "Training is done. Use the momentum: 25 focused minutes on outreach, site polish, planning, or one business action before scrolling.",
    bodyParts,
  };
}

export function buildWeeklyFocus(data: AppData, gamification: GamificationSummary): CoachInsight {
  const progress = calculateMuscleProgress(data, gamification.prs);
  const focus = weeklyMuscleFocus(progress);
  if (focus.leading && focus.lightest) {
    return {
      title: "Weekly focus",
      detail: `${focus.leading.label} is leading. ${focus.lightest.label} is light; hit its scheduled day cleanly instead of adding junk volume.`,
      tone: "focus",
    };
  }
  return {
    title: "Weekly focus",
    detail: "Complete the next scheduled workout and the app will map which body parts are moving.",
    tone: "focus",
  };
}

export function buildProgressionSuggestion(data: AppData, exerciseName?: string): string {
  const targetName = exerciseName ?? data.workoutLogs.find((log) => log.status === "completed")?.exerciseLogs
    .map((exerciseLog) => findExercise(exerciseLog.exerciseId)?.name)
    .find(Boolean);
  if (!targetName) return "Next target: complete the next scheduled workout with clean set data.";
  const sessions = exerciseSessions(data.workoutLogs, targetName);
  if (sessions.length < 2) return `Next target: repeat ${targetName} once more to establish a real trend.`;
  const latest = sessions.at(-1)!;
  const trackingType = trackingTypeForExercise(latest.exercise);
  if (trackingType === "assistance-reps") return `Next target: add reps on ${targetName} before reducing assistance.`;
  if (trackingType === "timed") return `Next target: add seconds on ${targetName} only while control stays clean.`;
  return `Next target: add one clean rep on ${targetName} before increasing load.`;
}

export function buildDashboardCoachSummary(data: AppData, gamification: GamificationSummary): DashboardCoachSummary {
  const today = todayISO();
  const startDate = effectiveProgramStartDate(data.settings, data.workoutLogs, today);
  const currentWeek = getCycleInfo(startDate, today).programWeek;
  const weekCompleted = completedWorkoutsThisWeek(data.workoutLogs, { ...data.settings, startDate }, today);
  const prsThisWeek = gamification.prs.filter((pr) => getCycleInfo(startDate, pr.date).programWeek === currentWeek);
  const latestCompleted = data.workoutLogs.find((log) => log.status === "completed");
  const recentWin = prsThisWeek[0]
    ? `${prsThisWeek[0].exerciseName}: ${prsThisWeek[0].label}`
    : latestCompleted
      ? `${latestCompleted.workoutTitle} saved with ${completedSetCount(latestCompleted)} sets.`
      : "Start with one clean workout log.";
  const nextBadge = [...gamification.achievements]
    .filter((badge) => !badge.unlocked)
    .sort((a, b) => (b.progressCurrent / Math.max(1, b.progressTarget)) - (a.progressCurrent / Math.max(1, a.progressTarget)))[0];
  const totalWorkouts = data.workoutLogs.filter((log) => log.status === "completed" && isTrainingDay(log.dayKey)).length;
  const volumeTrend = data.workoutLogs.filter((log) => log.status === "completed").slice(0, 2).map(workoutVolume);

  return {
    recentWin,
    weeklyCue: buildWeeklyFocus(data, gamification).detail,
    nextBadge: nextBadge ? `${nextBadge.title}: ${nextBadge.progressCurrent}/${nextBadge.progressTarget}` : "All current badges are unlocked.",
    disciplineCue: gamification.settings.showDisciplineCues === false
      ? `${Math.max(0, trainingDayKeys.length - weekCompleted)} workout${trainingDayKeys.length - weekCompleted === 1 ? "" : "s"} left for a strong week.`
      : weekCompleted >= trainingDayKeys.length
        ? "Week handled. Put the same discipline into one business action today."
        : `${Math.max(0, trainingDayKeys.length - weekCompleted)} workout${trainingDayKeys.length - weekCompleted === 1 ? "" : "s"} left for a strong week.`,
    lockInReasons: [
      `${weekCompleted}/${trainingDayKeys.length} workouts this week`,
      `${gamification.executionScore.logging}% logging quality`,
      prsThisWeek.length ? `${prsThisWeek.length} PR${prsThisWeek.length === 1 ? "" : "s"} this week` : `${totalWorkouts} completed workouts all-time`,
      volumeTrend.length === 2 && volumeTrend[0] >= volumeTrend[1] ? "recent workload holding or rising" : "routine data is building",
    ],
  };
}

export function buildNextBestActionCue(data: AppData, gamification: GamificationSummary): string {
  const today = todayISO();
  const todayLog = data.workoutLogs.find((log) => log.date === today && (log.status === "draft" || log.status === "completed"));
  if (todayLog?.status === "draft") return "You have a draft waiting. Continue it before starting anything else.";
  if (todayLog?.status === "completed") {
    return gamification.settings.showDisciplineCues === false
      ? "Workout done. Review the recap or check progress."
      : "Workout done. Use the training momentum on one focused business task before scrolling.";
  }
  if (gamification.level.xpToNext <= 100) return `${gamification.level.xpToNext} XP to Level ${gamification.level.level + 1}.`;
  return buildProgressionSuggestion(data);
}

export function buildBodyCompositionSummary(weights: BodyWeightLog[]): BodyCompositionSummary {
  const sorted = [...weights].sort((a, b) => b.date.localeCompare(a.date));
  const latest = sorted[0];
  const bodyFatEntries = sorted.filter((entry) => typeof entry.bodyFatPercent === "number" && entry.bodyFatPercent > 0);
  const latestBodyFat = bodyFatEntries[0];

  if (!latest || !latestBodyFat) {
    return {
      latest,
      latestBodyFat,
      note: "Add body fat only when you have a reasonable estimate. Scale weight alone is still useful.",
    };
  }

  const fatMass = latest.weight * (latestBodyFat.bodyFatPercent! / 100);
  const leanMass = latest.weight - fatMass;
  const oldestBodyFat = bodyFatEntries.at(-1);

  return {
    latest,
    latestBodyFat,
    fatMass,
    leanMass,
    bodyFatTrend: oldestBodyFat && oldestBodyFat.id !== latestBodyFat.id ? latestBodyFat.bodyFatPercent! - oldestBodyFat.bodyFatPercent! : undefined,
    note: "Recomp target: train hard, keep protein high, stay around maintenance to a small surplus, and judge weekly trends instead of daily noise.",
  };
}

export function buildTrendDirection(values: number[]): { label: string; tone: CoachTone } {
  const clean = values.filter((value) => Number.isFinite(value) && value > 0);
  if (clean.length < 2) return { label: "Building baseline", tone: "focus" };
  const last = clean.at(-1)!;
  const previous = clean.at(-2)!;
  if (last > previous) return { label: "Trending up", tone: "win" };
  if (last === previous) return { label: "Holding steady", tone: "hold" };
  return { label: "Watch recovery", tone: "recovery" };
}

export function bestRecentPR(data: AppData): PRRecord | undefined {
  return detectPRs(data).sort((a, b) => b.date.localeCompare(a.date)).at(0);
}
