/**
 * The Forge — the workouts module's root screen: what is on the anvil now, and the annals of
 * everything struck before it.
 *
 * `04-feature-specs.md` asks for a reverse-chronological history with date, duration and volume.
 * The theme's vocabulary for those, from `09-ui-rebuild-plan.md`, is strikes / tonnage / lifts, and
 * the phrasing lives in `src/domain/workouts.ts` rather than here so all four screens in the module
 * say it the same way.
 *
 * A `FlatList` rather than the `ScreenScroll` every other tab root uses, because a session log
 * genuinely grows without limit — this is the one list in the app that has no natural ceiling. That
 * costs the screen the footer inset `ScreenScroll` would have owned, which is why it reads
 * `useSafeAreaInsets` itself; a screen *inside* `ScreenScroll` must not.
 *
 * Reloads on focus rather than on mount: ending a session navigates back here, and a mount-only
 * effect would show the list without the workout just finished.
 *
 * The header's add affordance appears only when nothing is open. `startSession` returns the id of an
 * existing session rather than creating a second one, so a `+` beside a live session would be a
 * control that lies about what it does — when there is one, the active card's own button is the
 * single way back to it.
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
  Notice,
  Pill,
  Screen,
  ScreenHeader,
  Section,
  StatStrip,
} from '@/components/Layout';
import { SessionElapsed } from '@/components/SessionElapsed';
import type { WorkoutSessionSummary } from '@/db/types';
import { listSessions } from '@/db/workouts';
import {
  formatAnvilSummary,
  formatDuration,
  formatForgeTotals,
  formatTonnage,
  groupByExercise,
  sessionDurationSeconds,
  totalTonnage,
} from '@/domain/workouts';
import { useWorkoutStore } from '@/store/workoutStore';
import { colors, fontSize, layout, lineHeight, spacing } from '@/theme';

/**
 * How many lifts a session card names before it counts the rest.
 *
 * Three is what fits on two lines of pills on the narrowest phone; the overflow count is accented so
 * the card reads as "and more" rather than as a truncated list.
 */
const MAX_NAMED_LIFTS = 3;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * One session in the annals.
 *
 * The date is the only thing here set in body size and full-strength ink: it is what the list is
 * scanned by, and an uppercase 12px eyebrow — which is what a `CardHeader` would give it — turns
 * scanning a month of training into reading. The rule under it is the same rule a `CardHeader` draws,
 * so the card still reads as a plate with a heading.
 */
function SessionCard({ session }: { session: WorkoutSessionSummary }) {
  const duration = sessionDurationSeconds(session.startedAt, session.endedAt);
  const named = session.exerciseNames.slice(0, MAX_NAMED_LIFTS);
  const overflow = session.exerciseNames.length - named.length;

  return (
    <Link href={`/workouts/${session.id}`} asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${formatDate(session.startedAt)}, ${formatAnvilSummary(
          session.exerciseNames.length,
          session.setCount,
        )}, ${formatTonnage(session.totalVolume)}`}
        style={({ pressed }) => pressed && styles.pressed}
      >
        <Card>
          <View style={styles.cardHeader}>
            <Text style={styles.cardDate}>{formatDate(session.startedAt)}</Text>
            <Text style={styles.cardDuration}>{formatDuration(duration)}</Text>
          </View>

          <StatStrip
            bare
            items={[
              { label: 'Strikes', value: `${session.setCount}`, tone: 'accent' },
              { label: 'Tonnage', value: formatTonnage(session.totalVolume) },
              { label: 'Lifts', value: `${session.exerciseNames.length}` },
            ]}
          />

          {named.length > 0 ? (
            <View style={styles.lifts}>
              {named.map((name) => (
                <Pill key={name} label={name} />
              ))}
              {overflow > 0 ? <Pill label={`+${overflow}`} tone="accent" /> : null}
            </View>
          ) : null}
        </Card>
      </Pressable>
    </Link>
  );
}

/**
 * The session currently open, above the history.
 *
 * Accent-tinted with a 4px accent left rule — the theme's mark for the one thing in play. The design
 * pulses a green dot beside the clock; the clock already ticks once a second, and a second piece of
 * motion next to it is redundant animation that would run for as long as this tab stays mounted. The
 * dot stays, static, as the colour cue.
 */
function AnvilCard({
  startedAt,
  liftCount,
  strikeCount,
  onPress,
}: {
  startedAt: string | null;
  liftCount: number;
  strikeCount: number;
  onPress: () => void;
}) {
  return (
    <Card style={styles.anvil}>
      <View style={styles.anvilHeader}>
        <Eyebrow tone="accent">At the anvil</Eyebrow>
        <View style={styles.liveDot} />
      </View>
      <View style={styles.anvilBody}>
        <SessionElapsed startedAt={startedAt} prefix="In progress" style={styles.anvilClock} />
        <Text style={styles.anvilSummary}>{formatAnvilSummary(liftCount, strikeCount)}</Text>
      </View>
      <Button label="Return to the anvil" onPress={onPress} />
    </Card>
  );
}

export default function ForgeScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [sessions, setSessions] = useState<WorkoutSessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const hydrate = useWorkoutStore((state) => state.hydrate);
  const startSession = useWorkoutStore((state) => state.startSession);
  const activeSessionId = useWorkoutStore((state) => state.sessionId);
  const activeStartedAt = useWorkoutStore((state) => state.startedAt);
  const activeSets = useWorkoutStore((state) => state.sets);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          // Picks up a session left open by a force-kill, so the card above says "return" instead
          // of the header silently offering to start a second one.
          await hydrate(db);
          const rows = await listSessions(db);
          if (cancelled) return;
          setSessions(rows);
          setError(null);
        } catch (caught) {
          // Without this the rejection was unhandled and the screen sat empty with no explanation.
          if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [db, hydrate]),
  );

  const onStart = useCallback(async () => {
    try {
      await startSession(db);
      router.push('/workouts/active');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [db, router, startSession]);

  const kindle = (
    <IconButton
      icon="plus"
      label="Kindle the forge"
      variant="outlined"
      onPress={() => void onStart()}
    />
  );

  return (
    <Screen>
      <FlatList
        data={sessions}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <SessionCard session={item} />}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: insets.bottom + layout.scrollFooter },
        ]}
        ListHeaderComponent={
          <View style={styles.header}>
            <ScreenHeader
              title="The Forge"
              subtitle={formatForgeTotals(sessions.length, totalTonnage(sessions))}
              action={activeSessionId ? undefined : kindle}
            />

            {error ? (
              <Notice tone="danger" title="Could not read the annals">
                {error}
              </Notice>
            ) : null}

            {activeSessionId ? (
              <AnvilCard
                startedAt={activeStartedAt}
                liftCount={groupByExercise(activeSets).length}
                strikeCount={activeSets.length}
                onPress={() => router.push('/workouts/active')}
              />
            ) : null}

            {/* Children omitted: the rows this titles are the list's own. */}
            {sessions.length > 0 ? <Section title="The annals of the forge" /> : null}
          </View>
        }
        ListEmptyComponent={
          loading || error ? null : (
            <EmptyState
              title="The forge is cold"
              body="Nothing has been struck yet. Open a session and log one set — the annals start there."
              action={<Button label="Kindle the forge" onPress={() => void onStart()} />}
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
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  cardDate: { color: colors.text, fontSize: fontSize.md, lineHeight: lineHeight.md, fontWeight: '600' },
  cardDuration: { color: colors.textMuted, fontSize: fontSize.sm, lineHeight: lineHeight.sm },
  lifts: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  anvil: {
    backgroundColor: colors.accentSoft,
    borderLeftWidth: 4,
    borderLeftColor: colors.accent,
  },
  anvilHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  anvilBody: { gap: spacing.xs },
  anvilClock: { color: colors.text, fontSize: fontSize.lg, lineHeight: lineHeight.lg, fontWeight: '600' },
  anvilSummary: { color: colors.textMuted, fontSize: fontSize.sm, lineHeight: lineHeight.sm },
  pressed: { opacity: 0.7 },
});
