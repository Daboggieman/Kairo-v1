/**
 * Pure body-weight calculations: daily bucketing, the rolling average, and the trend
 * summary. No SQLite, no React, no clock reads — anything time-dependent takes `now`.
 *
 * The whole module exists to serve one line in `04-feature-specs.md`: *"trend, not noise —
 * daily weight fluctuates, the chart should smooth it."* Two things follow from that, and
 * they are the reason this is more than a `reduce`:
 *
 * 1. Weight is bucketed per **calendar day** before anything else. Someone who steps on the
 *    scale twice on a Tuesday has not gained a day of data, and plotting both makes the raw
 *    line spike for a reason that is not about their body.
 * 2. The rolling average windows by **date, not by sample count**. A count-based window
 *    silently stretches across a two-week gap and reports a "7-day average" spanning a
 *    fortnight — exactly when the number matters most, after time away.
 */

import type { BodyWeightEntry, WeightUnit } from '@/db/types';

import { dayNumber, toDayKey, todayNumber } from './dates';
import { LB_PER_KG, toKg } from './workouts';

/** The window `04-feature-specs.md` asks for. */
export const TREND_WINDOW_DAYS = 7;

/** One calendar day of weight, in kg, with the raw entries collapsed into a mean. */
export type DailyWeight = {
  /** Local calendar day, `YYYY-MM-DD`. */
  dayKey: string;
  /** Whole days since the epoch — the chart's x axis, and what makes date windowing integer math. */
  day: number;
  /** Mean of that day's entries, normalised to kg. */
  weightKg: number;
  /** How many entries were averaged, so the UI can mark a day the user weighed in twice. */
  entryCount: number;
};

/** A point on the smoothed overlay. `value` is kg, like everything else here. */
export type TrendPoint = { day: number; value: number };

/**
 * Collapses entries into one point per calendar day, oldest first.
 *
 * Input order does not matter; the result is always sorted, because the rolling average and
 * the chart path both walk it left to right.
 */
export function dailyWeights(entries: BodyWeightEntry[]): DailyWeight[] {
  const byDay = new Map<string, { sum: number; count: number }>();

  for (const entry of entries) {
    const dayKey = toDayKey(entry.recordedAt);
    const bucket = byDay.get(dayKey) ?? { sum: 0, count: 0 };
    bucket.sum += toKg(entry.weight, entry.weightUnit);
    bucket.count += 1;
    byDay.set(dayKey, bucket);
  }

  return [...byDay.entries()]
    .map(([dayKey, { sum, count }]) => ({
      dayKey,
      day: dayNumber(dayKey),
      weightKg: sum / count,
      entryCount: count,
    }))
    .sort((a, b) => a.day - b.day);
}

/**
 * Trailing rolling average over a window of *days*.
 *
 * Every input point gets an output point, including the first few where the window is only
 * partly filled. Waiting for a full week before drawing anything would leave a new user
 * staring at a raw line with no trend for their first seven days, which is precisely when
 * the reassurance is worth most. A partial average is a real average of real data — it is
 * just noisier, and it converges as days accumulate.
 */
export function movingAverage(
  points: DailyWeight[],
  windowDays: number = TREND_WINDOW_DAYS,
): TrendPoint[] {
  if (windowDays < 1) return points.map((point) => ({ day: point.day, value: point.weightKg }));

  const result: TrendPoint[] = [];
  // `points` is sorted, so the window is a contiguous slice and `start` only moves forward.
  let start = 0;
  let sum = 0;

  for (let index = 0; index < points.length; index += 1) {
    sum += points[index].weightKg;
    const oldest = points[index].day - (windowDays - 1);
    while (points[start].day < oldest) {
      sum -= points[start].weightKg;
      start += 1;
    }
    result.push({ day: points[index].day, value: sum / (index - start + 1) });
  }

  return result;
}

export type TrendSummary = {
  /** Most recent single weigh-in, kg. Null when there is no data at all. */
  latestKg: number | null;
  /** Where the smoothed line ends — the honest "what do I weigh" number. */
  trendKg: number | null;
  /**
   * Change in the *trend* across the period, kg. Null when the period contains fewer than
   * two days of data, because one point is not a direction.
   *
   * Deliberately the trend delta rather than the raw first-to-last delta: comparing two
   * individual weigh-ins measures hydration as much as progress, which is the noise the
   * module exists to remove.
   */
  changeKg: number | null;
  /** Days of data actually present in the period, not days elapsed. */
  daysLogged: number;
};

/**
 * Summary for the header above the chart, over the trailing `periodDays`.
 *
 * `nowMs` is injected so this is testable without a fake clock and renders identically no
 * matter when the screen happens to re-render.
 */
export function summarise(
  points: DailyWeight[],
  trend: TrendPoint[],
  nowMs: number,
  periodDays = 30,
): TrendSummary {
  // `todayNumber` rather than `nowMs / MS_PER_DAY`: the points were bucketed by *local*
  // calendar day, so a UTC-derived cutoff would compare two different calendars and shift
  // the window by a day for anyone not on UTC.
  const today = todayNumber(nowMs);
  const cutoff = today - (periodDays - 1);
  const inPeriod = points.filter((point) => point.day >= cutoff);
  const trendInPeriod = trend.filter((point) => point.day >= cutoff);

  return {
    latestKg: points.length > 0 ? points[points.length - 1].weightKg : null,
    trendKg: trend.length > 0 ? trend[trend.length - 1].value : null,
    changeKg:
      trendInPeriod.length >= 2
        ? trendInPeriod[trendInPeriod.length - 1].value - trendInPeriod[0].value
        : null,
    daysLogged: inPeriod.length,
  };
}

/**
 * Keeps only the trailing `days` of data, relative to `nowMs`.
 *
 * Applied *after* the rolling average rather than before, so the leftmost visible point
 * carries a fully-formed window instead of restarting from a partial one at the range edge.
 */
export function withinDays<T extends { day: number }>(points: T[], nowMs: number, days: number): T[] {
  const cutoff = todayNumber(nowMs) - (days - 1);
  return points.filter((point) => point.day >= cutoff);
}

/** Signed, one decimal, with an explicit sign so a loss reads as a loss: "-1.4kg". */
export function formatDelta(deltaKg: number | null, unit: WeightUnit): string {
  if (deltaKg === null) return '—';
  const value = unit === 'kg' ? deltaKg : deltaKg * LB_PER_KG;
  const rounded = Math.round(value * 10) / 10;
  // -0 formats as "-0.0", which reads as a loss that did not happen.
  const safe = Object.is(rounded, -0) ? 0 : rounded;
  return `${safe > 0 ? '+' : ''}${safe.toFixed(1)}${unit}`;
}

/** kg to the display unit, rounded for a label. */
export function toDisplayWeight(kg: number, unit: WeightUnit): number {
  const value = unit === 'kg' ? kg : kg * LB_PER_KG;
  return Math.round(value * 10) / 10;
}

/**
 * The unit to render in: whatever the user logged most recently.
 *
 * `04-feature-specs.md` leaves the unit preference open ("stored once in user preferences,
 * not per entry") while the schema keeps a unit per row, matching the workouts module. Until
 * that decision lands, following the latest entry means the screen speaks back to the user
 * in the unit they just typed, and switching units is a matter of logging in the new one.
 */
export function displayUnit(entries: BodyWeightEntry[]): WeightUnit {
  let latest: BodyWeightEntry | null = null;
  for (const entry of entries) {
    if (!latest || entry.recordedAt > latest.recordedAt) latest = entry;
  }
  return latest?.weightUnit ?? 'kg';
}

/** How far the trend is from the goal, in kg. Positive means still above the goal. */
export function goalDelta(trendKg: number | null, goalKg: number | null): number | null {
  if (trendKg === null || goalKg === null) return null;
  return trendKg - goalKg;
}
