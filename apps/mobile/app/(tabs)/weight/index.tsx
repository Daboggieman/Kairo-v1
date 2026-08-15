/**
 * Weight trend — the module's root screen.
 *
 * `04-feature-specs.md`: *"trend, not noise — daily weight fluctuates, the chart should
 * smooth it."* So the smoothed 7-day line is the visual emphasis (accent, thick), the raw
 * daily readings sit behind it in muted grey, and the big number in the header is the
 * *trend* value rather than the last thing the scale said.
 *
 * Reloads on focus rather than on mount, like the workouts history screen: logging a weight
 * dismisses the modal back to here, and a mount-only effect would show a chart missing the
 * entry just added.
 */

import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { LineChart } from '@/components/LineChart';
import { getGoalWeightKg } from '@/db/preferences';
import type { BodyWeightEntry } from '@/db/types';
import { deleteEntry, listEntriesAscending } from '@/db/weight';
import type { DataPoint } from '@/domain/chart';
import {
  dailyWeights,
  displayUnit,
  formatDelta,
  goalDelta,
  movingAverage,
  summarise,
  toDisplayWeight,
  TREND_WINDOW_DAYS,
  withinDays,
} from '@/domain/weight';
import { LOCAL_USER_ID } from '@/constants';
import { colors, fontSize, radius, spacing } from '@/theme';
import { requestSync } from '@/sync/scheduler';

/** How much history the chart shows. Long enough for a trend, short enough to read. */
const CHART_DAYS = 90;

function formatEntryDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export default function WeightTrendScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [entries, setEntries] = useState<BodyWeightEntry[]>([]);
  const [goalKg, setGoalKg] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  /**
   * The clock the date windows are measured against, captured when the data loads rather
   * than read during render (`Date.now()` in a render body is impure — React may re-render
   * at any moment and the window would shift underneath the chart). `useNow` is the wrong
   * tool here: it re-renders every second, and a 90-day chart does not change at that rate.
   * Refocusing the screen reloads both together, which is the only moment the window can
   * meaningfully move.
   */
  const [nowMs, setNowMs] = useState(() => Date.now());

  const load = useCallback(async () => {
    const [rows, goal] = await Promise.all([
      listEntriesAscending(db, LOCAL_USER_ID),
      getGoalWeightKg(db, LOCAL_USER_ID),
    ]);
    return { rows, goal };
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const { rows, goal } = await load();
        if (cancelled) return;
        setEntries(rows);
        setGoalKg(goal);
        setNowMs(Date.now());
        setLoading(false);
      })();
      return () => {
        cancelled = true;
      };
    }, [load]),
  );

  const onDelete = useCallback(
    (entry: BodyWeightEntry) => {
      Alert.alert('Delete entry', `Remove the ${formatEntryDate(entry.recordedAt)} weigh-in?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteEntry(db, entry.id);
            void requestSync(db).catch(() => {});
            const { rows, goal } = await load();
            setEntries(rows);
            setGoalKg(goal);
          },
        },
      ]);
    },
    [db, load],
  );

  const unit = displayUnit(entries);
  const daily = dailyWeights(entries);
  // Smoothed across the full history, then windowed — so the leftmost visible point carries
  // a complete 7-day window instead of restarting from a partial one at the range edge.
  const trend = movingAverage(daily, TREND_WINDOW_DAYS);
  const summary = summarise(daily, trend, nowMs);

  const visibleDaily = withinDays(daily, nowMs, CHART_DAYS);
  const visibleTrend = withinDays(trend, nowMs, CHART_DAYS);

  // The chart is unit-agnostic; converting here means the axis labels, the goal line and the
  // header all read in the same unit without the chart knowing what a kilogram is.
  const rawPoints: DataPoint[] = visibleDaily.map((point) => ({
    x: point.day,
    y: toDisplayWeight(point.weightKg, unit),
  }));
  const trendPoints: DataPoint[] = visibleTrend.map((point) => ({
    x: point.day,
    y: toDisplayWeight(point.value, unit),
  }));

  const toGoal = goalDelta(summary.trendKg, goalKg);

  const header = (
    <View style={styles.header}>
      <View style={styles.statRow}>
        <View>
          <Text style={styles.statLabel}>Trend</Text>
          <Text style={styles.statValue}>
            {summary.trendKg === null ? '—' : `${toDisplayWeight(summary.trendKg, unit)}${unit}`}
          </Text>
        </View>
        <View style={styles.statRight}>
          <Text style={styles.statLabel}>30-day change</Text>
          <Text
            style={[
              styles.statChange,
              summary.changeKg !== null && summary.changeKg < 0 && styles.statChangeDown,
            ]}
          >
            {formatDelta(summary.changeKg, unit)}
          </Text>
        </View>
      </View>

      <LineChart
        points={rawPoints}
        trend={trendPoints}
        goal={goalKg === null ? null : toDisplayWeight(goalKg, unit)}
        formatValue={(value) => `${Math.round(value)}`}
        emptyLabel={loading ? '' : 'Log your first weigh-in'}
      />

      <View style={styles.legend}>
        <LegendSwatch color={colors.accent} label={`${TREND_WINDOW_DAYS}-day trend`} />
        <LegendSwatch color={colors.textMuted} label="Daily" />
        {goalKg !== null ? <LegendSwatch color={colors.success} label="Goal" dashed /> : null}
      </View>

      <Pressable
        style={({ pressed }) => [styles.goalCard, pressed && styles.pressed]}
        onPress={() => router.push('/weight/goal')}
      >
        <Text style={styles.goalLabel}>{goalKg === null ? 'Goal weight' : 'To goal'}</Text>
        <Text style={styles.goalValue}>
          {goalKg === null
            ? 'Set a target'
            : toGoal === null
              ? `${toDisplayWeight(goalKg, unit)}${unit}`
              : `${formatDelta(toGoal, unit)} · target ${toDisplayWeight(goalKg, unit)}${unit}`}
        </Text>
      </Pressable>

      {daily.length > 0 ? (
        <Text style={styles.sectionTitle}>
          History · {summary.daysLogged} {summary.daysLogged === 1 ? 'day' : 'days'} this month
        </Text>
      ) : null}
    </View>
  );

  return (
    <View style={styles.screen}>
      <FlatList
        // Newest first for reading, while the chart above works in chart order.
        data={[...entries].reverse()}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={header}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Pressable
            onLongPress={() => onDelete(item)}
            accessibilityHint="Long press to delete this entry"
            style={({ pressed }) => [styles.entryRow, pressed && styles.pressed]}
          >
            <View style={styles.entryMain}>
              <Text style={styles.entryDate}>{formatEntryDate(item.recordedAt)}</Text>
              {item.note ? (
                <Text style={styles.entryNote} numberOfLines={1}>
                  {item.note}
                </Text>
              ) : null}
            </View>
            <Text style={styles.entryWeight}>
              {item.weight}
              {item.weightUnit}
            </Text>
          </Pressable>
        )}
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Nothing logged yet</Text>
              <Text style={styles.emptyBody}>
                Weigh in at the same time each day — the trend line does the rest.
              </Text>
            </View>
          )
        }
      />

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button label="Log weight" onPress={() => router.push('/weight/log')} />
      </View>
    </View>
  );
}

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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, gap: spacing.sm },
  header: { gap: spacing.lg, marginBottom: spacing.md },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  statRight: { alignItems: 'flex-end' },
  statLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  statValue: { color: colors.text, fontSize: fontSize.xl, fontWeight: '700' },
  statChange: { color: colors.text, fontSize: fontSize.lg, fontWeight: '600' },
  statChangeDown: { color: colors.success },
  legend: { flexDirection: 'row', gap: spacing.lg, justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  legendSwatch: { width: 14, height: 3, borderRadius: 2, borderWidth: 0 },
  legendSwatchDashed: { borderWidth: 1.5 },
  legendLabel: { color: colors.textMuted, fontSize: fontSize.xs },
  goalCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  goalLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  goalValue: { color: colors.text, fontSize: fontSize.md, fontWeight: '600', marginTop: spacing.xs },
  pressed: { opacity: 0.7 },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  entryMain: { flex: 1 },
  entryDate: { color: colors.text, fontSize: fontSize.md },
  entryNote: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: spacing.xs },
  entryWeight: { color: colors.accent, fontSize: fontSize.md, fontWeight: '700' },
  empty: { alignItems: 'center', paddingTop: spacing.xl },
  emptyTitle: { color: colors.text, fontSize: fontSize.lg, fontWeight: '600' },
  emptyBody: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
});
