import type { FoodItem, MacroTarget, NutritionEntryWithFood } from '@/db/types';

import {
  formatNutrition,
  formatServing,
  groupByMeal,
  isValidNutritionNumber,
  nutritionFor,
  summariseEntries,
  summariseMacros,
} from '../macros';

let idCounter = 0;

function food(overrides: Partial<FoodItem> = {}): FoodItem {
  idCounter += 1;
  return {
    id: `food-${idCounter}`,
    userId: 'local-user',
    name: 'Chicken breast',
    caloriesPerServing: 165,
    proteinG: 31,
    carbsG: 0,
    fatG: 3.6,
    servingLabel: '100 g',
    createdAt: '2026-08-14T12:00:00.000Z',
    ...overrides,
  };
}

function entry(
  mealType: NutritionEntryWithFood['mealType'],
  quantity = 1,
  foodOverrides: Partial<FoodItem> = {},
): NutritionEntryWithFood {
  const item = food(foodOverrides);
  return {
    id: `entry-${item.id}`,
    userId: 'local-user',
    foodItemId: item.id,
    loggedAt: '2026-08-14T12:00:00.000Z',
    loggedDate: '2026-08-14',
    quantity,
    mealType,
    food: item,
  };
}

function target(overrides: Partial<MacroTarget> = {}): MacroTarget {
  return {
    id: 'target-1',
    userId: 'local-user',
    calories: 2000,
    proteinG: 160,
    carbsG: 220,
    fatG: 65,
    effectiveDate: '2026-08-14',
    createdAt: '2026-08-14T08:00:00.000Z',
    ...overrides,
  };
}

describe('nutritionFor', () => {
  it('multiplies every nutrient by the serving quantity', () => {
    expect(nutritionFor(food(), 1.5)).toEqual({
      calories: 247.5,
      proteinG: 46.5,
      carbsG: 0,
      fatG: 5.4,
    });
  });

  it('treats an invalid quantity as zero instead of producing NaN', () => {
    expect(nutritionFor(food(), Number.NaN)).toEqual({
      calories: 0,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
    });
    expect(nutritionFor(food(), -2).calories).toBe(0);
  });
});

describe('summariseEntries', () => {
  it('adds mixed foods and quantities', () => {
    const totals = summariseEntries([
      entry('lunch', 2),
      entry('lunch', 0.5, {
        caloriesPerServing: 200,
        proteinG: 4,
        carbsG: 40,
        fatG: 2,
      }),
    ]);

    expect(totals).toEqual({ calories: 430, proteinG: 64, carbsG: 20, fatG: 8.2 });
  });

  it('returns zeroes for an empty day', () => {
    expect(summariseEntries([])).toEqual({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });
  });
});

describe('summariseMacros', () => {
  it('compares totals with each target', () => {
    const summary = summariseMacros([
      entry('dinner', 1, {
        caloriesPerServing: 1000,
        proteinG: 80,
        carbsG: 110,
        fatG: 32.5,
      }),
    ], target());

    expect(summary.calories).toEqual({
      consumed: 1000,
      target: 2000,
      remaining: 1000,
      fillRatio: 0.5,
      overTarget: false,
    });
    expect(summary.protein.fillRatio).toBe(0.5);
    expect(summary.carbs.fillRatio).toBe(0.5);
    expect(summary.fat.fillRatio).toBe(0.5);
  });

  it('caps the drawable fill while preserving an over-target total', () => {
    const summary = summariseMacros([
      entry('snack', 1, { caloriesPerServing: 2400 }),
    ], target());

    expect(summary.calories.fillRatio).toBe(1);
    expect(summary.calories.remaining).toBe(-400);
    expect(summary.calories.overTarget).toBe(true);
    expect(summary.calories.consumed).toBe(2400);
  });

  it('reports no comparison before targets are configured', () => {
    const summary = summariseMacros([entry('breakfast')], null);
    expect(summary.calories).toMatchObject({ target: null, remaining: null, fillRatio: 0 });
    expect(summary.protein.target).toBeNull();
  });

  it('treats a zero target as unset rather than dividing by zero', () => {
    const summary = summariseMacros([entry('breakfast')], target({ calories: 0 }));
    expect(summary.calories.fillRatio).toBe(0);
    expect(summary.calories.target).toBeNull();
  });
});

describe('groupByMeal', () => {
  it('returns meals in day order regardless of input order', () => {
    const groups = groupByMeal([
      entry('snack'),
      entry('dinner'),
      entry('breakfast'),
      entry('lunch'),
    ]);
    expect(groups.map((group) => group.mealType)).toEqual([
      'breakfast',
      'lunch',
      'dinner',
      'snack',
    ]);
  });

  it('keeps an empty group so the UI can offer an add action for every meal', () => {
    const groups = groupByMeal([entry('lunch')]);
    expect(groups.find((group) => group.mealType === 'breakfast')?.entries).toEqual([]);
  });

  it('summarises each meal independently', () => {
    const groups = groupByMeal([entry('breakfast', 1), entry('lunch', 2)]);
    expect(groups[0].totals.calories).toBe(165);
    expect(groups[1].totals.calories).toBe(330);
  });
});

describe('formatting and validation', () => {
  it('formats serving multipliers without trailing zeroes', () => {
    expect(formatServing(1, '100 g')).toBe('1 × 100 g');
    expect(formatServing(1.25, 'scoop')).toBe('1.25 × scoop');
  });

  it('formats calories as whole values and macros to one decimal', () => {
    expect(formatNutrition(165.4, 'kcal')).toBe('165 kcal');
    expect(formatNutrition(31.04, 'g')).toBe('31.0 g');
    expect(formatNutrition(-0.01, 'g')).toBe('0.0 g');
  });

  it('accepts zero but rejects negatives, infinities and values over the form bound', () => {
    expect(isValidNutritionNumber(0, 1000)).toBe(true);
    expect(isValidNutritionNumber(1000, 1000)).toBe(true);
    expect(isValidNutritionNumber(-1, 1000)).toBe(false);
    expect(isValidNutritionNumber(Number.POSITIVE_INFINITY, 1000)).toBe(false);
    expect(isValidNutritionNumber(1001, 1000)).toBe(false);
  });
});
