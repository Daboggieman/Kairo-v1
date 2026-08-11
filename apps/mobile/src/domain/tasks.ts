/**
 * Pure task scheduling and streak calculation. No SQLite, no React, no clock reads — `nowMs`
 * or a day index is always a parameter.
 *
 * `04-feature-specs.md` singles this module out: *"streak increments on completion, breaks if
 * a scheduled day is missed (respecting each task's own recurrence rule — a 'weekdays only'
 * task shouldn't break over a weekend). This logic is worth unit-testing thoroughly; it's the
 * kind of thing that's subtly annoying to get wrong."*
 *
 * Three decisions follow from that, and they are the whole design:
 *
 * 1. **A streak is a walk over *scheduled* days, not calendar days.** Unscheduled days are
 *    skipped entirely rather than treated as missed, so a weekday habit survives the weekend
 *    and an every-third-day habit survives the two days between.
 * 2. **Today is a grace day.** A task scheduled today and not yet ticked has not been missed —
 *    the day is not over. Counting it as a break would show every streak collapsing each
 *    morning and rebuilding each evening, which is the opposite of encouraging.
 * 3. **Nothing is materialised.** `current` and `longest` are derived from the completion
 *    rows on every read (see the note on `task_completions` in `src/db/schema.ts`).
 */

import type { Task } from '@/db/types';

import { dayNumber, dayOfWeek, isWeekday, toDayKey, todayNumber, WEEKDAY_LABELS } from './dates';

/**
 * How a task repeats.
 *
 * `weekly.days` uses `getDay()` numbering (0 = Sunday) so it can index `WEEKDAY_LABELS`
 * directly. `interval.days` counts from the task's creation day — every *n*-th day, where
 * `interval:1` is the same thing as `daily`.
 */
export type Recurrence =
  | { kind: 'daily' }
  | { kind: 'weekdays' }
  | { kind: 'weekends' }
  | { kind: 'weekly'; days: number[] }
  | { kind: 'interval'; days: number };

/** What the add-task screen offers before the custom pickers. */
export const RECURRENCE_PRESETS: { rule: string; label: string }[] = [
  { rule: 'daily', label: 'Every day' },
  { rule: 'weekdays', label: 'Weekdays' },
  { rule: 'weekends', label: 'Weekends' },
];

/** Longest gap `nextDueDay` will search before giving up — a year covers every rule here. */
const MAX_LOOKAHEAD_DAYS = 366;

/**
 * Parses a stored `recurrence_rule`.
 *
 * Anything unrecognised falls back to `daily` rather than throwing, on the same principle as
 * `getGoalWeightKg`: a corrupt row should not take down the screen that renders it. `daily` is
 * the *safe* fallback specifically because it is visible — a task that shows up every day is
 * obviously wrong and one tap from being fixed, where falling back to "never scheduled" would
 * hide the task forever and look like data loss.
 */
export function parseRecurrence(rule: string): Recurrence {
  const trimmed = rule.trim().toLowerCase();
  if (trimmed === 'daily') return { kind: 'daily' };
  if (trimmed === 'weekdays') return { kind: 'weekdays' };
  if (trimmed === 'weekends') return { kind: 'weekends' };

  if (trimmed.startsWith('weekly:')) {
    const days = [
      ...new Set(
        trimmed
          .slice('weekly:'.length)
          .split(',')
          .map((part) => Number.parseInt(part, 10))
          .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
      ),
    ].sort((a, b) => a - b);
    // An empty day list would mean "never" — indistinguishable from a task that has silently
    // stopped working, so it is treated as corrupt.
    return days.length > 0 ? { kind: 'weekly', days } : { kind: 'daily' };
  }

  if (trimmed.startsWith('interval:')) {
    const days = Number.parseInt(trimmed.slice('interval:'.length), 10);
    return Number.isInteger(days) && days >= 1 ? { kind: 'interval', days } : { kind: 'daily' };
  }

  return { kind: 'daily' };
}

/** Serialises back to the stored form. Round-trips with `parseRecurrence`. */
export function formatRecurrence(recurrence: Recurrence): string {
  switch (recurrence.kind) {
    case 'weekly':
      return `weekly:${[...recurrence.days].sort((a, b) => a - b).join(',')}`;
    case 'interval':
      return `interval:${recurrence.days}`;
    default:
      return recurrence.kind;
  }
}

/** Human-readable label for a row or a header: "Weekdays", "Mon, Wed, Fri", "Every 3 days". */
export function describeRecurrence(recurrence: Recurrence): string {
  switch (recurrence.kind) {
    case 'daily':
      return 'Every day';
    case 'weekdays':
      return 'Weekdays';
    case 'weekends':
      return 'Weekends';
    case 'weekly':
      return recurrence.days.map((day) => WEEKDAY_LABELS[day]).join(', ');
    case 'interval':
      return recurrence.days === 1 ? 'Every day' : `Every ${recurrence.days} days`;
  }
}

/**
 * Whether a task recurs on a given day.
 *
 * `anchorDay` is the task's creation day and only matters for `interval`, which counts from
 * it. Days before the anchor are never scheduled — a task cannot have been due before it
 * existed, and without this a brand-new habit would show a broken streak stretching back to
 * 1970.
 */
export function isScheduledOn(recurrence: Recurrence, day: number, anchorDay: number): boolean {
  if (day < anchorDay) return false;

  switch (recurrence.kind) {
    case 'daily':
      return true;
    case 'weekdays':
      return isWeekday(day);
    case 'weekends':
      return !isWeekday(day);
    case 'weekly':
      return recurrence.days.includes(dayOfWeek(day));
    case 'interval':
      return (day - anchorDay) % recurrence.days === 0;
  }
}

/** The day index a task's schedule counts from. */
export function anchorDayOf(task: Pick<Task, 'createdAt'>): number {
  return dayNumber(toDayKey(task.createdAt));
}

/**
 * Completion dates (`YYYY-MM-DD`) as a set of day indices, which is what the walks below
 * need. Unparseable dates are dropped rather than becoming `NaN` — a `NaN` in the set would
 * never match and would quietly shorten a streak.
 */
export function completionDaySet(dates: string[]): Set<number> {
  const days = new Set<number>();
  for (const date of dates) {
    const day = dayNumber(date);
    if (Number.isFinite(day)) days.add(day);
  }
  return days;
}

/**
 * Consecutive scheduled days completed, ending today (or at the last scheduled day before
 * today while today is still open).
 *
 * The walk goes backwards from today: unscheduled days are stepped over, a completed
 * scheduled day increments, and the first *missed* scheduled day ends it. Today is the one
 * exception — if it is scheduled and not yet done, the walk starts from yesterday instead, so
 * an unfinished today neither counts nor breaks.
 *
 * Completions on unscheduled days (ticking off a weekday habit on a Sunday) are bonus work:
 * they do not extend the streak and cannot bridge a gap, because the walk only ever looks at
 * scheduled days.
 */
export function currentStreak(
  recurrence: Recurrence,
  anchorDay: number,
  completedDays: Set<number>,
  todayDay: number,
): number {
  let day = todayDay;
  if (isScheduledOn(recurrence, day, anchorDay) && !completedDays.has(day)) {
    day -= 1;
  }

  let count = 0;
  while (day >= anchorDay) {
    if (!isScheduledOn(recurrence, day, anchorDay)) {
      day -= 1;
      continue;
    }
    if (!completedDays.has(day)) break;
    count += 1;
    day -= 1;
  }
  return count;
}

/**
 * The best run of consecutive scheduled days ever completed.
 *
 * Walks forward from the task's creation day so a run is counted once, in order. Today is not
 * given the grace `currentStreak` grants it: an unfinished today simply ends the run being
 * measured, and the best already recorded stands.
 *
 * A completion dated before the creation day — reachable from an edited row or a clock change —
 * is ignored, because `isScheduledOn` says the task was not due then. That is deliberately the
 * same answer `currentStreak` gives: one rule about what counts as a scheduled day, applied by
 * both walks, rather than two functions disagreeing about the same history.
 */
export function longestStreak(
  recurrence: Recurrence,
  anchorDay: number,
  completedDays: Set<number>,
  todayDay: number,
): number {
  if (completedDays.size === 0) return 0;

  let best = 0;
  let run = 0;

  for (let day = anchorDay; day <= todayDay; day += 1) {
    if (!isScheduledOn(recurrence, day, anchorDay)) continue;
    if (!completedDays.has(day)) {
      run = 0;
      continue;
    }
    run += 1;
    if (run > best) best = run;
  }
  return best;
}

/**
 * The next day this task is due, at or after `fromDay`, or null if it never comes round again
 * within a year (only reachable from a corrupt rule, since every rule here repeats).
 */
export function nextDueDay(
  recurrence: Recurrence,
  anchorDay: number,
  fromDay: number,
): number | null {
  for (let day = fromDay; day < fromDay + MAX_LOOKAHEAD_DAYS; day += 1) {
    if (isScheduledOn(recurrence, day, anchorDay)) return day;
  }
  return null;
}

/**
 * Scheduled days in the trailing window versus how many were completed — the "23 of 30" stat
 * on the detail screen.
 *
 * Windowed on *scheduled* days rather than calendar days so the percentage means the same
 * thing for a daily habit and a weekends-only one. Days before the task existed are excluded
 * by `isScheduledOn`, so a task created yesterday is not reported as 1 of 30.
 */
export function completionRate(
  recurrence: Recurrence,
  anchorDay: number,
  completedDays: Set<number>,
  todayDay: number,
  windowDays: number,
): { scheduled: number; completed: number } {
  let scheduled = 0;
  let completed = 0;
  const start = Math.max(anchorDay, todayDay - (windowDays - 1));

  for (let day = start; day <= todayDay; day += 1) {
    if (!isScheduledOn(recurrence, day, anchorDay)) continue;
    scheduled += 1;
    if (completedDays.has(day)) completed += 1;
  }
  return { scheduled, completed };
}

export type StreakSummary = {
  current: number;
  longest: number;
  /** Scheduled today — whether the task belongs on the Today list at all. */
  dueToday: boolean;
  /** Ticked off today. Independent of `dueToday`: bonus completions are allowed. */
  doneToday: boolean;
  /**
   * Due today, not yet done, and there is a live streak to lose. The nudge worth surfacing —
   * distinct from `dueToday`, because a task with no streak behind it has nothing at stake.
   */
  atRisk: boolean;
  /** Most recent completion, `YYYY-MM-DD`, or null. */
  lastCompletedDate: string | null;
  totalCompletions: number;
};

/**
 * Everything a row or the detail header needs about one task, from its completion dates.
 *
 * The analogue of `summarise` in the weight module: one call, `nowMs` injected, so a screen
 * renders identically no matter when React happens to re-render it.
 */
export function summariseTask(
  task: Pick<Task, 'createdAt' | 'recurrenceRule'>,
  completionDates: string[],
  nowMs: number,
): StreakSummary {
  const recurrence = parseRecurrence(task.recurrenceRule);
  const anchorDay = anchorDayOf(task);
  const days = completionDaySet(completionDates);
  const todayDay = todayNumber(nowMs);

  const dueToday = isScheduledOn(recurrence, todayDay, anchorDay);
  const doneToday = days.has(todayDay);
  const current = currentStreak(recurrence, anchorDay, days, todayDay);

  let lastCompletedDate: string | null = null;
  for (const date of completionDates) {
    if (lastCompletedDate === null || date > lastCompletedDate) lastCompletedDate = date;
  }

  return {
    current,
    longest: longestStreak(recurrence, anchorDay, days, todayDay),
    dueToday,
    doneToday,
    atRisk: dueToday && !doneToday && current > 0,
    lastCompletedDate,
    totalCompletions: days.size,
  };
}

/** A task with its schedule resolved for one day — what the Today screen sorts and renders. */
export type TodayTask = {
  task: Task;
  recurrence: Recurrence;
  streak: StreakSummary;
};

/**
 * Splits tasks into what is due today and what is not, each sorted for reading.
 *
 * Due-but-unfinished sorts above already-done so the list shrinks towards the top as the day
 * goes on, and within a group the longer streak leads — the thing the user least wants to
 * drop is the thing they see first. Creation order breaks ties, which keeps the list stable
 * across re-renders instead of shuffling as streaks change.
 */
export function splitByDueToday(
  tasks: Task[],
  completionsByTask: Map<string, string[]>,
  nowMs: number,
): { due: TodayTask[]; notToday: TodayTask[] } {
  const entries: TodayTask[] = tasks.map((task) => ({
    task,
    recurrence: parseRecurrence(task.recurrenceRule),
    streak: summariseTask(task, completionsByTask.get(task.id) ?? [], nowMs),
  }));

  const byPriority = (a: TodayTask, b: TodayTask) => {
    if (a.streak.doneToday !== b.streak.doneToday) return a.streak.doneToday ? 1 : -1;
    if (a.streak.current !== b.streak.current) return b.streak.current - a.streak.current;
    return a.task.createdAt.localeCompare(b.task.createdAt);
  };

  return {
    due: entries.filter((entry) => entry.streak.dueToday).sort(byPriority),
    notToday: entries.filter((entry) => !entry.streak.dueToday).sort(byPriority),
  };
}

/** "3 of 4 done" for the Today header. */
export function formatProgress(done: number, total: number): string {
  if (total === 0) return 'Nothing scheduled';
  return `${done} of ${total} done`;
}

/** Streak badge text. Empty string means "no badge" — a zero streak is not worth the pixels. */
export function formatStreak(streak: number): string {
  return streak > 0 ? `${streak}d` : '';
}

/**
 * What one day looks like on the history grid.
 *
 * `unscheduled` covers both "the rule does not include this day" and "the task did not exist
 * yet", because `isScheduledOn` already answers both the same way and the grid renders them
 * identically — a faint placeholder that keeps the calendar's shape without claiming anything
 * happened. `pending` is today, due, not yet done: it needs its own state rather than borrowing
 * `unscheduled`, or the one day the user can still act on would look like a rest day.
 */
export type HistoryState = 'done' | 'missed' | 'pending' | 'unscheduled' | 'future';

export type HistoryCell = { day: number; state: HistoryState };

/**
 * Recent history as calendar weeks, oldest first, each week Sunday-first.
 *
 * Week-aligned rather than a flat run of the last N days: aligning the columns to weekdays is
 * the whole reason a grid beats a list here — a weekday habit shows two blank columns down the
 * right-hand side, so the *shape* of the rule is visible at a glance. That is also why the last
 * row runs to Saturday and marks the days after today as `future` instead of stopping at today,
 * which would leave a ragged edge that reads as missing data.
 */
export function historyGrid(
  recurrence: Recurrence,
  anchorDay: number,
  completedDays: Set<number>,
  todayDay: number,
  weeks: number,
): HistoryCell[][] {
  const thisWeekStart = todayDay - dayOfWeek(todayDay);
  const grid: HistoryCell[][] = [];

  for (let week = 0; week < weeks; week += 1) {
    const start = thisWeekStart - (weeks - 1 - week) * 7;
    const row: HistoryCell[] = [];
    for (let offset = 0; offset < 7; offset += 1) {
      const day = start + offset;
      row.push({ day, state: historyState(recurrence, anchorDay, completedDays, todayDay, day) });
    }
    grid.push(row);
  }
  return grid;
}

function historyState(
  recurrence: Recurrence,
  anchorDay: number,
  completedDays: Set<number>,
  todayDay: number,
  day: number,
): HistoryState {
  // Completion wins over everything except the future: a bonus tick on an unscheduled day is
  // real work and the grid should show it, even though the streak walk ignores it.
  if (completedDays.has(day)) return 'done';
  if (day > todayDay) return 'future';
  if (!isScheduledOn(recurrence, day, anchorDay)) return 'unscheduled';
  // Today is not missed until it is over — the same grace `currentStreak` grants it.
  return day === todayDay ? 'pending' : 'missed';
}
