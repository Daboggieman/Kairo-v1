import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { randomUUID } from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { LOCAL_USER_ID } from '@/constants';
import {
  appendNextMovementEvent,
  createMovementActivity,
  setMovementStatus,
} from '@/db/movement';
import { getUnitSystem } from '@/db/preferences';
import type { MovementType } from '@/db/types';
import { requestMovementPermissions, startMovementTracking } from '@/services/movementTracking';
import { colors, fontSize, radius, spacing } from '@/theme';

const TYPES: { type: MovementType; label: string; icon: 'run' | 'walk' | 'bike' }[] = [
  { type: 'run', label: 'Run', icon: 'run' },
  { type: 'walk', label: 'Walk', icon: 'walk' },
  { type: 'ride', label: 'Ride', icon: 'bike' },
];

export default function NewMovementScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const [activityType, setActivityType] = useState<MovementType>('run');
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    setStarting(true);
    setError(null);
    try {
      if (!(await requestMovementPermissions())) {
        setError('Location access is required for background route recording.');
        return;
      }
      const now = new Date().toISOString();
      const id = randomUUID();
      const unitSystem = await getUnitSystem(db, LOCAL_USER_ID);
      await createMovementActivity(db, {
        id, userId: LOCAL_USER_ID, activityType, startedAt: now, unitSystem,
      });
      await setMovementStatus(db, id, LOCAL_USER_ID, 'recording', now);
      await appendNextMovementEvent(db, {
        id: randomUUID(), userId: LOCAL_USER_ID, activityId: id,
        eventType: 'started', occurredAt: now,
      });
      await startMovementTracking();
      router.replace('/movement/active');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Movement tracking could not start.');
    } finally {
      setStarting(false);
    }
  }, [activityType, db, router]);

  return (
    <View style={styles.screen}>
      <Text style={styles.heading}>Choose activity</Text>
      <View style={styles.options}>
        {TYPES.map((option) => {
          const selected = option.type === activityType;
          return (
            <Pressable
              key={option.type}
              onPress={() => setActivityType(option.type)}
              style={[styles.option, selected && styles.optionSelected]}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
            >
              <MaterialCommunityIcons name={option.icon} size={30} color={selected ? colors.accentText : colors.text} />
              <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.permissionPanel}>
        <Text style={styles.permissionTitle}>Background location</Text>
        <Text style={styles.permissionBody}>Kairo records only while an activity is active. Android shows a persistent tracking notification.</Text>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.footer}><Button label="Start tracking" onPress={start} loading={starting} /></View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  heading: { color: colors.text, fontSize: fontSize.xl, fontWeight: '700' },
  options: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl },
  option: { flex: 1, minHeight: 104, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  optionSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  optionLabel: { color: colors.text, fontSize: fontSize.md, fontWeight: '700' },
  optionLabelSelected: { color: colors.accentText },
  permissionPanel: { marginTop: spacing.xl, paddingVertical: spacing.lg, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
  permissionTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: '700' },
  permissionBody: { color: colors.textMuted, fontSize: fontSize.sm, lineHeight: 20, marginTop: spacing.sm },
  error: { color: colors.danger, fontSize: fontSize.sm, marginTop: spacing.lg },
  footer: { marginTop: 'auto' },
});
