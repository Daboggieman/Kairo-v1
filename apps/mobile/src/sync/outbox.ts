/** Ordered replay of durable local mutations to the authenticated API. */

import type { SQLiteDatabase } from 'expo-sqlite';

import {
  listDue,
  markFailed,
  markRetry,
  markSucceeded,
  type OutboxRow,
  type WeightEntryWire,
} from '@/db/outbox';

import { ApiError, createSyncClient, type SyncClient } from './client';
import { syncConfig, type SyncConfig } from './config';

const BATCH_SIZE = 20;
const MAX_BACKOFF_MS = 60 * 60 * 1000;

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
  const rows = await listDue(db, new Date(nowMs).toISOString(), BATCH_SIZE);
  let succeeded = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      await replay(client, row);
      await markSucceeded(db, row.id);
      succeeded += 1;
    } catch (error) {
      const attempts = row.attempts + 1;
      const message = error instanceof Error ? error.message : String(error);
      if (error instanceof ApiError && error.status >= 400 && error.status < 500
        && error.status !== 401 && error.status !== 408 && error.status !== 429) {
        await markFailed(db, row.id, attempts, message);
      } else {
        const delay = Math.min(2 ** Math.min(attempts, 10) * 1000, MAX_BACKOFF_MS);
        await markRetry(db, row.id, attempts, message, new Date(nowMs + delay).toISOString());
      }
      failed += 1;
      // Preserve operation order. A later delete must not overtake a failed create.
      break;
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
  if (row.entity_type !== 'body_weight_entry') {
    throw new ApiError(`Unsupported sync entity: ${row.entity_type}`, 422);
  }
  if (row.operation === 'delete') {
    await client.delete(`/api/v1/weight-entries/${encodeURIComponent(row.entity_id)}`);
    return;
  }
  if (!row.payload) throw new ApiError('Weight upsert is missing its payload', 422);
  const payload = JSON.parse(row.payload) as WeightEntryWire;
  await client.post('/api/v1/weight-entries', payload);
}
