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
 * hardcoded here, so no key enters git through this file.
 *
 * **It writes to whichever backend it is pointed at.** Ids are fresh UUIDs per run, so runs cannot
 * collide, and the set it creates is deleted by the test that proves deletion works. The *session*
 * row is left behind: there is no `DELETE /api/v1/workouts/{id}`, and inventing one to tidy up after
 * a test would be the test dictating the API. Point this at a development backend.
 */

import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { join } from 'node:path';

import { LOCAL_USER_ID } from '@/constants';
import { failedCount, enqueue, pendingCount } from '@/db/outbox';
import { addSet, createSession, deleteSet, updateSet } from '@/db/workouts';
import { SyncClient } from '@/sync/client';
import { syncOutbox } from '@/sync/outbox';

import { createTestDb, type TestDatabase } from '../src/db/__tests__/testDb';

/**
 * Real HTTP, over `node:http`, because the global `fetch` is not usable here.
 *
 * `jest-expo`'s setup replaces `globalThis.fetch` with Expo's native-backed implementation, whose
 * response object is inert without the native module behind it — a probe against a healthy backend
 * resolved to an object with no `status` and a falsy `ok`. Switching to the `node` test environment
 * changes nothing, because the preset installs it either way, and `undici` is not in the tree.
 *
 * So this is not a mock: it opens a socket and speaks HTTP to the real server. What it substitutes
 * is the *transport*, not the contract under test — the request the outbox builds, the route that
 * answers it, and the status the outbox reads back are all the production ones. The cast to
 * `Response` is the same seam `src/db/__tests__/testDb.ts` uses against `SQLiteDatabase`: only the
 * members the production code touches are implemented, so a new one fails loudly rather than
 * silently passing.
 */
function nodeFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const url = new URL(String(input));
  const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const outgoing = send(
      {
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        method: init.method ?? 'GET',
        headers: (init.headers as Record<string, string>) ?? {},
      },
      (incoming) => {
        const chunks: Buffer[] = [];
        incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
        incoming.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          const status = incoming.statusCode ?? 0;
          resolve({
            ok: status >= 200 && status < 300,
            status,
            statusText: incoming.statusMessage ?? '',
            json: () => Promise.resolve(JSON.parse(text)),
            text: () => Promise.resolve(text),
          } as Response);
        });
      },
    );
    outgoing.on('error', reject);
    if (typeof init.body === 'string') outgoing.write(init.body);
    outgoing.end();
  });
}

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

/**
 * `.env` is read here rather than through `src/sync/config.ts` because that module reads
 * `EXPO_PUBLIC_*` at **build** time — Expo's CLI inlines them, and nothing loads the file under
 * jest, so `syncConfig` is all-nulls in this process. Reading the file the app is configured from
 * keeps "the script uses the app's own credentials" true without duplicating the values.
 */
function loadCredentials(): { apiUrl: string; deviceKey: string } {
  const fromEnv = {
    apiUrl: process.env.KAIRO_E2E_API_URL,
    deviceKey: process.env.KAIRO_E2E_DEVICE_KEY,
  };
  if (fromEnv.apiUrl && fromEnv.deviceKey) {
    return { apiUrl: fromEnv.apiUrl.replace(/\/$/, ''), deviceKey: fromEnv.deviceKey };
  }

  let file = '';
  try {
    file = readFileSync(join(__dirname, '..', '.env'), 'utf8');
  } catch {
    throw new Error(
      'No credentials. Set KAIRO_E2E_API_URL and KAIRO_E2E_DEVICE_KEY, or create apps/mobile/.env '
        + 'with EXPO_PUBLIC_KAIRO_API_URL and EXPO_PUBLIC_KAIRO_DEVICE_KEY.',
    );
  }
  const read = (key: string): string | undefined =>
    file
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith(`${key}=`))
      .map((line) => line.slice(key.length + 1).trim())
      .pop();

  const apiUrl = fromEnv.apiUrl ?? read('EXPO_PUBLIC_KAIRO_API_URL');
  const deviceKey = fromEnv.deviceKey ?? read('EXPO_PUBLIC_KAIRO_DEVICE_KEY');
  if (!apiUrl || !deviceKey) {
    throw new Error('apps/mobile/.env is missing EXPO_PUBLIC_KAIRO_API_URL or EXPO_PUBLIC_KAIRO_DEVICE_KEY.');
  }
  return { apiUrl: apiUrl.replace(/\/$/, ''), deviceKey };
}

const credentials = loadCredentials();
/**
 * A `.env` pointing at the LAN IP is right for a phone and wrong for this process when the backend
 * is bound to loopback. The host is swapped only for the private ranges a dev machine hands out, so
 * a deliberately remote `KAIRO_E2E_API_URL` is still honoured.
 */
const apiUrl = process.env.KAIRO_E2E_API_URL
  ? credentials.apiUrl
  : credentials.apiUrl.replace(/\/\/(?:192\.168|10|172\.(?:1[6-9]|2\d|3[01]))\.[\d.]+/, '//127.0.0.1');

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
 * `SyncClient` has no `get` — it exists to replay mutations, and adding a read method to production
 * code so a test can verify itself would be the test shaping the thing it checks. So the read side
 * authenticates on its own here, through the same `/auth/token` exchange.
 */
async function authorizedGet(path: string): Promise<Response> {
  const auth = await nodeFetch(`${apiUrl}/api/v1/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_key: credentials.deviceKey }),
  });
  if (!auth.ok) throw new Error(`Auth failed: ${auth.status} ${await auth.text()}`);
  const { access_token: token } = (await auth.json()) as { access_token: string };
  return nodeFetch(`${apiUrl}${path}`, { headers: { Authorization: `Bearer ${token}` } });
}

/** Drain the queue and insist it emptied. Every step here expects a clean sweep. */
async function drain(): Promise<{ succeeded: number; failed: number }> {
  const result = await syncOutbox(db, { client });
  expect(result.status).toBe('complete');
  expect(result.failed).toBe(0);
  await expect(pendingCount(db)).resolves.toBe(0);
  await expect(failedCount(db)).resolves.toBe(0);
  return result;
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
  const health = await nodeFetch(`${apiUrl}/health`).catch((error: unknown) => {
    throw new Error(
      `No backend at ${apiUrl}. Start it with \`uvicorn app.main:app --reload\` from apps/backend. `
        + `(${error instanceof Error ? error.message : String(error)})`,
    );
  });
  if (!health.ok) throw new Error(`Backend at ${apiUrl} is unhealthy: ${health.status}`);

  db = await createTestDb();
  client = new SyncClient({ apiUrl, deviceKey: credentials.deviceKey }, nodeFetch);
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

    const result = await drain();
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

    const result = await drain();
    expect(result.succeeded).toBe(1);

    expect(await readServerSet()).toMatchObject({ reps: 10, weight: 105, rpe: 9, rest_seconds: 90 });
  });

  /** The route's docstring claims a repeated PATCH is safe. A queue that retries makes that a claim worth holding. */
  it('is unchanged by the same correction arriving twice', async () => {
    await reEnqueue('update', {
      session_id: sessionId, reps: 10, weight: 105, weight_unit: 'kg', rpe: 9, rest_seconds: 90,
    });
    await expect(pendingCount(db)).resolves.toBe(1);

    expect((await drain()).succeeded).toBe(1);
    expect(await readServerSet()).toMatchObject({ reps: 10, weight: 105 });
  });

  it('replays a removal as DELETE, and the set is gone from the server', async () => {
    await deleteSet(db, setId);
    await expect(pendingCount(db)).resolves.toBe(1);

    expect((await drain()).succeeded).toBe(1);
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

    expect((await drain()).succeeded).toBe(1);
    expect(await readServerSet()).toBeNull();
  });
});
