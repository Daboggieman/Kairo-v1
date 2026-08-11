# Continue with

Handoff for the Kairo v1 Phase 0 + Workouts + Weight sessions. Read before continuing.

## Status

Phase 0 (monorepo scaffold) and the first two Phase 1 modules — workout logging and
weight/progress charts — are **implemented and verified**. This file records where things
stand so a future session can resume without re-deriving it.

**Unpushed**: everything through `e9ec208` (SQLite-backed tests + the `listSessions()`
fixes) is on `origin/master`. The weight module and this doc are committed locally only —
the credential helper has no usable credentials in this environment, so
`git push origin master` fails with *"could not read Username for 'https://github.com'"*.
Run it interactively. Check the real state with `git log --oneline origin/master..HEAD`
rather than trusting this paragraph. Git identity was set **repo-locally** on purpose, not
`--global`.

The next module by roadmap order (`docs/06-roadmap.md`) is **daily tasks & streaks**, then
macro tracking.

## What is done and verified

### Backend — green
`apps/backend/`, FastAPI + SQLModel + Alembic. Portability decision from this session:
models use portable SQLAlchemy types so everything runs on SQLite locally, with Postgres
as the deployment target (no Docker/Postgres was available on the dev machine).

- Migration `c7080c2dd1c6` applied against SQLite; tables confirmed via sqlite3:
  `alembic_version, exercises, users, workout_sessions, workout_sets`.
- `pytest` → **6 passed** (health + workout lifecycle, in-memory SQLite via `StaticPool`).
- `ruff check .` → **All checks passed!** (select E, F, I, UP, B; B008
  `Depends`/`Query` exempted via `extend-immutable-calls`).
- `POST /workouts/{id}/sets` accepts an array (offline bulk sync); router carries a
  `TODO(phase-2)` noting the endpoints are unauthenticated by design until then.
- `alembic/env.py` reads `DATABASE_URL` from `app.core.config` (single source of truth).

### Mobile — implemented, verified as far as possible
`apps/mobile/`, Expo SDK 57 + Expo Router (file-based) + expo-sqlite + Zustand.

- `npx expo-doctor` → **20/20 checks passed**.
- `npx tsc --noEmit` → **0 errors** (tsconfig has `"types": ["jest", "node", "react"]`
  pinned so jest globals resolve without importing them in tests).
- `npx eslint .` → **clean** (flat config, `eslint-config-expo/flat`).
- `npm test` → **163 passed** across 6 suites (workouts domain/db/store, weight domain/db,
  chart geometry).
- `npx expo export --platform android` → **bundled successfully** — every import resolves
  and the router tree is valid end-to-end. Checked the emitted `.hbc` for `node:sqlite` to
  confirm the test harness has not leaked into the app graph. Output deleted afterwards.
- Workouts flow: Home tab → Workouts history → Start/Resume → pick exercise (modal library, seeded
  30 exercises, search + add-custom) → pre-filled weight/reps from last time
  (`suggestNextSet`) → log sets (writes through to SQLite immediately) → rest timer
  (`RestTimer`, derives from stored epoch-ms start) → Finish → detail screen.
- Force-kill survival: `hydrate()` on History focus re-reads any unfinished session from
  SQLite so "Resume" appears instead of starting a duplicate; `activeSession()` query
  added to `src/db/workouts.ts` for this.
- Weight flow: Home tab → Weight → trend chart (7-day moving average in accent over raw
  daily readings in grey, optional dashed goal line, 90-day window) → "Log weight" modal
  (pre-filled from the last entry, so the unit does not silently switch) → back to the
  trend, which reloads on focus. Goal weight is a second modal; long-press a history row
  to delete it. No Zustand store — the screens read SQLite directly, since there is no
  cross-screen in-progress state to hold the way an active workout has.

## Decisions to know

- **Expo Router over React Navigation** (deviation from planning docs): routes live in
  `app/(tabs)/<module>/`, no `src/screens/` or `src/navigation/`. Documented in
  `docs/07-repo-structure.md` — keep new modules under `app/(tabs)/`.
- **Local-first**: the app is 100% offline; the backend exists but nothing calls it yet.
  Sync arrives in Phase 2 per `docs/06-roadmap.md`. Seeded exercises use deterministic
  `seed-*` ids so Phase 2 sync won't duplicate them.
- **Single user for now**: `LOCAL_USER_ID = 'local-user'`, now in `src/constants.ts` and
  re-exported from `src/store/workoutStore.ts` so existing workout screens kept working. It
  moved once the weight module needed it — a weight screen importing a user id from the
  workout store would be an odd dependency. Grep the constant to find everything Phase 2
  auth has to touch; rows carry `user_id` from day one per the data model.
- **Charting is hand-rolled** on `react-native-svg` (the only new dependency, and Expo
  bundles it). `react-native-svg-charts` peers on svg `^6||^7` against the 15.15.4 the SDK
  ships and has been unmaintained since 2019; `victory-native@41` pulls Skia, Reanimated
  and gesture-handler as native deps for one line chart. The geometry lives in
  `src/domain/chart.ts` as pure functions (`seriesBounds`, `niceRange`, `project`,
  `linePath`, `yTicks`), which is what makes it testable — the degenerate cases that
  actually ship (one point, flat series, empty series) produce `NaN` in an SVG `d`
  attribute, which React Native reports as a render warning rather than a crash. Reach for
  the same split before adding any further chart.
- **Weight is stored as logged, normalised on read**: the row keeps the unit the user typed
  and the domain layer converts to kg, same as `workout_sets`. Derived values (goal weight,
  trend, deltas) are kg throughout and converted once at the display boundary, so the chart
  never needs to know what a kilogram is. `LB_PER_KG` has one definition, in
  `src/domain/workouts.ts`.
- **Preferences are a generic key-value table** (`user_preferences`, PK `(user_id, key)`,
  upsert via `ON CONFLICT DO UPDATE`) rather than a column per setting, so the deferred
  unit-preference decision does not need another migration. `getGoalWeightKg` treats an
  unparseable value as unset rather than throwing — a corrupt preference should not break
  the screen it decorates.
- **Unit preference**: stores no app-wide default — each set carries its own unit;
  `suggestNextSet` falls back to kg with no history (feature-spec open decision).
- **Infra/CI written, not run**: no Docker daemon/Postgres on the dev machine, so
  `infra/docker-compose.yml` and `apps/backend/Dockerfile` are YAML-validated only
  (`docker compose up` is unverified), and `.github/workflows/ci.yml` has not executed on
  GitHub. The CI backend job is the first real exercise of the Postgres path.

## Work left

- **Docker stack smoke test** (`infra/docker-compose.yml`): `docker compose up -d postgres`,
  `alembic upgrade head`, `uvicorn --reload`, `pytest` against it. Both files note this
  has not been run.
- **Run the CI once**: after the first push, confirm `.github/workflows/ci.yml` is green —
  particularly the backend job's Postgres service container (migration + tests).
- **Test coverage** — done for both shipped modules. The workouts module has
  `src/db/workouts.ts` (38 tests) and `src/store/workoutStore.ts` (16 tests); the weight
  module adds domain, query-layer and chart-geometry suites. All run against a real
  in-memory SQLite engine via `node:sqlite` (Node 22 built-in — the same engine expo-sqlite
  uses). See "Test harness" below. The harness and its patterns
  (`src/db/__tests__/testDb.ts`) are ready for the next module (tasks, macros): each new
  query file gets a `__tests__/` suite that imports `createTestDb()`.
- **Screen-level polish** (manual, on-device): rest-timer target ("long enough" turns
  green at 90s), notes field on finish, RPE field, set-deletion/edit, and the Home
  dashboard are all consciously deferred per `04-feature-specs.md`.
- **`src/store/workoutStore.ts` refinement**: `emptySession()` returns all-`null` fields, so
  "no session open" and "session open" are not distinguishable at the type level. Worth a
  discriminated union once an edit flow exists. Not urgent, and not currently flagged in
  the code.

## Verification commands

```sh
# Backend
cd apps/backend && source .venv/bin/activate
ruff check .            # All checks passed!
pytest -q               # 6 passed
alembic upgrade head    # c7080c2dd1c6 (idempotent)

# Mobile
cd apps/mobile
npm run typecheck       # tsc --noEmit, 0 errors
npm run lint            # eslint ., clean
npm test                # 163 passed (6 suites)
npx expo-doctor         # 20/20
npx expo export --platform android   # bundles clean
```

## Test harness (mobile)

`src/db/__tests__/testDb.ts` exposes `createTestDb()`: a thin adapter that presents Node's
built-in `node:sqlite` through the subset of the `SQLiteDatabase` interface the query layer
uses (`execAsync`, `runAsync`, `getAllAsync`, `getFirstAsync`, `prepareAsync`). Tests get
the real schema from `migrations.ts` and the real seed data, so SQL is exercised as written
rather than mocked.

Three things to know before extending it:

- `jest.testMatch` in `package.json` is narrowed to `**/*.test.[jt]s?(x)`. jest-expo's
  default treats every file under `__tests__/` as a suite, which made the shared
  `testDb.ts` helper fail as an empty test file. Colocated helpers are fine now.
- Because the harness runs the app's own `migrate()`, it inherits its
  `PRAGMA foreign_keys = ON` — so tests catch FK violations the app would hit. The store is
  a zustand module singleton: reset its state in `beforeEach`, or a `sessionId` from the
  previous test leaks into a fresh database and surfaces as a confusing FK error.
- `expo-crypto`'s `randomUUID` has no jest implementation; the store suite mocks it with a
  counter. `Date.now()` is pinned with `jest.useFakeTimers()`.

### Timezone pinning — use `globalSetup`, not `setupFiles`

The weight domain buckets weigh-ins by **local** calendar day on purpose (a 22:00 weigh-in
should land on the date shown beside it), which makes its tests timezone-sensitive: a
fixture at `23:59:59Z` is the 11th in London and the 12th in Berlin. `jest.globalSetup.js`
pins `TZ=UTC` for the run.

It has to be `globalSetup`. A setup file runs *inside* the jest environment, whose `process`
is a sandboxed copy — assigning `TZ` there never reaches the ICU timezone cache, so `Date`
quietly keeps using the host zone. This was confirmed the slow way: `jest --showConfig`
proved the setup file was resolved and loading, and separate Node probes proved Node does
honour a runtime `TZ` mutation, which left the sandboxed `process` as the only explanation.
`globalSetup` runs in the real Node process before workers fork, so they inherit the zone at
spawn. Don't "fix" a future timezone failure by editing the assertion to match the machine.

## Bugs found and fixed by these tests

Both were in `listSessions()` in `src/db/workouts.ts` — the History screen's query. Neither
was reachable from the domain tests, which is what made the SQLite-backed pass worth doing.

- **`exercise_names` was silently truncated.** `GROUP_CONCAT(DISTINCT e.name)` ignores a
  custom separator (SQLite rejects a second argument alongside `DISTINCT`), so the query
  emitted comma-joined names while the mapper split on `'|'` — every session collapsed to
  one long pseudo-name. Fixed by moving the `DISTINCT` into a subquery so the
  two-argument `GROUP_CONCAT(name, '|')` can run outside it.
- **`total_volume` mixed lb and kg.** The SQL summed `reps * weight` raw, while the detail
  screen's `setVolume()` normalises lb to kg — so a session logged in lb reported ~2.2x the
  volume of the same session's detail view. The SQL now applies the same conversion, with
  `LB_PER_KG` exported from `src/domain/workouts.ts` so the factor has one definition.

## Adding the next module

The weight module is the pattern to copy; it took this shape:

1. **Migration** — append to `MIGRATIONS` in `src/db/migrations.ts` and bump
   `SCHEMA_VERSION` in `src/db/schema.ts`. Never edit an existing entry: installs in the
   wild have already run it. Weight was v2 (`body_weight_entries`, `user_preferences`).
2. **Types** — a row type and a domain type in `src/db/types.ts`, plus a `to*` mapper. The
   split is what keeps `snake_case` SQL out of the screens.
3. **Domain** — pure functions in `src/domain/<module>.ts`, no `db` import. This is where
   the tests get their leverage; anything interesting should be reachable from here.
4. **Queries** — `src/db/<module>.ts`, one function per query, plus a `__tests__/` suite
   using `createTestDb()`. Include a migration test that upgrades a database holding the
   *previous* module's rows, which is what a real install does on update.
5. **Screens** — `app/(tabs)/<module>/`, reloading with `useFocusEffect` rather than on
   mount so a modal dismissal shows the row just written.

Two mistakes the weight tests deliberately guard, worth repeating in the next module:

- **`ORDER BY … ASC LIMIT n` returns the oldest n.** For a chart you want the newest n, then
  sorted ascending — otherwise a user with years of history sees their first few entries and
  nothing since. `listEntriesAscending` does the limit in a subquery.
- **A rolling average must window by date, not by sample count.** Three weigh-ins in July
  and one in August would otherwise report a "7-day average" spanning six weeks.

## Repo hygiene notes

- `apps/backend/kairo.db` had been committed by mistake. It was untracked
  (`git rm --cached`, file kept on disk) and `*.db` / `*.db-shm` / `*.db-wal` added to
  `.gitignore`. It held only the Alembic version row and empty tables, so nothing was
  lost. Recreate with `alembic upgrade head`.
- `kairo_backend.egg-info/` and `.venv/` are untracked (fine).
- `expo` had been floating on `"latest"` in `apps/mobile/package.json` and is now pinned to
  the SDK 57 range like everything else. Expo-managed packages use a **tilde** range by
  convention here; `react-native-svg` went in with a caret and was corrected.
- `expo-doctor` drifts to 19/20 on its own as the SDK publishes patch releases — the four
  it flagged were upstream, not caused by local code. `npx expo install --fix` is the remedy,
  run from `apps/mobile` (from the repo root `npx` bootstraps a throwaway `expo` instead of
  using the local one). It also cannot take `--check` and `--fix` together. On a slow link it
  can die mid-install and leave `package-lock.json` half-rewritten; a plain `npm install`
  afterwards reconciles it.
- `.claude/` at the repo root is machine-local tool config and holds settings from other
  projects in this workspace. It was staged accidentally by a `git add`, unstaged before
  committing, and is now in `.gitignore` so it cannot happen again.
