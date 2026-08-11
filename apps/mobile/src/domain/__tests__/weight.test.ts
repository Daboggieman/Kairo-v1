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
  dayKeyFromNumber,
  dayNumber,
  displayUnit,
  formatDelta,
  goalDelta,
  movingAverage,
  summarise,
  toDayKey,
  toDisplayWeight,
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
});

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
    expect(formatDelta(1.42, 'kg')).toBe('+1.4kg');
    expect(formatDelta(-1.42, 'kg')).toBe('-1.4kg');
  });

  it('converts to the display unit', () => {
    expect(formatDelta(-1, 'lb')).toBe('-2.2lb');
  });

  it('does not render a negative zero', () => {
    // -0.04 rounds to -0, which formats as "-0.0" and reads as a loss that did not happen.
    expect(formatDelta(-0.04, 'kg')).toBe('0.0kg');
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
