import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { LOCAL_USER_ID } from '@/constants';
import {
  getMovementPreferences,
  getUnitSystem,
  MOVEMENT_AUTOPAUSE,
  MOVEMENT_DISTANCE_CUES,
  MOVEMENT_TIME_CUES,
  MOVEMENT_VOICE_CUES,
  setMovementPreference,
  setUnitSystem,
  type UnitSystem,
} from '@/db/preferences';
import { colors, fontSize, spacing } from '@/theme';

type Settings = Awaited<ReturnType<typeof getMovementPreferences>>;

export default function MovementSettingsScreen() {
  const db = useSQLiteContext();
  const [settings, setSettings] = useState<Settings>({
    voiceCues: true, distanceCues: true, timeCues: true, autopause: true,
  });
  const [units, setUnits] = useState<UnitSystem>('metric');

  useFocusEffect(useCallback(() => {
    void Promise.all([
      getMovementPreferences(db, LOCAL_USER_ID),
      getUnitSystem(db, LOCAL_USER_ID),
    ]).then(([loaded, loadedUnits]) => { setSettings(loaded); setUnits(loadedUnits); });
  }, [db]));

  const toggle = useCallback(async (
    field: keyof Settings,
    key: typeof MOVEMENT_VOICE_CUES | typeof MOVEMENT_DISTANCE_CUES |
      typeof MOVEMENT_TIME_CUES | typeof MOVEMENT_AUTOPAUSE,
    value: boolean,
  ) => {
    setSettings((current) => ({ ...current, [field]: value }));
    await setMovementPreference(db, LOCAL_USER_ID, key, value);
  }, [db]);

  const toggleUnits = useCallback(async () => {
    const next = units === 'metric' ? 'imperial' : 'metric';
    setUnits(next);
    await setUnitSystem(db, LOCAL_USER_ID, next);
  }, [db, units]);

  return (
    <View style={styles.screen}>
      <SettingRow label="Metric units" value={units === 'metric'} onChange={toggleUnits} />
      <SettingRow label="Voice cues" value={settings.voiceCues} onChange={(value) => void toggle('voiceCues', MOVEMENT_VOICE_CUES, value)} />
      <SettingRow label="Distance cues" value={settings.distanceCues} disabled={!settings.voiceCues} onChange={(value) => void toggle('distanceCues', MOVEMENT_DISTANCE_CUES, value)} />
      <SettingRow label="Time cues" value={settings.timeCues} disabled={!settings.voiceCues} onChange={(value) => void toggle('timeCues', MOVEMENT_TIME_CUES, value)} />
      <SettingRow label="Autopause" value={settings.autopause} onChange={(value) => void toggle('autopause', MOVEMENT_AUTOPAUSE, value)} />
    </View>
  );
}

function SettingRow({ label, value, disabled = false, onChange }: {
  label: string; value: boolean; disabled?: boolean; onChange: (value: boolean) => void;
}) {
  return (
    <View style={[styles.row, disabled && styles.disabled]}>
      <Text style={styles.label}>{label}</Text>
      <Switch value={value} disabled={disabled} onValueChange={onChange} trackColor={{ false: colors.border, true: colors.accent }} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg },
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.border },
  disabled: { opacity: 0.45 },
  label: { color: colors.text, fontSize: fontSize.md },
});
