/**
 * Chart geometry: data space -> SVG coordinate space.
 *
 * Split out from `weight.ts` because none of it is about weight. `04-feature-specs.md`
 * also asks for volume/1RM progress charts off the workout data, and those need the same
 * projection, the same axis rounding and the same empty-series handling.
 *
 * Pure by design — no `react-native-svg` import, no React, no clock. The component in
 * `src/components/LineChart.tsx` is a thin renderer over the strings these return, so the
 * interesting failure modes (a flat series collapsing to a divide-by-zero, a single point
 * producing `NaN` in a path) are unit-testable without mounting anything.
 *
 * SVG's y axis grows downward, so `project` inverts y: the largest data value maps to the
 * smallest pixel y.
 */

export type DataPoint = { x: number; y: number };

/** The data-space window a chart is drawn against. */
export type Scale = { minX: number; maxX: number; minY: number; maxY: number };

/** Pixel box, with padding reserved for axis labels. */
export type Box = {
  width: number;
  height: number;
  padding: { top: number; right: number; bottom: number; left: number };
};

export type Point = { x: number; y: number };

/**
 * Rounds a min/max pair outward to a readable interval and guarantees a non-zero span.
 *
 * Two cases matter. A flat series (one entry, or a week at exactly the same weight) has
 * `min === max`, which would make the y scale zero-height and every projected point
 * `NaN` — so it opens the range symmetrically around the value. Otherwise it pads by
 * `padRatio` and snaps to a multiple of `step` so the axis labels are round numbers
 * instead of 71.4kg.
 */
export function niceRange(
  min: number,
  max: number,
  { padRatio = 0.08, step = 1, minSpan = 2 }: { padRatio?: number; step?: number; minSpan?: number } = {},
): { min: number; max: number } {
  const span = max - min;
  const pad = span === 0 ? minSpan / 2 : Math.max(span * padRatio, minSpan / 2);
  const lo = Math.floor((min - pad) / step) * step;
  const hi = Math.ceil((max + pad) / step) * step;
  // Snapping can still collapse the range when step is large relative to the data.
  return hi - lo < minSpan ? { min: lo, max: lo + minSpan } : { min: lo, max: hi };
}

/** Data-space bounds across every series, ignoring empty ones. `null` when there is nothing to plot. */
export function seriesBounds(series: DataPoint[][]): Scale | null {
  const points = series.flat();
  if (points.length === 0) return null;

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

/** The drawable area inside the padding. */
export function plotWidth(box: Box): number {
  return Math.max(0, box.width - box.padding.left - box.padding.right);
}

export function plotHeight(box: Box): number {
  return Math.max(0, box.height - box.padding.top - box.padding.bottom);
}

/**
 * One data point to pixels. A zero-width or zero-height scale centres rather than dividing
 * by zero — `niceRange` prevents that for y, but x collapses whenever there is a single
 * point, which is the first thing a user sees after logging their first weight.
 */
export function project(point: DataPoint, scale: Scale, box: Box): Point {
  const spanX = scale.maxX - scale.minX;
  const spanY = scale.maxY - scale.minY;
  const ratioX = spanX === 0 ? 0.5 : (point.x - scale.minX) / spanX;
  const ratioY = spanY === 0 ? 0.5 : (point.y - scale.minY) / spanY;
  return {
    x: box.padding.left + ratioX * plotWidth(box),
    // Inverted: data max is pixel top.
    y: box.padding.top + (1 - ratioY) * plotHeight(box),
  };
}

/** Rounded to 2dp — SVG path strings do not need more, and it keeps snapshots stable. */
function coord(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/**
 * An SVG `d` attribute for a polyline through the points, in the order given.
 *
 * Returns `''` for an empty series so the caller can pass it straight to `<Path d>` — an
 * empty `d` renders nothing, where a malformed one warns on every frame. A single point
 * emits a `moveto` only, which is invisible; the component draws dots separately so the
 * first entry is still visible.
 */
export function linePath(points: DataPoint[], scale: Scale, box: Box): string {
  if (points.length === 0) return '';
  return points
    .map((point, index) => {
      const { x, y } = project(point, scale, box);
      return `${index === 0 ? 'M' : 'L'}${coord(x)} ${coord(y)}`;
    })
    .join(' ');
}

/**
 * `count` evenly spaced y values across the scale, ascending, for gridlines and labels.
 *
 * Rounded to 1dp because the values are derived by division and the labels sit next to the
 * chart, where 71.30000000000001 is worse than useless.
 */
export function yTicks(scale: Scale, count = 4): number[] {
  if (count < 2) return [scale.minY];
  const span = scale.maxY - scale.minY;
  return Array.from({ length: count }, (_, index) => {
    const value = scale.minY + (span * index) / (count - 1);
    return Math.round(value * 10) / 10;
  });
}
