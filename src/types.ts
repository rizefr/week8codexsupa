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

export interface Exercise {
  id: string;
  name: string;
  kind: ExerciseKind;
  trackingType?: ExerciseTrackingType;
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
  exerciseLogs: ExerciseLog[];
}

export interface BodyWeightLog {
  id: string;
  date: string;
  weight: number;
  note?: string;
  updatedAt?: string;
}

export interface AppData {
  settings: ProgramSettings;
  workoutLogs: WorkoutLog[];
  bodyWeights: BodyWeightLog[];
}
