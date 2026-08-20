/**
 * The Expedition — the movement module's root screen: the journey underway, the last seven days, and
 * the chronicles of every route already walked, run or ridden.
 *
 * A `FlatList` rather than the `ScreenScroll` most tab roots use, because the chronicles grow with
 * every outing. That costs the screen the footer inset `ScreenScroll` would have owned, which is why
 * it reads `useSafeAreaInsets` itself; a screen *inside* `ScreenScroll` must not.
 *
 * Three wordings come from `src/domain/movement.ts` rather than from here — the type names
 * (`MOVEMENT_LABELS`), the pace-or-speed choice (`movementPerformance`) and the totals line
 * (`formatExpeditionTotals`) — so all six screens in the module say them the same way. The old screen
 * computed `averageSpeedMps * 3.6` inline and The March computed the same branch again, which is the
 * usual way two screens end up disagreeing about one activity.
 *
 * The header's add affordance disappears while something is recording: `getActiveMovementActivity`
 * returns the open row rather than letting a second one start, so a `+` beside a live journey would
 * be a control that lies about what it does. When there is one, the underway card's own button is
 * the only way back to it.
 *
 * The Compass is a row in the content, not a floating cog. The old screen absolutely positioned a
 * 44pt button over the top-right of the list, which sat on top of the first card on a short screen
 * and had no label beside it.
 */

import { Link, useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import {
  Card,
  EmptyState,
  Eyebrow,
  IconButton,
  NavRow,
  Notice,
  Pill,
  RowGroup,
  Screen,
  ScreenHeader,
  Section,
  StatStrip,
} from '@/components/Layout';
import { SessionElapsed } from '@/components/SessionElapsed';
import { LOCAL_USER_ID } from '@/constants';
import { getActiveMovementActivity, listMovementActivities } from '@/db/movement';
import { getUnitSystem, type UnitSystem } from '@/db/preferences';
import type { MovementActivity } from '@/db/types';
import { WEEKDAY_LABELS, dayOfWeek } from '@/domain/dates';
import {
  formatExpeditionTotals,
  formatMovementDistance,
  METERS_PER_MILE,
  MOVEMENT_LABELS,
  movementPerformance,
  movementWeek,
} from '@/domain/movement';
import { formatDuration } from '@/domain/workouts';
import { colors, fontSize, layout, lineHeight, spacing } from '@/theme';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * A day's figure in the week strip.
 *
 * Whole units, because seven cells across a phone leave each about 32pt of text and "5.4" wraps
 * where "5" does not. A day carrying less than half a unit shows `<1` rather than `0`, which would
 * contradict the bar drawn beneath it. Two letters for the weekday rather than one: a rolling week
 * visits each day exactly once, so "Tu" and "Th" are unique where "T" and "T" are not — and
 * `StatStrip` keys its cells by their label.
 */
function formatDayDistance(distanceMeters: number, unit: UnitSystem): string {
  if (distanceMeters <= 0) return '–';
  const covered = distanceMeters / (unit === 'metric' ? 1000 : METERS_PER_MILE);
  return covered < 0.5 ? '<1' : `${Math.round(covered)}`;
}

/**
 * One journey in the chronicles.
 *
 * The date is the only thing set in body size and full-strength ink: it is what the list is scanned
 * by. The type is a pill because it is a category rather than a measurement, and it carries the
 * glyph — which is where `MOVEMENT_LABELS` earns its keep, since a ride draws as a bicycle.
 */
function ChronicleCard({ activity, unit }: { activity: MovementActivity; unit: UnitSystem }) {
  const label = MOVEMENT_LABELS[activity.activityType];
  const distance = formatMovementDistance(activity.distanceMeters, unit);
  const performance = movementPerformance(activity, unit);

  return (
    <Link href={`/movement/${activity.id}` as never} asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label.name}, ${formatDate(activity.startedAt)}, ${distance.value} ${
          distance.label
        }`}
        style={({ pressed }) => pressed && styles.pressed}
      >
        <Card>
          <View style={styles.cardHeader}>
            <Text style={styles.cardDate}>{formatDate(activity.startedAt)}</Text>
            <Pill label={label.name} icon={label.icon} tone="accent" />
          </View>

          <StatStrip
            bare
            items={[
              { label: 'Ground', value: `${distance.value} ${distance.label}`, tone: 'accent' },
              { label: 'Moving', value: formatDuration(activity.movingSeconds) },
              { label: performance.label, value: `${performance.value} ${performance.unit}` },
            ]}
          />

          {activity.name ? <Text style={styles.cardName}>{activity.name}</Text> : null}
        </Card>
      </Pressable>
    </Link>
  );
}

/**
 * The journey currently recording, above the chronicles.
 *
 * Accent-tinted with a 4px accent left rule — the theme's mark for the one thing in play, the same
 * treatment the Forge gives a session on the anvil. `SessionElapsed` is a separate component so only
 * the clock re-renders each second rather than this whole tab.
 */
function UnderwayCard({
  activity,
  unit,
  onPress,
}: {
  activity: MovementActivity;
  unit: UnitSystem;
  onPress: () => void;
}) {
  const label = MOVEMENT_LABELS[activity.activityType];
  const distance = formatMovementDistance(activity.distanceMeters, unit);

  return (
    <Card style={styles.underway}>
      <View style={styles.underwayHeader}>
        <Eyebrow tone="accent">Underway</Eyebrow>
        <View style={styles.liveDot} />
      </View>
      <View style={styles.underwayBody}>
        <SessionElapsed
          startedAt={activity.startedAt}
          prefix="In progress"
          style={styles.underwayClock}
        />
        <Text style={styles.underwaySummary}>
          {label.name} · {distance.value} {distance.label} covered
        </Text>
      </View>
      <Button label="Rejoin the journey" onPress={onPress} />
    </Card>
  );
}

export default function ExpeditionScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [activities, setActivities] = useState<MovementActivity[]>([]);
  const [active, setActive] = useState<MovementActivity | null>(null);
  const [unit, setUnit] = useState<UnitSystem>('metric');
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * The clock is captured on focus rather than read during render — `Date.now()` in a render body is
   * impure, and here it decides which seven days the strip covers. Re-reading it on focus is also
   * what makes the strip correct after midnight: the tab was mounted yesterday, so a mount-only read
   * would keep drawing yesterday's week.
   */
  const [nowMs, setNowMs] = useState(() => Date.now());

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const [history, current, units] = await Promise.all([
            listMovementActivities(db, LOCAL_USER_ID),
            getActiveMovementActivity(db, LOCAL_USER_ID),
            getUnitSystem(db, LOCAL_USER_ID),
          ]);
          if (cancelled) return;
          setActivities(history);
          setActive(current);
          setUnit(units);
          setNowMs(Date.now());
          setError(null);
        } catch (caught) {
          // Without this the rejection was unhandled and the screen sat empty with no explanation.
          if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
        } finally {
          if (!cancelled) setLoaded(true);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [db]),
  );

  const week = movementWeek(activities, nowMs);
  const weekBest = Math.max(...week.days.map((day) => day.distanceMeters), 0);
  const weekDistance = formatMovementDistance(week.distanceMeters, unit);

  const setOut = (
    <IconButton
      icon="plus"
      label="Cross the threshold"
      variant="outlined"
      onPress={() => router.push('/movement/new')}
    />
  );

  return (
    <Screen>
      <FlatList
        data={activities}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ChronicleCard activity={item} unit={unit} />}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: insets.bottom + layout.scrollFooter },
        ]}
        ListHeaderComponent={
          <View style={styles.header}>
            <ScreenHeader
              title="The Expedition"
              subtitle={formatExpeditionTotals(
                activities.length,
                activities.reduce((total, activity) => total + activity.distanceMeters, 0),
                unit,
              )}
              action={active ? undefined : setOut}
            />

            {error ? (
              <Notice tone="danger" title="Could not read the chronicles">
                {error}
              </Notice>
            ) : null}

            {active ? (
              <UnderwayCard
                activity={active}
                unit={unit}
                onPress={() => router.push('/movement/active')}
              />
            ) : null}

            {week.count > 0 ? (
              <Section
                title="The last seven days"
                action={
                  <Eyebrow>{`${weekDistance.value} ${weekDistance.label} · ${formatDuration(
                    week.movingSeconds,
                  )}`}</Eyebrow>
                }
              >
                <StatStrip
                  items={week.days.map((day) => ({
                    label: WEEKDAY_LABELS[dayOfWeek(day.day)].slice(0, 2),
                    value: formatDayDistance(day.distanceMeters, unit),
                    // Against the week's own best day, so the strip reads as a shape rather than
                    // against some invented target the user never set.
                    progress: weekBest > 0 ? day.distanceMeters / weekBest : 0,
                  }))}
                />
              </Section>
            ) : null}

            <RowGroup>
              <NavRow
                label="The Compass"
                detail="Units, voice cues, autopause"
                icon="compass-outline"
                onPress={() => router.push('/movement/settings')}
              />
            </RowGroup>

            {/* Children omitted: the rows this titles are the list's own. */}
            {activities.length > 0 ? <Section title="The chronicles" /> : null}
          </View>
        }
        ListEmptyComponent={
          !loaded || error ? null : (
            <EmptyState
              title="No ground covered"
              body="Nothing has been recorded yet. Cross the threshold and the route writes itself as you go."
              action={
                <Button
                  label="Cross the threshold"
                  onPress={() => router.push('/movement/new')}
                />
              }
            />
          )
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: layout.screenPadding, gap: layout.cardGap },
  header: { gap: layout.sectionGap },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  cardDate: {
    color: colors.text,
    fontSize: fontSize.md,
    lineHeight: lineHeight.md,
    fontWeight: '600',
  },
  cardName: { color: colors.textMuted, fontSize: fontSize.sm, lineHeight: lineHeight.sm },
  underway: {
    backgroundColor: colors.accentSoft,
    borderLeftWidth: 4,
    borderLeftColor: colors.accent,
  },
  underwayHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  underwayBody: { gap: spacing.xs },
  underwayClock: {
    color: colors.text,
    fontSize: fontSize.lg,
    lineHeight: lineHeight.lg,
    fontWeight: '600',
  },
  underwaySummary: { color: colors.textMuted, fontSize: fontSize.sm, lineHeight: lineHeight.sm },
  pressed: { opacity: 0.7 },
});
