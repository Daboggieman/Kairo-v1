/**
 * Chart geometry tests.
 *
 * Pure maths, no database — the counterpart to `src/db/__tests__/*` rather than a
 * replacement for it. The cases that matter are the degenerate ones: a single point, a
 * perfectly flat series, an empty series. Each of those divides by a zero span somewhere in
 * a naive implementation and produces `NaN` in an SVG path string, which React Native
 * reports as a render warning rather than a crash — so it is exactly the kind of bug that
 * ships.
 */

import {
  Box,
  DataPoint,
  linePath,
  niceRange,
  plotHeight,
  plotWidth,
  project,
  seriesBounds,
  yTicks,
} from '../chart';

const BOX: Box = { width: 320, height: 200, padding: { top: 10, right: 10, bottom: 10, left: 40 } };

describe('seriesBounds', () => {
  it('spans every series, not just the first', () => {
    const raw: DataPoint[] = [{ x: 0, y: 80 }, { x: 1, y: 82 }];
    const trend: DataPoint[] = [{ x: 0, y: 70 }, { x: 1, y: 90 }];

    expect(seriesBounds([raw, trend])).toEqual({ minX: 0, maxX: 1, minY: 70, maxY: 90 });
  });

  it('ignores empty series rather than treating them as zero', () => {
    // A trend line is empty until there is data; treating that as a y of 0 would squash a
    // 75-80kg chart into the top 6% of the plot.
    expect(seriesBounds([[{ x: 5, y: 75 }], []])).toEqual({
      minX: 5, maxX: 5, minY: 75, maxY: 75,
    });
  });

  it('returns null when there is nothing at all to plot', () => {
    expect(seriesBounds([])).toBeNull();
    expect(seriesBounds([[], []])).toBeNull();
  });
});

describe('niceRange', () => {
  it('pads outward and snaps to whole numbers', () => {
    const range = niceRange(74.3, 79.8);
    expect(range.min).toBeLessThanOrEqual(74.3);
    expect(range.max).toBeGreaterThanOrEqual(79.8);
    expect(Number.isInteger(range.min)).toBe(true);
    expect(Number.isInteger(range.max)).toBe(true);
  });

  it('opens a non-zero range around a flat series', () => {
    // The single-entry case. min === max would make every projected y a NaN.
    const range = niceRange(75, 75);
    expect(range.max).toBeGreaterThan(range.min);
    expect(range.min).toBeLessThanOrEqual(75);
    expect(range.max).toBeGreaterThanOrEqual(75);
  });

  it('honours minSpan when the data barely moves', () => {
    // A week of 75.0-75.2 is real data; drawn against its own 0.2 range it looks like wild
    // swings. A floor on the span keeps a stable week looking stable.
    const range = niceRange(75, 75.2, { minSpan: 4 });
    expect(range.max - range.min).toBeGreaterThanOrEqual(4);
  });
});

describe('project', () => {
  const scale = { minX: 0, maxX: 10, minY: 70, maxY: 80 };

  it('inverts y so the largest value is nearest the top', () => {
    const top = project({ x: 0, y: 80 }, scale, BOX);
    const bottom = project({ x: 0, y: 70 }, scale, BOX);

    expect(top.y).toBeLessThan(bottom.y);
    expect(top.y).toBeCloseTo(BOX.padding.top, 5);
    expect(bottom.y).toBeCloseTo(BOX.padding.top + plotHeight(BOX), 5);
  });

  it('maps x across the plot area, inside the padding', () => {
    expect(project({ x: 0, y: 75 }, scale, BOX).x).toBeCloseTo(BOX.padding.left, 5);
    expect(project({ x: 10, y: 75 }, scale, BOX).x).toBeCloseTo(
      BOX.padding.left + plotWidth(BOX),
      5,
    );
  });

  it('centres a single point instead of dividing by a zero x span', () => {
    // What the very first weigh-in looks like: one point, so minX === maxX.
    const point = project({ x: 5, y: 75 }, { minX: 5, maxX: 5, minY: 70, maxY: 80 }, BOX);

    expect(Number.isNaN(point.x)).toBe(false);
    expect(point.x).toBeCloseTo(BOX.padding.left + plotWidth(BOX) / 2, 5);
  });

  it('centres vertically when the y span is zero', () => {
    const point = project({ x: 5, y: 75 }, { minX: 0, maxX: 10, minY: 75, maxY: 75 }, BOX);

    expect(Number.isNaN(point.y)).toBe(false);
    expect(point.y).toBeCloseTo(BOX.padding.top + plotHeight(BOX) / 2, 5);
  });
});

describe('linePath', () => {
  const scale = { minX: 0, maxX: 2, minY: 0, maxY: 10 };

  it('starts with a moveto and continues with linetos', () => {
    const path = linePath([{ x: 0, y: 0 }, { x: 1, y: 5 }, { x: 2, y: 10 }], scale, BOX);

    expect(path.startsWith('M')).toBe(true);
    expect(path.match(/L/g)).toHaveLength(2);
  });

  it('returns an empty string for no points', () => {
    // Passed straight to <Path d>; an empty d draws nothing, a malformed one warns.
    expect(linePath([], scale, BOX)).toBe('');
  });

  it('never emits NaN, even for a degenerate scale', () => {
    const path = linePath([{ x: 5, y: 75 }], { minX: 5, maxX: 5, minY: 75, maxY: 75 }, BOX);
    expect(path).not.toContain('NaN');
    expect(path.startsWith('M')).toBe(true);
  });

  it('follows the order given rather than sorting', () => {
    // The caller owns ordering; silently sorting here would hide a bug upstream where the
    // query returns rows in the wrong direction.
    const forward = linePath([{ x: 0, y: 0 }, { x: 2, y: 10 }], scale, BOX);
    const reversed = linePath([{ x: 2, y: 10 }, { x: 0, y: 0 }], scale, BOX);

    expect(forward).not.toBe(reversed);
  });
});

describe('yTicks', () => {
  it('spans the scale inclusively, ascending', () => {
    const ticks = yTicks({ minX: 0, maxX: 1, minY: 70, maxY: 80 }, 3);
    expect(ticks).toEqual([70, 75, 80]);
  });

  it('rounds to one decimal so labels stay readable', () => {
    const ticks = yTicks({ minX: 0, maxX: 1, minY: 0, maxY: 10 }, 4);
    expect(ticks).toEqual([0, 3.3, 6.7, 10]);
  });
});
