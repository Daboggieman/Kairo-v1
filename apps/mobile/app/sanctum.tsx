import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import * as FileSystem from 'expo-file-system/legacy';
import { useCallback, useState } from 'react';
import { Alert, Platform, StyleSheet, Text, View } from 'react-native';

import { AppBar, Card, Chip, Notice, NavRow, RowGroup, Screen, ScreenScroll, Section } from '@/components/Layout';
import { KairoMark } from '@/components/Logo';
import { LOCAL_USER_ID } from '@/constants';
import { exportEverything, razeLocalData } from '@/db/maintenance';
import { getUnitSystem, getWeekStart, setUnitSystem, setWeekStart, type UnitSystem, type WeekStart } from '@/db/preferences';
import { shareFile, sharingAvailable } from '@/services/sharing';
import Constants from 'expo-constants';
import { SCHEMA_VERSION } from '@/db/schema';
import { IS_EXPO_GO } from '@/services/runtime';
import { colors, fontSize, lineHeight, spacing, layout } from '@/theme';

export default function SanctumScreen() {
  const db = useSQLiteContext(); const router = useRouter();
  const [unit, setUnit] = useState<UnitSystem>('metric'); const [week, setWeek] = useState<WeekStart>('monday');
  const [message, setMessage] = useState<string | null>(null);
  useFocusEffect(useCallback(() => { let cancelled = false; void (async () => { const [u, w] = await Promise.all([getUnitSystem(db, LOCAL_USER_ID), getWeekStart(db, LOCAL_USER_ID)]); if (!cancelled) { setUnit(u); setWeek(w); } })(); return () => { cancelled = true; }; }, [db]));
  async function chooseUnit(next: UnitSystem) { setUnit(next); await setUnitSystem(db, LOCAL_USER_ID, next); }
  async function chooseWeek(next: WeekStart) { setWeek(next); await setWeekStart(db, LOCAL_USER_ID, next); }
  async function exportData() { try { const json = await exportEverything(db); const uri = `${FileSystem.cacheDirectory}kairo-export.json`; await FileSystem.writeAsStringAsync(uri, json); if (!(await shareFile(uri))) setMessage(`Export written to ${uri}`); } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); } }
  function raze() { Alert.alert('Raze local data?', 'This deletes all local records and returns to The Gates.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Raze', style: 'destructive', onPress: () => void razeLocalData(db, LOCAL_USER_ID).then(() => router.replace('/gates')) }]); }
  return <Screen><AppBar title="The Sanctum" onBack={() => router.back()} /><ScreenScroll>
    {message ? <Notice tone="danger" title="Sanctum">{message}</Notice> : null}
    <View style={styles.identity}><View style={styles.mark}><KairoMark height={44} /></View><View><Text style={styles.brand}>KAIRO</Text><Text style={styles.hint}>Version {Constants.expoConfig?.version ?? '1.0.0'}</Text></View></View>
    <Section title="The Foundations"><Card><View style={styles.foundationRow}><Text style={styles.label}>Database</Text><Text style={styles.hint}>{`Schema ${SCHEMA_VERSION}`}</Text></View><View style={styles.measureDivider} /><View style={styles.foundationRow}><Text style={styles.label}>Runtime</Text><Text style={styles.hint}>{IS_EXPO_GO ? 'Expo Go' : 'Development build'}</Text></View><View style={styles.measureDivider} /><View style={styles.foundationRow}><Text style={styles.label}>Device</Text><Text style={styles.hint}>{`${Platform.OS} ${String(Platform.Version)}`}</Text></View></Card></Section>
    <Section title="The Measures"><Card><View style={styles.measureRow}><View style={styles.measureCopy}><Text style={styles.label}>Units</Text><Text style={styles.hint}>Weight and distance</Text></View><View style={styles.chips}><Chip role="radio" label="KG / KM" selected={unit === 'metric'} onPress={() => void chooseUnit('metric')} style={styles.measureChip} /><Chip role="radio" label="LB / MI" selected={unit === 'imperial'} onPress={() => void chooseUnit('imperial')} style={styles.measureChip} /></View></View><View style={styles.measureDivider} /><View style={styles.measureRow}><View style={styles.measureCopy}><Text style={styles.label}>Week starts</Text><Text style={styles.hint}>Calendar reckoning</Text></View><View style={styles.chips}><Chip role="radio" label="MON" selected={week === 'monday'} onPress={() => void chooseWeek('monday')} style={styles.measureChip} /><Chip role="radio" label="SUN" selected={week === 'sunday'} onPress={() => void chooseWeek('sunday')} style={styles.measureChip} /></View></View></Card></Section>
    <Section title="The Herald"><Card><RowGroup><NavRow label="Reminders" detail="The Call" onPress={() => router.push('/alarms')} /><NavRow label="Movement cues" detail="The Compass" onPress={() => router.push('/movement/settings')} /></RowGroup></Card></Section>
    <Section title="The Envoy"><Card><RowGroup><NavRow label="Sync status" detail="Open the Envoy" onPress={() => router.push('/envoy')} /></RowGroup></Card></Section>
    <Section title="The Record"><Card><RowGroup><NavRow label="The Pantheon" onPress={() => router.push('/pantheon')} /><NavRow label="The Annals" onPress={() => router.push('/annals')} /><NavRow label="Export everything" detail={sharingAvailable() ? 'JSON file' : 'Write JSON to device'} onPress={() => void exportData()} /><NavRow label="Raze local data" detail="Delete and begin again" onPress={raze} /></RowGroup></Card></Section>
    <Text style={styles.footnote}>The Sanctum keeps the measures, the records, and the threshold.</Text>
  </ScreenScroll></Screen>;
}
const styles = StyleSheet.create({ identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingBottom: layout.cardPadding, borderBottomWidth: 1, borderBottomColor: colors.border }, mark: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, brand: { color: colors.accent, fontSize: fontSize.lg, fontWeight: '700' }, label: { color: colors.text, fontSize: fontSize.md, fontWeight: '600' }, hint: { color: colors.textMuted, fontSize: fontSize.sm, lineHeight: lineHeight.sm }, foundationRow: { gap: spacing.xs, paddingVertical: spacing.sm }, measureRow: { gap: spacing.md, paddingVertical: spacing.sm }, measureCopy: { gap: spacing.xs }, measureDivider: { height: 1, backgroundColor: colors.border }, chips: { flexDirection: 'row', gap: spacing.sm }, measureChip: { flex: 1 }, footnote: { color: colors.textMuted, fontSize: fontSize.sm, lineHeight: lineHeight.sm, textAlign: 'center', marginTop: spacing.md } });
