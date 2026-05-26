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
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy.toISOString().slice(0, 10);
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
  const start = fromISODate(startDate);
  const current = fromISODate(date);
  const diffDays = Math.floor((current.getTime() - start.getTime()) / 86400000);
  return Math.min(8, Math.max(1, Math.floor(diffDays / 7) + 1));
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
  return Math.floor((fromISODate(date).getTime() - fromISODate(startDate).getTime()) / 86400000);
}
