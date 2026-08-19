/** Pure nutrition calculations for the macro module. */

import type {
  FoodItem,
  MacroTarget,
  MealType,
  NutritionEntryWithFood,
} from '@/db/types';

export const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/**
 * Dawn / Zenith / Dusk / Embers — the four meals, from `09-ui-rebuild-plan.md`. `MealType` itself
 * stays `breakfast | lunch | dinner | snack`: the column, the type and the query keep their English
 * names, and only the display string is the theme.
 */
export const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Dawn',
  lunch: 'Zenith',
  dinner: 'Dusk',
  snack: 'Embers',
};

/**
 * The plain word each meal renames.
 *
 * The designs keep it as a parenthetical — `DAWN (BREAKFAST)` — and that is worth transcribing
 * rather than trimming: "Zenith" is not self-evidently lunch the first time you meet it, and a food
 * log you have to decode is a food log you stop keeping.
 */
export const MEAL_PLAIN_LABELS: Record<MealType, string> = {
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

/** The four figures this module multiplies. Every `FoodItem` satisfies it. */
export type PerServing = Pick<FoodItem, 'caloriesPerServing' | 'proteinG' | 'carbsG' | 'fatG'>;

/**
 * Nutrition contributed by one entry; quantity is a serving multiplier.
 *
 * Takes the four nutrients rather than a whole `FoodItem` so The Offering can price a food that does
 * not exist yet — the one being forged, whose figures are in the form and whose row is not written
 * until the offering is made. Passing a whole `FoodItem` for that meant inventing an `id: ''` and an
 * empty `createdAt`, which is a value that reads like a saved food and is not one.
 */
export function nutritionFor(food: PerServing, quantity: number): NutritionTotals {
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

/* ------------------------------------------------------------------------- *
 * The Feast's vocabulary
 *
 * Calories are the **Caloric Forge**, protein the **Protein Den**, carbohydrate the **Granary** and
 * fat the **Fat Pool**; a logged food is an **offering** and a set of targets a **decree**. The words
 * live here rather than at the call sites for the reason `formatProgress` lives in `tasks.ts` and
 * `formatTonnage` in `workouts.ts`: three screens say the same things about the same four numbers,
 * and a phrase written three times ends up worded twice.
 * ------------------------------------------------------------------------- */

/**
 * The four stores, in the order The Feast lists them.
 *
 * `5.10_the_feast` writes two of these with a leading "THE" and two without. Dropped from all four:
 * they are read as a column of labels one under another, where a definite article on half of them
 * reads as a mistake rather than as a name.
 */
export const MACRO_LABELS = {
  calories: 'Caloric Forge',
  protein: 'Protein Den',
  carbs: 'Granary',
  fat: 'Fat Pool',
} as const;

/** "Dawn (Breakfast)" — a meal's heading, its plain name kept as the gloss. */
export function formatMealHeading(mealType: MealType): string {
  return `${MEAL_LABELS[mealType]} (${MEAL_PLAIN_LABELS[mealType]})`;
}

/** A gram figure with no trailing zero: `31`, `3.6`, `0`. */
function grams(value: number): string {
  return `${Math.round(value * 10) / 10}`;
}

/** Whole units, grouped by the host locale: `1,540`. */
function whole(value: number): string {
  return Math.round(value).toLocaleString();
}

/** "31 P / 0 C / 3.6 F" — the macro split, in the compact form both food lists use. */
export function formatMacroSplit(macros: Pick<NutritionTotals, 'proteinG' | 'carbsG' | 'fatG'>): string {
  return `${grams(macros.proteinG)} P / ${grams(macros.carbsG)} C / ${grams(macros.fatG)} F`;
}

/** "100 g · 165 kcal · 31 P / 0 C / 3.6 F" — one food's definition, per serving. */
export function describeFood(food: FoodItem): string {
  return `${food.servingLabel} · ${whole(food.caloriesPerServing)} kcal · ${formatMacroSplit(food)}`;
}

/** "1.5 × 100 g · 46.5 P / 0 C / 5.4 F" — one logged offering, at the quantity it was logged at. */
export function describeEntry(entry: NutritionEntryWithFood): string {
  return `${formatServing(entry.quantity, entry.food.servingLabel)} · ${formatMacroSplit(
    nutritionFor(entry.food, entry.quantity),
  )}`;
}

/**
 * "124 / 200 g" — a store's fill against its decree, or "124 g" with no decree to measure against.
 *
 * Whole units, unlike `formatNutrition`'s one decimal: this is a progress readout scanned in a
 * column of four, and a tenth of a gram of fat is not a thing anyone acts on.
 */
export function formatStore(metric: MacroMetric, unit: 'kcal' | 'g'): string {
  if (metric.target === null) return `${whole(metric.consumed)} ${unit}`;
  return `${whole(metric.consumed)} / ${whole(metric.target)} ${unit}`;
}

/** "1,060 kcal left", "260 kcal over", or "" when there is no decree to be under or over. */
export function formatRemaining(metric: MacroMetric, unit: 'kcal' | 'g'): string {
  if (metric.remaining === null) return '';
  const remaining = Math.round(metric.remaining);
  if (remaining < 0) return `${Math.abs(remaining).toLocaleString()} ${unit} over`;
  return `${remaining.toLocaleString()} ${unit} left`;
}

/** The Atwater factors: 4 kcal to a gram of protein or carbohydrate, 9 to a gram of fat. */
export function caloriesFromMacros(
  macros: Pick<NutritionTotals, 'proteinG' | 'carbsG' | 'fatG'>,
): number {
  return macros.proteinG * 4 + macros.carbsG * 4 + macros.fatG * 9;
}

export type DecreeCheck = {
  /** What the three macro figures come to on their own. */
  derived: number;
  summary: string;
  /** Set only when the two halves of the decree disagree by more than the tolerance. */
  divergence: string | null;
};

/**
 * Under this many kilocalories the two halves of a decree are treated as agreeing.
 *
 * The Atwater factors are themselves rounded, so a decree written from any real macro split lands
 * within a few tens of kilocalories of its own total. Flagging that as a contradiction would mean
 * every correctly-written decree carries a warning.
 */
const DECREE_TOLERANCE_KCAL = 50;

/**
 * The Decree's read-out: what the macro half of a decree implies, and whether it agrees with the
 * calorie half.
 *
 * `5.12_the_decree` shows the derived total as a plain line of text. It is worth more than that —
 * it is the only thing on the screen that can tell you a decree is internally impossible before you
 * spend a week failing to hit it — so the divergence is named rather than left for the reader to
 * subtract.
 */
export function checkDecree(decree: {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}): DecreeCheck {
  const derived = caloriesFromMacros(decree);
  const summary = `${whole(derived)} kcal from these macros`;
  if (!Number.isFinite(decree.calories)) return { derived, summary, divergence: null };

  const gap = Math.round(decree.calories - derived);
  if (Math.abs(gap) <= DECREE_TOLERANCE_KCAL) return { derived, summary, divergence: null };
  return {
    derived,
    summary,
    divergence:
      gap > 0
        ? `${gap.toLocaleString()} kcal of the forge unaccounted for`
        : `${Math.abs(gap).toLocaleString()} kcal more than the forge allows`,
  };
}
