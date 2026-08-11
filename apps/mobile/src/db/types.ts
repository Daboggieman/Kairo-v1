/**
 * Row types as SQLite actually returns them (snake_case, no booleans, no Date objects),
 * plus the camelCase domain types the UI works with.
 *
 * Keeping these separate means exactly one place — `queries.ts` — knows about the
 * storage representation, so a schema change does not ripple into the screens.
 */

export type WeightUnit = 'kg' | 'lb';

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
