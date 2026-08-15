import { LOCAL_USER_ID } from '@/constants';
import { createTestDb, type TestDatabase } from '@/db/__tests__/testDb';
import { pendingCount } from '@/db/outbox';
import { addEntry, deleteEntry } from '@/db/weight';
import { clearCompletion, createTask, deleteTask, setArchived, setCompletion } from '@/db/tasks';
import {
  addNutritionEntry,
  createFoodItem,
  deleteNutritionEntry,
  setMacroTarget,
} from '@/db/macros';

import { SyncClient } from '../client';
import { syncOutbox } from '../outbox';

type ResponseSpec = { status: number; body?: unknown };

function response({ status, body = {} }: ResponseSpec): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `HTTP ${status}`,
    json: async () => body,
  } as Response;
}

function fetchSequence(specs: ResponseSpec[]) {
  const mock = jest.fn(async () => {
    const next = specs.shift();
    if (!next) throw new Error('Unexpected fetch');
    return response(next);
  });
  return mock as unknown as typeof fetch;
}

function tokens(access = 'access-1', refresh = 'refresh-1') {
  return { access_token: access, refresh_token: refresh, token_type: 'bearer' };
}

async function addWeight(db: TestDatabase, id = 'weight-sync') {
  await addEntry(db, {
    id,
    userId: LOCAL_USER_ID,
    recordedAt: '2026-08-15T07:30:00.000Z',
    weight: 75.5,
    weightUnit: 'kg',
    note: null,
  });
}

describe('authenticated sync client', () => {
  it('authenticates, refreshes once on 401, and retries the request', async () => {
    const fetchMock = fetchSequence([
      { status: 200, body: tokens() },
      { status: 401 },
      { status: 200, body: tokens('access-2', 'refresh-2') },
      { status: 201 },
    ]);
    const client = new SyncClient(
      { apiUrl: 'http://api.test', deviceKey: 'device-key' },
      fetchMock,
    );

    await client.post('/api/v1/weight-entries', { id: 'weight-1' });

    const calls = (fetchMock as jest.Mock).mock.calls;
    expect(calls.map(([url]) => url)).toEqual([
      'http://api.test/api/v1/auth/token',
      'http://api.test/api/v1/weight-entries',
      'http://api.test/api/v1/auth/refresh',
      'http://api.test/api/v1/weight-entries',
    ]);
    expect(calls[3][1].headers.Authorization).toBe('Bearer access-2');
  });
});

describe('outbox replay', () => {
  let db: TestDatabase;

  beforeEach(async () => {
    db = await createTestDb();
  });

  afterEach(() => db.close());

  it('acknowledges an uploaded weight row', async () => {
    await addWeight(db);
    const fetchMock = fetchSequence([{ status: 200, body: tokens() }, { status: 201 }]);
    const client = new SyncClient(
      { apiUrl: 'http://api.test', deviceKey: 'device-key' },
      fetchMock,
    );

    const result = await syncOutbox(db, { client, nowMs: Date.now() + 1000 });

    expect(result).toEqual({ status: 'complete', processed: 1, succeeded: 1, failed: 0 });
    expect(await pendingCount(db)).toBe(0);
    const body = JSON.parse((fetchMock as jest.Mock).mock.calls[1][1].body);
    expect(body).toMatchObject({ id: 'weight-sync', weight: 75.5, weight_unit: 'kg' });
  });

  it('replays create then delete in local order', async () => {
    await addWeight(db, 'weight-delete');
    await deleteEntry(db, 'weight-delete');
    const fetchMock = fetchSequence([
      { status: 200, body: tokens() },
      { status: 201 },
      { status: 204 },
    ]);
    const client = new SyncClient(
      { apiUrl: 'http://api.test', deviceKey: 'device-key' },
      fetchMock,
    );

    const result = await syncOutbox(db, { client, nowMs: Date.now() + 1000 });

    expect(result.succeeded).toBe(2);
    expect((fetchMock as jest.Mock).mock.calls[2][0]).toContain('/weight-entries/weight-delete');
    expect(await pendingCount(db)).toBe(0);
  });

  it('backs off a transient failure and stops the ordered batch', async () => {
    await addWeight(db, 'weight-retry');
    await addWeight(db, 'weight-later');
    const fetchMock = fetchSequence([{ status: 200, body: tokens() }, { status: 503 }]);
    const client = new SyncClient(
      { apiUrl: 'http://api.test', deviceKey: 'device-key' },
      fetchMock,
    );

    const result = await syncOutbox(db, { client, nowMs: 1_800_000_000_000 });
    const rows = await db.getAllAsync<{
      attempts: number;
      last_error: string | null;
      next_attempt_at: string | null;
    }>('SELECT attempts, last_error, next_attempt_at FROM sync_outbox ORDER BY id');

    expect(result).toMatchObject({ processed: 1, failed: 1 });
    expect(rows[0]).toMatchObject({ attempts: 1, last_error: 'HTTP 503' });
    expect(rows[0].next_attempt_at).not.toBeNull();
    expect(rows[1].attempts).toBe(0);
  });

  it('records a conflict as terminal instead of retrying forever', async () => {
    await addWeight(db, 'weight-conflict');
    const fetchMock = fetchSequence([
      { status: 200, body: tokens() },
      { status: 409, body: { detail: 'Weight entry id already exists' } },
    ]);
    const client = new SyncClient(
      { apiUrl: 'http://api.test', deviceKey: 'device-key' },
      fetchMock,
    );

    await syncOutbox(db, { client, nowMs: Date.now() + 1000 });
    const row = await db.getFirstAsync<{
      attempts: number;
      last_error: string;
      next_attempt_at: string | null;
    }>('SELECT attempts, last_error, next_attempt_at FROM sync_outbox');

    expect(row).toEqual({
      attempts: 1,
      last_error: 'Weight entry id already exists',
      next_attempt_at: null,
    });
  });

  it('does nothing when sync configuration is absent', async () => {
    await addWeight(db);
    const result = await syncOutbox(db, {
      config: { apiUrl: null, deviceKey: null },
    });
    expect(result.status).toBe('disabled');
    expect(await pendingCount(db)).toBe(1);
  });

  it('replays the complete task lifecycle through the shared transport', async () => {
    await createTask(db, {
      id: 'task-sync',
      userId: LOCAL_USER_ID,
      title: 'Read',
      recurrenceRule: 'daily',
      createdAt: '2026-08-15T07:00:00.000Z',
    });
    await setArchived(db, 'task-sync', true);
    await setCompletion(db, {
      id: 'completion-sync',
      taskId: 'task-sync',
      completedDate: '2026-08-15',
      completedAt: '2026-08-15T08:00:00.000Z',
    });
    await clearCompletion(db, 'task-sync', '2026-08-15');
    await deleteTask(db, 'task-sync');
    const fetchMock = fetchSequence([
      { status: 200, body: tokens() },
      { status: 201 },
      { status: 200 },
      { status: 201 },
      { status: 204 },
      { status: 204 },
    ]);
    const client = new SyncClient(
      { apiUrl: 'http://api.test', deviceKey: 'device-key' },
      fetchMock,
    );

    const result = await syncOutbox(db, { client, nowMs: Date.now() + 1000 });
    const calls = (fetchMock as jest.Mock).mock.calls.slice(1);

    expect(result).toMatchObject({ processed: 5, succeeded: 5, failed: 0 });
    expect(calls.map(([url, init]) => [url, init.method])).toEqual([
      ['http://api.test/api/v1/tasks', 'POST'],
      ['http://api.test/api/v1/tasks/task-sync', 'PATCH'],
      ['http://api.test/api/v1/task-completions', 'POST'],
      ['http://api.test/api/v1/tasks/task-sync/completions/2026-08-15', 'DELETE'],
      ['http://api.test/api/v1/tasks/task-sync', 'DELETE'],
    ]);
    expect(await pendingCount(db)).toBe(0);
  });

  it('replays food, entry, target, and entry deletion in dependency order', async () => {
    await createFoodItem(db, {
      id: 'food-sync', userId: LOCAL_USER_ID, name: 'Oats', caloriesPerServing: 150,
      proteinG: 5, carbsG: 27, fatG: 3, servingLabel: '40 g',
      createdAt: '2026-08-15T07:00:00.000Z',
    });
    await addNutritionEntry(db, {
      id: 'nutrition-sync', userId: LOCAL_USER_ID, foodItemId: 'food-sync',
      loggedAt: '2026-08-15T08:00:00.000Z', loggedDate: '2026-08-15',
      quantity: 1, mealType: 'breakfast',
    });
    await setMacroTarget(db, {
      id: 'target-sync', userId: LOCAL_USER_ID, calories: 2200, proteinG: 180,
      carbsG: 220, fatG: 70, effectiveDate: '2026-08-15',
      createdAt: '2026-08-15T07:00:00.000Z',
    });
    await deleteNutritionEntry(db, 'nutrition-sync', LOCAL_USER_ID);
    const fetchMock = fetchSequence([
      { status: 200, body: tokens() }, { status: 201 }, { status: 201 },
      { status: 200 }, { status: 204 },
    ]);
    const client = new SyncClient(
      { apiUrl: 'http://api.test', deviceKey: 'device-key' }, fetchMock,
    );

    const result = await syncOutbox(db, { client, nowMs: Date.now() + 1000 });
    const calls = (fetchMock as jest.Mock).mock.calls.slice(1);
    expect(result).toMatchObject({ processed: 4, succeeded: 4, failed: 0 });
    expect(calls.map(([url, init]) => [url, init.method])).toEqual([
      ['http://api.test/api/v1/food-items', 'POST'],
      ['http://api.test/api/v1/nutrition-entries', 'POST'],
      ['http://api.test/api/v1/macro-targets', 'PUT'],
      ['http://api.test/api/v1/nutrition-entries/nutrition-sync', 'DELETE'],
    ]);
  });
});
