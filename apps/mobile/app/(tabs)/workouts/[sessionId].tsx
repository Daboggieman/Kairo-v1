/**
 * Completed session detail — read-only this pass.
 *
 * `useLocalSearchParams` types route params as `string | string[]`, so the session id is
 * extracted with a fallback rather than non-null-asserted. The DB lookup returns null for
 * unknown ids; both paths render a guarded fallback instead of throwing.
 */

import { useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import type { WorkoutSession, WorkoutSetWithExercise } from '@/db/types';
import { getSession, listSetsWithExercises } from '@/db/workouts';
import { formatDuration, sessionDurationSeconds, sessionVolume } from '@/domain/workouts';
import { colors, fontSize, radius, spacing } from '@/theme';

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

export default function SessionDetailScreen() {
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{ sessionId?: string | string[] }>();
  const sessionId = Array.isArray(params.sessionId) ? params.sessionId[0] : params.sessionId;

  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [sets, setSets] = useState<WorkoutSetWithExercise[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    (async () => {
      const [found, rows] = await Promise.all([
        getSession(db, sessionId),
        listSetsWithExercises(db, sessionId),
      ]);
      if (cancelled) return;
      setSession(found);
      setSets(rows);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [db, sessionId]);

  if (!loaded) return <View style={styles.screen} />;

  if (!session) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>This session could not be found.</Text>
      </View>
    );
  }

  const duration = sessionDurationSeconds(session.startedAt, session.endedAt);
  const volume = Math.round(sessionVolume(sets));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.date}>{formatDate(session.startedAt)}</Text>
      <Text style={styles.time}>
        {formatTime(session.startedAt)}
        {session.endedAt ? ` – ${formatTime(session.endedAt)}` : ''}
      </Text>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{sets.length}</Text>
          <Text style={styles.statLabel}>sets</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{duration === null ? '—' : formatDuration(duration)}</Text>
          <Text style={styles.statLabel}>duration</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{volume.toLocaleString()}</Text>
          <Text style={styles.statLabel}>volume</Text>
        </View>
      </View>

      {sets.map((set) => (
        <View key={set.id} style={styles.setCard}>
          <Text style={styles.setExercise}>{set.exerciseName}</Text>
          <Text style={styles.setDetail}>
            Set {set.setNumber} · {set.reps} × {set.weight}
            {set.weightUnit}
            {set.rpe !== null && set.rpe !== undefined ? ` · RPE ${set.rpe}` : ''}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.lg, gap: spacing.md },
  date: { color: colors.text, fontSize: fontSize.lg, fontWeight: '700' },
  time: { color: colors.textMuted, fontSize: fontSize.sm },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.lg,
    marginTop: spacing.sm,
  },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { color: colors.text, fontSize: fontSize.lg, fontWeight: '700' },
  statLabel: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },
  setCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  setExercise: { color: colors.text, fontSize: fontSize.md, fontWeight: '600' },
  setDetail: { color: colors.textMuted, fontSize: fontSize.sm, marginTop: 2 },
  muted: { color: colors.textMuted, fontSize: fontSize.md },
});
