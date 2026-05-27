import { AppData, BodyWeightLog, ProgramSettings, WorkoutLog } from "../types";
import {
  consumeCloudAuthRedirect,
  deleteCloudWorkoutLog,
  getQueuedCloudDeleteIds,
  getCloudStatus,
  loadCloudData,
  queueCloudSnapshot,
  queueCloudWorkoutDelete,
  saveCloudBodyWeightLog,
  saveCloudSettings,
  saveCloudSnapshot,
  saveCloudWorkoutLog,
} from "./cloud";
import { getCycleInfo, todayISO } from "./date";
import { defaultGamificationSettings, getGamificationSettings, mergeProgramSettingsGamification } from "./gamification";

const DB_NAME = "chad-aesthetic-dashboard";
const DB_VERSION = 1;
const SETTINGS_KEY = "program-settings";
const FALLBACK_KEY = "chad-aesthetic-dashboard:fallback";

const defaultSettings: ProgramSettings = {
  startDate: "",
  status: "active",
  gamification: defaultGamificationSettings,
};

type StoreName = "settings" | "workoutLogs" | "bodyWeights";

export type SaveResult = {
  localSaved: boolean;
  cloudSaved: boolean;
  queued: boolean;
  offline: boolean;
  signedIn: boolean;
  error?: string;
};

function resultFromCloudSuccess(): SaveResult {
  const status = getCloudStatus();
  return {
    localSaved: true,
    cloudSaved: status.signedIn,
    queued: false,
    offline: !status.online,
    signedIn: status.signedIn,
  };
}

function resultFromCloudSkip(): SaveResult {
  const status = getCloudStatus();
  return {
    localSaved: true,
    cloudSaved: false,
    queued: status.signedIn && !status.online,
    offline: !status.online,
    signedIn: status.signedIn,
  };
}

function resultFromCloudFailure(error: unknown): SaveResult {
  const status = getCloudStatus();
  return {
    localSaved: true,
    cloudSaved: false,
    queued: status.signedIn,
    offline: !status.online,
    signedIn: status.signedIn,
    error: error instanceof Error ? error.message : "Cloud sync failed. Local data was saved.",
  };
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains("workoutLogs")) {
        const store = db.createObjectStore("workoutLogs", { keyPath: "id" });
        store.createIndex("date", "date");
        store.createIndex("dayKey", "dayKey");
      }
      if (!db.objectStoreNames.contains("bodyWeights")) {
        const store = db.createObjectStore("bodyWeights", { keyPath: "id" });
        store.createIndex("date", "date");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getAll<T>(db: IDBDatabase, storeName: StoreName): Promise<T[]> {
  const tx = db.transaction(storeName, "readonly");
  return requestToPromise<T[]>(tx.objectStore(storeName).getAll());
}

async function put<T>(db: IDBDatabase, storeName: StoreName, value: T): Promise<void> {
  const tx = db.transaction(storeName, "readwrite");
  tx.objectStore(storeName).put(value);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteValue(db: IDBDatabase, storeName: StoreName, id: string): Promise<void> {
  const tx = db.transaction(storeName, "readwrite");
  tx.objectStore(storeName).delete(id);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function loadFallback(): AppData {
  const raw = localStorage.getItem(FALLBACK_KEY);
  if (!raw) {
    return { settings: defaultSettings, workoutLogs: [], bodyWeights: [] };
  }
  try {
    const parsed = JSON.parse(raw) as AppData;
    return {
      settings: normalizeSettings(parsed.settings),
      workoutLogs: parsed.workoutLogs ?? [],
      bodyWeights: parsed.bodyWeights ?? [],
    };
  } catch {
    return { settings: defaultSettings, workoutLogs: [], bodyWeights: [] };
  }
}

function normalizeSettings(settings?: ProgramSettings): ProgramSettings {
  return {
    ...defaultSettings,
    ...(settings ?? {}),
    gamification: getGamificationSettings(settings ?? defaultSettings),
  };
}

function saveFallback(data: AppData): void {
  localStorage.setItem(FALLBACK_KEY, JSON.stringify(data));
}

function mergeLogsById<T extends { id: string }>(local: T[], remote: T[]): T[] {
  const merged = new Map<string, T>();
  [...remote, ...local].forEach((item) => {
    const current = merged.get(item.id);
    if (!current) {
      merged.set(item.id, item);
      return;
    }
    const currentTime = Date.parse((current as { updatedAt?: string }).updatedAt ?? "");
    const nextTime = Date.parse((item as { updatedAt?: string }).updatedAt ?? "");
    if (!Number.isFinite(currentTime) || (Number.isFinite(nextTime) && nextTime >= currentTime)) {
      merged.set(item.id, item);
    }
  });
  return Array.from(merged.values());
}

function normalizeProgramFields(data: AppData): AppData {
  const settings = normalizeSettings(data.settings);
  const startDate = settings.startDate || [...data.workoutLogs].sort((a, b) => a.date.localeCompare(b.date))[0]?.date || todayISO();
  return {
    ...data,
    settings,
    workoutLogs: data.workoutLogs.map((log) => {
      const cycleInfo = getCycleInfo(startDate, log.date);
      return { ...log, week: cycleInfo.programWeek, cycle: cycleInfo.cycle, weekInCycle: cycleInfo.weekInCycle };
    }),
  };
}

async function saveLocalSnapshot(data: AppData): Promise<void> {
  saveFallback(data);
  if (!("indexedDB" in window)) return;
  try {
    const db = await openDb();
    const tx = db.transaction(["settings", "workoutLogs", "bodyWeights"], "readwrite");
    tx.objectStore("settings").clear();
    tx.objectStore("workoutLogs").clear();
    tx.objectStore("bodyWeights").clear();
    tx.objectStore("settings").put({ key: SETTINGS_KEY, value: data.settings });
    data.workoutLogs.forEach((log) => tx.objectStore("workoutLogs").put(log));
    data.bodyWeights.forEach((log) => tx.objectStore("bodyWeights").put(log));
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.error("IndexedDB save failed. localStorage fallback is still available.", error);
  }
}

async function loadLocalData(): Promise<AppData> {
  if (!("indexedDB" in window)) {
    return loadFallback();
  }
  try {
    const db = await openDb();
    const [settingsRows, workoutLogs, bodyWeights] = await Promise.all([
      getAll<{ key: string; value: ProgramSettings }>(db, "settings"),
      getAll<WorkoutLog>(db, "workoutLogs"),
      getAll<BodyWeightLog>(db, "bodyWeights"),
    ]);
    const settings = settingsRows.find((row) => row.key === SETTINGS_KEY)?.value ?? defaultSettings;
    return {
      settings: normalizeSettings(settings),
      workoutLogs: workoutLogs.sort((a, b) => b.date.localeCompare(a.date)),
      bodyWeights: bodyWeights.sort((a, b) => a.date.localeCompare(b.date)),
    };
  } catch {
    return loadFallback();
  }
}

export async function loadAppData(): Promise<AppData> {
  consumeCloudAuthRedirect();
  const localData = normalizeProgramFields(await loadLocalData());
  const cloudResult = await loadCloudData();
  if (!cloudResult) return localData;
  const deletedIds = new Set(getQueuedCloudDeleteIds());
  const cloudSettings = normalizeSettings(cloudResult.data.settings);
  const selectedSettings = cloudResult.hasSettings && (cloudSettings.startDate || !localData.settings.startDate)
    ? cloudSettings
    : localData.settings;
  const settings = mergeProgramSettingsGamification(selectedSettings, localData.settings, cloudSettings);
  const merged = {
    settings,
    workoutLogs: mergeLogsById(localData.workoutLogs, cloudResult.data.workoutLogs)
      .filter((log) => !deletedIds.has(log.id))
      .sort((a, b) => b.date.localeCompare(a.date)),
    bodyWeights: mergeLogsById(localData.bodyWeights, cloudResult.data.bodyWeights).sort((a, b) => a.date.localeCompare(b.date)),
  };
  const normalized = normalizeProgramFields(merged);
  await saveLocalSnapshot(normalized);
  await saveCloudSnapshot(normalized).catch(() => undefined);
  return normalized;
}

export async function saveSettings(settings: ProgramSettings, snapshot: AppData): Promise<SaveResult> {
  const next = { ...snapshot, settings };
  saveFallback(next);
  if ("indexedDB" in window) {
    try {
      const db = await openDb();
      await put(db, "settings", { key: SETTINGS_KEY, value: settings });
    } catch (error) {
      console.error("IndexedDB settings save failed. localStorage fallback was saved.", error);
    }
  }
  if (!getCloudStatus().signedIn) {
    return resultFromCloudSkip();
  }
  try {
    await saveCloudSettings(settings);
    return resultFromCloudSuccess();
  } catch (error) {
    queueCloudSnapshot(next, error);
    return resultFromCloudFailure(error);
  }
}

export async function saveWorkoutLog(log: WorkoutLog, snapshot: AppData): Promise<SaveResult> {
  const nextLogs = [log, ...snapshot.workoutLogs.filter((item) => item.id !== log.id)];
  const next = { ...snapshot, workoutLogs: nextLogs };
  saveFallback(next);
  if ("indexedDB" in window) {
    try {
      const db = await openDb();
      await put(db, "workoutLogs", log);
    } catch (error) {
      console.error("IndexedDB workout save failed. localStorage fallback was saved.", error);
    }
  }
  if (!getCloudStatus().signedIn) {
    return resultFromCloudSkip();
  }
  try {
    await saveCloudWorkoutLog(log);
    return resultFromCloudSuccess();
  } catch (error) {
    queueCloudSnapshot(next, error);
    return resultFromCloudFailure(error);
  }
}

export async function saveBodyWeightLog(log: BodyWeightLog, snapshot: AppData): Promise<SaveResult> {
  const nextWeights = [log, ...snapshot.bodyWeights.filter((item) => item.id !== log.id)].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const next = { ...snapshot, bodyWeights: nextWeights };
  saveFallback(next);
  if ("indexedDB" in window) {
    try {
      const db = await openDb();
      await put(db, "bodyWeights", log);
    } catch (error) {
      console.error("IndexedDB body weight save failed. localStorage fallback was saved.", error);
    }
  }
  if (!getCloudStatus().signedIn) {
    return resultFromCloudSkip();
  }
  try {
    await saveCloudBodyWeightLog(log);
    return resultFromCloudSuccess();
  } catch (error) {
    queueCloudSnapshot(next, error);
    return resultFromCloudFailure(error);
  }
}

export async function deleteWorkoutLog(id: string, snapshot: AppData): Promise<SaveResult> {
  const next = { ...snapshot, workoutLogs: snapshot.workoutLogs.filter((item) => item.id !== id) };
  saveFallback(next);
  if ("indexedDB" in window) {
    try {
      const db = await openDb();
      await deleteValue(db, "workoutLogs", id);
    } catch (error) {
      console.error("IndexedDB workout delete failed. localStorage fallback was saved.", error);
    }
  }
  if (!getCloudStatus().signedIn) {
    return resultFromCloudSkip();
  }
  try {
    await deleteCloudWorkoutLog(id);
    return resultFromCloudSuccess();
  } catch (error) {
    queueCloudWorkoutDelete(id, error);
    queueCloudSnapshot(next, error);
    return resultFromCloudFailure(error);
  }
}

export async function saveAppData(data: AppData): Promise<SaveResult> {
  await saveLocalSnapshot(data);
  if (!getCloudStatus().signedIn) {
    return resultFromCloudSkip();
  }
  try {
    await saveCloudSnapshot(data);
    return resultFromCloudSuccess();
  } catch (error) {
    queueCloudSnapshot(data, error);
    return resultFromCloudFailure(error);
  }
}

export { defaultSettings };
