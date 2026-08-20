import type { FoodItem, MacroTarget, NutritionEntryWithFood } from '@/db/types';

import {
  caloriesFromMacros,
  checkDecree,
  describeEntry,
  describeFood,
  formatMacroSplit,
  formatMealHeading,
  formatNutrition,
  formatRemaining,
  formatServing,
  formatStore,
  groupByMeal,
  isValidNutritionNumber,
  MACRO_LABELS,
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

/**
 * The grouping separator comes from the host locale, which the test run does not pin — only the
 * timezone is fixed, in `jest.globalSetup.js`. Comparing against `toLocaleString()` tests what these
 * functions actually decide (rounding, grouping at all, the unit and its position) without asserting
 * that the machine running the suite is `en-US`.
 */
const grouped = (value: number) => value.toLocaleString();

describe('the Feast lexicon', () => {
  it('names the four stores without a definite article on any of them', () => {
    expect(MACRO_LABELS).toEqual({
      calories: 'Caloric Forge',
      protein: 'Protein Den',
      carbs: 'Granary',
      fat: 'Fat Pool',
    });
  });

  it('glosses each Greek meal name with the plain word it renames', () => {
    expect(formatMealHeading('breakfast')).toBe('Dawn (Breakfast)');
    expect(formatMealHeading('lunch')).toBe('Zenith (Lunch)');
    expect(formatMealHeading('dinner')).toBe('Dusk (Dinner)');
    expect(formatMealHeading('snack')).toBe('Embers (Snacks)');
  });
});

describe('formatMacroSplit / describeFood / describeEntry', () => {
  it('drops a trailing zero from every gram figure', () => {
    expect(formatMacroSplit({ proteinG: 31, carbsG: 0, fatG: 3.6 })).toBe('31 P / 0 C / 3.6 F');
    expect(formatMacroSplit({ proteinG: 31.04, carbsG: 0, fatG: 3.64 })).toBe('31 P / 0 C / 3.6 F');
  });

  it('describes a food per serving', () => {
    expect(describeFood(food())).toBe('100 g · 165 kcal · 31 P / 0 C / 3.6 F');
  });

  it('describes an entry at the quantity it was logged at, not per serving', () => {
    expect(describeEntry(entry('lunch', 1.5))).toBe('1.5 × 100 g · 46.5 P / 0 C / 5.4 F');
  });
});

describe('formatStore', () => {
  it('reports fill against the decree with the unit named once', () => {
    const summary = summariseMacros([entry('lunch', 4)], target());
    expect(formatStore(summary.calories, 'kcal')).toBe(`${grouped(660)} / ${grouped(2000)} kcal`);
    expect(formatStore(summary.protein, 'g')).toBe('124 / 160 g');
  });

  it('reports the consumed figure alone when no decree has been issued', () => {
    const summary = summariseMacros([entry('lunch', 4)], null);
    expect(formatStore(summary.calories, 'kcal')).toBe(`${grouped(660)} kcal`);
    expect(formatStore(summary.protein, 'g')).toBe('124 g');
  });

  it('rounds to whole units — a tenth of a gram is not a thing anyone acts on', () => {
    const summary = summariseMacros([entry('lunch', 1)], target());
    expect(formatStore(summary.fat, 'g')).toBe('4 / 65 g');
  });
});

describe('formatRemaining', () => {
  it('counts down to the decree', () => {
    const summary = summariseMacros([entry('lunch', 4)], target());
    expect(formatRemaining(summary.calories, 'kcal')).toBe(`${grouped(1340)} kcal left`);
  });

  it('counts up past it, without a minus sign', () => {
    const summary = summariseMacros([entry('lunch', 20)], target());
    expect(formatRemaining(summary.calories, 'kcal')).toBe(`${grouped(1300)} kcal over`);
  });

  it('says nothing at all when there is no decree to be under or over', () => {
    const summary = summariseMacros([entry('lunch')], null);
    expect(formatRemaining(summary.calories, 'kcal')).toBe('');
  });
});

describe('caloriesFromMacros / checkDecree', () => {
  it('applies the Atwater factors — 4 to protein and carbohydrate, 9 to fat', () => {
    expect(caloriesFromMacros({ proteinG: 160, carbsG: 220, fatG: 65 })).toBe(2105);
    expect(caloriesFromMacros({ proteinG: 0, carbsG: 0, fatG: 0 })).toBe(0);
  });

  it('stays quiet when the two halves of a decree agree within the tolerance', () => {
    // 2,105 kcal from the macros, so a 2,100 kcal forge is the same decree written twice.
    expect(checkDecree({ calories: 2100, proteinG: 160, carbsG: 220, fatG: 65 })).toEqual({
      derived: 2105,
      summary: `${grouped(2105)} kcal from these macros`,
      divergence: null,
    });
  });

  it('names the shortfall when the forge allows more than the macros account for', () => {
    expect(checkDecree({ calories: 2600, proteinG: 160, carbsG: 220, fatG: 65 }).divergence).toBe(
      `${grouped(495)} kcal of the forge unaccounted for`,
    );
  });

  it('names the excess when the macros come to more than the forge allows', () => {
    expect(checkDecree({ calories: 1800, proteinG: 160, carbsG: 220, fatG: 65 }).divergence).toBe(
      `${grouped(305)} kcal more than the forge allows`,
    );
  });

  it('still reports the derived total while the calorie field is empty', () => {
    const check = checkDecree({
      calories: Number.NaN,
      proteinG: 160,
      carbsG: 220,
      fatG: 65,
    });
    expect(check.summary).toBe(`${grouped(2105)} kcal from these macros`);
    expect(check.divergence).toBeNull();
  });
});
