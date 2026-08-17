import { reminderTriggers } from '../reminders';

describe('reminderTriggers', () => {
  it('schedules one daily trigger when no weekday is selected', () => {
    expect(reminderTriggers({ hour: 7, minute: 0, repeatDays: [] })).toEqual([
      { type: 'daily', hour: 7, minute: 0 },
    ]);
  });

  it('schedules one weekly trigger per selected weekday', () => {
    expect(reminderTriggers({ hour: 18, minute: 30, repeatDays: [2, 4, 6] })).toEqual([
      { type: 'weekly', weekday: 2, hour: 18, minute: 30 },
      { type: 'weekly', weekday: 4, hour: 18, minute: 30 },
      { type: 'weekly', weekday: 6, hour: 18, minute: 30 },
    ]);
  });

  it('deduplicates and sorts weekdays so a row schedules the same ids each time', () => {
    expect(reminderTriggers({ hour: 6, minute: 15, repeatDays: [5, 2, 5] })).toEqual([
      { type: 'weekly', weekday: 2, hour: 6, minute: 15 },
      { type: 'weekly', weekday: 5, hour: 6, minute: 15 },
    ]);
  });

  it('drops out-of-range weekdays but keeps the valid ones', () => {
    expect(reminderTriggers({ hour: 9, minute: 0, repeatDays: [0, 3, 8, 1.5] })).toEqual([
      { type: 'weekly', weekday: 3, hour: 9, minute: 0 },
    ]);
  });

  /**
   * A row that asked for specific days must not silently become a daily reminder — firing seven
   * times a week is a worse answer than not firing. Only an empty selection means daily.
   */
  it('schedules nothing when every requested weekday is invalid', () => {
    expect(reminderTriggers({ hour: 9, minute: 0, repeatDays: [0, 8] })).toEqual([]);
  });

  it.each([
    ['hour above the day', { hour: 24, minute: 0, repeatDays: [] }],
    ['negative hour', { hour: -1, minute: 0, repeatDays: [] }],
    ['minute above the hour', { hour: 7, minute: 60, repeatDays: [] }],
    ['fractional minute', { hour: 7, minute: 30.5, repeatDays: [] }],
    ['unparsed time', { hour: Number.NaN, minute: Number.NaN, repeatDays: [3] }],
  ])('schedules nothing for %s', (_label, schedule) => {
    expect(reminderTriggers(schedule)).toEqual([]);
  });
});
