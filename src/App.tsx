import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
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
  MoreHorizontal,
  Play,
  Plus,
  Save,
  Search,
  Settings,
  Timer,
  Trash2,
  Weight,
} from "./components/icons";
import { progressionSections, ruleSections, tableSections, trainingDayKeys, weeklySchedule, workoutDays } from "./data/routine";
import { getCloudStatus, sendMagicLink, signOutCloud, syncCloudNow } from "./lib/cloud";
import {
  AppData,
  BodyWeightLog,
  DayKey,
  Exercise,
  ExerciseLog,
  GamificationSettings,
  MuscleGroup,
  ProgramSettings,
  SetLog,
  WorkoutLog,
} from "./types";
import { addDays, dayKeyForDate, formatDate, getCycleInfo, todayISO } from "./lib/date";
import {
  allExercises,
  autoCompletedSet,
  bodyWeightChange,
  cardioInputsAreValid,
  completedExerciseCount,
  completedProgramWorkouts,
  completedSetCount,
  completedWorkoutsInCurrentCycle,
  completedWorkoutsThisWeek,
  compareLastTwoExerciseSessions,
  createId,
  cycleWorkoutTarget,
  effectiveProgramStartDate,
  effortLabelForExercise,
  exerciseNameForId,
  exerciseSessions,
  exerciseVolume,
  findExercise,
  bestAssistance,
  bestSetReps,
  bestTimedSet,
  getOrCreateLog,
  isTrainingDay,
  loadIsAssistance,
  loadLabelForExercise,
  latestBodyWeight,
  plannedTrainingDaysElapsedThisWeek,
  prefillWorkoutLogFromHistory,
  previousExercisePerformance,
  previousSetSummary,
  progressMetricValue,
  progressionAdvice,
  refreshProgramFields,
  rirRequiredForExercise,
  sevenDayAverage,
  shouldShowLoadInput,
  targetRIRForExercise,
  targetRIRForSet,
  totalRepsForExerciseLog,
  trackingTypeForExercise,
  trendMetricLabels,
  validLoadValue,
  weeklySummaries,
  workoutVolume,
} from "./lib/progress";
import {
  createLocalBackup,
  defaultSettings,
  deleteWorkoutLog,
  getLocalBackups,
  loadAppData,
  LocalBackup,
  saveBodyWeightLog,
  saveAppData,
  saveSettings,
  saveWorkoutLog,
  SaveResult,
} from "./lib/storage";
import {
  Achievement,
  buildTodayMission,
  buildWorkoutRecap,
  calculateGamification,
  defaultGamificationSettings,
  DailyActivity,
  GamificationSummary,
  getGamificationSettings,
  loggingQualityForWorkout,
  mergeGamificationSettings,
} from "./lib/gamification";
import { calculateMuscleProgress, muscleGroupOrder, muscleLabels, MuscleProgress, musclesForWorkout, weeklyMuscleFocus } from "./lib/muscles";

type Page = "dashboard" | "today" | "routine" | "logger" | "recap" | "progress" | "weight" | "history" | "settings";
type SaveState = "idle" | "saving" | "cloud" | "local" | "offline" | "syncIssue" | "notSignedIn";

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

const mobilePrimaryItems: { page: Page; label: string; icon: typeof Home }[] = [
  { page: "dashboard", label: "Dashboard", icon: Home },
  { page: "today", label: "Today", icon: Play },
  { page: "progress", label: "Progress", icon: LineChart },
  { page: "weight", label: "Weight", icon: Weight },
];

const mobileMoreItems: { page: Page; label: string; icon: typeof Home }[] = [
  { page: "routine", label: "Routine", icon: BookOpen },
  { page: "history", label: "History", icon: History },
  { page: "settings", label: "Settings", icon: Settings },
];

const mobileMorePages = mobileMoreItems.map((item) => item.page);

const scheduleOverrideChoices: Array<{ dayKey: DayKey; label: string }> = [
  { dayKey: "monday", label: "Monday: Upper A" },
  { dayKey: "tuesday", label: "Tuesday: Lower + Abs" },
  { dayKey: "wednesday", label: "Wednesday: Delts + Arms" },
  { dayKey: "friday", label: "Friday: Upper B" },
  { dayKey: "saturday", label: "Saturday: Specialization" },
  { dayKey: "thursday", label: "Rest / Recovery Check-In" },
];

function parseRoute(): Route {
  const raw = window.location.hash.replace(/^#\/?/, "");
  if (!raw) return { page: "dashboard" };
  const [page, id] = raw.split("/");
  const validPages: Page[] = ["dashboard", "today", "routine", "logger", "recap", "progress", "weight", "history", "settings"];
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

function syncLabel(saveState: SaveState, loading: boolean, cloudStatus: ReturnType<typeof getCloudStatus>): string {
  if (loading) return "Loading";
  if (saveState === "saving") return "Saving...";
  if (saveState === "cloud") return "Saved to cloud";
  if (saveState === "offline") return "Offline, saved locally";
  if (saveState === "syncIssue" || cloudStatus.pendingSync) return "Sync issue: tap to retry";
  if (saveState === "notSignedIn" || !cloudStatus.signedIn) return "Not signed in to cloud sync";
  if (saveState === "local") return "Saved locally";
  return cloudStatus.signedIn ? "Saved to cloud" : "Saved locally";
}

function SyncStatus({
  saveState,
  loading,
  cloudStatus,
  saveError,
  onRetry,
  mobile = false,
}: {
  saveState: SaveState;
  loading: boolean;
  cloudStatus: ReturnType<typeof getCloudStatus>;
  saveError: string;
  onRetry: () => void;
  mobile?: boolean;
}) {
  const isActionable = saveState === "syncIssue" || cloudStatus.pendingSync;
  return (
    <button
      className={classNames("save-state", mobile && "mobile-sync", saveState)}
      onClick={isActionable ? onRetry : undefined}
      title={saveError || cloudStatus.lastError || undefined}
      type="button"
    >
      <Circle size={9} className={saveState} />
      {syncLabel(saveState, loading, cloudStatus)}
    </button>
  );
}

function App() {
  const [route, setRoute] = useState<Route>(parseRoute);
  const [data, setData] = useState<AppData>({ settings: defaultSettings, workoutLogs: [], bodyWeights: [] });
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState("");
  const [cloudStatus, setCloudStatus] = useState(getCloudStatus());
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const dataRef = useRef(data);
  const mobileMoreRef = useRef<HTMLDivElement>(null);
  const gamification = useMemo(() => calculateGamification(data), [data]);
  const gamificationEnabled = gamification.settings.enabled;
  const pendingBadgeUnlockIds = gamification.achievements
    .filter((badge) => badge.unlocked && !gamification.settings.badgeUnlocks[badge.id])
    .map((badge) => badge.id);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    const onHashChange = () => {
      setRoute(parseRoute());
      setMobileMoreOpen(false);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    setMobileMoreOpen(false);
  }, [route.page, route.id]);

  useEffect(() => {
    if (!mobileMoreOpen) return;
    const close = () => setMobileMoreOpen(false);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!mobileMoreRef.current?.contains(event.target as Node)) close();
    };
    const onResize = () => {
      if (window.innerWidth > 1120) close();
    };
    const scrollOptions = { passive: true, capture: true };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("scroll", close, scrollOptions);
    window.addEventListener("resize", onResize);
    window.addEventListener("hashchange", close);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("scroll", close, scrollOptions);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("hashchange", close);
    };
  }, [mobileMoreOpen]);

  useEffect(() => {
    loadAppData()
      .then((loaded) => {
        setData(loaded);
        setCloudStatus(getCloudStatus());
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const updateOnlineStatus = () => {
      const status = getCloudStatus();
      setCloudStatus(status);
      if (status.online && status.signedIn && status.pendingSync) {
        setSaveState("saving");
        syncCloudNow(dataRef.current)
          .then(() => {
            setCloudStatus(getCloudStatus());
            setSaveState("cloud");
          })
          .catch((error) => {
            console.error("Automatic sync after reconnect failed.", error);
            setSaveError(error instanceof Error ? error.message : "Automatic sync failed.");
            setCloudStatus(getCloudStatus());
            setSaveState("syncIssue");
          });
      }
    };
    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);
    return () => {
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
    };
  }, []);

  useEffect(() => {
    let scrollTimer: number | undefined;
    const onFocusIn = (event: FocusEvent) => {
      if (!window.matchMedia("(max-width: 760px)").matches) return;
      const target = event.target as HTMLElement | null;
      if (!target?.matches("input, textarea, select")) return;
      const row = target.closest(".set-row, .log-card, .sticky-complete") as HTMLElement | null;
      if (!row) return;
      window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => {
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        row.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
      }, 90);
    };
    document.addEventListener("focusin", onFocusIn);
    return () => {
      window.clearTimeout(scrollTimer);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, []);

  const applySaveResult = (result: SaveResult) => {
    const status = getCloudStatus();
    setCloudStatus(status);
    setSaveError(result.error ?? status.lastError ?? "");
    if (result.cloudSaved) setSaveState("cloud");
    else if (result.offline && result.signedIn) setSaveState("offline");
    else if (result.error || result.queued || status.pendingSync) setSaveState("syncIssue");
    else if (!result.signedIn) setSaveState("notSignedIn");
    else setSaveState("local");
  };

  const retrySync = async () => {
    setSaveState("saving");
    setSaveError("");
    try {
      await syncCloudNow(data);
      const status = getCloudStatus();
      setCloudStatus(status);
      setSaveState(status.signedIn ? "cloud" : "notSignedIn");
    } catch (error) {
      console.error("Manual sync failed.", error);
      setSaveError(error instanceof Error ? error.message : "Manual sync failed.");
      setCloudStatus(getCloudStatus());
      setSaveState("syncIssue");
    }
  };

  const persistSettings = (settings: ProgramSettings) => {
    setSaveState("saving");
    setSaveError("");
    setData((previous) => {
      const updatedSettings = { ...settings, updatedAt: new Date().toISOString() };
      const effectiveStart = effectiveProgramStartDate(updatedSettings, previous.workoutLogs);
      const next = {
        ...previous,
        settings: updatedSettings,
        workoutLogs: previous.workoutLogs.map((log) => refreshProgramFields(log, effectiveStart)),
      };
      saveSettings(updatedSettings, next)
        .then(applySaveResult)
        .catch((error) => {
          console.error("Settings save failed.", error);
          setSaveError(error instanceof Error ? error.message : "Settings save failed.");
          setSaveState("syncIssue");
        });
      return next;
    });
  };

  useEffect(() => {
    if (loading || !gamificationEnabled || !pendingBadgeUnlockIds.length) return;
    const current = getGamificationSettings(data.settings);
    const nextUnlocks = { ...current.badgeUnlocks };
    pendingBadgeUnlockIds.forEach((id) => {
      nextUnlocks[id] = nextUnlocks[id] ?? new Date().toISOString();
    });
    persistSettings({
      ...data.settings,
      gamification: {
        ...current,
        badgeUnlocks: nextUnlocks,
      },
    });
  }, [loading, gamificationEnabled, pendingBadgeUnlockIds.join("|")]);

  const persistWorkout = (log: WorkoutLog) => {
    setSaveState("saving");
    setSaveError("");
    setData((previous) => {
      const effectiveStart = effectiveProgramStartDate(previous.settings, previous.workoutLogs, log.date);
      const updatedLog = refreshProgramFields({ ...log, updatedAt: new Date().toISOString() }, effectiveStart);
      const next = {
        ...previous,
        workoutLogs: [updatedLog, ...previous.workoutLogs.filter((item) => item.id !== updatedLog.id)].sort((a, b) =>
          b.date.localeCompare(a.date),
        ),
      };
      saveWorkoutLog(updatedLog, next)
        .then(applySaveResult)
        .catch((error) => {
          console.error("Workout save failed.", error);
          setSaveError(error instanceof Error ? error.message : "Workout save failed.");
          setSaveState("syncIssue");
        });
      return next;
    });
  };

  const persistWeight = (log: BodyWeightLog) => {
    setSaveState("saving");
    setSaveError("");
    setData((previous) => {
      const updatedLog = { ...log, updatedAt: new Date().toISOString() };
      const next = {
        ...previous,
        bodyWeights: [updatedLog, ...previous.bodyWeights.filter((item) => item.id !== updatedLog.id)].sort((a, b) =>
          a.date.localeCompare(b.date),
        ),
      };
      saveBodyWeightLog(updatedLog, next)
        .then(applySaveResult)
        .catch((error) => {
          console.error("Body weight save failed.", error);
          setSaveError(error instanceof Error ? error.message : "Body weight save failed.");
          setSaveState("syncIssue");
        });
      return next;
    });
  };

  const removeWorkout = (id: string) => {
    setSaveState("saving");
    setSaveError("");
    setData((previous) => {
      const next = { ...previous, workoutLogs: previous.workoutLogs.filter((log) => log.id !== id) };
      deleteWorkoutLog(id, previous)
        .then(applySaveResult)
        .catch((error) => {
          console.error("Workout delete failed.", error);
          setSaveError(error instanceof Error ? error.message : "Workout delete failed.");
          setSaveState("syncIssue");
        });
      return next;
    });
  };

  const startWorkout = (date = todayISO(), performedDayKey?: DayKey) => {
    const settings = data.settings.startDate
      ? data.settings
      : { ...data.settings, startDate: date, status: "active" as const, updatedAt: new Date().toISOString() };
    const sameDayLogs = data.workoutLogs.filter((item) => item.date === date);
    const requestedDayLogs = performedDayKey ? sameDayLogs.filter((item) => item.dayKey === performedDayKey) : sameDayLogs;
    const existing = sameDayLogs.find((item) => item.status === "draft") ?? sameDayLogs.find((item) => item.status === "completed") ?? sameDayLogs[0];
    const requestedExisting =
      requestedDayLogs.find((item) => item.status === "draft") ??
      requestedDayLogs.find((item) => item.status === "completed") ??
      requestedDayLogs[0];
    const log = requestedExisting ?? (performedDayKey ? undefined : existing) ?? prefillWorkoutLogFromHistory(getOrCreateLog(date, data.workoutLogs, settings, performedDayKey), data.workoutLogs);
    if (!data.settings.startDate) {
      persistSettings(settings);
    }
    if (!data.workoutLogs.some((item) => item.id === log.id)) {
      persistWorkout(log);
    }
    navigate("logger", log.id);
  };

  const completeRestDay = (date = todayISO(), mode: NonNullable<WorkoutLog["restDay"]>["mode"] = "full-rest") => {
    const settings = data.settings.startDate
      ? data.settings
      : { ...data.settings, startDate: date, status: "active" as const, updatedAt: new Date().toISOString() };
    const dayKey = dayKeyForDate(date);
    const existing = data.workoutLogs.find((item) => item.date === date && item.dayKey === dayKey);
    const log = existing ?? getOrCreateLog(date, data.workoutLogs, settings);
    const completed: WorkoutLog = {
      ...log,
      status: "completed",
      completedAt: new Date().toISOString(),
      restDay: {
        mode,
        duration: mode === "easy-walk" ? log.restDay?.duration ?? "20" : log.restDay?.duration,
        intensityNotes: log.restDay?.intensityNotes ?? (mode === "easy-walk" ? "Easy, conversational pace" : "No lifting. Recovery respected."),
        completed: true,
      },
    };
    if (!data.settings.startDate) persistSettings(settings);
    persistWorkout(completed);
    navigate("recap", completed.id);
  };

  const markRecapSeen = (workoutId: string) => {
    const current = getGamificationSettings(data.settings);
    if (current.seenRecaps.includes(workoutId)) return;
    persistSettings({
      ...data.settings,
      gamification: {
        ...current,
        seenRecaps: [...current.seenRecaps, workoutId],
      },
    });
  };

  const skipBodyWeightToday = () => {
    const current = getGamificationSettings(data.settings);
    const today = todayISO();
    if ((current.bodyWeightPromptSkips ?? []).includes(today)) return;
    persistSettings({
      ...data.settings,
      gamification: {
        ...current,
        bodyWeightPromptSkips: [...(current.bodyWeightPromptSkips ?? []), today],
      },
    });
  };

  const repairGamification = () => {
    createLocalBackup(data, "before-gamification-repair");
    const current = getGamificationSettings(data.settings);
    const summary = calculateGamification(data);
    const nextUnlocks = { ...current.badgeUnlocks };
    summary.achievements.filter((badge) => badge.unlocked).forEach((badge) => {
      const existing = nextUnlocks[badge.id];
      const unlockedAt = badge.unlockedAt ?? todayISO();
      if (!existing || unlockedAt < existing) nextUnlocks[badge.id] = unlockedAt;
    });
    persistSettings({
      ...data.settings,
      gamification: mergeGamificationSettings({ ...current, badgeUnlocks: nextUnlocks }, current, summary.settings),
    });
  };

  const loadDevSampleData = () => {
    const sample = createGamificationSampleData(data.settings);
    setData(sample);
    saveAppData(sample).then(applySaveResult);
  };

  const effectiveStart = effectiveProgramStartDate(data.settings, data.workoutLogs);
  const cycleInfo = getCycleInfo(effectiveStart, todayISO());

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => navigate("dashboard")}>
          <span className="brand-mark">
            <Flame size={20} />
          </span>
          <span>
            <strong>Eli’s Cycle Tracker</strong>
            <small>Training cycle</small>
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
        <SyncStatus saveState={saveState} loading={loading} cloudStatus={cloudStatus} saveError={saveError} onRetry={retrySync} />
      </aside>

      <main className="main">
        <TopBar cycleInfo={cycleInfo} settings={data.settings} data={data} startWorkout={startWorkout} />
        {loading ? (
          <LoadingScreen />
        ) : (
          <>
            {route.page === "dashboard" && (
              <Dashboard
                data={data}
                gamification={gamification}
                gamificationEnabled={gamificationEnabled}
                cloudStatus={cloudStatus}
                startWorkout={startWorkout}
                completeRestDay={completeRestDay}
                skipBodyWeightToday={skipBodyWeightToday}
                onSyncNow={retrySync}
              />
            )}
            {route.page === "today" && <TodayPage data={data} startWorkout={startWorkout} />}
            {route.page === "routine" && <RoutinePage />}
            {route.page === "logger" && (
              <LoggerPage
                logId={route.id}
                data={data}
                onSave={persistWorkout}
                onDelete={removeWorkout}
                startWorkout={startWorkout}
                gamification={gamification}
              />
            )}
            {route.page === "recap" && (
              <RecapPage
                logId={route.id}
                data={data}
                gamification={gamification}
                markSeen={markRecapSeen}
                startWorkout={startWorkout}
              />
            )}
            {route.page === "progress" && <ProgressPage data={data} gamification={gamification} gamificationEnabled={gamificationEnabled} />}
            {route.page === "weight" && <WeightPage data={data} onSave={persistWeight} />}
            {route.page === "history" && <HistoryPage data={data} startWorkout={startWorkout} />}
            {route.page === "settings" && (
              <SettingsPage
                settings={data.settings}
                onSave={persistSettings}
                cloudStatus={cloudStatus}
                data={data}
                refreshCloudStatus={() => setCloudStatus(getCloudStatus())}
                onSyncNow={retrySync}
                onRepairGamification={repairGamification}
                onLoadDevSample={loadDevSampleData}
                onImport={(importedData) => {
                  createLocalBackup(data, "before-import");
                  const settings = { status: "active" as const, ...importedData.settings, updatedAt: new Date().toISOString() };
                  const startDate = effectiveProgramStartDate(settings, importedData.workoutLogs);
                  const normalized = {
                    ...importedData,
                    settings,
                    workoutLogs: importedData.workoutLogs.map((log) => refreshProgramFields(log, startDate)),
                  };
                  setData(normalized);
                  saveAppData(normalized)
                    .then(applySaveResult)
                    .catch((error) => {
                      console.error("Import save failed.", error);
                      setSaveError(error instanceof Error ? error.message : "Import save failed.");
                      setSaveState("syncIssue");
                    });
                }}
              />
            )}
          </>
        )}
      </main>

      <SyncStatus
        saveState={saveState}
        loading={loading}
        cloudStatus={cloudStatus}
        saveError={saveError}
        onRetry={retrySync}
        mobile
      />

      <div className="mobile-nav-shell" ref={mobileMoreRef}>
        {mobileMoreOpen && (
          <div className="mobile-more-popover" id="mobile-more-menu" role="menu" aria-label="More navigation">
            {mobileMoreItems.map((item) => (
              <button
                key={item.page}
                type="button"
                role="menuitem"
                className={classNames(route.page === item.page && "active")}
                onClick={() => {
                  setMobileMoreOpen(false);
                  navigate(item.page);
                }}
              >
                <item.icon size={19} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        )}
        <nav className="bottom-nav" aria-label="Mobile navigation">
          {mobilePrimaryItems.map((item) => (
            <button
              key={item.page}
              type="button"
              className={classNames(route.page === item.page && "active")}
              onClick={() => navigate(item.page)}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
            </button>
          ))}
          <button
            type="button"
            className={classNames((mobileMorePages.includes(route.page) || mobileMoreOpen) && "active", mobileMoreOpen && "open")}
            aria-controls="mobile-more-menu"
            aria-expanded={mobileMoreOpen}
            onClick={() => setMobileMoreOpen((open) => !open)}
          >
            <MoreHorizontal size={18} />
            <span>More</span>
          </button>
        </nav>
      </div>
    </div>
  );
}

function TopBar({
  cycleInfo,
  settings,
  data,
  startWorkout,
}: {
  cycleInfo: ReturnType<typeof getCycleInfo>;
  settings: ProgramSettings;
  data: AppData;
  startWorkout: (date?: string, performedDayKey?: DayKey) => void;
}) {
  const today = todayISO();
  const todayLog = data.workoutLogs.find((log) => log.date === today && log.status === "draft") ??
    data.workoutLogs.find((log) => log.date === today && log.status === "completed");
  const workout = workoutDays[todayLog?.dayKey ?? dayKeyForDate(today)];
  const actionLabel = todayLog?.status === "draft" ? "Continue Workout" : todayLog?.status === "completed" ? "View Recap" : "Start Today";
  const action = () => {
    if (todayLog?.status === "completed") navigate("recap", todayLog.id);
    else startWorkout(today);
  };
  return (
    <header className="top-bar">
      <div>
        <p className="eyebrow">Program Week {cycleInfo.programWeek} · Cycle {cycleInfo.cycle}, Week {cycleInfo.weekInCycle} of 8</p>
        <h1>{workout.shortTitle}</h1>
        <span>
          {formatDate(today, { weekday: "long" })}
          {settings.startDate ? ` from program start ${formatDate(settings.startDate)}` : " · start date will lock on first workout"}
          {settings.status && settings.status !== "active" ? ` · ${settings.status}` : ""}
        </span>
      </div>
      <button className="primary-action" onClick={action}>
        <Play size={18} />
        {actionLabel}
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

function Dashboard({
  data,
  gamification,
  gamificationEnabled,
  cloudStatus,
  startWorkout,
  completeRestDay,
  skipBodyWeightToday,
  onSyncNow,
}: {
  data: AppData;
  gamification: GamificationSummary;
  gamificationEnabled: boolean;
  cloudStatus: ReturnType<typeof getCloudStatus>;
  startWorkout: (date?: string, performedDayKey?: DayKey) => void;
  completeRestDay: (date?: string, mode?: NonNullable<WorkoutLog["restDay"]>["mode"]) => void;
  skipBodyWeightToday: () => void;
  onSyncNow: () => void;
}) {
  const today = todayISO();
  const dayKey = dayKeyForDate(today);
  const workout = workoutDays[dayKey];
  const startDate = effectiveProgramStartDate(data.settings, data.workoutLogs, today);
  const progressSettings = { ...data.settings, startDate };
  const cycleInfo = getCycleInfo(startDate, today);
  const currentWeek = cycleInfo.programWeek;
  const weekCompleted = completedWorkoutsThisWeek(data.workoutLogs, progressSettings, today);
  const elapsedThisWeek = plannedTrainingDaysElapsedThisWeek(progressSettings, today);
  const totalCompleted = completedProgramWorkouts(data.workoutLogs);
  const cycleCompleted = completedWorkoutsInCurrentCycle(data.workoutLogs, progressSettings, today);
  const cycleTarget = cycleWorkoutTarget();
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
  const mission = buildTodayMission(data, cloudStatus.pendingSync);
  const todayLog = data.workoutLogs.find((log) => log.date === today && (log.status === "draft" || log.status === "completed"));
  const draftLogs = data.workoutLogs.filter((log) => log.status === "draft").slice(0, 3);
  const heatPreview = gamification.activities.slice(-35);
  const weeklyMuscleProgress = calculateMuscleProgress(data, gamification.prs);
  const weeklyFocus = weeklyMuscleFocus(weeklyMuscleProgress);
  const todayMuscles = Array.from(new Set(workout.exercises.flatMap((exercise) => exercise.muscleGroups ?? []))).slice(0, 5);
  const weeklyPRs = gamification.prs.filter((pr) => pr.date >= addDays(today, -6)).sort((a, b) => b.date.localeCompare(a.date));
  const nextBadge = [...gamification.achievements]
    .filter((badge) => !badge.unlocked)
    .sort((a, b) => (b.progressCurrent / Math.max(1, b.progressTarget)) - (a.progressCurrent / Math.max(1, a.progressTarget)))[0];
  const scoreReasons = [
    `${weekCompleted}/${trainingDayKeys.length} workouts complete`,
    `${gamification.executionScore.logging}% logging quality`,
    `${weeklyPRs.length} PR${weeklyPRs.length === 1 ? "" : "s"} this week`,
  ];
  const handleMissionAction = () => {
    if (mission.action === "sync") onSyncNow();
    else if (mission.action === "continue-workout" || mission.action === "start-workout") startWorkout(today);
    else if (mission.action === "rest-checkin") completeRestDay(today, "full-rest");
    else if (mission.action === "log-weight") navigate("weight");
    else if (mission.action === "progress") navigate("progress");
    else if (mission.workoutId) navigate("recap", mission.workoutId);
  };

  return (
    <div className="page-grid">
      {gamificationEnabled ? (
        <>
          <section className="mission-panel">
            <div>
              <p className="eyebrow">Today's Mission</p>
              <h2>{mission.title}</h2>
              <p>{mission.subtitle}</p>
              <div className="mission-meta">
                <span>Up to {mission.availableXP} XP available</span>
                <span>{mission.focusCue}</span>
              </div>
              {!!todayMuscles.length && <div className="mission-muscles"><small>Body-part focus</small>{todayMuscles.map((group) => <span key={group}>{muscleLabels[group]}</span>)}</div>}
            </div>
            <div className="mission-action">
              <span>Next Best Action</span>
              <strong>{mission.nextBestAction}</strong>
              <button className="primary-action" onClick={handleMissionAction}>
                <Play size={18} />
                {mission.nextBestAction}
              </button>
              {mission.action === "log-weight" && (
                <button className="secondary-action subtle" type="button" onClick={skipBodyWeightToday}>
                  Skip Weight Today
                </button>
              )}
              {!todayLog && (
                <ScheduleOverrideChooser onChoose={(day) => startWorkout(today, day)} compact />
              )}
            </div>
          </section>

          {!!draftLogs.length && (
            <section className="panel draft-panel">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Unfinished</p>
                  <h3>Draft workouts saved locally</h3>
                </div>
              </div>
              <div className="draft-list">
                {draftLogs.map((log) => (
                  <button key={log.id} className="draft-card" onClick={() => navigate("logger", log.id)}>
                    <strong>{log.workoutTitle}</strong>
                    <span>{formatDate(log.date)} · {completedSetCount(log)} sets logged</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="game-grid">
            <article className="game-card level-card telemetry-card">
              <div className="game-card-heading"><div><p className="eyebrow">Level {gamification.level.level}</p><h3>{gamification.level.title}</h3></div><strong>{gamification.totalXP.toLocaleString()} XP</strong></div>
              <div className="xp-bar"><i style={{ width: `${gamification.level.progressPercent}%` }} /></div>
              <span>{gamification.level.xpToNext} XP to Level {gamification.level.level + 1}</span>
              {nextBadge && <small>Next badge · {nextBadge.title} ({nextBadge.progressCurrent}/{nextBadge.progressTarget})</small>}
            </article>
            <article className="game-card score-card lock-in-card">
              <div className="lock-score" style={{ "--lock-score": `${gamification.executionScore.overall * 3.6}deg` } as React.CSSProperties}><span>{gamification.executionScore.overall}</span><small>/100</small></div>
              <div><p className="eyebrow">Lock-In Score</p><h3>{gamification.executionScore.label}</h3><ul>{scoreReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></div>
            </article>
            <article className="game-card streak-card telemetry-card">
              <p className="eyebrow">Streaks</p>
              <div className="streak-metrics"><span><strong>{gamification.streaks.dailyCheckIn.current}</strong>Daily check-in</span><span><strong>{gamification.streaks.workout.current}</strong>Workout</span><span><strong>{gamification.streaks.weeklyCompletion.current}</strong>Perfect weeks</span></div>
              <small>{gamification.streaks.dailyCheckIn.graceUsedThisWeek ? "Grace day used this week. The next check-in keeps momentum." : "One grace day remains available this week."}</small>
            </article>
          </section>

          <section className="panel heat-preview-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Activity</p>
                <h3>Last 5 weeks</h3>
              </div>
              <button className="secondary-action" onClick={() => navigate("progress")}>Full view</button>
            </div>
            <HeatMap activities={heatPreview} compact />
          </section>

          <section className="game-grid two">
            <article className="panel">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Recent PRs</p>
                  <h3>Wins</h3>
                </div>
              </div>
              <MiniList
                empty="No PRs yet. Complete a few sessions and clean improvements will show here."
                items={gamification.recentPRs.map((pr) => `${formatDate(pr.date)} · ${pr.exerciseName}: ${pr.label}`)}
              />
            </article>
            <article className="panel">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Badges</p>
                  <h3>Recently unlocked</h3>
                </div>
              </div>
              <MiniList
                empty="Badges unlock from normal execution."
                items={gamification.recentBadges.map((badge) => badge.title)}
              />
            </article>
          </section>

          <section className="panel weekly-review-card">
            <div className="section-heading">
              <div><p className="eyebrow">Weekly review</p><h3>Execution at a glance</h3></div>
              <button className="secondary-action" onClick={() => navigate("progress")}>Open progress</button>
            </div>
            <div className="focus-summary-grid">
              <div><span>Workouts</span><strong>{weekCompleted}/{trainingDayKeys.length}</strong></div>
              <div><span>Most trained</span><strong>{weeklyFocus.leading?.label ?? "Waiting for logs"}</strong></div>
              <div><span>Lightest area</span><strong>{weeklyFocus.lightest?.label ?? "Waiting for logs"}</strong></div>
              <div><span>Consistency</span><strong>{gamification.executionScore.consistency}/100</strong></div>
            </div>
            <div className="weekly-review-callout"><span>Best recent win</span><strong>{weeklyPRs[0] ? `${weeklyPRs[0].exerciseName} · ${weeklyPRs[0].label}` : "Complete repeat sessions to establish a real PR."}</strong><p>{weeklyFocus.lightest?.score === 0 ? `${weeklyFocus.lightest.label} is light. Let its scheduled workout address it, without adding junk volume.` : `Next action: ${mission.nextBestAction}`}</p></div>
          </section>
        </>
      ) : (
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
      )}

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
        <ProgressRing value={(cycleCompleted / cycleTarget) * 100} label="cycle done" />
      </div>

      <section className="stats-grid">
        <StatCard
          icon={CalendarDays}
          label="Workouts this week"
          value={`${weekCompleted}/${Math.max(elapsedThisWeek, 1)} due`}
          detail={`Program Week ${currentWeek}. Cycle ${cycleInfo.cycle}, Week ${cycleInfo.weekInCycle} of 8.`}
          tone={weekCompleted >= elapsedThisWeek ? "success" : "warning"}
        />
        <StatCard
          icon={Dumbbell}
          label="This cycle"
          value={`${cycleCompleted}/${cycleTarget}`}
          detail={`Cycle ${cycleInfo.cycle} workouts completed.`}
        />
        <StatCard
          icon={History}
          label="All-time completed"
          value={`${totalCompleted}`}
          detail="Completed training days across every cycle."
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
            const date = addDays(startDate, (currentWeek - 1) * 7 + index);
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

function TodayPage({ data, startWorkout }: { data: AppData; startWorkout: (date?: string, performedDayKey?: DayKey) => void }) {
  const today = todayISO();
  const scheduledDayKey = dayKeyForDate(today);
  const todayLog = data.workoutLogs.find((item) => item.date === today && item.status === "draft") ??
    data.workoutLogs.find((item) => item.date === today && item.status === "completed") ??
    data.workoutLogs.find((item) => item.date === today);
  const dayKey = todayLog?.dayKey ?? scheduledDayKey;
  const workout = workoutDays[dayKey];
  const log = todayLog;
  return (
    <div className="content-stack">
      <section className="panel today-panel">
        <div>
          <p className="eyebrow">{formatDate(today, { weekday: "long" })}</p>
          <h2>{workout.title}</h2>
          <p>{workout.subtitle}</p>
          {log?.isScheduleOverride && (
            <div className="override-note">
              Schedule override today: performed {workout.shortTitle} instead of {workoutDays[log.scheduledDayKey ?? scheduledDayKey].shortTitle}.
            </div>
          )}
        </div>
        <button className="primary-action" onClick={() => startWorkout(today)}>
          <Play size={18} />
          {log?.status === "draft" ? "Continue Workout" : log?.status === "completed" ? "Open Completed Log" : "Start Workout"}
        </button>
      </section>
      {!log && (
        <section className="panel override-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Schedule flexibility</p>
              <h3>Do a Different Workout Today</h3>
            </div>
          </div>
          <p className="muted-copy">This logs the selected routine day for today only. Tomorrow follows the normal calendar schedule.</p>
          <ScheduleOverrideChooser onChoose={(day) => startWorkout(today, day)} />
        </section>
      )}
      <WorkoutDayDetail dayKey={dayKey} compact={false} />
    </div>
  );
}

function ScheduleOverrideChooser({ onChoose, compact = false }: { onChoose: (day: DayKey) => void; compact?: boolean }) {
  return (
    <details className={classNames("override-chooser", compact && "compact")}>
      <summary>Do a Different Workout Today</summary>
      <div className="override-grid">
        {scheduleOverrideChoices.map((choice) => (
          <button key={choice.dayKey} type="button" className="secondary-action" onClick={() => onChoose(choice.dayKey)}>
            {choice.label}
          </button>
        ))}
      </div>
      <p>This changes today only. Tomorrow follows the normal calendar schedule.</p>
    </details>
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
          <h2>Eli’s Aesthetic Hypertrophy Cycle</h2>
          <p>8-week cycle structure that repeats until you archive or reset it.</p>
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

function rirSummary(exercise: Exercise): string {
  const label = effortLabelForExercise(exercise);
  if (exercise.targetRIRByPhase) {
    if (label === "Control cue") return `${label}: ${exercise.effortCue ?? exercise.targetRIRByPhase.setup}`;
    return `${label} setup ${exercise.targetRIRByPhase.setup} · growth ${exercise.targetRIRByPhase.growth} · push ${exercise.targetRIRByPhase.push}`;
  }
  return `${label} ${targetRIRForExercise(exercise)}`;
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
            <article key={exercise.id} className={classNames("exercise-card", exercise.supersetGroup && "superset-card")}>
              <div className="exercise-index">{exercise.superset ?? index + 1}</div>
              <div>
                <h4>{exercise.name}</h4>
                <div className="exercise-meta">
                  <span>{exercise.sets} x {exercise.reps ?? exercise.seconds}</span>
                  <span>{exercise.rest}</span>
                  <span>{rirSummary(exercise)}</span>
                  {shouldShowLoadInput(exercise) && <span>{loadLabelForExercise(exercise)}</span>}
                  <span>{exercise.target}</span>
                </div>
                {exercise.supersetLabel && <span className="superset-chip">{exercise.supersetLabel}</span>}
                {!compact && <p>{exercise.notes}</p>}
                {exercise.effortCue && exercise.effortMode !== "control" && <small>{exercise.effortCue}</small>}
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
  gamification,
}: {
  logId?: string;
  data: AppData;
  onSave: (log: WorkoutLog) => void;
  onDelete: (id: string) => void;
  startWorkout: (date?: string, performedDayKey?: DayKey) => void;
  gamification: GamificationSummary;
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
  const originalWorkout = log.isScheduleOverride ? workoutDays[log.scheduledDayKey ?? dayKeyForDate(log.date)] : undefined;
  const updateLog = (mutator: (current: WorkoutLog) => WorkoutLog) => onSave(mutator(log));
  const loggingQuality = loggingQualityForWorkout(log);
  const prCount = gamification.prs.filter((pr) => pr.workoutId === log.id).length;
  const possibleXP = isTrainingDay(log.dayKey) ? (workout.cardio ? 185 : 170) : 40;
  const completeWorkout = () => {
    const completed = {
      ...log,
      status: "completed" as const,
      completedAt: new Date().toISOString(),
      restDay: !isTrainingDay(log.dayKey)
        ? log.restDay ?? { mode: "full-rest" as const, intensityNotes: "No lifting. Recovery respected.", completed: true }
        : log.restDay,
      exerciseLogs: log.exerciseLogs.map((exerciseLog) => ({
        ...exerciseLog,
        completed:
          exerciseLog.completed ||
          (!!exerciseLog.sets.length && exerciseLog.sets.every((set) => set.completed)) ||
          !!exerciseLog.cardio?.completed,
      })),
    };
    onSave(completed);
    navigate("recap", completed.id);
  };

  return (
    <div className="content-stack logger-page">
      <section className="panel logger-header">
        <div>
          <p className="eyebrow">Workout logger</p>
          <h2>{log.workoutTitle}</h2>
          <p>
            {formatDate(log.date, { weekday: "long", year: "numeric" })} · Program Week {log.week} · Cycle {log.cycle ?? Math.floor((log.week - 1) / 8) + 1}, Week {log.weekInCycle ?? ((log.week - 1) % 8) + 1} · {log.status}
          </p>
          {originalWorkout && (
            <div className="override-note">
              Schedule override: performed {workout.shortTitle} · originally scheduled {originalWorkout.shortTitle}.
            </div>
          )}
        </div>
        <div className="logger-actions">
          <button className="secondary-action danger" onClick={() => {
            if (!window.confirm("Delete this workout log? This removes it locally and from cloud sync when signed in.")) return;
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

      {gamification.settings.enabled && (
        <div className="logger-game-strip">
          <span>Possible XP today: {possibleXP}</span>
          <span>Logging quality: {loggingQuality}%</span>
          {!!prCount && <span>New PR signals: {prCount}</span>}
        </div>
      )}

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
          <div className="settings-actions">
            <button className="primary-action" type="button" onClick={() => {
              updateLog((current) => ({
                ...current,
                status: "completed",
                completedAt: new Date().toISOString(),
                restDay: { mode: "full-rest", intensityNotes: "No lifting. Recovery respected.", completed: true },
              }));
              navigate("recap", log.id);
            }}>
              Full rest complete
            </button>
            <button className="secondary-action" type="button" onClick={() => {
              updateLog((current) => ({
                ...current,
                status: "completed",
                completedAt: new Date().toISOString(),
                restDay: { mode: "easy-walk", duration: "20", intensityNotes: "Easy, conversational pace", completed: true },
              }));
              navigate("recap", log.id);
            }}>
              Easy walk done
            </button>
            <button className="secondary-action" type="button" onClick={() => {
              updateLog((current) => ({
                ...current,
                status: "completed",
                completedAt: new Date().toISOString(),
                restDay: { mode: "recovery-checkin", intensityNotes: "Recovery check-in complete.", completed: true },
              }));
              navigate("recap", log.id);
            }}>
              Recovery check-in
            </button>
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

function RecapPage({
  logId,
  data,
  gamification,
  markSeen,
  startWorkout,
}: {
  logId?: string;
  data: AppData;
  gamification: GamificationSummary;
  markSeen: (id: string) => void;
  startWorkout: (date?: string, performedDayKey?: DayKey) => void;
}) {
  const recap = logId ? buildWorkoutRecap(logId, data) : null;
  useEffect(() => {
    if (recap?.log.id) markSeen(recap.log.id);
  }, [recap?.log.id]);
  if (!recap) {
    return (
      <section className="panel empty-state">
        <h2>No recap found</h2>
        <p>Open a completed workout from history or start today's workout.</p>
        <button className="primary-action" onClick={() => startWorkout(todayISO())}>
          <Play size={18} />
          Start today
        </button>
      </section>
    );
  }
  const trainedMuscles = musclesForWorkout(recap.log);
  const recapMuscleProgress = calculateMuscleProgress(data, gamification.prs, recap.log.date, recap.log.date);
  return (
    <div className="content-stack">
      <section className="recap-hero">
        <p className="eyebrow">Workout Complete</p>
        <h2>+{recap.xpEarned} XP</h2>
        <p>{recap.log.workoutTitle} · {formatDate(recap.log.date, { weekday: "long", year: "numeric" })}</p>
        <div className="xp-bar large"><i style={{ width: `${recap.level.progressPercent}%` }} /></div>
        <span>Level {recap.level.level} · {recap.level.progressPercent}% to Level {recap.level.level + 1}</span>
      </section>

      <section className="stats-grid compact">
        <StatCard icon={BarChart3} label="Workout Score" value={`${recap.workoutScore}/100`} detail="Completion, logging quality, and PR signals." />
        <StatCard icon={Dumbbell} label="Exercises / sets" value={`${recap.exercisesCompleted} / ${recap.setsCompleted}`} detail="Exercises completed and sets checked off." />
        <StatCard icon={CheckCircle2} label="Logging quality" value={`${recap.loggingQuality}%`} detail="Set fields completed with valid values." />
        <StatCard icon={Flame} label="Streak status" value={recap.streakText} detail="Workout streak is separate from daily check-ins." />
      </section>

      {!!trainedMuscles.length && (
        <MuscleMapPanel progress={recapMuscleProgress} title="Workout muscle impact" rangeLabel="This session" compact />
      )}

      <section className="game-grid two">
        <article className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">PRs</p>
              <h3>{recap.prs.length ? `${recap.prs.length} new signals` : "No new PRs"}</h3>
            </div>
          </div>
          <MiniList empty="Good execution still counts. PRs show when performance beats prior valid logs." items={recap.prs.slice(0, 5).map((pr) => `${pr.exerciseName}: ${pr.label}`)} />
        </article>
        <article className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Badges</p>
              <h3>{recap.badgesUnlocked.length ? "Unlocked" : "Progress saved"}</h3>
            </div>
          </div>
          <MiniList empty="No new badge this time." items={recap.badgesUnlocked.map((badge) => badge.title)} />
        </article>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Next time</p>
            <h3>{recap.nextFocus}</h3>
          </div>
        </div>
        <div className="recap-events">
          {recap.xpEvents.map((event) => (
            <span key={event.key}>{event.label} · +{event.xp} XP</span>
          ))}
        </div>
        <div className="settings-actions">
          <button className="primary-action" onClick={() => navigate("dashboard")}>Back to dashboard</button>
          <button className="secondary-action" onClick={() => navigate("logger", recap.log.id)}>Edit workout</button>
          <button className="secondary-action" onClick={() => navigate("progress")}>View progress</button>
        </div>
      </section>

      {gamification.settings.showCelebrations && (
        <div className="celebration-line">Clean execution logged. Keep the routine boring enough to repeat.</div>
      )}
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
    if (!exercise) return;
    const sets = exerciseLog.sets.map((set) => {
      if (set.id !== setId) return set;
      return autoCompletedSet({ ...set, ...patch }, exercise);
    });
    onChange({
      ...exerciseLog,
      sets,
      completed: sets.length > 0 ? sets.every((set) => set.completed) : exerciseLog.completed,
    });
  };

  if (cardio) {
    const updateCardio = (patch: Partial<NonNullable<ExerciseLog["cardio"]>>) => {
      const nextCardio: NonNullable<ExerciseLog["cardio"]> = {
        ...exerciseLog.cardio,
        ...patch,
        completed: cardioInputsAreValid(patch.duration ?? exerciseLog.cardio?.duration),
      };
      onChange({ ...exerciseLog, completed: nextCardio.completed, cardio: nextCardio });
    };
    return (
      <section className="panel log-card cardio-log">
        <div className="log-card-heading">
          <div>
            <p className="eyebrow">Cardio</p>
            <h3>{cardio.name}</h3>
            <p>{cardio.time} · {cardio.intensity}</p>
          </div>
          <span className={classNames("completion-state", exerciseLog.cardio?.completed && "complete")}>
            {exerciseLog.cardio?.completed ? "Duration logged" : "Enter duration to complete"}
          </span>
        </div>
        {cardio.notes && <div className="guidance-card">{cardio.notes}</div>}
        <div className="input-grid">
          <NumberField
            label="Duration"
            value={exerciseLog.cardio?.duration ?? ""}
            placeholder="min"
            onChange={(value) => updateCardio({ duration: value })}
          />
          <NumberField
            label="Incline"
            value={exerciseLog.cardio?.incline ?? ""}
            placeholder="%"
            onChange={(value) => updateCardio({ incline: value })}
          />
          <NumberField
            label="Speed"
            value={exerciseLog.cardio?.speed ?? ""}
            placeholder="mph"
            onChange={(value) => updateCardio({ speed: value })}
          />
        </div>
        <label className="field-label">
          Intensity notes
          <textarea
            value={exerciseLog.cardio?.intensityNotes ?? ""}
            onChange={(event) =>
              updateCardio({ intensityNotes: event.target.value })
            }
          />
        </label>
      </section>
    );
  }

  if (!exercise) return null;
  const trackingType = trackingTypeForExercise(exercise);
  const showLoad = shouldShowLoadInput(exercise);
  const loadLabel = loadLabelForExercise(exercise);
  const rirTarget = targetRIRForExercise(exercise, log.weekInCycle);
  const showRir = rirRequiredForExercise(exercise);
  const effortLabel = effortLabelForExercise(exercise);
  const copyPreviousLoad = () => {
    if (!previous || !showLoad) return;
    onChange({
      ...exerciseLog,
      sets: exerciseLog.sets.map((set, index) => autoCompletedSet({
        ...set,
        weight: previous.exerciseLog.sets[index]?.weight ?? set.weight,
      }, exercise)),
    });
  };

  return (
    <section className={classNames("panel log-card", exercise.supersetGroup && "superset-card")}>
      <div className="log-card-heading">
        <div>
          <p className="eyebrow">{exercise.target}</p>
          <h3>{exercise.name}</h3>
          <p>
            {exercise.sets} x {exercise.reps ?? exercise.seconds} · Rest {exercise.rest} · {effortLabel} {rirTarget}
          </p>
          {exercise.supersetLabel && <span className="superset-chip">{exercise.supersetLabel}</span>}
        </div>
        <span className={classNames("completion-state", exerciseLog.completed && "complete")}>
          {exerciseLog.completed ? "All sets complete" : "Auto-completes from valid set data"}
        </span>
      </div>
      <div className="guidance-card">{exercise.notes}</div>
      {exercise.logHint && <div className="guidance-card">{exercise.logHint}</div>}
      {previous && (
        <div className="previous-box">
          <strong>Previous:</strong> {formatDate(previous.workout.date)} ·{" "}
          {showLoad && !loadIsAssistance(exercise) ? `${Math.round(exerciseVolume(previous.exerciseLog)).toLocaleString()} volume · ` : ""}
          {previous.exerciseLog.sets.filter((set) => set.completed).length} sets
          <span>{previousSetSummary(previous.exerciseLog, exercise)}</span>
          {showLoad && (
            <button className="mini-action" type="button" onClick={copyPreviousLoad}>
              Copy previous {loadIsAssistance(exercise) ? "assistance" : "weights"}
            </button>
          )}
        </div>
      )}
      <div className={classNames("set-table", !showLoad && "no-load", !showRir && "no-rir", exercise.unilateral && "unilateral", trackingType === "timed" && "timed")}>
        <div className="set-row header">
          <span>Set</span>
          <span>Target</span>
          {showLoad && <span>{loadIsAssistance(exercise) ? "Assistance" : "Weight"}</span>}
          {trackingType === "timed" ? (
            <span>Seconds</span>
          ) : exercise.unilateral ? (
            <>
              <span>Left</span>
              <span>Right</span>
            </>
          ) : (
            <span>Reps</span>
          )}
          {showRir && <span>RIR</span>}
          <span>Status</span>
        </div>
        {exerciseLog.sets.map((set) => (
          <div key={set.id} className="set-row">
            <div className="set-cell set-number"><span>Set</span><strong>{set.setNumber}</strong></div>
            <div className="set-cell"><span>Target · {showRir ? `RIR ${targetRIRForSet(exercise, log.weekInCycle, set.setNumber)}` : rirTarget}</span><strong>{set.target}</strong></div>
            {showLoad && (
              <label className="set-cell">
                <span>{loadLabel}</span>
                <input value={set.weight ?? ""} onChange={(event) => updateSet(set.id, { weight: event.target.value })} inputMode="decimal" placeholder="lb" />
              </label>
            )}
            {trackingType === "timed" ? (
              <label className="set-cell">
                <span>Seconds</span>
                <input value={set.seconds ?? ""} onChange={(event) => updateSet(set.id, { seconds: event.target.value })} inputMode="numeric" placeholder="sec" />
              </label>
            ) : exercise.unilateral ? (
              <>
                <label className="set-cell">
                  <span>Left</span>
                  <input value={set.leftReps ?? ""} onChange={(event) => updateSet(set.id, { leftReps: event.target.value })} inputMode="numeric" placeholder="L" />
                </label>
                <label className="set-cell">
                  <span>Right</span>
                  <input value={set.rightReps ?? ""} onChange={(event) => updateSet(set.id, { rightReps: event.target.value })} inputMode="numeric" placeholder="R" />
                </label>
              </>
            ) : (
              <label className="set-cell">
                <span>Reps</span>
                <input value={set.reps ?? ""} onChange={(event) => updateSet(set.id, { reps: event.target.value })} inputMode="numeric" placeholder="reps" />
              </label>
            )}
            {showRir && (
              <label className="set-cell">
                <span>RIR</span>
                <input value={set.rir ?? ""} onChange={(event) => updateSet(set.id, { rir: event.target.value })} inputMode="decimal" placeholder="RIR" />
              </label>
            )}
            <div className="set-cell completion-cell">
              <span>Status</span>
              <button
                type="button"
                className={classNames("set-completion-button", set.completed && "complete", set.completionOverride && "overridden")}
                onClick={() => updateSet(set.id, { completionOverride: set.completionOverride ? undefined : "incomplete" })}
                disabled={!set.completed && !set.completionOverride}
                aria-label={set.completed ? `Mark set ${set.setNumber} incomplete` : set.completionOverride ? `Restore automatic completion for set ${set.setNumber}` : `Set ${set.setNumber} is incomplete`}
              >
                {set.completed ? "Complete" : set.completionOverride ? "Use auto" : "Incomplete"}
              </button>
            </div>
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

function MuscleRegion({
  group,
  progress,
  selected,
  onSelect,
  children,
}: {
  group: MuscleGroup;
  progress?: MuscleProgress;
  selected: boolean;
  onSelect: (group: MuscleGroup) => void;
  children: React.ReactNode;
}) {
  const select = () => onSelect(group);
  return (
    <g
      className={classNames("muscle-region", `intensity-${progress?.intensity ?? 0}`, selected && "selected")}
      data-muscle={group}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${muscleLabels[group]}: ${progress?.trend ?? "No recent work"}, ${progress?.sets ?? 0} completed sets`}
      onClickCapture={select}
      onPointerDownCapture={select}
      onPointerDown={select}
      onClick={select}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          select();
        }
      }}
    >
      <title>{muscleLabels[group]}</title>
      {children}
    </g>
  );
}

function AnatomyFigure({
  view,
  byGroup,
  selectedGroup,
  onSelect,
}: {
  view: "front" | "back";
  byGroup: Map<MuscleGroup, MuscleProgress>;
  selectedGroup?: MuscleGroup;
  onSelect: (group: MuscleGroup) => void;
}) {
  const region = (group: MuscleGroup, paths: React.ReactNode) => (
    <MuscleRegion group={group} progress={byGroup.get(group)} selected={selectedGroup === group} onSelect={onSelect}>
      {paths}
    </MuscleRegion>
  );
  return (
    <div className="anatomy-view">
      <span>{view === "front" ? "Anterior" : "Posterior"}</span>
      <svg viewBox="0 0 240 520" role="img" aria-labelledby={`${view}-body-title ${view}-body-desc`}>
        <title id={`${view}-body-title`}>{view === "front" ? "Front" : "Back"} muscle stimulus map</title>
        <desc id={`${view}-body-desc`}>Select a muscle region to inspect completed sets, exercise sources, personal records, and the next useful focus.</desc>
        <defs>
          <linearGradient id={`${view}-body-surface`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#202d40" />
            <stop offset="0.55" stopColor="#111a28" />
            <stop offset="1" stopColor="#09101a" />
          </linearGradient>
          <filter id={`${view}-muscle-glow`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <path className="anatomy-silhouette" fill={`url(#${view}-body-surface)`} d="M104 16 C86 25 82 45 88 63 L98 77 L93 91 C69 97 50 110 43 137 L25 220 C22 235 31 243 40 237 L58 171 L66 234 L78 290 L66 399 L74 501 L103 501 L119 402 L121 301 L137 402 L153 501 L182 501 L190 399 L178 290 L190 234 L198 171 L216 237 C225 243 234 235 231 220 L213 137 C206 110 187 97 163 91 L158 77 L168 63 C174 45 170 25 152 16 C137 8 119 8 104 16 Z" />
        <path className="anatomy-midline" d="M128 84 L128 293 M128 307 L128 490" />
        <path className="anatomy-contour" d="M91 91 Q128 109 165 91 M67 233 Q128 249 189 233 M79 290 Q128 305 177 290" />
        {view === "front" ? (
          <>
            {region("front-delts", <><path d="M91 99 C72 101 58 111 55 128 C61 139 72 143 82 135 L96 113 Z"/><path d="M165 99 C184 101 198 111 201 128 C195 139 184 143 174 135 L160 113 Z"/></>)}
            {region("side-delts", <><path d="M55 126 C45 139 45 160 51 177 L65 169 L70 139 Z"/><path d="M201 126 C211 139 211 160 205 177 L191 169 L186 139 Z"/></>)}
            {region("upper-chest", <><path d="M96 105 C106 97 116 96 126 104 L126 128 C109 127 97 121 88 114 Z"/><path d="M160 105 C150 97 140 96 130 104 L130 128 C147 127 159 121 168 114 Z"/></>)}
            {region("chest", <><path d="M87 117 C99 128 111 133 126 133 L126 166 C107 170 88 160 78 143 Z"/><path d="M169 117 C157 128 145 133 130 133 L130 166 C149 170 168 160 178 143 Z"/></>)}
            {region("biceps", <><path d="M54 174 C45 185 43 210 49 224 C57 230 66 220 67 199 L66 174 Z"/><path d="M202 174 C211 185 213 210 207 224 C199 230 190 220 189 199 L190 174 Z"/></>)}
            {region("forearms", <><path d="M47 226 L33 286 C31 298 38 304 45 294 L61 238 Z"/><path d="M209 226 L223 286 C225 298 218 304 211 294 L195 238 Z"/></>)}
            {region("abs-core", <><path d="M103 169 C113 165 121 168 126 173 L125 218 L101 214 Z"/><path d="M153 169 C143 165 135 168 130 173 L131 218 L155 214 Z"/><path d="M101 220 L125 223 L124 272 L91 267 Z"/><path d="M155 220 L131 223 L132 272 L165 267 Z"/></>)}
            {region("quads", <><path d="M83 296 C96 285 111 290 119 307 L112 397 C101 410 83 397 80 372 Z"/><path d="M173 296 C160 285 145 290 137 307 L144 397 C155 410 173 397 176 372 Z"/></>)}
            {region("calves", <><path d="M78 404 C90 397 105 407 106 431 L98 480 C89 493 77 479 76 454 Z"/><path d="M178 404 C166 397 151 407 150 431 L158 480 C167 493 179 479 180 454 Z"/></>)}
          </>
        ) : (
          <>
            {region("upper-back", <><path d="M101 91 L128 104 L155 91 L166 119 L145 143 L128 132 L111 143 L90 119 Z"/><path d="M111 143 L128 134 L145 143 L142 174 L128 181 L114 174 Z"/></>)}
            {region("rear-delts", <><path d="M91 101 C72 103 59 114 57 131 C65 140 76 143 86 133 L99 112 Z"/><path d="M165 101 C184 103 197 114 199 131 C191 140 180 143 170 133 L157 112 Z"/></>)}
            {region("lats", <><path d="M90 126 C103 139 108 164 107 204 L84 245 L72 214 L76 157 Z"/><path d="M166 126 C153 139 148 164 149 204 L172 245 L184 214 L180 157 Z"/></>)}
            {region("triceps", <><path d="M56 143 C46 159 44 199 51 222 C61 225 68 211 67 181 L68 151 Z"/><path d="M200 143 C210 159 212 199 205 222 C195 225 188 211 189 181 L188 151 Z"/></>)}
            {region("forearms", <><path d="M48 225 L34 286 C31 299 39 304 46 294 L61 238 Z"/><path d="M208 225 L222 286 C225 299 217 304 210 294 L195 238 Z"/></>)}
            {region("glutes", <><path d="M83 270 C96 258 116 264 124 279 L120 311 C103 322 82 312 77 294 Z"/><path d="M173 270 C160 258 140 264 132 279 L136 311 C153 322 174 312 179 294 Z"/></>)}
            {region("hamstrings", <><path d="M80 316 C94 307 111 317 116 338 L109 402 C95 412 80 397 78 371 Z"/><path d="M176 316 C162 307 145 317 140 338 L147 402 C161 412 176 397 178 371 Z"/></>)}
            {region("calves", <><path d="M77 407 C89 397 105 407 106 432 L98 481 C88 493 76 478 76 452 Z"/><path d="M179 407 C167 397 151 407 150 432 L158 481 C168 493 180 478 180 452 Z"/></>)}
          </>
        )}
      </svg>
    </div>
  );
}

function MuscleMapPanel({ progress, title = "Muscle Map", rangeLabel = "Last 7 days", compact = false }: { progress: MuscleProgress[]; title?: string; rangeLabel?: string; compact?: boolean }) {
  const firstActive = progress.find((item) => item.score > 0);
  const [selectedGroup, setSelectedGroup] = useState(firstActive?.group);
  const byGroup = new Map(progress.map((item) => [item.group, item]));
  const selected = selectedGroup ? byGroup.get(selectedGroup) : undefined;
  const activeGroups = [...progress].filter((item) => item.score > 0).sort((a, b) => b.score - a.score);
  return (
    <section className={classNames("panel muscle-map-panel", compact && "compact")}>
      <div className="section-heading">
        <div>
          <p className="eyebrow">{rangeLabel}</p>
          <h2>{title}</h2>
        </div>
        <div className="muscle-legend" aria-label="Muscle stimulus intensity legend">
          <span><i className="intensity-0" />Inactive</span><span><i className="intensity-1" />Light</span><span><i className="intensity-2" />Good</span><span><i className="intensity-3" />High stimulus</span><span><i className="intensity-4" />Standout</span>
        </div>
      </div>
      <div className="muscle-map-layout">
        <div className="body-map">
          <AnatomyFigure view="front" byGroup={byGroup} selectedGroup={selectedGroup} onSelect={setSelectedGroup} />
          <AnatomyFigure view="back" byGroup={byGroup} selectedGroup={selectedGroup} onSelect={setSelectedGroup} />
        </div>
        <div className="muscle-map-details">
          {!compact && <div className="muscle-picker" role="list" aria-label="Muscle groups">
            {progress.map((item) => (
              <button key={item.group} className={classNames(`intensity-${item.intensity}`, selectedGroup === item.group && "selected")} onClick={() => setSelectedGroup(item.group)}>
                <span>{item.label}</span><strong>{item.sets} sets</strong>
              </button>
            ))}
          </div>}
          {selected && (
            <div className="muscle-detail-card" aria-live="polite">
              <p className="eyebrow">{selected.trend}</p>
              <h3>{selected.label}</h3>
              <div className="muscle-detail-metrics">
                <span><strong>{selected.sets}</strong> completed sets</span>
                <span><strong>{selected.stimulusPoints}</strong> stimulus points</span>
                <span><strong>{selected.prCount}</strong> recent PR{selected.prCount === 1 ? "" : "s"}</span>
              </div>
              <span>{selected.exercises.length ? selected.exercises.join(" · ") : "No completed exercise for this muscle in the selected range."}</span>
              {!!selected.recentPRs.length && <small>Recent win: {selected.recentPRs[0]}</small>}
              <strong>{selected.nextTarget}</strong>
            </div>
          )}
          {!selected && <div className="muscle-detail-card empty-muscle-detail"><p className="eyebrow">Ready for input</p><h3>No recent muscle stimulus</h3><span>Complete a workout and this map will show where the scheduled work landed.</span></div>}
          {compact && !!activeGroups.length && <div className="muscle-impact-list">{activeGroups.slice(0, 5).map((item) => <button key={item.group} onClick={() => setSelectedGroup(item.group)}><span>{item.label}</span><strong>{item.trend}</strong></button>)}</div>}
        </div>
      </div>
      <p className="muscle-method-note">Primary-target sets count 1.0 stimulus point; supporting targets count 0.5. Valid PRs add 2 points. Colors summarize workload, not injury or recovery status.</p>
    </section>
  );
}

function PRTimeline({ gamification }: { gamification: GamificationSummary }) {
  const records = [...gamification.prs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  if (!records.length) return <div className="empty-state compact">Repeat an exercise in a later completed session to establish a real PR.</div>;
  return (
    <div className="pr-timeline" aria-label="Recent personal record timeline">
      {records.map((pr) => {
        const exercise = allExercises.find((item) => item.name === pr.exerciseName);
        const muscle = exercise?.muscleGroups?.[0];
        const xp = gamification.xpEvents.find((event) => event.key === pr.id)?.xp;
        return (
          <article key={pr.id} className="pr-timeline-item">
            <div className="pr-timeline-marker"><Dumbbell size={16} /></div>
            <div>
              <div className="pr-timeline-meta"><time>{formatDate(pr.date)}</time>{muscle && <span>{muscleLabels[muscle]}</span>}{xp && <strong>+{xp} XP</strong>}</div>
              <h4>{pr.exerciseName}</h4>
              <p>{pr.label}</p>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function ProgressPage({ data, gamification, gamificationEnabled }: { data: AppData; gamification: GamificationSummary; gamificationEnabled: boolean }) {
  const exerciseNames = useMemo(() => Array.from(new Set(allExercises.map((exercise) => exercise.name))).sort(), []);
  const [selectedExercise, setSelectedExercise] = useState(exerciseNames[0] ?? "");
  const [range, setRange] = useState<"week" | "cycle" | "last8" | "all">("cycle");
  const [muscleRange, setMuscleRange] = useState<"week" | "cycle" | "all">("week");
  const today = todayISO();
  const startDate = effectiveProgramStartDate(data.settings, data.workoutLogs, today);
  const progressSettings = { ...data.settings, startDate };
  const cycleInfo = getCycleInfo(startDate, today);
  const muscleFromDate = muscleRange === "week" ? addDays(today, -6) : muscleRange === "cycle" ? addDays(startDate, (cycleInfo.cycle - 1) * 56) : startDate;
  const muscleProgress = calculateMuscleProgress(data, gamification.prs, muscleFromDate, today);
  const muscleFocus = weeklyMuscleFocus(calculateMuscleProgress(data, gamification.prs));
  const filteredLogs = data.workoutLogs.filter((log) => {
    if (range === "all") return true;
    if (range === "cycle") return (log.cycle ?? Math.floor((log.week - 1) / 8) + 1) === cycleInfo.cycle;
    if (range === "week") return log.week === cycleInfo.programWeek;
    const cutoffWeek = Math.max(1, cycleInfo.programWeek - 7);
    return log.week >= cutoffWeek;
  });
  const filteredWeights = data.bodyWeights.filter((entry) => {
    if (range === "all") return true;
    const entryWeek = getCycleInfo(startDate, entry.date).programWeek;
    if (range === "cycle") return getCycleInfo(startDate, entry.date).cycle === cycleInfo.cycle;
    if (range === "week") return entryWeek === cycleInfo.programWeek;
    return entryWeek >= Math.max(1, cycleInfo.programWeek - 7);
  });
  const sessions = exerciseSessions(filteredLogs, selectedExercise);
  const selectedExerciseMeta = sessions[0]?.exercise ?? allExercises.find((exercise) => exercise.name === selectedExercise);
  const trendLabels = trendMetricLabels(selectedExerciseMeta);
  const selectedTrackingType = trackingTypeForExercise(selectedExerciseMeta);
  const primaryPoints = sessions.map((session) => progressMetricValue(session.exerciseLog, session.exercise));
  const secondaryPoints = sessions.map((session) => {
    const type = trackingTypeForExercise(session.exercise);
    if (type === "weighted-reps") {
      const loads = session.exerciseLog.sets.map((set) => validLoadValue(set.weight)).filter(Boolean);
      return loads.length ? Math.max(...loads) : 0;
    }
    if (type === "assistance-reps") return bestAssistance(session.exerciseLog);
    if (type === "timed") return bestTimedSet(session.exerciseLog);
    return bestSetReps(session.exerciseLog, session.exercise);
  });
  const repPoints = sessions.map((session) => totalRepsForExerciseLog(session.exerciseLog, session.exercise));
  const best = sessions.reduce(
    (winner, session) => (progressMetricValue(session.exerciseLog, session.exercise) > progressMetricValue(winner?.exerciseLog as ExerciseLog, winner?.exercise) ? session : winner),
    sessions[0],
  );
  const bestValue = best ? progressMetricValue(best.exerciseLog, best.exercise) : 0;
  const bestLabel = !best
    ? "None"
    : selectedTrackingType === "weighted-reps"
      ? `${Math.round(bestValue).toLocaleString()} vol`
      : selectedTrackingType === "timed"
        ? `${bestTimedSet(best.exerciseLog)} sec`
        : selectedTrackingType === "assistance-reps"
          ? `${bestAssistance(best.exerciseLog)} lb assist`
          : `${bestSetReps(best.exerciseLog, best.exercise)} reps`;
  const weekly = weeklySummaries(filteredLogs, progressSettings);
  const cycleRows = Array.from(
    filteredLogs.reduce((map, log) => {
      const cycle = log.cycle ?? Math.floor((log.week - 1) / 8) + 1;
      const current = map.get(cycle) ?? { cycle, completed: 0, sets: 0, volume: 0 };
      if (log.status === "completed") {
        current.completed += isTrainingDay(log.dayKey) ? 1 : 0;
        current.sets += completedSetCount(log);
        current.volume += workoutVolume(log);
      }
      map.set(cycle, current);
      return map;
    }, new Map<number, { cycle: number; completed: number; sets: number; volume: number }>()),
  ).map(([, value]) => value);

  return (
    <div className="content-stack">
      {gamificationEnabled && (
        <>
          <div className="visual-section-toolbar">
            <span>Muscle progress range</span>
            <div className="segmented-control">
              <button className={muscleRange === "week" ? "active" : ""} onClick={() => setMuscleRange("week")}>Last 7 Days</button>
              <button className={muscleRange === "cycle" ? "active" : ""} onClick={() => setMuscleRange("cycle")}>Current Cycle</button>
              <button className={muscleRange === "all" ? "active" : ""} onClick={() => setMuscleRange("all")}>All Time</button>
            </div>
          </div>
          <MuscleMapPanel progress={muscleProgress} rangeLabel={muscleRange === "week" ? "Last 7 days" : muscleRange === "cycle" ? `Cycle ${cycleInfo.cycle}` : "All logged training"} />

          <section className="panel weekly-focus-card">
            <div className="section-heading">
              <div><p className="eyebrow">Weekly muscle focus</p><h3>Where the work is landing</h3></div>
            </div>
            <div className="focus-summary-grid">
              <div><span>Most trained</span><strong>{muscleFocus.leading?.label ?? "No data"}</strong></div>
              <div><span>Also strong</span><strong>{muscleFocus.secondary?.label ?? "No data"}</strong></div>
              <div><span>Light stimulus</span><strong>{muscleFocus.lightest?.label ?? "No data"}</strong></div>
              <div><span>Consistency</span><strong>{gamification.executionScore.consistency}/100</strong></div>
            </div>
            <p>{muscleFocus.leading ? `${muscleFocus.leading.label} leads with ${muscleFocus.leading.sets} completed sets. Keep the routine order; the light area should be addressed by its scheduled day, not extra volume.` : "Complete a workout to populate the weekly muscle view."}</p>
          </section>

          <section className="game-grid two">
            <article className="panel">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">XP / Level</p>
                  <h3>Level {gamification.level.level}: {gamification.level.title}</h3>
                </div>
              </div>
              <strong className="big-number">{gamification.totalXP.toLocaleString()} XP</strong>
              <div className="xp-bar"><i style={{ width: `${gamification.level.progressPercent}%` }} /></div>
              <p>{gamification.level.xpToNext} XP to Level {gamification.level.level + 1}</p>
              <ChartPanel title="XP over time" values={gamification.activities.map((activity) => activity.xp).map((_, index, values) => values.slice(0, index + 1).reduce((sum, value) => sum + value, 0))} />
            </article>
            <article className="panel">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">PR timeline</p>
                  <h3>Conservative records</h3>
                </div>
              </div>
              <PRTimeline gamification={gamification} />
            </article>
          </section>
        </>
      )}

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Exercise progress</p>
            <h2>Trends by lift</h2>
          </div>
          <select value={range} onChange={(event) => setRange(event.target.value as typeof range)}>
            <option value="week">This week</option>
            <option value="cycle">Current cycle</option>
            <option value="last8">Last 8 weeks</option>
            <option value="all">All time</option>
          </select>
          <select value={selectedExercise} onChange={(event) => setSelectedExercise(event.target.value)}>
            {exerciseNames.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
        <div className="guidance-card">
          Weighted volume means completed set load x reps, summed across completed sets. Dumbbell volume uses the logged per-DB load unless a routine multiplier is set. Bodyweight, timed, assisted, and cardio work do not show fake weighted volume.
        </div>
        {sessions.length ? (
          <>
            <div className="stats-grid compact">
              <StatCard icon={Dumbbell} label="Logged sessions" value={`${sessions.length}`} detail="Completed sessions with this exercise." />
              <StatCard icon={BarChart3} label={trendLabels.best} value={bestLabel} detail={best ? formatDate(best.workout.date) : "Log this exercise first."} />
              <StatCard icon={Activity} label="Last vs previous" value={compareLastTwoExerciseSessions(data.workoutLogs, selectedExercise)} detail="Uses tracking-aware reps, seconds, assistance, or volume." />
            </div>
            <div className="chart-grid">
              <ChartPanel title={trendLabels.primary} values={primaryPoints} stroke="#f5b84b" />
              <ChartPanel title={trendLabels.secondary} values={secondaryPoints} />
              {selectedTrackingType === "weighted-reps" && <ChartPanel title="Total Reps" values={repPoints} stroke="#73a7ff" />}
            </div>
            <div className="responsive-table">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Week</th>
                    <th>Sets</th>
                    <th>{trendLabels.tableMetric}</th>
                    <th>{trendLabels.secondary}</th>
                    <th>Guidance</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((session) => (
                    <tr key={`${session.workout.id}-${session.exerciseLog.id}`}>
                      <td>{formatDate(session.workout.date)}</td>
                      <td>{session.workout.week}</td>
                      <td>{session.exerciseLog.sets.filter((set) => set.completed).length}</td>
                      <td>{Math.round(progressMetricValue(session.exerciseLog, session.exercise)).toLocaleString()}</td>
                      <td>{
                        trackingTypeForExercise(session.exercise) === "weighted-reps"
                          ? Math.max(0, ...session.exerciseLog.sets.map((set) => validLoadValue(set.weight))).toLocaleString()
                          : trackingTypeForExercise(session.exercise) === "assistance-reps"
                            ? `${bestAssistance(session.exerciseLog) || "-"} lb`
                            : trackingTypeForExercise(session.exercise) === "timed"
                              ? `${bestTimedSet(session.exerciseLog)} sec`
                              : `${bestSetReps(session.exerciseLog, session.exercise)} reps`
                      }</td>
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

      {gamificationEnabled && (
        <>
          <section className="panel bodyweight-progress-panel">
            <div className="section-heading"><div><p className="eyebrow">Body weight trend</p><h2>Scale direction</h2></div><span>{filteredWeights.length} entries in view</span></div>
            <ChartPanel title="Body weight" values={filteredWeights.map((entry) => entry.weight)} stroke="#73a7ff" />
          </section>
          <section className="panel">
            <div className="section-heading"><div><p className="eyebrow">Activity heat map</p><h2>Execution history</h2></div></div>
            <HeatMap activities={gamification.activities} />
          </section>
          <section className="panel">
            <div className="section-heading"><div><p className="eyebrow">Achievements</p><h2>Badges</h2></div></div>
            <BadgeGrid achievements={gamification.achievements} />
          </section>
        </>
      )}

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
        <div className="chart-grid">
          <ChartPanel title="Workout volume" values={weekly.map((week) => week.volume)} stroke="#f5b84b" />
          <ChartPanel title="Body weight" values={filteredWeights.map((entry) => entry.weight)} stroke="#73a7ff" />
          <ChartPanel title="Weekly sets" values={weekly.map((week) => week.sets)} />
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

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Cycle comparison</p>
            <h2>Cycle-by-cycle workload</h2>
          </div>
        </div>
        {cycleRows.length ? (
          <div className="responsive-table">
            <table>
              <thead>
                <tr>
                  <th>Cycle</th>
                  <th>Completed workouts</th>
                  <th>Sets</th>
                  <th>Volume</th>
                </tr>
              </thead>
              <tbody>
                {cycleRows.map((row) => (
                  <tr key={row.cycle}>
                    <td>{row.cycle}</td>
                    <td>{row.completed}</td>
                    <td>{row.sets}</td>
                    <td>{Math.round(row.volume).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">Complete workouts to compare cycles.</div>
        )}
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

function MiniList({ items, empty }: { items: string[]; empty: string }) {
  if (!items.length) return <div className="empty-state compact">{empty}</div>;
  return (
    <div className="mini-list">
      {items.map((item) => (
        <span key={item}>{item}</span>
      ))}
    </div>
  );
}

function HeatMap({ activities, compact = false }: { activities: DailyActivity[]; compact?: boolean }) {
  const [selected, setSelected] = useState<DailyActivity | null>(activities.at(-1) ?? null);
  const visible = compact ? activities.slice(-35) : activities.slice(-84);
  return (
    <div className={classNames("heatmap-wrap", compact && "compact")}>
      <div className="heatmap-grid">
        {visible.map((day) => (
          <button
            key={day.date}
            type="button"
            className={classNames("heat-cell", day.state)}
            aria-label={`${day.date}: ${day.summary}`}
            title={`${day.date}: ${day.summary}`}
            onClick={() => setSelected(day)}
          />
        ))}
      </div>
      <div className="heat-summary">
        <strong>{selected ? formatDate(selected.date, { weekday: "long" }) : "Select a day"}</strong>
        <span>{selected?.summary ?? "Tap a square to inspect activity."}</span>
      </div>
    </div>
  );
}

function BadgeGrid({ achievements }: { achievements: Achievement[] }) {
  const unlocked = achievements.filter((badge) => badge.unlocked);
  const locked = achievements.filter((badge) => !badge.unlocked);
  return (
    <div className="badge-layout">
      <div>
        <p className="eyebrow">Recently unlocked</p>
        <div className="badge-grid">
          {(unlocked.slice(0, 6).length ? unlocked.slice(0, 6) : []).map((badge) => (
            <article key={badge.id} className="badge-card unlocked">
              <strong>{badge.title}</strong>
              <span>{badge.description}</span>
            </article>
          ))}
          {!unlocked.length && <div className="empty-state compact">Complete workouts to unlock badges.</div>}
        </div>
      </div>
      <div>
        <p className="eyebrow">Next badges</p>
        <div className="badge-grid">
          {locked.slice(0, 8).map((badge) => (
            <article key={badge.id} className="badge-card">
              <strong>{badge.title}</strong>
              <span>{badge.description}</span>
              <div className="xp-bar"><i style={{ width: `${Math.min(100, (badge.progressCurrent / Math.max(1, badge.progressTarget)) * 100)}%` }} /></div>
              <small>{badge.progressCurrent}/{badge.progressTarget}</small>
            </article>
          ))}
        </div>
      </div>
    </div>
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

function HistoryPage({ data, startWorkout }: { data: AppData; startWorkout: (date?: string, performedDayKey?: DayKey) => void }) {
  const [filter, setFilter] = useState("");
  const [dayFilter, setDayFilter] = useState<"all" | DayKey>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "completed">("all");
  const [cycleFilter, setCycleFilter] = useState("all");
  const cycles = Array.from(new Set(data.workoutLogs.map((log) => String(log.cycle ?? Math.floor((log.week - 1) / 8) + 1)))).sort();
  const filtered = data.workoutLogs.filter((log) => {
    const query = filter.toLowerCase();
    const exerciseText = log.exerciseLogs.map((item) => exerciseNameForId(item.exerciseId)).join(" ");
    const haystack = `${log.workoutTitle} ${log.date} ${log.notes ?? ""} ${exerciseText}`.toLowerCase();
    const cycle = String(log.cycle ?? Math.floor((log.week - 1) / 8) + 1);
    return (
      haystack.includes(query) &&
      (dayFilter === "all" || log.dayKey === dayFilter) &&
      (statusFilter === "all" || log.status === statusFilter) &&
      (cycleFilter === "all" || cycle === cycleFilter)
    );
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
            <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Search exercise, notes, date" />
          </label>
        </div>
        <div className="history-filters">
          <select value={dayFilter} onChange={(event) => setDayFilter(event.target.value as "all" | DayKey)}>
            <option value="all">All days</option>
            {weeklySchedule.map((item) => (
              <option key={item.key} value={item.key}>{item.day}</option>
            ))}
          </select>
          <select value={cycleFilter} onChange={(event) => setCycleFilter(event.target.value)}>
            <option value="all">All cycles</option>
            {cycles.map((cycle) => (
              <option key={cycle} value={cycle}>Cycle {cycle}</option>
            ))}
          </select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | "draft" | "completed")}>
            <option value="all">Draft + completed</option>
            <option value="draft">Draft only</option>
            <option value="completed">Completed only</option>
          </select>
        </div>
        {filtered.length ? (
          <div className="history-list">
            {filtered.map((log) => (
              <article key={log.id} className="history-card">
                <div>
                  <p className="eyebrow">Program Week {log.week} · Cycle {log.cycle ?? Math.floor((log.week - 1) / 8) + 1} · {log.status}</p>
                  <h3>{log.workoutTitle}</h3>
                  <p>{formatDate(log.date, { weekday: "long", year: "numeric" })}</p>
                  {log.isScheduleOverride && (
                    <div className="override-note">
                      Performed: {workoutDays[log.performedDayKey ?? log.dayKey].shortTitle} · Originally scheduled: {workoutDays[log.scheduledDayKey ?? dayKeyForDate(log.date)].shortTitle}
                    </div>
                  )}
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
  data,
  refreshCloudStatus,
  onSyncNow,
  onRepairGamification,
  onLoadDevSample,
  onImport,
}: {
  settings: ProgramSettings;
  onSave: (settings: ProgramSettings) => void;
  cloudStatus: ReturnType<typeof getCloudStatus>;
  data: AppData;
  refreshCloudStatus: () => void;
  onSyncNow: () => void;
  onRepairGamification: () => void;
  onLoadDevSample: () => void;
  onImport: (data: AppData) => void;
}) {
  const [startDate, setStartDate] = useState(settings.startDate);
  const [email, setEmail] = useState("");
  const [cloudMessage, setCloudMessage] = useState("");
  const [cloudBusy, setCloudBusy] = useState(false);
  const [localBackups, setLocalBackups] = useState<LocalBackup[]>(() => getLocalBackups());
  const localDataExists = data.workoutLogs.length > 0 || data.bodyWeights.length > 0;
  const gamification = getGamificationSettings(settings);
  const isLocalDev = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

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

  const downloadJson = (payload: unknown, filename: string) => {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportData = () => downloadJson(data, `training-dashboard-backup-${todayISO()}.json`);

  const createBackupNow = () => {
    const backup = createLocalBackup(data, "manual");
    setLocalBackups(getLocalBackups());
    setCloudMessage(backup ? "Local safety snapshot created." : "Backup could not be created. Export JSON instead.");
  };

  const exportLatestBackup = () => {
    const latest = getLocalBackups()[0];
    if (!latest) {
      setCloudMessage("Create a local backup first.");
      return;
    }
    downloadJson(latest.data, `eli-cycle-tracker-snapshot-${latest.createdAt.slice(0, 10)}.json`);
  };

  const importData = async (file?: File) => {
    if (!file) return;
    try {
      const imported = JSON.parse(await file.text()) as AppData;
      if (!imported.settings || !Array.isArray(imported.workoutLogs) || !Array.isArray(imported.bodyWeights)) {
        throw new Error("Backup file does not match the app data format.");
      }
      if (!window.confirm("Import this backup? It will replace the data currently loaded in this browser.")) return;
      onImport(imported);
      setCloudMessage("Backup imported. Use Sync now if you want to push it to cloud.");
    } catch (error) {
      setCloudMessage(error instanceof Error ? error.message : "Could not import backup.");
    }
  };

  const saveProgramStatus = (status: ProgramSettings["status"]) => {
    onSave({
      ...settings,
      startDate: startDate || settings.startDate,
      status,
      pausedAt: status === "paused" ? new Date().toISOString() : settings.pausedAt,
      completedAt: status === "completed" ? new Date().toISOString() : settings.completedAt,
    });
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
          <button className="primary-action" onClick={() => onSave({ ...settings, startDate, status: settings.status ?? "active" })}>
            <Save size={18} />
            Save settings
          </button>
        </div>
        <div className="settings-actions">
          <button className="secondary-action" type="button" onClick={() => saveProgramStatus("paused")}>
            Pause program
          </button>
          <button className="secondary-action" type="button" onClick={() => saveProgramStatus("active")}>
            Resume program
          </button>
          <button className="secondary-action" type="button" onClick={() => saveProgramStatus("completed")}>
            Mark complete
          </button>
          <button className="secondary-action" type="button" onClick={() => {
            const today = todayISO();
            setStartDate(today);
            onSave({ ...settings, startDate: today, status: "active" });
          }}>
            Start new cycle
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
            <p className="eyebrow">Gamification</p>
            <h2>XP and motivation layer</h2>
          </div>
        </div>
        <div className="settings-grid toggles">
          <label className="complete-toggle">
            <input
              type="checkbox"
              checked={gamification.enabled}
              onChange={(event) => onSave({ ...settings, gamification: { ...gamification, enabled: event.target.checked } })}
            />
            Enabled
          </label>
          <label className="complete-toggle">
            <input
              type="checkbox"
              checked={gamification.showCelebrations}
              onChange={(event) => onSave({ ...settings, gamification: { ...gamification, showCelebrations: event.target.checked } })}
            />
            Show celebrations
          </label>
          <label className="complete-toggle">
            <input
              type="checkbox"
              checked={gamification.compactMode}
              onChange={(event) => onSave({ ...settings, gamification: { ...gamification, compactMode: event.target.checked } })}
            />
            Compact mode
          </label>
        </div>
        <div className="settings-actions">
          <button className="secondary-action" type="button" onClick={() => {
            onRepairGamification();
            setLocalBackups(getLocalBackups());
            setCloudMessage("Gamification stats repaired from existing workout and body weight logs.");
          }}>
            Repair / Recalculate Gamification
          </button>
          {isLocalDev && (
            <button className="secondary-action" type="button" onClick={onLoadDevSample}>
              Load local sample gamification data
            </button>
          )}
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
              <p>
                {cloudStatus.email ?? "Supabase user"} · same logs can appear across phone/computer.
                {cloudStatus.lastSyncAt ? ` Last sync ${new Date(cloudStatus.lastSyncAt).toLocaleString()}.` : " No completed cloud sync recorded yet."}
                {cloudStatus.pendingSync ? " Pending local changes need sync." : ""}
              </p>
            </div>
            <div className="cloud-buttons">
              <button className="primary-action" type="button" onClick={onSyncNow} disabled={cloudBusy}>
                Sync now
              </button>
              <button className="secondary-action" onClick={signOut} disabled={cloudBusy}>
                Sign out
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="cloud-note">Sign in to save the same workout logs across your phone and computer. Local logs already on this phone will be merged into cloud after sign-in.</p>
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
                {cloudBusy ? "Sending..." : cloudMessage.startsWith("Magic link sent") ? "Send magic link again" : "Send magic link"}
              </button>
            </form>
          </>
        )}
        <div className="sync-facts">
          <span>{cloudStatus.online ? "Online" : "Offline"}</span>
          <span>{localDataExists ? "Local data exists" : "No local logs yet"}</span>
          <span>{cloudStatus.pendingSync ? "Pending sync" : "No pending sync"}</span>
          <span>{cloudStatus.signedIn ? "Cloud signed in" : "Cloud not signed in"}</span>
        </div>
        {(cloudMessage || cloudStatus.lastError) && <div className="guidance-card">{cloudMessage || cloudStatus.lastError}</div>}
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Backup</p>
            <h2>Export / import data</h2>
          </div>
        </div>
        <div className="settings-actions">
          <button className="secondary-action" type="button" onClick={createBackupNow}>
            Create Backup Now
          </button>
          <button className="secondary-action" type="button" onClick={exportLatestBackup}>
            Export Latest Snapshot
          </button>
          <button className="secondary-action" type="button" onClick={exportData}>
            Export JSON
          </button>
          <label className="secondary-action import-button">
            Import JSON
            <input type="file" accept="application/json" onChange={(event) => importData(event.target.files?.[0])} />
          </label>
        </div>
        <p className="backup-status">
          {localBackups[0]
            ? `Last local backup: ${new Date(localBackups[0].createdAt).toLocaleString()} · ${localBackups[0].reason} · ${localBackups.length} snapshot${localBackups.length === 1 ? "" : "s"} retained`
            : "No local safety snapshot yet. Full JSON export remains available."}
        </p>
      </section>
    </div>
  );
}

function createGamificationSampleData(currentSettings: ProgramSettings): AppData {
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

export default App;
