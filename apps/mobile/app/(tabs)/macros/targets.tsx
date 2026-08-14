/** Effective-dated calorie and macro targets. */

import { randomUUID } from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/Button';
import { LOCAL_USER_ID } from '@/constants';
import { getMacroTargetForDate, setMacroTarget } from '@/db/macros';
import { dayKeyFromDate } from '@/domain/dates';
import { isValidNutritionNumber } from '@/domain/macros';
import { colors, fontSize, radius, spacing, TAP_TARGET } from '@/theme';

export default function MacroTargetsScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const today = dayKeyFromDate(new Date());
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const target = await getMacroTargetForDate(db, LOCAL_USER_ID, today);
      if (cancelled || !target) return;
      setCalories(String(target.calories));
      setProtein(String(target.proteinG));
      setCarbs(String(target.carbsG));
      setFat(String(target.fatG));
    })();
    return () => { cancelled = true; };
  }, [db, today]);

  const parsedCalories = Number.parseFloat(calories);
  const parsedProtein = Number.parseFloat(protein);
  const parsedCarbs = Number.parseFloat(carbs);
  const parsedFat = Number.parseFloat(fat);
  const canSave =
    isValidNutritionNumber(parsedCalories, 20_000) && parsedCalories > 0 &&
    isValidNutritionNumber(parsedProtein, 2_000) &&
    isValidNutritionNumber(parsedCarbs, 2_000) &&
    isValidNutritionNumber(parsedFat, 2_000);

  const onSave = useCallback(async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await setMacroTarget(db, {
        id: randomUUID(),
        userId: LOCAL_USER_ID,
        calories: parsedCalories,
        proteinG: parsedProtein,
        carbsG: parsedCarbs,
        fatG: parsedFat,
        effectiveDate: today,
        createdAt: new Date().toISOString(),
      });
      router.back();
    } finally {
      setSaving(false);
    }
  }, [canSave, db, parsedCalories, parsedCarbs, parsedFat, parsedProtein, router, today]);

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.explainer}>A save takes effect today. Earlier day logs keep the targets that were active then.</Text>
        <TargetField label="Calories" suffix="kcal" value={calories} onChangeText={setCalories} autoFocus />
        <TargetField label="Protein" suffix="g" value={protein} onChangeText={setProtein} />
        <TargetField label="Carbs" suffix="g" value={carbs} onChangeText={setCarbs} />
        <TargetField label="Fat" suffix="g" value={fat} onChangeText={setFat} />
        <Button label="Save targets" onPress={onSave} disabled={!canSave} loading={saving} />
        <Button label="Cancel" variant="secondary" onPress={() => router.back()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function TargetField({ label, suffix, value, onChangeText, autoFocus = false }: { label: string; suffix: string; value: string; onChangeText: (value: string) => void; autoFocus?: boolean }) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputRow}>
        <TextInput style={styles.input} value={value} onChangeText={onChangeText} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={colors.textMuted} autoFocus={autoFocus} accessibilityLabel={`${label} target`} />
        <Text style={styles.suffix}>{suffix}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg },
  explainer: { color: colors.textMuted, fontSize: fontSize.sm },
  label: { color: colors.textMuted, fontSize: fontSize.xs, textTransform: 'uppercase', marginBottom: spacing.sm },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceRaised, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  input: { flex: 1, height: TAP_TARGET, color: colors.text, fontSize: fontSize.lg, fontWeight: '700', paddingHorizontal: spacing.md },
  suffix: { color: colors.textMuted, fontSize: fontSize.sm, paddingRight: spacing.md },
});
