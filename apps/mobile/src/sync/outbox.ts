/** Ordered replay of durable local mutations to the authenticated API. */

import type { SQLiteDatabase } from 'expo-sqlite';

import { LOCAL_USER_ID } from '@/constants';
import {
  listDue,
  markFailed,
  markRetry,
  markSucceeded,
  type FoodItemWire,
  type MacroTargetWire,
  type MovementActivityWire,
  type NutritionEntryWire,
  type OutboxRow,
  type TaskCompletionWire,
  type TaskWire,
  type WeightEntryWire,
  type WorkoutSessionWire,
  type WorkoutSetDeleteWire,
  type WorkoutSetUpdateWire,
  type WorkoutSetWire,
} from '@/db/outbox';
import { setLastSyncAt } from '@/db/preferences';

import { ApiError, createSyncClient, type SyncClient } from './client';
import { syncConfig, type SyncConfig } from './config';

const BATCH_SIZE = 20;
/**
 * The ceiling on exponential backoff. Exported because The Envoy states the retry policy to the
 * user, and a screen that describes this behaviour has to read the number that implements it —
 * the design's own caption said "capped at 10m", which was never what this said.
 */
export const MAX_BACKOFF_MS = 60 * 60 * 1000;

export type SyncResult = {
  status: 'disabled' | 'complete';
  processed: number;
  succeeded: number;
  failed: number;
};

export async function syncOutbox(
  db: SQLiteDatabase,
  options: {
    config?: SyncConfig;
    client?: SyncClient | null;
    nowMs?: number;
  } = {},
): Promise<SyncResult> {
  const config = options.config ?? syncConfig;
  const client = options.client === undefined ? createSyncClient(config) : options.client;
  if (!client) return { status: 'disabled', processed: 0, succeeded: 0, failed: 0 };

  const nowMs = options.nowMs ?? Date.now();
  let succeeded = 0;
  let failed = 0;

  let stop = false;
  while (!stop) {
    const rows = await listDue(db, new Date(nowMs).toISOString(), BATCH_SIZE);
    if (rows.length === 0) break;
    for (const row of rows) {
      try {
        await replay(client, row);
        await markSucceeded(db, row.id);
        succeeded += 1;
      } catch (error) {
        const attempts = row.attempts + 1;
        const message = error instanceof Error ? error.message : String(error);
        if (isTerminal(error)) {
          await markFailed(db, row.id, attempts, message);
        } else {
          const delay = Math.min(2 ** Math.min(attempts, 10) * 1000, MAX_BACKOFF_MS);
          await markRetry(db, row.id, attempts, message, new Date(nowMs + delay).toISOString());
        }
        failed += 1;
        stop = true;
        // Preserve operation order. A later delete must not overtake a failed create.
        break;
      }
    }
  }

  /**
   * The one write this module makes outside the outbox.
   *
   * Gated on `succeeded > 0`, not on the run merely finishing: with `SyncBootstrap` calling in every
   * 60 seconds, "the loop ran" is true almost always and tells nobody anything, and a run that found
   * nothing due never touched the network — stamping it would claim a freshness it has not verified.
   * So this records the last time an intent actually reached the server, which is the question The
   * Envoy is open to answer.
   *
   * The write is best-effort. Failing to record a timestamp must not turn a successful sync into a
   * failed one.
   */
  if (succeeded > 0) {
    try {
      await setLastSyncAt(db, LOCAL_USER_ID, nowMs);
    } catch {
      // The delivery already happened; only the bookkeeping is missing.
    }
  }

  return {
    status: 'complete',
    processed: succeeded + failed,
    succeeded,
    failed,
  };
}

async function replay(client: SyncClient, row: OutboxRow): Promise<void> {
  if (row.entity_type === 'workout_session') {
    const payload = parsePayload<WorkoutSessionWire>(row, 'workout session');
    if (row.operation === 'update') {
      const { id: _id, ...update } = payload;
      await client.patch(`/api/v1/workouts/${encodeURIComponent(row.entity_id)}`, update);
    } else {
      await client.post('/api/v1/workouts', payload);
    }
    return;
  }

  if (row.entity_type === 'workout_set') {
    if (row.operation === 'delete') {
      const { session_id: sessionId } = parsePayload<WorkoutSetDeleteWire>(row, 'workout set');
      await client.delete(
        `/api/v1/workouts/${encodeURIComponent(sessionId)}/sets/${encodeURIComponent(row.entity_id)}`,
      );
      return;
    }
    if (row.operation === 'update') {
      const { session_id: sessionId, ...update } = parsePayload<WorkoutSetUpdateWire>(
        row,
        'workout set',
      );
      await client.patch(
        `/api/v1/workouts/${encodeURIComponent(sessionId)}/sets/${encodeURIComponent(row.entity_id)}`,
        update,
      );
      return;
    }
    const payload = parsePayload<WorkoutSetWire>(row, 'workout set');
    const { session_id: sessionId, ...setPayload } = payload;
    await client.post(`/api/v1/workouts/${encodeURIComponent(sessionId)}/sets`, [setPayload]);
    return;
  }
  if (row.entity_type === 'movement_activity') {
    if (row.operation === 'delete') {
      await client.delete(`/api/v1/movements/${encodeURIComponent(row.entity_id)}`);
    } else if (row.operation === 'update') {
      await client.put(
        `/api/v1/movements/${encodeURIComponent(row.entity_id)}`,
        parsePayload<MovementActivityWire>(row, 'movement activity'),
      );
    } else {
      await client.post('/api/v1/movements', parsePayload<MovementActivityWire>(row, 'movement activity'));
    }
    return;
  }
  if (row.entity_type === 'food_item') {
    await client.post('/api/v1/food-items', parsePayload<FoodItemWire>(row, 'food item'));
    return;
  }

  if (row.entity_type === 'nutrition_entry') {
    if (row.operation === 'delete') {
      await client.delete(`/api/v1/nutrition-entries/${encodeURIComponent(row.entity_id)}`);
    } else {
      await client.post(
        '/api/v1/nutrition-entries',
        parsePayload<NutritionEntryWire>(row, 'nutrition entry'),
      );
    }
    return;
  }

  if (row.entity_type === 'macro_target') {
    await client.put('/api/v1/macro-targets', parsePayload<MacroTargetWire>(row, 'macro target'));
    return;
  }

  if (row.entity_type === 'task') {
    if (row.operation === 'delete') {
      await client.delete(`/api/v1/tasks/${encodeURIComponent(row.entity_id)}`);
      return;
    }
    const payload = parsePayload<TaskWire>(row, 'task');
    if (row.operation === 'update') {
      await client.patch(`/api/v1/tasks/${encodeURIComponent(row.entity_id)}`, payload);
    } else {
      await client.post('/api/v1/tasks', payload);
    }
    return;
  }

  if (row.entity_type === 'task_completion') {
    const payload = parsePayload<TaskCompletionWire>(row, 'task completion');
    if (row.operation === 'delete') {
      await client.delete(
        `/api/v1/tasks/${encodeURIComponent(payload.task_id)}/completions/`
          + encodeURIComponent(payload.completed_date),
      );
    } else {
      await client.post('/api/v1/task-completions', payload);
    }
    return;
  }

  if (row.entity_type === 'body_weight_entry') {
    if (row.operation === 'delete') {
      await client.delete(`/api/v1/weight-entries/${encodeURIComponent(row.entity_id)}`);
      return;
    }
    await client.post('/api/v1/weight-entries', parsePayload<WeightEntryWire>(row, 'weight'));
    return;
  }

  throw new ApiError(`Unsupported sync entity: ${row.entity_type}`, 422);
}


function parsePayload<T>(row: OutboxRow, label: string): T {
  if (!row.payload) throw new ApiError(`${label} operation is missing its payload`, 422);
  try {
    return JSON.parse(row.payload) as T;
  } catch (error) {
    throw new ApiError(
      `Invalid ${label} payload: ${error instanceof Error ? error.message : String(error)}`,
      422,
    );
  }
}

function isTerminal(error: unknown): boolean {
  return error instanceof ApiError && error.status >= 400 && error.status < 500
    && error.status !== 401 && error.status !== 408 && error.status !== 429;
}
