import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { randomUUID } from 'expo-crypto';
import * as Speech from 'expo-speech';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

import { Button } from '@/components/Button';
import { LOCAL_USER_ID } from '@/constants';
import {
  completeMovementActivity,
  appendNextMovementEvent,
  getActiveMovementActivity,
  listMovementPoints,
  setMovementStatus,
} from '@/db/movement';
import type { MovementActivity, MovementPoint } from '@/db/types';
import { stopMovementTracking } from '@/services/movementTracking';
import { getMovementPreferences, getUnitSystem, type UnitSystem } from '@/db/preferences';
import { formatMovementDistance, formatMovementSpeed, formatPace } from '@/domain/movement';
import { formatDuration } from '@/domain/workouts';
import { colors, fontSize, spacing } from '@/theme';

export default function ActiveMovementScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const [activity, setActivity] = useState<MovementActivity | null>(null);
  const [points, setPoints] = useState<MovementPoint[]>([]);
  const [finishing, setFinishing] = useState(false);
  const [units, setUnits] = useState<UnitSystem>('metric');
  const mapRef = useRef<MapView>(null);

  const load = useCallback(async () => {
    const current = await getActiveMovementActivity(db, LOCAL_USER_ID);
    setActivity(current);
    const [nextPoints, unitSystem] = await Promise.all([
      current ? listMovementPoints(db, current.id) : Promise.resolve([]),
      getUnitSystem(db, LOCAL_USER_ID),
    ]);
    setPoints(nextPoints);
    setUnits(unitSystem);
  }, [db]);

  useFocusEffect(useCallback(() => {
    void load();
    const timer = setInterval(() => { void load(); }, 2000);
    return () => clearInterval(timer);
  }, [load]));

  const togglePause = useCallback(async () => {
    if (!activity) return;
    const paused = activity.status === 'manually_paused' || activity.status === 'auto_paused';
    const occurredAt = new Date().toISOString();
    const status = paused ? 'recording' : 'manually_paused';
    const eventType = paused ? 'manual_resumed' : 'manual_paused';
    await setMovementStatus(db, activity.id, LOCAL_USER_ID, status, occurredAt);
    await appendNextMovementEvent(db, {
      id: randomUUID(), userId: LOCAL_USER_ID, activityId: activity.id,
      eventType, occurredAt, payload: { source: 'button' },
    });
    if ((await getMovementPreferences(db, LOCAL_USER_ID)).voiceCues) {
      Speech.speak(paused ? 'Resuming' : 'Paused');
    }
    await load();
  }, [activity, db, load]);

  const finish = useCallback(async () => {
    if (!activity) return;
    setFinishing(true);
    try {
      await stopMovementTracking();
      const endedAt = new Date().toISOString();
      await appendNextMovementEvent(db, {
        id: randomUUID(), userId: LOCAL_USER_ID, activityId: activity.id,
        eventType: 'finished', occurredAt: endedAt,
      });
      await completeMovementActivity(db, { id: activity.id, userId: LOCAL_USER_ID, endedAt });
      if ((await getMovementPreferences(db, LOCAL_USER_ID)).voiceCues) {
        Speech.speak('Activity complete');
      }
      router.replace('/movement');
    } finally { setFinishing(false); }
  }, [activity, db, router]);

  if (!activity) return <View style={styles.center}><ActivityIndicator color={colors.accent} /><Text style={styles.muted}>Recovering active movement…</Text></View>;
  const accepted = points.filter(
    (point) => point.processingState === 'accepted' && !point.excludedByEdit,
  );
  const coordinates = accepted.map((point) => ({ latitude: point.latitude, longitude: point.longitude }));
  const latest = coordinates.at(-1);
  const paused = activity.status === 'manually_paused' || activity.status === 'auto_paused';
  const autoPaused = activity.status === 'auto_paused';
  const distance = formatMovementDistance(activity.distanceMeters, units);
  const averageSpeed = activity.movingSeconds > 0
    ? activity.distanceMeters / activity.movingSeconds
    : 0;
  const performance = activity.activityType === 'ride'
    ? { value: formatMovementSpeed(averageSpeed, units), label: units === 'metric' ? 'km/h' : 'mph' }
    : {
      value: formatPace(activity.distanceMeters > 0
        ? activity.movingSeconds / (activity.distanceMeters / 1000)
        : Number.POSITIVE_INFINITY, units),
      label: units === 'metric' ? 'pace /km' : 'pace /mi',
    };

  return (
    <View style={styles.screen}>
      <View style={styles.mapWrap}>
        {latest ? (
          <MapView ref={mapRef} style={StyleSheet.absoluteFill} initialRegion={{ ...latest, latitudeDelta: 0.008, longitudeDelta: 0.008 }}>
            <Polyline coordinates={coordinates} strokeColor={colors.accent} strokeWidth={5} />
            <Marker coordinate={latest} />
          </MapView>
        ) : <View style={styles.center}><ActivityIndicator color={colors.accent} /><Text style={styles.muted}>Waiting for a GPS fix</Text></View>}
      </View>
      {latest ? <Pressable
        style={styles.recenter}
        accessibilityRole="button"
        accessibilityLabel="Recenter map"
        onPress={() => mapRef.current?.animateToRegion({ ...latest, latitudeDelta: 0.008, longitudeDelta: 0.008 }, 300)}
      ><MaterialCommunityIcons name="crosshairs-gps" size={24} color={colors.text} /></Pressable> : null}
      {autoPaused ? <View style={styles.autoPaused}><Text style={styles.autoPausedText}>AUTOPAUSED</Text></View> : null}
      <View style={styles.metrics}>
        <View style={styles.metric}><Text style={styles.metricValue}>{distance.value}</Text><Text style={styles.metricLabel}>{distance.label}</Text></View>
        <View style={styles.metric}><Text style={styles.metricValue}>{formatDuration(activity.movingSeconds)}</Text><Text style={styles.metricLabel}>moving</Text></View>
        <View style={styles.metric}><Text style={styles.metricValue}>{formatDuration(activity.elapsedSeconds)}</Text><Text style={styles.metricLabel}>elapsed</Text></View>
        <View style={styles.metric}><Text style={styles.metricValue}>{performance.value}</Text><Text style={styles.metricLabel}>{performance.label}</Text></View>
      </View>
      <View style={styles.controls}>
        <Pressable style={styles.pauseButton} onPress={togglePause}>
          <MaterialCommunityIcons name={paused ? 'play' : 'pause'} size={30} color={colors.text} />
          <Text style={styles.pauseLabel}>{paused ? 'Resume' : 'Pause'}</Text>
        </Pressable>
        <Button label="Finish" variant="danger" loading={finishing} onPress={() => Alert.alert('Finish activity?', 'Your route will be saved to movement history.', [{ text: 'Keep going', style: 'cancel' }, { text: 'Finish', style: 'destructive', onPress: () => { void finish(); } }])} style={styles.finishButton} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  mapWrap: { flex: 1, minHeight: 320, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, backgroundColor: colors.background },
  muted: { color: colors.textMuted, fontSize: fontSize.sm },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', padding: spacing.lg, borderTopWidth: 1, borderColor: colors.border },
  metric: { width: '50%', paddingVertical: spacing.sm },
  metricValue: { color: colors.text, fontSize: fontSize.xl, fontWeight: '700', textAlign: 'center' },
  metricLabel: { color: colors.textMuted, fontSize: fontSize.xs, textAlign: 'center', marginTop: spacing.xs },
  controls: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  pauseButton: { width: 88, height: 64, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  pauseLabel: { color: colors.text, fontSize: fontSize.xs },
  finishButton: { flex: 1 },
  recenter: { position: 'absolute', right: spacing.lg, top: spacing.lg, width: 44, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  autoPaused: { position: 'absolute', top: spacing.lg, left: spacing.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.accent, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  autoPausedText: { color: colors.accent, fontSize: fontSize.xs, fontWeight: '700' },
});
