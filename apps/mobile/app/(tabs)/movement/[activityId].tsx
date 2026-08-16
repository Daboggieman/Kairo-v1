import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

import { Button } from '@/components/Button';
import { LOCAL_USER_ID } from '@/constants';
import { getMovementActivity, listMovementPoints } from '@/db/movement';
import type { MovementActivity, MovementPoint } from '@/db/types';
import { formatDuration } from '@/domain/workouts';
import { colors, fontSize, spacing } from '@/theme';

export default function MovementDetailScreen() {
  const { activityId } = useLocalSearchParams<{ activityId: string }>();
  const db = useSQLiteContext();
  const router = useRouter();
  const [activity, setActivity] = useState<MovementActivity | null>(null);
  const [points, setPoints] = useState<MovementPoint[]>([]);

  useEffect(() => {
    if (!activityId) return;
    let cancelled = false;
    void Promise.all([
      getMovementActivity(db, activityId, LOCAL_USER_ID),
      listMovementPoints(db, activityId),
    ]).then(([loadedActivity, loadedPoints]) => {
      if (!cancelled) { setActivity(loadedActivity); setPoints(loadedPoints); }
    });
    return () => { cancelled = true; };
  }, [activityId, db]);

  if (!activity) return <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>;
  const coordinates = points
    .filter((point) => point.processingState === 'accepted')
    .map((point) => ({ latitude: point.latitude, longitude: point.longitude }));
  const first = coordinates[0];
  const last = coordinates.at(-1);

  return (
    <View style={styles.screen}>
      <View style={styles.mapWrap}>
        {last ? (
          <MapView style={StyleSheet.absoluteFill} initialRegion={{ ...last, latitudeDelta: 0.02, longitudeDelta: 0.02 }}>
            <Polyline coordinates={coordinates} strokeColor={colors.accent} strokeWidth={5} />
            {first ? <Marker coordinate={first} pinColor={colors.success} /> : null}
            <Marker coordinate={last} pinColor={colors.danger} />
          </MapView>
        ) : <View style={styles.center}><Text style={styles.muted}>No accepted route points</Text></View>}
      </View>
      <View style={styles.summary}>
        <Text style={styles.title}>{activity.name || activity.activityType}</Text>
        <View style={styles.metrics}>
          <View><Text style={styles.value}>{(activity.distanceMeters / 1000).toFixed(2)}</Text><Text style={styles.label}>kilometers</Text></View>
          <View><Text style={styles.value}>{formatDuration(activity.movingSeconds)}</Text><Text style={styles.label}>moving</Text></View>
          <View><Text style={styles.value}>{activity.revision}</Text><Text style={styles.label}>revision</Text></View>
        </View>
        <Button label="Replay route" disabled={coordinates.length < 2} onPress={() => router.push({ pathname: '/movement/replay', params: { activityId } })} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  mapWrap: { flex: 1, minHeight: 360, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  muted: { color: colors.textMuted, fontSize: fontSize.sm },
  summary: { padding: spacing.lg, gap: spacing.lg },
  title: { color: colors.text, fontSize: fontSize.xl, fontWeight: '700', textTransform: 'capitalize' },
  metrics: { flexDirection: 'row', justifyContent: 'space-between' },
  value: { color: colors.text, fontSize: fontSize.lg, fontWeight: '700', textAlign: 'center' },
  label: { color: colors.textMuted, fontSize: fontSize.xs, textAlign: 'center' },
});
