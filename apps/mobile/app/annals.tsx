import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppBar, Card, CardHeader, IconButton, Notice, RowGroup, Screen, ScreenScroll, Section, StatStrip } from '@/components/Layout';
import { LogoLoader } from '@/components/Logo';
import { LOCAL_USER_ID } from '@/constants';
import { getWeekStart } from '@/db/preferences';
import { getMacroTargetForDate, listNutritionEntriesBetween, listMacroTargetsBetween } from '@/db/macros';
import { completionDatesByTask, listTasks } from '@/db/tasks';
import { currentWeekRange, describeVerdict, weekLedger, weekNumber, weekRange, type DayLedger } from '@/domain/annals';
import { summariseEntries } from '@/domain/macros';
import { dayKeyFromNumber, dayOfWeek, todayNumber, WEEKDAY_LABELS } from '@/domain/dates';
import { colors, fontSize, lineHeight, spacing } from '@/theme';

type WeekState = {
  label: string;
  calories: number;
  offerings: number;
  targets: number;
  verdict: string;
  days: DayLedger[];
};

export default function AnnalsScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const [offset, setOffset] = useState(0);
  const [state, setState] = useState<WeekState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    (async () => {
      try {
        const nowMs = Date.now();
        const today = todayNumber(nowMs);
        const startPreference = await getWeekStart(db, LOCAL_USER_ID);
        const current = currentWeekRange(nowMs, startPreference);
        const range = weekRange(current.start + offset * 7, startPreference);
        // The opening target is fetched separately because `listMacroTargetsBetween` only returns
        // targets *set* within the range. A week that changed no target still has one in force, and
        // reading the range alone reports every day of it as having no decree.
        const [entries, changedTargets, opening, tasks, completions] = await Promise.all([
          listNutritionEntriesBetween(db, LOCAL_USER_ID, range.startKey, range.endKey),
          listMacroTargetsBetween(db, LOCAL_USER_ID, range.startKey, range.endKey),
          getMacroTargetForDate(db, LOCAL_USER_ID, range.startKey),
          listTasks(db, LOCAL_USER_ID),
          completionDatesByTask(db, LOCAL_USER_ID),
        ]);
        // `opening` may be one of `changedTargets` when a target was set on the first day itself.
        const targets = opening && !changedTargets.some((target) => target.id === opening.id)
          ? [opening, ...changedTargets]
          : changedTargets;
        const totals = summariseEntries(entries);
        const ledger = weekLedger({ tasks, completions, entries, targets, range, today });
        if (!cancelled) {
          setState({
            label: `Week ${weekNumber(range.start, startPreference)} · ${formatRange(range.start, range.end)}`,
            calories: totals.calories,
            offerings: entries.length,
            targets: changedTargets.length,
            verdict: describeVerdict(ledger),
            days: ledger.days,
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
      <Section title="The week"><RowGroup>{state.days.map((day) => <DayRow key={day.day} day={day} />)}</RowGroup></Section>
    </> : null}
    </ScreenScroll>
  </Screen>;
}

/**
 * One day of the strip.
 *
 * A future day is dimmed and says nothing — it is the one place dimming is right, because there is no
 * caveat to hide. Everything else states what it knows: the rites kept out of those owed, and whether
 * the decree broke. A day that owed nothing prints an em dash rather than "0/0", and a day with no
 * target or nothing logged prints nothing about the decree at all rather than implying it held.
 */
function DayRow({ day }: { day: DayLedger }) {
  const rites = day.due === 0 ? '—' : `${day.kept}/${day.due}`;
  return <View style={styles.day}>
    <Text style={[styles.dayLabel, day.future && styles.dayFuture]}>
      {`${WEEKDAY_LABELS[dayOfWeek(day.day)]} ${dayKeyFromNumber(day.day).slice(8)}`}
    </Text>
    {day.future ? null : <>
      <Text style={styles.dayRites}>{`${rites} rites`}</Text>
      {day.decreeSilent ? null : <Text style={day.decreeBroke ? styles.dayBroke : styles.dayHeld}>
        {day.decreeBroke ? 'Decree broke' : 'Decree held'}
      </Text>}
    </>}
  </View>;
}

function formatRange(start: number, end: number): string {
  const first = new Date(`${dayKeyFromNumber(start)}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const last = new Date(`${dayKeyFromNumber(end)}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${first} – ${last}`;
}

const styles = StyleSheet.create({ navigator: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, week: { color: colors.text, fontSize: fontSize.md, fontWeight: '600', flex: 1, textAlign: 'center' }, verdict: { color: colors.text, fontSize: fontSize.md, lineHeight: lineHeight.md }, day: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md }, dayLabel: { color: colors.text, fontSize: fontSize.sm, fontWeight: '600', width: 64 }, dayFuture: { color: colors.textMuted }, dayRites: { color: colors.textMuted, fontSize: fontSize.sm, flex: 1 }, dayHeld: { color: colors.textMuted, fontSize: fontSize.sm }, dayBroke: { color: colors.warning, fontSize: fontSize.sm, fontWeight: '600' } });
