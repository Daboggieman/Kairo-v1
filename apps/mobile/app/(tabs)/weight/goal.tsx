/**
 * Goal weight — the target behind the chart's dashed overlay.
 *
 * Stored in kg regardless of the unit typed (see `src/db/preferences.ts`), so switching
 * display units later does not silently reinterpret a 75 that meant kilograms as pounds.
 * The unit toggle here converts on save rather than storing the user's choice with it.
 */

import { useRouter } from 'expo-router';
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

import { Button } from '@/components/Button';
import { clearGoalWeight, getGoalWeightKg, setGoalWeightKg } from '@/db/preferences';
import type { WeightUnit } from '@/db/types';
import { listEntriesAscending } from '@/db/weight';
import { displayUnit, toDisplayWeight } from '@/domain/weight';
import { toKg } from '@/domain/workouts';
import { LOCAL_USER_ID } from '@/constants';
import { colors, fontSize, radius, spacing, TAP_TARGET } from '@/theme';

const UNITS: WeightUnit[] = ['kg', 'lb'];

const MAX_WEIGHT = 1000;

export default function GoalWeightScreen() {
  const db = useSQLiteContext();
  const router = useRouter();

  const [goal, setGoal] = useState('');
  const [unit, setUnit] = useState<WeightUnit>('kg');
  const [hasExisting, setHasExisting] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // The unit follows whatever the user has been logging in, so the field they land on
      // is already in the units they think about their weight in.
      const [existing, entries] = await Promise.all([
        getGoalWeightKg(db, LOCAL_USER_ID),
        listEntriesAscending(db, LOCAL_USER_ID, 1),
      ]);
      if (cancelled) return;
      const preferred = displayUnit(entries);
      setUnit(preferred);
      if (existing !== null) {
        setGoal(String(toDisplayWeight(existing, preferred)));
        setHasExisting(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [db]);

  const parsed = Number.parseFloat(goal);
  const canSave = Number.isFinite(parsed) && parsed > 0 && parsed < MAX_WEIGHT;

  const onSave = useCallback(async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await setGoalWeightKg(db, LOCAL_USER_ID, toKg(parsed, unit));
      router.back();
    } finally {
      setSaving(false);
    }
  }, [canSave, db, parsed, router, unit]);

  const onClear = useCallback(async () => {
    await clearGoalWeight(db, LOCAL_USER_ID);
    router.back();
  }, [db, router]);

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.explainer}>
          The chart draws a dashed line at your target so you can see the trend closing on it.
        </Text>

        <View style={styles.weightRow}>
          <TextInput
            style={styles.weightInput}
            value={goal}
            onChangeText={setGoal}
            keyboardType="decimal-pad"
            selectTextOnFocus
            autoFocus
            placeholder="0"
            placeholderTextColor={colors.textMuted}
            accessibilityLabel="Goal weight"
          />
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

        <Button label="Save goal" onPress={onSave} disabled={!canSave} loading={saving} />
        {hasExisting ? (
          <Button label="Remove goal" variant="danger" onPress={onClear} />
        ) : null}
        <Button label="Cancel" variant="secondary" onPress={() => router.back()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg },
  explainer: { color: colors.textMuted, fontSize: fontSize.sm },
  weightRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  weightInput: {
    flex: 1,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '700',
    height: TAP_TARGET + spacing.md,
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
    paddingHorizontal: spacing.lg,
    height: TAP_TARGET + spacing.md,
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
  },
  unitOptionActive: { backgroundColor: colors.accent },
  unitText: { color: colors.textMuted, fontSize: fontSize.md, fontWeight: '700' },
  unitTextActive: { color: colors.accentText },
});
