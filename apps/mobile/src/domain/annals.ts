import type { MacroTarget, NutritionEntryWithFood, Task } from '@/db/types';

import type { WeekStartDay } from './dates';
import { dayKeyFromNumber, dayNumber, startOfWeek, todayNumber } from './dates';
import { summariseMacros } from './macros';
import { anchorDayOf, completionDaySet, isScheduledOn, parseRecurrence } from './tasks';

export type WeekRange = { start: number; end: number; startKey: string; endKey: string };

export function weekRange(day: number, weekStart: WeekStartDay): WeekRange {
  const start = startOfWeek(day, weekStart);
  return { start, end: start + 6, startKey: dayKeyFromNumber(start), endKey: dayKeyFromNumber(start + 6) };
}

export function currentWeekRange(nowMs: number, weekStart: WeekStartDay): WeekRange {
  return weekRange(todayNumber(nowMs), weekStart);
}

/** Ordinal week within the year, derived from the chosen first day rather than ISO rules. */
export function weekNumber(day: number, weekStart: WeekStartDay): number {
  const year = Number(dayKeyFromNumber(day).slice(0, 4));
  const firstDay = Math.round(Date.parse(`${year}-01-01T00:00:00.000Z`) / 86_400_000);
  const firstWeek = startOfWeek(firstDay, weekStart);
  return Math.floor((startOfWeek(day, weekStart) - firstWeek) / 7) + 1;
}

/** The seven day indices a range covers, in order. Saves every caller writing the same loop. */
export function weekDays(range: WeekRange): number[] {
  return Array.from({ length: 7 }, (_, offset) => range.start + offset);
}

export type DayLedger = {
  day: number;
  /** Rites scheduled on this day that were ticked off. */
  kept: number;
  /** Rites owed on this day — scheduled, and either done or already past. */
  due: number;
  /** A target was in force, something was logged, and it went over. */
  decreeBroke: boolean;
  /** Nothing to say about the decree: no target in force, or nothing logged. */
  decreeSilent: boolean;
  /** Later than today. Rendered, but it reports nothing rather than a slip. */
  future: boolean;
};

export type WeekLedger = {
  days: DayLedger[];
  kept: number;
  due: number;
  macroDaysOver: number;
};

/**
 * The whole week, per day and in total.
 *
 * **One function rather than a tally and a strip.** The reckoning card and the day strip describe the
 * same seven days, and computing them separately is how a verdict saying *"a held week"* ends up above
 * a strip showing a miss. The totals here are sums of the rows directly beneath them, so the two
 * cannot disagree.
 *
 * Four rules on the rite count, each a decision rather than an implementation detail:
 *
 * - **Archived tasks are excluded**, matching `perfectWeeks`. A rite put away is not owed.
 * - **Only *scheduled* days count.** A completion on an unscheduled day is real work, and
 *   `historyState` shows it as `done` for exactly that reason — but counting it here would push
 *   `kept` above `due` and fire `describeVerdict`'s `kept === due` branch on a week that missed
 *   something. The streak walk ignores bonus ticks too; this follows it.
 * - **A scheduled day later than today is not yet owed.** Without this the *current* week always
 *   reads as slipped for days that have not happened — the same class of wrong answer as the
 *   hardcoded zeros this replaced.
 * - **Today is owed only once it is done.** `historyState` grants today `pending`, never `missed`;
 *   counting it as due-and-unkept would report a slip at breakfast.
 *
 * And two on the decree: a day with **no target** cannot break one that was never set, and a day
 * with **nothing logged** has not eaten past it. Both are `decreeSilent`, not `decreeBroke`.
 *
 * `targets` must be ordered oldest-first by `effectiveDate` — what `listMacroTargetsBetween` returns,
 * with the target in force at the week's start on the front. See `targetForDay`.
 */
export function weekLedger(input: {
  tasks: Task[];
  completions: Map<string, string[]>;
  entries: NutritionEntryWithFood[];
  targets: MacroTarget[];
  range: WeekRange;
  today: number;
}): WeekLedger {
  const { tasks, completions, entries, targets, range, today } = input;

  const entriesByDay = new Map<string, NutritionEntryWithFood[]>();
  for (const entry of entries) {
    const existing = entriesByDay.get(entry.loggedDate);
    if (existing) existing.push(entry);
    else entriesByDay.set(entry.loggedDate, [entry]);
  }

  const active = tasks.filter((task) => !task.archived);
  const schedules = active.map((task) => ({
    recurrence: parseRecurrence(task.recurrenceRule),
    anchor: anchorDayOf(task),
    done: completionDaySet(completions.get(task.id) ?? []),
  }));

  const days = weekDays(range).map((day): DayLedger => {
    let kept = 0;
    let due = 0;
    for (const schedule of schedules) {
      if (!isScheduledOn(schedule.recurrence, day, schedule.anchor)) continue;
      if (schedule.done.has(day)) {
        kept += 1;
        due += 1;
      } else if (day < today) {
        due += 1;
      }
    }

    const target = day > today ? null : targetForDay(targets, day);
    const dayEntries = entriesByDay.get(dayKeyFromNumber(day)) ?? [];
    const decreeSilent = target === null || dayEntries.length === 0;
    const decreeBroke =
      !decreeSilent && summariseMacros(dayEntries, target).calories.overTarget;

    return { day, kept, due, decreeBroke, decreeSilent, future: day > today };
  });

  return {
    days,
    kept: days.reduce((total, day) => total + day.kept, 0),
    due: days.reduce((total, day) => total + day.due, 0),
    macroDaysOver: days.filter((day) => day.decreeBroke).length,
  };
}

/**
 * The target in force on a day: the latest one effective at or before it, or `null`.
 *
 * Targets are effective-dated, so the one that governs a day is often **not** one set that week —
 * which is why the caller passes the target in force at the week's start alongside any that changed
 * during it. Reading only the week's own rows reports "no decree" for a week that simply did not
 * change one, and that reads as a silent day rather than the bug it is.
 */
export function targetForDay(targets: MacroTarget[], day: number): MacroTarget | null {
  let inForce: MacroTarget | null = null;
  for (const target of targets) {
    if (dayNumber(target.effectiveDate) <= day) inForce = target;
  }
  return inForce;
}

export function describeVerdict(input: { kept: number; due: number; macroDaysOver: number }): string {
  if (input.due === 0 && input.macroDaysOver === 0) return 'A quiet week. Nothing was owed.';
  if (input.kept === input.due && input.macroDaysOver === 0) return `A held week. All ${input.due} rites were kept, and the decree held.`;
  const missed = Math.max(0, input.due - input.kept);
  const parts = [missed > 0 ? `${missed} ${missed === 1 ? 'rite slipped' : 'rites slipped'}` : null,
    input.macroDaysOver > 0 ? `the decree broke on ${input.macroDaysOver} ${input.macroDaysOver === 1 ? 'day' : 'days'}` : null].filter(Boolean);
  return `An uneven week. ${parts.join(', ')}.`;
}
