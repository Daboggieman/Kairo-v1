import { LOCAL_USER_ID } from '@/constants';
import { createMovementState, processSample, transition } from '@/domain/movement';

import { createTestDb, type TestDatabase } from './testDb';
import {
  appendMovementPoint,
  appendMovementEvent,
  createMovementActivity,
  getMovementEngineState,
  completeMovementActivity,
  deleteMovementActivity,
  editMovementActivity,
  getActiveMovementActivity,
  getMovementActivity,
  listMovementActivities,
  listMovementEvents,
  listMovementPoints,
  setMovementStatus,
  updateMovementEngineState,
} from '../movement';
import { SCHEMA_VERSION } from '../schema';
import {
  getMovementPreferences,
  getUnitSystem,
  MOVEMENT_AUTOPAUSE,
  MOVEMENT_DISTANCE_CUES,
  MOVEMENT_TIME_CUES,
  MOVEMENT_VOICE_CUES,
  setMovementPreference,
  setUnitSystem,
} from '../preferences';

describe('movement query layer', () => {
  let db: TestDatabase;

  beforeEach(async () => { db = await createTestDb(); });
  afterEach(() => db.close());

  it('migrates to the current schema with empty movement history', async () => {
    expect((await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))?.user_version)
      .toBe(SCHEMA_VERSION);
    expect(await listMovementActivities(db, LOCAL_USER_ID)).toEqual([]);
  });

  it('creates and recovers an active activity', async () => {
    await createMovementActivity(db, { id: 'm1', userId: LOCAL_USER_ID, activityType: 'run', startedAt: '2026-08-16T10:00:00.000Z' });
    expect((await getActiveMovementActivity(db, LOCAL_USER_ID))?.id).toBe('m1');
    expect(await getMovementActivity(db, 'm1', 'other-user')).toBeNull();
  });

  it('atomically stores ordered points and updates the summary', async () => {
    await createMovementActivity(db, { id: 'm1', userId: LOCAL_USER_ID, activityType: 'walk', startedAt: '2026-08-16T10:00:00.000Z' });
    await setMovementStatus(db, 'm1', LOCAL_USER_ID, 'recording', '2026-08-16T10:00:00.000Z');
    let state = transition(transition(createMovementState('walk'), 'prepare'), 'started');
    for (const [index, sample] of [
      { latitude: 0, longitude: 0, recordedAtMs: 1_000 },
      { latitude: 0, longitude: 0.001, recordedAtMs: 6_000 },
    ].entries()) {
      const result = processSample(state, sample);
      state = result.state;
      await appendMovementPoint(db, { id: `p${index}`, userId: LOCAL_USER_ID, activityId: 'm1', point: result.point, state });
    }
    expect((await listMovementPoints(db, 'm1')).map((point) => point.sequence)).toEqual([0, 1]);
    expect((await getMovementActivity(db, 'm1', LOCAL_USER_ID))?.distanceMeters).toBeGreaterThan(100);
  });

  it('shows only completed activities in history', async () => {
    await createMovementActivity(db, { id: 'm1', userId: LOCAL_USER_ID, activityType: 'ride', startedAt: '2026-08-16T10:00:00.000Z' });
    expect(await listMovementActivities(db, LOCAL_USER_ID)).toEqual([]);
    await setMovementStatus(db, 'm1', LOCAL_USER_ID, 'completed', '2026-08-16T11:00:00.000Z');
    expect((await listMovementActivities(db, LOCAL_USER_ID)).map((activity) => activity.id)).toEqual(['m1']);
  });

  it('uses one explicit shared unit preference', async () => {
    expect(await getUnitSystem(db, LOCAL_USER_ID)).toBe('metric');
    await setUnitSystem(db, LOCAL_USER_ID, 'imperial');
    expect(await getUnitSystem(db, LOCAL_USER_ID)).toBe('imperial');
  });

  it('defaults movement cues and autopause on, while preserving explicit opt-outs', async () => {
    expect(await getMovementPreferences(db, LOCAL_USER_ID)).toEqual({
      voiceCues: true,
      distanceCues: true,
      timeCues: true,
      autopause: true,
    });

    await Promise.all([
      setMovementPreference(db, LOCAL_USER_ID, MOVEMENT_VOICE_CUES, false),
      setMovementPreference(db, LOCAL_USER_ID, MOVEMENT_DISTANCE_CUES, false),
      setMovementPreference(db, LOCAL_USER_ID, MOVEMENT_TIME_CUES, false),
      setMovementPreference(db, LOCAL_USER_ID, MOVEMENT_AUTOPAUSE, false),
    ]);

    expect(await getMovementPreferences(db, LOCAL_USER_ID)).toEqual({
      voiceCues: false,
      distanceCues: false,
      timeCues: false,
      autopause: false,
    });
  });

  it('persists autopause candidates and cue thresholds for callback recovery', async () => {
    await createMovementActivity(db, {
      id: 'm1', userId: LOCAL_USER_ID, activityType: 'run',
      startedAt: '2026-08-16T10:00:00.000Z', unitSystem: 'imperial',
    });

    expect(await getMovementEngineState(db, 'm1')).toEqual({
      autopause: { belowThresholdSinceMs: null, aboveThresholdSinceMs: null },
      cues: { nextDistanceMeters: 1609.344, nextTimeSeconds: 600 },
    });

    await updateMovementEngineState(
      db,
      'm1',
      { belowThresholdSinceMs: 12_000, aboveThresholdSinceMs: 18_000 },
      { nextDistanceMeters: 3218.688, nextTimeSeconds: 1200 },
    );

    expect(await getMovementEngineState(db, 'm1')).toEqual({
      autopause: { belowThresholdSinceMs: 12_000, aboveThresholdSinceMs: 18_000 },
      cues: { nextDistanceMeters: 3218.688, nextTimeSeconds: 1200 },
    });
  });

  it('stores replay events in deterministic order and enforces ownership', async () => {
    await createMovementActivity(db, { id: 'm1', userId: LOCAL_USER_ID, activityType: 'run', startedAt: '2026-08-16T10:00:00.000Z' });
    await appendMovementEvent(db, { id: 'e2', userId: LOCAL_USER_ID, activityId: 'm1', sequence: 2, eventType: 'manual_resumed', occurredAt: '2026-08-16T10:02:00.000Z' });
    await appendMovementEvent(db, { id: 'e1', userId: LOCAL_USER_ID, activityId: 'm1', sequence: 1, eventType: 'manual_paused', occurredAt: '2026-08-16T10:01:00.000Z', payload: { source: 'button' } });
    expect((await listMovementEvents(db, 'm1')).map((event) => event.id)).toEqual(['e1', 'e2']);
    await expect(appendMovementEvent(db, { id: 'bad', userId: 'other-user', activityId: 'm1', sequence: 3, eventType: 'finished', occurredAt: '2026-08-16T11:00:00.000Z' })).rejects.toThrow('not found');
  });

  it('completes, edits, and lists an activity revision', async () => {
    await createMovementActivity(db, { id: 'm1', userId: LOCAL_USER_ID, activityType: 'run', startedAt: '2026-08-16T10:00:00.000Z' });
    await setMovementStatus(db, 'm1', LOCAL_USER_ID, 'recording', '2026-08-16T10:00:01.000Z');
    const completed = await completeMovementActivity(db, { id: 'm1', userId: LOCAL_USER_ID, endedAt: '2026-08-16T11:00:00.000Z' });
    expect(completed.status).toBe('completed');
    const edited = await editMovementActivity(db, { id: 'm1', userId: LOCAL_USER_ID, name: 'Sunday ride', activityType: 'ride', updatedAt: '2026-08-16T11:01:00.000Z' });
    expect(edited).toMatchObject({ name: 'Sunday ride', activityType: 'ride', revision: 2 });
    expect((await listMovementActivities(db, LOCAL_USER_ID))[0].revision).toBe(2);
  });

  it('deletes owned activities and cascades their replay facts', async () => {
    await createMovementActivity(db, { id: 'm1', userId: LOCAL_USER_ID, activityType: 'walk', startedAt: '2026-08-16T10:00:00.000Z' });
    await appendMovementEvent(db, { id: 'e1', userId: LOCAL_USER_ID, activityId: 'm1', sequence: 1, eventType: 'started', occurredAt: '2026-08-16T10:00:00.000Z' });
    expect(await deleteMovementActivity(db, 'm1', 'other-user')).toBe(false);
    expect(await deleteMovementActivity(db, 'm1', LOCAL_USER_ID)).toBe(true);
    expect(await listMovementEvents(db, 'm1')).toEqual([]);
  });
});
