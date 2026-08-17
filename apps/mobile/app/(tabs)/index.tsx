/**
 * Home — the daily aggregate across the four local-first P0 modules.
 *
 * Home reads each module on focus in one load, so returning from a modal immediately updates
 * the dashboard and an app left open across midnight changes all four sections together.
 *
 * The four data modules are cards; everything else is a row. Home had been six cards of equal
 * weight, which made a one-line navigation shortcut look as important as the day's macros and left
 * nothing to scan for. Weight follows from how much a card actually says.
 */

import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, Notice, ScreenScroll, Section } from '@/components/Layout';
import { LogoLoader } from '@/components/Logo';
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
import { chartColors, colors, fontSize, layout, lineHeight, radius, spacing, TAP_TARGET } from '@/theme';

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
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
        try {
          const result = await load();
          if (cancelled) return;
          setSummary(result.summary);
          setNowMs(result.capturedNow);
          setError(null);
        } catch (caught) {
          // Home reads all four modules at once, so a single failed query used to reject
          // unhandled and leave the spinner up for good. Say what broke instead.
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

  return (
    <ScreenScroll>
      <View style={styles.header}>
        <Text style={styles.greeting}>{greeting(nowMs)}</Text>
        <Text style={styles.date}>{formatDate(nowMs)}</Text>
      </View>

      {error ? (
        <Notice tone="danger" title="Could not read today's data">
          {error}
        </Notice>
      ) : null}

      {loading && !summary ? (
        <View style={styles.loading}>
          <LogoLoader size={80} />
        </View>
      ) : null}

      {summary ? (
        <View style={styles.cards}>
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
              <MacroLine label="Protein" metric={summary.macros.protein} color={chartColors.protein} />
              <MacroLine label="Carbs" metric={summary.macros.carbs} color={chartColors.carbs} />
              <MacroLine label="Fat" metric={summary.macros.fat} color={chartColors.fat} />
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
        </View>
      ) : null}

      {/*
        Rows, not cards: neither of these holds today's numbers, and as cards they competed with
        the four that do. The quote is shown in full on the wallpaper screen that renders it.
      */}
      <Section title="More">
        <Card style={styles.rowCard}>
          <NavRow
            icon="image-filter-hdr"
            title="Daily focus"
            detail={quote.text}
            onPress={() => router.push('/wallpaper')}
          />
          <View style={styles.rowDivider} />
          <NavRow
            icon="bell-outline"
            title="Reminders"
            detail="Daily and weekly local notifications"
            onPress={() => router.push('/alarms')}
          />
        </Card>
      </Section>
    </ScreenScroll>
  );
}

function NavRow({
  icon,
  title,
  detail,
  onPress,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  detail: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${detail}`}
      style={({ pressed }) => [styles.navRow, pressed && styles.pressed]}
    >
      <MaterialCommunityIcons name={icon} size={22} color={colors.accent} />
      <View style={styles.navMain}>
        <Text style={styles.navTitle}>{title}</Text>
        <Text style={styles.navDetail} numberOfLines={2}>{detail}</Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textMuted} />
    </Pressable>
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
  header: { paddingTop: spacing.xs },
  greeting: { color: colors.text, fontSize: fontSize.xl, lineHeight: lineHeight.xl, fontWeight: '700' },
  date: { color: colors.textMuted, fontSize: fontSize.sm, marginTop: spacing.xs },
  loading: { minHeight: 260, justifyContent: 'center', alignItems: 'center' },
  cards: { gap: layout.cardGap },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: layout.cardPadding,
    gap: layout.cardGap,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { color: colors.text, fontSize: fontSize.lg, fontWeight: '700' },
  cardAction: { color: colors.accent, fontSize: fontSize.xs, fontWeight: '700' },
  pressed: { opacity: 0.72 },
  taskTopline: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  primaryStat: { color: colors.text, fontSize: fontSize.xl, lineHeight: lineHeight.xl, fontWeight: '700' },
  statCaption: { color: colors.textMuted, fontSize: fontSize.sm },
  previewList: { gap: spacing.md },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 24 },
  dot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.accent },
  dotRisk: { backgroundColor: colors.danger },
  previewText: { color: colors.text, fontSize: fontSize.sm, lineHeight: lineHeight.sm, flex: 1 },
  previewMeta: { color: colors.textMuted, fontSize: fontSize.xs, fontWeight: '700' },
  mutedBody: { color: colors.textMuted, fontSize: fontSize.sm, lineHeight: lineHeight.sm },
  riskText: { color: colors.danger, fontSize: fontSize.xs, fontWeight: '700' },
  macroHeadline: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  macroList: { gap: spacing.md },
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
  // The rows own their own padding, so the card gives them none of its own.
  rowCard: { paddingVertical: 0, paddingHorizontal: layout.cardPadding, gap: 0 },
  rowDivider: { height: 1, backgroundColor: colors.border },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    minHeight: TAP_TARGET,
    paddingVertical: spacing.md,
  },
  navMain: { flex: 1, gap: 2 },
  navTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: '600' },
  navDetail: { color: colors.textMuted, fontSize: fontSize.xs, lineHeight: lineHeight.xs },
});
