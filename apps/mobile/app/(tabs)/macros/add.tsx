/**
 * The Offering — pick a food from your stores, set a quantity and a meal, log it.
 *
 * Three views in one screen, as `5.11_the_offering` has three sheets: the search, the forge (a new
 * food definition), and the quantity. The state machine is the pre-existing one — `selected` and
 * `custom` — because a modal that pushes its own stack has two back affordances and a device back
 * gesture that means different things depending on which sheet you are on.
 *
 * Departures from the design:
 *
 * - **No +/− steppers on the quantity.** The design has both steppers and quick chips, and the chips
 *   *are* the stepper: 0.5 / 1 / 1.5 / 2 covers what a serving multiplier actually gets set to, and
 *   the field takes anything else. Two controls for one number is two things to keep in sync.
 * - **The tribute total is a display figure plus a three-cell strip, not a row of four.** Same
 *   reason as The Stele's hero — four display numbers across a phone gives each about 80pt — and it
 *   matches the design's own hierarchy, where the kilocalories are display-md and the macros a
 *   smaller headline.
 * - **No Cancel button.** The bar's close glyph is the way out of a modal; a second escape at the
 *   bottom of a form is one the thumb finds by accident.
 *
 * The forge view has no design of its own. It reuses The Decree's shape — labelled fields, two to a
 * row — because it is the same kind of screen: four numbers that define something.
 */

import { randomUUID } from 'expo-crypto';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import {
  AppBar,
  Card,
  CardHeader,
  Chip,
  Divider,
  EmptyState,
  Eyebrow,
  Field,
  IconButton,
  NavRow,
  Notice,
  RowGroup,
  ScreenScroll,
  Section,
  StatStrip,
} from '@/components/Layout';
import { LOCAL_USER_ID } from '@/constants';
import { addNutritionEntry, createFoodItem, searchFoodItems } from '@/db/macros';
import type { FoodItem, MealType } from '@/db/types';
import { dayKeyFromDate } from '@/domain/dates';
import {
  describeFood,
  isValidNutritionNumber,
  MEAL_LABELS,
  MEAL_PLAIN_LABELS,
  MEAL_TYPES,
  nutritionFor,
} from '@/domain/macros';
import { parseDecimalInput } from '@/domain/numbers';
import { requestSync } from '@/sync/scheduler';
import { colors, fontSize, layout, lineHeight, spacing, type as typeScale } from '@/theme';

const MAX_CALORIES = 10_000;
const MAX_MACRO_GRAMS = 2_000;
const MAX_SERVINGS = 100;

/** The multiples a serving is actually logged at. The field takes anything else. */
const QUICK_QUANTITIES = ['0.5', '1', '1.5', '2'];

function defaultMeal(): MealType {
  const hour = new Date().getHours();
  if (hour < 11) return 'breakfast';
  if (hour < 15) return 'lunch';
  if (hour < 21) return 'dinner';
  return 'snack';
}

function mealFromParam(value: string | string[] | undefined): MealType {
  const candidate = Array.isArray(value) ? value[0] : value;
  return MEAL_TYPES.includes(candidate as MealType) ? (candidate as MealType) : defaultMeal();
}

export default function OfferingScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string; meal?: string }>();
  const loggedDate = typeof params.date === 'string' ? params.date : dayKeyFromDate(new Date());

  const [query, setQuery] = useState('');
  const [foods, setFoods] = useState<FoodItem[]>([]);
  const [loaded, setLoaded] = useState(false);
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await searchFoodItems(db, LOCAL_USER_ID, query);
        if (!cancelled) setFoods(rows);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        // Gates the empty state: `foods` starts empty, so without this the list claims your stores
        // are bare for the frame before the first query resolves.
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [db, query]);

  const parsedQuantity = parseDecimalInput(quantity);
  const parsedCalories = parseDecimalInput(calories);
  const parsedProtein = parseDecimalInput(protein);
  const parsedCarbs = parseDecimalInput(carbs);
  const parsedFat = parseDecimalInput(fat);
  const validQuantity =
    Number.isFinite(parsedQuantity) && parsedQuantity > 0 && parsedQuantity <= MAX_SERVINGS;
  const validCustom =
    name.trim() !== '' &&
    servingLabel.trim() !== '' &&
    isValidNutritionNumber(parsedCalories, MAX_CALORIES) &&
    isValidNutritionNumber(parsedProtein, MAX_MACRO_GRAMS) &&
    isValidNutritionNumber(parsedCarbs, MAX_MACRO_GRAMS) &&
    isValidNutritionNumber(parsedFat, MAX_MACRO_GRAMS);
  const canSave = validQuantity && (selected !== null || (custom && validCustom));

  /**
   * What the offering comes to. Falls back to the form's own figures while forging a food, so the
   * tribute total is live before the definition has been saved.
   */
  const tribute = nutritionFor(
    selected ?? {
      caloriesPerServing: Number.isFinite(parsedCalories) ? parsedCalories : 0,
      proteinG: Number.isFinite(parsedProtein) ? parsedProtein : 0,
      carbsG: Number.isFinite(parsedCarbs) ? parsedCarbs : 0,
      fatG: Number.isFinite(parsedFat) ? parsedFat : 0,
    },
    validQuantity ? parsedQuantity : 0,
  );

  /**
   * Deliberately not wrapped in `useCallback`.
   *
   * It is only ever reached through `onPress={() => void onSave()}`, so the arrow the button actually
   * holds is new on every render either way and the memo buys nothing. It also costs something: the
   * parsed figures above are passed to `nutritionFor`, which the React Compiler has to assume could
   * mutate them, so it cannot prove a dependency array built from them is still correct — and rather
   * than trust it, it declines to optimise the whole component. Dropping the manual memo is what lets
   * the compiler memoise this screen properly.
   */
  const onSave = async () => {
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
      void requestSync(db).catch(() => {});
      router.back();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  };

  const searching = !selected && !custom;

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <AppBar
        title="The Offering"
        action={
          <IconButton icon="close" label="Close the offering" onPress={() => router.back()} />
        }
      />

      <ScreenScroll>
        {error ? (
          <Notice
            tone="danger"
            title={searching ? 'Your stores could not be read' : 'The offering was not made'}
          >
            {error}
          </Notice>
        ) : null}

        {searching ? (
          <>
            <Field
              label="Search your stores"
              value={query}
              onChangeText={setQuery}
              placeholder="Chicken breast"
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              returnKeyType="search"
            />

            {foods.length > 0 ? (
              <Section title="Your stores">
                <RowGroup>
                  {foods.map((food) => (
                    <NavRow
                      key={food.id}
                      label={food.name}
                      detail={describeFood(food)}
                      onPress={() => setSelected(food)}
                    />
                  ))}
                </RowGroup>
              </Section>
            ) : null}

            {loaded && !error && foods.length === 0 ? (
              <EmptyState
                title={query.trim() ? 'Nothing by that name' : 'Your stores are empty'}
                body="Forge the food once and it stays in your stores for every day after."
              />
            ) : null}

            <Button
              label="Forge a new food"
              variant="secondary"
              onPress={() => {
                setName(query.trim());
                setCustom(true);
              }}
            />
          </>
        ) : null}

        {custom ? (
          <Section title="Forge a new food">
            <Card>
              <Field label="Name" value={name} onChangeText={setName} placeholder="Chicken breast" />
              <Field
                label="One serving is"
                value={servingLabel}
                onChangeText={setServingLabel}
                placeholder="100 g, one scoop, one bowl"
                hint="Everything below is per serving."
              />
              {/*
                Plain nutrient names here, not the store names The Decree uses: these four numbers are
                copied off a packet that says "protein", and a definition form that asks for the
                "Protein Den" of a chicken breast is asking a question the packet does not answer.
              */}
              <View style={styles.fieldRow}>
                <Field
                  label="Calories"
                  style={styles.fieldCell}
                  value={calories}
                  onChangeText={setCalories}
                  keyboardType="decimal-pad"
                  placeholder="0"
                />
                <Field
                  label="Protein (g)"
                  style={styles.fieldCell}
                  value={protein}
                  onChangeText={setProtein}
                  keyboardType="decimal-pad"
                  placeholder="0"
                />
              </View>
              <View style={styles.fieldRow}>
                <Field
                  label="Carbs (g)"
                  style={styles.fieldCell}
                  value={carbs}
                  onChangeText={setCarbs}
                  keyboardType="decimal-pad"
                  placeholder="0"
                />
                <Field
                  label="Fat (g)"
                  style={styles.fieldCell}
                  value={fat}
                  onChangeText={setFat}
                  keyboardType="decimal-pad"
                  placeholder="0"
                />
              </View>
            </Card>
          </Section>
        ) : null}

        {selected ? (
          <View style={styles.chosen}>
            <Text style={styles.chosenName}>{selected.name}</Text>
            <Text style={styles.chosenDetail}>{`${describeFood(selected)} per serving`}</Text>
          </View>
        ) : null}

        {selected || custom ? (
          <>
            <Section title="Quantity">
              <Field
                label="Servings"
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="decimal-pad"
                selectTextOnFocus
                hint={validQuantity ? undefined : `Between 0 and ${MAX_SERVINGS}.`}
              />
              <View style={styles.chipRow}>
                {QUICK_QUANTITIES.map((option) => (
                  <Chip
                    key={option}
                    label={option}
                    selected={parsedQuantity === Number(option)}
                    onPress={() => setQuantity(option)}
                    accessibilityLabel={`${option} servings`}
                    style={styles.chipCell}
                  />
                ))}
              </View>
            </Section>

            <Section title="Meal">
              <View style={styles.mealGrid}>
                {MEAL_TYPES.map((option) => (
                  <Chip
                    key={option}
                    label={MEAL_LABELS[option]}
                    selected={meal === option}
                    onPress={() => setMeal(option)}
                    accessibilityLabel={`${MEAL_LABELS[option]}, ${MEAL_PLAIN_LABELS[option]}`}
                    style={styles.mealCell}
                  />
                ))}
              </View>
            </Section>

            <Card>
              <CardHeader title="Tribute total" tone="accent" />
              <View style={styles.tributeHero}>
                <Text style={styles.tributeValue}>{Math.round(tribute.calories).toLocaleString()}</Text>
                <Eyebrow>kcal</Eyebrow>
              </View>
              <Divider />
              <StatStrip
                bare
                items={[
                  { label: 'Protein', value: `${Math.round(tribute.proteinG * 10) / 10} g` },
                  { label: 'Carbs', value: `${Math.round(tribute.carbsG * 10) / 10} g` },
                  { label: 'Fat', value: `${Math.round(tribute.fatG * 10) / 10} g` },
                ]}
              />
            </Card>

            <Button
              label="Make the offering"
              onPress={() => void onSave()}
              disabled={!canSave}
              loading={saving}
            />
            <Button
              label="Back to your stores"
              variant="secondary"
              onPress={() => {
                setSelected(null);
                setCustom(false);
              }}
            />
          </>
        ) : null}
      </ScreenScroll>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  fieldRow: { flexDirection: 'row', gap: layout.cardGap },
  fieldCell: { flex: 1 },
  chipRow: { flexDirection: 'row', gap: spacing.sm },
  chipCell: { flex: 1 },
  /** Two across rather than four: DAWN / ZENITH / DUSK / EMBERS do not fit one row of a phone. */
  mealGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  mealCell: { flexGrow: 1, flexBasis: '45%' },
  /** The chosen food, centred and ruled off — the design's header for the quantity sheet. */
  chosen: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingBottom: layout.cardGap,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  chosenName: { color: colors.accent, ...typeScale.headlineSm, textAlign: 'center' },
  chosenDetail: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    textAlign: 'center',
  },
  tributeHero: { alignItems: 'center', gap: spacing.xs },
  tributeValue: { color: colors.text, ...typeScale.displayMd, fontVariant: ['tabular-nums'] },
});
