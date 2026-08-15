/**
 * Local SQLite schema.
 *
 * Mirrors the Postgres shape in `docs/02-data-model.md` so rows sync without
 * translation once Phase 2 arrives. UUID primary keys are TEXT and timestamps are
 * ISO-8601 TEXT — SQLite has no native type for either, and ISO-8601 sorts
 * lexicographically, so ORDER BY on a timestamp column still does the right thing.
 */

/** Bumped whenever a migration is appended in `migrations.ts`. */
export const SCHEMA_VERSION = 5;

export const CREATE_EXERCISES = `
CREATE TABLE IF NOT EXISTS exercises (
  id           TEXT PRIMARY KEY NOT NULL,
  name         TEXT NOT NULL,
  muscle_group TEXT,
  equipment    TEXT,
  is_custom    INTEGER NOT NULL DEFAULT 0
);`;

export const CREATE_WORKOUT_SESSIONS = `
CREATE TABLE IF NOT EXISTS workout_sessions (
  id         TEXT PRIMARY KEY NOT NULL,
  user_id    TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at   TEXT,
  notes      TEXT
);`;

export const CREATE_WORKOUT_SETS = `
CREATE TABLE IF NOT EXISTS workout_sets (
  id           TEXT PRIMARY KEY NOT NULL,
  session_id   TEXT NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
  exercise_id  TEXT NOT NULL REFERENCES exercises(id),
  set_number   INTEGER NOT NULL,
  reps         INTEGER NOT NULL,
  weight       REAL NOT NULL,
  weight_unit  TEXT NOT NULL DEFAULT 'kg',
  rpe          REAL,
  rest_seconds INTEGER
);`;

export const CREATE_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_sets_session  ON workout_sets(session_id);
CREATE INDEX IF NOT EXISTS idx_sets_exercise ON workout_sets(exercise_id);
CREATE INDEX IF NOT EXISTS idx_sessions_started ON workout_sessions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_exercises_name ON exercises(name);`;

/* -------------------------------------------------------------------------- */
/* Migration 2 — weight & progress                                            */
/* -------------------------------------------------------------------------- */

export const CREATE_BODY_WEIGHT_ENTRIES = `
CREATE TABLE IF NOT EXISTS body_weight_entries (
  id          TEXT PRIMARY KEY NOT NULL,
  user_id     TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  weight      REAL NOT NULL,
  weight_unit TEXT NOT NULL DEFAULT 'kg',
  note        TEXT
);`;

/**
 * Key-value mirror of `User.preferences` (the JSON column in `02-data-model.md`).
 *
 * A table rather than a JSON blob because SQLite has no partial-JSON update: rewriting the
 * whole document to change one key invites lost updates, and Phase 2 sync would have to
 * merge two blobs instead of two rows. First use is the weight module's goal weight; the
 * lb/kg preference `04-feature-specs.md` leaves open belongs here too.
 */
export const CREATE_USER_PREFERENCES = `
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id TEXT NOT NULL,
  key     TEXT NOT NULL,
  value   TEXT NOT NULL,
  PRIMARY KEY (user_id, key)
);`;

/** Covers the trend query, which is always "this user, newest N days". */
export const CREATE_WEIGHT_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_weight_user_recorded
  ON body_weight_entries(user_id, recorded_at DESC);`;

/* -------------------------------------------------------------------------- */
/* Migration 3 — daily tasks & streaks                                        */
/* -------------------------------------------------------------------------- */

/**
 * `recurrence_rule` is a compact string parsed by `src/domain/tasks.ts` — `daily`,
 * `weekdays`, `weekends`, `weekly:1,3,5`, `interval:3`.
 *
 * `02-data-model.md` suggests "daily/weekdays/custom RRULE". A full RRULE parser is a
 * dependency and a large surface for a habit list whose realistic vocabulary is those five
 * shapes, so the string stays hand-rolled and the *parser* is the contract. It is stored as
 * text rather than normalised into columns because Phase 2 sync then moves one opaque value
 * instead of reconciling a set of flags.
 */
export const CREATE_TASKS = `
CREATE TABLE IF NOT EXISTS tasks (
  id              TEXT PRIMARY KEY NOT NULL,
  user_id         TEXT NOT NULL,
  title           TEXT NOT NULL,
  recurrence_rule TEXT NOT NULL DEFAULT 'daily',
  created_at      TEXT NOT NULL,
  archived        INTEGER NOT NULL DEFAULT 0
);`;

/**
 * One row per task per day it was completed.
 *
 * `completed_date` is the local calendar day (`YYYY-MM-DD`, from `dayKeyFromDate`) and
 * `completed_at` the instant — the same split as `body_weight_entries`, for the same reason:
 * the day is what the streak counts, the instant is worth keeping.
 *
 * The UNIQUE constraint is the point of the table. A habit is either done today or it is not,
 * so a double-tap must not be able to log it twice and inflate a count — `setCompletion` can
 * then be a plain INSERT OR IGNORE and the toggle is idempotent, which also means Phase 2
 * sync replaying an event is harmless.
 *
 * No materialised `Streak` table, though `02-data-model.md` floats one. Streaks are derived in
 * `src/domain/tasks.ts` from these rows: for one user with tens of tasks the walk is trivial,
 * and a stored counter is a second source of truth that drifts the moment a completion is
 * deleted or arrives out of order over sync.
 */
export const CREATE_TASK_COMPLETIONS = `
CREATE TABLE IF NOT EXISTS task_completions (
  id             TEXT PRIMARY KEY NOT NULL,
  task_id        TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  completed_date TEXT NOT NULL,
  completed_at   TEXT NOT NULL,
  UNIQUE (task_id, completed_date)
);`;

/**
 * The Today list filters on `(user_id, archived)`; the streak walk reads one task's dates
 * newest-first. The UNIQUE constraint above already indexes `(task_id, completed_date)`
 * ascending, so this index exists for the descending scan.
 */
export const CREATE_TASK_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_tasks_user_archived ON tasks(user_id, archived);
CREATE INDEX IF NOT EXISTS idx_completions_task_date
  ON task_completions(task_id, completed_date DESC);
CREATE INDEX IF NOT EXISTS idx_completions_date ON task_completions(completed_date);`;

/* -------------------------------------------------------------------------- */
/* Migration 4 — macro / nutrition tracking                                   */
/* -------------------------------------------------------------------------- */

/**
 * A small personal food library rather than a licensed third-party catalogue.
 *
 * Nutrition values are per `serving_label` ("100 g", "1 scoop", "1 bowl", …), and an
 * entry's quantity is a multiplier of that serving. Foods are user-owned from day one so
 * Phase 2 sync cannot leak one account's custom foods into another account's search.
 */
export const CREATE_FOOD_ITEMS = `
CREATE TABLE IF NOT EXISTS food_items (
  id                   TEXT PRIMARY KEY NOT NULL,
  user_id              TEXT NOT NULL,
  name                 TEXT NOT NULL,
  calories_per_serving REAL NOT NULL CHECK (calories_per_serving >= 0),
  protein_g            REAL NOT NULL CHECK (protein_g >= 0),
  carbs_g              REAL NOT NULL CHECK (carbs_g >= 0),
  fat_g                REAL NOT NULL CHECK (fat_g >= 0),
  serving_label        TEXT NOT NULL,
  created_at           TEXT NOT NULL
);`;

/**
 * One consumed food on one local calendar day.
 *
 * `logged_date` is stored separately from `logged_at` for the same reason task completions
 * keep both: the date is what the day log queries, while the instant remains useful. The
 * food row is retained as the nutrition definition; v1 deliberately offers entry deletion
 * but no destructive food-library action, so history cannot become orphaned.
 */
export const CREATE_NUTRITION_ENTRIES = `
CREATE TABLE IF NOT EXISTS nutrition_entries (
  id           TEXT PRIMARY KEY NOT NULL,
  user_id      TEXT NOT NULL,
  food_item_id TEXT NOT NULL REFERENCES food_items(id),
  logged_at    TEXT NOT NULL,
  logged_date  TEXT NOT NULL,
  quantity     REAL NOT NULL CHECK (quantity > 0),
  meal_type    TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack'))
);`;

/**
 * Targets are effective-dated, not overwritten in place. A target change next month must
 * not rewrite the meaning of last month's progress bars. One row per effective day makes a
 * repeated save an update rather than a duplicate target competing in the same query.
 */
export const CREATE_MACRO_TARGETS = `
CREATE TABLE IF NOT EXISTS macro_targets (
  id             TEXT PRIMARY KEY NOT NULL,
  user_id        TEXT NOT NULL,
  calories       REAL NOT NULL CHECK (calories >= 0),
  protein_g      REAL NOT NULL CHECK (protein_g >= 0),
  carbs_g        REAL NOT NULL CHECK (carbs_g >= 0),
  fat_g          REAL NOT NULL CHECK (fat_g >= 0),
  effective_date TEXT NOT NULL,
  created_at     TEXT NOT NULL,
  UNIQUE (user_id, effective_date)
);`;

export const CREATE_NUTRITION_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_food_user_name
  ON food_items(user_id, name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_nutrition_user_date_meal
  ON nutrition_entries(user_id, logged_date, meal_type, logged_at);
CREATE INDEX IF NOT EXISTS idx_nutrition_food ON nutrition_entries(food_item_id);
CREATE INDEX IF NOT EXISTS idx_targets_user_effective
  ON macro_targets(user_id, effective_date DESC);`;

/* -------------------------------------------------------------------------- */
/* Migration 5 — local sync outbox                                             */
/* -------------------------------------------------------------------------- */

/**
 * Durable intent log for offline-first writes.
 *
 * Rows are replayed in integer-id order so dependent operations retain their local order.
 * `next_attempt_at = NULL` marks a terminal server rejection that needs inspection rather
 * than an automatic retry loop. Payloads are JSON because each entity owns its wire shape.
 */
export const CREATE_SYNC_OUTBOX = `
CREATE TABLE IF NOT EXISTS sync_outbox (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         TEXT NOT NULL,
  entity_type     TEXT NOT NULL,
  entity_id       TEXT NOT NULL,
  operation       TEXT NOT NULL,
  payload         TEXT,
  created_at      TEXT NOT NULL,
  attempts        INTEGER NOT NULL DEFAULT 0,
  last_error      TEXT,
  next_attempt_at TEXT
);`;

export const CREATE_SYNC_OUTBOX_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_sync_outbox_due
  ON sync_outbox(next_attempt_at, id);
CREATE INDEX IF NOT EXISTS idx_sync_outbox_entity
  ON sync_outbox(entity_type, entity_id, id);`;
