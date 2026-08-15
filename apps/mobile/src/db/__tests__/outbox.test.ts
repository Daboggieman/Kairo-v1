import { LOCAL_USER_ID } from '@/constants';

import { createTestDb, type TestDatabase } from './testDb';
import { listDue, pendingCount } from '../outbox';
import { addEntry, deleteEntry, getEntry } from '../weight';

describe('sync outbox persistence', () => {
  let db: TestDatabase;

  beforeEach(async () => {
    db = await createTestDb();
  });

  afterEach(() => db.close());

  it('records the exact weight wire payload with the local insert', async () => {
    await addEntry(db, {
      id: 'weight-1',
      userId: LOCAL_USER_ID,
      recordedAt: '2026-08-15T07:30:00.000Z',
      weight: 75.5,
      weightUnit: 'kg',
      note: 'fasted',
    });

    const [row] = await listDue(db, '9999-12-31T23:59:59.999Z');
    expect(row).toMatchObject({
      entity_type: 'body_weight_entry',
      entity_id: 'weight-1',
      operation: 'upsert',
      attempts: 0,
    });
    expect(JSON.parse(row.payload ?? '')).toEqual({
      id: 'weight-1',
      recorded_at: '2026-08-15T07:30:00.000Z',
      weight: 75.5,
      weight_unit: 'kg',
      note: 'fasted',
    });
  });

  it('rolls back the local insert if the outbox write fails', async () => {
    await db.execAsync('DROP TABLE sync_outbox');
    await expect(
      addEntry(db, {
        id: 'weight-rollback',
        userId: LOCAL_USER_ID,
        recordedAt: '2026-08-15T07:30:00.000Z',
        weight: 75.5,
        weightUnit: 'kg',
        note: null,
      }),
    ).rejects.toThrow();
    expect(await getEntry(db, 'weight-rollback')).toBeNull();
  });

  it('queues deletion after the create and ignores a missing local id', async () => {
    await addEntry(db, {
      id: 'weight-2',
      userId: LOCAL_USER_ID,
      recordedAt: '2026-08-15T08:00:00.000Z',
      weight: 75.4,
      weightUnit: 'kg',
      note: null,
    });
    await deleteEntry(db, 'weight-2');
    await deleteEntry(db, 'missing');

    const rows = await listDue(db, '9999-12-31T23:59:59.999Z');
    expect(rows.map((row) => row.operation)).toEqual(['upsert', 'delete']);
    expect(await pendingCount(db)).toBe(2);
  });
});
