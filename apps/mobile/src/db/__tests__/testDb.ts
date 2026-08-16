/**
 * In-memory SQLite for the query-layer and store tests.
 *
 * `expo-sqlite` is a native module with no Node implementation, so it cannot run under
 * jest. Node 22 ships `node:sqlite`, which is the same SQLite engine — so instead of
 * mocking the database (which would only prove the mock agrees with itself), this adapts
 * `node:sqlite` to the slice of the `SQLiteDatabase` surface `src/db/*` and the store
 * actually call. The SQL is executed for real: a join that doesn't work, or an aggregate
 * SQLite rejects, fails the test.
 *
 * The mirror image of `apps/backend/tests/conftest.py`, which does the same thing for the
 * backend with an in-memory SQLite engine behind SQLModel.
 *
 * Only the methods the production code uses are implemented; the cast to `SQLiteDatabase`
 * is the seam. If a query starts using another method, the cast keeps compiling but the
 * call fails loudly at runtime with an undefined method rather than passing silently.
 */

import { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';

import { migrate } from '../migrations';

/** What `node:sqlite` accepts for a bound parameter. */
type BindValue = string | number | bigint | null | Uint8Array;

/**
 * Callers bind either variadically (`run(sql, a, b)`) or with a single named object
 * (`run(sql, { $id: 'x' })`) — both forms appear in `src/db/`. `node:sqlite` takes named
 * parameters as one object argument and positional ones spread, so the two are told apart
 * here rather than at every call site.
 */
function normaliseParams(params: unknown[]): BindValue[] | [Record<string, BindValue>] {
  if (params.length === 1 && isNamedParams(params[0])) {
    return [params[0] as Record<string, BindValue>];
  }
  return params as BindValue[];
}

function isNamedParams(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && !(value instanceof Uint8Array);
}

/**
 * `node:sqlite` returns rows with a null prototype, which reads fine but makes jest's
 * `toEqual` diffs noisy and `toMatchObject` unreliable. Copying into plain objects keeps
 * assertion failures readable.
 */
function plain<T>(row: unknown): T {
  return { ...(row as object) } as T;
}

export type TestDatabase = SQLiteDatabase & { close: () => void };

/**
 * A migrated, seeded in-memory database — the same state a fresh install reaches on first
 * launch, since `migrate()` is what `app/_layout.tsx` runs from `SQLiteProvider`'s
 * `onInit`. Each test gets its own, so there is no cross-test leakage and no cleanup step.
 */
export async function createTestDb(): Promise<TestDatabase> {
  const sqlite = new DatabaseSync(':memory:');
  const db = adapt(sqlite);
  await migrate(db);
  return db;
}

function adapt(sqlite: DatabaseSync): TestDatabase {
  const adapter = {
    async execAsync(source: string): Promise<void> {
      sqlite.exec(source);
    },

    async runAsync(source: string, ...params: unknown[]) {
      const result = sqlite.prepare(source).run(...(normaliseParams(params) as BindValue[]));
      return {
        lastInsertRowId: Number(result.lastInsertRowid),
        changes: Number(result.changes),
      };
    },

    async getAllAsync<T>(source: string, ...params: unknown[]): Promise<T[]> {
      const rows = sqlite.prepare(source).all(...(normaliseParams(params) as BindValue[]));
      return rows.map((row) => plain<T>(row));
    },

    async getFirstAsync<T>(source: string, ...params: unknown[]): Promise<T | null> {
      const row = sqlite.prepare(source).get(...(normaliseParams(params) as BindValue[]));
      // expo-sqlite resolves null for no rows; node:sqlite returns undefined. The
      // production code branches on falsiness, but `toBeNull()` assertions want the
      // expo behaviour exactly.
      return row === undefined ? null : plain<T>(row);
    },

    /**
     * `seedExercises()` prepares once and executes per row. The statement object only
     * needs `executeAsync`/`finalizeAsync`; nothing reads the result rows back.
     */
    async prepareAsync(source: string) {
      const statement = sqlite.prepare(source);
      return {
        async executeAsync(...params: unknown[]) {
          statement.run(...(normaliseParams(params) as BindValue[]));
          return { async getAllAsync() { return []; } };
        },
        async finalizeAsync() {},
      };
    },

    async withExclusiveTransactionAsync(task: (tx: SQLiteDatabase) => Promise<void>) {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        await task(adapter as unknown as SQLiteDatabase);
        sqlite.exec('COMMIT');
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },

    close() {
      sqlite.close();
    },
  };

  return adapter as unknown as TestDatabase;
}
