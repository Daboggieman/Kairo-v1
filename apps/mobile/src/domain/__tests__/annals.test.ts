import { describeVerdict, targetForDay, weekDays, weekLedger, weekNumber, weekRange } from '../annals';
import { dayNumber } from '../dates';

import type { MacroTarget, NutritionEntryWithFood, Task } from '@/db/types';

describe('annals', () => {
  it('builds a seven-day Monday week', () => {
    expect(weekRange(dayNumber('2026-08-21'), 'monday')).toEqual({ start: dayNumber('2026-08-17'), end: dayNumber('2026-08-23'), startKey: '2026-08-17', endKey: '2026-08-23' });
  });
  it('derives the ordinal from the selected week start', () => {
    expect(weekNumber(dayNumber('2026-01-01'), 'sunday')).toBe(1);
  });
  it('generates verdict wording', () => {
    expect(describeVerdict({ kept: 6, due: 7, macroDaysOver: 2 })).toBe('An uneven week. 1 rite slipped, the decree broke on 2 days.');
  });
  it('lists the seven days of a range in order', () => {
    const range = weekRange(dayNumber('2026-08-19'), 'monday');
    expect(weekDays(range)).toEqual([0, 1, 2, 3, 4, 5, 6].map((offset) => dayNumber('2026-08-17') + offset));
  });
});

/** A daily rite created before any week under test, so its anchor never gates a schedule. */
function dailyTask(id: string, overrides: Partial<Task> = {}): Task {
  return { id, userId: 'u1', title: id, recurrenceRule: 'daily', createdAt: '2026-01-01T00:00:00.000Z', archived: false, ...overrides };
}

function entry(loggedDate: string, calories: number, id = `${loggedDate}-${calories}`): NutritionEntryWithFood {
  return {
    id, userId: 'u1', foodItemId: 'f1', loggedAt: `${loggedDate}T12:00:00.000Z`, loggedDate,
    quantity: 1, mealType: 'lunch',
    food: { id: 'f1', userId: 'u1', name: 'Thing', caloriesPerServing: calories, proteinG: 0, carbsG: 0, fatG: 0, servingLabel: '1', createdAt: '2026-01-01T00:00:00.000Z' },
  };
}

function target(effectiveDate: string, calories: number, id = effectiveDate): MacroTarget {
  return { id, userId: 'u1', calories, proteinG: 0, carbsG: 0, fatG: 0, effectiveDate, createdAt: `${effectiveDate}T00:00:00.000Z` };
}

describe('targetForDay', () => {
  const targets = [target('2026-08-01', 2000), target('2026-08-19', 1800)];

  it('takes the latest target effective at or before the day', () => {
    expect(targetForDay(targets, dayNumber('2026-08-18'))?.calories).toBe(2000);
    expect(targetForDay(targets, dayNumber('2026-08-19'))?.calories).toBe(1800);
    expect(targetForDay(targets, dayNumber('2026-08-22'))?.calories).toBe(1800);
  });

  it('returns null before the first target exists', () => {
    expect(targetForDay(targets, dayNumber('2026-07-31'))).toBeNull();
  });
});

describe('weekLedger', () => {
  const range = weekRange(dayNumber('2026-08-19'), 'monday'); // Mon 17th – Sun 23rd
  const base = { tasks: [] as Task[], completions: new Map<string, string[]>(), entries: [] as NutritionEntryWithFood[], targets: [] as MacroTarget[], range };

  it('counts a fully kept past week as held, and its verdict says so', () => {
    const ledger = weekLedger({
      ...base,
      tasks: [dailyTask('t1')],
      completions: new Map([['t1', ['2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21', '2026-08-22', '2026-08-23']]]),
      today: dayNumber('2026-08-30'),
    });
    expect(ledger).toMatchObject({ kept: 7, due: 7, macroDaysOver: 0 });
    expect(describeVerdict(ledger)).toBe('A held week. All 7 rites were kept, and the decree held.');
  });

  it('does not owe days later than today', () => {
    // Today is Wednesday the 19th and nothing has been ticked. Mon and Tue are owed and missed;
    // Wednesday is pending, and Thu–Sun have not happened.
    const ledger = weekLedger({ ...base, tasks: [dailyTask('t1')], today: dayNumber('2026-08-19') });
    expect(ledger).toMatchObject({ kept: 0, due: 2 });
    expect(ledger.days.filter((day) => day.future)).toHaveLength(4);
  });

  it('grants today the same grace the streak walk does', () => {
    const ledger = weekLedger({ ...base, tasks: [dailyTask('t1')], today: dayNumber('2026-08-17') });
    expect(ledger).toMatchObject({ kept: 0, due: 0 });
    expect(describeVerdict(ledger)).toBe('A quiet week. Nothing was owed.');
  });

  it('counts a tick on today as both kept and due', () => {
    const ledger = weekLedger({
      ...base,
      tasks: [dailyTask('t1')],
      completions: new Map([['t1', ['2026-08-17']]]),
      today: dayNumber('2026-08-17'),
    });
    expect(ledger).toMatchObject({ kept: 1, due: 1 });
  });

  it('excludes archived rites', () => {
    const ledger = weekLedger({ ...base, tasks: [dailyTask('t1', { archived: true })], today: dayNumber('2026-08-30') });
    expect(ledger).toMatchObject({ kept: 0, due: 0 });
  });

  it('never lets a bonus tick push kept above due', () => {
    // A Monday-only rite ticked on the Tuesday as well. `historyState` shows that as done; the
    // tally must not, or `kept === due` fires on a week that missed its actual Monday.
    const ledger = weekLedger({
      ...base,
      tasks: [dailyTask('t1', { recurrenceRule: 'weekly:1' })],
      completions: new Map([['t1', ['2026-08-18']]]),
      today: dayNumber('2026-08-30'),
    });
    expect(ledger.kept).toBeLessThanOrEqual(ledger.due);
    expect(ledger).toMatchObject({ kept: 0, due: 1 });
  });

  it('counts a day over its target as the decree breaking', () => {
    const ledger = weekLedger({
      ...base,
      entries: [entry('2026-08-17', 2500), entry('2026-08-18', 1500)],
      targets: [target('2026-08-01', 2000)],
      today: dayNumber('2026-08-30'),
    });
    expect(ledger.macroDaysOver).toBe(1);
    expect(ledger.days[0]).toMatchObject({ decreeBroke: true, decreeSilent: false });
    expect(ledger.days[1]).toMatchObject({ decreeBroke: false, decreeSilent: false });
  });

  it('uses the target in force, not only the ones set that week', () => {
    // The only target predates the week entirely. Reading the range alone would find none and call
    // every day silent — the bug this guards.
    const ledger = weekLedger({
      ...base,
      entries: [entry('2026-08-17', 2500)],
      targets: [target('2026-05-01', 2000)],
      today: dayNumber('2026-08-30'),
    });
    expect(ledger.macroDaysOver).toBe(1);
  });

  it('follows a target that changes mid-week', () => {
    // 1900 kcal is under the 2000 in force on Monday and over the 1800 that starts Wednesday.
    const ledger = weekLedger({
      ...base,
      entries: [entry('2026-08-17', 1900), entry('2026-08-19', 1900)],
      targets: [target('2026-08-01', 2000), target('2026-08-19', 1800)],
      today: dayNumber('2026-08-30'),
    });
    expect(ledger.macroDaysOver).toBe(1);
    expect(ledger.days[0].decreeBroke).toBe(false);
    expect(ledger.days[2].decreeBroke).toBe(true);
  });

  it('is silent on a day with no target and on a day with nothing logged', () => {
    const ledger = weekLedger({ ...base, entries: [entry('2026-08-17', 5000)], today: dayNumber('2026-08-30') });
    expect(ledger.macroDaysOver).toBe(0);
    expect(ledger.days[0]).toMatchObject({ decreeSilent: true, decreeBroke: false });
    expect(ledger.days[1]).toMatchObject({ decreeSilent: true, decreeBroke: false });
  });

  it('does not judge the decree on a day later than today', () => {
    const ledger = weekLedger({
      ...base,
      entries: [entry('2026-08-23', 9000)],
      targets: [target('2026-08-01', 2000)],
      today: dayNumber('2026-08-19'),
    });
    expect(ledger.macroDaysOver).toBe(0);
    expect(ledger.days[6]).toMatchObject({ future: true, decreeSilent: true });
  });

  it('keeps the totals equal to the sum of its own rows', () => {
    const ledger = weekLedger({
      ...base,
      tasks: [dailyTask('t1'), dailyTask('t2', { recurrenceRule: 'weekly:1,3' })],
      completions: new Map([['t1', ['2026-08-17', '2026-08-19']], ['t2', ['2026-08-17']]]),
      entries: [entry('2026-08-18', 2500), entry('2026-08-20', 2500)],
      targets: [target('2026-08-01', 2000)],
      today: dayNumber('2026-08-30'),
    });
    expect(ledger.kept).toBe(ledger.days.reduce((total, day) => total + day.kept, 0));
    expect(ledger.due).toBe(ledger.days.reduce((total, day) => total + day.due, 0));
    expect(ledger.macroDaysOver).toBe(ledger.days.filter((day) => day.decreeBroke).length);
  });
});
