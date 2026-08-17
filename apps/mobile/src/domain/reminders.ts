/**
 * Reminder scheduling shapes — pure.
 *
 * The native call lives in `src/services/notifications.ts`. What is worth testing is the
 * translation of a stored alarm row into the triggers it needs: the daily-versus-weekly
 * decision, and the validation that keeps a corrupt row from scheduling nonsense.
 */

/**
 * Weekdays are `1` (Sunday) through `7` (Saturday) — `expo-notifications`' numbering, which is
 * `Date.getDay() + 1`, not the `getDay()` numbering `src/domain/tasks.ts` uses for recurrence.
 */
export type ReminderTrigger =
  | { type: 'daily'; hour: number; minute: number }
  | { type: 'weekly'; weekday: number; hour: number; minute: number };

export type ReminderSchedule = { hour: number; minute: number; repeatDays: number[] };

const MIN_WEEKDAY = 1;
const MAX_WEEKDAY = 7;

function isWeekday(value: number): boolean {
  return Number.isInteger(value) && value >= MIN_WEEKDAY && value <= MAX_WEEKDAY;
}

function isTimeOfDay(hour: number, minute: number): boolean {
  return (
    Number.isInteger(hour) && hour >= 0 && hour <= 23 &&
    Number.isInteger(minute) && minute >= 0 && minute <= 59
  );
}

/**
 * The triggers one alarm row needs: one daily trigger, or one weekly trigger per selected day.
 *
 * An **empty** `repeatDays` means daily — that is the alarms screen's contract, where selecting
 * no weekday is the default. A **non-empty** list whose days are all invalid returns no triggers
 * instead of falling back to daily: it is reachable only from a corrupt or hand-edited row, and
 * firing a reminder every day when the row asked for specific days is worse than not firing.
 * An invalid time returns nothing for the same reason (the screen and the `alarms` CHECK
 * constraints both reject one already, so this is the third line of defence).
 */
export function reminderTriggers(schedule: ReminderSchedule): ReminderTrigger[] {
  const { hour, minute } = schedule;
  if (!isTimeOfDay(hour, minute)) return [];
  if (schedule.repeatDays.length === 0) return [{ type: 'daily', hour, minute }];

  // Deduplicated and sorted so the stored `notification_id` list is stable for a given row.
  const weekdays = [...new Set(schedule.repeatDays)].filter(isWeekday).sort((a, b) => a - b);
  return weekdays.map((weekday) => ({ type: 'weekly', weekday, hour, minute }));
}
