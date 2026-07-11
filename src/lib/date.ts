import { DayKey } from "../types";

const dayKeys: DayKey[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

export function toISODate(date: Date): string {
  // Build from local components: toISOString() converts to UTC, which shifts
  // the date for timezones east of UTC once local midnight passes.
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function fromISODate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function dayKeyForDate(value: string): DayKey {
  return dayKeys[fromISODate(value).getDay()];
}

export function getProgramWeek(startDate: string, date: string): number {
  const start = fromISODate(startDate || date);
  const current = fromISODate(date);
  const diffDays = Math.floor((current.getTime() - start.getTime()) / 86400000);
  return Math.max(1, Math.floor(diffDays / 7) + 1);
}

export function getCycleInfo(startDate: string, date: string) {
  const programWeek = getProgramWeek(startDate, date);
  const cycle = Math.floor((programWeek - 1) / 8) + 1;
  const weekInCycle = ((programWeek - 1) % 8) + 1;
  return {
    programWeek,
    cycle,
    weekInCycle,
    cycleStartWeek: (cycle - 1) * 8 + 1,
    cycleEndWeek: cycle * 8,
  };
}

export function addDays(date: string, days: number): string {
  const value = fromISODate(date);
  value.setDate(value.getDate() + days);
  return toISODate(value);
}

export function formatDate(value: string, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: options?.year ?? undefined,
    weekday: options?.weekday,
  }).format(fromISODate(value));
}

export function daysSince(startDate: string, date: string): number {
  return Math.floor((fromISODate(date).getTime() - fromISODate(startDate || date).getTime()) / 86400000);
}
