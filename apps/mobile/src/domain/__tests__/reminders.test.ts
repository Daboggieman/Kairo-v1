import {
  describeRepeat,
  formatTimeInput,
  formatTimeOfDay,
  parseTimeOfDay,
  reminderTriggers,
  weekdayInitials,
} from '../reminders';

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

describe('describeRepeat', () => {
  it('calls an empty selection every day, matching the daily trigger it produces', () => {
    expect(describeRepeat([])).toBe('Every day');
  });

  it('calls a full week every day rather than listing seven names', () => {
    expect(describeRepeat([1, 2, 3, 4, 5, 6, 7])).toBe('Every day');
  });

  it('names Monday through Friday as weekdays', () => {
    expect(describeRepeat([2, 3, 4, 5, 6])).toBe('Weekdays');
  });

  it('names Saturday and Sunday as weekends', () => {
    expect(describeRepeat([7, 1])).toBe('Weekends');
  });

  it('lists the selected days in week order, however they were tapped', () => {
    expect(describeRepeat([6, 2])).toBe('Mon, Fri');
  });

  it('ignores a duplicate day', () => {
    expect(describeRepeat([3, 3])).toBe('Tue');
  });

  /**
   * The case the two functions must agree on: a non-empty list with nothing valid in it schedules
   * nothing, so the row cannot claim a daily reminder it will never deliver.
   */
  it('says a row with no valid day never fires', () => {
    expect(describeRepeat([0, 8])).toBe('Never');
    expect(reminderTriggers({ hour: 7, minute: 0, repeatDays: [0, 8] })).toEqual([]);
  });

  it('describes only the valid days of a partly corrupt row', () => {
    expect(describeRepeat([0, 4, 9])).toBe('Wed');
  });
});

describe('weekdayInitials', () => {
  it('runs Sunday first, matching the expo-notifications numbering', () => {
    expect(weekdayInitials()).toEqual([
      { weekday: 1, initial: 'S' },
      { weekday: 2, initial: 'M' },
      { weekday: 3, initial: 'T' },
      { weekday: 4, initial: 'W' },
      { weekday: 5, initial: 'T' },
      { weekday: 6, initial: 'F' },
      { weekday: 7, initial: 'S' },
    ]);
  });

  /** Every initial the picker shows has to be a weekday `describeRepeat` can name. */
  it('only produces weekdays the rest of the module accepts', () => {
    for (const { weekday } of weekdayInitials()) {
      expect(describeRepeat([weekday])).not.toBe('Never');
    }
  });
});

describe('formatTimeOfDay', () => {
  it.each([
    [7, 0, '07:00'],
    [0, 0, '00:00'],
    [18, 30, '18:30'],
    [23, 59, '23:59'],
    [9, 5, '09:05'],
  ])('renders %i:%i as %s', (hour, minute, expected) => {
    expect(formatTimeOfDay(hour, minute)).toBe(expected);
  });
});

describe('formatTimeInput', () => {
  it.each([
    ['', ''],
    ['0', '0'],
    ['07', '07'],
    ['073', '07:3'],
    ['0730', '07:30'],
  ])('inserts the colon as digits arrive: %s becomes %s', (typed, expected) => {
    expect(formatTimeInput(typed)).toBe(expected);
  });

  /**
   * The colon is re-derived on every keystroke rather than stored, which is what makes backspace
   * work: the field hands back what it is showing, colon included.
   */
  it('is stable when the field feeds its own value back in', () => {
    expect(formatTimeInput('07:30')).toBe('07:30');
  });

  it('deletes a digit rather than the colon when the last character goes', () => {
    expect(formatTimeInput('07:3')).toBe('07:3');
    expect(formatTimeInput('07:')).toBe('07');
  });

  it('ignores anything that is not a digit, including a pasted time', () => {
    expect(formatTimeInput('7am')).toBe('7');
    expect(formatTimeInput('6.30 pm')).toBe('63:0');
  });

  it('stops at four digits so the field cannot outgrow a time', () => {
    expect(formatTimeInput('073045')).toBe('07:30');
  });
});

describe('parseTimeOfDay', () => {
  it('reads a formatted field', () => {
    expect(parseTimeOfDay('07:30')).toEqual({ hour: 7, minute: 30 });
  });

  it('reads bare digits, which is what the keypad produces', () => {
    expect(parseTimeOfDay('0000')).toEqual({ hour: 0, minute: 0 });
    expect(parseTimeOfDay('2359')).toEqual({ hour: 23, minute: 59 });
  });

  it.each([
    ['nothing typed', ''],
    ['half a time', '07:3'],
    ['an hour alone', '07'],
    ['an impossible hour', '25:00'],
    ['an impossible minute', '07:60'],
  ])('rejects %s', (_label, text) => {
    expect(parseTimeOfDay(text)).toBeNull();
  });

  /** What the field holds round-trips to what a row stores, and back. */
  it('round-trips through formatTimeOfDay', () => {
    const parsed = parseTimeOfDay(formatTimeInput('1830'));
    expect(parsed).toEqual({ hour: 18, minute: 30 });
    expect(formatTimeOfDay(parsed?.hour ?? -1, parsed?.minute ?? -1)).toBe('18:30');
  });
});
