import { AppData, BodyWeightLog, DayKey, Exercise, ProgramSettings, WorkoutLog } from "../types";
import { GamificationSummary } from "../lib/gamification";
import { getCloudStatus } from "../lib/cloud";

export type SaveState = "idle" | "saving" | "cloud" | "local" | "offline" | "syncIssue" | "notSignedIn";

/** Everything a page needs from the app shell. */
export interface AppContext {
  data: AppData;
  gamification: GamificationSummary;
  cloudStatus: ReturnType<typeof getCloudStatus>;
  saveState: SaveState;
  saveError: string;
  startWorkout: (date?: string, performedDayKey?: DayKey) => void;
  saveWorkout: (log: WorkoutLog) => void;
  deleteWorkout: (id: string) => void;
  saveWeight: (log: BodyWeightLog) => void;
  saveSettings: (settings: ProgramSettings) => void;
  startRest: (exercise: Exercise) => void;
  clearRest: () => void;
  retrySync: () => void;
  refreshCloudStatus: () => void;
}
