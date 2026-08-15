import type { SQLiteDatabase } from 'expo-sqlite';
import { randomUUID } from 'expo-crypto';
import * as Notifications from 'expo-notifications';

export type Alarm = { id: string; userId: string; label: string; hour: number; minute: number; repeatDays: number[]; notificationId: string | null; isActive: boolean };
type AlarmRow = { id: string; user_id: string; label: string; hour: number; minute: number; repeat_days: string; notification_id: string | null; is_active: number };

export function toAlarm(row: AlarmRow): Alarm {
  return { id: row.id, userId: row.user_id, label: row.label, hour: row.hour, minute: row.minute,
    repeatDays: JSON.parse(row.repeat_days) as number[], notificationId: row.notification_id,
    isActive: row.is_active === 1 };
}

export async function listAlarms(db: SQLiteDatabase, userId: string): Promise<Alarm[]> {
  const rows = await db.getAllAsync<AlarmRow>('SELECT * FROM alarms WHERE user_id = ? ORDER BY hour, minute', userId);
  return rows.map(toAlarm);
}

export async function createAlarm(db: SQLiteDatabase, userId: string, input: Omit<Alarm, 'id' | 'userId' | 'notificationId'>): Promise<Alarm> {
  const id = randomUUID();
  const notificationId = input.isActive ? await scheduleAlarm(input) : null;
  await db.runAsync('INSERT INTO alarms (id,user_id,label,hour,minute,repeat_days,notification_id,is_active) VALUES (?,?,?,?,?,?,?,?)', id, userId, input.label, input.hour, input.minute, JSON.stringify(input.repeatDays), notificationId, input.isActive ? 1 : 0);
  return { id, userId, ...input, notificationId };
}

export async function deleteAlarm(db: SQLiteDatabase, alarm: Alarm): Promise<void> {
  if (alarm.notificationId) await Promise.all(alarm.notificationId.split(',').map((id) => Notifications.cancelScheduledNotificationAsync(id)));
  await db.runAsync('DELETE FROM alarms WHERE id = ?', alarm.id);
}

export async function updateAlarm(
  db: SQLiteDatabase,
  alarm: Alarm,
  input: Pick<Alarm, 'label' | 'hour' | 'minute' | 'repeatDays' | 'isActive'>,
): Promise<Alarm> {
  if (alarm.notificationId) {
    await Promise.all(
      alarm.notificationId
        .split(',')
        .map((id) => Notifications.cancelScheduledNotificationAsync(id)),
    );
  }
  const notificationId = input.isActive ? await scheduleAlarm(input) : null;
  await db.runAsync(
    `UPDATE alarms SET label = ?, hour = ?, minute = ?, repeat_days = ?,
       notification_id = ?, is_active = ? WHERE id = ?`,
    input.label,
    input.hour,
    input.minute,
    JSON.stringify(input.repeatDays),
    notificationId,
    input.isActive ? 1 : 0,
    alarm.id,
  );
  return { ...alarm, ...input, notificationId };
}

async function scheduleAlarm(alarm: Pick<Alarm, 'label' | 'hour' | 'minute' | 'repeatDays'>): Promise<string | null> {
  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) {
    const requested = await Notifications.requestPermissionsAsync();
    if (!requested.granted) return null;
  }
  if (alarm.repeatDays.length === 0) {
    return Notifications.scheduleNotificationAsync({ content: { title: alarm.label || 'Kairo reminder' }, trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: alarm.hour, minute: alarm.minute } });
  }
  const ids = await Promise.all(alarm.repeatDays.map((weekday) => Notifications.scheduleNotificationAsync({ content: { title: alarm.label || 'Kairo reminder' }, trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday, hour: alarm.hour, minute: alarm.minute } })));
  return ids.join(',');
}
