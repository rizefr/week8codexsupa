import { AppData, BodyWeightLog, ProgramSettings, WorkoutLog } from "../types";
import {
  consumeCloudAuthRedirect,
  deleteCloudWorkoutLog,
  loadCloudData,
  saveCloudBodyWeightLog,
  saveCloudSettings,
  saveCloudSnapshot,
  saveCloudWorkoutLog,
} from "./cloud";
import { todayISO } from "./date";

const DB_NAME = "chad-aesthetic-dashboard";
const DB_VERSION = 1;
const SETTINGS_KEY = "program-settings";
const FALLBACK_KEY = "chad-aesthetic-dashboard:fallback";

const defaultSettings: ProgramSettings = {
  startDate: todayISO(),
};

type StoreName = "settings" | "workoutLogs" | "bodyWeights";

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
      settings: parsed.settings ?? defaultSettings,
      workoutLogs: parsed.workoutLogs ?? [],
      bodyWeights: parsed.bodyWeights ?? [],
    };
  } catch {
    return { settings: defaultSettings, workoutLogs: [], bodyWeights: [] };
  }
}

function saveFallback(data: AppData): void {
  localStorage.setItem(FALLBACK_KEY, JSON.stringify(data));
}

function mergeLogsById<T extends { id: string }>(local: T[], remote: T[]): T[] {
  const merged = new Map<string, T>();
  [...remote, ...local].forEach((item) => merged.set(item.id, item));
  return Array.from(merged.values());
}

async function saveLocalSnapshot(data: AppData): Promise<void> {
  saveFallback(data);
  if (!("indexedDB" in window)) return;
  const db = await openDb();
  await Promise.all([
    put(db, "settings", { key: SETTINGS_KEY, value: data.settings }),
    ...data.workoutLogs.map((log) => put(db, "workoutLogs", log)),
    ...data.bodyWeights.map((log) => put(db, "bodyWeights", log)),
  ]);
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
      settings,
      workoutLogs: workoutLogs.sort((a, b) => b.date.localeCompare(a.date)),
      bodyWeights: bodyWeights.sort((a, b) => a.date.localeCompare(b.date)),
    };
  } catch {
    return loadFallback();
  }
}

export async function loadAppData(): Promise<AppData> {
  consumeCloudAuthRedirect();
  const localData = await loadLocalData();
  const cloudResult = await loadCloudData();
  if (!cloudResult) return localData;
  const merged = {
    settings: cloudResult.hasSettings ? cloudResult.data.settings : localData.settings,
    workoutLogs: mergeLogsById(localData.workoutLogs, cloudResult.data.workoutLogs).sort((a, b) => b.date.localeCompare(a.date)),
    bodyWeights: mergeLogsById(localData.bodyWeights, cloudResult.data.bodyWeights).sort((a, b) => a.date.localeCompare(b.date)),
  };
  await saveLocalSnapshot(merged);
  await saveCloudSnapshot(merged).catch(() => undefined);
  return merged;
}

export async function saveSettings(settings: ProgramSettings, snapshot: AppData): Promise<void> {
  const next = { ...snapshot, settings };
  saveFallback(next);
  if ("indexedDB" in window) {
    const db = await openDb();
    await put(db, "settings", { key: SETTINGS_KEY, value: settings });
  }
  await saveCloudSettings(settings);
}

export async function saveWorkoutLog(log: WorkoutLog, snapshot: AppData): Promise<void> {
  const nextLogs = [log, ...snapshot.workoutLogs.filter((item) => item.id !== log.id)];
  saveFallback({ ...snapshot, workoutLogs: nextLogs });
  if ("indexedDB" in window) {
    const db = await openDb();
    await put(db, "workoutLogs", log);
  }
  await saveCloudWorkoutLog(log);
}

export async function saveBodyWeightLog(log: BodyWeightLog, snapshot: AppData): Promise<void> {
  const nextWeights = [log, ...snapshot.bodyWeights.filter((item) => item.id !== log.id)].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  saveFallback({ ...snapshot, bodyWeights: nextWeights });
  if ("indexedDB" in window) {
    const db = await openDb();
    await put(db, "bodyWeights", log);
  }
  await saveCloudBodyWeightLog(log);
}

export async function deleteWorkoutLog(id: string, snapshot: AppData): Promise<void> {
  saveFallback({ ...snapshot, workoutLogs: snapshot.workoutLogs.filter((item) => item.id !== id) });
  if ("indexedDB" in window) {
    const db = await openDb();
    await deleteValue(db, "workoutLogs", id);
  }
  await deleteCloudWorkoutLog(id);
}

export { defaultSettings };
