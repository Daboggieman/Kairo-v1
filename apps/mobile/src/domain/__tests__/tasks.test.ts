/**
 * Task scheduling and streak tests.
 *
 * `04-feature-specs.md` asks for this specifically: *"streak increments on completion, breaks
 * if a scheduled day is missed (respecting each task's own recurrence rule — a 'weekdays only'
 * task shouldn't break over a weekend). This logic is worth unit-testing thoroughly; it's the
 * kind of thing that's subtly annoying to get wrong."*
 *
 * So the weight of these tests sits on the three behaviours that are easy to get wrong and
 * invisible when they are: the weekend that must not break a weekday habit, today's grace
 * period, and the anchor that stops a walk running off into the past.
 *
 * Reference week (the timezone is pinned to UTC in `jest.globalSetup.js`):
 *   Sun 2026-08-09 · Mon 08-10 · Tue 08-11 · Wed 08-12 · Thu 08-13 · Fri 08-14 · Sat 08-15
 */

import type { Task } from '@/db/types';

import { dayNumber } from '../dates';
import {
  anchorDayOf,
  completionDaySet,
  completionRate,
  currentStreak,
  describeRecurrence,
  formatProgress,
  formatRecurrence,
  formatStreak,
  historyGrid,
  isScheduledOn,
  longestStreak,
  nextDueDay,
  parseRecurrence,
  splitByDueToday,
  summariseTask,
  type HistoryState,
  type Recurrence,
} from '../tasks';

/** Morning of a day, so no fixture sits near a boundary by accident. */
function at(date: string): number {
  return Date.parse(`${date}T09:00:00.000Z`);
}

const day = dayNumber;

let idCounter = 0;

function task(rule: string, createdDate = '2026-01-01'): Task {
  idCounter += 1;
  return {
    id: `task-${idCounter}`,
    userId: 'local-user',
    title: `Task ${idCounter}`,
    recurrenceRule: rule,
    createdAt: `${createdDate}T08:00:00.000Z`,
    archived: false,
  };
}

/** The two walks take a day-index set; fixtures are more readable as dates. */
function days(...dates: string[]): Set<number> {
  return completionDaySet(dates);
}

const DAILY: Recurrence = { kind: 'daily' };
const WEEKDAYS: Recurrence = { kind: 'weekdays' };
const FAR_PAST = day('2020-01-01');

describe('parseRecurrence', () => {
  it('reads the three presets', () => {
    expect(parseRecurrence('daily')).toEqual({ kind: 'daily' });
    expect(parseRecurrence('weekdays')).toEqual({ kind: 'weekdays' });
    expect(parseRecurrence('weekends')).toEqual({ kind: 'weekends' });
  });

  it('reads a weekly day list', () => {
    expect(parseRecurrence('weekly:1,3,5')).toEqual({ kind: 'weekly', days: [1, 3, 5] });
  });

  it('sorts and de-duplicates the day list', () => {
    // Otherwise `describeRecurrence` prints "Fri, Mon" and the count of scheduled days in
    // `completionRate` double-counts a repeated day.
    expect(parseRecurrence('weekly:5,1,1')).toEqual({ kind: 'weekly', days: [1, 5] });
  });

  it('drops day numbers outside 0-6', () => {
    expect(parseRecurrence('weekly:1,7,-2,9')).toEqual({ kind: 'weekly', days: [1] });
  });

  it('reads an interval', () => {
    expect(parseRecurrence('interval:3')).toEqual({ kind: 'interval', days: 3 });
  });

  it('tolerates surrounding whitespace and case', () => {
    expect(parseRecurrence('  WEEKDAYS  ')).toEqual({ kind: 'weekdays' });
  });

  describe('corrupt rules fall back to daily', () => {
    // Deliberately `daily` rather than "never": a task that shows up every day is obviously
    // wrong and one tap from fixed, where a never-scheduled task vanishes and reads as data
    // loss. Same principle as `getGoalWeightKg` treating an unparseable value as unset.
    it.each([
      ['an unknown keyword', 'monthly'],
      ['an empty string', ''],
      ['a weekly rule with no days', 'weekly:'],
      ['a weekly rule of only invalid days', 'weekly:9,12'],
      ['a zero interval', 'interval:0'],
      ['a negative interval', 'interval:-3'],
      ['a non-numeric interval', 'interval:abc'],
      ['a fragment', 'weekly'],
    ])('%s', (_label, rule) => {
      expect(parseRecurrence(rule)).toEqual({ kind: 'daily' });
    });
  });

  it('round-trips through formatRecurrence', () => {
    for (const rule of ['daily', 'weekdays', 'weekends', 'weekly:0,2,4', 'interval:5']) {
      expect(formatRecurrence(parseRecurrence(rule))).toBe(rule);
    }
  });

  it('normalises an unsorted rule on the way back out', () => {
    expect(formatRecurrence(parseRecurrence('weekly:4,2,0'))).toBe('weekly:0,2,4');
  });
});

describe('describeRecurrence', () => {
  it('labels each shape for a list row', () => {
    expect(describeRecurrence({ kind: 'daily' })).toBe('Every day');
    expect(describeRecurrence({ kind: 'weekdays' })).toBe('Weekdays');
    expect(describeRecurrence({ kind: 'weekends' })).toBe('Weekends');
    expect(describeRecurrence({ kind: 'weekly', days: [1, 3, 5] })).toBe('Mon, Wed, Fri');
    expect(describeRecurrence({ kind: 'interval', days: 3 })).toBe('Every 3 days');
  });

  it('calls a 1-day interval what it is', () => {
    expect(describeRecurrence({ kind: 'interval', days: 1 })).toBe('Every day');
  });
});

describe('isScheduledOn', () => {
  it('schedules a daily task every day', () => {
    for (const date of ['2026-08-09', '2026-08-10', '2026-08-15']) {
      expect(isScheduledOn(DAILY, day(date), FAR_PAST)).toBe(true);
    }
  });

  it('skips the weekend for a weekdays task', () => {
    expect(isScheduledOn(WEEKDAYS, day('2026-08-14'), FAR_PAST)).toBe(true); // Fri
    expect(isScheduledOn(WEEKDAYS, day('2026-08-15'), FAR_PAST)).toBe(false); // Sat
    expect(isScheduledOn(WEEKDAYS, day('2026-08-16'), FAR_PAST)).toBe(false); // Sun
    expect(isScheduledOn(WEEKDAYS, day('2026-08-17'), FAR_PAST)).toBe(true); // Mon
  });

  it('is the exact inverse for weekends', () => {
    for (const date of ['2026-08-09', '2026-08-10', '2026-08-14', '2026-08-15']) {
      expect(isScheduledOn({ kind: 'weekends' }, day(date), FAR_PAST)).toBe(
        !isScheduledOn(WEEKDAYS, day(date), FAR_PAST),
      );
    }
  });

  it('schedules a weekly task on its listed days', () => {
    const monWedFri: Recurrence = { kind: 'weekly', days: [1, 3, 5] };
    expect(isScheduledOn(monWedFri, day('2026-08-10'), FAR_PAST)).toBe(true); // Mon
    expect(isScheduledOn(monWedFri, day('2026-08-11'), FAR_PAST)).toBe(false); // Tue
    expect(isScheduledOn(monWedFri, day('2026-08-12'), FAR_PAST)).toBe(true); // Wed
  });

  it('counts an interval from the creation day, not the calendar', () => {
    const anchor = day('2026-08-10');
    const every3: Recurrence = { kind: 'interval', days: 3 };
    expect(isScheduledOn(every3, day('2026-08-10'), anchor)).toBe(true);
    expect(isScheduledOn(every3, day('2026-08-11'), anchor)).toBe(false);
    expect(isScheduledOn(every3, day('2026-08-12'), anchor)).toBe(false);
    expect(isScheduledOn(every3, day('2026-08-13'), anchor)).toBe(true);
  });

  it('never schedules a day before the task existed', () => {
    // Without this a new task's streak walk runs back to 1970 over "missed" days.
    const anchor = day('2026-08-10');
    expect(isScheduledOn(DAILY, day('2026-08-09'), anchor)).toBe(false);
    expect(isScheduledOn(DAILY, day('2026-08-10'), anchor)).toBe(true);
  });
});

describe('anchorDayOf', () => {
  it('reduces the creation timestamp to its day', () => {
    expect(anchorDayOf({ createdAt: '2026-08-10T23:30:00.000Z' })).toBe(day('2026-08-10'));
  });
});

describe('currentStreak', () => {
  it('counts consecutive completed days ending today', () => {
    const completed = days('2026-08-09', '2026-08-10', '2026-08-11');
    expect(currentStreak(DAILY, FAR_PAST, completed, day('2026-08-11'))).toBe(3);
  });

  it('keeps the streak alive while today is still unfinished', () => {
    // Today is a grace day: it is not missed until it is over. Counting it as a break would
    // show every streak collapsing each morning and rebuilding each evening.
    const completed = days('2026-08-09', '2026-08-10');
    expect(currentStreak(DAILY, FAR_PAST, completed, day('2026-08-11'))).toBe(2);
  });

  it('breaks on a day missed before today', () => {
    const completed = days('2026-08-08', '2026-08-09', '2026-08-11');
    // 08-10 was missed, so only today counts.
    expect(currentStreak(DAILY, FAR_PAST, completed, day('2026-08-11'))).toBe(1);
  });

  it('is zero when yesterday was missed and today is not yet done', () => {
    const completed = days('2026-08-08');
    expect(currentStreak(DAILY, FAR_PAST, completed, day('2026-08-11'))).toBe(0);
  });

  it('is zero with no completions at all', () => {
    expect(currentStreak(DAILY, FAR_PAST, days(), day('2026-08-11'))).toBe(0);
  });

  /** The case the feature spec names outright. */
  it('does not break a weekdays task over the weekend', () => {
    const completed = days('2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14');
    // Monday the 17th: the weekend in between was never scheduled, so the Friday streak stands.
    expect(currentStreak(WEEKDAYS, FAR_PAST, completed, day('2026-08-17'))).toBe(5);
  });

  it('holds a weekdays streak through the weekend itself', () => {
    const completed = days('2026-08-13', '2026-08-14');
    // Saturday: nothing is due, so the streak is whatever Friday left it at.
    expect(currentStreak(WEEKDAYS, FAR_PAST, completed, day('2026-08-15'))).toBe(2);
  });

  it('breaks a weekdays task on a missed weekday', () => {
    const completed = days('2026-08-10', '2026-08-11', '2026-08-13', '2026-08-14');
    // Wednesday the 12th was missed; only Thu+Fri survive.
    expect(currentStreak(WEEKDAYS, FAR_PAST, completed, day('2026-08-17'))).toBe(2);
  });

  it('does not extend a weekdays streak with a weekend completion', () => {
    // Bonus work is welcome but it is not the habit. Ticking off the Saturday has to leave the
    // Thu+Fri streak exactly where it was — hence both halves of this assertion.
    const withBonus = days('2026-08-13', '2026-08-14', '2026-08-15');
    const withoutBonus = days('2026-08-13', '2026-08-14');
    expect(currentStreak(WEEKDAYS, FAR_PAST, withBonus, day('2026-08-17'))).toBe(2);
    expect(currentStreak(WEEKDAYS, FAR_PAST, withoutBonus, day('2026-08-17'))).toBe(2);
  });

  it('cannot bridge a missed weekday with weekend completions', () => {
    const completed = days('2026-08-13', '2026-08-15', '2026-08-16');
    // Friday the 14th was missed, so the weekend either side of it bridges nothing.
    expect(currentStreak(WEEKDAYS, FAR_PAST, completed, day('2026-08-17'))).toBe(0);
  });

  it('counts an interval task by its own scheduled days', () => {
    const anchor = day('2026-08-05');
    const every3: Recurrence = { kind: 'interval', days: 3 };
    const completed = days('2026-08-05', '2026-08-08', '2026-08-11');
    expect(currentStreak(every3, anchor, completed, day('2026-08-11'))).toBe(3);
  });

  it('breaks an interval task on a skipped interval day', () => {
    const anchor = day('2026-08-05');
    const every3: Recurrence = { kind: 'interval', days: 3 };
    const completed = days('2026-08-05', '2026-08-11');
    // 08-08 was due and missed.
    expect(currentStreak(every3, anchor, completed, day('2026-08-11'))).toBe(1);
  });

  it('stops at the creation day rather than walking into the past', () => {
    const anchor = day('2026-08-10');
    const completed = days('2026-08-10', '2026-08-11');
    expect(currentStreak(DAILY, anchor, completed, day('2026-08-11'))).toBe(2);
  });

  it('is zero on the first day of a task nobody has ticked yet', () => {
    const anchor = day('2026-08-11');
    expect(currentStreak(DAILY, anchor, days(), day('2026-08-11'))).toBe(0);
  });
});

describe('longestStreak', () => {
  it('remembers a longer past run than the current one', () => {
    const completed = days(
      '2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04', // 4-day run
      '2026-08-10', '2026-08-11', // current 2-day run
    );
    expect(longestStreak(DAILY, FAR_PAST, completed, day('2026-08-11'))).toBe(4);
    expect(currentStreak(DAILY, FAR_PAST, completed, day('2026-08-11'))).toBe(2);
  });

  it('equals the current streak when the current run is the best', () => {
    const completed = days('2026-08-09', '2026-08-10', '2026-08-11');
    expect(longestStreak(DAILY, FAR_PAST, completed, day('2026-08-11'))).toBe(3);
  });

  it('is zero with no completions', () => {
    expect(longestStreak(DAILY, FAR_PAST, days(), day('2026-08-11'))).toBe(0);
  });

  it('treats a weekdays run across a weekend as unbroken', () => {
    const completed = days(
      '2026-08-13', '2026-08-14', // Thu, Fri
      '2026-08-17', '2026-08-18', // Mon, Tue — the weekend was never scheduled
    );
    expect(longestStreak(WEEKDAYS, FAR_PAST, completed, day('2026-08-18'))).toBe(4);
  });

  it('ignores completions after today', () => {
    // A device with a fast clock, or a row synced from another timezone, should not be able
    // to report a streak the user has not lived through yet.
    const completed = days('2026-08-11', '2026-08-12');
    expect(longestStreak(DAILY, FAR_PAST, completed, day('2026-08-11'))).toBe(1);
  });

  it('ignores a completion dated before the task existed', () => {
    // An edited or re-synced row can land before createdAt. Both walks answer this the same
    // way — the task was not scheduled then, so the run does not count — rather than
    // `longestStreak` crediting history `currentStreak` refuses to.
    const anchor = day('2026-08-10');
    const completed = days('2026-08-06', '2026-08-07', '2026-08-08');
    expect(longestStreak(DAILY, anchor, completed, day('2026-08-11'))).toBe(0);
    expect(currentStreak(DAILY, anchor, completed, day('2026-08-11'))).toBe(0);
  });
});

describe('nextDueDay', () => {
  it('returns the same day when it is already due', () => {
    expect(nextDueDay(DAILY, FAR_PAST, day('2026-08-11'))).toBe(day('2026-08-11'));
  });

  it('skips the weekend to Monday', () => {
    expect(nextDueDay(WEEKDAYS, FAR_PAST, day('2026-08-15'))).toBe(day('2026-08-17'));
  });

  it('finds the next interval day', () => {
    const anchor = day('2026-08-10');
    expect(nextDueDay({ kind: 'interval', days: 3 }, anchor, day('2026-08-11'))).toBe(
      day('2026-08-13'),
    );
  });

  it('returns the creation day when asked about a task that does not exist yet', () => {
    const anchor = day('2026-08-20');
    expect(nextDueDay(DAILY, anchor, day('2026-08-11'))).toBe(anchor);
  });
});

describe('completionRate', () => {
  it('counts scheduled days in the window, not calendar days', () => {
    // A weekends task over two weeks has 4 scheduled days, so "2 of 4" is the honest number —
    // "2 of 14" would make a perfectly kept habit look abandoned.
    const completed = days('2026-08-08', '2026-08-09');
    expect(completionRate({ kind: 'weekends' }, FAR_PAST, completed, day('2026-08-16'), 14)).toEqual(
      { scheduled: 4, completed: 2 },
    );
  });

  it('counts every day for a daily task', () => {
    const completed = days('2026-08-09', '2026-08-10', '2026-08-11');
    expect(completionRate(DAILY, FAR_PAST, completed, day('2026-08-11'), 7)).toEqual({
      scheduled: 7,
      completed: 3,
    });
  });

  it('clamps the window at the creation day', () => {
    // A task created yesterday is 1 of 2, not 1 of 30.
    const anchor = day('2026-08-10');
    const completed = days('2026-08-10');
    expect(completionRate(DAILY, anchor, completed, day('2026-08-11'), 30)).toEqual({
      scheduled: 2,
      completed: 1,
    });
  });

  it('ignores completions outside the window', () => {
    const completed = days('2026-07-01', '2026-08-11');
    expect(completionRate(DAILY, FAR_PAST, completed, day('2026-08-11'), 7)).toEqual({
      scheduled: 7,
      completed: 1,
    });
  });
});

describe('summariseTask', () => {
  it('reports a live streak with today still open', () => {
    const summary = summariseTask(
      task('daily', '2026-08-01'),
      ['2026-08-09', '2026-08-10'],
      at('2026-08-11'),
    );

    expect(summary).toEqual({
      current: 2,
      longest: 2,
      dueToday: true,
      doneToday: false,
      atRisk: true,
      lastCompletedDate: '2026-08-10',
      totalCompletions: 2,
    });
  });

  it('clears atRisk once today is done', () => {
    const summary = summariseTask(
      task('daily', '2026-08-01'),
      ['2026-08-10', '2026-08-11'],
      at('2026-08-11'),
    );

    expect(summary.doneToday).toBe(true);
    expect(summary.atRisk).toBe(false);
    expect(summary.current).toBe(2);
  });

  it('is not at risk when there is no streak to lose', () => {
    // `atRisk` is the "don't break it" nudge, so it needs something at stake — otherwise every
    // unticked task on a fresh install would shout.
    const summary = summariseTask(task('daily', '2026-08-11'), [], at('2026-08-11'));

    expect(summary.dueToday).toBe(true);
    expect(summary.atRisk).toBe(false);
    expect(summary.current).toBe(0);
  });

  it('is not due on a day its rule excludes', () => {
    const summary = summariseTask(
      task('weekdays', '2026-08-01'),
      ['2026-08-14'],
      at('2026-08-15'), // Saturday
    );

    expect(summary.dueToday).toBe(false);
    expect(summary.atRisk).toBe(false);
    expect(summary.current).toBe(1);
  });

  it('records a bonus completion without marking the task due', () => {
    const summary = summariseTask(
      task('weekdays', '2026-08-01'),
      ['2026-08-15'],
      at('2026-08-15'), // Saturday, ticked anyway
    );

    expect(summary.dueToday).toBe(false);
    expect(summary.doneToday).toBe(true);
    expect(summary.totalCompletions).toBe(1);
  });

  it('takes the latest completion regardless of input order', () => {
    const summary = summariseTask(
      task('daily', '2026-08-01'),
      ['2026-08-10', '2026-08-04', '2026-08-08'],
      at('2026-08-11'),
    );

    expect(summary.lastCompletedDate).toBe('2026-08-10');
  });

  it('survives a corrupt recurrence rule', () => {
    const summary = summariseTask(task('monthly-ish', '2026-08-01'), ['2026-08-11'], at('2026-08-11'));
    expect(summary.dueToday).toBe(true);
    expect(summary.current).toBe(1);
  });
});

describe('splitByDueToday', () => {
  it('separates what is due today from what is not', () => {
    const daily = task('daily', '2026-08-01');
    const weekend = task('weekends', '2026-08-01');

    const { due, notToday } = splitByDueToday(
      [daily, weekend],
      new Map(),
      at('2026-08-11'), // Tuesday
    );

    expect(due.map((entry) => entry.task.id)).toEqual([daily.id]);
    expect(notToday.map((entry) => entry.task.id)).toEqual([weekend.id]);
  });

  it('sorts unfinished tasks above finished ones', () => {
    // The list should shrink towards the top as the day goes on.
    const done = task('daily', '2026-08-01');
    const pending = task('daily', '2026-08-02');

    const { due } = splitByDueToday(
      [done, pending],
      new Map([[done.id, ['2026-08-11']]]),
      at('2026-08-11'),
    );

    expect(due.map((entry) => entry.task.id)).toEqual([pending.id, done.id]);
  });

  it('leads with the longest streak within a group', () => {
    const short = task('daily', '2026-08-01');
    const long = task('daily', '2026-08-01');

    const { due } = splitByDueToday(
      [short, long],
      new Map([
        [short.id, ['2026-08-10']],
        [long.id, ['2026-08-08', '2026-08-09', '2026-08-10']],
      ]),
      at('2026-08-11'),
    );

    expect(due.map((entry) => entry.task.id)).toEqual([long.id, short.id]);
  });

  it('breaks ties by creation order so the list does not shuffle', () => {
    const first = task('daily', '2026-08-01');
    const second = task('daily', '2026-08-02');

    const { due } = splitByDueToday([second, first], new Map(), at('2026-08-11'));

    expect(due.map((entry) => entry.task.id)).toEqual([first.id, second.id]);
  });

  it('resolves each recurrence once, for the row label', () => {
    const { due } = splitByDueToday([task('weekly:2', '2026-08-01')], new Map(), at('2026-08-11'));
    expect(due[0].recurrence).toEqual({ kind: 'weekly', days: [2] });
  });
});

describe('historyGrid', () => {
  /** Compact render of a week row, so a fixture reads like the grid it describes. */
  const GLYPH: Record<HistoryState, string> = {
    done: '#',
    missed: 'x',
    pending: '?',
    unscheduled: '.',
    future: ' ',
  };

  function render(grid: ReturnType<typeof historyGrid>): string[] {
    return grid.map((week) => week.map((cell) => GLYPH[cell.state]).join(''));
  }

  it('returns one Sunday-first row per week, oldest first', () => {
    const grid = historyGrid(DAILY, FAR_PAST, days(), day('2026-08-11'), 3);

    expect(grid).toHaveLength(3);
    for (const week of grid) expect(week).toHaveLength(7);
    // Rows start on a Sunday and run consecutively.
    expect(grid[0][0].day).toBe(day('2026-07-26'));
    expect(grid[2][0].day).toBe(day('2026-08-09'));
    expect(grid[2][6].day).toBe(day('2026-08-15'));
  });

  it('marks today pending, the rest of its week future, and past misses', () => {
    // Tuesday 08-11, nothing done: Sun+Mon missed, today still open, Wed-Sat not here yet.
    const grid = historyGrid(DAILY, FAR_PAST, days(), day('2026-08-11'), 1);
    expect(render(grid)).toEqual(['xx?    ']);
  });

  it('shows the shape of a weekdays rule as two blank columns', () => {
    // The reason the grid is week-aligned at all: the rule is legible without reading it.
    const completed = days('2026-08-10');
    const grid = historyGrid(WEEKDAYS, FAR_PAST, completed, day('2026-08-11'), 1);
    expect(render(grid)).toEqual(['.#?    ']);
  });

  it('shows a bonus completion on an unscheduled day', () => {
    // The streak walk ignores it; the grid should not pretend it never happened.
    const completed = days('2026-08-09');
    const grid = historyGrid(WEEKDAYS, FAR_PAST, completed, day('2026-08-11'), 1);
    expect(render(grid)).toEqual(['#x?    ']);
  });

  it('leaves the days before a task existed blank rather than missed', () => {
    // A task created on Tuesday has not failed at Sunday and Monday.
    const grid = historyGrid(DAILY, day('2026-08-11'), days(), day('2026-08-11'), 1);
    expect(render(grid)).toEqual(['..?    ']);
  });

  it('marks a completed today done rather than pending', () => {
    const grid = historyGrid(DAILY, FAR_PAST, days('2026-08-11'), day('2026-08-11'), 1);
    expect(render(grid)).toEqual(['xx#    ']);
  });

  it('has no future cells in a week that has fully passed', () => {
    const completed = days('2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07');
    const grid = historyGrid(WEEKDAYS, FAR_PAST, completed, day('2026-08-11'), 2);
    expect(render(grid)[0]).toBe('.#####.');
  });
});

describe('formatProgress / formatStreak', () => {
  it('counts the day down', () => {
    expect(formatProgress(0, 4)).toBe('0 of 4 done');
    expect(formatProgress(4, 4)).toBe('4 of 4 done');
  });

  it('says so when nothing is scheduled', () => {
    expect(formatProgress(0, 0)).toBe('Nothing scheduled');
  });

  it('hides a zero streak rather than printing "0d"', () => {
    expect(formatStreak(0)).toBe('');
    expect(formatStreak(1)).toBe('1d');
  });
});
