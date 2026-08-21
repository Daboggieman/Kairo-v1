import { LOCAL_USER_ID } from '@/constants';
import { cancelReminder } from '@/services/notifications';

import { exportEverything, razeLocalData } from '../maintenance';
import { ONBOARDING_COMPLETE, setPreference } from '../preferences';
import { SEED_EXERCISES } from '../seed';
import { createTestDb, type TestDatabase } from './testDb';

jest.mock('@/services/notifications', () => ({
  cancelReminder: jest.fn().mockResolvedValue(undefined),
}));

const cancelReminderMock = cancelReminder as jest.MockedFunction<typeof cancelReminder>;
let db: TestDatabase;

beforeEach(async () => {
  db = await createTestDb();
  cancelReminderMock.mockClear();
});

afterEach(() => db.close());

it('exports every application table as JSON', async () => {
  await db.runAsync(
    `INSERT INTO body_weight_entries (id,user_id,recorded_at,weight,weight_unit,note)
     VALUES ('w1', ?, '2026-08-21T08:00:00Z', 75, 'kg', NULL)`,
    LOCAL_USER_ID,
  );

  const exported = JSON.parse(await exportEverything(db)) as {
    exportedAt: string;
    tables: Record<string, unknown[]>;
  };

  expect(Number.isFinite(Date.parse(exported.exportedAt))).toBe(true);
  expect(exported.tables.body_weight_entries).toHaveLength(1);
  expect(exported.tables.exercises).toHaveLength(SEED_EXERCISES.length);
});

it('cancels reminders, clears user data, reseeds exercises, and resets onboarding', async () => {
  await setPreference(db, LOCAL_USER_ID, ONBOARDING_COMPLETE, 'true');
  await db.runAsync(
    `INSERT INTO alarms (id,user_id,label,hour,minute,repeat_days,notification_id,is_active)
     VALUES ('a1', ?, 'Wake', 7, 0, '[]', 'native-a1', 1)`,
    LOCAL_USER_ID,
  );
  await db.runAsync(
    `INSERT INTO body_weight_entries (id,user_id,recorded_at,weight,weight_unit,note)
     VALUES ('w1', ?, '2026-08-21T08:00:00Z', 75, 'kg', NULL)`,
    LOCAL_USER_ID,
  );
  await db.runAsync(
    `INSERT INTO exercises (id,name,muscle_group,equipment,is_custom)
     VALUES ('custom-1', 'Stone Carry', 'full body', 'stone', 1)`,
  );

  await razeLocalData(db, LOCAL_USER_ID);

  expect(cancelReminderMock).toHaveBeenCalledWith('native-a1');
  expect(await db.getFirstAsync('SELECT id FROM alarms')).toBeNull();
  expect(await db.getFirstAsync('SELECT id FROM body_weight_entries')).toBeNull();
  expect(await db.getFirstAsync('SELECT id FROM exercises WHERE id = ?', 'custom-1')).toBeNull();
  expect(await db.getAllAsync('SELECT id FROM exercises')).toHaveLength(SEED_EXERCISES.length);
  expect(
    await db.getFirstAsync(
      'SELECT value FROM user_preferences WHERE user_id = ? AND key = ?',
      LOCAL_USER_ID,
      ONBOARDING_COMPLETE,
    ),
  ).toBeNull();
});
