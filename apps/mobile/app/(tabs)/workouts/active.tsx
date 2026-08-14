/**
 * Active Session — the screen used mid-workout, with a bar in your hands.
 *
 * Everything here follows from that: large tap targets, weight/reps pre-filled from the
 * last time this lift was performed (`suggestNextSet`), and the rest timer visible without
 * scrolling. Each logged set writes to SQLite immediately, so the session survives the app
 * being killed between sets.
 */

import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { RestTimer } from '@/components/RestTimer';
import { SessionElapsed } from '@/components/SessionElapsed';
import type { WeightUnit } from '@/db/types';
import { lastSetForExercise } from '@/db/workouts';
import { groupByExercise, nextSetNumber, sessionVolume, suggestNextSet } from '@/domain/workouts';
import { parseDecimalInput } from '@/domain/numbers';
import { useWorkoutStore } from '@/store/workoutStore';
import { colors, fontSize, radius, spacing, TAP_TARGET } from '@/theme';

const UNITS: WeightUnit[] = ['kg', 'lb'];

export default function ActiveSessionScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();

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

  useFocusEffect(
    useCallback(() => {
      // Deep-linking straight here (or a reload in dev) lands with an empty store.
      if (!sessionId) void hydrate(db);
    }, [db, hydrate, sessionId]),
  );

  // Pre-fill from the last time this lift was performed — the auto-suggest from
  // `04-feature-specs.md`. Runs on exercise change, never on every keystroke.
  useEffect(() => {
    if (!currentExercise) return;
    let cancelled = false;
    (async () => {
      const previous = await lastSetForExercise(db, currentExercise.id);
      if (cancelled) return;
      const suggestion = suggestNextSet(previous, unit);
      setReps(String(suggestion.reps));
      setWeight(String(suggestion.weight));
      setUnit(suggestion.weightUnit);
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
    } finally {
      setSaving(false);
    }
  }, [canLog, currentExercise, db, logSet, parsedReps, parsedWeight, unit]);

  const onFinish = useCallback(async () => {
    await endSession(db);
    router.replace('/workouts');
  }, [db, endSession, router]);

  if (!sessionId) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyBody}>No active session.</Text>
        <Button
          label="Back to workouts"
          variant="secondary"
          onPress={() => router.replace('/workouts')}
          style={styles.emptyAction}
        />
      </View>
    );
  }

  const groups = groupByExercise(sets);
  const volume = Math.round(sessionVolume(sets));

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <RestTimer startedAt={restStartedAt} />

        <View style={styles.summaryRow}>
          <Text style={styles.summaryText}>{sets.length} sets</Text>
          <Text style={styles.summaryText}>{volume.toLocaleString()} volume</Text>
          <SessionElapsed startedAt={startedAt} />
        </View>

        <Pressable
          style={({ pressed }) => [styles.exercisePicker, pressed && styles.pressed]}
          onPress={() => router.push('/workouts/exercises')}
        >
          <Text style={styles.exerciseLabel}>Exercise</Text>
          <Text style={styles.exerciseName}>
            {currentExercise ? currentExercise.name : 'Choose an exercise'}
          </Text>
        </Pressable>

        {currentExercise ? (
          <>
            <View style={styles.inputRow}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Reps</Text>
                <TextInput
                  style={styles.input}
                  value={reps}
                  onChangeText={setReps}
                  keyboardType="number-pad"
                  selectTextOnFocus
                  accessibilityLabel="Reps"
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Weight</Text>
                <TextInput
                  style={styles.input}
                  value={weight}
                  onChangeText={setWeight}
                  keyboardType="decimal-pad"
                  selectTextOnFocus
                  accessibilityLabel="Weight"
                />
              </View>
              <View style={styles.unitToggle}>
                {UNITS.map((option) => (
                  <Pressable
                    key={option}
                    onPress={() => setUnit(option)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: unit === option }}
                    style={[styles.unitOption, unit === option && styles.unitOptionActive]}
                  >
                    <Text style={[styles.unitText, unit === option && styles.unitTextActive]}>
                      {option}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <Button
              label={`Log set ${nextSetNumber(sets, currentExercise.id)}`}
              onPress={onLogSet}
              disabled={!canLog}
              loading={saving}
            />
          </>
        ) : null}

        {groups.map((group) => (
          <View key={group.exerciseId} style={styles.group}>
            <Text style={styles.groupTitle}>{group.exerciseName}</Text>
            {group.sets.map((set) => (
              <View key={set.id} style={styles.setRow}>
                <Text style={styles.setNumber}>{set.setNumber}</Text>
                <Text style={styles.setDetail}>
                  {set.reps} × {set.weight}
                  {set.weightUnit}
                </Text>
                <Text style={styles.setRest}>
                  {set.restSeconds === null ? '' : `${set.restSeconds}s rest`}
                </Text>
              </View>
            ))}
          </View>
        ))}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button label="Finish workout" variant="secondary" onPress={onFinish} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  content: { padding: spacing.lg, gap: spacing.lg },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryText: { color: colors.textMuted, fontSize: fontSize.sm },
  exercisePicker: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    minHeight: TAP_TARGET,
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
  exerciseLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  exerciseName: { color: colors.text, fontSize: fontSize.lg, fontWeight: '600' },
  inputRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-end' },
  inputGroup: { flex: 1 },
  inputLabel: { color: colors.textMuted, fontSize: fontSize.xs, marginBottom: spacing.xs },
  input: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: fontSize.lg,
    height: TAP_TARGET,
    paddingHorizontal: spacing.md,
    textAlign: 'center',
  },
  unitToggle: {
    flexDirection: 'row',
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  unitOption: {
    paddingHorizontal: spacing.md,
    height: TAP_TARGET,
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
  },
  unitOptionActive: { backgroundColor: colors.accent },
  unitText: { color: colors.textMuted, fontSize: fontSize.sm, fontWeight: '700' },
  unitTextActive: { color: colors.accentText },
  group: { gap: spacing.xs },
  groupTitle: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
    marginTop: spacing.md,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  setNumber: { color: colors.textMuted, fontSize: fontSize.sm, width: 20 },
  setDetail: { color: colors.text, fontSize: fontSize.md, flex: 1 },
  setRest: { color: colors.textMuted, fontSize: fontSize.xs },
  emptyBody: { color: colors.textMuted, fontSize: fontSize.md },
  emptyAction: { marginTop: spacing.lg },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
