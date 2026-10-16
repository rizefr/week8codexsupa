import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, History, Home, LineChart, MoreHorizontal, Ruler, Settings } from "./components/icons";
import { AppData, BodyWeightLog, DayKey, Exercise, ProgramSettings, WorkoutLog } from "./types";
import { getCloudStatus, syncCloudNow } from "./lib/cloud";
import { todayISO } from "./lib/date";
import { effectiveProgramStartDate, getOrCreateLog, prefillWorkoutLogFromHistory, refreshProgramFields } from "./lib/progress";
import { createLocalBackup, defaultSettings, deleteWorkoutLog, loadAppData, saveAppData, saveBodyWeightLog, saveSettings, saveWorkoutLog, SaveResult } from "./lib/storage";
import { calculateGamification, getGamificationSettings, mergeGamificationSettings } from "./lib/gamification";
import { loadRestTimer, parseRestSeconds, primeRestTimerAudio, RestDock, RestTimerState, saveRestTimer } from "./components/RestTimer";
import { ToastItem, ToastStack } from "./components/Toasts";
import { AppContext, SaveState } from "./ui/context";
import { cx, displayName, navigate, Page, parseRoute, Route } from "./ui/core";
import { useWakeLock } from "./ui/hooks";
import { SyncPill } from "./ui/SyncPill";
import { HomePage } from "./pages/Home";
import { PlanPage } from "./pages/Plan";
import { LoggerPage } from "./pages/Logger";
import { RecapPage } from "./pages/Recap";
import { ProgressPage } from "./pages/Progress";
import { BodyPage } from "./pages/Body";
import { HistoryPage } from "./pages/History";
import { SettingsPage } from "./pages/Settings";
import { createGamificationSampleData } from "./dev/sample";

type NavItem = { page: Page; label: string; icon: typeof Home };

const primaryNav: NavItem[] = [
  { page: "dashboard", label: "Today", icon: Home },
  { page: "routine", label: "Plan", icon: BookOpen },
  { page: "progress", label: "Progress", icon: LineChart },
  { page: "weight", label: "Body", icon: Ruler },
];
const moreNav: NavItem[] = [
  { page: "history", label: "History", icon: History },
  { page: "settings", label: "Settings", icon: Settings },
];

function App() {
  const [route, setRoute] = useState<Route>(parseRoute);
  const [data, setData] = useState<AppData>({ settings: defaultSettings, workoutLogs: [], bodyWeights: [] });
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState("");
  const [cloudStatus, setCloudStatus] = useState(getCloudStatus());
  const [moreOpen, setMoreOpen] = useState(false);
  const [restTimer, setRestTimerState] = useState<RestTimerState | null>(() => loadRestTimer());
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastIdRef = useRef(0);
  const routeRef = useRef(route);
  const dataRef = useRef(data);
  const celebrationBaseline = useRef<{ badges: Set<string>; level: number; prIds: Set<string> } | null>(null);

  const gamification = useMemo(() => calculateGamification(data), [data]);
  const preferences = data.settings.preferences ?? {};
  const restChimes = preferences.restChimes ?? -1;
  const pendingBadgeUnlockIds = gamification.achievements
    .filter((badge) => badge.unlocked && !gamification.settings.badgeUnlocks[badge.id])
    .map((badge) => badge.id);

  const activeLog = route.page === "logger" ? data.workoutLogs.find((log) => log.id === route.id) : undefined;
  const inWorkout = !!activeLog && activeLog.status === "draft";
  useWakeLock(inWorkout && preferences.keepAwake !== false);

  useEffect(() => { dataRef.current = data; }, [data]);
  useEffect(() => { routeRef.current = route; }, [route]);

  const setRestTimer = useCallback((next: RestTimerState | null | ((current: RestTimerState | null) => RestTimerState | null)) => {
    setRestTimerState((current) => {
      const value = typeof next === "function" ? next(current) : next;
      saveRestTimer(value);
      return value;
    });
  }, []);

  const pushToast = useCallback((toast: Omit<ToastItem, "id">) => {
    toastIdRef.current += 1;
    const id = toastIdRef.current;
    setToasts((previous) => [...previous.slice(-2), { ...toast, id }]);
  }, []);
  const dismissToast = useCallback((id: number) => setToasts((previous) => previous.filter((toast) => toast.id !== id)), []);

  const startRest = useCallback((exercise: Exercise) => {
    const seconds = parseRestSeconds(exercise.rest);
    if (seconds <= 0) return;
    primeRestTimerAudio();
    setRestTimer({ endsAt: Date.now() + seconds * 1000, total: seconds, preset: seconds, exerciseName: displayName(exercise.name) });
  }, [setRestTimer]);

  // Celebrations fire only for changes after the initial load, so imports or
  // recalculations never cause a toast storm.
  useEffect(() => {
    if (loading) return;
    const unlockedIds = gamification.achievements.filter((badge) => badge.unlocked).map((badge) => badge.id);
    if (!celebrationBaseline.current) {
      celebrationBaseline.current = { badges: new Set(unlockedIds), level: gamification.level.level, prIds: new Set(gamification.prs.map((pr) => pr.id)) };
      return;
    }
    const baseline = celebrationBaseline.current;
    const celebrate = gamification.settings.enabled && gamification.settings.showCelebrations;
    if (celebrate && gamification.level.level > baseline.level) {
      pushToast({ tone: "level", title: `Level ${gamification.level.level} · ${gamification.level.title}`, detail: "Consistent sessions are compounding." });
    }
    baseline.level = gamification.level.level;
    const newBadges = unlockedIds.filter((id) => !baseline.badges.has(id));
    if (celebrate && newBadges.length) {
      const byId = new Map(gamification.achievements.map((badge) => [badge.id, badge]));
      newBadges.slice(0, 2).forEach((id) => {
        const badge = byId.get(id);
        if (badge) pushToast({ tone: "badge", title: `Badge: ${badge.title}`, detail: badge.description });
      });
    }
    newBadges.forEach((id) => baseline.badges.add(id));
    const newPRs = gamification.prs.filter((pr) => !baseline.prIds.has(pr.id));
    if (celebrate && newPRs.length && routeRef.current.page === "logger") {
      const latest = newPRs[newPRs.length - 1];
      pushToast({ tone: "pr", title: `PR · ${latest.exerciseName}`, detail: latest.label });
    }
    newPRs.forEach((pr) => baseline.prIds.add(pr.id));
  }, [loading, gamification]);

  useEffect(() => {
    const onHashChange = () => {
      setRoute(parseRoute());
      setMoreOpen(false);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route.page, route.id]);

  useEffect(() => {
    if (!moreOpen) return;
    const close = (event: Event) => {
      const target = event.target as HTMLElement;
      if (!target.closest?.(".more-menu, .tabbar")) setMoreOpen(false);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setMoreOpen(false); };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [moreOpen]);

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

  const reportFailure = (label: string) => (error: unknown) => {
    console.error(`${label} failed.`, error);
    setSaveError(error instanceof Error ? error.message : `${label} failed.`);
    setSaveState("syncIssue");
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
      reportFailure("Manual sync")(error);
      setCloudStatus(getCloudStatus());
    }
  };

  const persistSettings = (settings: ProgramSettings) => {
    setSaveState("saving");
    setSaveError("");
    setData((previous) => {
      const updatedSettings = { ...settings, updatedAt: new Date().toISOString() };
      const effectiveStart = effectiveProgramStartDate(updatedSettings, previous.workoutLogs);
      const next = { ...previous, settings: updatedSettings, workoutLogs: previous.workoutLogs.map((log) => refreshProgramFields(log, effectiveStart)) };
      saveSettings(updatedSettings, next).then(applySaveResult).catch(reportFailure("Settings save"));
      return next;
    });
  };

  // Persist badge unlock timestamps once, so earned badges never re-lock.
  useEffect(() => {
    if (loading || !gamification.settings.enabled || !pendingBadgeUnlockIds.length) return;
    const current = getGamificationSettings(data.settings);
    const nextUnlocks = { ...current.badgeUnlocks };
    pendingBadgeUnlockIds.forEach((id) => { nextUnlocks[id] = nextUnlocks[id] ?? new Date().toISOString(); });
    persistSettings({ ...data.settings, gamification: { ...current, badgeUnlocks: nextUnlocks } });
  }, [loading, gamification.settings.enabled, pendingBadgeUnlockIds.join("|")]);

  const persistWorkout = (log: WorkoutLog) => {
    setSaveState("saving");
    setSaveError("");
    setData((previous) => {
      const effectiveStart = effectiveProgramStartDate(previous.settings, previous.workoutLogs, log.date);
      const updatedLog = refreshProgramFields({ ...log, updatedAt: new Date().toISOString() }, effectiveStart);
      const next = {
        ...previous,
        workoutLogs: [updatedLog, ...previous.workoutLogs.filter((item) => item.id !== updatedLog.id)].sort((a, b) => b.date.localeCompare(a.date)),
      };
      saveWorkoutLog(updatedLog, next).then(applySaveResult).catch(reportFailure("Workout save"));
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
        bodyWeights: [updatedLog, ...previous.bodyWeights.filter((item) => item.id !== updatedLog.id)].sort((a, b) => a.date.localeCompare(b.date)),
      };
      saveBodyWeightLog(updatedLog, next).then(applySaveResult).catch(reportFailure("Body weight save"));
      return next;
    });
  };

  const removeWorkout = (id: string) => {
    setSaveState("saving");
    setSaveError("");
    setData((previous) => {
      const next = { ...previous, workoutLogs: previous.workoutLogs.filter((log) => log.id !== id) };
      deleteWorkoutLog(id, previous).then(applySaveResult).catch(reportFailure("Workout delete"));
      return next;
    });
  };

  const startWorkout = (date = todayISO(), performedDayKey?: DayKey) => {
    const settings = data.settings.startDate
      ? data.settings
      : { ...data.settings, startDate: date, status: "active" as const, updatedAt: new Date().toISOString() };
    const sameDay = data.workoutLogs.filter((item) => item.date === date);
    const requested = performedDayKey ? sameDay.filter((item) => item.dayKey === performedDayKey) : sameDay;
    const pick = (list: WorkoutLog[]) => list.find((item) => item.status === "draft") ?? list.find((item) => item.status === "completed") ?? list[0];
    const existing = pick(requested) ?? (performedDayKey ? undefined : pick(sameDay));
    const log = existing ?? prefillWorkoutLogFromHistory(getOrCreateLog(date, data.workoutLogs, settings, performedDayKey), data.workoutLogs);
    if (!data.settings.startDate) persistSettings(settings);
    if (!data.workoutLogs.some((item) => item.id === log.id)) persistWorkout(log);
    navigate("logger", log.id);
  };

  const markRecapSeen = (workoutId: string) => {
    const current = getGamificationSettings(data.settings);
    if (current.seenRecaps.includes(workoutId)) return;
    persistSettings({ ...data.settings, gamification: { ...current, seenRecaps: [...current.seenRecaps, workoutId] } });
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
    persistSettings({ ...data.settings, gamification: mergeGamificationSettings({ ...current, badgeUnlocks: nextUnlocks }, current, summary.settings) });
  };

  const importData = (importedData: AppData) => {
    createLocalBackup(data, "before-import");
    const settings = { status: "active" as const, ...importedData.settings, updatedAt: new Date().toISOString() };
    const startDate = effectiveProgramStartDate(settings, importedData.workoutLogs);
    const normalized = { ...importedData, settings, workoutLogs: importedData.workoutLogs.map((log) => refreshProgramFields(log, startDate)) };
    setData(normalized);
    saveAppData(normalized).then(applySaveResult).catch(reportFailure("Import save"));
  };

  const loadDevSample = () => {
    const sample = createGamificationSampleData(data.settings);
    setData(sample);
    saveAppData(sample).then(applySaveResult);
  };

  const ctx: AppContext = {
    data,
    gamification,
    cloudStatus,
    saveState,
    saveError,
    startWorkout,
    saveWorkout: persistWorkout,
    deleteWorkout: removeWorkout,
    saveWeight: persistWeight,
    saveSettings: persistSettings,
    startRest,
    clearRest: () => setRestTimer(null),
    retrySync,
    refreshCloudStatus: () => setCloudStatus(getCloudStatus()),
  };

  const focusMode = route.page === "logger";
  const isActive = (page: Page) => route.page === page || (page === "dashboard" && route.page === "recap");
  const restDock = restTimer && (
    <RestDock
      timer={restTimer}
      chimes={restChimes}
      onAdjust={(seconds) => setRestTimer((current) => {
        if (!current) return current;
        const remaining = Math.max(0, Math.ceil((current.endsAt - Date.now()) / 1000));
        const next = Math.max(5, remaining + seconds);
        return { ...current, endsAt: Date.now() + next * 1000, total: Math.max(15, current.total + seconds) };
      })}
      onDismiss={() => setRestTimer(null)}
    />
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" type="button" onClick={() => navigate("dashboard")}>
          <span className="brand-mark">E</span>
          <span>
            <strong>Eli’s Cycle Tracker</strong>
            <small>Cornell · upper priority</small>
          </span>
        </button>
        <nav aria-label="Main">
          {[...primaryNav, ...moreNav].map((item) => (
            <button key={item.page} type="button" className={cx(isActive(item.page) && "is-active")} onClick={() => navigate(item.page)}>
              <item.icon size={19} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <SyncPill saveState={saveState} loading={loading} cloudStatus={cloudStatus} onRetry={retrySync} />
      </aside>

      <main className={cx("main", focusMode && "is-focus")}>
        {loading ? (
          <div className="loading"><div className="spinner" /><span>Loading your training…</span></div>
        ) : (
          <>
            {route.page === "dashboard" && <HomePage ctx={ctx} />}
            {route.page === "routine" && <PlanPage ctx={ctx} />}
            {route.page === "logger" && <LoggerPage ctx={ctx} logId={route.id} restDock={restDock} />}
            {route.page === "recap" && <RecapPage ctx={ctx} logId={route.id} markSeen={markRecapSeen} />}
            {route.page === "progress" && <ProgressPage ctx={ctx} />}
            {route.page === "weight" && <BodyPage ctx={ctx} />}
            {route.page === "history" && <HistoryPage ctx={ctx} />}
            {route.page === "settings" && (
              <SettingsPage ctx={ctx} onRepairGamification={repairGamification} onImport={importData} onLoadDevSample={loadDevSample} />
            )}
          </>
        )}
      </main>

      {!focusMode && restDock && <div className="global-rest">{restDock}</div>}

      {!focusMode && (
        <>
          {moreOpen && (
            <div className="more-menu" role="menu" aria-label="More">
              {moreNav.map((item) => (
                <button key={item.page} type="button" role="menuitem" className={cx(route.page === item.page && "is-active")} onClick={() => { setMoreOpen(false); navigate(item.page); }}>
                  <item.icon size={18} />
                  {item.label}
                </button>
              ))}
              <div style={{ padding: "6px 8px 4px" }}>
                <SyncPill saveState={saveState} loading={loading} cloudStatus={cloudStatus} onRetry={retrySync} />
              </div>
            </div>
          )}
          <nav className="tabbar" aria-label="Main">
            {primaryNav.map((item) => (
              <button key={item.page} type="button" className={cx(isActive(item.page) && "is-active")} onClick={() => navigate(item.page)} aria-current={isActive(item.page) ? "page" : undefined}>
                <item.icon size={22} />
                <span>{item.label}</span>
              </button>
            ))}
            <button type="button" className={cx((moreOpen || moreNav.some((item) => item.page === route.page)) && "is-active")} aria-expanded={moreOpen} onClick={() => setMoreOpen((open) => !open)}>
              <MoreHorizontal size={22} />
              <span>More</span>
            </button>
          </nav>
        </>
      )}

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

export default App;
