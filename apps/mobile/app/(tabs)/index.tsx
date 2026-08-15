/**
 * Home — the daily aggregate across the four local-first P0 modules.
 *
 * Home reads each module on focus in one load, so returning from a modal immediately updates
 * the dashboard and an app left open across midnight changes all four sections together.
 */

import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LOCAL_USER_ID } from '@/constants';
import {
  completionDatesByTask,
  listTasks,
} from '@/db/tasks';
import {
  getMacroTargetForDate,
  listNutritionEntriesForDate,
} from '@/db/macros';
import { activeSession, listSessions } from '@/db/workouts';
import { listEntriesAscending } from '@/db/weight';
import type { DashboardSummary } from '@/domain/dashboard';
import { buildDashboard } from '@/domain/dashboard';
import { dayKeyFromDate } from '@/domain/dates';
import { formatNutrition } from '@/domain/macros';
import { formatDuration } from '@/domain/workouts';
import { formatDelta, toDisplayWeight } from '@/domain/weight';
import { quoteForDate } from '@/domain/motivation';
import { colors, fontSize, radius, spacing } from '@/theme';

const MACRO_COLORS = {
  protein: colors.success,
  carbs: '#58A6FF',
  fat: '#D29922',
} as const;

function formatDate(nowMs: number): string {
  return new Date(nowMs).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function greeting(nowMs: number): string {
  const hour = new Date(nowMs).getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function HomeScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const quote = quoteForDate(new Date(nowMs));

  const load = useCallback(async () => {
    const capturedNow = Date.now();
    const date = dayKeyFromDate(new Date(capturedNow));
    const [tasks, completions, nutritionEntries, macroTarget, weights, sessions, active] =
      await Promise.all([
        listTasks(db, LOCAL_USER_ID),
        completionDatesByTask(db, LOCAL_USER_ID),
        listNutritionEntriesForDate(db, LOCAL_USER_ID, date),
        getMacroTargetForDate(db, LOCAL_USER_ID, date),
        listEntriesAscending(db, LOCAL_USER_ID),
        listSessions(db, 8),
        activeSession(db, LOCAL_USER_ID),
      ]);

    return {
      summary: buildDashboard({
        tasks,
        completionDatesByTask: completions,
        nutritionEntries,
        macroTarget,
        weightEntries: weights,
        sessions,
        activeSession: active,
        nowMs: capturedNow,
      }),
      capturedNow,
    };
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const result = await load();
        if (cancelled) return;
        setSummary(result.summary);
        setNowMs(result.capturedNow);
        setLoading(false);
      })();
      return () => {
        cancelled = true;
      };
    }, [load]),
  );

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
      >
        <View style={styles.header}>
          <Text style={styles.greeting}>{greeting(nowMs)}</Text>
          <Text style={styles.date}>{formatDate(nowMs)}</Text>
        </View>

        {loading || !summary ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : (
          <>
            <DashboardCard
              title="Today"
              onPress={() => router.push('/tasks')}
              action="Open"
            >
              <View style={styles.taskTopline}>
                <Text style={styles.primaryStat}>
                  {summary.tasks.due === 0 ? 'No tasks' : `${summary.tasks.done} / ${summary.tasks.due}`}
                </Text>
                <Text style={styles.statCaption}>
                  {summary.tasks.due === 0
                    ? 'scheduled'
                    : summary.tasks.remaining === 0
                      ? 'all done'
                      : 'completed'}
                </Text>
              </View>
              {summary.tasks.next.length > 0 ? (
                <View style={styles.previewList}>
                  {summary.tasks.next.map((entry) => (
                    <View key={entry.task.id} style={styles.previewRow}>
                      <View style={[styles.dot, entry.streak.atRisk && styles.dotRisk]} />
                      <Text style={styles.previewText} numberOfLines={1}>{entry.task.title}</Text>
                      {entry.streak.current > 0 ? (
                        <Text style={styles.previewMeta}>{entry.streak.current}d</Text>
                      ) : null}
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.mutedBody}>
                  {summary.tasks.due === 0 ? 'Rest day' : 'Nothing left to tick off'}
                </Text>
              )}
              {summary.tasks.atRisk > 0 ? (
                <Text style={styles.riskText}>
                  {summary.tasks.atRisk} {summary.tasks.atRisk === 1 ? 'streak' : 'streaks'} at risk
                </Text>
              ) : null}
            </DashboardCard>

            <DashboardCard
              title="Macros"
              onPress={() => router.push('/macros')}
              action="Open"
            >
              <View style={styles.macroHeadline}>
                <Text style={styles.primaryStat}>{formatNutrition(summary.macros.totals.calories, 'kcal')}</Text>
                <Text style={styles.statCaption}>
                  {summary.macros.calories.target === null
                    ? 'today'
                    : `of ${formatNutrition(summary.macros.calories.target, 'kcal')}`}
                </Text>
              </View>
              <View style={styles.macroList}>
                <MacroLine label="Protein" metric={summary.macros.protein} color={MACRO_COLORS.protein} />
                <MacroLine label="Carbs" metric={summary.macros.carbs} color={MACRO_COLORS.carbs} />
                <MacroLine label="Fat" metric={summary.macros.fat} color={MACRO_COLORS.fat} />
              </View>
            </DashboardCard>

            <DashboardCard
              title="Weight"
              onPress={() => router.push('/weight')}
              action="Open"
            >
              {summary.weight.trendKg === null ? (
                <Text style={styles.mutedBody}>No weigh-ins yet</Text>
              ) : (
                <View style={styles.weightRow}>
                  <View>
                    <Text style={styles.primaryStat}>
                      {toDisplayWeight(summary.weight.trendKg, summary.weight.unit)}{summary.weight.unit}
                    </Text>
                    <Text style={styles.statCaption}>7-day trend</Text>
                  </View>
                  <View style={styles.weightChange}>
                    <Text style={styles.statCaption}>30 days</Text>
                    <Text style={[
                      styles.changeValue,
                      summary.weight.changeKg !== null && summary.weight.changeKg < 0 && styles.changeDown,
                    ]}>
                      {formatDelta(summary.weight.changeKg, summary.weight.unit)}
                    </Text>
                  </View>
                </View>
              )}
            </DashboardCard>

            <DashboardCard
              title="Workout"
              onPress={() => router.push(summary.workout.active ? '/workouts/active' : '/workouts')}
              action={summary.workout.active ? 'Resume' : 'Open'}
            >
              {summary.workout.active ? (
                <View style={styles.workoutRow}>
                  <View style={styles.activeIndicator} />
                  <View style={styles.workoutMain}>
                    <Text style={styles.primaryStat}>In progress</Text>
                    <Text style={styles.statCaption}>
                      {Math.max(0, Math.floor((nowMs - Date.parse(summary.workout.active.startedAt)) / 1000)) > 0
                        ? formatDuration(Math.max(0, Math.floor((nowMs - Date.parse(summary.workout.active.startedAt)) / 1000)))
                        : 'Just started'}
                    </Text>
                  </View>
                </View>
              ) : summary.workout.latestCompleted ? (
                <View style={styles.workoutRow}>
                  <View style={styles.workoutMain}>
                    <Text style={styles.primaryStat}>Last session</Text>
                    <Text style={styles.statCaption}>
                      {summary.workout.latestCompleted.setCount} sets · {Math.round(summary.workout.latestCompleted.totalVolume).toLocaleString()} kg volume
                    </Text>
                  </View>
                  <Text style={styles.workoutDate}>
                    {new Date(summary.workout.latestCompleted.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </Text>
                </View>
              ) : (
                <Text style={styles.mutedBody}>No workouts yet</Text>
              )}
            </DashboardCard>
            <DashboardCard title="Daily focus" onPress={() => router.push('/wallpaper')} action="Wallpaper">
              <Text style={styles.primaryStat}>{quote.text}</Text>
              <Text style={styles.statCaption}>{quote.author}</Text>
            </DashboardCard>
            <DashboardCard title="Reminders" onPress={() => router.push('/alarms')} action="Manage">
              <Text style={styles.mutedBody}>Schedule daily and weekly local notifications.</Text>
            </DashboardCard>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function DashboardCard({
  title,
  action,
  onPress,
  children,
}: {
  title: string;
  action: string;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${action}`}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardAction}>{action} ›</Text>
      </View>
      {children}
    </Pressable>
  );
}

function MacroLine({
  label,
  metric,
  color,
}: {
  label: string;
  metric: DashboardSummary['macros']['protein'];
  color: string;
}) {
  return (
    <View style={styles.macroLine}>
      <View style={styles.macroLabelRow}>
        <Text style={styles.macroLabel}>{label}</Text>
        <Text style={styles.macroValue}>
          {formatNutrition(metric.consumed, 'g')}{metric.target === null ? '' : ` / ${formatNutrition(metric.target, 'g')}`}
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${metric.fillRatio * 100}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md },
  header: { paddingTop: spacing.sm, paddingBottom: spacing.md },
  greeting: { color: colors.text, fontSize: fontSize.xl, fontWeight: '700' },
  date: { color: colors.textMuted, fontSize: fontSize.sm, marginTop: spacing.xs },
  loading: { minHeight: 260, justifyContent: 'center', alignItems: 'center' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { color: colors.text, fontSize: fontSize.lg, fontWeight: '700' },
  cardAction: { color: colors.accent, fontSize: fontSize.xs, fontWeight: '700' },
  pressed: { opacity: 0.72 },
  taskTopline: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  primaryStat: { color: colors.text, fontSize: fontSize.xl, fontWeight: '700' },
  statCaption: { color: colors.textMuted, fontSize: fontSize.sm },
  previewList: { gap: spacing.sm },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 24 },
  dot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.accent },
  dotRisk: { backgroundColor: colors.danger },
  previewText: { color: colors.text, fontSize: fontSize.sm, flex: 1 },
  previewMeta: { color: colors.textMuted, fontSize: fontSize.xs, fontWeight: '700' },
  mutedBody: { color: colors.textMuted, fontSize: fontSize.sm },
  riskText: { color: colors.danger, fontSize: fontSize.xs, fontWeight: '700' },
  macroHeadline: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  macroList: { gap: spacing.sm },
  macroLine: { gap: spacing.xs },
  macroLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  macroLabel: { color: colors.textMuted, fontSize: fontSize.xs },
  macroValue: { color: colors.textMuted, fontSize: fontSize.xs },
  track: { height: 6, backgroundColor: colors.surfaceRaised, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill },
  weightRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  weightChange: { alignItems: 'flex-end', gap: spacing.xs },
  changeValue: { color: colors.text, fontSize: fontSize.lg, fontWeight: '600' },
  changeDown: { color: colors.success },
  workoutRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  activeIndicator: { width: 10, height: 10, borderRadius: radius.pill, backgroundColor: colors.success },
  workoutMain: { flex: 1, gap: spacing.xs },
  workoutDate: { color: colors.textMuted, fontSize: fontSize.sm },
});
