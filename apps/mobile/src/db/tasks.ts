/**
 * Typed queries for the tasks module, following `src/db/weight.ts`: the only place that knows
 * the storage representation, with the `SQLiteDatabase` passed in rather than imported so the
 * functions stay testable.
 *
 * No store, for the same reason the weight module has none — a completion is one idempotent
 * row with no in-flight state, so nothing can be left half-entered by a force-kill.
 *
 * The one shape worth calling out is `completionDatesByTask`: streaks are derived, not stored
 * (see `CREATE_TASK_COMPLETIONS` in `schema.ts`), so the Today list needs each task's history,
 * and asking per task would be an N+1 query on the hot path.
 */

import type { SQLiteDatabase } from 'expo-sqlite';

import { enqueue, type TaskCompletionWire, type TaskWire } from './outbox';
import { Task, TaskRow, toTask } from './types';

/**
 * A user's tasks, oldest first.
 *
 * Creation order rather than title so the list is stable; `splitByDueToday` in the domain layer
 * does the real sorting and relies on this for its tiebreak.
 */
export async function listTasks(
  db: SQLiteDatabase,
  userId: string,
  includeArchived = false,
): Promise<Task[]> {
  const rows = await db.getAllAsync<TaskRow>(
    `SELECT * FROM tasks
     WHERE user_id = ?
       AND (archived = 0 OR ? = 1)
     ORDER BY created_at ASC`,
    userId,
    includeArchived ? 1 : 0,
  );
  return rows.map(toTask);
}

/** Archived tasks only — the "put away, not deleted" section. */
export async function listArchivedTasks(db: SQLiteDatabase, userId: string): Promise<Task[]> {
  const rows = await db.getAllAsync<TaskRow>(
    `SELECT * FROM tasks
     WHERE user_id = ? AND archived = 1
     ORDER BY created_at ASC`,
    userId,
  );
  return rows.map(toTask);
}

export async function getTask(db: SQLiteDatabase, taskId: string): Promise<Task | null> {
  const row = await db.getFirstAsync<TaskRow>('SELECT * FROM tasks WHERE id = ?', taskId);
  return row ? toTask(row) : null;
}

export async function createTask(
  db: SQLiteDatabase,
  task: {
    id: string;
    userId: string;
    title: string;
    recurrenceRule: string;
    createdAt: string;
  },
): Promise<Task> {
  const wire: TaskWire = {
    id: task.id,
    title: task.title,
    recurrence_rule: task.recurrenceRule,
    created_at: task.createdAt,
    archived: false,
  };
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync(
      `INSERT INTO tasks (id, user_id, title, recurrence_rule, created_at, archived)
       VALUES (?, ?, ?, ?, ?, 0)`,
      task.id,
      task.userId,
      task.title,
      task.recurrenceRule,
      task.createdAt,
    );
    await enqueue(tx, {
      userId: task.userId,
      entityType: 'task',
      entityId: task.id,
      operation: 'upsert',
      payload: wire,
    });
  });
  return { ...task, archived: false };
}

/**
 * Archives or restores a task.
 *
 * The gentle alternative to deletion: a habit you have stopped doing should be able to leave
 * the Today list without taking its history with it. `created_at` is untouched, so restoring
 * a task restores its streak too — the anchor the domain layer counts from is unchanged.
 */
export async function setArchived(
  db: SQLiteDatabase,
  taskId: string,
  archived: boolean,
): Promise<void> {
  const task = await getTask(db, taskId);
  if (!task) return;
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync('UPDATE tasks SET archived = ? WHERE id = ?', archived ? 1 : 0, taskId);
    await enqueue(tx, {
      userId: task.userId,
      entityType: 'task',
      entityId: taskId,
      operation: 'update',
      payload: { archived },
    });
  });
}

/**
 * Deletes a task and, by cascade, its completions.
 *
 * The cascade needs `PRAGMA foreign_keys = ON`, which `migrate()` sets on every connection —
 * SQLite defaults it *off* and would otherwise leave the completion rows orphaned, where they
 * would come back to life under a recycled task id.
 */
export async function deleteTask(db: SQLiteDatabase, taskId: string): Promise<void> {
  const task = await getTask(db, taskId);
  if (!task) return;
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync('DELETE FROM tasks WHERE id = ?', taskId);
    await enqueue(tx, {
      userId: task.userId,
      entityType: 'task',
      entityId: taskId,
      operation: 'delete',
      payload: null,
    });
  });
}

/**
 * Marks a task done for a day. Idempotent, courtesy of the UNIQUE constraint — a double-tap
 * cannot log the same day twice and inflate a streak.
 */
export async function setCompletion(
  db: SQLiteDatabase,
  completion: {
    id: string;
    taskId: string;
    completedDate: string;
    completedAt: string;
  },
): Promise<void> {
  const task = await getTask(db, completion.taskId);
  if (!task) throw new Error(`Task not found: ${completion.taskId}`);
  const wire: TaskCompletionWire = {
    id: completion.id,
    task_id: completion.taskId,
    completed_date: completion.completedDate,
    completed_at: completion.completedAt,
  };
  await db.withExclusiveTransactionAsync(async (tx) => {
    const result = await tx.runAsync(
      `INSERT OR IGNORE INTO task_completions (id, task_id, completed_date, completed_at)
       VALUES (?, ?, ?, ?)`,
      completion.id,
      completion.taskId,
      completion.completedDate,
      completion.completedAt,
    );
    if (result.changes === 0) return;
    await enqueue(tx, {
      userId: task.userId,
      entityType: 'task_completion',
      entityId: completion.id,
      operation: 'upsert',
      payload: wire,
    });
  });
}

/** Un-ticks a day. Returns whether there was anything to remove. */
export async function clearCompletion(
  db: SQLiteDatabase,
  taskId: string,
  completedDate: string,
): Promise<boolean> {
  const task = await getTask(db, taskId);
  if (!task) return false;
  let removed = false;
  await db.withExclusiveTransactionAsync(async (tx) => {
    const result = await tx.runAsync(
      'DELETE FROM task_completions WHERE task_id = ? AND completed_date = ?',
      taskId,
      completedDate,
    );
    removed = result.changes > 0;
    if (!removed) return;
    await enqueue(tx, {
      userId: task.userId,
      entityType: 'task_completion',
      entityId: `${taskId}:${completedDate}`,
      operation: 'delete',
      payload: { task_id: taskId, completed_date: completedDate },
    });
  });
  return removed;
}

/**
 * Flips a day's completion and reports the state it landed in — what the checkbox calls.
 *
 * Deletes first and branches on the row count rather than reading the row and then deciding:
 * the DELETE *is* the read, so there is no window between the two in which a second tap can
 * act on a stale answer.
 */
export async function toggleCompletion(
  db: SQLiteDatabase,
  completion: {
    id: string;
    taskId: string;
    completedDate: string;
    completedAt: string;
  },
): Promise<boolean> {
  if (await clearCompletion(db, completion.taskId, completion.completedDate)) return false;
  await setCompletion(db, completion);
  return true;
}

/** One task's completion days, oldest first — the streak view's input. */
export async function listCompletionDates(db: SQLiteDatabase, taskId: string): Promise<string[]> {
  const rows = await db.getAllAsync<{ completed_date: string }>(
    `SELECT completed_date FROM task_completions
     WHERE task_id = ?
     ORDER BY completed_date ASC`,
    taskId,
  );
  return rows.map((row) => row.completed_date);
}

/**
 * Every task's completion days for one user, keyed by task id — one query for the whole Today
 * list rather than one per row.
 *
 * Deliberately unbounded, unlike `listEntries` in the weight module. The table holds at most one
 * row per task per day, so a decade of twenty habits is a few tens of thousands of ten-byte
 * dates: cheap to read locally, and exact. A LIMIT here would be worse than slow — it would
 * spend the whole budget on whichever task sorted first and report the rest as streakless,
 * which looks exactly like lost data. If this ever does need bounding, bound it by *date*
 * (`completed_date >= ?`), which truncates every task's history evenly and visibly.
 */
export async function completionDatesByTask(
  db: SQLiteDatabase,
  userId: string,
): Promise<Map<string, string[]>> {
  const rows = await db.getAllAsync<{ task_id: string; completed_date: string }>(
    `SELECT c.task_id, c.completed_date
     FROM task_completions c
     JOIN tasks t ON t.id = c.task_id
     WHERE t.user_id = ?
     ORDER BY c.completed_date ASC`,
    userId,
  );

  const byTask = new Map<string, string[]>();
  for (const row of rows) {
    const dates = byTask.get(row.task_id);
    if (dates) dates.push(row.completed_date);
    else byTask.set(row.task_id, [row.completed_date]);
  }
  return byTask;
}
