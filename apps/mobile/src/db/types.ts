/**
 * Row types as SQLite actually returns them (snake_case, no booleans, no Date objects),
 * plus the camelCase domain types the UI works with.
 *
 * Keeping these separate means exactly one place — `queries.ts` — knows about the
 * storage representation, so a schema change does not ripple into the screens.
 */

export type WeightUnit = 'kg' | 'lb';
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export type ExerciseRow = {
  id: string;
  name: string;
  muscle_group: string | null;
  equipment: string | null;
  is_custom: number;
};

export type WorkoutSessionRow = {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  notes: string | null;
};

export type WorkoutSetRow = {
  id: string;
  session_id: string;
  exercise_id: string;
  set_number: number;
  reps: number;
  weight: number;
  weight_unit: string;
  rpe: number | null;
  rest_seconds: number | null;
};

export type BodyWeightEntryRow = {
  id: string;
  user_id: string;
  recorded_at: string;
  weight: number;
  weight_unit: string;
  note: string | null;
};

export type TaskRow = {
  id: string;
  user_id: string;
  title: string;
  recurrence_rule: string;
  created_at: string;
  archived: number;
};

export type TaskCompletionRow = {
  id: string;
  task_id: string;
  completed_date: string;
  completed_at: string;
};

export type FoodItemRow = {
  id: string;
  user_id: string;
  name: string;
  calories_per_serving: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  serving_label: string;
  created_at: string;
};

export type NutritionEntryRow = {
  id: string;
  user_id: string;
  food_item_id: string;
  logged_at: string;
  logged_date: string;
  quantity: number;
  meal_type: string;
};

export type MacroTargetRow = {
  id: string;
  user_id: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  effective_date: string;
  created_at: string;
};

export type Exercise = {
  id: string;
  name: string;
  muscleGroup: string | null;
  equipment: string | null;
  isCustom: boolean;
};

export type WorkoutSession = {
  id: string;
  userId: string;
  startedAt: string;
  endedAt: string | null;
  notes: string | null;
};

export type WorkoutSet = {
  id: string;
  sessionId: string;
  exerciseId: string;
  setNumber: number;
  reps: number;
  weight: number;
  weightUnit: WeightUnit;
  rpe: number | null;
  restSeconds: number | null;
};

/** A set joined with its exercise name — what the log and detail screens render. */
export type WorkoutSetWithExercise = WorkoutSet & {
  exerciseName: string;
};

/** History row: a session plus the aggregates the list needs, computed in SQL. */
export type WorkoutSessionSummary = WorkoutSession & {
  setCount: number;
  totalVolume: number;
  exerciseNames: string[];
};

export type BodyWeightEntry = {
  id: string;
  userId: string;
  recordedAt: string;
  weight: number;
  weightUnit: WeightUnit;
  note: string | null;
};

export type Task = {
  id: string;
  userId: string;
  title: string;
  /** Compact rule string; parse with `parseRecurrence` in `src/domain/tasks.ts`. */
  recurrenceRule: string;
  createdAt: string;
  archived: boolean;
};

export type TaskCompletion = {
  id: string;
  taskId: string;
  /** Local calendar day, `YYYY-MM-DD`. */
  completedDate: string;
  completedAt: string;
};

export type FoodItem = {
  id: string;
  userId: string;
  name: string;
  caloriesPerServing: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  servingLabel: string;
  createdAt: string;
};

export type NutritionEntry = {
  id: string;
  userId: string;
  foodItemId: string;
  loggedAt: string;
  /** Local calendar day, `YYYY-MM-DD`. */
  loggedDate: string;
  quantity: number;
  mealType: MealType;
};

/** The day log's row: one entry joined with the food definition it displays and totals. */
export type NutritionEntryWithFood = NutritionEntry & { food: FoodItem };

export type MacroTarget = {
  id: string;
  userId: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  effectiveDate: string;
  createdAt: string;
};

export function toExercise(row: ExerciseRow): Exercise {
  return {
    id: row.id,
    name: row.name,
    muscleGroup: row.muscle_group,
    equipment: row.equipment,
    isCustom: row.is_custom === 1,
  };
}

export function toWorkoutSession(row: WorkoutSessionRow): WorkoutSession {
  return {
    id: row.id,
    userId: row.user_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    notes: row.notes,
  };
}

export function toWorkoutSet(row: WorkoutSetRow): WorkoutSet {
  return {
    id: row.id,
    sessionId: row.session_id,
    exerciseId: row.exercise_id,
    setNumber: row.set_number,
    reps: row.reps,
    weight: row.weight,
    weightUnit: row.weight_unit === 'lb' ? 'lb' : 'kg',
    rpe: row.rpe,
    restSeconds: row.rest_seconds,
  };
}

export function toBodyWeightEntry(row: BodyWeightEntryRow): BodyWeightEntry {
  return {
    id: row.id,
    userId: row.user_id,
    recordedAt: row.recorded_at,
    weight: row.weight,
    weightUnit: row.weight_unit === 'lb' ? 'lb' : 'kg',
    note: row.note,
  };
}

export function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    recurrenceRule: row.recurrence_rule,
    createdAt: row.created_at,
    archived: row.archived === 1,
  };
}

export function toTaskCompletion(row: TaskCompletionRow): TaskCompletion {
  return {
    id: row.id,
    taskId: row.task_id,
    completedDate: row.completed_date,
    completedAt: row.completed_at,
  };
}

export function toFoodItem(row: FoodItemRow): FoodItem {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    caloriesPerServing: row.calories_per_serving,
    proteinG: row.protein_g,
    carbsG: row.carbs_g,
    fatG: row.fat_g,
    servingLabel: row.serving_label,
    createdAt: row.created_at,
  };
}

export function toNutritionEntry(row: NutritionEntryRow): NutritionEntry {
  const mealType: MealType =
    row.meal_type === 'breakfast' ||
    row.meal_type === 'lunch' ||
    row.meal_type === 'dinner'
      ? row.meal_type
      : 'snack';
  return {
    id: row.id,
    userId: row.user_id,
    foodItemId: row.food_item_id,
    loggedAt: row.logged_at,
    loggedDate: row.logged_date,
    quantity: row.quantity,
    mealType,
  };
}

export function toMacroTarget(row: MacroTargetRow): MacroTarget {
  return {
    id: row.id,
    userId: row.user_id,
    calories: row.calories,
    proteinG: row.protein_g,
    carbsG: row.carbs_g,
    fatG: row.fat_g,
    effectiveDate: row.effective_date,
    createdAt: row.created_at,
  };
}
