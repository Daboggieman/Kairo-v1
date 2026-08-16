/**
 * Versioned migrations, applied via `PRAGMA user_version`.
 *
 * The pattern matters more than any single entry: the remaining P0 module (macros) will
 * append another one here, and the app ships to a real phone where dropping the database to
 * change the schema is not an option.
 *
 * To add one: append to MIGRATIONS and bump SCHEMA_VERSION in `schema.ts`. Never edit
 * an existing entry — a device that already ran it will not run it again.
 */

import type { SQLiteDatabase } from 'expo-sqlite';

import {
  CREATE_BODY_WEIGHT_ENTRIES,
  CREATE_ALARMS,
  CREATE_EXERCISES,
  CREATE_FOOD_ITEMS,
  CREATE_INDEXES,
  CREATE_MACRO_TARGETS,
  CREATE_MOVEMENT_ACTIVITIES,
  CREATE_MOVEMENT_EVENTS,
  CREATE_MOVEMENT_INDEXES,
  CREATE_MOVEMENT_POINTS,
  CREATE_MOVEMENT_SPLITS,
  CREATE_MOVEMENT_TRACKING_STATE,
  CREATE_NUTRITION_ENTRIES,
  CREATE_NUTRITION_INDEXES,
  CREATE_TASK_COMPLETIONS,
  CREATE_TASK_INDEXES,
  CREATE_TASKS,
  CREATE_SYNC_OUTBOX,
  CREATE_SYNC_OUTBOX_INDEXES,
  CREATE_USER_PREFERENCES,
  CREATE_WEIGHT_INDEXES,
  CREATE_WORKOUT_SESSIONS,
  CREATE_WORKOUT_SETS,
} from './schema';
import { seedExercises } from './seed';

type Migration = {
  version: number;
  up: (db: SQLiteDatabase) => Promise<void>;
};

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    up: async (db) => {
      await db.execAsync(CREATE_EXERCISES);
      await db.execAsync(CREATE_WORKOUT_SESSIONS);
      await db.execAsync(CREATE_WORKOUT_SETS);
      await db.execAsync(CREATE_INDEXES);
      await seedExercises(db);
    },
  },
  {
    version: 2,
    up: async (db) => {
      await db.execAsync(CREATE_BODY_WEIGHT_ENTRIES);
      await db.execAsync(CREATE_USER_PREFERENCES);
      await db.execAsync(CREATE_WEIGHT_INDEXES);
    },
  },
  {
    version: 3,
    up: async (db) => {
      await db.execAsync(CREATE_TASKS);
      await db.execAsync(CREATE_TASK_COMPLETIONS);
      await db.execAsync(CREATE_TASK_INDEXES);
    },
  },
  {
    version: 4,
    up: async (db) => {
      await db.execAsync(CREATE_FOOD_ITEMS);
      await db.execAsync(CREATE_NUTRITION_ENTRIES);
      await db.execAsync(CREATE_MACRO_TARGETS);
      await db.execAsync(CREATE_NUTRITION_INDEXES);
    },
  },
  {
    version: 5,
    up: async (db) => {
      await db.execAsync(CREATE_SYNC_OUTBOX);
      await db.execAsync(CREATE_SYNC_OUTBOX_INDEXES);
    },
  },
  { version: 6, up: async (db) => { await db.execAsync(CREATE_ALARMS); } },
  { version: 7, up: async (db) => {
    await db.execAsync(CREATE_MOVEMENT_ACTIVITIES);
    await db.execAsync(CREATE_MOVEMENT_POINTS);
    await db.execAsync(CREATE_MOVEMENT_EVENTS);
    await db.execAsync(CREATE_MOVEMENT_SPLITS);
    await db.execAsync(CREATE_MOVEMENT_INDEXES);
  } },
  { version: 8, up: async (db) => { await db.execAsync(CREATE_MOVEMENT_TRACKING_STATE); } },
];

/**
 * Brings the database up to the latest schema version. Safe to call on every launch:
 * migrations already applied are skipped.
 *
 * Wired to `SQLiteProvider`'s `onInit` in `app/_layout.tsx`.
 */
export async function migrate(db: SQLiteDatabase): Promise<void> {
  // WAL gives markedly better concurrent read/write behaviour and is what the
  // expo-sqlite docs recommend enabling on new databases.
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');

  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;

  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;
    await migration.up(db);
    // PRAGMA does not accept bound parameters, hence the interpolation. The value is
    // a hardcoded number from the list above, never user input.
    await db.execAsync(`PRAGMA user_version = ${migration.version};`);
  }
}
