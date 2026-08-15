/**
 * Streak view for one task — the second screen `04-feature-specs.md` asks for.
 *
 * Three readings of the same history, because a streak alone is a brittle thing to be judged on:
 * the current run, the best run ever, and the last 30 scheduled days as a rate. A user who kept
 * 27 of 30 days but missed yesterday has a current streak of 1, and only the other two numbers
 * say that they are doing well.
 *
 * The grid below them is week-aligned (`historyGrid`), so the recurrence rule is legible as a
 * shape — a weekdays habit shows two faint columns down the right-hand side.
 */

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { Button } from '@/components/Button';
import { deleteTask, getTask, listCompletionDates, setArchived } from '@/db/tasks';
import type { Task } from '@/db/types';
import { todayNumber, WEEKDAY_LABELS } from '@/domain/dates';
import {
  anchorDayOf,
  completionDaySet,
  completionRate,
  describeRecurrence,
  historyGrid,
  parseRecurrence,
  summariseTask,
  type HistoryState,
} from '@/domain/tasks';
import { colors, fontSize, radius, spacing } from '@/theme';
import { requestSync } from '@/sync/scheduler';

/** Two months of history — enough to see a pattern, few enough rows to fit without scrolling. */
const HISTORY_WEEKS = 8;

/** The rate window. Trailing 30 days is the span people think in. */
const RATE_WINDOW_DAYS = 30;

export default function TaskStreakScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { taskId } = useLocalSearchParams<{ taskId: string }>();

  const [task, setTask] = useState<Task | null>(null);
  const [dates, setDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [nowMs] = useState(() => Date.now());

  /** Returns rather than sets, so the caller can drop the result if the screen has gone away. */
  const load = useCallback(async () => {
    const [row, completionDates] = await Promise.all([
      getTask(db, taskId),
      listCompletionDates(db, taskId),
    ]);
    return { row, completionDates };
  }, [db, taskId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // A one-shot load rather than a focus effect: this screen is pushed fresh each time, so
      // there is no stale state for refocusing to fix. `onArchive` reloads explicitly.
      const { row, completionDates } = await load();
      if (cancelled) return;
      setTask(row);
      setDates(completionDates);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const onArchive = useCallback(async () => {
    if (!task) return;
    await setArchived(db, task.id, !task.archived);
    void requestSync(db).catch(() => {});
    const { row, completionDates } = await load();
    setTask(row);
    setDates(completionDates);
  }, [db, load, task]);

  const onDelete = useCallback(() => {
    if (!task) return;
    Alert.alert(
      'Delete task',
      `Remove "${task.title}" and its ${dates.length} completed ${dates.length === 1 ? 'day' : 'days'}? Archiving keeps the history.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteTask(db, task.id);
            void requestSync(db).catch(() => {});
            router.back();
          },
        },
      ],
    );
  }, [dates.length, db, router, task]);

  if (!task) {
    return (
      <View style={styles.screen}>
        {loading ? null : (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Task not found</Text>
            <Text style={styles.emptyBody}>It may have been deleted on another screen.</Text>
          </View>
        )}
      </View>
    );
  }

  const recurrence = parseRecurrence(task.recurrenceRule);
  const anchorDay = anchorDayOf(task);
  const completedDays = completionDaySet(dates);
  const todayDay = todayNumber(nowMs);
  const summary = summariseTask(task, dates, nowMs);
  const rate = completionRate(recurrence, anchorDay, completedDays, todayDay, RATE_WINDOW_DAYS);
  const grid = historyGrid(recurrence, anchorDay, completedDays, todayDay, HISTORY_WEEKS);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View>
        <Text style={styles.title}>{task.title}</Text>
        <Text style={styles.subtitle}>
          {describeRecurrence(recurrence)}
          {task.archived ? ' · archived' : ''}
        </Text>
      </View>

      <View style={styles.statRow}>
        <Stat label="Current" value={`${summary.current}`} unit="days" emphasis />
        <Stat label="Longest" value={`${summary.longest}`} unit="days" />
        <Stat
          label={`Last ${RATE_WINDOW_DAYS} days`}
          value={rate.scheduled === 0 ? '—' : `${Math.round((rate.completed / rate.scheduled) * 100)}%`}
          unit={rate.scheduled === 0 ? '' : `${rate.completed} of ${rate.scheduled}`}
        />
      </View>

      {summary.atRisk ? (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            Due today. Tick it off to keep the {summary.current}-day run.
          </Text>
        </View>
      ) : null}

      <View>
        <Text style={styles.sectionTitle}>Last {HISTORY_WEEKS} weeks</Text>
        <View style={styles.gridHeader}>
          {WEEKDAY_LABELS.map((label) => (
            <Text key={label} style={styles.gridHeaderLabel}>
              {label.slice(0, 1)}
            </Text>
          ))}
        </View>
        {grid.map((week) => (
          <View key={week[0].day} style={styles.gridRow}>
            {week.map((cell) => (
              <View key={cell.day} style={[styles.cell, cellStyles[cell.state]]} />
            ))}
          </View>
        ))}
        <View style={styles.legend}>
          <LegendKey state="done" label="Done" />
          <LegendKey state="missed" label="Missed" />
          <LegendKey state="unscheduled" label="Not due" />
        </View>
      </View>

      <View>
        <Text style={styles.sectionTitle}>Totals</Text>
        <Row label="Completed days" value={`${summary.totalCompletions}`} />
        <Row label="Last completed" value={summary.lastCompletedDate ?? 'Never'} />
        <Row label="Started" value={task.createdAt.slice(0, 10)} />
      </View>

      <View style={styles.actions}>
        <Button
          label={task.archived ? 'Restore task' : 'Archive task'}
          variant="secondary"
          onPress={onArchive}
        />
        <Button label="Delete task" variant="danger" onPress={onDelete} />
      </View>
    </ScrollView>
  );
}

function Stat({
  label,
  value,
  unit,
  emphasis = false,
}: {
  label: string;
  value: string;
  unit: string;
  emphasis?: boolean;
}) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, emphasis && styles.statValueEmphasis]}>{value}</Text>
      {unit === '' ? null : <Text style={styles.statUnit}>{unit}</Text>}
    </View>
  );
}

function LegendKey({ state, label }: { state: HistoryState; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendSwatch, cellStyles[state]]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

/**
 * One style per `HistoryState`, keyed so a new state cannot be added to the domain type without
 * TypeScript demanding a colour for it here.
 */
const cellStyles: Record<HistoryState, ViewStyle> = StyleSheet.create({
  done: { backgroundColor: colors.accent, borderColor: colors.accent },
  missed: { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
  pending: { backgroundColor: 'transparent', borderColor: colors.accent },
  unscheduled: { backgroundColor: colors.surface, borderColor: colors.surface },
  future: { backgroundColor: 'transparent', borderColor: 'transparent' },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.xl },
  title: { color: colors.text, fontSize: fontSize.lg, fontWeight: '700' },
  subtitle: { color: colors.textMuted, fontSize: fontSize.sm, marginTop: spacing.xs },
  statRow: { flexDirection: 'row', gap: spacing.md },
  stat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  statValue: { color: colors.text, fontSize: fontSize.xl, fontWeight: '700', marginTop: spacing.xs },
  statValueEmphasis: { color: colors.accent },
  statUnit: { color: colors.textMuted, fontSize: fontSize.xs },
  notice: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    padding: spacing.md,
  },
  noticeText: { color: colors.text, fontSize: fontSize.sm },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  gridHeader: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.xs },
  gridHeaderLabel: {
    flex: 1,
    color: colors.textMuted,
    fontSize: fontSize.xs,
    textAlign: 'center',
  },
  gridRow: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.xs },
  cell: { flex: 1, aspectRatio: 1, borderRadius: radius.sm, borderWidth: 1 },
  legend: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  legendSwatch: { width: 12, height: 12, borderRadius: radius.sm, borderWidth: 1 },
  legendLabel: { color: colors.textMuted, fontSize: fontSize.xs },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoLabel: { color: colors.textMuted, fontSize: fontSize.sm },
  infoValue: { color: colors.text, fontSize: fontSize.sm, fontWeight: '600' },
  actions: { gap: spacing.md },
  empty: { alignItems: 'center', paddingTop: spacing.xxl, paddingHorizontal: spacing.lg },
  emptyTitle: { color: colors.text, fontSize: fontSize.lg, fontWeight: '600' },
  emptyBody: { color: colors.textMuted, fontSize: fontSize.sm, marginTop: spacing.sm },
});
