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
