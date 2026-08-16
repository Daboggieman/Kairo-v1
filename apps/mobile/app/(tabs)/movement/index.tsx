import { Link, useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { getActiveMovementActivity, listMovementActivities } from '@/db/movement';
import type { MovementActivity } from '@/db/types';
import { formatDuration } from '@/domain/workouts';
import { LOCAL_USER_ID } from '@/constants';
import { colors, fontSize, radius, spacing } from '@/theme';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function ActivityRow({ activity }: { activity: MovementActivity }) {
  const metric = activity.activityType === 'ride'
    ? `${((activity.averageSpeedMps ?? 0) * 3.6).toFixed(1)} km/h`
    : `${Math.round(activity.distanceMeters).toLocaleString()} m`;
  return (
    <Link href={`/movement/${activity.id}` as never} asChild>
      <Pressable style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
        <View style={styles.rowHeader}>
          <Text style={styles.rowTitle}>{activity.name || activity.activityType}</Text>
          <Text style={styles.rowDate}>{formatDate(activity.startedAt)}</Text>
        </View>
        <Text style={styles.rowStats}>{metric}  ·  {formatDuration(activity.movingSeconds)}</Text>
      </Pressable>
    </Link>
  );
}

export default function MovementHistoryScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const [activities, setActivities] = useState<MovementActivity[]>([]);
  const [active, setActive] = useState<MovementActivity | null>(null);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    void Promise.all([
      listMovementActivities(db, LOCAL_USER_ID),
      getActiveMovementActivity(db, LOCAL_USER_ID),
    ]).then(([history, current]) => {
      if (!cancelled) { setActivities(history); setActive(current); }
    });
    return () => { cancelled = true; };
  }, [db]));

  return (
    <View style={styles.screen}>
      <Pressable
        style={styles.settingsButton}
        onPress={() => router.push('/movement/settings')}
        accessibilityRole="button"
        accessibilityLabel="Movement settings"
      >
        <MaterialCommunityIcons name="cog-outline" size={24} color={colors.text} />
      </Pressable>
      <FlatList
        data={activities}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ActivityRow activity={item} />}
        contentContainerStyle={styles.list}
        ListHeaderComponent={active ? (
          <Link href="/movement/active" asChild>
            <Pressable style={styles.activeCard}>
              <Text style={styles.activeEyebrow}>ACTIVE TRACKING</Text>
              <Text style={styles.activeTitle}>{active.activityType} in progress</Text>
              <Text style={styles.activeBody}>Resume your route recording</Text>
            </Pressable>
          </Link>
        ) : null}
        ListEmptyComponent={!active ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No movement yet</Text>
            <Text style={styles.emptyBody}>Record a run, walk, or ride to build your route history.</Text>
          </View>
        ) : null}
      />
      <View style={styles.footer}>
        <Button
          label={active ? 'Resume movement' : 'Start movement'}
          onPress={() => router.push(active ? '/movement/active' : '/movement/new')}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, gap: spacing.md },
  row: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  pressed: { opacity: 0.7 },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  rowTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: '700', textTransform: 'capitalize' },
  rowDate: { color: colors.textMuted, fontSize: fontSize.xs },
  rowStats: { color: colors.accent, fontSize: fontSize.sm, marginTop: spacing.sm },
  activeCard: { backgroundColor: colors.accent, borderRadius: radius.md, padding: spacing.lg },
  activeEyebrow: { color: colors.accentText, fontSize: fontSize.xs, fontWeight: '700' },
  activeTitle: { color: colors.accentText, fontSize: fontSize.lg, fontWeight: '700', textTransform: 'capitalize', marginTop: spacing.xs },
  activeBody: { color: colors.accentText, fontSize: fontSize.sm, marginTop: spacing.xs },
  empty: { alignItems: 'center', paddingTop: spacing.xxl * 2 },
  emptyTitle: { color: colors.text, fontSize: fontSize.lg, fontWeight: '700' },
  emptyBody: { color: colors.textMuted, fontSize: fontSize.sm, textAlign: 'center', marginTop: spacing.sm },
  footer: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border },
  settingsButton: { position: 'absolute', right: spacing.lg, top: spacing.md, zIndex: 1, width: 44, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm },
});
