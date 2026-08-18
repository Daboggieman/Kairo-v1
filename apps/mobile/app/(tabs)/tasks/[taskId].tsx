/**
 * The Flame — one rite's history.
 *
 * Three readings of the same record, because a streak alone is a brittle thing to be judged on:
 * the current run, the best run ever, and the last 30 scheduled days as a rate. A user who kept
 * 27 of 30 days but missed yesterday has a current streak of 1, and only the other two numbers
 * say that they are doing well. The rate carries a bar under its own cell so the figure and the
 * proportion are read together.
 *
 * The grid below them is week-aligned (`historyGrid`), so the recurrence rule is legible as a
 * shape — a weekdays habit shows two faint rows along the bottom. The design lays it out as weeks
 * across and days down, which is the orientation used here; its day labels start on Monday, and
 * these start on Sunday because `dayOfWeek` is `getDay()` order and re-basing a tested grid to make
 * a label column match is the wrong trade.
 */

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import {
  AppBar,
  Card,
  EmptyState,
  Eyebrow,
  Meander,
  Notice,
  RowGroup,
  Screen,
  Section,
  StatStrip,
} from '@/components/Layout';
import { deleteTask, getTask, listCompletionDates, setArchived } from '@/db/tasks';
import type { Task } from '@/db/types';
import { dayKeyFromDate, todayNumber, WEEKDAY_LABELS } from '@/domain/dates';
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
import { colors, fontSize, layout, lineHeight, spacing, type as typeScale } from '@/theme';
import { requestSync } from '@/sync/scheduler';

/**
 * A quarter of history — the span the design asks for ("the last ninety days"), rounded to whole
 * weeks because the grid is week-aligned and a ragged final column reads as missing data.
 */
const HISTORY_WEEKS = 13;

/** The rate window. Trailing 30 days is the span people think in. */
const RATE_WINDOW_DAYS = 30;

/** One heatmap cell. 14 points is the design's, and it is the smallest square still readable. */
const CELL = 14;

/** A day key as "Today" when it is, otherwise a short date. `null` for a rite never kept. */
function formatDayKey(dayKey: string | null, nowMs: number): string {
  if (dayKey === null) return 'Never';
  if (dayKey === dayKeyFromDate(new Date(nowMs))) return 'Today';
  // Parsed as local midnight rather than through `new Date('YYYY-MM-DD')`, which is UTC and lands
  // on the previous day for anyone west of Greenwich.
  return new Date(`${dayKey}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function TaskStreakScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { taskId } = useLocalSearchParams<{ taskId: string }>();

  const [task, setTask] = useState<Task | null>(null);
  const [dates, setDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
      try {
        // A one-shot load rather than a focus effect: this screen is pushed fresh each time, so
        // there is no stale state for refocusing to fix. `onArchive` reloads explicitly.
        const { row, completionDates } = await load();
        if (cancelled) return;
        setTask(row);
        setDates(completionDates);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        if (!cancelled) setLoading(false);
      }
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
      'Delete rite',
      `Remove "${task.title}" and its ${dates.length} kept ${dates.length === 1 ? 'day' : 'days'}? Archiving keeps the record.`,
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
      <Screen>
        <AppBar title="The Flame" onBack={() => router.back()} />
        {loading ? null : error ? (
          <View style={styles.notFound}>
            <Notice tone="danger" title="Could not read this rite">
              {error}
            </Notice>
          </View>
        ) : (
          <EmptyState
            title="Rite not found"
            body="It may have been deleted on another screen."
          />
        )}
      </Screen>
    );
  }

  const recurrence = parseRecurrence(task.recurrenceRule);
  const anchorDay = anchorDayOf(task);
  const completedDays = completionDaySet(dates);
  const todayDay = todayNumber(nowMs);
  const summary = summariseTask(task, dates, nowMs);
  const rate = completionRate(recurrence, anchorDay, completedDays, todayDay, RATE_WINDOW_DAYS);
  const grid = historyGrid(recurrence, anchorDay, completedDays, todayDay, HISTORY_WEEKS);
  const started = new Date(task.createdAt).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
  });

  return (
    <Screen>
      <AppBar title="The Flame" onBack={() => router.back()} />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + layout.scrollFooter },
        ]}
      >
        {/*
          The rite's own name is the hero, in the inscriptional face and centred — the one place in
          the app where user-entered text is set as display type.
        */}
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>{task.title}</Text>
          <Text style={styles.heroMeta}>
            {`${describeRecurrence(recurrence)} · started ${started}`.toUpperCase()}
            {task.archived ? ' · ARCHIVED' : ''}
          </Text>
          <Meander style={styles.heroOrnament} />
        </View>

        <StatStrip
          size="lg"
          items={[
            { label: 'Current', value: `${summary.current}`, tone: 'accent' },
            { label: 'Longest', value: `${summary.longest}` },
            {
              label: `Last ${RATE_WINDOW_DAYS} days`,
              value: rate.scheduled === 0 ? '—' : `${rate.completed}/${rate.scheduled}`,
              progress: rate.scheduled === 0 ? undefined : rate.completed / rate.scheduled,
            },
          ]}
        />

        {summary.atRisk ? (
          <Notice tone="accent">
            Due today. Keep it to hold the {summary.current}-day flame.
          </Notice>
        ) : null}

        <Section title={`The last ${HISTORY_WEEKS} weeks`}>
          <Card>
            {/*
              Horizontally scrollable because the cells are a fixed size: thirteen weeks fits on a
              modern phone and does not on a small one, and squares that shrink to fit stop being
              readable long before they stop being drawable.
            */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.heatmap}>
                <View style={styles.heatmapLabels}>
                  {WEEKDAY_LABELS.map((label) => (
                    <Text key={label} style={styles.heatmapLabel}>
                      {label.slice(0, 1)}
                    </Text>
                  ))}
                </View>
                {grid.map((week) => (
                  <View key={week[0].day} style={styles.heatmapWeek}>
                    {week.map((cell) => (
                      <View key={cell.day} style={[styles.cell, cellStyles[cell.state]]} />
                    ))}
                  </View>
                ))}
              </View>
            </ScrollView>

            <View style={styles.legend}>
              <LegendKey state="done" label="Kept" />
              <LegendKey state="missed" label="Missed" />
              <LegendKey state="pending" label="Today" />
              <LegendKey state="unscheduled" label="Not due" />
            </View>
          </Card>
        </Section>

        <Section title="The record">
          <RowGroup>
            <InfoRow label="Days kept" value={`${summary.totalCompletions}`} />
            <InfoRow label="Last kept" value={formatDayKey(summary.lastCompletedDate, nowMs)} />
          </RowGroup>
        </Section>

        <View style={styles.actions}>
          <Button
            label={task.archived ? 'Restore rite' : 'Archive rite'}
            variant="secondary"
            onPress={onArchive}
          />
          <Button label="Delete rite" variant="danger" onPress={onDelete} />
        </View>
      </ScrollView>
    </Screen>
  );
}

function LegendKey({ state, label }: { state: HistoryState; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendSwatch, cellStyles[state]]} />
      <Eyebrow>{label}</Eyebrow>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Eyebrow>{label}</Eyebrow>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

/**
 * One style per `HistoryState`, keyed so a new state cannot be added to the domain type without
 * TypeScript demanding a colour for it here.
 *
 * A missed day is tinted red rather than left as an empty square: the whole point of a quarter of
 * history is to see where it broke, and an unfilled square looks the same as a day off. `pending` is
 * dashed, which is the design's way of saying "today, still open".
 */
const cellStyles: Record<HistoryState, ViewStyle> = StyleSheet.create({
  done: { backgroundColor: colors.accent, borderColor: colors.accent },
  missed: { backgroundColor: colors.dangerSoft, borderColor: colors.danger },
  pending: { backgroundColor: colors.surfaceRaised, borderColor: colors.accent, borderStyle: 'dashed' },
  unscheduled: { backgroundColor: colors.surfaceRaised, borderColor: colors.surfaceRaised },
  future: { backgroundColor: 'transparent', borderColor: 'transparent' },
});

const styles = StyleSheet.create({
  content: { padding: layout.screenPadding, gap: layout.sectionGap },
  notFound: { padding: layout.screenPadding },
  hero: { alignItems: 'center', gap: spacing.sm },
  heroTitle: { color: colors.text, ...typeScale.displayMd, textAlign: 'center' },
  heroMeta: { color: colors.textMuted, ...typeScale.eyebrow, textAlign: 'center' },
  /** Three-quarter width and half strength: an ornament under a name, not a section break. */
  heroOrnament: { width: '75%', marginTop: spacing.sm, opacity: 0.5 },
  heatmap: { flexDirection: 'row', gap: spacing.md },
  heatmapLabels: { gap: spacing.xs },
  heatmapLabel: {
    height: CELL,
    width: 10,
    color: colors.textMuted,
    fontSize: 10,
    lineHeight: CELL,
    textAlign: 'center',
  },
  heatmapWeek: { gap: spacing.xs },
  /**
   * A literal 2 rather than `radius.sm`: at 14 points the smallest token in the scale (8) rounds a
   * square into a circle, and the grid is meant to read as inlaid tiles.
   */
  cell: { width: CELL, height: CELL, borderRadius: 2, borderWidth: 1 },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  legendSwatch: { width: 12, height: 12, borderRadius: 2, borderWidth: 1 },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    minHeight: 44,
    paddingHorizontal: layout.cardPadding,
    paddingVertical: spacing.md,
  },
  infoValue: { color: colors.text, fontSize: fontSize.sm, lineHeight: lineHeight.sm, fontWeight: '600' },
  actions: { gap: spacing.md },
});
