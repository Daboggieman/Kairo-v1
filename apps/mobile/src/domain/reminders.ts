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
/** Indexed by weekday − 1, so Sunday is first. */
const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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

/**
 * The repeat, in the words the reminders list shows under each time.
 *
 * It has to agree with `reminderTriggers` about every case, including the ugly one: a non-empty
 * list with no valid day in it schedules nothing, so it says "Never" rather than inheriting the
 * empty-list meaning and claiming a daily reminder that will not arrive.
 */
export function describeRepeat(repeatDays: number[]): string {
  const days = [...new Set(repeatDays)].filter(isWeekday).sort((a, b) => a - b);
  if (repeatDays.length === 0 || days.length === 7) return 'Every day';
  if (days.length === 0) return 'Never';
  if (days.length === 5 && days.every((day) => day >= 2 && day <= 6)) return 'Weekdays';
  if (days.length === 2 && days[0] === 1 && days[1] === 7) return 'Weekends';
  return days.map((day) => WEEKDAY_NAMES[day - 1]).join(', ');
}

/** The single-letter column headings on the reminders day picker, Sunday first. */
export function weekdayInitials(): { weekday: number; initial: string }[] {
  return WEEKDAY_NAMES.map((name, index) => ({ weekday: index + 1, initial: name[0] }));
}

/** A stored row's time, zero-padded: `07:00`. */
export function formatTimeOfDay(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * What the time field shows while it is being typed.
 *
 * Digits in, colon inserted: Android's numeric keypad has no colon key, so a field that expects
 * the user to type `07:00` is a field they cannot fill on the platform Kairo ships to first. Four
 * digits is the whole input, and deleting works because the colon is re-derived every keystroke
 * rather than stored.
 */
export function formatTimeInput(text: string): string {
  const digits = text.replace(/\D/g, '').slice(0, 4);
  return digits.length <= 2 ? digits : `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

/** The time a field holds, or `null` when it is incomplete or not a real time. */
export function parseTimeOfDay(text: string): { hour: number; minute: number } | null {
  const digits = text.replace(/\D/g, '');
  if (digits.length !== 4) return null;
  const hour = Number(digits.slice(0, 2));
  const minute = Number(digits.slice(2));
  return isTimeOfDay(hour, minute) ? { hour, minute } : null;
}
