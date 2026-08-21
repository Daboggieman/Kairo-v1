/**
 * Key-value user preferences — the on-device half of `User.preferences` from
 * `02-data-model.md`.
 *
 * Values are stored as TEXT and parsed at the edge, so a preference can be added without a
 * migration. The typed accessors below are the contract instead: nothing outside this file
 * should pass a raw key string around, or the set of valid keys becomes un-greppable.
 */

import type { SQLiteDatabase } from 'expo-sqlite';

import type { WeekStartDay } from '@/domain/dates';

/** Goal body weight, always stored in kg regardless of the unit it was entered in. */
export const GOAL_WEIGHT_KG = 'goal_weight_kg';
export const UNIT_SYSTEM = 'unit_system';
export const MOVEMENT_VOICE_CUES = 'movement_voice_cues';
export const MOVEMENT_DISTANCE_CUES = 'movement_distance_cues';
export const MOVEMENT_TIME_CUES = 'movement_time_cues';
export const MOVEMENT_AUTOPAUSE = 'movement_autopause';
/**
 * Set once, when the user finishes The Gates. Its *absence* is the signal, not its value —
 * so nothing needs a migration to introduce it, and clearing it walks the onboarding again
 * (which is what "raze local data" relies on).
 */
export const ONBOARDING_COMPLETE = 'onboarding_complete';
/**
 * Which day a calendar week starts on. Read by The Annals and The Pantheon.
 *
 * `movementWeek` deliberately does **not** read this: it is a rolling seven days ending today
 * and answers a different question. See the note on it in `src/domain/movement.ts`.
 */
export const WEEK_START = 'week_start';
/** The tab The Gates and the app open on. */
export const FIRST_SCREEN = 'first_screen';
/**
 * When an intent last actually reached the server, ISO-8601. Absent means none ever has.
 *
 * Written by `syncOutbox` only when a run delivered something (`succeeded > 0`), not on every
 * completed run: `SyncBootstrap` calls in every 60 seconds, so "the loop ran" is almost always true
 * and says nothing, and a run that found nothing due never touched the network. The Envoy therefore
 * labels it "Last delivered", not "Last ran".
 */
export const LAST_SYNC_AT = 'last_sync_at';
export type UnitSystem = 'metric' | 'imperial';
/**
 * Re-exported from `src/domain/dates.ts`, where the week boundary is actually computed. One union,
 * so a preference value and the function that acts on it cannot drift apart.
 */
export type WeekStart = WeekStartDay;
/**
 * The six visible tabs, by route name rather than by Greek title — display copy is Greek,
 * identifiers are English, and a stored value has to survive a rename of the label.
 */
export type FirstScreen = 'index' | 'tasks' | 'workouts' | 'macros' | 'weight' | 'movement';

const FIRST_SCREENS: readonly FirstScreen[] = [
  'index',
  'tasks',
  'workouts',
  'macros',
  'weight',
  'movement',
];

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

/**
 * Whether The Gates have been crossed.
 *
 * Anything other than `'true'` reads as false, including a value some future version wrote and
 * this one does not understand — showing the onboarding twice is a smaller failure than skipping
 * it on a database that was never set up.
 */
export async function isOnboardingComplete(
  db: SQLiteDatabase,
  userId: string,
): Promise<boolean> {
  return (await getPreference(db, userId, ONBOARDING_COMPLETE)) === 'true';
}

export async function setOnboardingComplete(
  db: SQLiteDatabase,
  userId: string,
): Promise<void> {
  await setPreference(db, userId, ONBOARDING_COMPLETE, 'true');
}

export async function clearOnboardingComplete(
  db: SQLiteDatabase,
  userId: string,
): Promise<void> {
  await clearPreference(db, userId, ONBOARDING_COMPLETE);
}

/**
 * Monday unless the user chose Sunday — the same shape as `getUnitSystem`, and for the same
 * reason: an unrecognised stored value falls back to the default rather than propagating.
 */
export async function getWeekStart(db: SQLiteDatabase, userId: string): Promise<WeekStart> {
  return (await getPreference(db, userId, WEEK_START)) === 'sunday' ? 'sunday' : 'monday';
}

export async function setWeekStart(
  db: SQLiteDatabase,
  userId: string,
  weekStart: WeekStart,
): Promise<void> {
  await setPreference(db, userId, WEEK_START, weekStart);
}

/** The Citadel unless the user chose otherwise; an unknown route name falls back to it. */
export async function getFirstScreen(db: SQLiteDatabase, userId: string): Promise<FirstScreen> {
  const raw = await getPreference(db, userId, FIRST_SCREEN);
  return FIRST_SCREENS.find((screen) => screen === raw) ?? 'index';
}

export async function setFirstScreen(
  db: SQLiteDatabase,
  userId: string,
  firstScreen: FirstScreen,
): Promise<void> {
  await setPreference(db, userId, FIRST_SCREEN, firstScreen);
}

/**
 * When sync last completed, as epoch milliseconds, or null if it never has.
 *
 * Stored as ISO-8601 so the row is readable in a database browser, returned as a number so the
 * caller can subtract it from `Date.now()` without parsing twice. An unparseable value reads as
 * absent, like every other accessor here.
 */
export async function getLastSyncAt(db: SQLiteDatabase, userId: string): Promise<number | null> {
  const raw = await getPreference(db, userId, LAST_SYNC_AT);
  if (raw === null) return null;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function setLastSyncAt(
  db: SQLiteDatabase,
  userId: string,
  atMs: number,
): Promise<void> {
  await setPreference(db, userId, LAST_SYNC_AT, new Date(atMs).toISOString());
}
