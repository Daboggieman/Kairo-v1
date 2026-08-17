/** Durable sync intents. This module only knows storage; transport lives in `src/sync`. */

import type { SQLiteDatabase } from 'expo-sqlite';

export type SyncEntity =
  | 'body_weight_entry'
  | 'task'
  | 'task_completion'
  | 'food_item'
  | 'nutrition_entry'
  | 'macro_target'
  | 'workout_session'
  | 'workout_set'
  | 'movement_activity';
export type SyncOperation = 'upsert' | 'update' | 'delete';

export type WeightEntryWire = {
  id: string;
  recorded_at: string;
  weight: number;
  weight_unit: 'kg' | 'lb';
  note: string | null;
};

export type TaskWire = {
  id: string;
  title: string;
  recurrence_rule: string;
  created_at: string;
  archived: boolean;
};

export type TaskCompletionWire = {
  id: string;
  task_id: string;
  completed_date: string;
  completed_at: string;
};

export type FoodItemWire = {
  id: string;
  name: string;
  calories_per_serving: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  serving_label: string;
  created_at: string;
};

export type NutritionEntryWire = {
  id: string;
  food_item_id: string;
  logged_at: string;
  logged_date: string;
  quantity: number;
  meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack';
};

export type MacroTargetWire = {
  id: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  effective_date: string;
  created_at: string;
};

export type WorkoutSessionWire = {
  id: string;
  started_at?: string;
  ended_at?: string | null;
  notes?: string | null;
};

export type WorkoutSetWire = {
  id: string;
  session_id: string;
  exercise_id: string;
  set_number: number;
  reps: number;
  weight: number;
  weight_unit: 'kg' | 'lb';
  rpe: number | null;
  rest_seconds: number | null;
};

export type MovementActivityWire = {
  id: string;
  activity_type: 'run' | 'walk' | 'ride';
  name: string | null;
  started_at: string;
  ended_at: string;
  elapsed_seconds: number;
  moving_seconds: number;
  paused_seconds: number;
  distance_meters: number;
  elevation_gain_meters: number;
  average_speed_mps: number | null;
  revision: number;
  created_at: string;
  updated_at: string;
  points: {
    id: string; sequence: number; recorded_at: string; latitude: number; longitude: number;
    altitude_meters: number | null; horizontal_accuracy_meters: number | null;
    provider_speed_mps: number | null; processing_state: 'accepted' | 'rejected';
    rejection_reason: string | null; is_paused: boolean; excluded_by_edit: boolean;
  }[];
  events: {
    id: string; sequence: number; event_type: string; occurred_at: string; payload_json: string | null;
  }[];
};

export type OutboxRow = {
  id: number;
  user_id: string;
  entity_type: SyncEntity;
  entity_id: string;
  operation: SyncOperation;
  payload: string | null;
  created_at: string;
  attempts: number;
  last_error: string | null;
  next_attempt_at: string | null;
};

export async function enqueue(
  db: SQLiteDatabase,
  intent: {
    userId: string;
    entityType: SyncEntity;
    entityId: string;
    operation: SyncOperation;
    payload: unknown;
  },
): Promise<void> {
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO sync_outbox
       (user_id, entity_type, entity_id, operation, payload, created_at, next_attempt_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    intent.userId,
    intent.entityType,
    intent.entityId,
    intent.operation,
    intent.payload === null ? null : JSON.stringify(intent.payload),
    now,
    now,
  );
}

export async function listDue(
  db: SQLiteDatabase,
  nowIso = new Date().toISOString(),
  limit = 20,
): Promise<OutboxRow[]> {
  return db.getAllAsync<OutboxRow>(
    `SELECT * FROM sync_outbox
     WHERE next_attempt_at IS NOT NULL AND next_attempt_at <= ?
     ORDER BY id ASC
     LIMIT ?`,
    nowIso,
    limit,
  );
}

export async function markSucceeded(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM sync_outbox WHERE id = ?', id);
}

export async function markRetry(
  db: SQLiteDatabase,
  id: number,
  attempts: number,
  error: string,
  nextAttemptAt: string,
): Promise<void> {
  await db.runAsync(
    `UPDATE sync_outbox
     SET attempts = ?, last_error = ?, next_attempt_at = ?
     WHERE id = ?`,
    attempts,
    error,
    nextAttemptAt,
    id,
  );
}

export async function markFailed(
  db: SQLiteDatabase,
  id: number,
  attempts: number,
  error: string,
): Promise<void> {
  await db.runAsync(
    `UPDATE sync_outbox
     SET attempts = ?, last_error = ?, next_attempt_at = NULL
     WHERE id = ?`,
    attempts,
    error,
    id,
  );
}

export async function pendingCount(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM sync_outbox WHERE next_attempt_at IS NOT NULL',
  );
  return row?.count ?? 0;
}
