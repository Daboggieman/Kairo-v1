import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppBar, Card, CardHeader, EmptyState, Eyebrow, Notice, Screen, ScreenScroll, Section, StatStrip } from '@/components/Layout';
import { LogoLoader } from '@/components/Logo';
import { LOCAL_USER_ID } from '@/constants';
import { listTasks, completionDatesByTask } from '@/db/tasks';
import { listEntriesAscending } from '@/db/weight';
import { listSetsForRecords } from '@/db/workouts';
import { getUnitSystem, getWeekStart } from '@/db/preferences';
import { listMovementActivities, listRouteSamples, NO_LIMIT } from '@/db/movement';
import { movementRecords, perfectWeeks, workoutRecords, greatestWeightFall } from '@/domain/pantheon';
import { colors, layout, spacing, fontSize, lineHeight } from '@/theme';

export default function PantheonScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const [data, setData] = useState<ReturnType<typeof buildData> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    (async () => {
      try {
        const nowMs = Date.now();
        const [sets, samples, activities, tasks, completions, weights, unit, weekStart] = await Promise.all([
          listSetsForRecords(db, LOCAL_USER_ID),
          listRouteSamples(db, LOCAL_USER_ID),
          listMovementActivities(db, LOCAL_USER_ID, NO_LIMIT),
          listTasks(db, LOCAL_USER_ID),
          completionDatesByTask(db, LOCAL_USER_ID),
          listEntriesAscending(db, LOCAL_USER_ID),
          getUnitSystem(db, LOCAL_USER_ID),
          getWeekStart(db, LOCAL_USER_ID),
        ]);
        if (!cancelled) { setData(buildData({ sets, samples, activities, tasks, completions, weights, unit, weekStart, nowMs })); setError(null); }
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [db]));

  return (
    <Screen>
      <AppBar title="The Pantheon" onBack={() => router.back()} />
      <ScreenScroll>
      {error ? <Notice tone="danger" title="Could not read your feats">{error}</Notice> : null}
      {loading && !data ? <LogoLoader size={80} /> : null}
      {data && data.stats.length > 0 ? <StatStrip items={data.stats} /> : null}
      {data && data.records.length > 0 ? <Section title="The Forge"><Card>{data.records.map((record) => <View key={record.exerciseId} style={styles.row}><View style={styles.main}><Text style={styles.name}>{record.exerciseName}</Text><Text style={styles.detail}>{record.displayValue} · {new Date(record.sessionStartedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</Text></View>{record.isNew ? <Eyebrow tone="accent">NEW</Eyebrow> : null}</View>)}</Card></Section> : null}
      {data && data.movement.greatestClimb ? <Section title="The Expedition"><Card><CardHeader title="Greatest climb" /><Text style={styles.hero}>{data.movement.greatestClimb.displayValue}</Text></Card></Section> : null}
      {data && data.records.length === 0 && !data.movement.greatestClimb && data.stats.length === 0 ? <EmptyState title="No feats recorded" body="Feats are derived from your own records. Nothing here is a target." /> : null}
      <Text style={styles.footnote}>Feats are derived from your own records. Nothing here is a target.</Text>
      </ScreenScroll>
    </Screen>
  );
}

function buildData(input: any) {
  const records = workoutRecords(input.sets, input.unit === 'imperial' ? 'lb' : 'kg', input.nowMs);
  const movement = movementRecords(input.samples, input.unit, input.nowMs);
  const fall = greatestWeightFall(input.weights, input.nowMs);
  const perfect = perfectWeeks(input.tasks, input.completions, input.weekStart === 'sunday' ? 0 : 1, input.nowMs);
  const stats = [
    records[0] ? { label: 'Best lift', value: records[0].displayValue } : null,
    movement.greatestClimb ? { label: 'Greatest climb', value: movement.greatestClimb.displayValue } : null,
    fall !== null ? { label: 'Greatest fall', value: `${fall.toFixed(1)} kg` } : null,
    perfect > 0 ? { label: 'Perfect weeks', value: String(perfect) } : null,
  ].filter((item): item is { label: string; value: string } => item !== null);
  return { records, movement, stats };
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  main: { flex: 1 }, name: { color: colors.text, fontSize: fontSize.md, fontWeight: '600' }, detail: { color: colors.textMuted, fontSize: fontSize.sm, lineHeight: lineHeight.sm, marginTop: spacing.xs },
  hero: { color: colors.accent, fontSize: fontSize.xxl, fontWeight: '700', marginTop: spacing.sm },
  footnote: { color: colors.textMuted, fontSize: fontSize.sm, lineHeight: lineHeight.sm, marginTop: layout.sectionGap, marginBottom: spacing.lg },
});
