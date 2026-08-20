/**
 * The Anvil — the screen used mid-workout, with a bar in your hands.
 *
 * Everything here follows from that: large tap targets, weight/reps pre-filled from the
 * last time this lift was performed (`suggestNextSet`), and the rest timer visible without
 * scrolling. Each logged set writes to SQLite immediately, so the session survives the app
 * being killed between sets.
 *
 * Three deliberate departures from `5.7_the_anvil`:
 *
 * - **The kg/lb toggle stays; the +/- weight steppers do not.** The design hardcodes "WEIGHT (KG)"
 *   and spends that slot on steppers. The unit is real data — `setVolume` normalises through `toKg`
 *   and `suggestNextSet` returns the unit the lift was last logged in — so a screen that cannot
 *   change it would silently record pounds as kilograms.
 * - **"Add another lift" is dropped.** The design has both it and the card's own "Change", but in
 *   this data model they are one action: `selectExercise` swaps the current lift, and a set logged
 *   afterwards opens a new group. Two controls calling the same function is two names for one thing.
 * - **The set rows carry the estimated 1RM, not the rest interval.** That is the design's choice and
 *   the more useful of the two here, where the live rest is already 56px tall at the top of the
 *   screen. The recorded interval is not lost — The Stele shows it per set.
 *
 * `Finish session` sits at the end of the content rather than in a docked footer. A permanently
 * docked bar and a `KeyboardAvoidingView` fight each other over the same space the moment the reps
 * field takes focus, and the finish action is the one thing on this screen you are never in a hurry
 * to reach.
 */

import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import {
  AppBar,
  Card,
  CardAction,
  CardHeader,
  Chip,
  EmptyState,
  Eyebrow,
  Field,
  Meander,
  Notice,
  Screen,
  ScreenScroll,
  Section,
  StatStrip,
} from '@/components/Layout';
import { RestTimer } from '@/components/RestTimer';
import { SessionElapsed } from '@/components/SessionElapsed';
import type { WeightUnit, WorkoutSet } from '@/db/types';
import { lastSetForExercise } from '@/db/workouts';
import { parseDecimalInput } from '@/domain/numbers';
import {
  estimateOneRepMax,
  formatTonnage,
  formatWeight,
  groupByExercise,
  nextSetNumber,
  sessionVolume,
  suggestNextSet,
  toKg,
} from '@/domain/workouts';
import { useWorkoutStore } from '@/store/workoutStore';
import { colors, fontSize, layout, lineHeight, spacing, type as typeScale } from '@/theme';

const UNITS: WeightUnit[] = ['kg', 'lb'];

const UNIT_NAMES: Record<WeightUnit, string> = { kg: 'Kilograms', lb: 'Pounds' };

/** "1RM 103 kg" — the estimate this set implies, rounded to the kilogram. */
function formatOneRepMax(set: Pick<WorkoutSet, 'reps' | 'weight' | 'weightUnit'>): string {
  return `1RM ${Math.round(estimateOneRepMax(toKg(set.weight, set.weightUnit), set.reps))} kg`;
}

export default function AnvilScreen() {
  const db = useSQLiteContext();
  const router = useRouter();

  const sessionId = useWorkoutStore((state) => state.sessionId);
  const startedAt = useWorkoutStore((state) => state.startedAt);
  const sets = useWorkoutStore((state) => state.sets);
  const currentExercise = useWorkoutStore((state) => state.currentExercise);
  const restStartedAt = useWorkoutStore((state) => state.restStartedAt);
  const hydrate = useWorkoutStore((state) => state.hydrate);
  const logSet = useWorkoutStore((state) => state.logSet);
  const endSession = useWorkoutStore((state) => state.endSession);

  const [reps, setReps] = useState('8');
  const [weight, setWeight] = useState('0');
  const [unit, setUnit] = useState<WeightUnit>('kg');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The last set of the current lift, kept only to print "Last time" under its name. */
  const [previousSet, setPreviousSet] = useState<WorkoutSet | null>(null);

  useFocusEffect(
    useCallback(() => {
      // Deep-linking straight here (or a reload in dev) lands with an empty store.
      if (!sessionId) {
        void hydrate(db).catch((caught: unknown) => {
          setError(caught instanceof Error ? caught.message : String(caught));
        });
      }
    }, [db, hydrate, sessionId]),
  );

  // Pre-fill from the last time this lift was performed — the auto-suggest from
  // `04-feature-specs.md`. Runs on exercise change, never on every keystroke.
  useEffect(() => {
    if (!currentExercise) return;
    let cancelled = false;
    (async () => {
      try {
        const previous = await lastSetForExercise(db, currentExercise.id);
        if (cancelled) return;
        const suggestion = suggestNextSet(previous, unit);
        setPreviousSet(previous);
        setReps(String(suggestion.reps));
        setWeight(String(suggestion.weight));
        setUnit(suggestion.weightUnit);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
      }
    })();
    return () => {
      cancelled = true;
    };
    // `unit` is read for the no-history fallback only; re-running on a unit toggle would
    // overwrite what the user just typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentExercise, db]);

  const parsedReps = Number.parseInt(reps, 10);
  const parsedWeight = parseDecimalInput(weight);
  const canLog =
    !!currentExercise &&
    Number.isFinite(parsedReps) &&
    parsedReps > 0 &&
    Number.isFinite(parsedWeight) &&
    parsedWeight >= 0;

  const onLogSet = useCallback(async () => {
    if (!canLog || !currentExercise) return;
    setSaving(true);
    try {
      await logSet(db, {
        exerciseId: currentExercise.id,
        reps: parsedReps,
        weight: parsedWeight,
        weightUnit: unit,
      });
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }, [canLog, currentExercise, db, logSet, parsedReps, parsedWeight, unit]);

  const onFinish = useCallback(async () => {
    try {
      await endSession(db);
      router.replace('/workouts');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [db, endSession, router]);

  if (!sessionId) {
    return (
      <Screen>
        <AppBar title="The Anvil" onBack={() => router.back()} />
        <EmptyState
          title="The anvil is bare"
          body="No session is open. Kindle the forge and the anvil is ready."
          action={
            <Button
              label="Back to the forge"
              variant="secondary"
              onPress={() => router.replace('/workouts')}
            />
          }
        />
      </Screen>
    );
  }

  const groups = groupByExercise(sets);

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <AppBar
        title="The Anvil"
        onBack={() => router.back()}
        action={<SessionElapsed startedAt={startedAt} style={styles.barClock} />}
      />
      <RestTimer startedAt={restStartedAt} />

      <ScreenScroll>
        {error ? (
          <Notice tone="danger" title="The strike was not recorded">
            {error}
          </Notice>
        ) : null}

        <StatStrip
          items={[
            { label: 'Strikes', value: `${sets.length}`, tone: 'accent' },
            { label: 'Tonnage', value: formatTonnage(sessionVolume(sets)) },
            { label: 'Lifts', value: `${groups.length}` },
          ]}
        />

        <Card>
          {/*
            The whole heading is the target, and "CHANGE" only says where it goes — the same
            contract `CardAction` has everywhere else. A nested pressable inside a pressable gives
            two overlapping hit areas and a screen reader two ways to do one thing.
          */}
          <Pressable
            onPress={() => router.push('/workouts/exercises')}
            accessibilityRole="button"
            accessibilityLabel={
              currentExercise ? `Change lift, currently ${currentExercise.name}` : 'Choose a lift'
            }
            style={({ pressed }) => [styles.lift, pressed && styles.pressed]}
          >
            <View style={styles.liftText}>
              <Eyebrow tone="accent">Current lift</Eyebrow>
              <Text style={styles.liftName}>
                {currentExercise ? currentExercise.name : 'Choose a lift'}
              </Text>
              {previousSet && currentExercise ? (
                <Text style={styles.liftLast}>
                  {`Last time · ${previousSet.reps} × ${formatWeight(previousSet.weight, previousSet.weightUnit)}`}
                </Text>
              ) : null}
            </View>
            <CardAction label={currentExercise ? 'Change' : 'Choose'} />
          </Pressable>

          {currentExercise ? (
            <>
              <View style={styles.entryRow}>
                <Field
                  label="Reps"
                  style={styles.entryField}
                  value={reps}
                  onChangeText={setReps}
                  keyboardType="number-pad"
                  selectTextOnFocus
                />
                <Field
                  label={`Weight (${unit})`}
                  style={styles.entryField}
                  value={weight}
                  onChangeText={setWeight}
                  keyboardType="decimal-pad"
                  selectTextOnFocus
                />
              </View>

              <View style={styles.unitRow}>
                {UNITS.map((option) => (
                  <Chip
                    key={option}
                    label={option}
                    selected={unit === option}
                    onPress={() => setUnit(option)}
                    accessibilityLabel={UNIT_NAMES[option]}
                    style={styles.unitChip}
                  />
                ))}
              </View>

              <Button
                label={`Strike — log set ${nextSetNumber(sets, currentExercise.id)}`}
                onPress={() => void onLogSet()}
                disabled={!canLog}
                loading={saving}
              />
            </>
          ) : null}
        </Card>

        {groups.length > 0 ? (
          <>
            <Meander style={styles.ornament} />

            <Section title="Strikes this session">
              {groups.map((group) => (
                <Card key={group.exerciseId}>
                  <CardHeader title={group.exerciseName} tone="accent" />
                  <View style={styles.strikes}>
                    {group.sets.map((set) => (
                      <View key={set.id} style={styles.strikeRow}>
                        <View style={styles.strikeNumber}>
                          <Text style={styles.strikeNumberText}>{set.setNumber}</Text>
                        </View>
                        <Text style={styles.strikeDetail} numberOfLines={1}>
                          {`${set.reps} reps · ${formatWeight(set.weight, set.weightUnit)}`}
                        </Text>
                        <Text style={styles.strikeMeta}>{formatOneRepMax(set)}</Text>
                      </View>
                    ))}
                  </View>
                </Card>
              ))}
            </Section>
          </>
        ) : null}

        <Button label="Finish session" variant="danger" onPress={() => void onFinish()} />
      </ScreenScroll>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  barClock: { color: colors.accent, ...typeScale.label, fontWeight: '700' },
  lift: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  liftText: { flex: 1, gap: spacing.xs },
  liftName: { color: colors.text, ...typeScale.headlineSm },
  liftLast: { color: colors.textMuted, fontSize: fontSize.xs, lineHeight: lineHeight.xs },
  entryRow: { flexDirection: 'row', gap: layout.cardGap },
  entryField: { flex: 1 },
  unitRow: { flexDirection: 'row', gap: spacing.sm },
  unitChip: { flex: 1 },
  strikes: { gap: spacing.md },
  strikeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  /** The circled ordinal from the design — a struck number, not a bullet. */
  strikeNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  strikeNumberText: { color: colors.accent, ...typeScale.eyebrow, fontWeight: '700' },
  strikeDetail: { flex: 1, color: colors.text, fontSize: fontSize.md, lineHeight: lineHeight.md },
  strikeMeta: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    fontVariant: ['tabular-nums'],
  },
  ornament: { opacity: 0.5 },
  pressed: { opacity: 0.7 },
});
