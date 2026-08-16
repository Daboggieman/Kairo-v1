/**
 * Today — the tasks module's root screen.
 *
 * `04-feature-specs.md` asks for a *"Today list (checkbox-style)"*, so the screen is a list of
 * tick boxes and nothing else: no calendar, no drag-to-reorder, no per-task settings inline. The
 * order comes from `splitByDueToday`, which puts unfinished work above finished and the longest
 * streak first, so the list shrinks towards the top as the day goes on.
 *
 * Tasks whose rule excludes today still appear, below a divider, greyed. Hiding them entirely
 * would make a weekends-only habit vanish for five days at a stretch and read as data loss —
 * the same reason `parseRecurrence` falls back to `daily` rather than "never".
 *
 * A `ScrollView` rather than a `FlatList`/`SectionList`: this list is bounded by how many habits
 * a person can actually keep, which is dozens, and three plain sections are far easier to read
 * than the equivalent section-list plumbing. The workouts history uses a `FlatList` because a
 * session log genuinely grows without limit.
 */

import { randomUUID } from 'expo-crypto';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Checkbox } from '@/components/Checkbox';
import { completionDatesByTask, listArchivedTasks, listTasks, toggleCompletion } from '@/db/tasks';
import type { Task } from '@/db/types';
import { dayKeyFromDate } from '@/domain/dates';
import {
  describeRecurrence,
  formatProgress,
  formatStreak,
  splitByDueToday,
  type TodayTask,
} from '@/domain/tasks';
import { LOCAL_USER_ID } from '@/constants';
import { colors, fontSize, radius, spacing, TAP_TARGET } from '@/theme';
import { requestSync } from '@/sync/scheduler';

function formatToday(nowMs: number): string {
  return new Date(nowMs).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export default function TodayScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [archived, setArchived] = useState<Task[]>([]);
  const [completions, setCompletions] = useState<Map<string, string[]>>(new Map());
  const [loading, setLoading] = useState(true);
  /**
   * The clock everything is measured against, captured when the data loads rather than read
   * during render — `Date.now()` in a render body is impure, and here it would decide which day
   * the whole list is about. Same reasoning as the weight screen; `useNow` is the wrong tool
   * because a day boundary is not a per-second event.
   */
  const [nowMs, setNowMs] = useState(() => Date.now());

  const load = useCallback(async () => {
    const [active, archivedRows, byTask] = await Promise.all([
      listTasks(db, LOCAL_USER_ID),
      listArchivedTasks(db, LOCAL_USER_ID),
      completionDatesByTask(db, LOCAL_USER_ID),
    ]);
    setTasks(active);
    setArchived(archivedRows);
    setCompletions(byTask);
    // Refreshed alongside the rows so the list and the data always describe the same day, even
    // if the app sat open across midnight.
    setNowMs(Date.now());
    setLoading(false);
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        if (!cancelled) await load();
      })();
      return () => {
        cancelled = true;
      };
    }, [load]),
  );

  const onToggle = useCallback(
    async (task: Task) => {
      // The day is taken from the wall clock, not from `nowMs`: ticking a box has to record the
      // day it actually happened on. `load()` then pulls `nowMs` forward to match.
      const now = new Date();
      await toggleCompletion(db, {
        id: randomUUID(),
        taskId: task.id,
        completedDate: dayKeyFromDate(now),
        completedAt: now.toISOString(),
      });
      void requestSync(db).catch(() => {});
      await load();
    },
    [db, load],
  );

  const { due, notToday } = splitByDueToday(tasks, completions, nowMs);
  const doneCount = due.filter((entry) => entry.streak.doneToday).length;

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: spacing.xl }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.date}>{formatToday(nowMs)}</Text>
          <Text style={styles.progress}>{formatProgress(doneCount, due.length)}</Text>
        </View>

        {due.map((entry) => (
          <TaskRow
            key={entry.task.id}
            entry={entry}
            onToggle={() => onToggle(entry.task)}
            onOpen={() => router.push(`/tasks/${entry.task.id}`)}
          />
        ))}

        {notToday.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Not scheduled today</Text>
            {notToday.map((entry) => (
              <TaskRow
                key={entry.task.id}
                entry={entry}
                muted
                onToggle={() => onToggle(entry.task)}
                onOpen={() => router.push(`/tasks/${entry.task.id}`)}
              />
            ))}
          </>
        ) : null}

        {archived.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Archived</Text>
            {archived.map((task) => (
              <Pressable
                key={task.id}
                onPress={() => router.push(`/tasks/${task.id}`)}
                style={({ pressed }) => [styles.archivedRow, pressed && styles.pressed]}
              >
                <Text style={styles.archivedTitle} numberOfLines={1}>
                  {task.title}
                </Text>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            ))}
          </>
        ) : null}

        {tasks.length === 0 && archived.length === 0 && !loading ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No habits yet</Text>
            <Text style={styles.emptyBody}>
              Start with one you can keep. A streak is easier to protect than to rebuild.
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button label="New task" onPress={() => router.push('/tasks/new')} />
      </View>
    </View>
  );
}

/**
 * One tick box.
 *
 * The row is the tap target and the streak badge on the right is a second, nested one that opens
 * the detail screen — a 26px box would be a miserable thing to hit mid-morning, and the two
 * actions (tick it / look at it) are too different to share one gesture.
 */
function TaskRow({
  entry,
  muted = false,
  onToggle,
  onOpen,
}: {
  entry: TodayTask;
  muted?: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const { task, recurrence, streak } = entry;
  const badge = formatStreak(streak.current);

  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: streak.doneToday }}
      accessibilityLabel={task.title}
      accessibilityHint={streak.doneToday ? 'Marks this undone for today' : 'Marks this done for today'}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Checkbox checked={streak.doneToday} highlighted={streak.atRisk} />

      <View style={styles.rowMain}>
        <Text
          style={[styles.rowTitle, muted && styles.rowTitleMuted, streak.doneToday && styles.rowTitleDone]}
          numberOfLines={1}
        >
          {task.title}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {describeRecurrence(recurrence)}
        </Text>
      </View>

      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${task.title} streak`}
        hitSlop={spacing.sm}
        style={({ pressed }) => [styles.badgeArea, pressed && styles.pressed]}
      >
        {badge === '' ? null : (
          <View style={[styles.badge, streak.atRisk && styles.badgeAtRisk]}>
            <Text style={[styles.badgeText, streak.atRisk && styles.badgeTextAtRisk]}>{badge}</Text>
          </View>
        )}
        <Text style={styles.chevron}>›</Text>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg },
  header: { marginBottom: spacing.lg },
  date: { color: colors.text, fontSize: fontSize.lg, fontWeight: '700' },
  progress: { color: colors.textMuted, fontSize: fontSize.sm, marginTop: spacing.xs },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: TAP_TARGET,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowMain: { flex: 1 },
  rowTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: '600' },
  rowTitleMuted: { color: colors.textMuted },
  rowTitleDone: { color: colors.textMuted, textDecorationLine: 'line-through' },
  rowMeta: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },
  badgeArea: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingLeft: spacing.sm },
  badge: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  badgeAtRisk: { backgroundColor: colors.accent },
  badgeText: { color: colors.textMuted, fontSize: fontSize.xs, fontWeight: '700' },
  badgeTextAtRisk: { color: colors.accentText },
  chevron: { color: colors.textMuted, fontSize: fontSize.lg },
  archivedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: TAP_TARGET,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  archivedTitle: { color: colors.textMuted, fontSize: fontSize.md, flex: 1 },
  pressed: { opacity: 0.7 },
  empty: { alignItems: 'center', paddingTop: spacing.xxl },
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
