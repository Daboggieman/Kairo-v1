/**
 * Calendar-day arithmetic, shared by any module that reasons about days rather than instants.
 *
 * Extracted from `src/domain/weight.ts` when the tasks module needed the same helpers — the
 * same move `LOCAL_USER_ID` made into `src/constants.ts`. A streak importing its day math
 * from the weight module would be an odd dependency, and two copies of "what day is it"
 * would be free to disagree.
 *
 * Two rules hold everywhere below:
 *
 * 1. **A day is a *local* calendar day.** A 23:30 weigh-in belongs to the date printed beside
 *    it, and a task ticked off at 23:30 counts for that day, not tomorrow. Every function
 *    here resolves the timezone through `dayKeyFromDate` so there is exactly one place that
 *    decides what "today" means.
 * 2. **Days are integers.** Reducing a date to a day index makes windowing, streak walks and
 *    "is this the next day" comparisons integer arithmetic instead of date manipulation,
 *    which is where DST and month lengths would otherwise bite.
 */

/** Milliseconds in a day. Only ever used to convert a *day key* to an index, never an instant. */
const MS_PER_DAY = 86_400_000;

/** `1970-01-01` was a Thursday; day index 0 therefore has weekday 4 with Sunday as 0. */
const EPOCH_WEEKDAY = 4;

/** `getDay()` order, so `WEEKDAY_LABELS[dayOfWeek(d)]` needs no offset. */
export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/**
 * Local calendar day of a `Date`, as `YYYY-MM-DD`.
 *
 * The single place the host timezone is read. `toDayKey` and `todayNumber` both route through
 * it, which is what stops "the day this timestamp belongs to" and "the day it is now" from
 * being computed two different ways — the bug being avoided is a task completed at 00:30
 * local landing on the previous day because `Math.floor(ms / MS_PER_DAY)` answers in UTC.
 */
export function dayKeyFromDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Local calendar day for an ISO timestamp, as `YYYY-MM-DD`. */
export function toDayKey(iso: string): string {
  return dayKeyFromDate(new Date(iso));
}

/**
 * `YYYY-MM-DD` to an integer day index.
 *
 * Parsed as UTC midnight on purpose: the key has already had the timezone resolved out of it
 * by `dayKeyFromDate`, so re-applying a local offset here would shift days across a DST
 * boundary — the key is a label, not an instant.
 */
export function dayNumber(dayKey: string): number {
  return Math.round(Date.parse(`${dayKey}T00:00:00.000Z`) / MS_PER_DAY);
}

/** Inverse of `dayNumber`, for labelling an axis or rendering a calendar cell. */
export function dayKeyFromNumber(day: number): string {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

/**
 * The day index of an instant — the local day it falls on.
 *
 * `nowMs` is a parameter rather than a `Date.now()` call so callers stay pure and testable,
 * which is the same rule the rest of the domain layer follows.
 */
export function todayNumber(nowMs: number): number {
  return dayNumber(dayKeyFromDate(new Date(nowMs)));
}

/**
 * Day of week for a day index, `0` = Sunday, matching `Date.prototype.getDay()`.
 *
 * The double modulo keeps this correct for negative indices (dates before 1970), which is
 * cheap insurance against a corrupt row taking a screen down.
 */
export function dayOfWeek(day: number): number {
  return (((day + EPOCH_WEEKDAY) % 7) + 7) % 7;
}

/** Monday–Friday. */
export function isWeekday(day: number): boolean {
  const weekday = dayOfWeek(day);
  return weekday >= 1 && weekday <= 5;
}

/**
 * Which day a calendar week begins on.
 *
 * Declared here rather than in `src/db/preferences.ts` even though it is a preference's value type,
 * because a week boundary is a calendar fact and `startOfWeek` is the only thing that acts on it.
 * `preferences.ts` re-exports this as `WeekStart` so there is one union and one spelling of each
 * value — a second copy of `'monday' | 'sunday'` is free to drift from this one.
 */
export type WeekStartDay = 'monday' | 'sunday';

/**
 * The day index the calendar week containing `day` starts on.
 *
 * Integer arithmetic over day indices, like everything else here: no `Date` is constructed, so a
 * week that spans a DST change is still exactly seven indices wide. Day 0 (1970-01-01) is a
 * Thursday, which `dayOfWeek` already accounts for.
 *
 * This is a *calendar* week and is not interchangeable with `movementWeek`'s rolling seven days
 * ending today — the two answer different questions, and `src/domain/movement.ts` says why its
 * window is not this one.
 */
export function startOfWeek(day: number, weekStart: WeekStartDay): number {
  const first = weekStart === 'sunday' ? 0 : 1;
  return day - (((dayOfWeek(day) - first) % 7) + 7) % 7;
}

/**
 * "Today" or "Yesterday" for a day index, `null` for one that needs its date spelled out.
 *
 * Only the two words are decided here. Spelling out the date is `toLocaleDateString`'s job, which
 * belongs at the call site: the wording is a product decision and testable, the formatting is the
 * host's and would make any assertion about it a test of the machine's locale.
 */
export function relativeDayLabel(day: number, today: number): string | null {
  if (day === today) return 'Today';
  if (day === today - 1) return 'Yesterday';
  return null;
}

/**
 * How long ago an instant was, in words: "just now", "12 minutes ago", "3 hours ago", "2 days ago".
 *
 * Instants, not day indices, which is why this sits apart from everything above — The Envoy cares
 * that a sync was 12 minutes ago, and rounding that to "today" would lose the only part that
 * matters.
 *
 * Deliberately coarse. One unit, no "1 hour 12 minutes": these read in a row of status lines where
 * the question is *roughly how stale*, and a precise duration invites comparing two of them.
 * A future instant reads as "just now" rather than growing a second vocabulary for clock skew.
 */
export function relativeTimeLabel(atMs: number, nowMs: number): string {
  const seconds = Math.floor((nowMs - atMs) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} ${plural(minutes, 'minute')} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${plural(hours, 'hour')} ago`;
  const days = Math.floor(hours / 24);
  return `${days} ${plural(days, 'day')} ago`;
}

/**
 * How far off an instant is, in the same units and the same coarseness: "in 4 minutes".
 *
 * The counterpart to `relativeTimeLabel`, and a separate function rather than a sign flag because
 * the two read differently in a sentence and the call sites know which they mean. An instant that
 * has already passed reads as "now" — for a backing-off outbox row, that is the truth.
 */
export function untilTimeLabel(atMs: number, nowMs: number): string {
  const seconds = Math.ceil((atMs - nowMs) / 1000);
  if (seconds <= 0) return 'now';
  if (seconds < 60) return 'in under a minute';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `in ${minutes} ${plural(minutes, 'minute')}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `in ${hours} ${plural(hours, 'hour')}`;
  const days = Math.floor(hours / 24);
  return `in ${days} ${plural(days, 'day')}`;
}

function plural(count: number, unit: string): string {
  return count === 1 ? unit : `${unit}s`;
}
