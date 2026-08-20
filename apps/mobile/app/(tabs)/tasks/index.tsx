/**
 * The Rites — the tasks module's root screen.
 *
 * `04-feature-specs.md` asks for a *"Today list (checkbox-style)"*, so the screen is a list of
 * tick boxes and nothing else: no calendar, no drag-to-reorder, no per-task settings inline. The
 * order comes from `splitByDueToday`, which puts unfinished work above finished and the longest
 * streak first, so the list shrinks towards the top as the day goes on.
 *
 * Rites whose rule excludes today still appear, in their own dimmed group. Hiding them entirely
 * would make a weekends-only habit vanish for five days at a stretch and read as data loss —
 * the same reason `parseRecurrence` falls back to `daily` rather than "never".
 *
 * A `ScrollView` rather than a `FlatList`/`SectionList`: this list is bounded by how many habits
 * a person can actually keep, which is dozens, and three plain groups are far easier to read
 * than the equivalent section-list plumbing. The workouts history uses a `FlatList` because a
 * session log genuinely grows without limit.
 *
 * The design's footer button is gone: the add affordance is the outlined glyph in the header, which
 * is where every other tab root in the design set puts its one action, and a permanently-docked
 * 56pt slab above a 80pt tab bar was eating a fifth of the screen.
 */

import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { randomUUID } from 'expo-crypto';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Checkbox } from '@/components/Checkbox';
import {
  Card,
  EmptyState,
  Eyebrow,
  IconButton,
  Notice,
  Pill,
  RowGroup,
  ScreenHeader,
  ScreenScroll,
  Section,
  StatStrip,
} from '@/components/Layout';
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
import { colors, fontSize, layout, lineHeight, spacing, TAP_TARGET } from '@/theme';
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

  const [tasks, setTasks] = useState<Task[]>([]);
  const [archived, setArchived] = useState<Task[]>([]);
  const [completions, setCompletions] = useState<Map<string, string[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Whether the archived group is expanded. Collapsed by default — it is history, not today. */
  const [showArchived, setShowArchived] = useState(false);
  /**
   * The clock everything is measured against, captured when the data loads rather than read
   * during render — `Date.now()` in a render body is impure, and here it would decide which day
   * the whole list is about. Same reasoning as the weight screen; `useNow` is the wrong tool
   * because a day boundary is not a per-second event.
   */
  const [nowMs, setNowMs] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const [active, archivedRows, byTask] = await Promise.all([
        listTasks(db, LOCAL_USER_ID),
        listArchivedTasks(db, LOCAL_USER_ID),
        completionDatesByTask(db, LOCAL_USER_ID),
      ]);
      setTasks(active);
      setArchived(archivedRows);
      setCompletions(byTask);
      setError(null);
      // Refreshed alongside the rows so the list and the data always describe the same day, even
      // if the app sat open across midnight.
      setNowMs(Date.now());
    } catch (caught) {
      // Without this the rejection was unhandled and the screen sat empty with no explanation.
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
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
  const atRiskCount = due.filter((entry) => entry.streak.atRisk).length;
  const bestFlame = Math.max(0, ...[...due, ...notToday].map((entry) => entry.streak.longest));

  return (
    <ScreenScroll>
      <ScreenHeader
        title="The Rites"
        subtitle={`${formatToday(nowMs)} · ${formatProgress(doneCount, due.length)}`}
        action={
          <IconButton
            icon="plus"
            label="New rite"
            variant="outlined"
            onPress={() => router.push('/tasks/new')}
          />
        }
      />

      {error ? (
        <Notice tone="danger" title="Could not read your rites">
          {error}
        </Notice>
      ) : null}

      {/*
        The strip is only honest once there is something to aggregate — three zeroes above an empty
        list is chrome describing nothing.
      */}
      {tasks.length > 0 ? (
        <StatStrip
          items={[
            { label: 'Kept', value: `${doneCount}/${due.length}` },
            { label: 'Day best flame', value: `${bestFlame}` },
            {
              label: 'Guttering',
              value: `${atRiskCount}`,
              tone: atRiskCount > 0 ? 'danger' : 'text',
            },
          ]}
        />
      ) : null}

      {due.length > 0 ? (
        <Section title="Due today">
          <RowGroup>
            {due.map((entry) => (
              <TaskRow
                key={entry.task.id}
                entry={entry}
                onToggle={() => onToggle(entry.task)}
                onOpen={() => router.push(`/tasks/${entry.task.id}`)}
              />
            ))}
          </RowGroup>
        </Section>
      ) : null}

      {notToday.length > 0 ? (
        <Section title="Not due today">
          {/*
            The whole group dims rather than each row: the rows inside it are ruled, and fading one
            row at a time makes the rules look like they moved.
          */}
          <RowGroup style={styles.dimmed}>
            {notToday.map((entry) => (
              <TaskRow
                key={entry.task.id}
                entry={entry}
                onToggle={() => onToggle(entry.task)}
                onOpen={() => router.push(`/tasks/${entry.task.id}`)}
              />
            ))}
          </RowGroup>
        </Section>
      ) : null}

      {archived.length > 0 ? (
        <View style={styles.archivedGroup}>
          <Pressable
            onPress={() => setShowArchived((open) => !open)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showArchived }}
            accessibilityLabel={`Archived rites, ${archived.length}`}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <Card style={styles.expander}>
              <Eyebrow>{`Archived rites (${archived.length})`}</Eyebrow>
              <MaterialCommunityIcons
                name={showArchived ? 'chevron-up' : 'chevron-down'}
                size={20}
                color={colors.textMuted}
              />
            </Card>
          </Pressable>

          {showArchived ? (
            <RowGroup style={styles.dimmed}>
              {archived.map((task) => (
                <Pressable
                  key={task.id}
                  onPress={() => router.push(`/tasks/${task.id}`)}
                  accessibilityRole="button"
                  accessibilityLabel={task.title}
                  style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                >
                  <Text style={styles.archivedTitle} numberOfLines={1}>
                    {task.title}
                  </Text>
                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={20}
                    color={colors.textMuted}
                  />
                </Pressable>
              ))}
            </RowGroup>
          ) : null}
        </View>
      ) : null}

      {tasks.length === 0 && archived.length === 0 && !loading && !error ? (
        <EmptyState
          title="No rites yet"
          body="Start with one you can keep. A flame is easier to protect than to rekindle."
          action={<Button label="Swear a rite" onPress={() => router.push('/tasks/new')} />}
        />
      ) : null}
    </ScreenScroll>
  );
}

/**
 * One tick box.
 *
 * The row is the tap target and the flame pill on the right is a second, nested one that opens The
 * Flame — a 28px box would be a miserable thing to hit mid-morning, and the two actions (keep it /
 * look at it) are too different to share one gesture. The design offers no route to the detail
 * screen at all, which would strand it; the chevron is what says the pill is a door.
 *
 * The design also repeats the streak in the meta line ("Every day · flame 14") *and* in the pill.
 * The meta here carries the cadence only — the same number printed twice on one row is noise, and
 * the pill is the more legible of the two places to read it.
 */
function TaskRow({
  entry,
  onToggle,
  onOpen,
}: {
  entry: TodayTask;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const { task, recurrence, streak } = entry;
  const flame = formatStreak(streak.current);

  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: streak.doneToday }}
      accessibilityLabel={task.title}
      accessibilityHint={streak.doneToday ? 'Marks this unkept for today' : 'Marks this kept for today'}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <Checkbox checked={streak.doneToday} highlighted={streak.atRisk} />

      <View style={styles.rowMain}>
        <Text
          style={[styles.rowTitle, streak.doneToday && styles.rowTitleDone]}
          numberOfLines={1}
        >
          {task.title}
        </Text>
        <Text
          style={[styles.rowMeta, streak.atRisk && styles.rowMetaAtRisk]}
          numberOfLines={1}
        >
          {describeRecurrence(recurrence)}
        </Text>
      </View>

      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${task.title} flame`}
        hitSlop={spacing.sm}
        style={({ pressed }) => [styles.flameArea, pressed && styles.pressed]}
      >
        {flame === '' ? null : (
          <Pill label={flame} icon="fire" tone={streak.atRisk ? 'danger' : 'accent'} />
        )}
        <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textMuted} />
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  dimmed: { opacity: 0.7 },
  archivedGroup: { gap: layout.cardGap },
  expander: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    minHeight: TAP_TARGET,
    paddingHorizontal: layout.cardPadding,
    paddingVertical: spacing.md,
  },
  rowPressed: { backgroundColor: colors.surfaceRaised },
  rowMain: { flex: 1, gap: 2 },
  rowTitle: { color: colors.text, fontSize: fontSize.md, lineHeight: lineHeight.md },
  rowTitleDone: { color: colors.textMuted, textDecorationLine: 'line-through' },
  rowMeta: { color: colors.textMuted, fontSize: fontSize.xs, lineHeight: lineHeight.xs },
  rowMetaAtRisk: { color: colors.danger },
  flameArea: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  archivedTitle: { flex: 1, color: colors.textMuted, fontSize: fontSize.md, lineHeight: lineHeight.md },
  pressed: { opacity: 0.7 },
});
