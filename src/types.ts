export type DayKey =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export type ExerciseKind = "strength" | "timed" | "cardio" | "rest";
export type ExerciseTrackingType = "weighted-reps" | "assistance-reps" | "bodyweight-reps" | "timed" | "cardio" | "rest-checkin";
export type ProgramPhase = "setup" | "growth" | "push";
export type LogStatus = "draft" | "completed";
export type ExerciseRiskLevel = "low" | "moderate" | "higher";
export type ExerciseProgressionRule =
  | "add-reps-first"
  | "add-load-after-top-range"
  | "reduce-assistance-after-reps"
  | "increase-time"
  | "control-quality";
export type MuscleGroup =
  | "lats"
  | "upper-back"
  | "upper-chest"
  | "chest"
  | "side-delts"
  | "rear-delts"
  | "front-delts"
  | "biceps"
  | "triceps"
  | "forearms"
  | "abs-core"
  | "quads"
  | "hamstrings"
  | "glutes"
  | "calves";

export interface SetTarget {
  setNumber: number;
  label: string;
  targetReps?: string;
  targetSeconds?: string;
  side?: "left" | "right" | "both";
}

export interface ReplacementOption {
  name: string;
  reason: string;
  trackingType?: ExerciseTrackingType;
}

export interface Exercise {
  id: string;
  name: string;
  canonicalExerciseId?: string;
  comparisonExerciseId?: string;
  comparisonAliases?: string[];
  aliases?: string[];
  commonName?: string;
  kind: ExerciseKind;
  trackingType?: ExerciseTrackingType;
  movementPattern?: string;
  riskLevel?: ExerciseRiskLevel;
  primaryProgression?: ExerciseProgressionRule;
  warningSigns?: string[];
  replacementOptions?: ReplacementOption[];
  sets?: number;
  reps?: string;
  seconds?: string;
  rest: string;
  target: string;
  notes: string;
  superset?: string;
  supersetGroup?: string;
  supersetLabel?: string;
  unilateral?: "side" | "leg";
  targetUnit?: "reps" | "seconds" | "minutes";
  targetRIRByPhase?: Record<ProgramPhase, string>;
  loadLabel?: string;
  loadRequired?: boolean;
  volumeMultiplier?: number;
  prEligible?: boolean;
  bodyweightOnly?: boolean;
  logHint?: string;
  muscleGroups?: MuscleGroup[];
  rirRequired?: boolean;
  effortMode?: "rir" | "control" | "easy";
  effortCue?: string;
}

export interface CardioBlock {
  id: string;
  name: string;
  time: string;
  intensity: string;
  notes?: string;
}

export interface RestOption {
  option: string;
  work: string;
}

export type WarmupDrillType = "general" | "pre-exercise" | "posture";
export type WarmupDrillCompletion = true;

export interface WarmupDrill {
  id: string;
  dayKey?: DayKey;
  order: number;
  name: string;
  prescription: string;
  when: string;
  why: string;
  type: WarmupDrillType;
  exerciseId?: string;
  optional?: boolean;
  effortTarget?: string;
}

export interface WarmupLog {
  completedDrills?: Record<string, WarmupDrillCompletion>;
  notes?: string;
  updatedAt?: string;
}

export interface WorkoutDay {
  key: DayKey;
  dayName: string;
  shortTitle: string;
  title: string;
  subtitle: string;
  benchSetup?: string;
  intent?: string;
  exercises: Exercise[];
  cardio?: CardioBlock[];
  restOptions?: RestOption[];
  rules?: string[];
}

export interface RuleSection {
  id: string;
  title: string;
  items: string[];
}

export interface TableSection<RowType extends Record<string, string>> {
  id: string;
  title: string;
  columns: string[];
  rows: RowType[];
}

export interface ProgramSettings {
  startDate: string;
  status?: "active" | "paused" | "completed";
  pausedAt?: string;
  completedAt?: string;
  updatedAt?: string;
  gamification?: GamificationSettings;
}

export interface GamificationSettings {
  enabled: boolean;
  showCelebrations: boolean;
  compactMode: boolean;
  version: number;
  badgeUnlocks: Record<string, string>;
  seenRecaps: string[];
  bodyWeightPromptSkips?: string[];
  showDisciplineCues?: boolean;
}

export interface SetLog {
  id: string;
  setNumber: number;
  target: string;
  weight?: string;
  reps?: string;
  leftReps?: string;
  rightReps?: string;
  seconds?: string;
  rir?: string;
  notes?: string;
  completed: boolean;
  completionOverride?: "incomplete";
}

export interface ExerciseLog {
  id: string;
  exerciseId: string;
  performedExerciseName?: string;
  replacementForExerciseId?: string;
  replacementReason?: string;
  completed: boolean;
  notes?: string;
  sets: SetLog[];
  cardio?: {
    duration?: string;
    incline?: string;
    speed?: string;
    intensityNotes?: string;
    completed: boolean;
  };
}

export interface WorkoutLog {
  id: string;
  date: string;
  week: number;
  cycle?: number;
  weekInCycle?: number;
  dayKey: DayKey;
  scheduledDayKey?: DayKey;
  performedDayKey?: DayKey;
  isScheduleOverride?: boolean;
  scheduleOverrideReason?: string;
  workoutTitle: string;
  status: LogStatus;
  startedAt: string;
  completedAt?: string;
  updatedAt?: string;
  notes?: string;
  restDay?: {
    mode: "full-rest" | "easy-walk" | "recovery-checkin";
    duration?: string;
    intensityNotes?: string;
    completed: boolean;
  };
  warmupLog?: WarmupLog;
  exerciseLogs: ExerciseLog[];
}

export interface BodyWeightLog {
  id: string;
  date: string;
  weight: number;
  bodyFatPercent?: number;
  note?: string;
  updatedAt?: string;
}

export interface AppData {
  settings: ProgramSettings;
  workoutLogs: WorkoutLog[];
  bodyWeights: BodyWeightLog[];
}
