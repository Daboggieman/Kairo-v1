import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { randomUUID } from 'expo-crypto';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

import { Button } from '@/components/Button';
import { LOCAL_USER_ID } from '@/constants';
import {
  editMovementActivity,
  getMovementActivity,
  listMovementPoints,
  trimMovementActivity,
} from '@/db/movement';
import type { MovementActivity, MovementPoint, MovementType } from '@/db/types';
import { formatDuration } from '@/domain/workouts';
import { colors, fontSize, spacing } from '@/theme';

export default function MovementDetailScreen() {
  const { activityId } = useLocalSearchParams<{ activityId: string }>();
  const db = useSQLiteContext();
  const router = useRouter();
  const [activity, setActivity] = useState<MovementActivity | null>(null);
  const [points, setPoints] = useState<MovementPoint[]>([]);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [activityType, setActivityType] = useState<MovementType>('run');

  const load = useCallback(async () => {
    if (!activityId) return;
    const [loadedActivity, loadedPoints] = await Promise.all([
      getMovementActivity(db, activityId, LOCAL_USER_ID),
      listMovementPoints(db, activityId),
    ]);
    setActivity(loadedActivity);
    setName(loadedActivity?.name ?? '');
    setActivityType(loadedActivity?.activityType ?? 'run');
    setPoints(loadedPoints);
    const included = loadedPoints.filter(
      (point) => point.processingState === 'accepted' && !point.excludedByEdit,
    );
    setTrimStart(included[0]?.sequence ?? 0);
    setTrimEnd(included.at(-1)?.sequence ?? 0);
  }, [activityId, db]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const acceptedRaw = useMemo(
    () => points.filter((point) => point.processingState === 'accepted'),
    [points],
  );

  const applyTrim = useCallback(async () => {
    if (!activityId || trimStart > trimEnd) return;
    setSaving(true);
    try {
      await trimMovementActivity(db, {
        id: activityId,
        userId: LOCAL_USER_ID,
        firstSequence: trimStart,
        lastSequence: trimEnd,
        eventId: randomUUID(),
        updatedAt: new Date().toISOString(),
      });
      await load();
    } finally { setSaving(false); }
  }, [activityId, db, load, trimEnd, trimStart]);

  const saveDetails = useCallback(async () => {
    if (!activityId) return;
    setSaving(true);
    try {
      await editMovementActivity(db, {
        id: activityId, userId: LOCAL_USER_ID, name: name.trim() || null,
        activityType, updatedAt: new Date().toISOString(),
      });
      await load();
    } finally { setSaving(false); }
  }, [activityId, activityType, db, load, name]);

  if (!activity) return <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>;
  const coordinates = points
    .filter((point) => point.processingState === 'accepted' && !point.excludedByEdit)
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
      <ScrollView style={styles.summaryScroll} contentContainerStyle={styles.summary}>
        <Text style={styles.title}>{activity.name || activity.activityType}</Text>
        <View style={styles.metrics}>
          <View><Text style={styles.value}>{(activity.distanceMeters / 1000).toFixed(2)}</Text><Text style={styles.label}>kilometers</Text></View>
          <View><Text style={styles.value}>{formatDuration(activity.movingSeconds)}</Text><Text style={styles.label}>moving</Text></View>
          <View><Text style={styles.value}>{activity.revision}</Text><Text style={styles.label}>revision</Text></View>
        </View>
        <Button label="Replay route" disabled={coordinates.length < 2} onPress={() => router.push({ pathname: '/movement/replay', params: { activityId } })} />
        <View style={styles.editPanel}>
          <Text style={styles.trimTitle}>Activity details</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Activity name"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />
          <View style={styles.typeRow}>{(['run', 'walk', 'ride'] as const).map((type) => (
            <Pressable
              key={type}
              accessibilityRole="radio"
              accessibilityState={{ selected: activityType === type }}
              onPress={() => setActivityType(type)}
              style={[styles.typeOption, activityType === type && styles.typeOptionSelected]}
            ><Text style={[styles.typeText, activityType === type && styles.typeTextSelected]}>{type}</Text></Pressable>
          ))}</View>
          <Button label="Save details" loading={saving} onPress={() => { void saveDetails(); }} />
        </View>
        {acceptedRaw.length >= 2 ? <View style={styles.trimPanel}>
          <Text style={styles.trimTitle}>Trim route</Text>
          <View style={styles.trimRow}>
            <TrimControl
              label="Start"
              value={trimStart}
              onDecrease={() => setTrimStart((value) => Math.max(acceptedRaw[0].sequence, value - 1))}
              onIncrease={() => setTrimStart((value) => Math.min(trimEnd, value + 1))}
            />
            <TrimControl
              label="End"
              value={trimEnd}
              onDecrease={() => setTrimEnd((value) => Math.max(trimStart, value - 1))}
              onIncrease={() => setTrimEnd((value) => Math.min(acceptedRaw.at(-1)?.sequence ?? value, value + 1))}
            />
          </View>
          <Button
            label="Apply trim"
            loading={saving}
            onPress={() => Alert.alert(
              'Apply route trim?',
              'Raw GPS points will be retained and the activity summary will be recalculated.',
              [{ text: 'Cancel', style: 'cancel' }, { text: 'Apply', onPress: () => { void applyTrim(); } }],
            )}
          />
        </View> : null}
      </ScrollView>
    </View>
  );
}

function TrimControl({ label, value, onDecrease, onIncrease }: {
  label: string; value: number; onDecrease: () => void; onIncrease: () => void;
}) {
  return <View style={styles.trimControl}>
    <Text style={styles.label}>{label} point</Text>
    <View style={styles.stepper}>
      <Pressable accessibilityLabel={`Move ${label.toLowerCase()} backward`} onPress={onDecrease} style={styles.iconButton}>
        <MaterialCommunityIcons name="minus" size={22} color={colors.text} />
      </Pressable>
      <Text style={styles.sequence}>{value}</Text>
      <Pressable accessibilityLabel={`Move ${label.toLowerCase()} forward`} onPress={onIncrease} style={styles.iconButton}>
        <MaterialCommunityIcons name="plus" size={22} color={colors.text} />
      </Pressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  mapWrap: { flex: 1, minHeight: 360, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  muted: { color: colors.textMuted, fontSize: fontSize.sm },
  summary: { padding: spacing.lg, gap: spacing.lg },
  summaryScroll: { maxHeight: '55%' },
  title: { color: colors.text, fontSize: fontSize.xl, fontWeight: '700', textTransform: 'capitalize' },
  metrics: { flexDirection: 'row', justifyContent: 'space-between' },
  value: { color: colors.text, fontSize: fontSize.lg, fontWeight: '700', textAlign: 'center' },
  label: { color: colors.textMuted, fontSize: fontSize.xs, textAlign: 'center' },
  trimPanel: { gap: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.lg },
  editPanel: { gap: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.lg },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: spacing.md, fontSize: fontSize.md },
  typeRow: { flexDirection: 'row', borderWidth: 1, borderColor: colors.border },
  typeOption: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  typeOptionSelected: { backgroundColor: colors.accent },
  typeText: { color: colors.text, fontSize: fontSize.sm, textTransform: 'capitalize', fontWeight: '700' },
  typeTextSelected: { color: colors.accentText },
  trimTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: '700' },
  trimRow: { flexDirection: 'row', gap: spacing.md },
  trimControl: { flex: 1, gap: spacing.sm },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  sequence: { color: colors.text, fontSize: fontSize.sm, fontWeight: '700' },
});
