/**
 * Local SQLite schema.
 *
 * Mirrors the Postgres shape in `docs/02-data-model.md` so rows sync without
 * translation once Phase 2 arrives. UUID primary keys are TEXT and timestamps are
 * ISO-8601 TEXT — SQLite has no native type for either, and ISO-8601 sorts
 * lexicographically, so ORDER BY on a timestamp column still does the right thing.
 */

/** Bumped whenever a migration is appended in `migrations.ts`. */
export const SCHEMA_VERSION = 2;

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
