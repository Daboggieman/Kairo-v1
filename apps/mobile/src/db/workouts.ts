/**
 * Typed queries for the workouts module. The only place that knows the storage
 * representation — screens call these, never SQL directly.
 *
 * Everything takes the `SQLiteDatabase` from `useSQLiteContext()` as its first
 * argument, which keeps the functions testable and the data flow explicit.
 */

import type { SQLiteDatabase } from 'expo-sqlite';

import { LB_PER_KG } from '@/domain/workouts';
import {
  enqueue,
  type WorkoutSessionWire,
  type WorkoutSetDeleteWire,
  type WorkoutSetUpdateWire,
  type WorkoutSetWire,
} from './outbox';

import {
  Exercise,
  ExerciseRow,
  type RecordSet,
  toExercise,
  toWorkoutSession,
  toWorkoutSet,
  WorkoutSession,
  WorkoutSessionRow,
  WorkoutSessionSummary,
  WorkoutSet,
  WorkoutSetRow,
  WorkoutSetWithExercise,
} from './types';

type WorkoutSessionSummaryRow = WorkoutSessionRow & {
  set_count: number;
  total_volume: number;
  exercise_names: string;
};

export function toWorkoutSessionSummary(row: WorkoutSessionSummaryRow): WorkoutSessionSummary {
  const session = toWorkoutSession(row);
  return {
    ...session,
    setCount: row.set_count,
    totalVolume: row.total_volume,
    exerciseNames: row.exercise_names ? row.exercise_names.split('|') : [],
  };
}

export async function createSession(
  db: SQLiteDatabase,
  session: { id: string; userId: string; startedAt: string },
): Promise<void> {
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync(`INSERT INTO workout_sessions (id, user_id, started_at) VALUES (?, ?, ?)`, session.id, session.userId, session.startedAt);
    const payload: WorkoutSessionWire = { id: session.id, started_at: session.startedAt };
    await enqueue(tx, { userId: session.userId, entityType: 'workout_session', entityId: session.id, operation: 'upsert', payload });
  });
}

export async function endSession(
  db: SQLiteDatabase,
  sessionId: string,
  endedAt: string,
  notes: string | null,
): Promise<void> {
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync(`UPDATE workout_sessions SET ended_at = ?, notes = ? WHERE id = ?`, endedAt, notes, sessionId);
    const row = await tx.getFirstAsync<{ user_id: string }>('SELECT user_id FROM workout_sessions WHERE id = ?', sessionId);
    if (row) {
      const payload: WorkoutSessionWire = { id: sessionId, ended_at: endedAt, notes };
      await enqueue(tx, { userId: row.user_id, entityType: 'workout_session', entityId: sessionId, operation: 'update', payload });
    }
  });
}

export async function addSet(db: SQLiteDatabase, set: WorkoutSetRow): Promise<void> {
  await db.withExclusiveTransactionAsync(async (tx) => {
  await tx.runAsync(
    `INSERT INTO workout_sets
       (id, session_id, exercise_id, set_number, reps, weight, weight_unit, rpe, rest_seconds)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    set.id,
    set.session_id,
    set.exercise_id,
    set.set_number,
    set.reps,
    set.weight,
    set.weight_unit,
    set.rpe,
    set.rest_seconds,
  );
  const session = await tx.getFirstAsync<{ user_id: string }>('SELECT user_id FROM workout_sessions WHERE id = ?', set.session_id);
  if (session) {
    const payload: WorkoutSetWire = {
      id: set.id,
      session_id: set.session_id,
      exercise_id: set.exercise_id,
      set_number: set.set_number,
      reps: set.reps,
      weight: set.weight,
      weight_unit: set.weight_unit === 'lb' ? 'lb' : 'kg',
      rpe: set.rpe,
      rest_seconds: set.rest_seconds,
    };
    await enqueue(tx, { userId: session.user_id, entityType: 'workout_set', entityId: set.id, operation: 'upsert', payload });
  }
  });
}

export async function updateSet(
  db: SQLiteDatabase,
  set: Pick<WorkoutSetRow, 'id' | 'reps' | 'weight' | 'weight_unit' | 'rpe' | 'rest_seconds'>,
): Promise<void> {
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync(
      `UPDATE workout_sets SET reps = ?, weight = ?, weight_unit = ?, rpe = ?, rest_seconds = ? WHERE id = ?`,
      set.reps, set.weight, set.weight_unit, set.rpe, set.rest_seconds, set.id,
    );
    const row = await tx.getFirstAsync<{ session_id: string; user_id: string }>(
      `SELECT st.session_id, s.user_id FROM workout_sets st JOIN workout_sessions s ON s.id = st.session_id WHERE st.id = ?`,
      set.id,
    );
    if (row) {
      const payload: WorkoutSetUpdateWire = {
        session_id: row.session_id,
        reps: set.reps,
        weight: set.weight,
        weight_unit: set.weight_unit === 'lb' ? 'lb' : 'kg',
        rpe: set.rpe,
        rest_seconds: set.rest_seconds,
      };
      await enqueue(tx, { userId: row.user_id, entityType: 'workout_set', entityId: set.id, operation: 'update', payload });
    }
  });
}

export async function deleteSet(db: SQLiteDatabase, setId: string): Promise<void> {
  await db.withExclusiveTransactionAsync(async (tx) => {
    const row = await tx.getFirstAsync<{ session_id: string; user_id: string }>(
      `SELECT st.session_id, s.user_id FROM workout_sets st JOIN workout_sessions s ON s.id = st.session_id WHERE st.id = ?`,
      setId,
    );
    await tx.runAsync('DELETE FROM workout_sets WHERE id = ?', setId);
    if (row) {
      const payload: WorkoutSetDeleteWire = { session_id: row.session_id };
      await enqueue(tx, { userId: row.user_id, entityType: 'workout_set', entityId: setId, operation: 'delete', payload });
    }
  });
}

export async function listSessions(
  db: SQLiteDatabase,
  limit = 50,
): Promise<WorkoutSessionSummary[]> {
  const rows = await db.getAllAsync<WorkoutSessionSummaryRow>(
    `SELECT s.*,
            COUNT(st.id)                                        AS set_count,
            -- Volume is normalised to kg here for the same reason setVolume() does it in
            -- the domain layer: a session logged in lb would otherwise report ~2.2x the
            -- volume the detail screen shows for the same sets. LB_PER_KG is interpolated
            -- from the domain module so the factor has one definition; it is a numeric
            -- constant, never user input.
            COALESCE(SUM(
              st.reps * (CASE WHEN st.weight_unit = 'lb'
                              THEN st.weight / ${LB_PER_KG}
                              ELSE st.weight END)
            ), 0)                                               AS total_volume,
            -- SQLite rejects a separator argument alongside DISTINCT ("DISTINCT
            -- aggregates must have exactly one argument"), so the dedupe happens in an
            -- inner subquery and the two-argument GROUP_CONCAT runs outside it. The '|'
            -- separator is what toWorkoutSessionSummary splits on; a comma would be
            -- ambiguous because commas occur inside real exercise names.
            COALESCE((
              SELECT GROUP_CONCAT(name, '|')
              FROM (SELECT DISTINCT e2.name
                      FROM exercises e2
                      JOIN workout_sets st2 ON st2.exercise_id = e2.id
                     WHERE st2.session_id = s.id)
            ), '')                                              AS exercise_names
     FROM workout_sessions s
     LEFT JOIN workout_sets st ON st.session_id = s.id
     GROUP BY s.id
     ORDER BY s.started_at DESC
     LIMIT ?`,
    limit,
  );
  return rows.map(toWorkoutSessionSummary);
}

/**
 * The session still in progress, if any (at most one — `startSession` refuses to open a
 * second). This is what lets the app survive a force-kill mid-workout: the store rehydrates
 * from here on launch instead of losing the session with the React tree.
 */
export async function activeSession(
  db: SQLiteDatabase,
  userId: string,
): Promise<WorkoutSession | null> {
  const row = await db.getFirstAsync<WorkoutSessionRow>(
    `SELECT * FROM workout_sessions
     WHERE user_id = ? AND ended_at IS NULL
     ORDER BY started_at DESC
     LIMIT 1`,
    userId,
  );
  return row ? toWorkoutSession(row) : null;
}

export async function getSession(
  db: SQLiteDatabase,
  sessionId: string,
): Promise<WorkoutSession | null> {
  const row = await db.getFirstAsync<WorkoutSessionRow>(
    'SELECT * FROM workout_sessions WHERE id = ?',
    sessionId,
  );
  return row ? toWorkoutSession(row) : null;
}

export async function listSetsWithExercises(
  db: SQLiteDatabase,
  sessionId: string,
): Promise<WorkoutSetWithExercise[]> {
  const rows = await db.getAllAsync<WorkoutSetRow & { exercise_name: string }>(
    `SELECT st.*, e.name AS exercise_name
     FROM workout_sets st
     JOIN exercises e ON e.id = st.exercise_id
     WHERE st.session_id = ?
     ORDER BY st.set_number`,
    sessionId,
  );
  return rows.map((row) => ({ ...toWorkoutSet(row), exerciseName: row.exercise_name }));
}

/**
 * Every set this user has ever logged, with its lift's name and its session's date.
 *
 * The Pantheon's read. It is unbounded on purpose — a record is by definition the best of *all* time,
 * so a `LIMIT` here would silently turn "your heaviest ever" into "your heaviest recently", which is
 * the kind of quiet wrong answer a records screen must not give. Six columns rather than `st.*` keeps
 * the cost proportional to the answer; see `RecordSet`.
 *
 * Unlike `listSessions` above this filters by `user_id`. That reader predates the constraint and
 * there is only ever one local user, so both return the same rows today — but a query that reads
 * every row in the table is the wrong place to inherit that assumption.
 *
 * Ordered oldest-first so the *first* set to reach a given figure is the one that dates the record:
 * matching an existing best later does not move its date.
 */
export async function listSetsForRecords(
  db: SQLiteDatabase,
  userId: string,
): Promise<RecordSet[]> {
  const rows = await db.getAllAsync<{
    exercise_id: string;
    exercise_name: string;
    reps: number;
    weight: number;
    weight_unit: string;
    session_id: string;
    session_started_at: string;
  }>(
    `SELECT st.exercise_id     AS exercise_id,
            e.name             AS exercise_name,
            st.reps            AS reps,
            st.weight          AS weight,
            st.weight_unit     AS weight_unit,
            s.id               AS session_id,
            s.started_at       AS session_started_at
     FROM workout_sets st
     JOIN workout_sessions s ON s.id = st.session_id
     JOIN exercises e        ON e.id = st.exercise_id
     WHERE s.user_id = ?
     ORDER BY s.started_at ASC, st.set_number ASC`,
    userId,
  );
  return rows.map((row) => ({
    exerciseId: row.exercise_id,
    exerciseName: row.exercise_name,
    reps: row.reps,
    weight: row.weight,
    weightUnit: row.weight_unit === 'lb' ? 'lb' : 'kg',
    sessionId: row.session_id,
    sessionStartedAt: row.session_started_at,
  }));
}

export async function listExercises(db: SQLiteDatabase): Promise<Exercise[]> {
  const rows = await db.getAllAsync<ExerciseRow>(
    'SELECT * FROM exercises ORDER BY is_custom ASC, name ASC',
  );
  return rows.map(toExercise);
}

export async function searchExercises(db: SQLiteDatabase, query: string): Promise<Exercise[]> {
  const rows = await db.getAllAsync<ExerciseRow>(
    `SELECT * FROM exercises
     WHERE name LIKE ? OR muscle_group LIKE ?
     ORDER BY is_custom ASC, name ASC`,
    `%${query}%`,
    `%${query}%`,
  );
  return rows.map(toExercise);
}

export async function createCustomExercise(
  db: SQLiteDatabase,
  exercise: { id: string; name: string; muscleGroup: string | null; equipment: string | null },
): Promise<Exercise> {
  await db.runAsync(
    `INSERT INTO exercises (id, name, muscle_group, equipment, is_custom)
     VALUES (?, ?, ?, ?, 1)`,
    exercise.id,
    exercise.name,
    exercise.muscleGroup,
    exercise.equipment,
  );
  return {
    id: exercise.id,
    name: exercise.name,
    muscleGroup: exercise.muscleGroup,
    equipment: exercise.equipment,
    isCustom: true,
  };
}

export async function getExercise(db: SQLiteDatabase, id: string): Promise<Exercise | null> {
  const row = await db.getFirstAsync<ExerciseRow>('SELECT * FROM exercises WHERE id = ?', id);
  return row ? toExercise(row) : null;
}

/**
 * The most recent set logged for an exercise — the auto-suggest source for the next
 * session's starting weight/reps (`04-feature-specs.md`).
 */
export async function lastSetForExercise(
  db: SQLiteDatabase,
  exerciseId: string,
): Promise<WorkoutSet | null> {
  const row = await db.getFirstAsync<WorkoutSetRow>(
    `SELECT st.*
     FROM workout_sets st
     JOIN workout_sessions s ON s.id = st.session_id
     WHERE st.exercise_id = ?
     ORDER BY s.started_at DESC, st.set_number DESC
     LIMIT 1`,
    exerciseId,
  );
  return row ? toWorkoutSet(row) : null;
}
