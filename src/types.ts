export type DayKey =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export type ExerciseKind = "strength" | "timed" | "cardio" | "rest";
export type LogStatus = "draft" | "completed";

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
  sets?: number;
  reps?: string;
  seconds?: string;
  rest: string;
  target: string;
  notes: string;
  superset?: string;
  unilateral?: "side" | "leg";
  targetUnit?: "reps" | "seconds" | "minutes";
  logHint?: string;
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
  dayKey: DayKey;
  workoutTitle: string;
  status: LogStatus;
  startedAt: string;
  completedAt?: string;
  notes?: string;
  exerciseLogs: ExerciseLog[];
}

export interface BodyWeightLog {
  id: string;
  date: string;
  weight: number;
  note?: string;
}

export interface AppData {
  settings: ProgramSettings;
  workoutLogs: WorkoutLog[];
  bodyWeights: BodyWeightLog[];
}
