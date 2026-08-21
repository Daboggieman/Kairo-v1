import type { WeekStartDay } from './dates';
import { dayKeyFromNumber, startOfWeek, todayNumber } from './dates';

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

export function describeVerdict(input: { kept: number; due: number; macroDaysOver: number }): string {
  if (input.due === 0 && input.macroDaysOver === 0) return 'A quiet week. Nothing was owed.';
  if (input.kept === input.due && input.macroDaysOver === 0) return `A held week. All ${input.due} rites were kept, and the decree held.`;
  const missed = Math.max(0, input.due - input.kept);
  const parts = [missed > 0 ? `${missed} ${missed === 1 ? 'rite slipped' : 'rites slipped'}` : null,
    input.macroDaysOver > 0 ? `the decree broke on ${input.macroDaysOver} ${input.macroDaysOver === 1 ? 'day' : 'days'}` : null].filter(Boolean);
  return `An uneven week. ${parts.join(', ')}.`;
}
