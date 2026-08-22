/**
 * Store tests against a real in-memory SQLite database, via the same adapter the
 * query-layer tests use. The store is the write-through path every screen uses, so this
 * exercises the whole chain: state mutation -> SQL write -> later read-back.
 *
 * `expo-crypto`'s randomUUID has no implementation under jest (probed before writing
 * this), so ids come from a counter here. The store only uses the ids as opaque keys, so
 * a deterministic stand-in is fine.
 */

import { createTestDb, type TestDatabase } from '@/db/__tests__/testDb';
import { activeSession, getSession, listSessions } from '@/db/workouts';
import { useWorkoutStore } from '../workoutStore';

// Babel hoists jest.mock above the imports regardless of where it sits, so keeping it
// below them satisfies import/first without changing when the mock is registered.
jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => `uuid-${(idCounter += 1)}`),
}));

let idCounter = 0;

/**
 * The zustand store is a module-level singleton, so state survives between tests unless
 * it is explicitly put back. Each test gets a fresh database, and a `sessionId` left over
 * from the previous one would point at a session that no longer exists — which surfaces
 * as a foreign-key failure on the next `logSet`, not as an obvious state leak.
 */
function resetStore() {
  useWorkoutStore.setState({
    sessionId: null,
    startedAt: null,
    sets: [],
    currentExercise: null,
    restStartedAt: null,
    hydrated: false,
  });
  return useWorkoutStore.getState();
}

/** The store's actions, which read current state through `get()` rather than closing over it. */
function actions() {
  return useWorkoutStore.getState();
}

describe('useWorkoutStore', () => {
  let db: TestDatabase;

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-11T09:00:00.000Z'));
    resetStore();
    db = await createTestDb();
  });

  afterEach(() => {
    db.close();
    jest.useRealTimers();
  });

  describe('hydrate', () => {
    it('marks the store hydrated even with no open session', async () => {
      const store = actions();
      await store.hydrate(db);

      expect(useWorkoutStore.getState().hydrated).toBe(true);
      expect(useWorkoutStore.getState().sessionId).toBeNull();
    });

    it('restores a session left open by a force-kill, with its sets and no rest timer', async () => {
      const store = actions();
      const sessionId = await store.startSession(db);
      await store.logSet(db, { exerciseId: 'seed-back-squat', reps: 5, weight: 100, weightUnit: 'kg' });

      // Simulate the app dying and the History screen re-mounting from scratch.
      const reloaded = resetStore();
      await reloaded.hydrate(db);

      const state = useWorkoutStore.getState();
      expect(state.sessionId).toBe(sessionId);
      expect(state.hydrated).toBe(true);
      // The app was closed; inventing a 4-hour rest gap would be noise, so the timer
      // restarts from now when the user picks the session back up.
      expect(state.restStartedAt).toBeNull();
      expect(state.sets).toHaveLength(1);
      expect(state.sets[0].exerciseName).toBe('Back Squat');
    });

    it('does not resurrect a finished session', async () => {
      const store = actions();
      const sessionId = await store.startSession(db);
      await store.endSession(db);

      const reloaded = resetStore();
      await reloaded.hydrate(db);

      expect(useWorkoutStore.getState().sessionId).toBeNull();
      // And the row is genuinely closed, not just hidden from the store.
      expect((await getSession(db, sessionId))?.endedAt).not.toBeNull();
    });
  });

  describe('startSession', () => {
    it('opens a session and persists it', async () => {
      const id = await actions().startSession(db);

      expect(await getSession(db, id)).toEqual({
        id,
        userId: 'local-user',
        startedAt: '2026-08-11T09:00:00.000Z',
        endedAt: null,
        notes: null,
      });
    });

    it('refuses to open a second session — resume is the only path', async () => {
      const store = actions();
      const first = await store.startSession(db);
      const second = await store.startSession(db);

      expect(second).toBe(first);
    });

    it('opens a genuinely new session after the previous one was ended', async () => {
      // The guard is against a *second concurrent* session, not against ever starting
      // another one — endSession() clears the id, so the next start is a fresh workout.
      const store = actions();
      const first = await store.startSession(db);
      await store.endSession(db);
      const second = await store.startSession(db);

      expect(second).not.toBe(first);
      expect(await listSessions(db)).toHaveLength(2);
      expect((await activeSession(db, 'local-user'))?.id).toBe(second);
    });
  });

  describe('selectExercise', () => {
    it('sets the current exercise and clears the rest timer', async () => {
      const store = actions();
      const sessionId = await store.startSession(db);
      await store.logSet(db, { exerciseId: 'seed-back-squat', reps: 5, weight: 100, weightUnit: 'kg' });
      expect(useWorkoutStore.getState().restStartedAt).not.toBeNull();

      store.selectExercise({ id: 'seed-bench-press', name: 'Bench Press', muscleGroup: 'chest', equipment: 'barbell', isCustom: false });

      const state = useWorkoutStore.getState();
      expect(state.currentExercise?.id).toBe('seed-bench-press');
      expect(state.restStartedAt).toBeNull();
      expect(state.sessionId).toBe(sessionId);
    });
  });

  describe('logSet', () => {
    it('throws when no session is open', async () => {
      await expect(
        actions().logSet(db, { exerciseId: 'seed-back-squat', reps: 5, weight: 100, weightUnit: 'kg' }),
      ).rejects.toThrow('no active session');
    });

    it('throws for an exercise that does not exist', async () => {
      const store = actions();
      await store.startSession(db);

      await expect(
        store.logSet(db, { exerciseId: 'not-an-exercise', reps: 5, weight: 100, weightUnit: 'kg' }),
      ).rejects.toThrow('unknown exercise');
    });

    it('persists the set and mirrors it into state', async () => {
      const store = actions();
      const sessionId = await store.startSession(db);
      await store.logSet(db, { exerciseId: 'seed-back-squat', reps: 5, weight: 100, weightUnit: 'kg' });

      const { sets } = useWorkoutStore.getState();
      expect(sets).toHaveLength(1);
      expect(sets[0]).toMatchObject({
        sessionId,
        exerciseId: 'seed-back-squat',
        exerciseName: 'Back Squat',
        setNumber: 1,
        reps: 5,
        weight: 100,
        weightUnit: 'kg',
        rpe: null,
      });
      // The write-through really persisted: the detail screen reads from SQL, not the store.
      expect(await activeSession(db, 'local-user')).not.toBeNull();
    });

    it('numbers sets per exercise', async () => {
      const store = actions();
      await store.startSession(db);
      await store.logSet(db, { exerciseId: 'seed-back-squat', reps: 5, weight: 100, weightUnit: 'kg' });
      await store.logSet(db, { exerciseId: 'seed-bench-press', reps: 5, weight: 80, weightUnit: 'kg' });
      await store.logSet(db, { exerciseId: 'seed-back-squat', reps: 5, weight: 102.5, weightUnit: 'kg' });

      const { sets } = useWorkoutStore.getState();
      expect(sets.map((s) => [s.exerciseId, s.setNumber])).toEqual([
        ['seed-back-squat', 1],
        ['seed-bench-press', 1],
        ['seed-back-squat', 2],
      ]);
    });

    it('records the rest gap in seconds between sets', async () => {
      const store = actions();
      await store.startSession(db);
      await store.logSet(db, { exerciseId: 'seed-back-squat', reps: 5, weight: 100, weightUnit: 'kg' });

      jest.setSystemTime(new Date('2026-08-11T09:02:00.000Z'));
      await store.logSet(db, { exerciseId: 'seed-back-squat', reps: 5, weight: 100, weightUnit: 'kg' });

      const { sets } = useWorkoutStore.getState();
      // First set of the session had nothing before it to rest from; the second rests the
      // 120s the fake clock advanced.
      expect(sets[0].restSeconds).toBeNull();
      expect(sets[1].restSeconds).toBe(120);
    });

    it('does not attribute a rest gap across an exercise switch', async () => {
      // selectExercise() clears restStartedAt: the gap while picking the next lift is not
      // rest between sets of the same exercise, so the first set of the new exercise has
      // no rest_seconds.
      const store = actions();
      await store.startSession(db);
      await store.logSet(db, { exerciseId: 'seed-back-squat', reps: 5, weight: 100, weightUnit: 'kg' });

      jest.setSystemTime(new Date('2026-08-11T09:02:00.000Z'));
      store.selectExercise({ id: 'seed-bench-press', name: 'Bench Press', muscleGroup: 'chest', equipment: 'barbell', isCustom: false });
      await store.logSet(db, { exerciseId: 'seed-bench-press', reps: 5, weight: 80, weightUnit: 'kg' });

      const { sets } = useWorkoutStore.getState();
      expect(sets[0].restSeconds).toBeNull();
      expect(sets[1].restSeconds).toBeNull();
    });
  });

  describe('set corrections', () => {
    it('updates a persisted set and mirrors the correction into state', async () => {
      const store = actions();
      await store.startSession(db);
      await store.logSet(db, { exerciseId: 'seed-back-squat', reps: 5, weight: 100, weightUnit: 'kg' });
      const setId = useWorkoutStore.getState().sets[0].id;

      await store.updateSet(db, setId, { reps: 6, weight: 102.5, weightUnit: 'kg', rpe: 8.5 });

      expect(useWorkoutStore.getState().sets[0]).toMatchObject({ reps: 6, weight: 102.5, rpe: 8.5 });
      await store.hydrate(db);
      expect(useWorkoutStore.getState().sets[0]).toMatchObject({ reps: 6, weight: 102.5, rpe: 8.5 });
    });

    it('deletes a persisted set and removes it from state', async () => {
      const store = actions();
      await store.startSession(db);
      await store.logSet(db, { exerciseId: 'seed-back-squat', reps: 5, weight: 100, weightUnit: 'kg' });
      const setId = useWorkoutStore.getState().sets[0].id;

      await store.deleteSet(db, setId);

      expect(useWorkoutStore.getState().sets).toEqual([]);
      await store.hydrate(db);
      expect(useWorkoutStore.getState().sets).toEqual([]);
    });
  });

  describe('endSession', () => {
    it('closes the session and clears the store', async () => {
      const store = actions();
      const sessionId = await store.startSession(db);
      await store.logSet(db, { exerciseId: 'seed-back-squat', reps: 5, weight: 100, weightUnit: 'kg' });
      await store.endSession(db, 'felt strong');

      const state = useWorkoutStore.getState();
      expect(state.sessionId).toBeNull();
      expect(state.sets).toEqual([]);
      expect(state.restStartedAt).toBeNull();
      expect(state.currentExercise).toBeNull();
      expect(await getSession(db, sessionId)).toMatchObject({
        endedAt: '2026-08-11T09:00:00.000Z',
        notes: 'felt strong',
      });
      // A finished session is a history row the moment it is ended.
      expect(await listSessions(db)).toHaveLength(1);
    });

    it('is a no-op when nothing is open', async () => {
      await expect(actions().endSession(db)).resolves.toBeUndefined();
    });
  });

  describe('discardRestTimer', () => {
    it('clears the timer without touching the session', async () => {
      const store = actions();
      const sessionId = await store.startSession(db);
      await store.logSet(db, { exerciseId: 'seed-back-squat', reps: 5, weight: 100, weightUnit: 'kg' });
      store.discardRestTimer();

      const state = useWorkoutStore.getState();
      expect(state.restStartedAt).toBeNull();
      expect(state.sessionId).toBe(sessionId);
    });
  });
});
