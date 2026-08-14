/** Pure nutrition calculations for the macro module. */

import type {
  FoodItem,
  MacroTarget,
  MealType,
  NutritionEntryWithFood,
} from '@/db/types';

export const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snacks',
};

export type NutritionTotals = {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

export type MacroMetric = {
  consumed: number;
  target: number | null;
  remaining: number | null;
  /** Capped for drawing a bar; `consumed` still preserves an over-target amount. */
  fillRatio: number;
  overTarget: boolean;
};

export type MacroSummary = {
  totals: NutritionTotals;
  calories: MacroMetric;
  protein: MacroMetric;
  carbs: MacroMetric;
  fat: MacroMetric;
};

export type MealGroup = {
  mealType: MealType;
  label: string;
  entries: NutritionEntryWithFood[];
  totals: NutritionTotals;
};

function emptyTotals(): NutritionTotals {
  return { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 };
}

/** Nutrition contributed by one entry; quantity is a serving multiplier. */
export function nutritionFor(food: FoodItem, quantity: number): NutritionTotals {
  const safeQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
  return {
    calories: food.caloriesPerServing * safeQuantity,
    proteinG: food.proteinG * safeQuantity,
    carbsG: food.carbsG * safeQuantity,
    fatG: food.fatG * safeQuantity,
  };
}

export function summariseEntries(entries: NutritionEntryWithFood[]): NutritionTotals {
  return entries.reduce<NutritionTotals>((total, entry) => {
    const value = nutritionFor(entry.food, entry.quantity);
    total.calories += value.calories;
    total.proteinG += value.proteinG;
    total.carbsG += value.carbsG;
    total.fatG += value.fatG;
    return total;
  }, emptyTotals());
}

function metric(consumed: number, target: number | null): MacroMetric {
  if (target === null || !Number.isFinite(target) || target <= 0) {
    return { consumed, target: null, remaining: null, fillRatio: 0, overTarget: false };
  }
  return {
    consumed,
    target,
    remaining: target - consumed,
    fillRatio: Math.min(Math.max(consumed / target, 0), 1),
    overTarget: consumed > target,
  };
}

/** Daily totals and target comparisons in the exact shape the summary bars render. */
export function summariseMacros(
  entries: NutritionEntryWithFood[],
  target: MacroTarget | null,
): MacroSummary {
  const totals = summariseEntries(entries);
  return {
    totals,
    calories: metric(totals.calories, target?.calories ?? null),
    protein: metric(totals.proteinG, target?.proteinG ?? null),
    carbs: metric(totals.carbsG, target?.carbsG ?? null),
    fat: metric(totals.fatG, target?.fatG ?? null),
  };
}

/** Always returns the four meals in day order; screens may hide groups with no entries. */
export function groupByMeal(entries: NutritionEntryWithFood[]): MealGroup[] {
  return MEAL_TYPES.map((mealType) => {
    const mealEntries = entries.filter((entry) => entry.mealType === mealType);
    return {
      mealType,
      label: MEAL_LABELS[mealType],
      entries: mealEntries,
      totals: summariseEntries(mealEntries),
    };
  });
}

/** Human-readable serving multiplier without noisy trailing zeroes. */
export function formatServing(quantity: number, servingLabel: string): string {
  const rounded = Math.round(quantity * 100) / 100;
  return `${rounded} × ${servingLabel}`;
}

/** Whole calories, one decimal for grams; avoids rendering `-0`. */
export function formatNutrition(value: number, unit: 'kcal' | 'g'): string {
  const safe = Math.abs(value) < 0.05 ? 0 : value;
  return unit === 'kcal' ? `${Math.round(safe)} kcal` : `${safe.toFixed(1)} g`;
}

/** Bounds used by both the custom-food and target forms. */
export function isValidNutritionNumber(value: number, maximum: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= maximum;
}
