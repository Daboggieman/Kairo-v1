/**
 * End-to-end proof of the workout-set correction path, against a **real running backend**.
 *
 * Everything else in this repo's mobile suite runs offline: `src/sync/__tests__/sync.test.ts` proves
 * the outbox replays a correction as `PATCH` by injecting a fake `fetch` and asserting the calls it
 * received. That is the right unit test, and it cannot catch a disagreement between the two sides —
 * a path the client builds correctly and the server routes to nothing, a field name that differs by
 * an underscore, a status code the outbox reads as terminal. This file closes that gap by driving
 * the same production functions over the network and then **reading the server back**.
 *
 * **Opt-in, and deliberately not a `.test.ts` file.** `package.json`'s `testMatch` covers only
 * `.test.ts` and `.test.tsx`, so `npm test` never sees this and never depends on a server being up.
 * Run it with:
 *
 * ```
 * npm run test:e2e
 * ```
 *
 * Credentials come from `apps/mobile/.env` — the same values the app itself uses — unless
 * `KAIRO_E2E_API_URL` / `KAIRO_E2E_DEVICE_KEY` are set in the environment, which win. Nothing is
 * hardcoded here, so no key enters git through this file. That, the `node:http` transport and the
 * `drain` helper all live in `./harness`, shared with `movementSync.e2e.ts`.
 *
 * **It writes to whichever backend it is pointed at.** Ids are fresh UUIDs per run, so runs cannot
 * collide, and the set it creates is deleted by the test that proves deletion works. The *session*
 * row is left behind: there is no `DELETE /api/v1/workouts/{id}`, and inventing one to tidy up after
 * a test would be the test dictating the API. Point this at a development backend.
 */

import { randomUUID } from 'node:crypto';

import { LOCAL_USER_ID } from '@/constants';
import { enqueue, pendingCount } from '@/db/outbox';
import { addSet, createSession, deleteSet, updateSet } from '@/db/workouts';
import { SyncClient } from '@/sync/client';

import { apiUrl, authorizedGet, deviceKey, drain, nodeFetch, requireBackend } from './harness';
import { createTestDb, type TestDatabase } from '../src/db/__tests__/testDb';

type ServerSet = {
  id: string;
  session_id: string;
  set_number: number;
  reps: number;
  weight: number;
  weight_unit: string;
  rpe: number | null;
  rest_seconds: number | null;
};

/** A UUID per run, because the server's route parameters are `uuid.UUID` and ids must not collide. */
const sessionId = randomUUID();
const setId = randomUUID();
const startedAt = new Date().toISOString();

let db: TestDatabase;
let client: SyncClient;

/** The set as the server holds it, or `null` when the session has none by that id. */
async function readServerSet(): Promise<ServerSet | null> {
  const response = await authorizedGet(`/api/v1/workouts/${sessionId}`);
  if (!response.ok) throw new Error(`GET workout failed: ${response.status} ${await response.text()}`);
  const detail = (await response.json()) as { sets: ServerSet[] };
  return detail.sets.find((item) => item.id === setId) ?? null;
}

/**
 * The same intent queued a second time — how a re-delivery is reproduced here.
 *
 * Not `requeue`: `markSucceeded` **deletes** the row, so after a successful drain there is nothing
 * left to put back, and `requeue` exists for the other path — a row `markFailed` set
 * `next_attempt_at = NULL` on. Re-enqueuing the identical payload puts the identical bytes on the
 * wire, which is what the server sees when a response is lost and the delivery is repeated.
 */
async function reEnqueue(operation: 'update' | 'delete', payload: unknown): Promise<void> {
  await enqueue(db, {
    userId: LOCAL_USER_ID,
    entityType: 'workout_set',
    entityId: setId,
    operation,
    payload,
  });
}

beforeAll(async () => {
  await requireBackend();
  db = await createTestDb();
  client = new SyncClient({ apiUrl, deviceKey }, nodeFetch);
});

afterAll(() => {
  db?.close();
});

describe(`workout-set sync against ${apiUrl}`, () => {
  it('delivers a new session and set, and the server holds what was logged', async () => {
    await createSession(db, { id: sessionId, userId: LOCAL_USER_ID, startedAt });
    await addSet(db, {
      id: setId,
      session_id: sessionId,
      exercise_id: 'seed-bench-press',
      set_number: 1,
      reps: 8,
      weight: 100,
      weight_unit: 'kg',
      rpe: 8,
      rest_seconds: 120,
    });
    await expect(pendingCount(db)).resolves.toBe(2);

    const result = await drain(db, client);
    expect(result.succeeded).toBe(2);

    expect(await readServerSet()).toMatchObject({ set_number: 1, reps: 8, weight: 100, weight_unit: 'kg' });
  });

  /**
   * The regression this whole path exists for. Before `PATCH .../sets/{set_id}` existed, an edit
   * replayed through the create route: the id was already there with different values, the server
   * answered `409`, and the outbox reads 4xx as terminal — so the row was marked failed, never
   * retried, and the server kept the pre-edit numbers with nothing on screen saying so. The
   * assertion that matters is not that `syncOutbox` reported success; it is that the server's reps
   * and weight changed, and that `failedCount` is still zero.
   */
  it('replays a correction as PATCH, and the server takes the new values', async () => {
    await updateSet(db, { id: setId, reps: 10, weight: 105, weight_unit: 'kg', rpe: 9, rest_seconds: 90 });
    await expect(pendingCount(db)).resolves.toBe(1);

    const result = await drain(db, client);
    expect(result.succeeded).toBe(1);

    expect(await readServerSet()).toMatchObject({ reps: 10, weight: 105, rpe: 9, rest_seconds: 90 });
  });

  /** The route's docstring claims a repeated PATCH is safe. A queue that retries makes that a claim worth holding. */
  it('is unchanged by the same correction arriving twice', async () => {
    await reEnqueue('update', {
      session_id: sessionId, reps: 10, weight: 105, weight_unit: 'kg', rpe: 9, rest_seconds: 90,
    });
    await expect(pendingCount(db)).resolves.toBe(1);

    expect((await drain(db, client)).succeeded).toBe(1);
    expect(await readServerSet()).toMatchObject({ reps: 10, weight: 105 });
  });

  it('replays a removal as DELETE, and the set is gone from the server', async () => {
    await deleteSet(db, setId);
    await expect(pendingCount(db)).resolves.toBe(1);

    expect((await drain(db, client)).succeeded).toBe(1);
    expect(await readServerSet()).toBeNull();
  });

  /**
   * A re-delivered delete must not fail. `markFailed` sets `next_attempt_at` to NULL, which makes
   * the row invisible to `listDue` **forever** — so a 404 on the second attempt would strand a
   * delete that had already succeeded, and The Envoy would show a permanent failure for work that
   * was done. The route returns 204 for an absent set precisely to prevent that; this proves it does.
   */
  it('treats a re-delivered delete as done, not as a terminal failure', async () => {
    await reEnqueue('delete', { session_id: sessionId });
    await expect(pendingCount(db)).resolves.toBe(1);

    expect((await drain(db, client)).succeeded).toBe(1);
    expect(await readServerSet()).toBeNull();
  });
});
