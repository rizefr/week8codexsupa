import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Circle,
  Dumbbell,
  Flame,
  History,
  Home,
  LineChart,
  Play,
  Plus,
  Save,
  Search,
  Settings,
  Timer,
  Trash2,
  Weight,
} from "./components/icons";
import { progressionSections, ruleSections, tableSections, weeklySchedule, workoutDays } from "./data/routine";
import { getCloudStatus, sendMagicLink, signOutCloud } from "./lib/cloud";
import {
  AppData,
  BodyWeightLog,
  DayKey,
  ExerciseLog,
  ProgramSettings,
  SetLog,
  WorkoutLog,
} from "./types";
import { addDays, dayKeyForDate, formatDate, getProgramWeek, todayISO } from "./lib/date";
import {
  allExercises,
  bodyWeightChange,
  completedExerciseCount,
  completedProgramWorkouts,
  completedSetCount,
  completedWorkoutsThisWeek,
  compareLastTwoExerciseSessions,
  createId,
  exerciseNameForId,
  exerciseSessions,
  exerciseVolume,
  findExercise,
  getOrCreateLog,
  isTrainingDay,
  latestBodyWeight,
  numericValue,
  plannedTrainingDaysElapsedThisWeek,
  previousExercisePerformance,
  progressionAdvice,
  repsForSet,
  sevenDayAverage,
  totalProgramWorkouts,
  weeklySummaries,
  workoutVolume,
} from "./lib/progress";
import {
  defaultSettings,
  deleteWorkoutLog,
  loadAppData,
  saveBodyWeightLog,
  saveSettings,
  saveWorkoutLog,
} from "./lib/storage";

type Page = "dashboard" | "today" | "routine" | "logger" | "progress" | "weight" | "history" | "settings";

interface Route {
  page: Page;
  id?: string;
}

const navItems: { page: Page; label: string; icon: typeof Home }[] = [
  { page: "dashboard", label: "Dashboard", icon: Home },
  { page: "today", label: "Today", icon: Play },
  { page: "routine", label: "Routine", icon: BookOpen },
  { page: "progress", label: "Progress", icon: LineChart },
  { page: "weight", label: "Weight", icon: Weight },
  { page: "history", label: "History", icon: History },
  { page: "settings", label: "Settings", icon: Settings },
];

function parseRoute(): Route {
  const raw = window.location.hash.replace(/^#\/?/, "");
  if (!raw) return { page: "dashboard" };
  const [page, id] = raw.split("/");
  const validPages: Page[] = ["dashboard", "today", "routine", "logger", "progress", "weight", "history", "settings"];
  return validPages.includes(page as Page) ? { page: page as Page, id } : { page: "dashboard" };
}

function navigate(page: Page, id?: string) {
  window.location.hash = id ? `/${page}/${id}` : `/${page}`;
}

function classNames(...values: Array<string | false | undefined>) {
  return values.filter(Boolean).join(" ");
}

function MiniChart({
  values,
  label,
  stroke = "#3dd6a3",
}: {
  values: number[];
  label: string;
  stroke?: string;
}) {
  const width = 280;
  const height = 92;
  const clean = values.filter((value) => Number.isFinite(value));
  if (clean.length < 2) {
    return <div className="chart-empty">More logged sessions needed for {label}.</div>;
  }
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const spread = max - min || 1;
  const points = clean.map((value, index) => {
    const x = (index / Math.max(1, clean.length - 1)) * (width - 20) + 10;
    const y = height - 12 - ((value - min) / spread) * (height - 24);
    return `${x},${y}`;
  });
  return (
    <svg className="mini-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      <path d={`M ${points.join(" L ")}`} fill="none" stroke={stroke} strokeWidth="4" strokeLinecap="round" />
      {clean.map((value, index) => {
        const [x, y] = points[index].split(",").map(Number);
        return <circle key={`${value}-${index}`} cx={x} cy={y} r="4" fill={stroke} />;
      })}
    </svg>
  );
}

function ProgressRing({ value, label }: { value: number; label: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="ring" style={{ "--ring-value": `${clamped * 3.6}deg` } as React.CSSProperties}>
      <div>
        <strong>{Math.round(clamped)}%</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  detail,
  tone = "default",
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  detail: string;
  tone?: "default" | "success" | "warning";
}) {
  return (
    <section className={classNames("stat-card", tone)}>
      <div className="stat-icon">
        <Icon size={20} />
      </div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <p>{detail}</p>
      </div>
    </section>
  );
}

function App() {
  const [route, setRoute] = useState<Route>(parseRoute);
  const [data, setData] = useState<AppData>({ settings: defaultSettings, workoutLogs: [], bodyWeights: [] });
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [cloudStatus, setCloudStatus] = useState(getCloudStatus());

  useEffect(() => {
    const onHashChange = () => setRoute(parseRoute());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    loadAppData()
      .then((loaded) => {
        setData(loaded);
        setCloudStatus(getCloudStatus());
      })
      .finally(() => setLoading(false));
  }, []);

  const persistSettings = (settings: ProgramSettings) => {
    setSaveState("saving");
    setData((previous) => {
      const next = {
        ...previous,
        settings,
        workoutLogs: previous.workoutLogs.map((log) => ({
          ...log,
          week: getProgramWeek(settings.startDate, log.date),
        })),
      };
      saveSettings(settings, next)
        .then(() => setSaveState("saved"))
        .catch(() => setSaveState("error"));
      return next;
    });
  };

  const persistWorkout = (log: WorkoutLog) => {
    setSaveState("saving");
    setData((previous) => {
      const next = {
        ...previous,
        workoutLogs: [log, ...previous.workoutLogs.filter((item) => item.id !== log.id)].sort((a, b) =>
          b.date.localeCompare(a.date),
        ),
      };
      saveWorkoutLog(log, next)
        .then(() => setSaveState("saved"))
        .catch(() => setSaveState("error"));
      return next;
    });
  };

  const persistWeight = (log: BodyWeightLog) => {
    setSaveState("saving");
    setData((previous) => {
      const next = {
        ...previous,
        bodyWeights: [log, ...previous.bodyWeights.filter((item) => item.id !== log.id)].sort((a, b) =>
          a.date.localeCompare(b.date),
        ),
      };
      saveBodyWeightLog(log, next)
        .then(() => setSaveState("saved"))
        .catch(() => setSaveState("error"));
      return next;
    });
  };

  const removeWorkout = (id: string) => {
    setSaveState("saving");
    setData((previous) => {
      const next = { ...previous, workoutLogs: previous.workoutLogs.filter((log) => log.id !== id) };
      deleteWorkoutLog(id, next)
        .then(() => setSaveState("saved"))
        .catch(() => setSaveState("error"));
      return next;
    });
  };

  const startWorkout = (date = todayISO()) => {
    const log = getOrCreateLog(date, data.workoutLogs, data.settings);
    if (!data.workoutLogs.some((item) => item.id === log.id)) {
      persistWorkout(log);
    }
    navigate("logger", log.id);
  };

  const currentWeek = getProgramWeek(data.settings.startDate, todayISO());

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => navigate("dashboard")}>
          <span className="brand-mark">
            <Flame size={20} />
          </span>
          <span>
            <strong>Chad A</strong>
            <small>8-week push</small>
          </span>
        </button>
        <nav>
          {navItems.map((item) => (
            <button
              key={item.page}
              className={classNames("nav-button", route.page === item.page && "active")}
              onClick={() => navigate(item.page)}
            >
              <item.icon size={19} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="save-state">
          <Circle size={9} className={saveState} />
          {loading
            ? "Loading"
            : saveState === "saving"
              ? "Saving"
              : saveState === "error"
                ? "Save issue"
                : cloudStatus.signedIn
                  ? "Saved to cloud"
                  : "Saved locally"}
        </div>
      </aside>

      <main className="main">
        <TopBar week={currentWeek} settings={data.settings} startWorkout={startWorkout} />
        {loading ? (
          <LoadingScreen />
        ) : (
          <>
            {route.page === "dashboard" && <Dashboard data={data} startWorkout={startWorkout} />}
            {route.page === "today" && <TodayPage data={data} startWorkout={startWorkout} />}
            {route.page === "routine" && <RoutinePage />}
            {route.page === "logger" && (
              <LoggerPage
                logId={route.id}
                data={data}
                onSave={persistWorkout}
                onDelete={removeWorkout}
                startWorkout={startWorkout}
              />
            )}
            {route.page === "progress" && <ProgressPage data={data} />}
            {route.page === "weight" && <WeightPage data={data} onSave={persistWeight} />}
            {route.page === "history" && <HistoryPage data={data} startWorkout={startWorkout} />}
            {route.page === "settings" && (
              <SettingsPage
                settings={data.settings}
                onSave={persistSettings}
                cloudStatus={cloudStatus}
                refreshCloudStatus={() => setCloudStatus(getCloudStatus())}
              />
            )}
          </>
        )}
      </main>

      <nav className="bottom-nav">
        {navItems.slice(0, 5).map((item) => (
          <button
            key={item.page}
            className={classNames(route.page === item.page && "active")}
            onClick={() => navigate(item.page)}
          >
            <item.icon size={18} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

function TopBar({
  week,
  settings,
  startWorkout,
}: {
  week: number;
  settings: ProgramSettings;
  startWorkout: (date?: string) => void;
}) {
  const today = todayISO();
  const workout = workoutDays[dayKeyForDate(today)];
  return (
    <header className="top-bar">
      <div>
        <p className="eyebrow">Week {week} of 8</p>
        <h1>{workout.shortTitle}</h1>
        <span>{formatDate(today, { weekday: "long" })} from program start {formatDate(settings.startDate)}</span>
      </div>
      <button className="primary-action" onClick={() => startWorkout(today)}>
        <Play size={18} />
        Start Today
      </button>
    </header>
  );
}

function LoadingScreen() {
  return (
    <section className="loading-card">
      <div className="loader" />
      <div>
        <h2>Loading your training dashboard</h2>
        <p>Pulling routine data, logs, body weight history, and local settings.</p>
      </div>
    </section>
  );
}

function Dashboard({ data, startWorkout }: { data: AppData; startWorkout: (date?: string) => void }) {
  const today = todayISO();
  const dayKey = dayKeyForDate(today);
  const workout = workoutDays[dayKey];
  const currentWeek = getProgramWeek(data.settings.startDate, today);
  const weekCompleted = completedWorkoutsThisWeek(data.workoutLogs, data.settings, today);
  const elapsedThisWeek = plannedTrainingDaysElapsedThisWeek(data.settings, today);
  const totalCompleted = completedProgramWorkouts(data.workoutLogs);
  const totalWorkouts = totalProgramWorkouts();
  const latestWeight = latestBodyWeight(data.bodyWeights);
  const weightChange = bodyWeightChange(data.bodyWeights);
  const completedLogs = data.workoutLogs.filter((log) => log.status === "completed");
  const recentVolume = completedLogs.slice(0, 2).map(workoutVolume);
  const recentProgress =
    recentVolume.length < 2
      ? "Log two workouts"
      : recentVolume[0] > recentVolume[1]
        ? "Up from last session"
        : recentVolume[0] === recentVolume[1]
          ? "Holding steady"
          : "Down from last session";

  return (
    <div className="page-grid">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Today</p>
          <h2>{workout.title}</h2>
          <p>{workout.subtitle}</p>
          {workout.benchSetup && <span className="setup-chip">{workout.benchSetup}</span>}
        </div>
        <div className="hero-actions">
          <button className="primary-action" onClick={() => startWorkout(today)}>
            <Play size={18} />
            Start today's workout
          </button>
          <button className="secondary-action" onClick={() => navigate("routine")}>
            <BookOpen size={18} />
            View full routine
          </button>
        </div>
      </section>

      <section className="quick-grid">
        <button onClick={() => navigate("weight")}>
          <Weight />
          <span>Log body weight</span>
        </button>
        <button onClick={() => navigate("progress")}>
          <LineChart />
          <span>Progress reports</span>
        </button>
        <button onClick={() => navigate("history")}>
          <History />
          <span>Workout history</span>
        </button>
        <button onClick={() => navigate("settings")}>
          <Settings />
          <span>Program start date</span>
        </button>
      </section>

      <div className="dashboard-row">
        <ProgressRing value={(weekCompleted / Math.max(1, elapsedThisWeek || 1)) * 100} label="week done" />
        <ProgressRing value={(totalCompleted / totalWorkouts) * 100} label="program done" />
      </div>

      <section className="stats-grid">
        <StatCard
          icon={CalendarDays}
          label="Workouts this week"
          value={`${weekCompleted}/${Math.max(elapsedThisWeek, 1)} due`}
          detail={`Week ${currentWeek} has ${5 - weekCompleted} planned training days left or incomplete.`}
          tone={weekCompleted >= elapsedThisWeek ? "success" : "warning"}
        />
        <StatCard
          icon={Dumbbell}
          label="8-week completion"
          value={`${totalCompleted}/${totalWorkouts}`}
          detail="Training days completed across the whole program."
        />
        <StatCard
          icon={Weight}
          label="Body weight trend"
          value={latestWeight ? `${latestWeight.weight.toFixed(1)} lb` : "No data"}
          detail={weightChange === null ? "Add a weigh-in to start the trend." : `${weightChange >= 0 ? "+" : ""}${weightChange.toFixed(1)} lb since start.`}
          tone="default"
        />
        <StatCard icon={BarChart3} label="Recent strength/reps" value={recentProgress} detail="Based on logged workout volume where weight is present." />
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Schedule</p>
            <h3>This week</h3>
          </div>
        </div>
        <div className="week-strip">
          {weeklySchedule.map((item, index) => {
            const date = addDays(data.settings.startDate, (currentWeek - 1) * 7 + index);
            const log = data.workoutLogs.find((entry) => entry.date === date && entry.status === "completed");
            return (
              <button key={item.key} className={classNames("week-day", item.key === dayKey && "today")} onClick={() => startWorkout(date)}>
                <span>{item.day.slice(0, 3)}</span>
                <strong>{workoutDays[item.key].shortTitle}</strong>
                <small>{log ? "Done" : isTrainingDay(item.key) ? "Planned" : "Recover"}</small>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function TodayPage({ data, startWorkout }: { data: AppData; startWorkout: (date?: string) => void }) {
  const today = todayISO();
  const dayKey = dayKeyForDate(today);
  const workout = workoutDays[dayKey];
  const log = data.workoutLogs.find((item) => item.date === today && item.dayKey === dayKey);
  return (
    <div className="content-stack">
      <section className="panel today-panel">
        <div>
          <p className="eyebrow">{formatDate(today, { weekday: "long" })}</p>
          <h2>{workout.title}</h2>
          <p>{workout.subtitle}</p>
        </div>
        <button className="primary-action" onClick={() => startWorkout(today)}>
          <Play size={18} />
          {log ? "Open today's log" : "Start workout"}
        </button>
      </section>
      <WorkoutDayDetail dayKey={dayKey} compact={false} />
    </div>
  );
}

function RoutinePage() {
  const [query, setQuery] = useState("");
  const lowerQuery = query.toLowerCase();
  const visibleDays = weeklySchedule.filter((day) => {
    const workout = workoutDays[day.key];
    const haystack = `${day.day} ${workout.title} ${workout.subtitle} ${workout.exercises
      .map((exercise) => `${exercise.name} ${exercise.target} ${exercise.notes}`)
      .join(" ")}`.toLowerCase();
    return haystack.includes(lowerQuery);
  });

  return (
    <div className="content-stack">
      <section className="panel routine-header">
        <div>
          <p className="eyebrow">Source of truth</p>
          <h2>Final Routine A by Chad</h2>
          <p>Corrected 8-week home-gym aesthetic hypertrophy routine. Follow exactly for 8 weeks.</p>
        </div>
        <label className="search-box">
          <Search size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search exercises, muscles, rules" />
        </label>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Weekly schedule</p>
            <h3>Training rhythm</h3>
          </div>
        </div>
        <div className="schedule-grid">
          {weeklySchedule.map((item) => (
            <button key={item.key} className="schedule-card" onClick={() => document.getElementById(item.key)?.scrollIntoView({ behavior: "smooth" })}>
              <span>{item.day}</span>
              <strong>{item.workout}</strong>
            </button>
          ))}
        </div>
      </section>

      {visibleDays.map((item) => (
        <WorkoutDayDetail key={item.key} dayKey={item.key} compact={false} />
      ))}

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">8-week progression</p>
            <h3>How hard to train</h3>
          </div>
        </div>
        <div className="rule-grid">
          {progressionSections.map((section) => (
            <RuleCard key={section.id} title={section.title} items={section.items} />
          ))}
        </div>
      </section>

      {ruleSections.map((section) => (
        <section key={section.id} className="panel">
          <RuleCard title={section.title} items={section.items} />
        </section>
      ))}

      {tableSections.map((section) => (
        <section key={section.id} className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Reference</p>
              <h3>{section.title}</h3>
            </div>
          </div>
          <div className="responsive-table">
            <table>
              <thead>
                <tr>
                  {section.columns.map((column) => (
                    <th key={column}>{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {section.rows.map((row, index) => (
                  <tr key={`${section.id}-${index}`}>
                    {section.columns.map((column) => (
                      <td key={column}>{row[column]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}

function WorkoutDayDetail({ dayKey, compact }: { dayKey: DayKey; compact: boolean }) {
  const workout = workoutDays[dayKey];
  return (
    <section id={dayKey} className="panel workout-detail">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{workout.dayName}</p>
          <h3>{workout.title}</h3>
          <p>{workout.subtitle}</p>
        </div>
      </div>
      {workout.benchSetup && <div className="guidance-card">{workout.benchSetup}</div>}
      {workout.intent && <div className="guidance-card">{workout.intent}</div>}
      {workout.restOptions && (
        <div className="rest-grid">
          {workout.restOptions.map((option) => (
            <div key={option.option} className="rest-card">
              <span>{option.option}</span>
              <strong>{option.work}</strong>
            </div>
          ))}
        </div>
      )}
      {!!workout.exercises.length && (
        <div className="exercise-list">
          {workout.exercises.map((exercise, index) => (
            <article key={exercise.id} className="exercise-card">
              <div className="exercise-index">{exercise.superset ?? index + 1}</div>
              <div>
                <h4>{exercise.name}</h4>
                <div className="exercise-meta">
                  <span>{exercise.sets} x {exercise.reps ?? exercise.seconds}</span>
                  <span>{exercise.rest}</span>
                  <span>{exercise.target}</span>
                </div>
                {!compact && <p>{exercise.notes}</p>}
                {exercise.logHint && <small>{exercise.logHint}</small>}
              </div>
            </article>
          ))}
        </div>
      )}
      {workout.cardio && (
        <div className="cardio-list">
          {workout.cardio.map((cardio) => (
            <article key={cardio.id} className="exercise-card cardio">
              <Timer />
              <div>
                <h4>{cardio.name}</h4>
                <div className="exercise-meta">
                  <span>{cardio.time}</span>
                  <span>{cardio.intensity}</span>
                </div>
                {cardio.notes && <p>{cardio.notes}</p>}
              </div>
            </article>
          ))}
        </div>
      )}
      {workout.rules?.map((rule) => <div key={rule} className="warning-line">{rule}</div>)}
    </section>
  );
}

function RuleCard({ title, items }: { title: string; items: string[] }) {
  return (
    <article className="rule-card">
      <h4>{title}</h4>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </article>
  );
}

function LoggerPage({
  logId,
  data,
  onSave,
  onDelete,
  startWorkout,
}: {
  logId?: string;
  data: AppData;
  onSave: (log: WorkoutLog) => void;
  onDelete: (id: string) => void;
  startWorkout: (date?: string) => void;
}) {
  const log = data.workoutLogs.find((item) => item.id === logId);
  if (!log) {
    return (
      <section className="panel empty-state">
        <h2>No workout log open</h2>
        <p>Start today's workout or open one from history.</p>
        <button className="primary-action" onClick={() => startWorkout(todayISO())}>
          <Play size={18} />
          Start today
        </button>
      </section>
    );
  }

  const workout = workoutDays[log.dayKey];
  const updateLog = (mutator: (current: WorkoutLog) => WorkoutLog) => onSave(mutator(log));
  const completeWorkout = () => {
    const completed = {
      ...log,
      status: "completed" as const,
      completedAt: new Date().toISOString(),
      exerciseLogs: log.exerciseLogs.map((exerciseLog) => ({
        ...exerciseLog,
        completed:
          exerciseLog.completed ||
          (!!exerciseLog.sets.length && exerciseLog.sets.every((set) => set.completed)) ||
          !!exerciseLog.cardio?.completed,
      })),
    };
    onSave(completed);
  };

  return (
    <div className="content-stack logger-page">
      <section className="panel logger-header">
        <div>
          <p className="eyebrow">Workout logger</p>
          <h2>{log.workoutTitle}</h2>
          <p>
            {formatDate(log.date, { weekday: "long", year: "numeric" })} · Week {log.week} · {log.status}
          </p>
        </div>
        <div className="logger-actions">
          <button className="secondary-action danger" onClick={() => {
            onDelete(log.id);
            navigate("history");
          }}>
            <Trash2 size={17} />
            Delete
          </button>
          <button className="primary-action" onClick={completeWorkout}>
            <CheckCircle2 size={18} />
            Complete Workout
          </button>
        </div>
      </section>

      {workout.benchSetup && <div className="guidance-card">{workout.benchSetup}</div>}
      {workout.restOptions && (
        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Rest guidance</p>
              <h3>{workout.title}</h3>
            </div>
          </div>
          <div className="rest-grid">
            {workout.restOptions.map((option) => (
              <div key={option.option} className="rest-card">
                <span>{option.option}</span>
                <strong>{option.work}</strong>
              </div>
            ))}
          </div>
          {workout.rules?.map((rule) => <div key={rule} className="warning-line">{rule}</div>)}
        </section>
      )}

      {log.exerciseLogs.map((exerciseLog) => (
        <LogExerciseCard
          key={exerciseLog.id}
          log={log}
          exerciseLog={exerciseLog}
          allLogs={data.workoutLogs}
          onChange={(nextExerciseLog) =>
            updateLog((current) => ({
              ...current,
              exerciseLogs: current.exerciseLogs.map((item) => (item.id === nextExerciseLog.id ? nextExerciseLog : item)),
            }))
          }
        />
      ))}

      <section className="panel">
        <label className="field-label">
          Workout notes
          <textarea
            value={log.notes ?? ""}
            onChange={(event) => updateLog((current) => ({ ...current, notes: event.target.value }))}
            placeholder="Sleep, joints, form, pumps, pain, appetite, recovery..."
          />
        </label>
        <div className="sticky-complete">
          <button className="primary-action" onClick={completeWorkout}>
            <Save size={18} />
            Complete Workout
          </button>
        </div>
      </section>
    </div>
  );
}

function LogExerciseCard({
  log,
  exerciseLog,
  allLogs,
  onChange,
}: {
  log: WorkoutLog;
  exerciseLog: ExerciseLog;
  allLogs: WorkoutLog[];
  onChange: (log: ExerciseLog) => void;
}) {
  const exercise = findExercise(exerciseLog.exerciseId);
  const cardio = workoutDays[log.dayKey].cardio?.find((item) => item.id === exerciseLog.exerciseId);
  const previous = exercise ? previousExercisePerformance(allLogs, log.date, exercise.name) : undefined;

  const updateSet = (setId: string, patch: Partial<SetLog>) => {
    const sets = exerciseLog.sets.map((set) => (set.id === setId ? { ...set, ...patch } : set));
    onChange({
      ...exerciseLog,
      sets,
      completed: sets.length > 0 ? sets.every((set) => set.completed) : exerciseLog.completed,
    });
  };

  if (cardio) {
    return (
      <section className="panel log-card cardio-log">
        <div className="log-card-heading">
          <div>
            <p className="eyebrow">Cardio</p>
            <h3>{cardio.name}</h3>
            <p>{cardio.time} · {cardio.intensity}</p>
          </div>
          <label className="complete-toggle">
            <input
              type="checkbox"
              checked={!!exerciseLog.cardio?.completed}
              onChange={(event) =>
                onChange({
                  ...exerciseLog,
                  completed: event.target.checked,
                  cardio: { ...exerciseLog.cardio, completed: event.target.checked },
                })
              }
            />
            Done
          </label>
        </div>
        {cardio.notes && <div className="guidance-card">{cardio.notes}</div>}
        <div className="input-grid">
          <NumberField
            label="Duration"
            value={exerciseLog.cardio?.duration ?? ""}
            placeholder="min"
            onChange={(value) => onChange({ ...exerciseLog, cardio: { ...exerciseLog.cardio, duration: value, completed: !!exerciseLog.cardio?.completed } })}
          />
          <NumberField
            label="Incline"
            value={exerciseLog.cardio?.incline ?? ""}
            placeholder="%"
            onChange={(value) => onChange({ ...exerciseLog, cardio: { ...exerciseLog.cardio, incline: value, completed: !!exerciseLog.cardio?.completed } })}
          />
          <NumberField
            label="Speed"
            value={exerciseLog.cardio?.speed ?? ""}
            placeholder="mph"
            onChange={(value) => onChange({ ...exerciseLog, cardio: { ...exerciseLog.cardio, speed: value, completed: !!exerciseLog.cardio?.completed } })}
          />
        </div>
        <label className="field-label">
          Intensity notes
          <textarea
            value={exerciseLog.cardio?.intensityNotes ?? ""}
            onChange={(event) =>
              onChange({
                ...exerciseLog,
                cardio: { ...exerciseLog.cardio, intensityNotes: event.target.value, completed: !!exerciseLog.cardio?.completed },
              })
            }
          />
        </label>
      </section>
    );
  }

  if (!exercise) return null;

  return (
    <section className="panel log-card">
      <div className="log-card-heading">
        <div>
          <p className="eyebrow">{exercise.target}</p>
          <h3>{exercise.name}</h3>
          <p>
            {exercise.sets} x {exercise.reps ?? exercise.seconds} · Rest {exercise.rest}
          </p>
        </div>
        <label className="complete-toggle">
          <input
            type="checkbox"
            checked={exerciseLog.completed}
            onChange={(event) => onChange({ ...exerciseLog, completed: event.target.checked })}
          />
          Done
        </label>
      </div>
      <div className="guidance-card">{exercise.notes}</div>
      {exercise.logHint && <div className="guidance-card">{exercise.logHint}</div>}
      {previous && (
        <div className="previous-box">
          <strong>Previous:</strong> {formatDate(previous.workout.date)} · {Math.round(exerciseVolume(previous.exerciseLog)).toLocaleString()} volume ·{" "}
          {previous.exerciseLog.sets.filter((set) => set.completed).length} sets
        </div>
      )}
      <div className="set-table">
        <div className="set-row header">
          <span>Set</span>
          <span>Target</span>
          <span>Weight</span>
          {exercise.kind === "timed" ? (
            <span>Seconds</span>
          ) : exercise.unilateral ? (
            <>
              <span>Left</span>
              <span>Right</span>
            </>
          ) : (
            <span>Reps</span>
          )}
          <span>RIR</span>
          <span>Done</span>
        </div>
        {exerciseLog.sets.map((set) => (
          <div key={set.id} className="set-row">
            <strong>{set.setNumber}</strong>
            <span>{set.target}</span>
            <input value={set.weight ?? ""} onChange={(event) => updateSet(set.id, { weight: event.target.value })} inputMode="decimal" placeholder="lb" />
            {exercise.kind === "timed" ? (
              <input value={set.seconds ?? ""} onChange={(event) => updateSet(set.id, { seconds: event.target.value })} inputMode="numeric" placeholder="sec" />
            ) : exercise.unilateral ? (
              <>
                <input value={set.leftReps ?? ""} onChange={(event) => updateSet(set.id, { leftReps: event.target.value })} inputMode="numeric" placeholder="L" />
                <input value={set.rightReps ?? ""} onChange={(event) => updateSet(set.id, { rightReps: event.target.value })} inputMode="numeric" placeholder="R" />
              </>
            ) : (
              <input value={set.reps ?? ""} onChange={(event) => updateSet(set.id, { reps: event.target.value })} inputMode="numeric" placeholder="reps" />
            )}
            <input value={set.rir ?? ""} onChange={(event) => updateSet(set.id, { rir: event.target.value })} inputMode="decimal" placeholder="RIR" />
            <input
              type="checkbox"
              checked={set.completed}
              onChange={(event) => updateSet(set.id, { completed: event.target.checked })}
              aria-label={`Set ${set.setNumber} completed`}
            />
          </div>
        ))}
      </div>
      <label className="field-label">
        Exercise notes
        <input
          value={exerciseLog.notes ?? ""}
          onChange={(event) => onChange({ ...exerciseLog, notes: event.target.value })}
          placeholder="Form, pain, pump, assistance, setup..."
        />
      </label>
      <div className="advice-line">{progressionAdvice(exerciseLog)}</div>
    </section>
  );
}

function NumberField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field-label">
      {label}
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} inputMode="decimal" />
    </label>
  );
}

function ProgressPage({ data }: { data: AppData }) {
  const exerciseNames = useMemo(() => Array.from(new Set(allExercises.map((exercise) => exercise.name))).sort(), []);
  const [selectedExercise, setSelectedExercise] = useState(exerciseNames[0] ?? "");
  const sessions = exerciseSessions(data.workoutLogs, selectedExercise);
  const volumePoints = sessions.map((session) => exerciseVolume(session.exerciseLog));
  const repPoints = sessions.map((session) =>
    session.exerciseLog.sets.reduce((sum, set) => sum + repsForSet(set, session.exercise), 0),
  );
  const weightPoints = sessions.map((session) => {
    const weights = session.exerciseLog.sets.map((set) => numericValue(set.weight)).filter(Boolean);
    return weights.length ? Math.max(...weights) : 0;
  });
  const best = sessions.reduce(
    (winner, session) => (exerciseVolume(session.exerciseLog) > exerciseVolume(winner?.exerciseLog as ExerciseLog) ? session : winner),
    sessions[0],
  );
  const weekly = weeklySummaries(data.workoutLogs, data.settings);

  return (
    <div className="content-stack">
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Exercise progress</p>
            <h2>Trends by lift</h2>
          </div>
          <select value={selectedExercise} onChange={(event) => setSelectedExercise(event.target.value)}>
            {exerciseNames.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
        {sessions.length ? (
          <>
            <div className="stats-grid compact">
              <StatCard icon={Dumbbell} label="Logged sessions" value={`${sessions.length}`} detail="Completed sessions with this exercise." />
              <StatCard icon={BarChart3} label="Best performance" value={best ? `${Math.round(exerciseVolume(best.exerciseLog)).toLocaleString()} vol` : "None"} detail={best ? formatDate(best.workout.date) : "Log this exercise first."} />
              <StatCard icon={Activity} label="Last vs previous" value={compareLastTwoExerciseSessions(data.workoutLogs, selectedExercise)} detail="Uses estimated volume when weight is logged." />
            </div>
            <div className="chart-grid">
              <ChartPanel title="Weight trend" values={weightPoints} />
              <ChartPanel title="Rep trend" values={repPoints} stroke="#73a7ff" />
              <ChartPanel title="Estimated volume" values={volumePoints} stroke="#f5b84b" />
            </div>
            <div className="responsive-table">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Week</th>
                    <th>Sets</th>
                    <th>Total reps/sec</th>
                    <th>Volume</th>
                    <th>Guidance</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((session) => (
                    <tr key={`${session.workout.id}-${session.exerciseLog.id}`}>
                      <td>{formatDate(session.workout.date)}</td>
                      <td>{session.workout.week}</td>
                      <td>{session.exerciseLog.sets.filter((set) => set.completed).length}</td>
                      <td>{session.exerciseLog.sets.reduce((sum, set) => sum + repsForSet(set, session.exercise), 0)}</td>
                      <td>{Math.round(exerciseVolume(session.exerciseLog)).toLocaleString()}</td>
                      <td>{progressionAdvice(session.exerciseLog)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="empty-state">No completed sessions for this exercise yet.</div>
        )}
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Weekly progress</p>
            <h2>Program workload</h2>
          </div>
        </div>
        <div className="weekly-bars">
          {weekly.map((week) => (
            <div key={week.week} className="weekly-bar">
              <span>W{week.week}</span>
              <div>
                <i style={{ height: `${Math.max(6, (week.completed / 5) * 100)}%` }} />
              </div>
              <strong>{week.completed}/5</strong>
              {week.warning && <AlertTriangle size={15} />}
            </div>
          ))}
        </div>
        <div className="responsive-table">
          <table>
            <thead>
              <tr>
                <th>Week</th>
                <th>Completed</th>
                <th>Sets</th>
                <th>Volume</th>
                <th>Missed</th>
                <th>Recovery</th>
              </tr>
            </thead>
            <tbody>
              {weekly.map((week) => (
                <tr key={week.week}>
                  <td>{week.week}</td>
                  <td>{week.completed}</td>
                  <td>{week.sets}</td>
                  <td>{Math.round(week.volume).toLocaleString()}</td>
                  <td>{week.missed}</td>
                  <td>{week.warning ? "Watch recovery" : "Clear"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function ChartPanel({ title, values, stroke }: { title: string; values: number[]; stroke?: string }) {
  return (
    <article className="chart-panel">
      <h4>{title}</h4>
      <MiniChart values={values} label={title} stroke={stroke} />
    </article>
  );
}

function WeightPage({ data, onSave }: { data: AppData; onSave: (log: BodyWeightLog) => void }) {
  const [date, setDate] = useState(todayISO());
  const [weight, setWeight] = useState("");
  const [note, setNote] = useState("");
  const sorted = [...data.bodyWeights].sort((a, b) => a.date.localeCompare(b.date));
  const latest = latestBodyWeight(data.bodyWeights);
  const start = sorted[0];
  const change = bodyWeightChange(data.bodyWeights);
  const average = sevenDayAverage(data.bodyWeights);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = Number(weight);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    onSave({ id: createId("weight"), date, weight: parsed, note });
    setWeight("");
    setNote("");
  };

  return (
    <div className="content-stack">
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Body weight tracker</p>
            <h2>Scale trend</h2>
          </div>
        </div>
        <form className="weight-form" onSubmit={submit}>
          <label className="field-label">
            Date
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
          </label>
          <label className="field-label">
            Body weight
            <input value={weight} onChange={(event) => setWeight(event.target.value)} inputMode="decimal" placeholder="142.0" required />
          </label>
          <label className="field-label">
            Note
            <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Morning weigh-in, sodium, sleep..." />
          </label>
          <button className="primary-action" type="submit">
            <Plus size={18} />
            Add weigh-in
          </button>
        </form>
        <div className="stats-grid compact">
          <StatCard icon={Weight} label="Starting weight" value={start ? `${start.weight.toFixed(1)} lb` : "No data"} detail={start ? formatDate(start.date) : "Add your first entry."} />
          <StatCard icon={Activity} label="Current weight" value={latest ? `${latest.weight.toFixed(1)} lb` : "No data"} detail={latest ? formatDate(latest.date) : "No current entry yet."} />
          <StatCard icon={LineChart} label="Change since start" value={change === null ? "No trend" : `${change >= 0 ? "+" : ""}${change.toFixed(1)} lb`} detail="Small surplus or maintenance is the target." />
          <StatCard icon={BarChart3} label="7-day average" value={average === null ? "Need 7" : `${average.toFixed(1)} lb`} detail="Appears after 7 weigh-ins." />
        </div>
        <ChartPanel title="Body weight trend" values={sorted.map((entry) => entry.weight)} stroke="#73a7ff" />
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">History</p>
            <h3>Weigh-ins</h3>
          </div>
        </div>
        {sorted.length ? (
          <div className="responsive-table">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Weight</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {[...sorted].reverse().map((entry) => (
                  <tr key={entry.id}>
                    <td>{formatDate(entry.date)}</td>
                    <td>{entry.weight.toFixed(1)} lb</td>
                    <td>{entry.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">No body weight logs yet.</div>
        )}
      </section>
    </div>
  );
}

function HistoryPage({ data, startWorkout }: { data: AppData; startWorkout: (date?: string) => void }) {
  const [filter, setFilter] = useState("");
  const filtered = data.workoutLogs.filter((log) => {
    const query = filter.toLowerCase();
    return `${log.workoutTitle} ${log.date} ${log.notes ?? ""}`.toLowerCase().includes(query);
  });
  return (
    <div className="content-stack">
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Workout history</p>
            <h2>Completed and draft logs</h2>
          </div>
          <label className="search-box small">
            <Search size={18} />
            <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Search history" />
          </label>
        </div>
        {filtered.length ? (
          <div className="history-list">
            {filtered.map((log) => (
              <article key={log.id} className="history-card">
                <div>
                  <p className="eyebrow">Week {log.week} · {log.status}</p>
                  <h3>{log.workoutTitle}</h3>
                  <p>{formatDate(log.date, { weekday: "long", year: "numeric" })}</p>
                  <div className="exercise-meta">
                    <span>{completedExerciseCount(log)} items</span>
                    <span>{completedSetCount(log)} sets</span>
                    <span>{Math.round(workoutVolume(log)).toLocaleString()} volume</span>
                  </div>
                  {log.notes && <p>{log.notes}</p>}
                </div>
                <button className="secondary-action" onClick={() => navigate("logger", log.id)}>Open</button>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <h3>No workouts yet</h3>
            <p>Start today's workout to create your first log.</p>
            <button className="primary-action" onClick={() => startWorkout(todayISO())}>
              <Play size={18} />
              Start today
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function SettingsPage({
  settings,
  onSave,
  cloudStatus,
  refreshCloudStatus,
}: {
  settings: ProgramSettings;
  onSave: (settings: ProgramSettings) => void;
  cloudStatus: ReturnType<typeof getCloudStatus>;
  refreshCloudStatus: () => void;
}) {
  const [startDate, setStartDate] = useState(settings.startDate);
  const [email, setEmail] = useState("");
  const [cloudMessage, setCloudMessage] = useState("");
  const [cloudBusy, setCloudBusy] = useState(false);

  const requestLink = async (event: FormEvent) => {
    event.preventDefault();
    setCloudBusy(true);
    setCloudMessage("");
    try {
      await sendMagicLink(email);
      setCloudMessage("Magic link sent. Open it on your phone to sign in and sync this app.");
    } catch (error) {
      setCloudMessage(error instanceof Error ? error.message : "Could not send the magic link.");
    } finally {
      setCloudBusy(false);
      refreshCloudStatus();
    }
  };

  const signOut = async () => {
    setCloudBusy(true);
    await signOutCloud();
    setCloudBusy(false);
    setCloudMessage("Signed out of cloud sync on this browser.");
    refreshCloudStatus();
  };

  return (
    <div className="content-stack">
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Settings</p>
            <h2>Program start date</h2>
          </div>
        </div>
        <div className="settings-grid">
          <label className="field-label">
            Start date
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </label>
          <button className="primary-action" onClick={() => onSave({ startDate })}>
            <Save size={18} />
            Save settings
          </button>
        </div>
        <div className="schema-grid">
          <article>
            <h3>Persistence</h3>
            <p>Workout logs, set rows, cardio details, notes, completion status, body weights, and start date are stored in IndexedDB locally and Supabase when cloud sync is configured.</p>
          </article>
          <article>
            <h3>Cloud backend</h3>
            <p>Supabase stores your logs in user-owned rows protected by Row Level Security. Netlify hosts the static app.</p>
          </article>
          <article>
            <h3>Data model</h3>
            <p>WorkoutDay, Exercise, SetTarget, WorkoutLog, SetLog, BodyWeightLog, and ProgramSettings are defined in src/types.ts.</p>
          </article>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Cloud sync</p>
            <h2>Phone-ready online saving</h2>
          </div>
        </div>
        {!cloudStatus.configured ? (
          <div className="warning-line">
            Cloud sync is not configured in this build. Add Supabase environment variables on Netlify, rebuild, and this panel will enable email sign-in.
          </div>
        ) : cloudStatus.signedIn ? (
          <div className="cloud-auth-row">
            <div>
              <h3>Signed in</h3>
              <p>{cloudStatus.email ?? "Supabase user"} · logs save to the cloud from this browser.</p>
            </div>
            <button className="secondary-action" onClick={signOut} disabled={cloudBusy}>
              Sign out
            </button>
          </div>
        ) : (
          <form className="cloud-auth-form" onSubmit={requestLink}>
            <label className="field-label">
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                required
              />
            </label>
            <button className="primary-action" type="submit" disabled={cloudBusy}>
              {cloudBusy ? "Sending..." : "Send magic link"}
            </button>
          </form>
        )}
        {(cloudMessage || cloudStatus.lastError) && <div className="guidance-card">{cloudMessage || cloudStatus.lastError}</div>}
      </section>
    </div>
  );
}

export default App;
