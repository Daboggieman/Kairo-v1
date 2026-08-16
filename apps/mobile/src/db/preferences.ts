/**
 * Key-value user preferences — the on-device half of `User.preferences` from
 * `02-data-model.md`.
 *
 * Values are stored as TEXT and parsed at the edge, so a preference can be added without a
 * migration. The typed accessors below are the contract instead: nothing outside this file
 * should pass a raw key string around, or the set of valid keys becomes un-greppable.
 */

import type { SQLiteDatabase } from 'expo-sqlite';

/** Goal body weight, always stored in kg regardless of the unit it was entered in. */
export const GOAL_WEIGHT_KG = 'goal_weight_kg';
export const UNIT_SYSTEM = 'unit_system';
export const MOVEMENT_VOICE_CUES = 'movement_voice_cues';
export const MOVEMENT_DISTANCE_CUES = 'movement_distance_cues';
export const MOVEMENT_TIME_CUES = 'movement_time_cues';
export const MOVEMENT_AUTOPAUSE = 'movement_autopause';
export type UnitSystem = 'metric' | 'imperial';

export async function getPreference(
  db: SQLiteDatabase,
  userId: string,
  key: string,
): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM user_preferences WHERE user_id = ? AND key = ?',
    userId,
    key,
  );
  return row?.value ?? null;
}

/** Insert-or-replace on the (user_id, key) primary key. */
export async function setPreference(
  db: SQLiteDatabase,
  userId: string,
  key: string,
  value: string,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO user_preferences (user_id, key, value)
     VALUES (?, ?, ?)
     ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value`,
    userId,
    key,
    value,
  );
}

export async function clearPreference(
  db: SQLiteDatabase,
  userId: string,
  key: string,
): Promise<void> {
  await db.runAsync('DELETE FROM user_preferences WHERE user_id = ? AND key = ?', userId, key);
}

/**
 * The goal weight in kg, or null when the user has not set one — which is the signal the
 * trend chart uses to decide whether to draw the goal line at all
 * (`04-feature-specs.md`: "goal-line overlay *if* a target weight is set").
 *
 * A stored value that will not parse is treated as absent rather than thrown: a corrupt
 * preference should not be able to break the screen it decorates.
 */
export async function getGoalWeightKg(
  db: SQLiteDatabase,
  userId: string,
): Promise<number | null> {
  const raw = await getPreference(db, userId, GOAL_WEIGHT_KG);
  if (raw === null) return null;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function setGoalWeightKg(
  db: SQLiteDatabase,
  userId: string,
  goalKg: number,
): Promise<void> {
  await setPreference(db, userId, GOAL_WEIGHT_KG, String(goalKg));
}

export async function clearGoalWeight(db: SQLiteDatabase, userId: string): Promise<void> {
  await clearPreference(db, userId, GOAL_WEIGHT_KG);
}

export async function getUnitSystem(db: SQLiteDatabase, userId: string): Promise<UnitSystem> {
  return (await getPreference(db, userId, UNIT_SYSTEM)) === 'imperial' ? 'imperial' : 'metric';
}

export async function setUnitSystem(
  db: SQLiteDatabase,
  userId: string,
  unitSystem: UnitSystem,
): Promise<void> {
  await setPreference(db, userId, UNIT_SYSTEM, unitSystem);
}

async function getDefaultOnFlag(db: SQLiteDatabase, userId: string, key: string): Promise<boolean> {
  return (await getPreference(db, userId, key)) !== 'false';
}

export async function getMovementPreferences(db: SQLiteDatabase, userId: string) {
  const [voiceCues, distanceCues, timeCues, autopause] = await Promise.all([
    getDefaultOnFlag(db, userId, MOVEMENT_VOICE_CUES),
    getDefaultOnFlag(db, userId, MOVEMENT_DISTANCE_CUES),
    getDefaultOnFlag(db, userId, MOVEMENT_TIME_CUES),
    getDefaultOnFlag(db, userId, MOVEMENT_AUTOPAUSE),
  ]);
  return { voiceCues, distanceCues, timeCues, autopause };
}

export async function setMovementPreference(
  db: SQLiteDatabase,
  userId: string,
  key: typeof MOVEMENT_VOICE_CUES | typeof MOVEMENT_DISTANCE_CUES | typeof MOVEMENT_TIME_CUES | typeof MOVEMENT_AUTOPAUSE,
  enabled: boolean,
): Promise<void> {
  await setPreference(db, userId, key, String(enabled));
}
