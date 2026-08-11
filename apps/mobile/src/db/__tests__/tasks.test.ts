/**
 * Query-layer tests for the tasks module, against a real in-memory SQLite database
 * (`testDb.ts`) — same harness as the workouts and weight suites.
 *
 * Beyond CRUD coverage, three things here are load-bearing: the migration test upgrades a v2
 * database that already holds workout *and* weight rows (what every existing install will do on
 * the update that ships this module), the toggle tests pin the idempotence the UNIQUE constraint
 * exists to provide, and the last block feeds real query output through the domain layer to
 * check the two agree about what "due today" means.
 */

import { LOCAL_USER_ID } from '@/constants';
import { splitByDueToday } from '@/domain/tasks';

import { createTestDb, type TestDatabase } from './testDb';
import { migrate } from '../migrations';
import { SCHEMA_VERSION } from '../schema';
import {
  clearCompletion,
  completionDatesByTask,
  createTask,
  deleteTask,
  getTask,
  listArchivedTasks,
  listCompletionDates,
  listTasks,
  setArchived,
  setCompletion,
  toggleCompletion,
} from '../tasks';

const USER = LOCAL_USER_ID;
const OTHER_USER = 'someone-else';

let idCounter = 0;

function add(
  db: TestDatabase,
  title: string,
  options: { rule?: string; created?: string; userId?: string } = {},
) {
  idCounter += 1;
  return createTask(db, {
    id: `t-${idCounter}`,
    userId: options.userId ?? USER,
    title,
    recurrenceRule: options.rule ?? 'daily',
    // Distinct default creation days, so `ORDER BY created_at` has something to order by.
    createdAt: `${options.created ?? '2026-08-01'}T08:0${idCounter % 10}:00.000Z`,
  });
}

/** Ticks off a day. The id is only ever read back by `clearCompletion`, which matches on date. */
function tick(db: TestDatabase, taskId: string, date: string) {
  idCounter += 1;
  return setCompletion(db, {
    id: `c-${idCounter}`,
    taskId,
    completedDate: date,
    completedAt: `${date}T20:00:00.000Z`,
  });
}

function toggle(db: TestDatabase, taskId: string, date: string) {
  idCounter += 1;
  return toggleCompletion(db, {
    id: `c-${idCounter}`,
    taskId,
    completedDate: date,
    completedAt: `${date}T20:00:00.000Z`,
  });
}

describe('tasks query layer', () => {
  let db: TestDatabase;

  beforeEach(async () => {
    db = await createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  describe('migration', () => {
    it('creates the task tables at the current schema version', async () => {
      const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
      expect(row?.user_version).toBe(SCHEMA_VERSION);
      expect(await listTasks(db, USER)).toEqual([]);
    });

    it('is idempotent — a second migrate() neither throws nor drops data', async () => {
      await add(db, 'Stretch');
      await migrate(db);

      expect(await listTasks(db, USER)).toHaveLength(1);
    });

    it('upgrades a v2 database in place, keeping its workout and weight data', async () => {
      // The update path for an existing install: two modules' worth of rows are already there
      // and must survive. Rewinding user_version is the only way to replay migration 3 against
      // a database that has already run it.
      await db.runAsync(
        'INSERT INTO workout_sessions (id, user_id, started_at) VALUES (?, ?, ?)',
        's1',
        USER,
        '2026-08-10T10:00:00.000Z',
      );
      await db.runAsync(
        `INSERT INTO body_weight_entries (id, user_id, recorded_at, weight, weight_unit)
         VALUES (?, ?, ?, ?, ?)`,
        'w1',
        USER,
        '2026-08-10T07:00:00.000Z',
        80.5,
        'kg',
      );
      await db.execAsync('DROP TABLE task_completions');
      await db.execAsync('DROP TABLE tasks');
      await db.execAsync('PRAGMA user_version = 2');

      await migrate(db);

      expect(
        (await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))?.user_version,
      ).toBe(SCHEMA_VERSION);

      // The new tables exist and work…
      const task = await add(db, 'Stretch');
      await tick(db, task.id, '2026-08-11');
      expect(await listCompletionDates(db, task.id)).toEqual(['2026-08-11']);

      // …and the old rows are untouched.
      const sessions = await db.getAllAsync<{ id: string }>('SELECT id FROM workout_sessions');
      expect(sessions.map((row) => row.id)).toEqual(['s1']);
      const weights = await db.getAllAsync<{ id: string }>('SELECT id FROM body_weight_entries');
      expect(weights.map((row) => row.id)).toEqual(['w1']);
    });
  });

  describe('createTask / getTask', () => {
    it('round-trips a task through storage', async () => {
      const created = await add(db, 'Stretch', { rule: 'weekdays', created: '2026-08-02' });

      expect(await getTask(db, created.id)).toEqual({
        id: created.id,
        userId: USER,
        title: 'Stretch',
        recurrenceRule: 'weekdays',
        createdAt: created.createdAt,
        archived: false,
      });
    });

    it('returns what it wrote, so the caller need not re-read', async () => {
      const created = await add(db, 'Stretch');
      expect(created).toEqual(await getTask(db, created.id));
    });

    it('returns null for an unknown id', async () => {
      expect(await getTask(db, 'nope')).toBeNull();
    });

    it('rejects a duplicate id rather than overwriting', async () => {
      await createTask(db, {
        id: 'dupe',
        userId: USER,
        title: 'First',
        recurrenceRule: 'daily',
        createdAt: '2026-08-01T08:00:00.000Z',
      });

      await expect(
        createTask(db, {
          id: 'dupe',
          userId: USER,
          title: 'Second',
          recurrenceRule: 'daily',
          createdAt: '2026-08-02T08:00:00.000Z',
        }),
      ).rejects.toThrow();
    });
  });

  describe('listTasks', () => {
    it('returns tasks oldest first', async () => {
      const second = await add(db, 'Second', { created: '2026-08-05' });
      const first = await add(db, 'First', { created: '2026-08-01' });

      expect((await listTasks(db, USER)).map((task) => task.id)).toEqual([first.id, second.id]);
    });

    it('hides archived tasks by default', async () => {
      const active = await add(db, 'Active');
      const archived = await add(db, 'Archived');
      await setArchived(db, archived.id, true);

      expect((await listTasks(db, USER)).map((task) => task.id)).toEqual([active.id]);
      expect((await listTasks(db, USER, true)).map((task) => task.id)).toEqual([
        active.id,
        archived.id,
      ]);
    });

    it('is scoped to one user', async () => {
      // Single-user app today, but every row carries user_id from day one and the queries have
      // to honour it, or Phase 2 sync arrives to find the filters missing.
      const mine = await add(db, 'Mine');
      await add(db, 'Theirs', { userId: OTHER_USER });

      expect((await listTasks(db, USER)).map((task) => task.id)).toEqual([mine.id]);
    });
  });

  describe('setArchived / listArchivedTasks', () => {
    it('moves a task out of the active list and back', async () => {
      const task = await add(db, 'Journal');

      await setArchived(db, task.id, true);
      expect(await listTasks(db, USER)).toEqual([]);
      expect((await listArchivedTasks(db, USER)).map((row) => row.id)).toEqual([task.id]);
      expect((await getTask(db, task.id))?.archived).toBe(true);

      await setArchived(db, task.id, false);
      expect((await listTasks(db, USER)).map((row) => row.id)).toEqual([task.id]);
      expect(await listArchivedTasks(db, USER)).toEqual([]);
    });

    it('keeps completions and the creation day, so a restored task keeps its streak', async () => {
      const task = await add(db, 'Journal');
      await tick(db, task.id, '2026-08-10');
      await tick(db, task.id, '2026-08-11');

      await setArchived(db, task.id, true);
      await setArchived(db, task.id, false);

      expect(await listCompletionDates(db, task.id)).toEqual(['2026-08-10', '2026-08-11']);
      expect((await getTask(db, task.id))?.createdAt).toBe(task.createdAt);
    });
  });

  describe('deleteTask', () => {
    it('takes the task completions with it', async () => {
      // Asserts the ON DELETE CASCADE in the DDL. Note `node:sqlite` enables foreign keys by
      // default, so this does not also prove `migrate()`'s `PRAGMA foreign_keys = ON` — that
      // pragma is what makes the cascade fire on a real device, where SQLite defaults it off.
      const task = await add(db, 'Stretch');
      await tick(db, task.id, '2026-08-10');
      await tick(db, task.id, '2026-08-11');

      await deleteTask(db, task.id);

      expect(await getTask(db, task.id)).toBeNull();
      const left = await db.getAllAsync<{ id: string }>('SELECT id FROM task_completions');
      expect(left).toEqual([]);
    });

    it('leaves other tasks alone', async () => {
      const gone = await add(db, 'Gone');
      const kept = await add(db, 'Kept');
      await tick(db, kept.id, '2026-08-11');

      await deleteTask(db, gone.id);

      expect((await listTasks(db, USER)).map((task) => task.id)).toEqual([kept.id]);
      expect(await listCompletionDates(db, kept.id)).toEqual(['2026-08-11']);
    });
  });

  describe('setCompletion', () => {
    it('is idempotent — a double-tap cannot log the same day twice', async () => {
      // The whole reason for the UNIQUE constraint. Two rows here would show as a streak of two
      // for one day's work.
      const task = await add(db, 'Stretch');
      await tick(db, task.id, '2026-08-11');
      await tick(db, task.id, '2026-08-11');

      expect(await listCompletionDates(db, task.id)).toEqual(['2026-08-11']);
    });

    it('keeps the first completion time when a day is re-ticked', async () => {
      const task = await add(db, 'Stretch');
      await setCompletion(db, {
        id: 'c-first',
        taskId: task.id,
        completedDate: '2026-08-11',
        completedAt: '2026-08-11T07:00:00.000Z',
      });
      await setCompletion(db, {
        id: 'c-second',
        taskId: task.id,
        completedDate: '2026-08-11',
        completedAt: '2026-08-11T21:00:00.000Z',
      });

      const row = await db.getFirstAsync<{ id: string; completed_at: string }>(
        'SELECT id, completed_at FROM task_completions WHERE task_id = ?',
        task.id,
      );
      expect(row).toEqual({ id: 'c-first', completed_at: '2026-08-11T07:00:00.000Z' });
    });

    it('refuses a completion for a task that does not exist', async () => {
      // The foreign key doing its job: an orphaned completion would come back to life under a
      // recycled task id.
      await expect(tick(db, 'nope', '2026-08-11')).rejects.toThrow();
    });

    it('records each day separately', async () => {
      const task = await add(db, 'Stretch');
      await tick(db, task.id, '2026-08-09');
      await tick(db, task.id, '2026-08-11');
      await tick(db, task.id, '2026-08-10');

      expect(await listCompletionDates(db, task.id)).toEqual([
        '2026-08-09',
        '2026-08-10',
        '2026-08-11',
      ]);
    });

    it('lets two tasks share a day', async () => {
      const first = await add(db, 'First');
      const second = await add(db, 'Second');
      await tick(db, first.id, '2026-08-11');
      await tick(db, second.id, '2026-08-11');

      expect(await listCompletionDates(db, first.id)).toEqual(['2026-08-11']);
      expect(await listCompletionDates(db, second.id)).toEqual(['2026-08-11']);
    });
  });

  describe('clearCompletion', () => {
    it('removes only the day asked for', async () => {
      const task = await add(db, 'Stretch');
      await tick(db, task.id, '2026-08-10');
      await tick(db, task.id, '2026-08-11');

      expect(await clearCompletion(db, task.id, '2026-08-11')).toBe(true);
      expect(await listCompletionDates(db, task.id)).toEqual(['2026-08-10']);
    });

    it('reports false when there was nothing to remove', async () => {
      const task = await add(db, 'Stretch');
      expect(await clearCompletion(db, task.id, '2026-08-11')).toBe(false);
    });
  });

  describe('toggleCompletion', () => {
    it('flips a day and reports the state it landed in', async () => {
      const task = await add(db, 'Stretch');

      expect(await toggle(db, task.id, '2026-08-11')).toBe(true);
      expect(await listCompletionDates(db, task.id)).toEqual(['2026-08-11']);

      expect(await toggle(db, task.id, '2026-08-11')).toBe(false);
      expect(await listCompletionDates(db, task.id)).toEqual([]);

      expect(await toggle(db, task.id, '2026-08-11')).toBe(true);
      expect(await listCompletionDates(db, task.id)).toEqual(['2026-08-11']);
    });

    it('treats each day independently', async () => {
      const task = await add(db, 'Stretch');
      await tick(db, task.id, '2026-08-10');

      expect(await toggle(db, task.id, '2026-08-11')).toBe(true);
      expect(await listCompletionDates(db, task.id)).toEqual(['2026-08-10', '2026-08-11']);
    });

    it('treats each task independently', async () => {
      const first = await add(db, 'First');
      const second = await add(db, 'Second');
      await tick(db, first.id, '2026-08-11');

      expect(await toggle(db, second.id, '2026-08-11')).toBe(true);
      expect(await listCompletionDates(db, first.id)).toEqual(['2026-08-11']);
    });
  });

  describe('completionDatesByTask', () => {
    it('groups the dates of every task in one read', async () => {
      const stretch = await add(db, 'Stretch');
      const gym = await add(db, 'Gym');
      await tick(db, stretch.id, '2026-08-10');
      await tick(db, stretch.id, '2026-08-11');
      await tick(db, gym.id, '2026-08-11');

      const byTask = await completionDatesByTask(db, USER);

      expect(byTask.get(stretch.id)).toEqual(['2026-08-10', '2026-08-11']);
      expect(byTask.get(gym.id)).toEqual(['2026-08-11']);
    });

    it('omits a task with no completions rather than mapping it to an empty array', async () => {
      // `splitByDueToday` reads this with `?? []`, so absence and emptiness mean the same thing
      // downstream; this pins which one the query actually produces.
      const task = await add(db, 'Stretch');
      expect((await completionDatesByTask(db, USER)).has(task.id)).toBe(false);
    });

    it('is scoped to one user', async () => {
      const mine = await add(db, 'Mine');
      const theirs = await add(db, 'Theirs', { userId: OTHER_USER });
      await tick(db, mine.id, '2026-08-11');
      await tick(db, theirs.id, '2026-08-11');

      const byTask = await completionDatesByTask(db, USER);

      expect([...byTask.keys()]).toEqual([mine.id]);
    });

    it('includes the history of an archived task', async () => {
      // The archived section shows what the habit was; hiding the dates here would make a
      // restored task look brand new.
      const task = await add(db, 'Journal');
      await tick(db, task.id, '2026-08-11');
      await setArchived(db, task.id, true);

      expect((await completionDatesByTask(db, USER)).get(task.id)).toEqual(['2026-08-11']);
    });
  });

  describe('feeding the domain layer', () => {
    it('produces a Today list that matches what was stored', async () => {
      // The seam between the two layers: real rows in, real ordering out. If the query and the
      // streak walk ever disagreed about a task's schedule or history, it would show here
      // rather than on a phone.
      const now = Date.parse('2026-08-11T09:00:00.000Z'); // Tuesday

      const stretch = await add(db, 'Stretch', { rule: 'daily', created: '2026-08-01' });
      const gym = await add(db, 'Gym', { rule: 'weekdays', created: '2026-08-01' });
      await add(db, 'Long run', { rule: 'weekends', created: '2026-08-01' });
      const journal = await add(db, 'Journal', { rule: 'daily', created: '2026-08-01' });
      await setArchived(db, journal.id, true);

      await tick(db, stretch.id, '2026-08-09');
      await tick(db, stretch.id, '2026-08-10');
      await tick(db, gym.id, '2026-08-10');
      await tick(db, gym.id, '2026-08-11');
      await tick(db, journal.id, '2026-08-11');

      const { due, notToday } = splitByDueToday(
        await listTasks(db, USER),
        await completionDatesByTask(db, USER),
        now,
      );

      // Stretch is unfinished so it leads, even though Gym's streak is the same length.
      expect(due.map((entry) => entry.task.title)).toEqual(['Stretch', 'Gym']);
      expect(due[0].streak).toMatchObject({ current: 2, doneToday: false, atRisk: true });
      expect(due[1].streak).toMatchObject({ current: 2, doneToday: true, atRisk: false });

      // Weekends-only on a Tuesday.
      expect(notToday.map((entry) => entry.task.title)).toEqual(['Long run']);

      // Archived, so it is not on either list despite being ticked today.
      expect([...due, ...notToday].map((entry) => entry.task.id)).not.toContain(journal.id);
    });
  });
});
