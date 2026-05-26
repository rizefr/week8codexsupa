import { AppData, BodyWeightLog, ProgramSettings, WorkoutLog } from "../types";

type CloudConfig = {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
};

type CloudSession = {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  user?: {
    id?: string;
    email?: string;
  };
};

type CloudDataResult = {
  data: AppData;
  hasSettings: boolean;
};

const CLOUD_SESSION_KEY = "chad-aesthetic-dashboard:supabase-session";

let lastCloudError = "";

declare global {
  interface Window {
    __TRAINING_APP_CONFIG__?: CloudConfig;
  }
}

function getConfig(): CloudConfig {
  return window.__TRAINING_APP_CONFIG__ ?? {};
}

export function isCloudConfigured(): boolean {
  const config = getConfig();
  return Boolean(config.supabaseUrl && config.supabaseAnonKey);
}

function normalizeSupabaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return window.atob(padded);
}

function decodeJwt(token: string): Record<string, unknown> {
  try {
    const [, payload] = token.split(".");
    return JSON.parse(decodeBase64Url(payload));
  } catch {
    return {};
  }
}

function readSession(): CloudSession | null {
  const raw = localStorage.getItem(CLOUD_SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CloudSession;
  } catch {
    localStorage.removeItem(CLOUD_SESSION_KEY);
    return null;
  }
}

function writeSession(session: CloudSession): CloudSession {
  const claims = decodeJwt(session.access_token);
  const enriched = {
    ...session,
    user: {
      id: session.user?.id ?? (claims.sub as string | undefined),
      email: session.user?.email ?? (claims.email as string | undefined),
    },
  };
  localStorage.setItem(CLOUD_SESSION_KEY, JSON.stringify(enriched));
  return enriched;
}

function clearSession(): void {
  localStorage.removeItem(CLOUD_SESSION_KEY);
}

export function consumeCloudAuthRedirect(): boolean {
  if (!window.location.hash.includes("access_token=")) return false;
  const params = new URLSearchParams(window.location.hash.slice(1));
  const accessToken = params.get("access_token");
  if (!accessToken) return false;
  writeSession({
    access_token: accessToken,
    refresh_token: params.get("refresh_token") ?? undefined,
    expires_at: params.get("expires_at") ? Number(params.get("expires_at")) : undefined,
  });
  window.history.replaceState(null, "", `${window.location.pathname}#/dashboard`);
  return true;
}

export function getCloudStatus() {
  const session = readSession();
  return {
    configured: isCloudConfigured(),
    signedIn: Boolean(session?.access_token),
    email: session?.user?.email,
    userId: session?.user?.id,
    lastError: lastCloudError,
  };
}

function cloudHeaders(session?: CloudSession): HeadersInit {
  const config = getConfig();
  const headers: HeadersInit = {
    apikey: config.supabaseAnonKey ?? "",
    "Content-Type": "application/json",
  };
  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }
  return headers;
}

async function cloudFetch(path: string, init: RequestInit = {}, session?: CloudSession): Promise<Response> {
  const config = getConfig();
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    throw new Error("Supabase is not configured.");
  }
  const response = await fetch(`${normalizeSupabaseUrl(config.supabaseUrl)}${path}`, {
    ...init,
    headers: {
      ...cloudHeaders(session),
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Supabase request failed with ${response.status}`);
  }
  return response;
}

async function currentSession(): Promise<CloudSession | null> {
  let session = readSession();
  if (!session) return null;
  const expiresSoon = session.expires_at ? session.expires_at * 1000 - Date.now() < 60_000 : false;
  if (!expiresSoon || !session.refresh_token) return session;
  try {
    const response = await cloudFetch("/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
    session = writeSession((await response.json()) as CloudSession);
  } catch (error) {
    lastCloudError = error instanceof Error ? error.message : "Could not refresh Supabase session.";
    clearSession();
    return null;
  }
  return session;
}

function requireUserId(session: CloudSession): string {
  const userId = session.user?.id ?? (decodeJwt(session.access_token).sub as string | undefined);
  if (!userId) throw new Error("Could not identify the signed-in Supabase user.");
  return userId;
}

export async function sendMagicLink(email: string): Promise<void> {
  lastCloudError = "";
  await cloudFetch("/auth/v1/magiclink", {
    method: "POST",
    body: JSON.stringify({
      email,
      options: {
        redirectTo: `${window.location.origin}${window.location.pathname}`,
      },
    }),
  });
}

export async function signOutCloud(): Promise<void> {
  const session = readSession();
  clearSession();
  if (session?.access_token && isCloudConfigured()) {
    await cloudFetch("/auth/v1/logout", { method: "POST" }, session).catch(() => undefined);
  }
}

export async function loadCloudData(): Promise<CloudDataResult | null> {
  lastCloudError = "";
  const session = await currentSession();
  if (!session || !isCloudConfigured()) return null;
  try {
    const [settingsResponse, workoutsResponse, weightsResponse] = await Promise.all([
      cloudFetch("/rest/v1/app_settings?select=settings&limit=1", { method: "GET" }, session),
      cloudFetch("/rest/v1/workout_logs?select=log&order=date.desc", { method: "GET" }, session),
      cloudFetch("/rest/v1/body_weight_logs?select=log&order=date.asc", { method: "GET" }, session),
    ]);
    const settingsRows = (await settingsResponse.json()) as { settings: ProgramSettings }[];
    const workoutRows = (await workoutsResponse.json()) as { log: WorkoutLog }[];
    const weightRows = (await weightsResponse.json()) as { log: BodyWeightLog }[];
    return {
      hasSettings: settingsRows.length > 0,
      data: {
        settings: settingsRows[0]?.settings,
        workoutLogs: workoutRows.map((row) => row.log),
        bodyWeights: weightRows.map((row) => row.log),
      } as AppData,
    };
  } catch (error) {
    lastCloudError = error instanceof Error ? error.message : "Could not load Supabase data.";
    return null;
  }
}

export async function saveCloudSettings(settings: ProgramSettings): Promise<void> {
  lastCloudError = "";
  const session = await currentSession();
  if (!session || !isCloudConfigured()) return;
  const userId = requireUserId(session);
  await cloudFetch("/rest/v1/app_settings?on_conflict=user_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ user_id: userId, settings }),
  }, session);
}

export async function saveCloudWorkoutLog(log: WorkoutLog): Promise<void> {
  lastCloudError = "";
  const session = await currentSession();
  if (!session || !isCloudConfigured()) return;
  const userId = requireUserId(session);
  await cloudFetch("/rest/v1/workout_logs?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ id: log.id, user_id: userId, date: log.date, day_key: log.dayKey, log }),
  }, session);
}

export async function saveCloudBodyWeightLog(log: BodyWeightLog): Promise<void> {
  lastCloudError = "";
  const session = await currentSession();
  if (!session || !isCloudConfigured()) return;
  const userId = requireUserId(session);
  await cloudFetch("/rest/v1/body_weight_logs?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ id: log.id, user_id: userId, date: log.date, log }),
  }, session);
}

export async function deleteCloudWorkoutLog(id: string): Promise<void> {
  lastCloudError = "";
  const session = await currentSession();
  if (!session || !isCloudConfigured()) return;
  await cloudFetch(`/rest/v1/workout_logs?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" }, session);
}

export async function saveCloudSnapshot(data: AppData): Promise<void> {
  await saveCloudSettings(data.settings);
  await Promise.all([
    ...data.workoutLogs.map((log) => saveCloudWorkoutLog(log)),
    ...data.bodyWeights.map((log) => saveCloudBodyWeightLog(log)),
  ]);
}
