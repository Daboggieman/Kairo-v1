import type { SQLiteDatabase } from 'expo-sqlite';

import type { AcceptedPoint, AutopauseState, CueSchedule, MovementState } from '@/domain/movement';
import { initialCueSchedule } from '@/domain/movement';
import type { UnitSystem } from './preferences';

import {
  type MovementActivity,
  type MovementActivityRow,
  type MovementEvent,
  type MovementEventRow,
  type MovementPoint,
  type MovementPointRow,
  type MovementStatus,
  type MovementType,
  toMovementActivity,
  toMovementEvent,
  toMovementPoint,
} from './types';

export async function createMovementActivity(
  db: SQLiteDatabase,
  input: {
    id: string; userId: string; activityType: MovementType; startedAt: string;
    unitSystem?: UnitSystem;
  },
): Promise<MovementActivity> {
  await db.runAsync(
    `INSERT INTO movement_activities
      (id, user_id, activity_type, status, started_at, created_at, updated_at)
     VALUES (?, ?, ?, 'preparing', ?, ?, ?)`,
    input.id, input.userId, input.activityType, input.startedAt, input.startedAt, input.startedAt,
  );
  const activity = await getMovementActivity(db, input.id, input.userId);
  if (!activity) throw new Error('Movement activity was not created');
  const cueSchedule = initialCueSchedule(input.unitSystem ?? 'metric');
  await db.runAsync(
    `INSERT INTO movement_tracking_state
      (activity_id, next_distance_cue_meters, next_time_cue_seconds) VALUES (?, ?, ?)`,
    input.id, cueSchedule.nextDistanceMeters, cueSchedule.nextTimeSeconds,
  );
  return activity;
}

export async function createMovementEngineState(
  db: SQLiteDatabase,
  activityId: string,
  unitSystem: UnitSystem,
): Promise<void> {
  const schedule = initialCueSchedule(unitSystem);
  await db.runAsync(
    `INSERT INTO movement_tracking_state
      (activity_id, next_distance_cue_meters, next_time_cue_seconds) VALUES (?, ?, ?)
     ON CONFLICT(activity_id) DO NOTHING`,
    activityId, schedule.nextDistanceMeters, schedule.nextTimeSeconds,
  );
}

export async function getMovementEngineState(
  db: SQLiteDatabase,
  activityId: string,
): Promise<{ autopause: AutopauseState; cues: CueSchedule }> {
  const row = await db.getFirstAsync<{
    below_threshold_since_ms: number | null; above_threshold_since_ms: number | null;
    next_distance_cue_meters: number; next_time_cue_seconds: number;
  }>('SELECT * FROM movement_tracking_state WHERE activity_id = ?', activityId);
  if (!row) throw new Error('Movement engine state not found');
  return {
    autopause: {
      belowThresholdSinceMs: row.below_threshold_since_ms,
      aboveThresholdSinceMs: row.above_threshold_since_ms,
    },
    cues: {
      nextDistanceMeters: row.next_distance_cue_meters,
      nextTimeSeconds: row.next_time_cue_seconds,
    },
  };
}

export async function updateMovementEngineState(
  db: SQLiteDatabase,
  activityId: string,
  autopause: AutopauseState,
  cues: CueSchedule,
): Promise<void> {
  await db.runAsync(
    `UPDATE movement_tracking_state SET below_threshold_since_ms = ?,
     above_threshold_since_ms = ?, next_distance_cue_meters = ?, next_time_cue_seconds = ?
     WHERE activity_id = ?`,
    autopause.belowThresholdSinceMs, autopause.aboveThresholdSinceMs,
    cues.nextDistanceMeters, cues.nextTimeSeconds, activityId,
  );
}

export async function getMovementActivity(
  db: SQLiteDatabase,
  id: string,
  userId: string,
): Promise<MovementActivity | null> {
  const row = await db.getFirstAsync<MovementActivityRow>(
    'SELECT * FROM movement_activities WHERE id = ? AND user_id = ?', id, userId,
  );
  return row ? toMovementActivity(row) : null;
}

export async function getActiveMovementActivity(
  db: SQLiteDatabase,
  userId: string,
): Promise<MovementActivity | null> {
  const row = await db.getFirstAsync<MovementActivityRow>(
    `SELECT * FROM movement_activities WHERE user_id = ?
       AND status IN ('preparing','recording','manually_paused','auto_paused','finishing','interrupted')
     ORDER BY started_at DESC LIMIT 1`, userId,
  );
  return row ? toMovementActivity(row) : null;
}

export async function listMovementActivities(
  db: SQLiteDatabase,
  userId: string,
  limit = 100,
): Promise<MovementActivity[]> {
  const rows = await db.getAllAsync<MovementActivityRow>(
    `SELECT * FROM movement_activities WHERE user_id = ? AND status = 'completed'
     ORDER BY started_at DESC LIMIT ?`, userId, limit,
  );
  return rows.map(toMovementActivity);
}

export async function setMovementStatus(
  db: SQLiteDatabase,
  id: string,
  userId: string,
  status: MovementStatus,
  updatedAt: string,
): Promise<void> {
  await db.runAsync(
    'UPDATE movement_activities SET status = ?, updated_at = ? WHERE id = ? AND user_id = ?',
    status, updatedAt, id, userId,
  );
}

export async function completeMovementActivity(
  db: SQLiteDatabase,
  input: { id: string; userId: string; endedAt: string },
): Promise<MovementActivity> {
  await db.withExclusiveTransactionAsync(async (tx) => {
    const result = await tx.runAsync(
      `UPDATE movement_activities SET status = 'completed', ended_at = ?, updated_at = ?,
       average_speed_mps = CASE WHEN moving_seconds > 0
         THEN distance_meters / moving_seconds ELSE NULL END
       WHERE id = ? AND user_id = ?
         AND status IN ('recording','manually_paused','auto_paused','finishing','interrupted')`,
      input.endedAt, input.endedAt, input.id, input.userId,
    );
    if (result.changes === 0) throw new Error('Movement activity cannot be completed');
  });
  const completed = await getMovementActivity(db, input.id, input.userId);
  if (!completed) throw new Error('Completed movement activity not found');
  return completed;
}

export async function editMovementActivity(
  db: SQLiteDatabase,
  input: {
    id: string; userId: string; name: string | null; activityType: MovementType; updatedAt: string;
  },
): Promise<MovementActivity> {
  const result = await db.runAsync(
    `UPDATE movement_activities SET name = ?, activity_type = ?, revision = revision + 1,
     updated_at = ? WHERE id = ? AND user_id = ? AND status = 'completed'`,
    input.name, input.activityType, input.updatedAt, input.id, input.userId,
  );
  if (result.changes === 0) throw new Error('Completed movement activity not found');
  const updated = await getMovementActivity(db, input.id, input.userId);
  if (!updated) throw new Error('Updated movement activity not found');
  return updated;
}

export async function deleteMovementActivity(
  db: SQLiteDatabase,
  id: string,
  userId: string,
): Promise<boolean> {
  const result = await db.runAsync(
    'DELETE FROM movement_activities WHERE id = ? AND user_id = ?', id, userId,
  );
  return result.changes > 0;
}

export async function appendMovementPoint(
  db: SQLiteDatabase,
  input: { id: string; userId: string; activityId: string; point: AcceptedPoint; state: MovementState },
): Promise<void> {
  const recordedAt = new Date(input.point.recordedAtMs).toISOString();
  await db.withExclusiveTransactionAsync(async (tx) => {
    const insert = await tx.runAsync(
      `INSERT INTO movement_points
        (id, activity_id, sequence, recorded_at, latitude, longitude, altitude_meters,
         horizontal_accuracy_meters, provider_speed_mps, distance_from_previous_meters,
         cumulative_distance_meters, processing_state, rejection_reason, is_paused)
       SELECT ?, id, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       FROM movement_activities WHERE id = ? AND user_id = ?`,
      input.id, input.point.sequence, recordedAt, input.point.latitude, input.point.longitude,
      input.point.altitudeMeters ?? null, input.point.accuracyMeters ?? null,
      input.point.speedMps ?? null, input.point.distanceFromPreviousMeters,
      input.point.cumulativeDistanceMeters, input.point.accepted ? 'accepted' : 'rejected',
      input.point.rejectionReason, input.state.status.includes('paused') ? 1 : 0,
      input.activityId, input.userId,
    );
    if (insert.changes === 0) throw new Error('Movement activity not found');
    await tx.runAsync(
      `UPDATE movement_activities SET elapsed_seconds = ?, moving_seconds = ?,
       distance_meters = ?, average_speed_mps = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
      input.state.elapsedSeconds, input.state.movingSeconds, input.state.distanceMeters,
      input.state.movingSeconds > 0 ? input.state.distanceMeters / input.state.movingSeconds : null,
      recordedAt, input.activityId, input.userId,
    );
  });
}

export async function listMovementPoints(
  db: SQLiteDatabase,
  activityId: string,
): Promise<MovementPoint[]> {
  const rows = await db.getAllAsync<MovementPointRow>(
    'SELECT * FROM movement_points WHERE activity_id = ? ORDER BY sequence ASC', activityId,
  );
  return rows.map(toMovementPoint);
}

export async function loadMovementState(
  db: SQLiteDatabase,
  activity: MovementActivity,
): Promise<MovementState> {
  const latest = await db.getFirstAsync<MovementPointRow>(
    'SELECT * FROM movement_points WHERE activity_id = ? ORDER BY sequence DESC LIMIT 1',
    activity.id,
  );
  const lastAccepted = await db.getFirstAsync<MovementPointRow>(
    `SELECT * FROM movement_points WHERE activity_id = ? AND processing_state = 'accepted'
     ORDER BY sequence DESC LIMIT 1`,
    activity.id,
  );
  return {
    status: activity.status,
    activityType: activity.activityType,
    elapsedSeconds: activity.elapsedSeconds,
    movingSeconds: activity.movingSeconds,
    distanceMeters: activity.distanceMeters,
    lastSampleAtMs: latest ? new Date(latest.recorded_at).getTime() : null,
    lastAcceptedPoint: lastAccepted ? {
      latitude: lastAccepted.latitude,
      longitude: lastAccepted.longitude,
      recordedAtMs: new Date(lastAccepted.recorded_at).getTime(),
      accuracyMeters: lastAccepted.horizontal_accuracy_meters,
      altitudeMeters: lastAccepted.altitude_meters,
      speedMps: lastAccepted.provider_speed_mps,
    } : null,
    nextSequence: latest ? latest.sequence + 1 : 0,
  };
}

export async function appendMovementEvent(
  db: SQLiteDatabase,
  input: {
    id: string; userId: string; activityId: string; sequence: number;
    eventType: string; occurredAt: string; payload?: unknown;
  },
): Promise<void> {
  const result = await db.runAsync(
    `INSERT INTO movement_events (id, activity_id, sequence, event_type, occurred_at, payload_json)
     SELECT ?, id, ?, ?, ?, ? FROM movement_activities WHERE id = ? AND user_id = ?`,
    input.id, input.sequence, input.eventType, input.occurredAt,
    input.payload === undefined ? null : JSON.stringify(input.payload),
    input.activityId, input.userId,
  );
  if (result.changes === 0) throw new Error('Movement activity not found');
}

export async function appendNextMovementEvent(
  db: SQLiteDatabase,
  input: {
    id: string; userId: string; activityId: string; eventType: string;
    occurredAt: string; payload?: unknown;
  },
): Promise<number> {
  let sequence = 0;
  await db.withExclusiveTransactionAsync(async (tx) => {
    const row = await tx.getFirstAsync<{ next_sequence: number }>(
      `SELECT COALESCE(MAX(sequence), -1) + 1 AS next_sequence
       FROM movement_events WHERE activity_id = ?`, input.activityId,
    );
    sequence = row?.next_sequence ?? 0;
    await appendMovementEvent(tx, { ...input, sequence });
  });
  return sequence;
}

export async function listMovementEvents(
  db: SQLiteDatabase,
  activityId: string,
): Promise<MovementEvent[]> {
  const rows = await db.getAllAsync<MovementEventRow>(
    'SELECT * FROM movement_events WHERE activity_id = ? ORDER BY sequence ASC', activityId,
  );
  return rows.map(toMovementEvent);
}
