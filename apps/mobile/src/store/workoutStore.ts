/**
 * Active-session state for the workouts module.
 *
 * The split of responsibility: SQLite is the source of truth, this store is the working
 * copy of the *one* session currently open. Every mutation writes through to
 * `src/db/workouts.ts` first and only then updates state, so a crash can never leave the
 * UI showing a set that was never persisted.
 *
 * `hydrate()` reads any unfinished session back on launch — that is what makes a
 * force-kill mid-workout survivable, and it is why the rest-timer start is derived from
 * the last set's stored timestamp rather than kept only in memory.
 *
 * The `SQLiteDatabase` is passed into each action rather than held in the store: it comes
 * from `useSQLiteContext()`, which owns its lifecycle, and stashing a handle here would
 * outlive the provider on a fast refresh.
 */

import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';
import { create } from 'zustand';

import * as db from '@/db/workouts';
import type { Exercise, WeightUnit, WorkoutSetWithExercise } from '@/db/types';
import { nextSetNumber } from '@/domain/workouts';

/**
 * Single-user until Phase 2 adds auth, but `user_id` is on the row from day one
 * (`02-data-model.md`) so multi-user is a data change, not a schema change. This constant
 * is the one place that assumption lives.
 */
export const LOCAL_USER_ID = 'local-user';

/** What a screen hands over to log a set; ids, numbering and timestamps are derived here. */
export type NewSet = {
  exerciseId: string;
  reps: number;
  weight: number;
  weightUnit: WeightUnit;
  rpe?: number | null;
};

type WorkoutState = {
  /** The open session, or null when nothing is in progress. */
  sessionId: string | null;
  startedAt: string | null;
  /** Sets logged in the open session, in the order they were logged. */
  sets: WorkoutSetWithExercise[];
  /**
   * The exercise the active screen is currently logging. Lives here rather than in router
   * params because the picker is a separate route: it sets this and pops, and params only
   * flow forward.
   */
  currentExercise: Exercise | null;
  /**
   * Epoch ms when the rest timer started (the moment the last set was logged), or null
   * when no set has been logged yet. Screens compute the readout with
   * `restElapsed(restStartedAt, Date.now())` — the store holds no ticking interval.
   */
  restStartedAt: number | null;
  /** False until `hydrate()` has run, so screens can hold off rendering "no session". */
  hydrated: boolean;

  hydrate: (database: SQLiteDatabase) => Promise<void>;
  startSession: (database: SQLiteDatabase) => Promise<string>;
  selectExercise: (exercise: Exercise) => void;
  logSet: (database: SQLiteDatabase, set: NewSet) => Promise<void>;
  endSession: (database: SQLiteDatabase, notes?: string | null) => Promise<void>;
  discardRestTimer: () => void;
};

/**
 * The no-session-open state. A factory rather than a shared constant so each reset gets
 * its own `sets` array — a shared one would be aliased across every session and mutations
 * would leak between them.
 */
function emptySession(): Pick<
  WorkoutState,
  'sessionId' | 'startedAt' | 'sets' | 'currentExercise' | 'restStartedAt'
> {
  return {
    sessionId: null,
    startedAt: null,
    sets: [],
    currentExercise: null,
    restStartedAt: null,
  };
}

export const useWorkoutStore = create<WorkoutState>((set, get) => ({
  ...emptySession(),
  hydrated: false,

  async hydrate(database) {
    const open = await db.activeSession(database, LOCAL_USER_ID);
    if (!open) {
      set({ ...emptySession(), hydrated: true });
      return;
    }
    const sets = await db.listSetsWithExercises(database, open.id);
    set({
      sessionId: open.id,
      startedAt: open.startedAt,
      sets,
      // Resuming mid-workout: the rest timer restarts from now rather than pretending to
      // know how long the app was closed. A timer that reads 4 hours is noise.
      restStartedAt: null,
      hydrated: true,
    });
  },

  async startSession(database) {
    const existing = get().sessionId;
    // Two open sessions would make `activeSession()` ambiguous and split a workout's sets
    // across rows. Resuming is always the right answer here.
    if (existing) return existing;

    const id = randomUUID();
    const startedAt = new Date().toISOString();
    await db.createSession(database, { id, userId: LOCAL_USER_ID, startedAt });
    set({ ...emptySession(), sessionId: id, startedAt });
    return id;
  },

  selectExercise(exercise) {
    // Switching exercises ends the rest interval rather than attributing it to the next
    // lift, where it would read as an implausibly long set-to-set gap.
    set({ currentExercise: exercise, restStartedAt: null });
  },

  async logSet(database, newSet) {
    const { sessionId, sets, restStartedAt } = get();
    if (!sessionId) throw new Error('logSet called with no active session');

    const exercise = await db.getExercise(database, newSet.exerciseId);
    if (!exercise) throw new Error(`unknown exercise: ${newSet.exerciseId}`);

    const row = {
      id: randomUUID(),
      session_id: sessionId,
      exercise_id: newSet.exerciseId,
      set_number: nextSetNumber(sets, newSet.exerciseId),
      reps: newSet.reps,
      weight: newSet.weight,
      weight_unit: newSet.weightUnit,
      rpe: newSet.rpe ?? null,
      // Rest attributed to a set is the gap since the *previous* one was logged — what the
      // timer on screen was actually counting. Null when there is no such gap: the first
      // set of a session, or the first after resuming a hydrated one.
      rest_seconds:
        restStartedAt === null ? null : Math.max(0, Math.floor((Date.now() - restStartedAt) / 1000)),
    };

    await db.addSet(database, row);

    set((state) => ({
      sets: [
        ...state.sets,
        {
          id: row.id,
          sessionId,
          exerciseId: row.exercise_id,
          exerciseName: exercise.name,
          setNumber: row.set_number,
          reps: row.reps,
          weight: row.weight,
          weightUnit: newSet.weightUnit,
          rpe: row.rpe,
          restSeconds: row.rest_seconds,
        },
      ],
      restStartedAt: Date.now(),
    }));
  },

  async endSession(database, notes = null) {
    const { sessionId } = get();
    if (!sessionId) return;
    await db.endSession(database, sessionId, new Date().toISOString(), notes);
    set({ ...emptySession() });
  },

  discardRestTimer() {
    set({ restStartedAt: null });
  },
}));
