/**
 * Query-layer tests against a real in-memory SQLite database (`testDb.ts`).
 *
 * These cover what the pure-domain tests structurally cannot: that the SQL is valid, that
 * the joins and aggregates return what the screens expect, and that the row -> domain
 * mapping survives a round trip through actual storage. `src/domain/__tests__/workouts.test.ts`
 * covers the calculations; this file covers persistence.
 */

import { sessionVolume, suggestNextSet } from '@/domain/workouts';

import { createTestDb, type TestDatabase } from './testDb';
import { migrate } from '../migrations';
import { SCHEMA_VERSION } from '../schema';
import { SEED_EXERCISES } from '../seed';
import {
  activeSession,
  addSet,
  createCustomExercise,
  createSession,
  deleteSet,
  endSession,
  getExercise,
  getSession,
  lastSetForExercise,
  listExercises,
  listSessions,
  listSetsWithExercises,
  searchExercises,
  updateSet,
} from '../workouts';
import type { WorkoutSetRow } from '../types';

const USER = 'local-user';

/** Fills in the parts of a set row a given test doesn't care about. */
function setRow(overrides: Partial<WorkoutSetRow> & Pick<WorkoutSetRow, 'id' | 'session_id' | 'exercise_id'>): WorkoutSetRow {
  return {
    set_number: 1,
    reps: 5,
    weight: 100,
    weight_unit: 'kg',
    rpe: null,
    rest_seconds: null,
    ...overrides,
  };
}

describe('workouts query layer', () => {
  let db: TestDatabase;

  beforeEach(async () => {
    db = await createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  describe('migrate', () => {
    it('seeds the exercise library on a fresh database', async () => {
      const exercises = await listExercises(db);
      expect(exercises).toHaveLength(SEED_EXERCISES.length);
    });

    it('is idempotent — a second run neither duplicates seeds nor throws', async () => {
      // Every launch calls migrate() via SQLiteProvider's onInit, so this runs constantly
      // in production. `PRAGMA user_version` is what makes the second call a no-op.
      await migrate(db);
      await migrate(db);
      expect(await listExercises(db)).toHaveLength(SEED_EXERCISES.length);
    });

    it('records the schema version so the next migration knows where to start', async () => {
      const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
      expect(row?.user_version).toBe(SCHEMA_VERSION);
    });
  });

  describe('sessions', () => {
    it('round-trips a session through storage', async () => {
      await createSession(db, { id: 's1', userId: USER, startedAt: '2026-08-10T10:00:00.000Z' });

      const found = await getSession(db, 's1');
      expect(found).toEqual({
        id: 's1',
        userId: USER,
        startedAt: '2026-08-10T10:00:00.000Z',
        endedAt: null,
        notes: null,
      });
    });

    it('returns null for an id that does not exist', async () => {
      // The detail screen renders "could not be found" on this rather than throwing.
      expect(await getSession(db, 'nope')).toBeNull();
    });

    it('stamps the end time and notes when a session finishes', async () => {
      await createSession(db, { id: 's1', userId: USER, startedAt: '2026-08-10T10:00:00.000Z' });
      await endSession(db, 's1', '2026-08-10T11:00:00.000Z', 'felt strong');

      const found = await getSession(db, 's1');
      expect(found?.endedAt).toBe('2026-08-10T11:00:00.000Z');
      expect(found?.notes).toBe('felt strong');
    });
  });

  describe('activeSession', () => {
    it('finds a session left open by a force-kill', async () => {
      await createSession(db, { id: 's1', userId: USER, startedAt: '2026-08-10T10:00:00.000Z' });

      const open = await activeSession(db, USER);
      expect(open?.id).toBe('s1');
    });

    it('ignores finished sessions', async () => {
      await createSession(db, { id: 's1', userId: USER, startedAt: '2026-08-10T10:00:00.000Z' });
      await endSession(db, 's1', '2026-08-10T11:00:00.000Z', null);

      expect(await activeSession(db, USER)).toBeNull();
    });

    it('is scoped to the user, so another user\'s open session is not resumed', async () => {
      // Single-user until Phase 2, but user_id is on the row from day one — this asserts
      // the filter is actually applied rather than incidentally correct with one user.
      await createSession(db, { id: 's1', userId: 'someone-else', startedAt: '2026-08-10T10:00:00.000Z' });

      expect(await activeSession(db, USER)).toBeNull();
    });

    it('returns the most recent when more than one is somehow open', async () => {
      // startSession() refuses to open a second, but a partially-applied write or a
      // future sync merge could still produce two. Newest wins; it never returns two.
      await createSession(db, { id: 'older', userId: USER, startedAt: '2026-08-10T10:00:00.000Z' });
      await createSession(db, { id: 'newer', userId: USER, startedAt: '2026-08-11T10:00:00.000Z' });

      expect((await activeSession(db, USER))?.id).toBe('newer');
    });
  });

  describe('sets', () => {
    beforeEach(async () => {
      await createSession(db, { id: 's1', userId: USER, startedAt: '2026-08-10T10:00:00.000Z' });
    });

    it('joins each set to its exercise name and orders by set number', async () => {
      await addSet(db, setRow({ id: 'set-2', session_id: 's1', exercise_id: 'seed-back-squat', set_number: 2 }));
      await addSet(db, setRow({ id: 'set-1', session_id: 's1', exercise_id: 'seed-back-squat', set_number: 1 }));

      const sets = await listSetsWithExercises(db, 's1');
      expect(sets.map((s) => s.setNumber)).toEqual([1, 2]);
      expect(sets[0].exerciseName).toBe('Back Squat');
    });

    it('maps a stored row back to its domain shape', async () => {
      await addSet(db, setRow({
        id: 'set-1',
        session_id: 's1',
        exercise_id: 'seed-bench-press',
        reps: 8,
        weight: 62.5,
        weight_unit: 'lb',
        rpe: 8.5,
        rest_seconds: 90,
      }));

      const [set] = await listSetsWithExercises(db, 's1');
      expect(set).toEqual({
        id: 'set-1',
        sessionId: 's1',
        exerciseId: 'seed-bench-press',
        exerciseName: 'Bench Press',
        setNumber: 1,
        reps: 8,
        weight: 62.5,
        weightUnit: 'lb',
        rpe: 8.5,
        restSeconds: 90,
      });
    });

    it('does not leak sets from another session', async () => {
      await createSession(db, { id: 's2', userId: USER, startedAt: '2026-08-11T10:00:00.000Z' });
      await addSet(db, setRow({ id: 'a', session_id: 's1', exercise_id: 'seed-deadlift' }));
      await addSet(db, setRow({ id: 'b', session_id: 's2', exercise_id: 'seed-deadlift' }));

      expect(await listSetsWithExercises(db, 's1')).toHaveLength(1);
    });

    it('returns nothing for a session with no sets logged', async () => {
      expect(await listSetsWithExercises(db, 's1')).toEqual([]);
    });

    it('rejects a set referencing an exercise that does not exist', async () => {
      // migrate() turns foreign_keys ON; without it this would insert an orphan row that
      // the exercise join then silently drops from the detail screen.
      await expect(
        addSet(db, setRow({ id: 'set-1', session_id: 's1', exercise_id: 'not-an-exercise' })),
      ).rejects.toThrow();
    });

    it('deletes a session\'s sets along with the session (ON DELETE CASCADE)', async () => {
      await addSet(db, setRow({ id: 'set-1', session_id: 's1', exercise_id: 'seed-deadlift' }));
      await db.runAsync('DELETE FROM workout_sessions WHERE id = ?', 's1');

      expect(await listSetsWithExercises(db, 's1')).toEqual([]);
    });
  });

  describe('set corrections', () => {
    beforeEach(async () => {
      await createSession(db, { id: 's1', userId: USER, startedAt: '2026-08-10T10:00:00.000Z' });
    });

    /** The enqueued intent, minus the create row `addSet` leaves ahead of it. */
    async function corrections() {
      return db.getAllAsync<{ operation: string; entity_id: string; payload: string | null }>(
        `SELECT operation, entity_id, payload FROM sync_outbox
         WHERE entity_type = 'workout_set' AND operation <> 'upsert' ORDER BY id`,
      );
    }

    it('writes the correction and enqueues an update, not an upsert', async () => {
      /**
       * The operation is the whole point of the assertion. An `upsert` replays through the
       * bulk create route, which answers 409 for a known id whose fields differ — terminal
       * in the outbox, so the edit was dropped and the server kept the pre-edit values.
       */
      await addSet(db, setRow({
        id: 'set-1', session_id: 's1', exercise_id: 'seed-back-squat',
        reps: 5, weight: 100, weight_unit: 'kg', rpe: null, rest_seconds: 90,
      }));

      await updateSet(db, {
        id: 'set-1', reps: 6, weight: 102.5, weight_unit: 'kg', rpe: 8.5, rest_seconds: 90,
      });

      const [set] = await listSetsWithExercises(db, 's1');
      expect(set).toMatchObject({ reps: 6, weight: 102.5, rpe: 8.5, restSeconds: 90 });
      const rows = await corrections();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ operation: 'update', entity_id: 'set-1' });
      expect(JSON.parse(rows[0].payload as string)).toEqual({
        session_id: 's1', reps: 6, weight: 102.5, weight_unit: 'kg', rpe: 8.5, rest_seconds: 90,
      });
    });

    it('enqueues a delete carrying its session id rather than a null payload', async () => {
      /**
       * `parsePayload` rejects a missing payload with a terminal 422, so a null-payload
       * delete stranded its row where `listDue` could never see it again. The session id
       * is what the nested DELETE route needs, and the row is gone by the time replay runs.
       */
      await addSet(db, setRow({ id: 'set-1', session_id: 's1', exercise_id: 'seed-deadlift' }));

      await deleteSet(db, 'set-1');

      expect(await listSetsWithExercises(db, 's1')).toEqual([]);
      const rows = await corrections();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ operation: 'delete', entity_id: 'set-1' });
      expect(JSON.parse(rows[0].payload as string)).toEqual({ session_id: 's1' });
    });

    it('enqueues nothing for a set id that does not exist', async () => {
      await deleteSet(db, 'no-such-set');
      await updateSet(db, {
        id: 'no-such-set', reps: 1, weight: 1, weight_unit: 'kg', rpe: null, rest_seconds: null,
      });

      expect(await corrections()).toEqual([]);
    });
  });

  describe('listSessions', () => {
    it('returns sessions newest first', async () => {
      await createSession(db, { id: 'old', userId: USER, startedAt: '2026-08-01T10:00:00.000Z' });
      await createSession(db, { id: 'new', userId: USER, startedAt: '2026-08-10T10:00:00.000Z' });

      expect((await listSessions(db)).map((s) => s.id)).toEqual(['new', 'old']);
    });

    it('honours the limit', async () => {
      await createSession(db, { id: 'a', userId: USER, startedAt: '2026-08-01T10:00:00.000Z' });
      await createSession(db, { id: 'b', userId: USER, startedAt: '2026-08-02T10:00:00.000Z' });
      await createSession(db, { id: 'c', userId: USER, startedAt: '2026-08-03T10:00:00.000Z' });

      expect(await listSessions(db, 2)).toHaveLength(2);
    });

    it('includes a session with no sets, with zeroed aggregates', async () => {
      // A LEFT JOIN is what keeps an in-progress session visible in history. An inner
      // join would make the session the user just started disappear from the list.
      await createSession(db, { id: 's1', userId: USER, startedAt: '2026-08-10T10:00:00.000Z' });

      const [summary] = await listSessions(db);
      expect(summary.setCount).toBe(0);
      expect(summary.totalVolume).toBe(0);
      expect(summary.exerciseNames).toEqual([]);
    });

    it('counts sets and lists each distinct exercise once', async () => {
      await createSession(db, { id: 's1', userId: USER, startedAt: '2026-08-10T10:00:00.000Z' });
      await addSet(db, setRow({ id: 'a', session_id: 's1', exercise_id: 'seed-back-squat', set_number: 1 }));
      await addSet(db, setRow({ id: 'b', session_id: 's1', exercise_id: 'seed-back-squat', set_number: 2 }));
      await addSet(db, setRow({ id: 'c', session_id: 's1', exercise_id: 'seed-bench-press', set_number: 1 }));

      const [summary] = await listSessions(db);
      expect(summary.setCount).toBe(3);
      expect(summary.exerciseNames).toHaveLength(2);
      expect(summary.exerciseNames.sort()).toEqual(['Back Squat', 'Bench Press']);
    });

    it('splits exercise names into separate entries rather than one joined string', async () => {
      // Regression: GROUP_CONCAT(DISTINCT x) cannot take a separator, so it defaulted to
      // a comma while the parser split on '|' — the history row rendered every exercise
      // as a single run-on name.
      await createSession(db, { id: 's1', userId: USER, startedAt: '2026-08-10T10:00:00.000Z' });
      await addSet(db, setRow({ id: 'a', session_id: 's1', exercise_id: 'seed-back-squat' }));
      await addSet(db, setRow({ id: 'b', session_id: 's1', exercise_id: 'seed-bench-press' }));

      const [summary] = await listSessions(db);
      expect(summary.exerciseNames.every((name) => !name.includes(','))).toBe(true);
    });

    it('does not attribute one session\'s exercises to another', async () => {
      await createSession(db, { id: 's1', userId: USER, startedAt: '2026-08-10T10:00:00.000Z' });
      await createSession(db, { id: 's2', userId: USER, startedAt: '2026-08-11T10:00:00.000Z' });
      await addSet(db, setRow({ id: 'a', session_id: 's1', exercise_id: 'seed-back-squat' }));
      await addSet(db, setRow({ id: 'b', session_id: 's2', exercise_id: 'seed-bench-press' }));

      const byId = Object.fromEntries((await listSessions(db)).map((s) => [s.id, s]));
      expect(byId.s1.exerciseNames).toEqual(['Back Squat']);
      expect(byId.s2.exerciseNames).toEqual(['Bench Press']);
    });

    it('totals volume as reps x weight', async () => {
      await createSession(db, { id: 's1', userId: USER, startedAt: '2026-08-10T10:00:00.000Z' });
      await addSet(db, setRow({ id: 'a', session_id: 's1', exercise_id: 'seed-back-squat', reps: 5, weight: 100 }));
      await addSet(db, setRow({ id: 'b', session_id: 's1', exercise_id: 'seed-back-squat', set_number: 2, reps: 3, weight: 110 }));

      expect((await listSessions(db))[0].totalVolume).toBe(500 + 330);
    });

    it('normalises pounds to kg so the history total matches the detail screen', async () => {
      // Regression: SUM(reps * weight) ignored weight_unit, so a lb-logged session read
      // ~2.2x higher in history than the same sets do on the detail screen, which uses
      // sessionVolume(). Both must agree.
      await createSession(db, { id: 's1', userId: USER, startedAt: '2026-08-10T10:00:00.000Z' });
      await addSet(db, setRow({
        id: 'a', session_id: 's1', exercise_id: 'seed-bench-press',
        reps: 5, weight: 220.462262, weight_unit: 'lb',
      }));

      const [summary] = await listSessions(db);
      const fromDetailScreen = sessionVolume(await listSetsWithExercises(db, 's1'));
      expect(summary.totalVolume).toBeCloseTo(fromDetailScreen, 5);
      expect(summary.totalVolume).toBeCloseTo(500, 3);
    });
  });

  describe('exercises', () => {
    it('sorts the library with seeded lifts before custom ones, each alphabetical', async () => {
      await createCustomExercise(db, { id: 'c1', name: 'AAA Custom', muscleGroup: null, equipment: null });

      const exercises = await listExercises(db);
      expect(exercises[0].isCustom).toBe(false);
      expect(exercises[exercises.length - 1].name).toBe('AAA Custom');
    });

    it('maps is_custom from an integer column to a boolean', async () => {
      expect((await getExercise(db, 'seed-back-squat'))?.isCustom).toBe(false);
      await createCustomExercise(db, { id: 'c1', name: 'Sled Push', muscleGroup: 'legs', equipment: null });
      expect((await getExercise(db, 'c1'))?.isCustom).toBe(true);
    });

    it('returns null for an unknown exercise', async () => {
      expect(await getExercise(db, 'nope')).toBeNull();
    });

    it('persists a custom exercise and returns it without a re-read', async () => {
      const created = await createCustomExercise(db, {
        id: 'c1', name: 'Sled Push', muscleGroup: 'legs', equipment: 'sled',
      });

      expect(created).toEqual({
        id: 'c1', name: 'Sled Push', muscleGroup: 'legs', equipment: 'sled', isCustom: true,
      });
      expect(await getExercise(db, 'c1')).toEqual(created);
    });

    it('searches by name, case-insensitively', async () => {
      const results = await searchExercises(db, 'squat');
      expect(results.map((e) => e.name)).toEqual(
        expect.arrayContaining(['Back Squat', 'Front Squat']),
      );
    });

    it('searches by muscle group too', async () => {
      const results = await searchExercises(db, 'biceps');
      expect(results.map((e) => e.name).sort()).toEqual(['Dumbbell Curl', 'Hammer Curl']);
    });

    it('returns nothing when nothing matches', async () => {
      expect(await searchExercises(db, 'zzzznope')).toEqual([]);
    });

    it('returns the whole library for an empty query', async () => {
      // The picker calls this on every keystroke including the backspace to empty.
      expect(await searchExercises(db, '')).toHaveLength(SEED_EXERCISES.length);
    });
  });

  describe('lastSetForExercise', () => {
    it('returns null for an exercise never performed', async () => {
      // suggestNextSet() turns this into the 8-reps-at-0kg fallback.
      expect(await lastSetForExercise(db, 'seed-back-squat')).toBeNull();
    });

    it('reaches back into an earlier session, not just the current one', async () => {
      await createSession(db, { id: 'old', userId: USER, startedAt: '2026-08-01T10:00:00.000Z' });
      await addSet(db, setRow({ id: 'a', session_id: 'old', exercise_id: 'seed-back-squat', reps: 5, weight: 100 }));

      const last = await lastSetForExercise(db, 'seed-back-squat');
      expect(last?.weight).toBe(100);
    });

    it('prefers the most recent session over an older heavier one', async () => {
      await createSession(db, { id: 'old', userId: USER, startedAt: '2026-08-01T10:00:00.000Z' });
      await createSession(db, { id: 'new', userId: USER, startedAt: '2026-08-10T10:00:00.000Z' });
      await addSet(db, setRow({ id: 'a', session_id: 'old', exercise_id: 'seed-back-squat', weight: 140 }));
      await addSet(db, setRow({ id: 'b', session_id: 'new', exercise_id: 'seed-back-squat', weight: 100 }));

      expect((await lastSetForExercise(db, 'seed-back-squat'))?.weight).toBe(100);
    });

    it('takes the highest set number within that session', async () => {
      await createSession(db, { id: 's1', userId: USER, startedAt: '2026-08-10T10:00:00.000Z' });
      await addSet(db, setRow({ id: 'a', session_id: 's1', exercise_id: 'seed-back-squat', set_number: 1, weight: 100 }));
      await addSet(db, setRow({ id: 'b', session_id: 's1', exercise_id: 'seed-back-squat', set_number: 2, weight: 105 }));

      expect((await lastSetForExercise(db, 'seed-back-squat'))?.weight).toBe(105);
    });

    it('is scoped to the exercise asked for', async () => {
      await createSession(db, { id: 's1', userId: USER, startedAt: '2026-08-10T10:00:00.000Z' });
      await addSet(db, setRow({ id: 'a', session_id: 's1', exercise_id: 'seed-bench-press', weight: 80 }));

      expect(await lastSetForExercise(db, 'seed-back-squat')).toBeNull();
    });

    it('carries the unit forward so the suggestion is not silently converted', async () => {
      await createSession(db, { id: 's1', userId: USER, startedAt: '2026-08-10T10:00:00.000Z' });
      await addSet(db, setRow({
        id: 'a', session_id: 's1', exercise_id: 'seed-bench-press', reps: 8, weight: 135, weight_unit: 'lb',
      }));

      expect(suggestNextSet(await lastSetForExercise(db, 'seed-bench-press'))).toEqual({
        reps: 8, weight: 135, weightUnit: 'lb',
      });
    });
  });
});
