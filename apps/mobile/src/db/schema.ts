/**
 * Local SQLite schema.
 *
 * Mirrors the Postgres shape in `docs/02-data-model.md` so rows sync without
 * translation once Phase 2 arrives. UUID primary keys are TEXT and timestamps are
 * ISO-8601 TEXT — SQLite has no native type for either, and ISO-8601 sorts
 * lexicographically, so ORDER BY on a timestamp column still does the right thing.
 */

/** Bumped whenever a migration is appended in `migrations.ts`. */
export const SCHEMA_VERSION = 1;

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
