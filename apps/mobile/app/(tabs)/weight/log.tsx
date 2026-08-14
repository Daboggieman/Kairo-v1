/**
 * Quick-entry — the "quick-entry widget" from `04-feature-specs.md`, as a modal.
 *
 * The interaction budget is one weigh-in per morning, so the field arrives pre-filled with
 * the last logged weight and unit (same reasoning as `suggestNextSet` in the workouts
 * module: yesterday's number is a nudge away from today's, where an empty field is a full
 * keyboard entry every day). Autofocus and `selectTextOnFocus` mean typing over it is
 * immediate.
 */

import { useRouter } from 'expo-router';
import { randomUUID } from 'expo-crypto';
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
import type { WeightUnit } from '@/db/types';
import { addEntry, latestEntry } from '@/db/weight';
import { LOCAL_USER_ID } from '@/constants';
import { colors, fontSize, radius, spacing, TAP_TARGET } from '@/theme';
import { parseDecimalInput } from '@/domain/numbers';

const UNITS: WeightUnit[] = ['kg', 'lb'];

/** A sanity bound, not a medical one — it only catches a slipped decimal point. */
const MAX_WEIGHT = 1000;

export default function LogWeightScreen() {
  const db = useSQLiteContext();
  const router = useRouter();

  const [weight, setWeight] = useState('');
  const [unit, setUnit] = useState<WeightUnit>('kg');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const previous = await latestEntry(db, LOCAL_USER_ID);
      if (cancelled || !previous) return;
      setWeight(String(previous.weight));
      setUnit(previous.weightUnit);
    })();
    return () => {
      cancelled = true;
    };
  }, [db]);

  const parsed = parseDecimalInput(weight);
  const canSave = Number.isFinite(parsed) && parsed > 0 && parsed < MAX_WEIGHT;

  const onSave = useCallback(async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await addEntry(db, {
        id: randomUUID(),
        userId: LOCAL_USER_ID,
        // Stored as an instant, not a date: the trend groups by calendar day itself, and
        // the time of day is worth keeping — weight before breakfast and weight after
        // dinner are different measurements.
        recordedAt: new Date().toISOString(),
        weight: parsed,
        weightUnit: unit,
        note: note.trim() === '' ? null : note.trim(),
      });
      router.back();
    } finally {
      setSaving(false);
    }
  }, [canSave, db, note, parsed, router, unit]);

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.weightRow}>
          <TextInput
            style={styles.weightInput}
            value={weight}
            onChangeText={setWeight}
            keyboardType="decimal-pad"
            selectTextOnFocus
            autoFocus
            placeholder="0"
            placeholderTextColor={colors.textMuted}
            accessibilityLabel="Weight"
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

        <View>
          <Text style={styles.inputLabel}>Note (optional)</Text>
          <TextInput
            style={styles.noteInput}
            value={note}
            onChangeText={setNote}
            placeholder="Fasted, post-workout, …"
            placeholderTextColor={colors.textMuted}
            accessibilityLabel="Note"
          />
        </View>

        <Button label="Save" onPress={onSave} disabled={!canSave} loading={saving} />
        <Button label="Cancel" variant="secondary" onPress={() => router.back()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg },
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
  inputLabel: { color: colors.textMuted, fontSize: fontSize.xs, marginBottom: spacing.xs },
  noteInput: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: fontSize.md,
    height: TAP_TARGET,
    paddingHorizontal: spacing.md,
  },
});
