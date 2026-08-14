/** Search a personal food library, or define a reusable custom food, then log a quantity. */

import { randomUUID } from 'expo-crypto';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/Button';
import { LOCAL_USER_ID } from '@/constants';
import { addNutritionEntry, createFoodItem, searchFoodItems } from '@/db/macros';
import type { FoodItem, MealType } from '@/db/types';
import { dayKeyFromDate } from '@/domain/dates';
import { isValidNutritionNumber, MEAL_LABELS, MEAL_TYPES } from '@/domain/macros';
import { parseDecimalInput } from '@/domain/numbers';
import { colors, fontSize, radius, spacing, TAP_TARGET } from '@/theme';

const MAX_CALORIES = 10_000;
const MAX_MACRO_GRAMS = 2_000;

function defaultMeal(): MealType {
  const hour = new Date().getHours();
  if (hour < 11) return 'breakfast';
  if (hour < 15) return 'lunch';
  if (hour < 21) return 'dinner';
  return 'snack';
}

function mealFromParam(value: string | string[] | undefined): MealType {
  const candidate = Array.isArray(value) ? value[0] : value;
  return MEAL_TYPES.includes(candidate as MealType) ? candidate as MealType : defaultMeal();
}

export default function AddFoodScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string; meal?: string }>();
  const loggedDate = typeof params.date === 'string' ? params.date : dayKeyFromDate(new Date());

  const [query, setQuery] = useState('');
  const [foods, setFoods] = useState<FoodItem[]>([]);
  const [selected, setSelected] = useState<FoodItem | null>(null);
  const [custom, setCustom] = useState(false);
  const [quantity, setQuantity] = useState('1');
  const [meal, setMeal] = useState<MealType>(() => mealFromParam(params.meal));
  const [name, setName] = useState('');
  const [servingLabel, setServingLabel] = useState('100 g');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rows = await searchFoodItems(db, LOCAL_USER_ID, query);
      if (!cancelled) setFoods(rows);
    })();
    return () => { cancelled = true; };
  }, [db, query]);

  const parsedQuantity = parseDecimalInput(quantity);
  const parsedCalories = parseDecimalInput(calories);
  const parsedProtein = parseDecimalInput(protein);
  const parsedCarbs = parseDecimalInput(carbs);
  const parsedFat = parseDecimalInput(fat);
  const validQuantity = Number.isFinite(parsedQuantity) && parsedQuantity > 0 && parsedQuantity <= 100;
  const validCustom =
    name.trim() !== '' &&
    servingLabel.trim() !== '' &&
    isValidNutritionNumber(parsedCalories, MAX_CALORIES) &&
    isValidNutritionNumber(parsedProtein, MAX_MACRO_GRAMS) &&
    isValidNutritionNumber(parsedCarbs, MAX_MACRO_GRAMS) &&
    isValidNutritionNumber(parsedFat, MAX_MACRO_GRAMS);
  const canSave = validQuantity && (selected !== null || (custom && validCustom));

  const onSave = useCallback(async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const now = new Date();
      let food = selected;
      if (!food) {
        food = await createFoodItem(db, {
          id: randomUUID(),
          userId: LOCAL_USER_ID,
          name: name.trim(),
          caloriesPerServing: parsedCalories,
          proteinG: parsedProtein,
          carbsG: parsedCarbs,
          fatG: parsedFat,
          servingLabel: servingLabel.trim(),
          createdAt: now.toISOString(),
        });
      }
      await addNutritionEntry(db, {
        id: randomUUID(),
        userId: LOCAL_USER_ID,
        foodItemId: food.id,
        loggedAt: now.toISOString(),
        loggedDate,
        quantity: parsedQuantity,
        mealType: meal,
      });
      router.back();
    } finally {
      setSaving(false);
    }
  }, [canSave, db, loggedDate, meal, name, parsedCalories, parsedCarbs, parsedFat, parsedProtein, parsedQuantity, router, selected, servingLabel]);

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {!selected && !custom ? (
          <>
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Search your foods"
              placeholderTextColor={colors.textMuted}
              autoFocus
              accessibilityLabel="Search foods"
            />
            <Button label="Create custom food" variant="secondary" onPress={() => {
              setName(query.trim());
              setCustom(true);
            }} />
            <View>
              {foods.map((food) => (
                <Pressable key={food.id} onPress={() => setSelected(food)} style={({ pressed }) => [styles.foodRow, pressed && styles.pressed]}>
                  <View style={styles.foodMain}>
                    <Text style={styles.foodName}>{food.name}</Text>
                    <Text style={styles.foodMeta}>{food.servingLabel} · P {food.proteinG} · C {food.carbsG} · F {food.fatG}</Text>
                  </View>
                  <Text style={styles.foodCalories}>{Math.round(food.caloriesPerServing)}</Text>
                </Pressable>
              ))}
              {foods.length === 0 ? <Text style={styles.emptyText}>No saved foods match this search.</Text> : null}
            </View>
          </>
        ) : null}

        {custom ? (
          <>
            <Text style={styles.sectionTitle}>Food definition</Text>
            <Field label="Name" value={name} onChangeText={setName} placeholder="Chicken breast" />
            <Field label="Serving" value={servingLabel} onChangeText={setServingLabel} placeholder="100 g, one scoop, one bowl" />
            <View style={styles.fieldGrid}>
              <NumberField label="Calories" value={calories} onChangeText={setCalories} />
              <NumberField label="Protein (g)" value={protein} onChangeText={setProtein} />
              <NumberField label="Carbs (g)" value={carbs} onChangeText={setCarbs} />
              <NumberField label="Fat (g)" value={fat} onChangeText={setFat} />
            </View>
          </>
        ) : null}

        {selected ? (
          <View style={styles.selectedFood}>
            <View style={styles.foodMain}>
              <Text style={styles.foodName}>{selected.name}</Text>
              <Text style={styles.foodMeta}>{selected.servingLabel} · {Math.round(selected.caloriesPerServing)} kcal</Text>
            </View>
            <Pressable onPress={() => setSelected(null)} style={styles.changeButton}>
              <Text style={styles.changeText}>Change</Text>
            </Pressable>
          </View>
        ) : null}

        {selected || custom ? (
          <>
            <NumberField label="Quantity (servings)" value={quantity} onChangeText={setQuantity} />
            <View>
              <Text style={styles.label}>Meal</Text>
              <View style={styles.chipRow}>
                {MEAL_TYPES.map((option) => (
                  <Pressable
                    key={option}
                    onPress={() => setMeal(option)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: meal === option }}
                    style={({ pressed }) => [styles.chip, meal === option && styles.chipActive, pressed && styles.pressed]}
                  >
                    <Text style={[styles.chipText, meal === option && styles.chipTextActive]}>{MEAL_LABELS[option]}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <Button label={custom ? 'Save food and add' : 'Add to day'} onPress={onSave} disabled={!canSave} loading={saving} />
            <Button label="Back to search" variant="secondary" onPress={() => {
              setSelected(null);
              setCustom(false);
            }} />
          </>
        ) : null}
        <Button label="Cancel" variant="secondary" onPress={() => router.back()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, value, onChangeText, placeholder }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput style={styles.input} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.textMuted} /></View>;
}

function NumberField({ label, value, onChangeText }: { label: string; value: string; onChangeText: (value: string) => void }) {
  return <View style={styles.numberField}><Text style={styles.label}>{label}</Text><TextInput style={styles.input} value={value} onChangeText={onChangeText} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={colors.textMuted} /></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg },
  searchInput: { height: TAP_TARGET, backgroundColor: colors.surfaceRaised, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, color: colors.text, fontSize: fontSize.md, paddingHorizontal: spacing.md },
  foodRow: { minHeight: TAP_TARGET, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: spacing.sm },
  foodMain: { flex: 1, paddingRight: spacing.md },
  foodName: { color: colors.text, fontSize: fontSize.md, fontWeight: '600' },
  foodMeta: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: spacing.xs },
  foodCalories: { color: colors.accent, fontSize: fontSize.md, fontWeight: '700' },
  emptyText: { color: colors.textMuted, fontSize: fontSize.sm, textAlign: 'center', paddingVertical: spacing.xl },
  sectionTitle: { color: colors.text, fontSize: fontSize.lg, fontWeight: '700' },
  field: { flex: 1 },
  fieldGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  numberField: { width: '47%' },
  label: { color: colors.textMuted, fontSize: fontSize.xs, textTransform: 'uppercase', marginBottom: spacing.sm },
  input: { height: TAP_TARGET, backgroundColor: colors.surfaceRaised, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, color: colors.text, fontSize: fontSize.md, paddingHorizontal: spacing.md },
  selectedFood: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.lg },
  changeButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm },
  changeText: { color: colors.accent, fontSize: fontSize.sm, fontWeight: '700' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.textMuted, fontSize: fontSize.sm, fontWeight: '600' },
  chipTextActive: { color: colors.accentText },
  pressed: { opacity: 0.7 },
});
