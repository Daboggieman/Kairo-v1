/**
 * The Citadel — the daily aggregate across the four local-first P0 modules.
 *
 * It reads each module on focus in one load, so returning from a modal immediately updates the
 * dashboard and an app left open across midnight changes all four sections together.
 *
 * The four data modules are cards; everything else is a row in The Outer Ward. Home had been six
 * cards of equal weight, which made a one-line navigation shortcut look as important as the day's
 * macros and left nothing to scan for. Weight follows from how much a card actually says.
 *
 * Display names come from the lexicon in `docs/09-ui-rebuild-plan.md`: The Rites, The Feast, The
 * Scales, The Forge. The routes keep their plain English names — only the copy is Greek.
 */

import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  Card,
  CardAction,
  CardHeader,
  Eyebrow,
  Fluting,
  IconButton,
  Meander,
  NavRow,
  Notice,
  ProgressBar,
  RowGroup,
  ScreenScroll,
  Section,
} from '@/components/Layout';
import { KairoMark, LogoLoader } from '@/components/Logo';
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
import { formatDelta, formatWeight } from '@/domain/weight';
import {
  chartColors,
  colors,
  fontSize,
  layout,
  lineHeight,
  radius,
  spacing,
  type as typeScale,
} from '@/theme';

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
          // The Citadel reads all four modules at once, so a single failed query used to reject
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
      {/*
        The header is the theme at its densest: fluting down the left gutter, the mark and wordmark,
        the greeting, and the Greek key underneath. `KairoMark` has to sit on `colors.background` —
        its interior is opaque, not transparent — which is why this block is not a card.

        It is also the one tab root with no `ScreenHeader`, and therefore the one with no `action`
        slot. The Sanctum's gear is placed in the brand row by hand instead: giving this block a
        `ScreenHeader` to gain the slot would mean giving up the mark.
      */}
      <View style={styles.header}>
        <Fluting />
        <View style={styles.headerMain}>
          <View style={styles.brandRow}>
            <KairoMark height={28} />
            <Text style={styles.brand}>KAIRO</Text>
            <View style={styles.brandSpacer} />
            <IconButton
              icon="cog-outline"
              label="The Sanctum"
              onPress={() => router.push('/sanctum')}
            />
          </View>
          <View>
            <Text style={styles.greeting}>{greeting(nowMs)}</Text>
            <Text style={styles.date}>{formatDate(nowMs)}</Text>
          </View>
        </View>
      </View>
      <Meander />

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
          <DashboardCard title="The Rites" action="Open" onPress={() => router.push('/tasks')}>
            <View style={styles.topline}>
              <Text style={styles.primaryStat}>
                {summary.tasks.due === 0 ? 'None due' : `${summary.tasks.done} / ${summary.tasks.due}`}
              </Text>
              <Text style={styles.statCaption}>
                {summary.tasks.due === 0
                  ? 'today'
                  : summary.tasks.remaining === 0
                    ? 'all kept'
                    : 'kept today'}
              </Text>
            </View>
            {summary.tasks.next.length > 0 ? (
              <View style={styles.previewList}>
                {summary.tasks.next.map((entry) => (
                  <View key={entry.task.id} style={styles.previewRow}>
                    {/*
                      The design dims the at-risk row to 50%. Kept at full contrast here: dimming the
                      one row that needs attention is the readability problem this rebuild exists to
                      fix. The red dot carries it.
                    */}
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
                {summary.tasks.due === 0 ? 'Rest day' : 'Nothing left to keep'}
              </Text>
            )}
            {summary.tasks.atRisk > 0 ? (
              <Eyebrow tone="danger">
                {summary.tasks.atRisk === 1
                  ? '1 flame guttering'
                  : `${summary.tasks.atRisk} flames guttering`}
              </Eyebrow>
            ) : null}
          </DashboardCard>

          <DashboardCard title="The Feast" action="Open" onPress={() => router.push('/macros')}>
            <View style={styles.topline}>
              <Text style={styles.primaryStat}>
                {formatNutrition(summary.macros.totals.calories, 'kcal')}
              </Text>
              <Text style={styles.statCaption}>
                {summary.macros.calories.target === null
                  ? 'today'
                  : `of ${formatNutrition(summary.macros.calories.target, 'kcal')}`}
              </Text>
            </View>
            <View style={styles.macroList}>
              <MacroLine
                label="Protein Den"
                metric={summary.macros.protein}
                color={chartColors.protein}
              />
              <MacroLine
                label="The Granary"
                metric={summary.macros.carbs}
                color={chartColors.carbs}
              />
              <MacroLine
                label="The Fat Pool"
                metric={summary.macros.fat}
                color={chartColors.fat}
              />
            </View>
          </DashboardCard>

          <DashboardCard title="The Scales" action="Open" onPress={() => router.push('/weight')}>
            {summary.weight.trendKg === null ? (
              <Text style={styles.mutedBody}>No weighings yet</Text>
            ) : (
              <View style={styles.weightRow}>
                <View style={styles.weightMain}>
                  <Text style={styles.primaryStat}>
                    {formatWeight(summary.weight.trendKg, summary.weight.unit)}
                  </Text>
                  <Text style={styles.statCaption}>7-day trend</Text>
                </View>
                <View style={styles.weightChange}>
                  <Eyebrow>30 days</Eyebrow>
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
            title="The Forge"
            action={summary.workout.active ? 'Resume' : 'Open'}
            onPress={() => router.push(summary.workout.active ? '/workouts/active' : '/workouts')}
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
                  <Text style={styles.primaryStat}>Last forging</Text>
                  <Text style={styles.statCaption}>
                    {summary.workout.latestCompleted.setCount} sets · {Math.round(summary.workout.latestCompleted.totalVolume).toLocaleString()} kg volume
                  </Text>
                </View>
                <Text style={styles.workoutDate}>
                  {new Date(summary.workout.latestCompleted.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </Text>
              </View>
            ) : (
              <Text style={styles.mutedBody}>Nothing forged yet</Text>
            )}
          </DashboardCard>
        </View>
      ) : null}

      {/*
        Rows, not cards: none of these holds today's numbers, and as cards they competed with the
        four that do. The Pantheon and The Annals join them here rather than taking tabs of their
        own — both are things you go and look at, not things you do daily.
      */}
      <Section title="The Outer Ward">
        <RowGroup>
          <NavRow
            label="The Pantheon"
            detail="Your records, and when you set them"
            onPress={() => router.push('/pantheon')}
          />
          <NavRow
            label="The Annals"
            detail="The week, reckoned"
            onPress={() => router.push('/annals')}
          />
          <NavRow label="The Oracle" onPress={() => router.push('/wallpaper')} />
          <NavRow label="The Call" onPress={() => router.push('/alarms')} />
        </RowGroup>
      </Section>
    </ScreenScroll>
  );
}

/**
 * One module's card: its Greek name, where it goes, and whatever it has to say today.
 *
 * The `Pressable` wraps `Card` rather than restyling itself as one, so there is still exactly one
 * card shape in the app. The `CardAction` inside the header is not itself pressable — the whole card
 * is the target.
 */
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
      style={({ pressed }) => pressed && styles.pressed}
    >
      <Card>
        <CardHeader title={title} action={<CardAction label={action} />} />
        {children}
      </Card>
    </Pressable>
  );
}

/**
 * One macro's name, how far through its target it is, and the bar.
 *
 * The percentage on the right is the design's, and it is only shown when there is a target to be a
 * percentage of — with no target set the grams are the only honest thing to print.
 */
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
        <Text style={[styles.macroValue, { color }]}>
          {metric.target === null
            ? formatNutrition(metric.consumed, 'g')
            : `${Math.round(metric.fillRatio * 100)}%`}
        </Text>
      </View>
      <ProgressBar value={metric.consumed} max={metric.target ?? 0} color={color} height={4} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', gap: spacing.lg, paddingTop: spacing.sm },
  headerMain: { flex: 1, gap: layout.cardGap },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  /** Pushes the Sanctum's gear to the far edge without giving the wordmark `flex: 1`, which would
      let a long brand string steal the gear's room. */
  brandSpacer: { flex: 1 },
  brand: { color: colors.text, ...typeScale.headlineSm },
  greeting: { color: colors.text, ...typeScale.displayMd },
  date: { color: colors.textMuted, fontSize: fontSize.sm, lineHeight: lineHeight.sm },
  loading: { minHeight: 260, justifyContent: 'center', alignItems: 'center' },
  cards: { gap: layout.cardGap },
  pressed: { opacity: 0.72 },
  topline: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  primaryStat: { color: colors.text, ...typeScale.displayMd },
  statCaption: { color: colors.textMuted, fontSize: fontSize.sm, lineHeight: lineHeight.sm },
  previewList: { gap: spacing.md },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 24 },
  dot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.accent },
  dotRisk: { backgroundColor: colors.danger },
  previewText: { color: colors.text, fontSize: fontSize.sm, lineHeight: lineHeight.sm, flex: 1 },
  previewMeta: { color: colors.textMuted, fontSize: fontSize.xs, fontWeight: '700' },
  mutedBody: { color: colors.textMuted, fontSize: fontSize.sm, lineHeight: lineHeight.sm },
  macroList: { gap: layout.cardGap },
  macroLine: { gap: spacing.xs },
  macroLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  macroLabel: { color: colors.textMuted, fontSize: fontSize.sm, lineHeight: lineHeight.sm },
  macroValue: { ...typeScale.label },
  weightRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  weightMain: { gap: spacing.xs },
  weightChange: { alignItems: 'flex-end', gap: spacing.xs },
  changeValue: { color: colors.text, fontSize: fontSize.md, lineHeight: lineHeight.md, fontWeight: '600' },
  changeDown: { color: colors.success },
  workoutRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  activeIndicator: { width: 10, height: 10, borderRadius: radius.pill, backgroundColor: colors.success },
  workoutMain: { flex: 1, gap: spacing.xs },
  workoutDate: { color: colors.textMuted, fontSize: fontSize.sm },
});
