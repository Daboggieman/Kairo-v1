/** Typed SQLite queries for the local-first macro / nutrition module. */

import type { SQLiteDatabase } from 'expo-sqlite';

import {
  enqueue,
  type FoodItemWire,
  type MacroTargetWire,
  type NutritionEntryWire,
} from './outbox';

import {
  FoodItem,
  FoodItemRow,
  MacroTarget,
  MacroTargetRow,
  MealType,
  NutritionEntryRow,
  NutritionEntryWithFood,
  toFoodItem,
  toMacroTarget,
  toNutritionEntry,
} from './types';

export async function createFoodItem(
  db: SQLiteDatabase,
  food: {
    id: string;
    userId: string;
    name: string;
    caloriesPerServing: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    servingLabel: string;
    createdAt: string;
  },
): Promise<FoodItem> {
  const wire: FoodItemWire = {
    id: food.id,
    name: food.name,
    calories_per_serving: food.caloriesPerServing,
    protein_g: food.proteinG,
    carbs_g: food.carbsG,
    fat_g: food.fatG,
    serving_label: food.servingLabel,
    created_at: food.createdAt,
  };
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync(
      `INSERT INTO food_items (
         id, user_id, name, calories_per_serving, protein_g, carbs_g, fat_g,
         serving_label, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      food.id,
      food.userId,
      food.name,
      food.caloriesPerServing,
      food.proteinG,
      food.carbsG,
      food.fatG,
      food.servingLabel,
      food.createdAt,
    );
    await enqueue(tx, {
      userId: food.userId,
      entityType: 'food_item',
      entityId: food.id,
      operation: 'upsert',
      payload: wire,
    });
  });
  return { ...food };
}

export async function getFoodItem(db: SQLiteDatabase, id: string): Promise<FoodItem | null> {
  const row = await db.getFirstAsync<FoodItemRow>('SELECT * FROM food_items WHERE id = ?', id);
  return row ? toFoodItem(row) : null;
}

/** Case-insensitive substring search over one user's personal food library. */
export async function searchFoodItems(
  db: SQLiteDatabase,
  userId: string,
  query: string,
  limit = 50,
): Promise<FoodItem[]> {
  const rows = await db.getAllAsync<FoodItemRow>(
    `SELECT * FROM food_items
     WHERE user_id = ? AND instr(lower(name), lower(?)) > 0
     ORDER BY name COLLATE NOCASE ASC, created_at ASC
     LIMIT ?`,
    userId,
    query.trim(),
    limit,
  );
  return rows.map(toFoodItem);
}

export async function addNutritionEntry(
  db: SQLiteDatabase,
  entry: {
    id: string;
    userId: string;
    foodItemId: string;
    loggedAt: string;
    loggedDate: string;
    quantity: number;
    mealType: MealType;
  },
): Promise<void> {
  // INSERT … SELECT enforces food ownership in the same statement. A Phase 2 account must
  // never be able to attach its log to another account's custom food by guessing an id.
  const wire: NutritionEntryWire = {
    id: entry.id,
    food_item_id: entry.foodItemId,
    logged_at: entry.loggedAt,
    logged_date: entry.loggedDate,
    quantity: entry.quantity,
    meal_type: entry.mealType,
  };
  await db.withExclusiveTransactionAsync(async (tx) => {
    const result = await tx.runAsync(
      `INSERT INTO nutrition_entries (
         id, user_id, food_item_id, logged_at, logged_date, quantity, meal_type
       )
       SELECT ?, ?, id, ?, ?, ?, ? FROM food_items
       WHERE id = ? AND user_id = ?`,
      entry.id,
      entry.userId,
      entry.loggedAt,
      entry.loggedDate,
      entry.quantity,
      entry.mealType,
      entry.foodItemId,
      entry.userId,
    );
    if (result.changes === 0) throw new Error('Food item not found for this user');
    await enqueue(tx, {
      userId: entry.userId,
      entityType: 'nutrition_entry',
      entityId: entry.id,
      operation: 'upsert',
      payload: wire,
    });
  });
}

type JoinedEntryRow = NutritionEntryRow & {
  food_id: string;
  food_user_id: string;
  food_name: string;
  food_calories_per_serving: number;
  food_protein_g: number;
  food_carbs_g: number;
  food_fat_g: number;
  food_serving_label: string;
  food_created_at: string;
};

/** A day's entries in meal order, then insertion order within each meal. */
export async function listNutritionEntriesForDate(
  db: SQLiteDatabase,
  userId: string,
  loggedDate: string,
): Promise<NutritionEntryWithFood[]> {
  const rows = await db.getAllAsync<JoinedEntryRow>(
    `SELECT e.*,
            f.id AS food_id,
            f.user_id AS food_user_id,
            f.name AS food_name,
            f.calories_per_serving AS food_calories_per_serving,
            f.protein_g AS food_protein_g,
            f.carbs_g AS food_carbs_g,
            f.fat_g AS food_fat_g,
            f.serving_label AS food_serving_label,
            f.created_at AS food_created_at
     FROM nutrition_entries e
     JOIN food_items f ON f.id = e.food_item_id
     WHERE e.user_id = ? AND e.logged_date = ?
     ORDER BY CASE e.meal_type
       WHEN 'breakfast' THEN 0
       WHEN 'lunch' THEN 1
       WHEN 'dinner' THEN 2
       ELSE 3 END,
       e.logged_at ASC`,
    userId,
    loggedDate,
  );

  return rows.map((row) => ({
    ...toNutritionEntry(row),
    food: toFoodItem({
      id: row.food_id,
      user_id: row.food_user_id,
      name: row.food_name,
      calories_per_serving: row.food_calories_per_serving,
      protein_g: row.food_protein_g,
      carbs_g: row.food_carbs_g,
      fat_g: row.food_fat_g,
      serving_label: row.food_serving_label,
      created_at: row.food_created_at,
    }),
  }));
}

/** All nutrition entries in an inclusive local-date range, oldest first. */
export async function listNutritionEntriesBetween(
  db: SQLiteDatabase,
  userId: string,
  fromDate: string,
  toDate: string,
): Promise<NutritionEntryWithFood[]> {
  const rows = await db.getAllAsync<JoinedEntryRow>(
    `SELECT e.*, f.id AS food_id, f.user_id AS food_user_id, f.name AS food_name,
            f.calories_per_serving AS food_calories_per_serving,
            f.protein_g AS food_protein_g, f.carbs_g AS food_carbs_g,
            f.fat_g AS food_fat_g, f.serving_label AS food_serving_label,
            f.created_at AS food_created_at
     FROM nutrition_entries e JOIN food_items f ON f.id = e.food_item_id
     WHERE e.user_id = ? AND e.logged_date BETWEEN ? AND ?
     ORDER BY e.logged_date ASC, e.logged_at ASC`,
    userId, fromDate, toDate,
  );
  return rows.map((row) => ({
    ...toNutritionEntry(row),
    food: toFoodItem({ id: row.food_id, user_id: row.food_user_id, name: row.food_name,
      calories_per_serving: row.food_calories_per_serving, protein_g: row.food_protein_g,
      carbs_g: row.food_carbs_g, fat_g: row.food_fat_g, serving_label: row.food_serving_label,
      created_at: row.food_created_at }),
  }));
}

export async function deleteNutritionEntry(
  db: SQLiteDatabase,
  id: string,
  userId: string,
): Promise<boolean> {
  let removed = false;
  await db.withExclusiveTransactionAsync(async (tx) => {
    const result = await tx.runAsync(
      'DELETE FROM nutrition_entries WHERE id = ? AND user_id = ?',
      id,
      userId,
    );
    removed = result.changes > 0;
    if (!removed) return;
    await enqueue(tx, {
      userId,
      entityType: 'nutrition_entry',
      entityId: id,
      operation: 'delete',
      payload: null,
    });
  });
  return removed;
}

/** Latest target already effective on the requested day; future target changes are ignored. */
export async function getMacroTargetForDate(
  db: SQLiteDatabase,
  userId: string,
  date: string,
): Promise<MacroTarget | null> {
  const row = await db.getFirstAsync<MacroTargetRow>(
    `SELECT * FROM macro_targets
     WHERE user_id = ? AND effective_date <= ?
     ORDER BY effective_date DESC, created_at DESC
     LIMIT 1`,
    userId,
    date,
  );
  return row ? toMacroTarget(row) : null;
}

/** Effective-dated targets that apply within an inclusive range. */
export async function listMacroTargetsBetween(
  db: SQLiteDatabase,
  userId: string,
  fromDate: string,
  toDate: string,
): Promise<MacroTarget[]> {
  const rows = await db.getAllAsync<MacroTargetRow>(
    `SELECT * FROM macro_targets WHERE user_id = ? AND effective_date BETWEEN ? AND ?
     ORDER BY effective_date ASC, created_at ASC`, userId, fromDate, toDate,
  );
  return rows.map(toMacroTarget);
}

/** Saves one effective-dated target, updating a repeated save on the same date. */
export async function setMacroTarget(
  db: SQLiteDatabase,
  target: {
    id: string;
    userId: string;
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    effectiveDate: string;
    createdAt: string;
  },
): Promise<MacroTarget> {
  const wire: MacroTargetWire = {
    id: target.id,
    calories: target.calories,
    protein_g: target.proteinG,
    carbs_g: target.carbsG,
    fat_g: target.fatG,
    effective_date: target.effectiveDate,
    created_at: target.createdAt,
  };
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync(
      `INSERT INTO macro_targets (
         id, user_id, calories, protein_g, carbs_g, fat_g, effective_date, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, effective_date) DO UPDATE SET
         calories = excluded.calories,
         protein_g = excluded.protein_g,
         carbs_g = excluded.carbs_g,
         fat_g = excluded.fat_g`,
      target.id,
      target.userId,
      target.calories,
      target.proteinG,
      target.carbsG,
      target.fatG,
      target.effectiveDate,
      target.createdAt,
    );
    await enqueue(tx, {
      userId: target.userId,
      entityType: 'macro_target',
      entityId: `${target.userId}:${target.effectiveDate}`,
      operation: 'upsert',
      payload: wire,
    });
  });

  const saved = await db.getFirstAsync<MacroTargetRow>(
    'SELECT * FROM macro_targets WHERE user_id = ? AND effective_date = ?',
    target.userId,
    target.effectiveDate,
  );
  if (!saved) throw new Error('Macro target was not saved');
  return toMacroTarget(saved);
}
