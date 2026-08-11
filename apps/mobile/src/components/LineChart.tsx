/**
 * A line chart on `react-native-svg`, with a smoothed overlay and an optional goal line.
 *
 * Hand-rolled rather than pulled from a charting library, deliberately.
 * `01-architecture-and-stack.md` names `victory-native` and `react-native-svg-charts` as
 * candidates; both were checked and rejected for this app:
 *
 * - `react-native-svg-charts` (5.4.0, last published 2019) peers on `react-native-svg ^6||^7`
 *   while Expo SDK 57 bundles 15.15.4. Installing it means an unresolvable peer range on an
 *   unmaintained package.
 * - `victory-native` 41 requires `@shopify/react-native-skia`, `react-native-reanimated` and
 *   `react-native-gesture-handler` — three native dependencies, and a new-architecture
 *   renderer, for one line chart.
 *
 * `react-native-svg` alone is Expo-bundled, so it stays inside `expo install`'s version
 * management. All the geometry lives in `src/domain/chart.ts`, which is pure and unit-tested;
 * this file is the renderer. That split is the point — the maths is where the bugs are.
 *
 * The chart draws in real pixels against a measured container width rather than a fixed
 * `viewBox`: SVG's default `preserveAspectRatio` letterboxes a viewBox whose aspect ratio
 * does not match its box, which would silently misalign the axis labels (plain RN `Text`,
 * positioned absolutely) against the gridlines (SVG, inside the scaled space). Measuring
 * costs one extra render on mount and removes the whole class of problem.
 *
 * Deliberately not interactive: no pan, no zoom, no tooltips. The spec asks to see a trend
 * at a glance, and touch handling is what would have justified a gesture library.
 */

import { useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import {
  Box,
  DataPoint,
  linePath,
  niceRange,
  plotWidth,
  project,
  seriesBounds,
  yTicks,
} from '@/domain/chart';
import { colors, fontSize, radius, spacing } from '@/theme';

type Props = {
  /** Raw daily values — drawn thin, since these are the noise. */
  points: DataPoint[];
  /** Smoothed values — drawn as the emphasis line, since this is the signal. */
  trend?: DataPoint[];
  /** Horizontal goal line, in the same units as the data. Omitted when unset. */
  goal?: number | null;
  height?: number;
  /** Formats the y-axis labels; receives a value in data units. */
  formatValue?: (value: number) => string;
  /** Shown in place of the chart when there is nothing to plot. */
  emptyLabel?: string;
};

/** Left padding is the y-axis label gutter; the rest is breathing room for the stroke caps. */
const PADDING = { top: spacing.md, right: spacing.md, bottom: spacing.md, left: 44 };

/** Beyond this many points the per-day dots stop adding information and start costing nodes. */
const MAX_DOTS = 60;

export function LineChart({
  points,
  trend = [],
  goal = null,
  height = 220,
  formatValue = (value) => String(Math.round(value)),
  emptyLabel = 'No data yet',
}: Props) {
  const [width, setWidth] = useState(0);

  const onLayout = (event: LayoutChangeEvent) => {
    const measured = event.nativeEvent.layout.width;
    setWidth((current) => (Math.abs(current - measured) < 1 ? current : measured));
  };

  // The goal participates in the y range: a goal below every logged weight still has to be
  // on screen, or the line the user set it to see is clipped off the bottom.
  const goalSeries: DataPoint[][] =
    goal !== null && points.length > 0
      ? [[{ x: points[0].x, y: goal }, { x: points[points.length - 1].x, y: goal }]]
      : [];
  const bounds = seriesBounds([points, trend, ...goalSeries]);

  if (!bounds) {
    return (
      <View style={[styles.empty, { height }]}>
        <Text style={styles.emptyText}>{emptyLabel}</Text>
      </View>
    );
  }

  const y = niceRange(bounds.minY, bounds.maxY);
  const scale = { minX: bounds.minX, maxX: bounds.maxX, minY: y.min, maxY: y.max };
  const box: Box = { width, height, padding: PADDING };
  const ticks = yTicks(scale);

  return (
    <View style={[styles.container, { height }]} onLayout={onLayout}>
      {/* First paint has no measurement yet; rendering the SVG at width 0 would emit a
          frame of paths collapsed onto the left edge. */}
      {width > 0 ? (
        <>
          <Svg width={width} height={height}>
            {ticks.map((tick) => {
              const pixel = project({ x: scale.minX, y: tick }, scale, box);
              return (
                <Line
                  key={`grid-${tick}`}
                  x1={PADDING.left}
                  y1={pixel.y}
                  x2={PADDING.left + plotWidth(box)}
                  y2={pixel.y}
                  stroke={colors.border}
                  strokeWidth={StyleSheet.hairlineWidth}
                />
              );
            })}

            {goal !== null ? (
              <Line
                x1={PADDING.left}
                y1={project({ x: scale.minX, y: goal }, scale, box).y}
                x2={PADDING.left + plotWidth(box)}
                y2={project({ x: scale.minX, y: goal }, scale, box).y}
                stroke={colors.success}
                strokeWidth={1.5}
                strokeDasharray="5 4"
              />
            ) : null}

            <Path
              d={linePath(points, scale, box)}
              fill="none"
              stroke={colors.textMuted}
              strokeWidth={1}
            />

            <Path
              d={linePath(trend, scale, box)}
              fill="none"
              stroke={colors.accent}
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {/* A single entry produces a path with a moveto and no segments, which draws
                nothing — the dots are what make day one visible. */}
            {points.length <= MAX_DOTS
              ? points.map((point) => {
                  const pixel = project(point, scale, box);
                  return (
                    <Circle
                      key={`dot-${point.x}`}
                      cx={pixel.x}
                      cy={pixel.y}
                      r={2}
                      fill={colors.textMuted}
                    />
                  );
                })
              : null}
          </Svg>

          {/* Axis labels are RN Text rather than SVG <Text> so they use the platform font
              stack instead of needing a font bundled into the app. Same projection as the
              gridlines, same pixel space. */}
          <View style={styles.axis} pointerEvents="none">
            {ticks.map((tick) => (
              <Text
                key={`label-${tick}`}
                style={[
                  styles.axisLabel,
                  { top: project({ x: scale.minX, y: tick }, scale, box).y - fontSize.xs },
                ]}
                numberOfLines={1}
              >
                {formatValue(tick)}
              </Text>
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'relative' },
  axis: { position: 'absolute', left: 0, top: 0, bottom: 0, width: PADDING.left - spacing.sm },
  axisLabel: {
    position: 'absolute',
    right: 0,
    color: colors.textMuted,
    fontSize: fontSize.xs,
    textAlign: 'right',
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyText: { color: colors.textMuted, fontSize: fontSize.sm },
});
