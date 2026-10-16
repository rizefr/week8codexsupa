import { AppData, BodyWeightLog, ProgramSettings, WorkoutLog } from "../types";
import { addDays, dayKeyForDate, getCycleInfo, todayISO } from "../lib/date";
import { createId, findExercise, getOrCreateLog, shouldShowLoadInput, trackingTypeForExercise } from "../lib/progress";
import { defaultGamificationSettings } from "../lib/gamification";
import { daysForDate, trainingDaysForDate } from "../data/cornell";

const workoutDays = daysForDate();
const isTrainingDay = (key: WorkoutLog["dayKey"]) => trainingDaysForDate().includes(key);

/** Local-only sample data (localhost) for exercising the UI without real history. */
export function createGamificationSampleData(currentSettings: ProgramSettings): AppData {
  const startDate = addDays(todayISO(), -34);
  const settings: ProgramSettings = {
    ...currentSettings,
    startDate,
    status: "active",
    gamification: {
      ...defaultGamificationSettings,
      ...(currentSettings.gamification ?? {}),
      enabled: true,
    },
    updatedAt: new Date().toISOString(),
  };
  const workoutLogs: WorkoutLog[] = [];
  for (let offset = 0; offset <= 34; offset += 1) {
    const date = addDays(startDate, offset);
    const dayKey = dayKeyForDate(date);
    const shouldSkip = offset === 11 || offset === 19;
    if (isTrainingDay(dayKey) && !shouldSkip) {
      const base = getOrCreateLog(date, workoutLogs, settings);
      const completed: WorkoutLog = {
        ...base,
        status: "completed",
        completedAt: new Date(fromDateForSample(date, 19)).toISOString(),
        updatedAt: new Date(fromDateForSample(date, 19)).toISOString(),
        exerciseLogs: base.exerciseLogs.map((exerciseLog, exerciseIndex) => {
          const exercise = findExercise(exerciseLog.exerciseId);
          return {
            ...exerciseLog,
            completed: true,
            sets: exerciseLog.sets.map((set) => ({
              ...set,
              completed: true,
              weight: shouldShowLoadInput(exercise) ? String(15 + exerciseIndex * 5 + Math.floor(offset / 7) * 2) : "",
              reps: trackingTypeForExercise(exercise) === "timed" || exercise?.unilateral ? set.reps : String(8 + (offset % 3)),
              leftReps: exercise?.unilateral ? String(8 + (offset % 3)) : set.leftReps,
              rightReps: exercise?.unilateral ? String(8 + (offset % 3)) : set.rightReps,
              seconds: trackingTypeForExercise(exercise) === "timed" ? String(25 + (offset % 4) * 3) : set.seconds,
              rir: "1",
            })),
            cardio: exerciseLog.cardio ? { ...exerciseLog.cardio, duration: "12", intensityNotes: "Easy, conversational pace", completed: true } : exerciseLog.cardio,
          };
        }),
      };
      workoutLogs.unshift(completed);
    } else if (!isTrainingDay(dayKey) && offset % 3 !== 0) {
      workoutLogs.unshift({
        id: createId("workout"),
        date,
        week: getCycleInfo(startDate, date).programWeek,
        cycle: getCycleInfo(startDate, date).cycle,
        weekInCycle: getCycleInfo(startDate, date).weekInCycle,
        dayKey,
        workoutTitle: workoutDays[dayKey].title,
        status: "completed",
        startedAt: new Date(fromDateForSample(date, 9)).toISOString(),
        completedAt: new Date(fromDateForSample(date, 9)).toISOString(),
        updatedAt: new Date(fromDateForSample(date, 9)).toISOString(),
        restDay: { mode: "recovery-checkin", intensityNotes: "Recovery respected.", completed: true },
        exerciseLogs: [],
      });
    }
  }
  const bodyWeights: BodyWeightLog[] = Array.from({ length: 10 }, (_, index) => ({
    id: createId("weight"),
    date: addDays(startDate, index * 3),
    weight: 142 + index * 0.2,
    note: "Sample weigh-in",
    updatedAt: new Date().toISOString(),
  }));
  return { settings, workoutLogs, bodyWeights };
}

function fromDateForSample(date: string, hour: number): Date {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(year, month - 1, day);
  value.setHours(hour, 0, 0, 0);
  return value;
}

