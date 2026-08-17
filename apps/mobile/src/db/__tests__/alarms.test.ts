/**
 * Query-layer tests for the reminders module, against a real in-memory SQLite database
 * (`testDb.ts`).
 *
 * The contract worth pinning here is what happens when the runtime cannot schedule anything.
 * `expo-notifications` is unusable on Android in Expo Go, so `scheduleReminder` returns `null`,
 * and the row must still be written — a saved reminder that has not been handed to the OS yet is
 * recoverable, a dropped write is not. The native service is mocked because it is native glue;
 * the trigger arithmetic it delegates to is tested in `src/domain/__tests__/reminders.test.ts`.
 */

import { LOCAL_USER_ID } from '@/constants';
import { cancelReminder, scheduleReminder } from '@/services/notifications';

import { createTestDb, type TestDatabase } from './testDb';
import { createAlarm, deleteAlarm, listAlarms, updateAlarm, type Alarm } from '../alarms';

// Babel hoists jest.mock above the imports regardless of where it sits, so keeping it below
// them satisfies import/first without changing when the mock is registered.
jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => `uuid-${(idCounter += 1)}`),
}));

jest.mock('@/services/notifications', () => ({
  scheduleReminder: jest.fn(),
  cancelReminder: jest.fn(),
}));

let idCounter = 0;

const scheduleReminderMock = scheduleReminder as jest.MockedFunction<typeof scheduleReminder>;
const cancelReminderMock = cancelReminder as jest.MockedFunction<typeof cancelReminder>;

const USER = LOCAL_USER_ID;
const INPUT = { label: 'Workout reminder', hour: 7, minute: 0, repeatDays: [], isActive: true };

let db: TestDatabase;

beforeEach(async () => {
  db = await createTestDb();
  idCounter = 0;
  scheduleReminderMock.mockReset();
  cancelReminderMock.mockReset();
  scheduleReminderMock.mockResolvedValue('native-1');
  cancelReminderMock.mockResolvedValue(undefined);
});

describe('createAlarm', () => {
  it('stores the row and the native identifiers it was given', async () => {
    const alarm = await createAlarm(db, USER, { ...INPUT, repeatDays: [2, 4] });

    expect(scheduleReminderMock).toHaveBeenCalledWith({ ...INPUT, repeatDays: [2, 4] });
    expect(alarm.notificationId).toBe('native-1');
    expect(await listAlarms(db, USER)).toEqual([
      {
        id: alarm.id,
        userId: USER,
        label: 'Workout reminder',
        hour: 7,
        minute: 0,
        repeatDays: [2, 4],
        notificationId: 'native-1',
        isActive: true,
      },
    ]);
  });

  /** Expo Go on Android, or a denied permission: the reminder is kept, just not scheduled. */
  it('still writes the row when nothing could be scheduled', async () => {
    scheduleReminderMock.mockResolvedValue(null);

    const alarm = await createAlarm(db, USER, INPUT);

    expect(alarm.notificationId).toBeNull();
    const [stored] = await listAlarms(db, USER);
    expect(stored.notificationId).toBeNull();
    expect(stored.isActive).toBe(true);
  });

  it('does not schedule an inactive reminder', async () => {
    const alarm = await createAlarm(db, USER, { ...INPUT, isActive: false });

    expect(scheduleReminderMock).not.toHaveBeenCalled();
    expect(alarm.notificationId).toBeNull();
    expect((await listAlarms(db, USER))[0].isActive).toBe(false);
  });

  it('lists reminders by time of day and keeps other users out', async () => {
    await createAlarm(db, USER, { ...INPUT, label: 'Evening', hour: 18, minute: 30 });
    await createAlarm(db, USER, { ...INPUT, label: 'Early', hour: 6, minute: 5 });
    await createAlarm(db, 'someone-else', { ...INPUT, label: 'Theirs', hour: 5, minute: 0 });

    expect((await listAlarms(db, USER)).map((alarm) => alarm.label)).toEqual(['Early', 'Evening']);
  });
});

describe('updateAlarm', () => {
  it('cancels the previous schedule before scheduling the replacement', async () => {
    const alarm = await createAlarm(db, USER, INPUT);
    scheduleReminderMock.mockResolvedValue('native-2');

    const updated = await updateAlarm(db, alarm, {
      label: 'Evening walk',
      hour: 19,
      minute: 45,
      repeatDays: [3],
      isActive: true,
    });

    expect(cancelReminderMock).toHaveBeenCalledWith('native-1');
    expect(updated.notificationId).toBe('native-2');
    expect(await listAlarms(db, USER)).toEqual([
      {
        id: alarm.id,
        userId: USER,
        label: 'Evening walk',
        hour: 19,
        minute: 45,
        repeatDays: [3],
        notificationId: 'native-2',
        isActive: true,
      },
    ]);
  });

  it('clears the stored identifiers when the reminder is switched off', async () => {
    const alarm = await createAlarm(db, USER, INPUT);
    scheduleReminderMock.mockClear();

    const updated = await updateAlarm(db, alarm, { ...INPUT, isActive: false });

    expect(cancelReminderMock).toHaveBeenCalledWith('native-1');
    expect(scheduleReminderMock).not.toHaveBeenCalled();
    expect(updated.notificationId).toBeNull();
    expect((await listAlarms(db, USER))[0].notificationId).toBeNull();
  });
});

describe('deleteAlarm', () => {
  it('cancels the schedule and removes the row', async () => {
    const alarm = await createAlarm(db, USER, INPUT);

    await deleteAlarm(db, alarm);

    expect(cancelReminderMock).toHaveBeenCalledWith('native-1');
    expect(await listAlarms(db, USER)).toEqual([]);
  });

  /**
   * A row saved while scheduling was unavailable has no identifiers. Deleting it must not
   * depend on the native side being reachable.
   */
  it('removes a row that was never scheduled', async () => {
    scheduleReminderMock.mockResolvedValue(null);
    const alarm: Alarm = await createAlarm(db, USER, INPUT);

    await deleteAlarm(db, alarm);

    expect(cancelReminderMock).toHaveBeenCalledWith(null);
    expect(await listAlarms(db, USER)).toEqual([]);
  });
});
