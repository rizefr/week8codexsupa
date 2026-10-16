import { BodyWeightLog } from "../types";
import { daysSince } from "./date";

export interface BodyTrend {
  /** Mean of the last 7 entries (or fewer if that is all there is). */
  average7: number | null;
  /** Regression slope over the last 28 days, as % of body weight per week. */
  weeklyRatePercent: number | null;
  weeklyRateLb: number | null;
  rateVerdict: string;
  rateTone: "success" | "warn" | "neutral";
  ratio: number | null;
  ratioChange: number | null;
  waistChange: number | null;
  weights: BodyWeightLog[];
  movingAverage: number[];
}

/** Lean-bulk band for a newer lifter: roughly 0.25-0.5% of body weight per week. */
export const LEAN_BULK_BAND = { min: 0.25, max: 0.5 };

export function rateVerdict(percent: number): { text: string; tone: BodyTrend["rateTone"] } {
  if (percent < -0.15) return { text: "losing weight", tone: "warn" };
  if (percent < 0.1) return { text: "holding steady (recomp)", tone: "neutral" };
  if (percent < LEAN_BULK_BAND.min) return { text: "slow gain", tone: "neutral" };
  if (percent <= LEAN_BULK_BAND.max) return { text: "lean-bulk pace", tone: "success" };
  if (percent <= 0.75) return { text: "a little fast", tone: "warn" };
  return { text: "too fast for a lean bulk", tone: "warn" };
}

export function bodyTrend(entries: BodyWeightLog[]): BodyTrend {
  const weights = [...entries].filter((entry) => entry.weight > 0).sort((a, b) => a.date.localeCompare(b.date));
  const latestDate = weights.at(-1)?.date;
  const recent = weights.slice(-7);
  const average7 = recent.length ? recent.reduce((sum, entry) => sum + entry.weight, 0) / recent.length : null;

  let weeklyRatePercent: number | null = null;
  let weeklyRateLb: number | null = null;
  if (latestDate) {
    const window = weights.filter((entry) => daysSince(entry.date, latestDate) <= 28);
    const span = window.length ? daysSince(window[0].date, latestDate) : 0;
    if (window.length >= 3 && span >= 7) {
      const xs = window.map((entry) => daysSince(window[0].date, entry.date));
      const ys = window.map((entry) => entry.weight);
      const meanX = xs.reduce((a, b) => a + b, 0) / xs.length;
      const meanY = ys.reduce((a, b) => a + b, 0) / ys.length;
      const numerator = xs.reduce((sum, x, index) => sum + (x - meanX) * (ys[index] - meanY), 0);
      const denominator = xs.reduce((sum, x) => sum + (x - meanX) ** 2, 0);
      if (denominator > 0) {
        weeklyRateLb = (numerator / denominator) * 7;
        weeklyRatePercent = (weeklyRateLb / meanY) * 100;
      }
    }
  }
  const verdict = weeklyRatePercent === null ? { text: "not enough data", tone: "neutral" as const } : rateVerdict(weeklyRatePercent);

  const measured = weights.filter((entry) => (entry.waistIn ?? 0) > 0 && (entry.shouldersIn ?? 0) > 0);
  const ratioOf = (entry: BodyWeightLog) => (entry.shouldersIn ?? 0) / (entry.waistIn ?? 1);
  const ratio = measured.length ? ratioOf(measured.at(-1)!) : null;
  const ratioChange = measured.length >= 2 ? ratioOf(measured.at(-1)!) - ratioOf(measured[0]) : null;
  const waists = weights.filter((entry) => (entry.waistIn ?? 0) > 0);
  const waistChange = waists.length >= 2 ? waists.at(-1)!.waistIn! - waists[0].waistIn! : null;

  const movingAverage = weights.map((_, index) => {
    const slice = weights.slice(Math.max(0, index - 6), index + 1);
    return slice.reduce((sum, entry) => sum + entry.weight, 0) / slice.length;
  });

  return {
    average7,
    weeklyRatePercent,
    weeklyRateLb,
    rateVerdict: verdict.text,
    rateTone: verdict.tone,
    ratio,
    ratioChange,
    waistChange,
    weights,
    movingAverage,
  };
}
