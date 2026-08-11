/**
 * Query-layer tests for the weight module, against a real in-memory SQLite database
 * (`testDb.ts`) — same harness as the workouts suite.
 *
 * Two things here are not just CRUD coverage. The ordering test on
 * `listEntriesAscending` guards a subtle SQL mistake (a LIMIT applied to an ascending sort
 * keeps the *oldest* rows), and the migration test upgrades a v1 database that already has
 * rows in it, which is what every existing install will actually do.
 */

import { LOCAL_USER_ID } from '@/constants';
import { dailyWeights, movingAverage } from '@/domain/weight';

import { createTestDb, type TestDatabase } from './testDb';
import { migrate } from '../migrations';
import { SCHEMA_VERSION } from '../schema';
import {
  clearGoalWeight,
  getGoalWeightKg,
  getPreference,
  setGoalWeightKg,
  setPreference,
} from '../preferences';
import { addEntry, deleteEntry, getEntry, latestEntry, listEntries, listEntriesAscending } from '../weight';
import type { WeightUnit } from '../types';

const USER = LOCAL_USER_ID;

let idCounter = 0;

/** Inserts an entry at midday, so no fixture sits near a date boundary. */
function add(
  db: TestDatabase,
  date: string,
  weight: number,
  options: { unit?: WeightUnit; note?: string | null; userId?: string; time?: string } = {},
) {
  idCounter += 1;
  return addEntry(db, {
    id: `w-${idCounter}`,
    userId: options.userId ?? USER,
    recordedAt: `${date}T${options.time ?? '12:00:00'}.000Z`,
    weight,
    weightUnit: options.unit ?? 'kg',
    note: options.note ?? null,
  });
}

describe('weight query layer', () => {
  let db: TestDatabase;

  beforeEach(async () => {
    db = await createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  describe('migration', () => {
    it('creates the weight tables at the current schema version', async () => {
      const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
      expect(row?.user_version).toBe(SCHEMA_VERSION);
      expect(await listEntries(db, USER)).toEqual([]);
    });

    it('is idempotent — a second migrate() neither throws nor drops data', async () => {
      await add(db, '2026-08-11', 80);
      await migrate(db);

      expect(await listEntries(db, USER)).toHaveLength(1);
    });

    it('upgrades a v1 database in place, keeping its workout data', async () => {
      // What an existing install does on the update that ships this module: the workout
      // rows are already there and must survive. Rewinding user_version is the only way to
      // replay migration 2 against a database that has already run it.
      await db.runAsync(
        `INSERT INTO workout_sessions (id, user_id, started_at) VALUES (?, ?, ?)`,
        's1',
        USER,
        '2026-08-10T10:00:00.000Z',
      );
      await db.execAsync('DROP TABLE body_weight_entries');
      await db.execAsync('DROP TABLE user_preferences');
      await db.execAsync('PRAGMA user_version = 1');

      await migrate(db);

      expect((await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))?.user_version)
        .toBe(SCHEMA_VERSION);
      expect(await listEntries(db, USER)).toEqual([]);
      const sessions = await db.getAllAsync<{ id: string }>('SELECT id FROM workout_sessions');
      expect(sessions.map((s) => s.id)).toEqual(['s1']);
    });
  });

  describe('addEntry / getEntry', () => {
    it('round-trips an entry through storage', async () => {
      const created = await add(db, '2026-08-11', 80.5, { note: 'fasted' });

      expect(await getEntry(db, created.id)).toEqual({
        id: created.id,
        userId: USER,
        recordedAt: '2026-08-11T12:00:00.000Z',
        weight: 80.5,
        weightUnit: 'kg',
        note: 'fasted',
      });
    });

    it('returns what it inserted without a re-read', async () => {
      const created = await add(db, '2026-08-11', 80);
      expect(await getEntry(db, created.id)).toEqual(created);
    });

    it('preserves the unit as logged rather than converting on write', async () => {
      // Same decision as workout_sets: the row keeps what the user typed, and conversion
      // happens in the domain layer. Converting on write would lose the original.
      const created = await add(db, '2026-08-11', 176.4, { unit: 'lb' });
      expect((await getEntry(db, created.id))?.weightUnit).toBe('lb');
      expect((await getEntry(db, created.id))?.weight).toBe(176.4);
    });

    it('returns null for an id that does not exist', async () => {
      expect(await getEntry(db, 'nope')).toBeNull();
    });

    it('allows several entries on the same day', async () => {
      // Morning and evening weigh-ins are both legitimate; dailyWeights() averages them.
      await add(db, '2026-08-11', 80, { time: '07:00:00' });
      await add(db, '2026-08-11', 81, { time: '21:00:00' });

      expect(await listEntries(db, USER)).toHaveLength(2);
    });
  });

  describe('listEntries', () => {
    it('returns newest first, for the history list', async () => {
      await add(db, '2026-08-09', 82);
      await add(db, '2026-08-11', 80);
      await add(db, '2026-08-10', 81);

      expect((await listEntries(db, USER)).map((e) => e.weight)).toEqual([80, 81, 82]);
    });

    it('is scoped to the user', async () => {
      // Single-user until Phase 2, but user_id is on the row from day one — this asserts
      // the filter is applied rather than incidentally correct.
      await add(db, '2026-08-11', 80, { userId: 'someone-else' });
      expect(await listEntries(db, USER)).toEqual([]);
    });

    it('honours the limit', async () => {
      await add(db, '2026-08-09', 82);
      await add(db, '2026-08-10', 81);
      await add(db, '2026-08-11', 80);

      expect(await listEntries(db, USER, 2)).toHaveLength(2);
    });
  });

  describe('listEntriesAscending', () => {
    it('returns oldest first, for the chart', async () => {
      await add(db, '2026-08-11', 80);
      await add(db, '2026-08-09', 82);
      await add(db, '2026-08-10', 81);

      expect((await listEntriesAscending(db, USER)).map((e) => e.weight)).toEqual([82, 81, 80]);
    });

    it('limits to the newest N, then sorts — not the oldest N', async () => {
      // The mistake this guards: `ORDER BY recorded_at ASC LIMIT 2` returns the two oldest
      // entries, so a user with years of history would see a chart of their first two
      // weigh-ins and nothing since.
      await add(db, '2026-08-09', 82);
      await add(db, '2026-08-10', 81);
      await add(db, '2026-08-11', 80);

      expect((await listEntriesAscending(db, USER, 2)).map((e) => e.weight)).toEqual([81, 80]);
    });

    it('is scoped to the user', async () => {
      await add(db, '2026-08-11', 80, { userId: 'someone-else' });
      expect(await listEntriesAscending(db, USER)).toEqual([]);
    });

    it('feeds the trend calculation in the order it expects', async () => {
      // The seam between this file and the domain layer: dailyWeights() sorts defensively,
      // but the moving average assumes ascending input, so the contract is worth asserting
      // end to end rather than in either layer alone.
      await add(db, '2026-08-09', 82);
      await add(db, '2026-08-10', 81);
      await add(db, '2026-08-11', 80);

      const trend = movingAverage(dailyWeights(await listEntriesAscending(db, USER)), 7);
      expect(trend.map((p) => p.value)).toEqual([82, 81.5, 81]);
    });
  });

  describe('latestEntry', () => {
    it('returns the most recent weigh-in', async () => {
      await add(db, '2026-08-09', 82);
      await add(db, '2026-08-11', 80);

      expect((await latestEntry(db, USER))?.weight).toBe(80);
    });

    it('distinguishes two entries on the same day by time', async () => {
      // The quick-entry pre-fill: an evening weigh-in should suggest the evening number.
      await add(db, '2026-08-11', 80, { time: '07:00:00' });
      await add(db, '2026-08-11', 81, { time: '21:00:00' });

      expect((await latestEntry(db, USER))?.weight).toBe(81);
    });

    it('carries the unit forward so the entry screen does not silently switch', async () => {
      await add(db, '2026-08-11', 176.4, { unit: 'lb' });
      expect((await latestEntry(db, USER))?.weightUnit).toBe('lb');
    });

    it('returns null with no history', async () => {
      expect(await latestEntry(db, USER)).toBeNull();
    });
  });

  describe('deleteEntry', () => {
    it('removes just that entry', async () => {
      const first = await add(db, '2026-08-10', 81);
      await add(db, '2026-08-11', 80);

      await deleteEntry(db, first.id);

      expect(await getEntry(db, first.id)).toBeNull();
      expect(await listEntries(db, USER)).toHaveLength(1);
    });

    it('is a no-op for an id that does not exist', async () => {
      await expect(deleteEntry(db, 'nope')).resolves.toBeUndefined();
    });
  });
});

describe('preferences', () => {
  let db: TestDatabase;

  beforeEach(async () => {
    db = await createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  it('returns null for a key that was never set', async () => {
    expect(await getPreference(db, USER, 'nothing')).toBeNull();
    expect(await getGoalWeightKg(db, USER)).toBeNull();
  });

  it('round-trips a goal weight', async () => {
    await setGoalWeightKg(db, USER, 78.5);
    expect(await getGoalWeightKg(db, USER)).toBe(78.5);
  });

  it('overwrites rather than duplicating on the second set', async () => {
    // The (user_id, key) primary key plus ON CONFLICT DO UPDATE. Without the upsert this
    // would throw on the second save, which is the common case — changing a goal.
    await setGoalWeightKg(db, USER, 78);
    await setGoalWeightKg(db, USER, 76);

    expect(await getGoalWeightKg(db, USER)).toBe(76);
    const rows = await db.getAllAsync<{ key: string }>('SELECT key FROM user_preferences');
    expect(rows).toHaveLength(1);
  });

  it('scopes preferences per user', async () => {
    await setGoalWeightKg(db, USER, 78);
    await setGoalWeightKg(db, 'someone-else', 90);

    expect(await getGoalWeightKg(db, USER)).toBe(78);
    expect(await getGoalWeightKg(db, 'someone-else')).toBe(90);
  });

  it('clears a goal back to unset, which is what hides the goal line', async () => {
    await setGoalWeightKg(db, USER, 78);
    await clearGoalWeight(db, USER);

    expect(await getGoalWeightKg(db, USER)).toBeNull();
  });

  it('treats an unparseable stored value as unset rather than throwing', async () => {
    // A corrupt preference should not be able to break the screen it decorates.
    await setPreference(db, USER, 'goal_weight_kg', 'not-a-number');
    expect(await getGoalWeightKg(db, USER)).toBeNull();
  });

  it('survives a value that is legitimately zero-ish', async () => {
    // Number.parseFloat('0') is falsy; a `||` fallback would silently discard it.
    await setPreference(db, USER, 'goal_weight_kg', '0');
    expect(await getGoalWeightKg(db, USER)).toBe(0);
  });
});
