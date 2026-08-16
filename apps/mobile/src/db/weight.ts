/**
 * Typed queries for the weight module, following `src/db/workouts.ts`: the only place that
 * knows the storage representation, with the `SQLiteDatabase` passed in rather than
 * imported so the functions stay testable.
 *
 * Unlike the workouts module there is no store here. A weight entry is a single insert with
 * no in-flight state to keep — nothing survives a force-kill because nothing is ever
 * half-entered — so the screens read and write these directly.
 */

import type { SQLiteDatabase } from 'expo-sqlite';

import { BodyWeightEntry, BodyWeightEntryRow, toBodyWeightEntry, WeightUnit } from './types';
import { enqueue, type WeightEntryWire } from './outbox';

/**
 * Entries newest first, for the list under the chart.
 *
 * The chart itself uses `listEntriesAscending` — plotting wants oldest-first and reversing
 * a thousand-element array on every render to get there is silly when SQL can sort either way.
 */
export async function listEntries(
  db: SQLiteDatabase,
  userId: string,
  limit = 200,
): Promise<BodyWeightEntry[]> {
  const rows = await db.getAllAsync<BodyWeightEntryRow>(
    `SELECT * FROM body_weight_entries
     WHERE user_id = ?
     ORDER BY recorded_at DESC
     LIMIT ?`,
    userId,
    limit,
  );
  return rows.map(toBodyWeightEntry);
}

/**
 * Entries oldest first — chart order.
 *
 * The limit applies to the *newest* rows (inner query), then the result is flipped. Ordering
 * ascending with a LIMIT would keep the oldest N and drop everything recent, which is the
 * opposite of what a trend chart wants once a user has years of data.
 */
export async function listEntriesAscending(
  db: SQLiteDatabase,
  userId: string,
  limit = 400,
): Promise<BodyWeightEntry[]> {
  const rows = await db.getAllAsync<BodyWeightEntryRow>(
    `SELECT * FROM (
       SELECT * FROM body_weight_entries
       WHERE user_id = ?
       ORDER BY recorded_at DESC
       LIMIT ?
     )
     ORDER BY recorded_at ASC`,
    userId,
    limit,
  );
  return rows.map(toBodyWeightEntry);
}

export async function addEntry(
  db: SQLiteDatabase,
  entry: {
    id: string;
    userId: string;
    recordedAt: string;
    weight: number;
    weightUnit: WeightUnit;
    note: string | null;
  },
): Promise<BodyWeightEntry> {
  const wire: WeightEntryWire = {
    id: entry.id,
    recorded_at: entry.recordedAt,
    weight: entry.weight,
    weight_unit: entry.weightUnit,
    note: entry.note,
  };
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync(
      `INSERT INTO body_weight_entries (id, user_id, recorded_at, weight, weight_unit, note)
       VALUES (?, ?, ?, ?, ?, ?)`,
      entry.id,
      entry.userId,
      entry.recordedAt,
      entry.weight,
      entry.weightUnit,
      entry.note,
    );
    await enqueue(tx, {
      userId: entry.userId,
      entityType: 'body_weight_entry',
      entityId: entry.id,
      operation: 'upsert',
      payload: wire,
    });
  });
  return { ...entry };
}

/** Undo for a mis-typed entry — the one destructive action the weight screen offers. */
export async function deleteEntry(db: SQLiteDatabase, id: string): Promise<void> {
  const entry = await getEntry(db, id);
  if (!entry) return;
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync('DELETE FROM body_weight_entries WHERE id = ?', id);
    await enqueue(tx, {
      userId: entry.userId,
      entityType: 'body_weight_entry',
      entityId: id,
      operation: 'delete',
      payload: null,
    });
  });
}

/**
 * The most recent entry, which pre-fills the quick-entry field.
 *
 * Same reasoning as `suggestNextSet` in the workouts module: yesterday's weight is one or
 * two taps from today's, where an empty field is a full keyboard entry every morning.
 */
export async function latestEntry(
  db: SQLiteDatabase,
  userId: string,
): Promise<BodyWeightEntry | null> {
  const row = await db.getFirstAsync<BodyWeightEntryRow>(
    `SELECT * FROM body_weight_entries
     WHERE user_id = ?
     ORDER BY recorded_at DESC
     LIMIT 1`,
    userId,
  );
  return row ? toBodyWeightEntry(row) : null;
}

export async function getEntry(db: SQLiteDatabase, id: string): Promise<BodyWeightEntry | null> {
  const row = await db.getFirstAsync<BodyWeightEntryRow>(
    'SELECT * FROM body_weight_entries WHERE id = ?',
    id,
  );
  return row ? toBodyWeightEntry(row) : null;
}
