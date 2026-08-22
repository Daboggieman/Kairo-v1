import type { SQLiteDatabase } from 'expo-sqlite';

import type { AcceptedPoint, AutopauseState, CueSchedule, MovementState } from '@/domain/movement';
import { initialCueSchedule, recomputeEditedRoute } from '@/domain/movement';
import type { UnitSystem } from './preferences';
import { enqueue, type MovementActivityWire } from './outbox';

import {
  type MovementActivity,
  type MovementActivityRow,
  type MovementEvent,
  type MovementEventRow,
  type MovementPoint,
  type MovementPointRow,
  type MovementStatus,
  type MovementType,
  type RouteSample,
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

/** SQLite treats a negative LIMIT as unbounded. Records screens must opt into that visibly. */
export const NO_LIMIT = -1;

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
    await enqueueMovementAggregate(tx, input.id, input.userId, 'upsert');
  });
  const completed = await getMovementActivity(db, input.id, input.userId);
  if (!completed) throw new Error('Completed movement activity not found');
  return completed;
}

function toMovementActivityWire(
  activity: MovementActivityRow,
  points: MovementPointRow[],
  events: MovementEventRow[],
): MovementActivityWire {
  return {
    id: activity.id,
    activity_type: activity.activity_type === 'walk' || activity.activity_type === 'ride'
      ? activity.activity_type : 'run',
    name: activity.name,
    started_at: activity.started_at,
    ended_at: activity.ended_at ?? activity.updated_at,
    elapsed_seconds: activity.elapsed_seconds,
    moving_seconds: activity.moving_seconds,
    paused_seconds: activity.paused_seconds,
    distance_meters: activity.distance_meters,
    elevation_gain_meters: activity.elevation_gain_meters,
    average_speed_mps: activity.average_speed_mps,
    revision: activity.revision,
    created_at: activity.created_at,
    updated_at: activity.updated_at,
    points: points.map((point) => ({
      id: point.id, sequence: point.sequence, recorded_at: point.recorded_at,
      latitude: point.latitude, longitude: point.longitude, altitude_meters: point.altitude_meters,
      horizontal_accuracy_meters: point.horizontal_accuracy_meters,
      provider_speed_mps: point.provider_speed_mps,
      processing_state: point.processing_state === 'accepted' ? 'accepted' : 'rejected',
      rejection_reason: point.rejection_reason, is_paused: point.is_paused === 1,
      excluded_by_edit: point.excluded_by_edit === 1,
    })),
    events: events.map((event) => ({
      id: event.id, sequence: event.sequence, event_type: event.event_type,
      occurred_at: event.occurred_at, payload_json: event.payload_json,
    })),
  };
}

/**
 * Rename or re-type a completed activity, bumping the revision and recording an `edited` event.
 *
 * **`eventId` must be a UUID, and is the caller's to supply** — as `trimMovementActivity` has always
 * required. It used to be minted here as `` `${id}-edit-${Date.parse(updatedAt)}` ``, which is not a
 * UUID, and the server's `MovementEventWrite.id` is one: the whole aggregate came back `422`, the
 * outbox read that as terminal, and the rename never reached the server while SQLite showed it
 * applied. Found on 2026-08-22 by `e2e/movementSync.e2e.ts`, the first thing to drive this path
 * against a real backend.
 */
export async function editMovementActivity(
  db: SQLiteDatabase,
  input: {
    id: string; userId: string; name: string | null; activityType: MovementType;
    eventId: string; updatedAt: string;
  },
): Promise<MovementActivity> {
  await db.withExclusiveTransactionAsync(async (tx) => {
    const result = await tx.runAsync(
      `UPDATE movement_activities SET name = ?, activity_type = ?, revision = revision + 1,
       updated_at = ? WHERE id = ? AND user_id = ? AND status = 'completed'`,
      input.name, input.activityType, input.updatedAt, input.id, input.userId,
    );
    if (result.changes === 0) throw new Error('Completed movement activity not found');
    const sequenceRow = await tx.getFirstAsync<{ next_sequence: number }>(
      `SELECT COALESCE(MAX(sequence), -1) + 1 AS next_sequence
       FROM movement_events WHERE activity_id = ?`, input.id,
    );
    await tx.runAsync(
      `INSERT INTO movement_events
       (id, activity_id, sequence, event_type, occurred_at, payload_json)
       VALUES (?, ?, ?, 'edited', ?, ?)`,
      input.eventId,
      input.id, sequenceRow?.next_sequence ?? 0, input.updatedAt,
      JSON.stringify({ name: input.name, activityType: input.activityType }),
    );
    await enqueueMovementAggregate(tx, input.id, input.userId, 'update');
  });
  const updated = await getMovementActivity(db, input.id, input.userId);
  if (!updated) throw new Error('Updated movement activity not found');
  return updated;
}

export async function trimMovementActivity(
  db: SQLiteDatabase,
  input: {
    id: string; userId: string; firstSequence: number; lastSequence: number;
    eventId: string; updatedAt: string;
  },
): Promise<MovementActivity> {
  if (input.firstSequence > input.lastSequence) throw new Error('Invalid movement trim range');
  await db.withExclusiveTransactionAsync(async (tx) => {
    const owned = await tx.getFirstAsync<{ id: string }>(
      `SELECT id FROM movement_activities
       WHERE id = ? AND user_id = ? AND status = 'completed'`,
      input.id, input.userId,
    );
    if (!owned) throw new Error('Completed movement activity not found');

    await tx.runAsync(
      `UPDATE movement_points SET excluded_by_edit =
       CASE WHEN sequence < ? OR sequence > ? THEN 1 ELSE 0 END
       WHERE activity_id = ?`,
      input.firstSequence, input.lastSequence, input.id,
    );
    const rows = await tx.getAllAsync<MovementPointRow>(
      'SELECT * FROM movement_points WHERE activity_id = ? ORDER BY sequence ASC', input.id,
    );
    const excluded = new Set(rows.filter((row) => row.excluded_by_edit === 1).map((row) => row.sequence));
    const recomputed = recomputeEditedRoute(rows.map((row) => ({
      sequence: row.sequence,
      latitude: row.latitude,
      longitude: row.longitude,
      recordedAtMs: new Date(row.recorded_at).getTime(),
      accepted: row.processing_state === 'accepted',
      isPaused: row.is_paused === 1,
    })), excluded);
    for (const row of rows) {
      const metrics = recomputed.distanceBySequence.get(row.sequence);
      await tx.runAsync(
        `UPDATE movement_points SET distance_from_previous_meters = ?,
         cumulative_distance_meters = ? WHERE id = ?`,
        metrics?.distanceFromPreviousMeters ?? 0,
        metrics?.cumulativeDistanceMeters ?? 0,
        row.id,
      );
    }
    const pausedSeconds = Math.max(0, recomputed.elapsedSeconds - recomputed.movingSeconds);
    await tx.runAsync(
      `UPDATE movement_activities SET distance_meters = ?, elapsed_seconds = ?,
       moving_seconds = ?, paused_seconds = ?, average_speed_mps = ?,
       revision = revision + 1, updated_at = ? WHERE id = ?`,
      recomputed.distanceMeters, Math.round(recomputed.elapsedSeconds),
      Math.round(recomputed.movingSeconds), Math.round(pausedSeconds),
      recomputed.movingSeconds > 0 ? recomputed.distanceMeters / recomputed.movingSeconds : null,
      input.updatedAt, input.id,
    );
    const sequenceRow = await tx.getFirstAsync<{ next_sequence: number }>(
      `SELECT COALESCE(MAX(sequence), -1) + 1 AS next_sequence
       FROM movement_events WHERE activity_id = ?`, input.id,
    );
    await tx.runAsync(
      `INSERT INTO movement_events
       (id, activity_id, sequence, event_type, occurred_at, payload_json)
       VALUES (?, ?, ?, 'edited', ?, ?)`,
      input.eventId, input.id, sequenceRow?.next_sequence ?? 0, input.updatedAt,
      JSON.stringify({ firstSequence: input.firstSequence, lastSequence: input.lastSequence }),
    );
    await enqueueMovementAggregate(tx, input.id, input.userId, 'update');
  });
  const updated = await getMovementActivity(db, input.id, input.userId);
  if (!updated) throw new Error('Trimmed movement activity not found');
  return updated;
}

async function enqueueMovementAggregate(
  db: SQLiteDatabase,
  activityId: string,
  userId: string,
  operation: 'upsert' | 'update',
): Promise<void> {
  const activity = await db.getFirstAsync<MovementActivityRow>(
    'SELECT * FROM movement_activities WHERE id = ? AND user_id = ?', activityId, userId,
  );
  const points = await db.getAllAsync<MovementPointRow>(
    'SELECT * FROM movement_points WHERE activity_id = ? ORDER BY sequence ASC', activityId,
  );
  const events = await db.getAllAsync<MovementEventRow>(
    'SELECT * FROM movement_events WHERE activity_id = ? ORDER BY sequence ASC', activityId,
  );
  if (!activity) throw new Error('Completed movement activity not found');
  await enqueue(db, {
    userId,
    entityType: 'movement_activity',
    entityId: activityId,
    operation,
    payload: toMovementActivityWire(activity, points, events),
  });
}

export async function deleteMovementActivity(
  db: SQLiteDatabase,
  id: string,
  userId: string,
): Promise<boolean> {
  let deleted = false;
  await db.withExclusiveTransactionAsync(async (tx) => {
    const activity = await tx.getFirstAsync<MovementActivityRow>(
      'SELECT * FROM movement_activities WHERE id = ? AND user_id = ?', id, userId,
    );
    if (!activity) return;
    const result = await tx.runAsync(
      'DELETE FROM movement_activities WHERE id = ? AND user_id = ?', id, userId,
    );
    deleted = result.changes > 0;
    if (deleted && activity.status === 'completed') {
      await enqueue(tx, {
        userId, entityType: 'movement_activity', entityId: id,
        operation: 'delete', payload: null,
      });
    }
  });
  return deleted;
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

/**
 * Every accepted, unexcluded sample of every completed activity, reduced to four columns.
 *
 * The Pantheon's one expensive read: "greatest climb" and "fastest 5 km" are both properties of a
 * route's *interior*, not of the activity row — `elevation_gain_meters` exists on the row but nothing
 * writes it, and no column holds a best segment. So the samples themselves are the only source, and
 * there is no smaller read that answers the question.
 *
 * Kept as cheap as an unbounded read can be: four columns rather than `SELECT *`, filtered in SQL
 * rather than in JS, and grouped by activity by the caller off a single ordered pass.
 *
 * The filter is the house convention from the replay screen — `accepted` only, `excluded_by_edit`
 * dropped, **paused samples kept**. A pause is where the ground still rises and the walk still
 * happened; excluding it would understate a climb, and `recomputeEditedRoute` already treats an edit
 * as the only reason to drop a sample from a route's geometry.
 */
export async function listRouteSamples(
  db: SQLiteDatabase,
  userId: string,
): Promise<RouteSample[]> {
  const rows = await db.getAllAsync<{
    activity_id: string;
    recorded_at: string;
    altitude_meters: number | null;
    cumulative_distance_meters: number;
  }>(
    `SELECT p.activity_id                 AS activity_id,
            p.recorded_at                 AS recorded_at,
            p.altitude_meters             AS altitude_meters,
            p.cumulative_distance_meters  AS cumulative_distance_meters
     FROM movement_points p
     JOIN movement_activities a ON a.id = p.activity_id
     WHERE a.user_id = ?
       AND a.status = 'completed'
       AND p.processing_state = 'accepted'
       AND p.excluded_by_edit = 0
     ORDER BY p.activity_id ASC, p.sequence ASC`,
    userId,
  );
  return rows.map((row) => ({
    activityId: row.activity_id,
    recordedAtMs: Date.parse(row.recorded_at),
    altitudeMeters: row.altitude_meters,
    cumulativeDistanceMeters: row.cumulative_distance_meters,
  }));
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
