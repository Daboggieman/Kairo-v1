import { LOCAL_USER_ID } from '@/constants';
import { summariseMacros } from '@/domain/macros';

import { createTestDb, type TestDatabase } from './testDb';
import {
  addNutritionEntry,
  createFoodItem,
  deleteNutritionEntry,
  getFoodItem,
  getMacroTargetForDate,
  listNutritionEntriesForDate,
  searchFoodItems,
  setMacroTarget,
} from '../macros';
import { migrate } from '../migrations';
import { SCHEMA_VERSION } from '../schema';

const USER = LOCAL_USER_ID;
const OTHER_USER = 'someone-else';

let idCounter = 0;

function addFood(
  db: TestDatabase,
  name: string,
  overrides: Partial<Parameters<typeof createFoodItem>[1]> = {},
) {
  idCounter += 1;
  return createFoodItem(db, {
    id: `food-${idCounter}`,
    userId: USER,
    name,
    caloriesPerServing: 165,
    proteinG: 31,
    carbsG: 0,
    fatG: 3.6,
    servingLabel: '100 g',
    createdAt: `2026-08-14T08:${String(idCounter).padStart(2, '0')}:00.000Z`,
    ...overrides,
  });
}

async function logFood(
  db: TestDatabase,
  foodItemId: string,
  overrides: Partial<Parameters<typeof addNutritionEntry>[1]> = {},
) {
  idCounter += 1;
  const entry = {
    id: `entry-${idCounter}`,
    userId: USER,
    foodItemId,
    loggedAt: `2026-08-14T12:${String(idCounter).padStart(2, '0')}:00.000Z`,
    loggedDate: '2026-08-14',
    quantity: 1,
    mealType: 'lunch' as const,
    ...overrides,
  };
  await addNutritionEntry(db, entry);
  return entry;
}

function saveTarget(
  db: TestDatabase,
  effectiveDate: string,
  overrides: Partial<Parameters<typeof setMacroTarget>[1]> = {},
) {
  idCounter += 1;
  return setMacroTarget(db, {
    id: `target-${idCounter}`,
    userId: USER,
    calories: 2000,
    proteinG: 160,
    carbsG: 220,
    fatG: 65,
    effectiveDate,
    createdAt: `${effectiveDate}T08:00:00.000Z`,
    ...overrides,
  });
}

describe('macros query layer', () => {
  let db: TestDatabase;

  beforeEach(async () => {
    db = await createTestDb();
  });

  afterEach(() => db.close());

  describe('migration', () => {
    it('creates the nutrition tables at schema version 4', async () => {
      const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
      expect(version?.user_version).toBe(SCHEMA_VERSION);
      expect(await searchFoodItems(db, USER, '')).toEqual([]);
    });

    it('is idempotent and keeps nutrition data', async () => {
      const item = await addFood(db, 'Chicken');
      await logFood(db, item.id);
      await migrate(db);
      expect(await listNutritionEntriesForDate(db, USER, '2026-08-14')).toHaveLength(1);
    });

    it('upgrades a populated v3 database without losing earlier modules', async () => {
      await db.runAsync(
        'INSERT INTO workout_sessions (id, user_id, started_at) VALUES (?, ?, ?)',
        'session-existing', USER, '2026-08-14T06:00:00.000Z',
      );
      await db.runAsync(
        `INSERT INTO body_weight_entries (id, user_id, recorded_at, weight, weight_unit)
         VALUES (?, ?, ?, ?, ?)`,
        'weight-existing', USER, '2026-08-14T07:00:00.000Z', 80, 'kg',
      );
      await db.runAsync(
        `INSERT INTO tasks (id, user_id, title, recurrence_rule, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        'task-existing', USER, 'Stretch', 'daily', '2026-08-01T08:00:00.000Z',
      );

      await db.execAsync('DROP TABLE macro_targets');
      await db.execAsync('DROP TABLE nutrition_entries');
      await db.execAsync('DROP TABLE food_items');
      await db.execAsync('PRAGMA user_version = 3');
      await migrate(db);

      expect((await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))?.user_version)
        .toBe(SCHEMA_VERSION);
      expect(await db.getFirstAsync('SELECT id FROM workout_sessions')).toMatchObject({ id: 'session-existing' });
      expect(await db.getFirstAsync('SELECT id FROM body_weight_entries')).toMatchObject({ id: 'weight-existing' });
      expect(await db.getFirstAsync('SELECT id FROM tasks')).toMatchObject({ id: 'task-existing' });
      expect((await addFood(db, 'Oats')).name).toBe('Oats');
    });
  });

  describe('food library', () => {
    it('round-trips a custom food', async () => {
      const created = await addFood(db, 'Greek yogurt', {
        caloriesPerServing: 120,
        proteinG: 18,
        carbsG: 7,
        fatG: 2,
        servingLabel: '170 g tub',
      });
      expect(await getFoodItem(db, created.id)).toEqual(created);
    });

    it('searches case-insensitive substrings in alphabetical order', async () => {
      await addFood(db, 'Chicken thigh');
      await addFood(db, 'Grilled chicken breast');
      await addFood(db, 'Rice');
      expect((await searchFoodItems(db, USER, 'CHICKEN')).map((food) => food.name)).toEqual([
        'Chicken thigh',
        'Grilled chicken breast',
      ]);
    });

    it('treats SQL wildcard characters as literal search text', async () => {
      await addFood(db, 'Yogurt 2%');
      await addFood(db, 'Yogurt plain');
      expect((await searchFoodItems(db, USER, '%')).map((food) => food.name)).toEqual(['Yogurt 2%']);
    });

    it('is scoped to one user', async () => {
      await addFood(db, 'Mine');
      await addFood(db, 'Theirs', { userId: OTHER_USER });
      expect((await searchFoodItems(db, USER, '')).map((food) => food.name)).toEqual(['Mine']);
    });

    it('rejects negative nutrition values', async () => {
      await expect(addFood(db, 'Broken', { proteinG: -1 })).rejects.toThrow();
    });
  });

  describe('day entries', () => {
    it('joins the stored entry to its food definition', async () => {
      const item = await addFood(db, 'Chicken');
      const logged = await logFood(db, item.id, { quantity: 1.5, mealType: 'dinner' });
      const [row] = await listNutritionEntriesForDate(db, USER, '2026-08-14');
      expect(row).toMatchObject({ ...logged, food: item });
    });

    it('orders breakfast, lunch, dinner, then snacks', async () => {
      const item = await addFood(db, 'Food');
      await logFood(db, item.id, { mealType: 'snack' });
      await logFood(db, item.id, { mealType: 'dinner' });
      await logFood(db, item.id, { mealType: 'breakfast' });
      await logFood(db, item.id, { mealType: 'lunch' });
      expect((await listNutritionEntriesForDate(db, USER, '2026-08-14')).map((row) => row.mealType))
        .toEqual(['breakfast', 'lunch', 'dinner', 'snack']);
    });

    it('keeps dates and users isolated', async () => {
      const mine = await addFood(db, 'Mine');
      const theirs = await addFood(db, 'Theirs', { userId: OTHER_USER });
      await logFood(db, mine.id);
      await logFood(db, mine.id, { loggedDate: '2026-08-13' });
      await logFood(db, theirs.id, { userId: OTHER_USER });
      expect(await listNutritionEntriesForDate(db, USER, '2026-08-14')).toHaveLength(1);
    });

    it('refuses another user’s food item', async () => {
      const theirs = await addFood(db, 'Theirs', { userId: OTHER_USER });
      await expect(logFood(db, theirs.id)).rejects.toThrow('Food item not found');
    });

    it('rejects zero quantity and unknown meals', async () => {
      const item = await addFood(db, 'Food');
      await expect(logFood(db, item.id, { quantity: 0 })).rejects.toThrow();
      await expect(logFood(db, item.id, { mealType: 'brunch' as 'lunch' })).rejects.toThrow();
    });

    it('deletes only the requested user’s entry', async () => {
      const item = await addFood(db, 'Food');
      const logged = await logFood(db, item.id);
      expect(await deleteNutritionEntry(db, logged.id, OTHER_USER)).toBe(false);
      expect(await deleteNutritionEntry(db, logged.id, USER)).toBe(true);
      expect(await listNutritionEntriesForDate(db, USER, '2026-08-14')).toEqual([]);
    });
  });

  describe('effective-dated targets', () => {
    it('returns the newest target already in effect', async () => {
      await saveTarget(db, '2026-08-01', { calories: 2200 });
      await saveTarget(db, '2026-08-10', { calories: 2000 });
      await saveTarget(db, '2026-08-20', { calories: 1800 });
      expect((await getMacroTargetForDate(db, USER, '2026-08-14'))?.calories).toBe(2000);
    });

    it('returns null before the first target', async () => {
      await saveTarget(db, '2026-08-10');
      expect(await getMacroTargetForDate(db, USER, '2026-08-09')).toBeNull();
    });

    it('updates a repeated save on the same effective date', async () => {
      const first = await saveTarget(db, '2026-08-14', { calories: 2000 });
      const second = await saveTarget(db, '2026-08-14', { calories: 2400 });
      expect(second.id).toBe(first.id);
      expect(second.calories).toBe(2400);
      expect(await db.getAllAsync('SELECT id FROM macro_targets')).toHaveLength(1);
    });

    it('is scoped to one user', async () => {
      await saveTarget(db, '2026-08-14', { userId: OTHER_USER, calories: 3000 });
      expect(await getMacroTargetForDate(db, USER, '2026-08-14')).toBeNull();
    });

    it('rejects negative targets', async () => {
      await expect(saveTarget(db, '2026-08-14', { fatG: -1 })).rejects.toThrow();
    });
  });

  it('feeds real query output into the domain summary', async () => {
    const chicken = await addFood(db, 'Chicken');
    const rice = await addFood(db, 'Rice', {
      caloriesPerServing: 200,
      proteinG: 4,
      carbsG: 44,
      fatG: 0.5,
      servingLabel: 'cup',
    });
    await logFood(db, chicken.id, { quantity: 2 });
    await logFood(db, rice.id, { quantity: 1.5 });
    const target = await saveTarget(db, '2026-08-01');

    const summary = summariseMacros(
      await listNutritionEntriesForDate(db, USER, '2026-08-14'),
      await getMacroTargetForDate(db, USER, '2026-08-14'),
    );
    expect(summary.totals).toEqual({ calories: 630, proteinG: 68, carbsG: 66, fatG: 7.95 });
    expect(summary.calories.target).toBe(target.calories);
    expect(summary.calories.fillRatio).toBeCloseTo(0.315);
  });
});
