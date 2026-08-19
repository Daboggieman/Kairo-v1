/**
 * Calendar-day arithmetic. Moved here with the functions themselves when the tasks module
 * needed them, so the streak logic and the weight trend measure days the same way.
 *
 * `jest.globalSetup.js` pins `TZ=UTC` for the run, which is what makes the fixtures below
 * mean one thing on every machine — see the note in `to_continue_with.md` about why that has
 * to be `globalSetup` and not a setup file.
 */

import {
  dayKeyFromDate,
  dayKeyFromNumber,
  dayNumber,
  dayOfWeek,
  isWeekday,
  relativeDayLabel,
  toDayKey,
  todayNumber,
  WEEKDAY_LABELS,
} from '../dates';

describe('toDayKey / dayNumber', () => {
  it('reduces a timestamp to its calendar day', () => {
    expect(toDayKey('2026-08-11T06:30:00.000Z')).toBe('2026-08-11');
    expect(toDayKey('2026-08-11T23:59:59.000Z')).toBe('2026-08-11');
  });

  it('numbers consecutive days consecutively', () => {
    expect(dayNumber('2026-08-11') - dayNumber('2026-08-10')).toBe(1);
  });

  it('round-trips through dayKeyFromNumber', () => {
    expect(dayKeyFromNumber(dayNumber('2026-08-11'))).toBe('2026-08-11');
  });

  it('spans a month boundary as one day', () => {
    expect(dayNumber('2026-09-01') - dayNumber('2026-08-31')).toBe(1);
  });

  it('spans a leap-year February as one day', () => {
    expect(dayNumber('2028-03-01') - dayNumber('2028-02-29')).toBe(1);
  });
});

describe('todayNumber', () => {
  /**
   * The contract that matters: "the day it is now" and "the day this timestamp belongs to"
   * must be the same computation. They diverge if `todayNumber` takes the tempting shortcut
   * `Math.floor(nowMs / MS_PER_DAY)`, which answers in UTC while `toDayKey` answers locally —
   * so a task ticked off at 00:30 in Berlin would count for the previous day, and a streak
   * would break for a habit the user actually kept.
   *
   * Pinned to UTC this assertion cannot *fail* for the shortcut implementation, which is
   * exactly why `todayNumber` routes through `dayKeyFromDate` instead: the guarantee is
   * structural (one code path) rather than something a UTC test run can prove. The sweep
   * still locks the contract against a future rewrite that reintroduces a second path.
   */
  it('agrees with toDayKey for instants across the whole day', () => {
    for (const time of ['00:00:00', '00:30:00', '06:30:00', '12:00:00', '18:45:00', '23:30:00']) {
      const iso = `2026-08-11T${time}.000Z`;
      expect(todayNumber(Date.parse(iso))).toBe(dayNumber(toDayKey(iso)));
    }
  });

  it('advances by one across midnight', () => {
    const before = todayNumber(Date.parse('2026-08-11T23:59:59.000Z'));
    const after = todayNumber(Date.parse('2026-08-12T00:00:01.000Z'));
    expect(after - before).toBe(1);
  });
});

describe('dayOfWeek', () => {
  it('places the epoch on a Thursday', () => {
    // 1970-01-01 was a Thursday; every other weekday here is derived from that offset, so
    // getting it wrong would silently shift every "weekdays only" task by a day.
    expect(dayOfWeek(0)).toBe(4);
    expect(WEEKDAY_LABELS[dayOfWeek(0)]).toBe('Thu');
  });

  it('matches Date.getDay() for a known week', () => {
    for (const key of [
      '2026-08-09',
      '2026-08-10',
      '2026-08-11',
      '2026-08-12',
      '2026-08-13',
      '2026-08-14',
      '2026-08-15',
    ]) {
      expect(dayOfWeek(dayNumber(key))).toBe(new Date(`${key}T12:00:00.000Z`).getDay());
    }
  });

  it('stays in range for dates before the epoch', () => {
    // A corrupt or hand-edited row can produce a negative index; a bare `%` would return a
    // negative weekday and index off the end of WEEKDAY_LABELS.
    expect(dayOfWeek(-1)).toBe(3);
    expect(dayOfWeek(-8)).toBe(3);
    expect(WEEKDAY_LABELS[dayOfWeek(-1)]).toBe('Wed');
  });
});

describe('isWeekday', () => {
  it('counts Monday to Friday and excludes the weekend', () => {
    expect(isWeekday(dayNumber('2026-08-10'))).toBe(true); // Monday
    expect(isWeekday(dayNumber('2026-08-14'))).toBe(true); // Friday
    expect(isWeekday(dayNumber('2026-08-15'))).toBe(false); // Saturday
    expect(isWeekday(dayNumber('2026-08-16'))).toBe(false); // Sunday
  });
});

describe('dayKeyFromDate', () => {
  it('zero-pads single-digit months and days', () => {
    expect(dayKeyFromDate(new Date('2026-01-05T12:00:00.000Z'))).toBe('2026-01-05');
  });
});

describe('relativeDayLabel', () => {
  const today = dayNumber('2026-08-19');

  it('names today and yesterday', () => {
    expect(relativeDayLabel(today, today)).toBe('Today');
    expect(relativeDayLabel(today - 1, today)).toBe('Yesterday');
  });

  it('returns null for any other day, so the caller spells out the date', () => {
    expect(relativeDayLabel(today - 2, today)).toBeNull();
    expect(relativeDayLabel(today + 1, today)).toBeNull();
  });

  it('crosses a month boundary without special-casing it', () => {
    const first = dayNumber('2026-09-01');
    expect(relativeDayLabel(dayNumber('2026-08-31'), first)).toBe('Yesterday');
  });
});
