/**
 * End-to-end proof of the movement aggregate upload path, against a **real running backend**.
 *
 * The companion to `workoutSetSync.e2e.ts`, and written for the same reason: the movement path had
 * a client side tested with an injected `fetch` and a server side tested with hand-built payloads,
 * and **nothing had ever driven one against the other**. That gap is where the workout-set `409`
 * lived for as long as it did. Movement is the largest wire payload in the app — an activity, every
 * raw point, and every lifecycle event in one body — so it has the most surface for the two sides to
 * disagree on.
 *
 * It found one on the first run. See the rename case below.
 *
 * **Opt-in, and deliberately not a `.test.ts` file.** `package.json`'s `testMatch` covers only
 * `.test.ts` and `.test.tsx`, so `npm test` never sees this and never depends on a server being up.
 * Run it with `npm run test:e2e`, with the backend up.
 *
 * **What this cannot cover: cross-user isolation.** `POST /auth/token` compares the submitted key
 * against the single `settings.device_key` and returns `get_or_create_device_user(session)` — one
 * credential, one user. There is no second identity to authenticate as, so ownership isolation is
 * not reachable from the client at all and stays where it can be tested: `test_movement.py`'s
 * `test_movement_conflict_and_ownership_isolation`, which constructs two users directly. Proving it
 * here would mean adding a second device key to the server for a test's benefit.
 *
 * **It writes to whichever backend it is pointed at.** The activity id is a fresh UUID per run, and
 * the case that proves deletion removes it, so a completed run leaves nothing behind. Point this at
 * a development backend.
 */

import { randomUUID } from 'node:crypto';

import { LOCAL_USER_ID } from '@/constants';
import { enqueue } from '@/db/outbox';
import {
  appendMovementEvent,
  completeMovementActivity,
  createMovementActivity,
  deleteMovementActivity,
  editMovementActivity,
  appendMovementPoint,
  setMovementStatus,
} from '@/db/movement';
import type { MovementActivityWire } from '@/db/outbox';
import type { AcceptedPoint, MovementState } from '@/domain/movement';
import { SyncClient } from '@/sync/client';

import { apiUrl, authorizedGet, deviceKey, drain, nodeFetch, requireBackend } from './harness';
import { createTestDb, type TestDatabase } from '../src/db/__tests__/testDb';

type ServerPoint = {
  id: string;
  sequence: number;
  altitude_meters: number | null;
  processing_state: string;
  is_paused: boolean;
  excluded_by_edit: boolean;
};

type ServerActivity = {
  id: string;
  activity_type: string;
  name: string | null;
  elapsed_seconds: number;
  moving_seconds: number;
  distance_meters: number;
  average_speed_mps: number | null;
  revision: number;
  points: ServerPoint[];
  events: { id: string; sequence: number; event_type: string }[];
};

/** A UUID per run, because the server's route parameters are `uuid.UUID` and ids must not collide. */
const activityId = randomUUID();
const startedAt = '2026-08-22T09:00:00.000Z';
const endedAt = '2026-08-22T09:05:30.000Z';

let db: TestDatabase;
let client: SyncClient;

/** The activity as the server holds it, or `null` when it holds none by that id. */
async function readServerActivity(): Promise<ServerActivity | null> {
  const response = await authorizedGet(`/api/v1/movements/${activityId}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GET movement failed: ${response.status} ${await response.text()}`);
  return (await response.json()) as ServerActivity;
}

/**
 * The state the tracker would hold at this sample. Built by hand rather than run through
 * `processLocationSample`, for the same reason the workout-set proof builds a set by hand: what is
 * under test is the wire contract between the aggregate SQLite holds and the route that accepts it,
 * not the GPS filter that decided the numbers. The filter has its own suite.
 */
function state(status: MovementState['status'], overrides: Partial<MovementState> = {}): MovementState {
  return {
    status,
    activityType: 'run',
    elapsedSeconds: 330,
    movingSeconds: 300,
    distanceMeters: 1200,
    lastSampleAtMs: Date.parse(endedAt),
    lastAcceptedPoint: null,
    nextSequence: 3,
    ...overrides,
  };
}

function point(sequence: number, overrides: Partial<AcceptedPoint> = {}): AcceptedPoint {
  return {
    sequence,
    latitude: 51.5 + sequence * 0.001,
    longitude: -0.12 + sequence * 0.001,
    recordedAtMs: Date.parse(startedAt) + sequence * 60_000,
    accuracyMeters: 5,
    altitudeMeters: 20 + sequence * 4,
    speedMps: 4,
    distanceFromPreviousMeters: sequence === 0 ? 0 : 400,
    cumulativeDistanceMeters: sequence * 400,
    accepted: true,
    rejectionReason: null,
    ...overrides,
  };
}

/**
 * The same intent queued a second time — how a re-delivery is reproduced here.
 *
 * Not `requeue`: `markSucceeded` **deletes** the row, so after a successful drain there is nothing
 * left to put back. Re-enqueuing the identical payload puts the identical bytes on the wire, which
 * is what the server sees when a response is lost and the delivery is repeated.
 */
async function reEnqueue(operation: 'upsert' | 'update' | 'delete', payload: unknown): Promise<void> {
  await enqueue(db, {
    userId: LOCAL_USER_ID,
    entityType: 'movement_activity',
    entityId: activityId,
    operation,
    payload,
  });
}

/** The aggregate exactly as the outbox would carry it, for the re-delivery cases. */
async function serverAggregateAsWire(): Promise<MovementActivityWire> {
  const activity = await readServerActivity();
  if (!activity) throw new Error('Cannot re-enqueue: the server holds no activity by that id');
  return activity as unknown as MovementActivityWire;
}

beforeAll(async () => {
  await requireBackend();
  db = await createTestDb();
  client = new SyncClient({ apiUrl, deviceKey }, nodeFetch);
});

afterAll(() => {
  db?.close();
});

describe(`movement sync against ${apiUrl}`, () => {
  it('delivers a completed activity with its route and events, and the server holds all of it', async () => {
    await createMovementActivity(db, {
      id: activityId, userId: LOCAL_USER_ID, activityType: 'run', startedAt,
    });
    await setMovementStatus(db, activityId, LOCAL_USER_ID, 'recording', startedAt);

    // A rejected point and a paused point on purpose: both are enum values the server constrains,
    // and `is_paused` is derived from the *state's* status rather than from the point.
    await appendMovementPoint(db, {
      id: randomUUID(), userId: LOCAL_USER_ID, activityId, point: point(0), state: state('recording'),
    });
    await appendMovementPoint(db, {
      id: randomUUID(), userId: LOCAL_USER_ID, activityId,
      point: point(1, { accepted: false, rejectionReason: 'accuracy_or_jump' }),
      state: state('recording'),
    });
    await appendMovementPoint(db, {
      id: randomUUID(), userId: LOCAL_USER_ID, activityId, point: point(2), state: state('manually_paused'),
    });
    await appendMovementEvent(db, {
      id: randomUUID(), userId: LOCAL_USER_ID, activityId, sequence: 0,
      eventType: 'started', occurredAt: startedAt,
    });
    await appendMovementEvent(db, {
      id: randomUUID(), userId: LOCAL_USER_ID, activityId, sequence: 1,
      eventType: 'manual_paused', occurredAt: '2026-08-22T09:02:00.000Z',
    });

    // Nothing is enqueued until completion — an active recording is never streamed to the server.
    await expect(readServerActivity()).resolves.toBeNull();

    await completeMovementActivity(db, { id: activityId, userId: LOCAL_USER_ID, endedAt });
    expect((await drain(db, client)).succeeded).toBe(1);

    const held = await readServerActivity();
    expect(held).toMatchObject({
      activity_type: 'run',
      elapsed_seconds: 330,
      moving_seconds: 300,
      distance_meters: 1200,
      average_speed_mps: 4,
      revision: 1,
    });
    expect(held?.points).toHaveLength(3);
    expect(held?.events).toHaveLength(2);
    // The facts the aggregate exists to preserve, not just the count of rows.
    expect(held?.points.map((item) => item.processing_state)).toEqual(['accepted', 'rejected', 'accepted']);
    expect(held?.points.map((item) => item.is_paused)).toEqual([false, false, true]);
    expect(held?.points.map((item) => item.altitude_meters)).toEqual([20, 24, 28]);
    expect(held?.points.every((item) => item.excluded_by_edit === false)).toBe(true);
  });

  /**
   * `POST /movements` answers `409` for a known id whose aggregate differs, and returns the existing
   * one when it matches. A queue that retries after a lost response depends on the second half of
   * that: it puts the identical bytes back on the wire, and a 409 there would be terminal.
   */
  it('accepts an exact replay of the same aggregate rather than answering 409', async () => {
    await reEnqueue('upsert', await serverAggregateAsWire());

    expect((await drain(db, client)).succeeded).toBe(1);
    expect(await readServerActivity()).toMatchObject({ revision: 1, activity_type: 'run' });
  });

  /**
   * **The case that found a live bug.** Renaming a completed activity replays as
   * `PUT /movements/{id}` at a higher revision — and before 2026-08-22 it could not succeed at all.
   *
   * `editMovementActivity` appended its `edited` event under a **synthetic id**,
   * `` `${id}-edit-${Date.parse(updatedAt)}` ``, while the server's `MovementEventWrite.id` is a
   * `uuid.UUID`. Pydantic rejected it — *"invalid character: found `i` at 40"* — so the whole
   * aggregate came back `422`, which `isTerminal` reads as permanent: `markFailed` set
   * `next_attempt_at = NULL`, the row became invisible to `listDue` forever, and the rename never
   * reached the server. Identical in shape to the workout-set `409`, and invisible for the same
   * reason — nothing had ever driven the real client against the real route.
   *
   * The fix made the event id a caller-supplied UUID, which is what `trimMovementActivity` already
   * required. This case is the regression guard: it asserts the server took the new name, and
   * `drain` asserts `failedCount` is still zero.
   */
  it('replays a rename as a higher-revision PUT, and the server takes it', async () => {
    await editMovementActivity(db, {
      id: activityId,
      userId: LOCAL_USER_ID,
      name: 'Thames towpath',
      activityType: 'walk',
      eventId: randomUUID(),
      updatedAt: '2026-08-22T10:00:00.000Z',
    });

    expect((await drain(db, client)).succeeded).toBe(1);

    const held = await readServerActivity();
    expect(held).toMatchObject({ name: 'Thames towpath', activity_type: 'walk', revision: 2 });
    // A replacement, not a truncation: PUT deletes and reinserts the facts, so losing them here
    // would look like a successful edit.
    expect(held?.points).toHaveLength(3);
    expect(held?.events.map((item) => item.event_type)).toEqual(['started', 'manual_paused', 'edited']);
  });

  /**
   * The revision guard and the identity check are both in `replace_movement`, and their **order** is
   * what makes a retry survivable: `_same` returns the existing aggregate before
   * `revision <= activity.revision` can answer `409`. Reversed, every re-delivered edit would strand
   * its row permanently. Cheap to assert, and it pins the reason the order is that way.
   */
  it('is unchanged by the same edit arriving twice', async () => {
    await reEnqueue('update', await serverAggregateAsWire());

    expect((await drain(db, client)).succeeded).toBe(1);
    expect(await readServerActivity()).toMatchObject({ name: 'Thames towpath', revision: 2 });
  });

  it('replays a removal as DELETE, and the activity is gone from the server', async () => {
    await expect(deleteMovementActivity(db, activityId, LOCAL_USER_ID)).resolves.toBe(true);

    expect((await drain(db, client)).succeeded).toBe(1);
    expect(await readServerActivity()).toBeNull();
  });

  /**
   * A re-delivered delete must not fail, for the same reason as the workout-set one: a 404 on the
   * second attempt would strand a delete that had already succeeded.
   *
   * Worth pinning separately here because the payload differs. `deleteMovementActivity` enqueues
   * `payload: null`, which is safe **only** because the movement delete branch builds its URL from
   * `row.entity_id` and never calls `parsePayload`. The workout-set delete needs a payload precisely
   * because its route is nested under a workout and `parsePayload` rejects a missing one with a
   * terminal 422. Two routes, two shapes, one asymmetry that reads like an oversight until it is
   * tested.
   */
  it('treats a re-delivered delete as done, not as a terminal failure', async () => {
    await reEnqueue('delete', null);

    expect((await drain(db, client)).succeeded).toBe(1);
    expect(await readServerActivity()).toBeNull();
  });
});
