/**
 * Body-weight domain tests.
 *
 * The rolling average is where this module earns its keep, so most of these are about it —
 * specifically about the two decisions that separate a real weight trend from a `reduce`:
 * that the window is measured in days rather than samples, and that multiple weigh-ins on
 * one day count once.
 *
 * The timezone is pinned to UTC in `jest.globalSetup.js`; `dailyWeights` buckets by *local*
 * calendar day, so these fixtures would otherwise mean different things on different machines.
 */

import type { BodyWeightEntry } from '@/db/types';

import {
  dailyWeights,
  describeVow,
  displayUnit,
  formatDelta,
  formatVowGap,
  formatWeight,
  goalDelta,
  movingAverage,
  summarise,
  toDisplayWeight,
  weeklyRateKg,
  weighings,
  withinDays,
} from '../weight';

let idCounter = 0;

/** An entry at midday, so a fixture is never near a date boundary by accident. */
function entry(
  date: string,
  weight: number,
  overrides: Partial<BodyWeightEntry> = {},
): BodyWeightEntry {
  idCounter += 1;
  return {
    id: `entry-${idCounter}`,
    userId: 'local-user',
    recordedAt: `${date}T12:00:00.000Z`,
    weight,
    weightUnit: 'kg',
    note: null,
    ...overrides,
  };
}

/** Epoch-ms for a date at midday, matching the fixtures. */
function at(date: string): number {
  return Date.parse(`${date}T12:00:00.000Z`);
}

describe('dailyWeights', () => {
  it('averages several weigh-ins on the same day into one point', () => {
    // The core "trend, not noise" behaviour: stepping on the scale twice on a Tuesday is
    // not two days of data, and plotting both would spike the raw line for no bodily reason.
    const points = dailyWeights([
      entry('2026-08-10', 80),
      entry('2026-08-10', 82),
    ]);

    expect(points).toHaveLength(1);
    expect(points[0].weightKg).toBe(81);
    expect(points[0].entryCount).toBe(2);
  });

  it('sorts oldest first regardless of input order', () => {
    const points = dailyWeights([
      entry('2026-08-12', 79),
      entry('2026-08-10', 81),
      entry('2026-08-11', 80),
    ]);

    expect(points.map((p) => p.dayKey)).toEqual(['2026-08-10', '2026-08-11', '2026-08-12']);
  });

  it('normalises pounds to kg so a mixed-unit history is one continuous line', () => {
    const points = dailyWeights([entry('2026-08-10', 220.462262, { weightUnit: 'lb' })]);
    expect(points[0].weightKg).toBeCloseTo(100, 5);
  });

  it('averages across units within a day', () => {
    // Switching units mid-day is odd but possible, and averaging the raw numbers would
    // produce something between 100 and 220 that is neither.
    const points = dailyWeights([
      entry('2026-08-10', 100, { weightUnit: 'kg' }),
      entry('2026-08-10', 220.462262, { weightUnit: 'lb' }),
    ]);

    expect(points[0].weightKg).toBeCloseTo(100, 5);
  });

  it('returns nothing for no entries', () => {
    expect(dailyWeights([])).toEqual([]);
  });
});

describe('movingAverage', () => {
  it('averages a full window', () => {
    const points = dailyWeights(
      ['2026-08-05', '2026-08-06', '2026-08-07', '2026-08-08', '2026-08-09', '2026-08-10', '2026-08-11']
        .map((date, index) => entry(date, 80 + index)),
    );

    const trend = movingAverage(points, 7);
    // Last point sees all seven: mean of 80..86.
    expect(trend[trend.length - 1].value).toBeCloseTo(83, 5);
  });

  it('uses a partial window for the first days rather than emitting nothing', () => {
    // A new user would otherwise stare at a raw line with no trend for a week, which is
    // exactly when the reassurance matters. A partial average is still a real average.
    const points = dailyWeights([entry('2026-08-10', 80), entry('2026-08-11', 82)]);
    const trend = movingAverage(points, 7);

    expect(trend).toHaveLength(2);
    expect(trend[0].value).toBe(80);
    expect(trend[1].value).toBe(81);
  });

  it('windows by date, not by sample count, across a gap', () => {
    // The bug a count-based window hides: three weigh-ins in July and one in August would
    // report a "7-day average" spanning six weeks, blending a weight from a month ago into
    // today's number.
    const points = dailyWeights([
      entry('2026-07-01', 90),
      entry('2026-07-02', 90),
      entry('2026-07-03', 90),
      entry('2026-08-11', 80),
    ]);

    const trend = movingAverage(points, 7);
    expect(trend[trend.length - 1].value).toBe(80);
  });

  it('drops days as they age out of the window', () => {
    const points = dailyWeights([
      entry('2026-08-01', 100),
      entry('2026-08-02', 80),
      entry('2026-08-03', 80),
    ]);

    // Window of 2: the last point sees 08-02 and 08-03 only, so the 100 is gone.
    const trend = movingAverage(points, 2);
    expect(trend[trend.length - 1].value).toBe(80);
  });

  it('smooths a spike instead of tracking it', () => {
    // The whole point of the module, stated as a test: one bad reading must not move the
    // trend line as far as it moves the raw line.
    const flat = ['2026-08-05', '2026-08-06', '2026-08-07', '2026-08-08', '2026-08-09', '2026-08-10']
      .map((date) => entry(date, 80));
    const points = dailyWeights([...flat, entry('2026-08-11', 87)]);

    const trend = movingAverage(points, 7);
    const last = trend[trend.length - 1].value;

    expect(last).toBeGreaterThan(80);
    expect(last).toBeLessThan(81.5);
  });

  it('returns one point per input day', () => {
    const points = dailyWeights([
      entry('2026-08-09', 80),
      entry('2026-08-10', 81),
      entry('2026-08-11', 82),
    ]);

    expect(movingAverage(points, 7).map((p) => p.day)).toEqual(points.map((p) => p.day));
  });

  it('handles an empty series', () => {
    expect(movingAverage([], 7)).toEqual([]);
  });
});

describe('summarise', () => {
  const points = dailyWeights([
    entry('2026-08-01', 82),
    entry('2026-08-05', 81),
    entry('2026-08-11', 80),
  ]);
  const trend = movingAverage(points, 7);

  it('reports the trend value, not the last raw reading', () => {
    const summary = summarise(points, trend, at('2026-08-11'));

    expect(summary.latestKg).toBe(80);
    expect(summary.trendKg).toBe(trend[trend.length - 1].value);
  });

  it('reports the change across the period as a trend delta', () => {
    const summary = summarise(points, trend, at('2026-08-11'), 30);
    expect(summary.changeKg).toBeCloseTo(
      trend[trend.length - 1].value - trend[0].value,
      5,
    );
  });

  it('counts days logged in the period, not days elapsed', () => {
    expect(summarise(points, trend, at('2026-08-11'), 30).daysLogged).toBe(3);
  });

  it('excludes data older than the period', () => {
    const summary = summarise(points, trend, at('2026-08-11'), 7);
    // Only 08-05 and 08-11 fall inside a 7-day window ending 08-11.
    expect(summary.daysLogged).toBe(2);
  });

  it('gives no direction from a single data point', () => {
    // One weigh-in is not a trend; reporting "+0.0kg" would imply a measured stability
    // that was never measured.
    const single = dailyWeights([entry('2026-08-11', 80)]);
    const summary = summarise(single, movingAverage(single, 7), at('2026-08-11'));

    expect(summary.changeKg).toBeNull();
    expect(summary.latestKg).toBe(80);
  });

  it('is all-null with no data at all', () => {
    const summary = summarise([], [], at('2026-08-11'));
    expect(summary).toEqual({ latestKg: null, trendKg: null, changeKg: null, daysLogged: 0 });
  });
});

describe('withinDays', () => {
  it('keeps the trailing window inclusive of today', () => {
    const points = dailyWeights([
      entry('2026-08-01', 82),
      entry('2026-08-10', 81),
      entry('2026-08-11', 80),
    ]);

    expect(withinDays(points, at('2026-08-11'), 7).map((p) => p.dayKey)).toEqual([
      '2026-08-10',
      '2026-08-11',
    ]);
  });

  it('keeps everything when the window covers the whole history', () => {
    const points = dailyWeights([entry('2026-08-10', 81), entry('2026-08-11', 80)]);
    expect(withinDays(points, at('2026-08-11'), 90)).toHaveLength(2);
  });
});

describe('formatDelta', () => {
  it('signs a gain and a loss explicitly', () => {
    expect(formatDelta(1.42, 'kg')).toBe('+1.4 kg');
    expect(formatDelta(-1.42, 'kg')).toBe('-1.4 kg');
  });

  it('converts to the display unit', () => {
    expect(formatDelta(-1, 'lb')).toBe('-2.2 lb');
  });

  it('does not render a negative zero', () => {
    // -0.04 rounds to -0, which formats as "-0.0" and reads as a loss that did not happen.
    expect(formatDelta(-0.04, 'kg')).toBe('0.0 kg');
  });

  it('renders an em dash for no data', () => {
    expect(formatDelta(null, 'kg')).toBe('—');
  });
});

describe('toDisplayWeight', () => {
  it('passes kg through, rounded to one decimal', () => {
    expect(toDisplayWeight(80.44, 'kg')).toBe(80.4);
  });

  it('converts to pounds', () => {
    expect(toDisplayWeight(100, 'lb')).toBeCloseTo(220.5, 1);
  });
});

describe('displayUnit', () => {
  it('follows the most recent entry', () => {
    expect(displayUnit([
      entry('2026-08-10', 176, { weightUnit: 'lb' }),
      entry('2026-08-11', 80, { weightUnit: 'kg' }),
    ])).toBe('kg');
  });

  it('is not fooled by input order', () => {
    expect(displayUnit([
      entry('2026-08-11', 176, { weightUnit: 'lb' }),
      entry('2026-08-10', 80, { weightUnit: 'kg' }),
    ])).toBe('lb');
  });

  it('defaults to kg with no history', () => {
    expect(displayUnit([])).toBe('kg');
  });
});

describe('goalDelta', () => {
  it('is positive while the trend is above the goal', () => {
    expect(goalDelta(82, 78)).toBe(4);
  });

  it('is negative once the trend is below it', () => {
    expect(goalDelta(76, 78)).toBe(-2);
  });

  it('is null when either side is missing', () => {
    expect(goalDelta(null, 78)).toBeNull();
    expect(goalDelta(82, null)).toBeNull();
  });
});

describe('formatWeight', () => {
  it('renders one decimal with a space before the unit', () => {
    expect(formatWeight(74.84, 'kg')).toBe('74.8 kg');
  });

  it('keeps a trailing zero, so a column of weights aligns', () => {
    expect(formatWeight(72, 'kg')).toBe('72.0 kg');
  });

  it('converts to the display unit', () => {
    expect(formatWeight(80, 'lb')).toBe('176.4 lb');
  });

  it('renders an em dash for no weight', () => {
    expect(formatWeight(null, 'kg')).toBe('—');
  });
});

describe('weighings', () => {
  it('is newest first, and the earliest has nothing to compare against', () => {
    const rows = weighings([
      entry('2026-08-09', 80.2),
      entry('2026-08-11', 79.8),
      entry('2026-08-10', 80),
    ]);

    expect(rows.map((row) => row.entry.recordedAt.slice(0, 10))).toEqual([
      '2026-08-11',
      '2026-08-10',
      '2026-08-09',
    ]);
    expect(rows[2].changeKg).toBeNull();
  });

  it('measures each row against the weighing before it', () => {
    const rows = weighings([entry('2026-08-10', 80), entry('2026-08-11', 79.8)]);
    expect(rows[0].changeKg).toBeCloseTo(-0.2, 5);
  });

  it('keeps both of a day two weigh-ins, unlike the chart series', () => {
    // The deliberate difference from `dailyWeights`: the chart wants one point a day, the log
    // wants every time you actually stood on the scale.
    const entries = [entry('2026-08-10', 80), entry('2026-08-10', 82)];
    expect(weighings(entries)).toHaveLength(2);
    expect(dailyWeights(entries)).toHaveLength(1);
  });

  it('normalises units before subtracting, so a unit switch is not a 96 kg loss', () => {
    const rows = weighings([
      entry('2026-08-10', 176, { weightUnit: 'lb' }),
      entry('2026-08-11', 80, { weightUnit: 'kg' }),
    ]);

    expect(rows[0].weightKg).toBe(80);
    expect(rows[0].changeKg).toBeCloseTo(0.17, 2);
  });

  it('carries the calendar day, so the range windows the log with the chart cutoff', () => {
    const rows = weighings([
      entry('2026-06-01', 84),
      entry('2026-08-10', 80.2),
      entry('2026-08-11', 80),
    ]);

    const visible = withinDays(rows, at('2026-08-11'), 30);
    expect(visible).toHaveLength(2);
    // Still measured against the June weighing, which the window dropped.
    expect(visible[1].changeKg).toBeCloseTo(-3.8, 5);
  });
});

describe('weeklyRateKg', () => {
  /** A trend line straight through the raw points, so the expected slope is arithmetic. */
  function rawTrend(...entries: BodyWeightEntry[]) {
    return movingAverage(dailyWeights(entries), 1);
  }

  it('is the trend slope scaled to seven days', () => {
    const trend = rawTrend(entry('2026-07-28', 84), entry('2026-08-11', 80));
    // Four kilos across a fortnight is two a week.
    expect(weeklyRateKg(trend, at('2026-08-11'))).toBeCloseTo(-2, 5);
  });

  it('is positive when the trend is climbing', () => {
    const trend = rawTrend(entry('2026-08-04', 80), entry('2026-08-11', 80.7));
    expect(weeklyRateKg(trend, at('2026-08-11'))).toBeCloseTo(0.7, 5);
  });

  it('is null across less than a week, however many points there are', () => {
    // A slope from two days multiplied up by seven is a month's prediction made from a
    // hydration swing, which is exactly the noise this module exists to remove.
    const trend = rawTrend(
      entry('2026-08-09', 81),
      entry('2026-08-10', 80.4),
      entry('2026-08-11', 80),
    );
    expect(weeklyRateKg(trend, at('2026-08-11'))).toBeNull();
  });

  it('is null with one point in the period', () => {
    const trend = rawTrend(entry('2026-08-11', 80));
    expect(weeklyRateKg(trend, at('2026-08-11'))).toBeNull();
  });

  it('ignores points outside the period', () => {
    // The old point is what would make the span long enough; the shorter period drops it.
    const trend = rawTrend(entry('2026-06-01', 90), entry('2026-08-11', 80));
    expect(weeklyRateKg(trend, at('2026-08-11'), 30)).toBeNull();
    expect(weeklyRateKg(trend, at('2026-08-11'), 90)).not.toBeNull();
  });
});

describe('formatVowGap', () => {
  it('says what closing the gap takes, in either direction', () => {
    expect(formatVowGap(2.8, 'kg')).toBe('2.8 kg to lose');
    expect(formatVowGap(-2, 'kg')).toBe('2.0 kg to gain');
  });

  it('calls a gap that rounds away reached', () => {
    expect(formatVowGap(0.02, 'kg')).toBe('Reached');
    expect(formatVowGap(0, 'kg')).toBe('Reached');
  });

  it('converts to the display unit', () => {
    expect(formatVowGap(2, 'lb')).toBe('4.4 lb to lose');
  });

  it('is null with no vow to be short of', () => {
    expect(formatVowGap(null, 'kg')).toBeNull();
  });
});

describe('describeVow', () => {
  it('is null with no vow or no trend to project from', () => {
    expect(describeVow({ goalKg: null, trendKg: 74.8, rateKgPerWeek: -0.4, unit: 'kg' })).toBeNull();
    expect(describeVow({ goalKg: 72, trendKg: null, rateKgPerWeek: -0.4, unit: 'kg' })).toBeNull();
  });

  it('gives the distance and the time at the current rate', () => {
    expect(describeVow({ goalKg: 72, trendKg: 74.8, rateKgPerWeek: -0.4, unit: 'kg' })).toEqual({
      distance: '2.8 kg from your current trend of 74.8 kg',
      eta: 'At 0.4 kg a week, about 7 weeks.',
    });
  });

  it('counts weeks in kilograms but states them in the display unit', () => {
    // The estimate must not change because the screen is reading in pounds.
    expect(describeVow({ goalKg: 78, trendKg: 80, rateKgPerWeek: -0.5, unit: 'lb' })).toEqual({
      distance: '4.4 lb from your current trend of 176.4 lb',
      eta: 'At 1.1 lb a week, about 4 weeks.',
    });
  });

  it('says a week rather than about 1 weeks', () => {
    expect(
      describeVow({ goalKg: 72, trendKg: 72.4, rateKgPerWeek: -0.5, unit: 'kg' })?.eta,
    ).toBe('At 0.5 kg a week, about a week.');
  });

  it('stops counting past a year', () => {
    // "About 56 weeks" is arithmetic pretending to be a forecast.
    expect(describeVow({ goalKg: 72, trendKg: 100, rateKgPerWeek: -0.5, unit: 'kg' })?.eta).toBe(
      'At 0.5 kg a week, over a year.',
    );
  });

  it('gives no estimate when there is no rate yet', () => {
    expect(describeVow({ goalKg: 72, trendKg: 74.8, rateKgPerWeek: null, unit: 'kg' })).toEqual({
      distance: '2.8 kg from your current trend of 74.8 kg',
      eta: 'Too few weighings yet to say how long that takes.',
    });
  });

  it('gives no date for a flat trend rather than dividing by nearly nothing', () => {
    expect(describeVow({ goalKg: 72, trendKg: 74.8, rateKgPerWeek: 0.01, unit: 'kg' })?.eta).toBe(
      'Your trend is flat, so there is no date to give.',
    );
  });

  it('says so when the trend is moving away from the vow', () => {
    expect(describeVow({ goalKg: 72, trendKg: 74.8, rateKgPerWeek: 0.3, unit: 'kg' })?.eta).toBe(
      'Your trend is moving away from it, at 0.3 kg a week.',
    );
    // Below the vow and still falling is the same mistake in the other direction.
    expect(describeVow({ goalKg: 72, trendKg: 70, rateKgPerWeek: -0.3, unit: 'kg' })?.eta).toBe(
      'Your trend is moving away from it, at 0.3 kg a week.',
    );
  });

  it('reads level rather than claiming a gap of nothing', () => {
    expect(describeVow({ goalKg: 72, trendKg: 72.01, rateKgPerWeek: -0.4, unit: 'kg' })).toEqual({
      distance: 'Level with your current trend of 72.0 kg',
      eta: null,
    });
  });
});
