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

/** Signed, one decimal, with an explicit sign so a loss reads as a loss: "-1.4 kg". */
export function formatDelta(deltaKg: number | null, unit: WeightUnit): string {
  if (deltaKg === null) return '—';
  const value = unit === 'kg' ? deltaKg : deltaKg * LB_PER_KG;
  const rounded = Math.round(value * 10) / 10;
  // -0 formats as "-0.0", which reads as a loss that did not happen.
  const safe = Object.is(rounded, -0) ? 0 : rounded;
  return `${safe > 0 ? '+' : ''}${safe.toFixed(1)} ${unit}`;
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

/* ------------------------------------------------------------------------- *
 * The Scales' vocabulary
 *
 * A weighing is a **weighing**, the smoothed line is the **trend** and a goal weight is a **vow**.
 * `5.13_the_scales` and `5.15_the_vow` write a fair amount of prose about these numbers — "2.8 kg
 * from your current trend of 74.8 kg", "at 0.4 kg a week, about seven weeks" — and two screens plus
 * The Citadel say versions of it about the same figures. Same rule as `formatTonnage` in
 * `workouts.ts` and the Feast lexicon in `macros.ts`: the wording is a product decision, so it is
 * tested, so it lives here rather than in a template literal on a screen.
 * ------------------------------------------------------------------------- */

/**
 * Within this much of the vow, the trend and the vow are the same number as far as a one-decimal
 * readout is concerned, and claiming a gap that rounds to "0.0 kg to lose" is claiming a gap.
 */
const AT_VOW_KG = 0.05;

/** Below this a weekly rate rounds to 0.0, and dividing a distance by it gives a century. */
const FLAT_RATE_KG = 0.05;

/** Fewer days of span than this and a weekly rate is arithmetic rather than a measurement. */
const MIN_RATE_SPAN_DAYS = 7;

/**
 * "74.8 kg" — one weight, in the display unit, trailing zero kept.
 *
 * The space is the designs' ("74.8 kg", "72.0 kg") and is why `formatDelta` gained one too: The
 * Scales sets a trend figure and a change figure side by side in the same strip, and one of them
 * closing up its unit while the other does not reads as a typo. `toDisplayWeight` remains the
 * numeric form, for the chart axis and for pre-filling an input.
 */
export function formatWeight(kg: number | null, unit: WeightUnit): string {
  if (kg === null || !Number.isFinite(kg)) return '—';
  return `${toDisplayWeight(kg, unit).toFixed(1)} ${unit}`;
}

/** One row of The Scales' log: a weighing, and what it moved from the one before it. */
export type Weighing = {
  entry: BodyWeightEntry;
  /** Local calendar day, so `withinDays` can window the log with the same cutoff as the chart. */
  day: number;
  /** The entry's weight in kg, so a unit switched mid-history does not read as a 96 kg loss. */
  weightKg: number;
  /**
   * Change against the weighing before it, kg. Null for the earliest, which has nothing behind it.
   *
   * Per *weighing*, not per day. `dailyWeights` collapses a day to its mean because that is the
   * series the chart should draw; the log is the other question — a row that says 74.6 wants to say
   * what the previous number on the scale was, not what the previous daily mean was. Two weigh-ins
   * on one Tuesday are one chart point and two rows here, and both are honest.
   *
   * Measured against the previous weighing even when that one falls outside the visible range, so
   * windowing the log never silently changes a delta.
   */
  changeKg: number | null;
};

/** The log, newest first — the order it is read in. Input order does not matter. */
export function weighings(entries: BodyWeightEntry[]): Weighing[] {
  const ascending = [...entries].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  return ascending
    .map((entry, index) => {
      const weightKg = toKg(entry.weight, entry.weightUnit);
      const before = index === 0 ? null : ascending[index - 1];
      return {
        entry,
        day: dayNumber(toDayKey(entry.recordedAt)),
        weightKg,
        changeKg: before === null ? null : weightKg - toKg(before.weight, before.weightUnit),
      };
    })
    .reverse();
}

/**
 * How fast the trend is moving, kg per week, or null when the data cannot say.
 *
 * Null rather than a number whenever the period holds fewer than two trend points or spans less
 * than a week: a rate is a slope, and a slope taken across three days and multiplied up by seven
 * is a month's prediction made from a hydration swing. The Vow gives no estimate at all rather
 * than a confident wrong one — the same call `changeKg` makes in `summarise`.
 */
export function weeklyRateKg(
  trend: TrendPoint[],
  nowMs: number,
  periodDays = 30,
): number | null {
  const inPeriod = withinDays(trend, nowMs, periodDays);
  if (inPeriod.length < 2) return null;
  const first = inPeriod[0];
  const last = inPeriod[inPeriod.length - 1];
  const spanDays = last.day - first.day;
  if (spanDays < MIN_RATE_SPAN_DAYS) return null;
  return ((last.value - first.value) * 7) / spanDays;
}

/**
 * "2.8 kg to lose" — the caption under the vow, or null when no vow has been sworn.
 *
 * Takes `goalDelta`'s output, so positive means the trend is above the vow.
 *
 * The design writes "2.8 kg to go", which only reads unambiguously because its mock happens to sit
 * above its goal. Nothing recorded says whether a vow is a cut or a bulk, so rather than guess a
 * direction of intent this states what closing the gap takes, which is true either way.
 */
export function formatVowGap(deltaKg: number | null, unit: WeightUnit): string | null {
  if (deltaKg === null) return null;
  if (Math.abs(deltaKg) < AT_VOW_KG) return 'Reached';
  return `${formatWeight(Math.abs(deltaKg), unit)} to ${deltaKg > 0 ? 'lose' : 'gain'}`;
}

export type VowProjection = {
  /** "2.8 kg from your current trend of 74.8 kg" — no terminal stop; it is a reading, not a claim. */
  distance: string;
  /** "At 0.4 kg a week, about 7 weeks." Null only when there is nothing at all to say about time. */
  eta: string | null;
};

/**
 * The Vow's insight block: how far the vow is, and how long that takes at the current rate.
 *
 * Null when there is no vow or no trend — there is no projection to make, and the screen shows the
 * explainer alone rather than a block of hedges.
 *
 * Four things can be true of the rate and each gets its own sentence, because the one thing this
 * block must never do is imply a date the data does not support: no rate yet, a flat trend, a trend
 * moving the wrong way, and an actual estimate. The design spells the estimate out ("about seven
 * weeks"); digits here, since the number is arithmetic and every other figure on the screen is a
 * numeral, and "about" is already carrying the imprecision.
 */
export function describeVow(args: {
  goalKg: number | null;
  trendKg: number | null;
  rateKgPerWeek: number | null;
  unit: WeightUnit;
}): VowProjection | null {
  const { goalKg, trendKg, rateKgPerWeek, unit } = args;
  if (goalKg === null || trendKg === null) return null;

  const trendLabel = formatWeight(trendKg, unit);
  const delta = trendKg - goalKg;
  if (Math.abs(delta) < AT_VOW_KG) {
    return { distance: `Level with your current trend of ${trendLabel}`, eta: null };
  }

  const distance = `${formatWeight(Math.abs(delta), unit)} from your current trend of ${trendLabel}`;
  if (rateKgPerWeek === null) {
    return { distance, eta: 'Too few weighings yet to say how long that takes.' };
  }

  const rate = Math.abs(rateKgPerWeek);
  const rateLabel = formatWeight(rate, unit);
  if (rate < FLAT_RATE_KG) {
    return { distance, eta: 'Your trend is flat, so there is no date to give.' };
  }
  if (Math.sign(rateKgPerWeek) === Math.sign(delta)) {
    return { distance, eta: `Your trend is moving away from it, at ${rateLabel} a week.` };
  }

  const weeks = Math.round(Math.abs(delta) / rate);
  const when = weeks > 52 ? 'over a year' : weeks <= 1 ? 'about a week' : `about ${weeks} weeks`;
  return { distance, eta: `At ${rateLabel} a week, ${when}.` };
}
