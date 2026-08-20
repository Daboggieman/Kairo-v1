/**
 * The Scales — the weight module's root screen: the trend, the chart, the vow, and the log.
 *
 * `04-feature-specs.md`: *"trend, not noise — daily weight fluctuates, the chart should smooth
 * it."* So the smoothed 7-day line is the emphasis (accent, thick), the raw daily readings sit
 * behind it in muted grey, and the headline figure is the *trend* rather than the last thing the
 * scale said.
 *
 * A `FlatList` rather than the `ScreenScroll` most tab roots use, for The Forge's reason: a weight
 * log grows a row a day forever. That costs the screen the footer inset `ScreenScroll` would have
 * owned, which is why it reads `useSafeAreaInsets` itself.
 *
 * Departures from `5.13_the_scales`:
 *
 * - **The vow is a row, not the third stat cell.** The design's third cell carries a value *and* a
 *   caption ("2.8 kg to go"), which `StatStrip` has no slot for, and three display figures across a
 *   phone leaves each about 82pt. As a row it also becomes the way *into* The Vow, which is what
 *   lets the docked footer go.
 * - **No docked footer.** The design docks "Step on the scales" and "Set the vow". The vow now has
 *   its row, and one outlined `+` in the header is the convention every other tab root follows.
 * - **The range moves the chart and the log together.** The design scopes it to the chart. Windowing
 *   the log with it is what makes "30 D" mean something on a screen whose list is the taller half —
 *   and `withinDays` is already the tested cutoff, so it costs no new query and no new data path.
 * - **The 30-day change stays 30 days at every range.** The design labels that cell "30 DAYS" while
 *   its header reads "Last 90 days", and it is right to: the range moves the view, not the yardstick.
 * - **No month ticks or in-chart vow label.** `LineChart` draws neither, and adding an x axis is a
 *   chart feature rather than a restyle. The legend names the dashed line instead.
 *
 * Reloads on focus rather than on mount: logging a weighing dismisses the modal back to here, and a
 * mount-only effect would show a chart missing the entry just added.
 */

import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import {
  Card,
  Chip,
  Divider,
  EmptyState,
  IconButton,
  NavRow,
  Notice,
  RowGroup,
  Screen,
  ScreenHeader,
  Section,
  StatStrip,
} from '@/components/Layout';
import { LineChart } from '@/components/LineChart';
import { LOCAL_USER_ID } from '@/constants';
import { getGoalWeightKg } from '@/db/preferences';
import type { BodyWeightEntry } from '@/db/types';
import { deleteEntry, listEntriesAscending } from '@/db/weight';
import type { DataPoint } from '@/domain/chart';
import { dayNumber, relativeDayLabel, toDayKey, todayNumber } from '@/domain/dates';
import {
  dailyWeights,
  displayUnit,
  formatDelta,
  formatVowGap,
  formatWeight,
  goalDelta,
  movingAverage,
  summarise,
  toDisplayWeight,
  TREND_WINDOW_DAYS,
  type Weighing,
  weighings,
  withinDays,
} from '@/domain/weight';
import { requestSync } from '@/sync/scheduler';
import { colors, fontSize, layout, lineHeight, spacing } from '@/theme';

/**
 * The ranges the design offers. `days: null` is ALL — no window at all.
 *
 * "All" rather than the design's "ALL": `Chip` renders its label verbatim, and a shouted word beside
 * "30 D" and "1 Y" reads as emphasis rather than as the unit abbreviations those two are.
 */
const RANGES = [
  { key: '30', label: '30 D', days: 30, period: 'Last 30 days' },
  { key: '90', label: '90 D', days: 90, period: 'Last 90 days' },
  { key: '365', label: '1 Y', days: 365, period: 'Last year' },
  { key: 'all', label: 'All', days: null, period: 'Every weighing' },
] as const;

type RangeKey = (typeof RANGES)[number]['key'];

/**
 * Below this a change is nothing: it rounds to "0.0 kg", and colouring that green or red is
 * colouring noise.
 */
const FLAT_KG = 0.05;

/**
 * Green for down, red for up.
 *
 * This is the design's colouring and it assumes a cut, which is the assumption every weight app
 * makes and none of them state. Nothing recorded says which way a user means to go — when the vow
 * eventually carries a direction, this is the one place that has to learn about it.
 */
function changeTone(changeKg: number | null): 'success' | 'danger' | 'text' {
  if (changeKg === null || Math.abs(changeKg) < FLAT_KG) return 'text';
  return changeKg < 0 ? 'success' : 'danger';
}

/** "Today", "Yesterday", or "Sun, 17 Aug" — the host decides the order of the last one. */
function weighingDate(iso: string, today: number): string {
  const relative = relativeDayLabel(dayNumber(toDayKey(iso)), today);
  if (relative) return relative;
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/** A key for the chart legend: the swatch drawn the way the chart draws that series. */
function LegendSwatch({
  color,
  label,
  dashed = false,
}: {
  color: string;
  label: string;
  dashed?: boolean;
}) {
  return (
    <View style={styles.legendItem}>
      <View
        style={[
          styles.legendSwatch,
          { backgroundColor: dashed ? 'transparent' : color, borderColor: color },
          dashed && styles.legendSwatchDashed,
        ]}
      />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

/** One weighing: what the scale said, and what it moved from the one before. */
function WeighingRow({
  row,
  unit,
  today,
  onDelete,
}: {
  row: Weighing;
  unit: BodyWeightEntry['weightUnit'];
  today: number;
  onDelete: () => void;
}) {
  const date = weighingDate(row.entry.recordedAt, today);
  const weight = formatWeight(row.weightKg, unit);
  const tone = changeTone(row.changeKg);
  return (
    <Pressable
      onLongPress={onDelete}
      accessibilityRole="button"
      accessibilityLabel={`${date}. ${weight}`}
      accessibilityHint="Long press to remove this weighing"
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.rowMain}>
        <Text style={styles.rowDate}>{date}</Text>
        {row.entry.note ? (
          <Text style={styles.rowNote} numberOfLines={1}>
            {row.entry.note}
          </Text>
        ) : null}
      </View>
      <View style={styles.rowRight}>
        <Text style={styles.rowWeight}>{weight}</Text>
        {row.changeKg === null ? null : (
          <Text style={[styles.rowChange, tone === 'success' && styles.down, tone === 'danger' && styles.up]}>
            {formatDelta(row.changeKg, unit)}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

export default function ScalesScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [entries, setEntries] = useState<BodyWeightEntry[]>([]);
  const [goalKg, setGoalKg] = useState<number | null>(null);
  const [rangeKey, setRangeKey] = useState<RangeKey>('90');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /**
   * The clock the date windows are measured against, captured when the data loads rather than read
   * during render (`Date.now()` in a render body is impure — React may re-render at any moment and
   * the window would shift underneath the chart). `useNow` is the wrong tool: it re-renders every
   * second, and a 90-day chart does not change at that rate. Refocusing reloads both together,
   * which is the only moment the window can meaningfully move.
   */
  const [nowMs, setNowMs] = useState(() => Date.now());

  const load = useCallback(async () => {
    const [rows, goal] = await Promise.all([
      listEntriesAscending(db, LOCAL_USER_ID),
      getGoalWeightKg(db, LOCAL_USER_ID),
    ]);
    setEntries(rows);
    setGoalKg(goal);
    setNowMs(Date.now());
    setError(null);
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          await load();
        } catch (caught) {
          // Without this the rejection was unhandled and the chart sat empty with no explanation.
          if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [load]),
  );

  const onDelete = useCallback(
    (row: Weighing) => {
      Alert.alert('Remove this weighing', `Take the ${formatWeight(row.weightKg, row.entry.weightUnit)} reading off the scales?`, [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await deleteEntry(db, row.entry.id);
                void requestSync(db).catch(() => {});
                await load();
              } catch (caught) {
                setError(caught instanceof Error ? caught.message : String(caught));
              }
            })();
          },
        },
      ]);
    },
    [db, load],
  );

  const range = RANGES.find((option) => option.key === rangeKey) ?? RANGES[1];
  const today = todayNumber(nowMs);
  const unit = displayUnit(entries);
  const daily = dailyWeights(entries);
  // Smoothed across the full history, then windowed — so the leftmost visible point carries a
  // complete 7-day window instead of restarting from a partial one at the range edge.
  const trend = movingAverage(daily, TREND_WINDOW_DAYS);
  const summary = summarise(daily, trend, nowMs);

  /** The selected range, applied to anything carrying a calendar day. ALL clips nothing. */
  const clip = <T extends { day: number }>(points: T[]) =>
    range.days === null ? points : withinDays(points, nowMs, range.days);

  // The chart is unit-agnostic; converting here means the axis labels, the vow line and the strip
  // above all read in the same unit without the chart knowing what a kilogram is.
  const rawPoints: DataPoint[] = clip(daily).map((point) => ({
    x: point.day,
    y: toDisplayWeight(point.weightKg, unit),
  }));
  const trendPoints: DataPoint[] = clip(trend).map((point) => ({
    x: point.day,
    y: toDisplayWeight(point.value, unit),
  }));

  const log = clip(weighings(entries));
  const toVow = goalDelta(summary.trendKg, goalKg);
  const changeTint = changeTone(summary.changeKg);

  const stepOn = (
    <IconButton
      icon="plus"
      label="Step on the scales"
      variant="outlined"
      onPress={() => router.push('/weight/log')}
    />
  );

  return (
    <Screen>
      <FlatList
        data={log}
        keyExtractor={(item) => item.entry.id}
        renderItem={({ item }) => (
          <WeighingRow row={item} unit={unit} today={today} onDelete={() => onDelete(item)} />
        )}
        ItemSeparatorComponent={Divider}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + layout.scrollFooter }]}
        ListHeaderComponent={
          <View style={styles.header}>
            <ScreenHeader
              title="The Scales"
              subtitle={`${range.period} · ${log.length} ${log.length === 1 ? 'weighing' : 'weighings'}`}
              action={stepOn}
            />

            {error ? (
              <Notice tone="danger" title="Could not read the scales">
                {error}
              </Notice>
            ) : null}

            <StatStrip
              size="lg"
              items={[
                { label: 'Trend', value: formatWeight(summary.trendKg, unit), tone: 'accent' },
                {
                  label: '30 days',
                  value: formatDelta(summary.changeKg, unit),
                  tone: changeTint,
                },
              ]}
            />

            <Card>
              <LineChart
                points={rawPoints}
                trend={trendPoints}
                goal={goalKg === null ? null : toDisplayWeight(goalKg, unit)}
                formatValue={(value) => `${Math.round(value)}`}
                emptyLabel={loading ? '' : 'Nothing to plot yet'}
              />
              <View style={styles.legend}>
                <LegendSwatch color={colors.accent} label={`${TREND_WINDOW_DAYS}-day trend`} />
                <LegendSwatch color={colors.textMuted} label="Daily" />
                {goalKg !== null ? (
                  <LegendSwatch color={colors.success} label="The vow" dashed />
                ) : null}
              </View>
            </Card>

            <View style={styles.ranges}>
              {RANGES.map((option) => (
                <Chip
                  key={option.key}
                  label={option.label}
                  selected={option.key === rangeKey}
                  onPress={() => setRangeKey(option.key)}
                  accessibilityLabel={option.period}
                  style={styles.rangeChip}
                />
              ))}
            </View>

            <RowGroup>
              <NavRow
                label="The Vow"
                value={goalKg === null ? undefined : formatWeight(goalKg, unit)}
                detail={
                  goalKg === null
                    ? 'Draw a line on the chart'
                    : (formatVowGap(toVow, unit) ?? 'Step on the scales to measure it')
                }
                onPress={() => router.push('/weight/goal')}
              />
            </RowGroup>

            {/* Children omitted: the rows this titles are the list's own. */}
            {log.length > 0 ? <Section title="The weighings" /> : null}
          </View>
        }
        ListFooterComponent={
          log.length > 0 ? (
            <Text style={styles.footnote}>Long-press a weighing to remove it.</Text>
          ) : null
        }
        ListEmptyComponent={
          loading || error ? null : entries.length > 0 ? (
            // History exists, this range just does not reach it — an empty state would be a lie.
            <Text style={styles.footnote}>Nothing weighed in this range.</Text>
          ) : (
            <EmptyState
              title="The scales are untouched"
              body="Weigh in at the same time each day — the trend line does the rest."
              action={
                <Button label="Step on the scales" onPress={() => router.push('/weight/log')} />
              }
            />
          )
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  /**
   * No `gap`, unlike The Forge's card list: these rows are ruled against each other by the
   * separator, and a gap either side of a hairline is a hairline floating in space.
   */
  list: { padding: layout.screenPadding },
  header: { gap: layout.sectionGap, marginBottom: layout.sectionGap },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  legendSwatch: { width: 14, height: 3, borderRadius: 2, borderWidth: 0 },
  legendSwatchDashed: { borderWidth: 1.5 },
  legendLabel: { color: colors.textMuted, fontSize: fontSize.xs, lineHeight: lineHeight.xs },
  ranges: { flexDirection: 'row', gap: spacing.sm },
  rangeChip: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: layout.rowPadding,
  },
  rowPressed: { opacity: 0.7 },
  rowMain: { flex: 1, gap: 2 },
  rowDate: { color: colors.text, fontSize: fontSize.md, lineHeight: lineHeight.md },
  rowNote: { color: colors.textMuted, fontSize: fontSize.xs, lineHeight: lineHeight.xs },
  rowRight: { alignItems: 'flex-end', gap: 2 },
  rowWeight: {
    color: colors.text,
    fontSize: fontSize.md,
    lineHeight: lineHeight.md,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  rowChange: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    fontVariant: ['tabular-nums'],
  },
  down: { color: colors.success },
  up: { color: colors.danger },
  footnote: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    textAlign: 'center',
    paddingTop: layout.sectionGap,
  },
});
