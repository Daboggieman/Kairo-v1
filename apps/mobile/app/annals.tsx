import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppBar, Card, CardHeader, IconButton, Notice, RowGroup, Screen, ScreenScroll, Section, StatStrip } from '@/components/Layout';
import { LogoLoader } from '@/components/Logo';
import { LOCAL_USER_ID } from '@/constants';
import { getWeekStart } from '@/db/preferences';
import { listNutritionEntriesBetween, listMacroTargetsBetween } from '@/db/macros';
import { currentWeekRange, describeVerdict, weekNumber, weekRange } from '@/domain/annals';
import { summariseEntries } from '@/domain/macros';
import { dayKeyFromNumber, todayNumber } from '@/domain/dates';
import { colors, fontSize, lineHeight, spacing } from '@/theme';

export default function AnnalsScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const [offset, setOffset] = useState(0);
  const [state, setState] = useState<{ label: string; calories: number; offerings: number; targets: number; verdict: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    (async () => {
      try {
        const nowMs = Date.now();
        const startPreference = await getWeekStart(db, LOCAL_USER_ID);
        const current = currentWeekRange(nowMs, startPreference);
        const range = weekRange(current.start + offset * 7, startPreference);
        const [entries, targets] = await Promise.all([
          listNutritionEntriesBetween(db, LOCAL_USER_ID, range.startKey, range.endKey),
          listMacroTargetsBetween(db, LOCAL_USER_ID, range.startKey, range.endKey),
        ]);
        const totals = summariseEntries(entries);
        if (!cancelled) {
          setState({
            label: `Week ${weekNumber(range.start, startPreference)} · ${formatRange(range.start, range.end)}`,
            calories: totals.calories,
            offerings: entries.length,
            targets: targets.length,
            verdict: describeVerdict({ kept: 0, due: 0, macroDaysOver: 0 }),
          });
          setError(null);
        }
      } catch (caught) { if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught)); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [db, offset]));

  return <Screen>
    <AppBar title="The Annals" onBack={() => router.back()} />
    <ScreenScroll>
    <View style={styles.navigator}>
      <IconButton icon="chevron-left" label="Previous week" onPress={() => setOffset((value) => value - 1)} />
      <Text style={styles.week}>{state?.label ?? 'The week'}</Text>
      <IconButton icon="chevron-right" label="Next week" disabled={offset >= 0} onPress={() => setOffset((value) => Math.min(0, value + 1))} />
    </View>
    {error ? <Notice tone="danger" title="Could not read the week">{error}</Notice> : null}
    {loading && !state ? <LogoLoader size={80} /> : null}
    {state ? <>
      <Card><CardHeader title="The reckoning" /><Text style={styles.verdict}>{state.verdict}</Text></Card>
      <Section title="The Feast"><StatStrip items={[{ label: 'Offerings', value: String(state.offerings) }, { label: 'Calories', value: Math.round(state.calories).toLocaleString() }, { label: 'Decrees', value: String(state.targets) }]} /></Section>
      <Section title="The week"><RowGroup>{Array.from({ length: 7 }, (_, index) => <View key={index} style={styles.day}><Text style={styles.dayLabel}>{dayKeyFromNumber(todayNumber(Date.now()) - 6 + index).slice(5)}</Text></View>)}</RowGroup></Section>
    </> : null}
    </ScreenScroll>
  </Screen>;
}

function formatRange(start: number, end: number): string {
  const first = new Date(`${dayKeyFromNumber(start)}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const last = new Date(`${dayKeyFromNumber(end)}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${first} – ${last}`;
}

const styles = StyleSheet.create({ navigator: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, week: { color: colors.text, fontSize: fontSize.md, fontWeight: '600', flex: 1, textAlign: 'center' }, verdict: { color: colors.text, fontSize: fontSize.md, lineHeight: lineHeight.md }, day: { padding: spacing.md }, dayLabel: { color: colors.textMuted, fontSize: fontSize.sm } });
