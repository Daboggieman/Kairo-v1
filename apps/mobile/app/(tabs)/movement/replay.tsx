import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

import { listMovementPoints } from '@/db/movement';
import { getUnitSystem, type UnitSystem } from '@/db/preferences';
import type { MovementPoint } from '@/db/types';
import { LOCAL_USER_ID } from '@/constants';
import { formatMovementDistance, replayFrameAt } from '@/domain/movement';
import { colors, fontSize, spacing } from '@/theme';

export default function MovementReplayScreen() {
  const { activityId } = useLocalSearchParams<{ activityId: string }>();
  const db = useSQLiteContext();
  const [points, setPoints] = useState<MovementPoint[]>([]);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [units, setUnits] = useState<UnitSystem>('metric');
  const [trackWidth, setTrackWidth] = useState(1);

  useEffect(() => {
    if (!activityId) return;
    void Promise.all([
      listMovementPoints(db, activityId),
      getUnitSystem(db, LOCAL_USER_ID),
    ]).then(([route, unitSystem]) => {
      setPoints(route);
      setUnits(unitSystem);
    });
  }, [activityId, db]);
  const accepted = useMemo(() => points.filter((point) => point.processingState === 'accepted'), [points]);
  const replayPoints = accepted.map((point) => ({
    latitude: point.latitude,
    longitude: point.longitude,
    recordedAtMs: new Date(point.recordedAt).getTime(),
    cumulativeDistanceMeters: point.cumulativeDistanceMeters,
  }));
  const start = replayPoints[0]?.recordedAtMs ?? 0;
  const end = replayPoints.at(-1)?.recordedAtMs ?? start;
  const frame = replayFrameAt(replayPoints, start + (end - start) * progress);

  useEffect(() => {
    if (!playing || end <= start) return;
    const timer = setInterval(() => {
      setProgress((current) => {
        const next = current + (50 * speed) / 60_000;
        if (next >= 1) { setPlaying(false); return 1; }
        return next;
      });
    }, 50);
    return () => clearInterval(timer);
  }, [end, playing, speed, start]);

  if (!frame) return <View style={styles.center}><Text style={styles.muted}>No route available for replay</Text></View>;
  const coordinates = replayPoints.map((point) => ({ latitude: point.latitude, longitude: point.longitude }));
  const distance = formatMovementDistance(frame.cumulativeDistanceMeters, units);

  return (
    <View style={styles.screen}>
      <MapView style={styles.map} region={{ latitude: frame.latitude, longitude: frame.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 }}>
        <Polyline coordinates={coordinates} strokeColor={colors.border} strokeWidth={4} />
        <Polyline coordinates={coordinates.slice(0, Math.max(1, Math.ceil(coordinates.length * progress)))} strokeColor={colors.accent} strokeWidth={5} />
        <Marker coordinate={{ latitude: frame.latitude, longitude: frame.longitude }} />
      </MapView>
      <View style={styles.panel}>
        <Text style={styles.distance}>{distance.value} {distance.label}</Text>
        <Pressable
          style={styles.track}
          onLayout={(event) => setTrackWidth(Math.max(1, event.nativeEvent.layout.width))}
          onPress={(event) => setProgress(Math.max(0, Math.min(1, event.nativeEvent.locationX / trackWidth)))}
        >
          <View style={[styles.fill, { width: `${progress * 100}%` }]} />
        </Pressable>
        <View style={styles.controls}>
          <Pressable onPress={() => setProgress(0)}><MaterialCommunityIcons name="restart" color={colors.text} size={30} /></Pressable>
          <Pressable style={styles.play} onPress={() => setPlaying((value) => !value)}><MaterialCommunityIcons name={playing ? 'pause' : 'play'} color={colors.accentText} size={32} /></Pressable>
          <Pressable onPress={() => setSpeed((value) => value === 8 ? 1 : value * 2)}><Text style={styles.speed}>{speed}x</Text></Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  map: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  muted: { color: colors.textMuted, fontSize: fontSize.sm },
  panel: { padding: spacing.xl, gap: spacing.lg },
  distance: { color: colors.text, fontSize: fontSize.xl, fontWeight: '700', textAlign: 'center' },
  track: { width: '100%', maxWidth: 600, height: 12, alignSelf: 'center', backgroundColor: colors.border },
  fill: { height: 12, backgroundColor: colors.accent },
  controls: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  play: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  speed: { color: colors.text, fontSize: fontSize.md, fontWeight: '700', width: 40, textAlign: 'center' },
});
