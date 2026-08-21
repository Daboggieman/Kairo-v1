import type { SQLiteDatabase } from 'expo-sqlite';
import { clearOnboardingComplete } from './preferences';
import { seedExercises } from './seed';
import { cancelReminder } from '@/services/notifications';

export async function exportEverything(db: SQLiteDatabase): Promise<string> {
  const tables = await db.getAllAsync<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
  );
  const result: Record<string, unknown[]> = {};
  for (const table of tables) result[table.name] = await db.getAllAsync(`SELECT * FROM "${table.name.replaceAll('"', '""')}"`);
  return JSON.stringify({ exportedAt: new Date().toISOString(), tables: result }, null, 2);
}

export async function razeLocalData(db: SQLiteDatabase, userId: string): Promise<void> {
  const alarms = await db.getAllAsync<{ notification_id: string | null }>('SELECT notification_id FROM alarms');
  await Promise.all(alarms.map((alarm) => cancelReminder(alarm.notification_id)));
  await db.withExclusiveTransactionAsync(async (tx) => {
    const tables = await tx.getAllAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != 'user_preferences'`,
    );
    for (const table of tables) await tx.runAsync(`DELETE FROM "${table.name.replaceAll('"', '""')}"`);
  });
  await seedExercises(db);
  await clearOnboardingComplete(db, userId);
}
