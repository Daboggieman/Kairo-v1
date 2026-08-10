/**
 * Workout history — reverse-chronological list with date, duration and volume, per
 * `04-feature-specs.md`.
 *
 * Reloads on focus rather than on mount: ending a session navigates back here, and a
 * mount-only effect would show the list without the workout just finished.
 */

import { Link, useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import type { WorkoutSessionSummary } from '@/db/types';
import { listSessions } from '@/db/workouts';
import { formatDuration, sessionDurationSeconds } from '@/domain/workouts';
import { useWorkoutStore } from '@/store/workoutStore';
import { colors, fontSize, radius, spacing } from '@/theme';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function SessionRow({ session }: { session: WorkoutSessionSummary }) {
  const duration = sessionDurationSeconds(session.startedAt, session.endedAt);
  return (
    <Link href={`/workouts/${session.id}`} asChild>
      <Pressable style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
        <View style={styles.rowHeader}>
          <Text style={styles.rowDate}>{formatDate(session.startedAt)}</Text>
          <Text style={styles.rowDuration}>{formatDuration(duration)}</Text>
        </View>
        <Text style={styles.rowExercises} numberOfLines={1}>
          {session.exerciseNames.length > 0
            ? session.exerciseNames.join(', ')
            : 'No exercises logged'}
        </Text>
        <Text style={styles.rowStats}>
          {session.setCount} {session.setCount === 1 ? 'set' : 'sets'} ·{' '}
          {Math.round(session.totalVolume).toLocaleString()} volume
        </Text>
      </Pressable>
    </Link>
  );
}

export default function HistoryScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [sessions, setSessions] = useState<WorkoutSessionSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const hydrate = useWorkoutStore((state) => state.hydrate);
  const startSession = useWorkoutStore((state) => state.startSession);
  const activeSessionId = useWorkoutStore((state) => state.sessionId);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        // Picks up a session left open by a force-kill, so "Resume" appears instead of
        // silently starting a second one.
        await hydrate(db);
        const rows = await listSessions(db);
        if (!cancelled) {
          setSessions(rows);
          setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [db, hydrate]),
  );

  const onStart = useCallback(async () => {
    await startSession(db);
    router.push('/workouts/active');
  }, [db, router, startSession]);

  return (
    <View style={styles.screen}>
      <FlatList
        data={sessions}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <SessionRow session={item} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No workouts yet</Text>
              <Text style={styles.emptyBody}>Start a session and log your first set.</Text>
            </View>
          )
        }
      />
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button
          label={activeSessionId ? 'Resume workout' : 'Start workout'}
          onPress={onStart}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, gap: spacing.md },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  rowPressed: { opacity: 0.7 },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  rowDate: { color: colors.text, fontSize: fontSize.md, fontWeight: '600' },
  rowDuration: { color: colors.textMuted, fontSize: fontSize.sm },
  rowExercises: { color: colors.textMuted, fontSize: fontSize.sm, marginTop: spacing.sm },
  rowStats: { color: colors.accent, fontSize: fontSize.xs, marginTop: spacing.xs },
  empty: { alignItems: 'center', paddingTop: spacing.xxl * 2 },
  emptyTitle: { color: colors.text, fontSize: fontSize.lg, fontWeight: '600' },
  emptyBody: { color: colors.textMuted, fontSize: fontSize.sm, marginTop: spacing.sm },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
});
