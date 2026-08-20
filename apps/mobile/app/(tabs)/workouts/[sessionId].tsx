/**
 * The Stele — a completed session, inscribed. Read-only.
 *
 * `useLocalSearchParams` types route params as `string | string[]`, so the session id is
 * extracted with a fallback rather than non-null-asserted. The DB lookup returns null for
 * unknown ids; both paths render a guarded fallback instead of throwing.
 *
 * The hero's four figures are laid out 2×2 rather than the design's single row of four. `5.9_the_stele`
 * is a `max-w-4xl` desktop layout; four display numbers across a phone gives each about 80pt, which
 * truncates "5,240 kg" — the one figure on the screen you would not want abbreviated.
 *
 * The design's EDIT and DELETE footer buttons are not built. Editing and deleting a logged set is
 * deferred work, and `09-ui-rebuild-plan.md` locks this pass to copy, structure and type: adding two
 * mutations to a read-only screen is a feature decision hidden inside a UI change.
 *
 * The third column of each set row carries whatever was actually recorded about it — RPE, the rest
 * interval, or both. The design shows RPE alone, but nothing in the app writes RPE yet while
 * `logSet` records rest on every set after the first, so RPE alone would be a column of blanks.
 */

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  AppBar,
  Card,
  Divider,
  EmptyState,
  Fluting,
  Meander,
  Notice,
  Screen,
  ScreenScroll,
  Section,
  StatStrip,
} from '@/components/Layout';
import { LogoLoader } from '@/components/Logo';
import type { WorkoutSession, WorkoutSetWithExercise } from '@/db/types';
import { getSession, listSetsWithExercises } from '@/db/workouts';
import {
  formatDuration,
  formatTonnage,
  formatWeight,
  groupByExercise,
  sessionDurationSeconds,
  sessionVolume,
} from '@/domain/workouts';
import { colors, fontSize, layout, lineHeight, spacing, type as typeScale } from '@/theme';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/** "RPE 8 · 90s rest" — whatever this set actually carries, in the design's third column. */
function describeStrike(set: WorkoutSetWithExercise): string {
  return [
    set.rpe === null || set.rpe === undefined ? null : `RPE ${set.rpe}`,
    set.restSeconds === null ? null : `${set.restSeconds}s rest`,
  ]
    .filter((part): part is string => !!part)
    .join(' · ');
}

export default function SteleScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const params = useLocalSearchParams<{ sessionId?: string | string[] }>();
  const sessionId = Array.isArray(params.sessionId) ? params.sessionId[0] : params.sessionId;

  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [sets, setSets] = useState<WorkoutSetWithExercise[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    (async () => {
      try {
        const [found, rows] = await Promise.all([
          getSession(db, sessionId),
          listSetsWithExercises(db, sessionId),
        ]);
        if (cancelled) return;
        setSession(found);
        setSets(rows);
        setError(null);
      } catch (caught) {
        // Without this the rejection was unhandled and the screen sat blank with no explanation.
        if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [db, sessionId]);

  if (!loaded) {
    return (
      <Screen>
        <AppBar title="The Stele" onBack={() => router.back()} />
        <View style={styles.centered}>
          <LogoLoader />
        </View>
      </Screen>
    );
  }

  if (!session) {
    return (
      <Screen>
        <AppBar title="The Stele" onBack={() => router.back()} />
        {error ? (
          <View style={styles.padded}>
            <Notice tone="danger" title="Could not read this session">
              {error}
            </Notice>
          </View>
        ) : (
          <EmptyState
            title="No such stele"
            body="This session is not in the annals. It may have been raised on another device and not yet synced."
          />
        )}
      </Screen>
    );
  }

  const groups = groupByExercise(sets);
  const duration = sessionDurationSeconds(session.startedAt, session.endedAt);

  return (
    <Screen>
      <AppBar title="The Stele" onBack={() => router.back()} />

      <ScreenScroll>
        {error ? (
          <Notice tone="danger" title="Could not read this session">
            {error}
          </Notice>
        ) : null}

        {/*
          The hero: a fluted slab with the fret along its top edge. `Fluting` and `Meander` are the
          two ornaments the theme allows, and this is the one screen in the module that is an
          inscription rather than a working surface — the whole point of the name.
        */}
        <Card style={styles.hero}>
          <Meander style={styles.heroFret} />
          <View style={styles.heroBody}>
            <Fluting />
            <View style={styles.heroText}>
              <Text style={styles.heroDate}>{formatDate(session.startedAt)}</Text>
              <Text style={styles.heroTime}>
                {formatTime(session.startedAt)}
                {session.endedAt ? ` – ${formatTime(session.endedAt)}` : ''}
              </Text>
            </View>
          </View>

          <StatStrip
            bare
            items={[
              { label: 'Duration', value: duration === null ? '—' : formatDuration(duration) },
              { label: 'Strikes', value: `${sets.length}`, tone: 'accent' },
            ]}
          />
          <Divider />
          <StatStrip
            bare
            items={[
              { label: 'Tonnage', value: formatTonnage(sessionVolume(sets)) },
              { label: 'Lifts', value: `${groups.length}` },
            ]}
          />
        </Card>

        {groups.length > 0 ? (
          <Section title="The strikes">
            {groups.map((group) => (
              <Card key={group.exerciseId}>
                <View style={styles.groupHeader}>
                  <Text style={styles.groupName} numberOfLines={1}>
                    {group.exerciseName}
                  </Text>
                  <Text style={styles.groupTonnage}>{formatTonnage(sessionVolume(group.sets))}</Text>
                </View>
                <View style={styles.strikes}>
                  {group.sets.map((set) => (
                    <View key={set.id} style={styles.strikeRow}>
                      <View style={styles.strikeNumber}>
                        <Text style={styles.strikeNumberText}>{set.setNumber}</Text>
                      </View>
                      <Text style={styles.strikeReps}>{`${set.reps} reps`}</Text>
                      <Text style={styles.strikeWeight}>
                        {formatWeight(set.weight, set.weightUnit)}
                      </Text>
                      <Text style={styles.strikeMeta} numberOfLines={1}>
                        {describeStrike(set)}
                      </Text>
                    </View>
                  ))}
                </View>
              </Card>
            ))}
          </Section>
        ) : (
          <EmptyState
            title="Nothing was struck"
            body="This session was opened but no set was logged in it."
          />
        )}

        {session.notes ? (
          <Section title="Notes">
            <Card>
              <Text style={styles.notes}>{session.notes}</Text>
            </Card>
          </Section>
        ) : null}
      </ScreenScroll>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  padded: { padding: layout.screenPadding },
  /**
   * `overflow: hidden` is what keeps the fret inside the card's rounded corners, and the extra top
   * padding is the room the fret occupies. `Meander` is drawn at its default 14px: the motif is a
   * repeating key pattern, and squeezed below about 12px the turns close up and it reads as a plain
   * gold rule — which is a `Divider`, not an ornament.
   */
  hero: { paddingTop: layout.cardPadding + 14, overflow: 'hidden' },
  heroFret: { position: 'absolute', top: 0, left: 0, right: 0, opacity: 0.6 },
  heroBody: { flexDirection: 'row', gap: layout.cardPadding },
  heroText: { flex: 1, gap: spacing.xs },
  heroDate: { color: colors.text, ...typeScale.headlineSm },
  heroTime: {
    color: colors.textMuted,
    ...typeScale.label,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  groupName: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.md,
    lineHeight: lineHeight.md,
    fontWeight: '600',
  },
  groupTonnage: { color: colors.textMuted, ...typeScale.label, fontVariant: ['tabular-nums'] },
  strikes: { gap: spacing.md },
  strikeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  /** The circled ordinal from the design, matching The Anvil's. */
  strikeNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  strikeNumberText: { color: colors.accent, ...typeScale.eyebrow, fontWeight: '700' },
  strikeReps: { flex: 1, color: colors.text, fontSize: fontSize.md, lineHeight: lineHeight.md },
  strikeWeight: {
    color: colors.text,
    fontSize: fontSize.md,
    lineHeight: lineHeight.md,
    fontVariant: ['tabular-nums'],
  },
  strikeMeta: {
    flex: 1,
    textAlign: 'right',
    color: colors.textMuted,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
  },
  notes: { color: colors.text, fontSize: fontSize.md, lineHeight: lineHeight.md },
});
