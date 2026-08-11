# Continue with

Handoff for the Kairo v1 sessions so far: Phase 0 scaffold, then Workouts, Weight and
Tasks. Read before continuing.

Last updated: **2026-08-11**, after the tasks module landed.

## Status

Phase 0 (monorepo scaffold) and the first three Phase 1 modules — **workout logging**,
**weight/progress charts** and **daily tasks & streaks** — are implemented and verified.

By roadmap order (`docs/06-roadmap.md`), the next module is **macro tracking**, which is
the last P0 module. After that the Home dashboard has something real to aggregate, and
Phase 2 (backend sync + auth) begins.

**Git**: `master`, pushed to `origin/master` (`https://github.com/Daboggieman/Kairo-v1`).
Three commits went in this session:

| Commit | What |
|---|---|
| `44c140d` | `refactor(dates)` — extract `src/domain/dates.ts`, fix two UTC/local window bugs in weight |
| `9d641d3` | `feat(tasks)` — the whole tasks module, migration v3, three screens, 97 new tests |
| (this doc) | `docs` — this handoff |

Confirm the real state with `git log --oneline origin/master..HEAD` rather than trusting
this table.

Two corrections to what the previous version of this file claimed:

- The "Unpushed / credential helper has no usable credentials" paragraph is **resolved**.
  `origin/master` and `HEAD` were level at the start of this session, so the earlier work
  did get pushed.
- Git identity is **global**, not repo-local: `Daboggieman` / `adaraph722@gmail.com`. The
  old note saying it was set `--local` on purpose was wrong — `git config --local user.name`
  returns nothing. Nothing depends on this; it is corrected so nobody hunts for a
  repo-local config that isn't there.

## What is done and verified

### Backend — green (unchanged this session)
`apps/backend/`, FastAPI + SQLModel + Alembic. Portability decision from an earlier
session: models use portable SQLAlchemy types so everything runs on SQLite locally, with
Postgres as the deployment target.

- Migration `c7080c2dd1c6` applied against SQLite; tables confirmed via sqlite3:
  `alembic_version, exercises, users, workout_sessions, workout_sets`.
- `pytest` → **6 passed** (health + workout lifecycle, in-memory SQLite via `StaticPool`).
- `ruff check .` → **All checks passed!** (select E, F, I, UP, B; B008 `Depends`/`Query`
  exempted via `extend-immutable-calls`).
- `POST /workouts/{id}/sets` accepts an array (offline bulk sync); the router carries a
  `TODO(phase-2)` noting the endpoints are unauthenticated by design until then.
- `alembic/env.py` reads `DATABASE_URL` from `app.core.config` (single source of truth).

**Not re-run this session** — the tasks module is mobile-only and touches no backend file,
so these numbers are carried over from the previous verification. Re-run them before
trusting them (see "Verification commands"). The backend still has **no tasks endpoints**;
it is a workouts-only API, which is fine until Phase 2.

### Mobile — implemented and verified
`apps/mobile/`, Expo SDK 57 + Expo Router (file-based) + expo-sqlite + Zustand.

Verified at the end of this session:

- `npm run typecheck` (`tsc --noEmit`) → **0 errors**.
- `npm run lint` (`eslint .`) → **clean**, 0 errors 0 warnings.
- `npm test` → **275 passed across 9 suites** (was 163 across 6). New: tasks domain (68),
  tasks query layer (29), dates (12).

**Not re-run this session, and worth running first thing next session:**

- `npx expo-doctor` — last run 20/20, before the tasks module existed.
- `npx expo export --platform android` — the cheapest end-to-end proof that every import
  resolves and the router tree is valid, which matters because this session added four new
  route files. Delete the emitted `dist/` afterwards. Nothing suggests it will fail —
  typecheck covers the imports — but the router tree is not type-checked.

Module flows that work:

- **Workouts**: Home → Workouts history → Start/Resume → pick exercise (modal library,
  seeded 30 exercises, search + add-custom) → weight/reps pre-filled from last time
  (`suggestNextSet`) → log sets (writes through to SQLite immediately) → rest timer
  (derives from a stored epoch-ms start) → Finish → detail screen. Force-kill survival:
  `hydrate()` on History focus re-reads an unfinished session so "Resume" appears instead
  of starting a duplicate.
- **Weight**: Home → Weight → trend chart (7-day moving average in accent over raw daily
  readings in grey, optional dashed goal line, 90-day window) → "Log weight" modal
  (pre-filled from the last entry so the unit cannot silently switch) → back to the trend,
  which reloads on focus. Goal weight is a second modal; long-press a history row to
  delete. No Zustand store — the screens read SQLite directly, since there is no
  cross-screen in-progress state the way an active workout has.
- **Tasks** (new): Home → Today tab → tick habits off, or open one for its streak history.
  Detail below.

## The tasks module (new this session)

### Files

| Path | Role |
|---|---|
| `src/db/schema.ts` | `CREATE_TASKS`, `CREATE_TASK_COMPLETIONS`, `CREATE_TASK_INDEXES`; `SCHEMA_VERSION = 3` |
| `src/db/migrations.ts` | migration `version: 3` appended |
| `src/db/types.ts` | `TaskRow`/`Task`, `TaskCompletionRow`/`TaskCompletion`, `toTask`, `toTaskCompletion` |
| `src/domain/dates.ts` | shared calendar-day helpers (extracted, see below) |
| `src/domain/tasks.ts` | 434 lines, pure — recurrence parsing, streak walks, history grid |
| `src/db/tasks.ts` | 204 lines, 11 query functions |
| `src/components/Checkbox.tsx` | presentational tick box |
| `app/(tabs)/tasks/_layout.tsx` | Stack: `index` "Today", `new` (modal), `[taskId]` "Streak" |
| `app/(tabs)/tasks/index.tsx` | the Today list |
| `app/(tabs)/tasks/new.tsx` | add-task modal |
| `app/(tabs)/tasks/[taskId].tsx` | streak detail + history grid |
| `app/(tabs)/_layout.tsx` | `Tabs.Screen name="tasks"` added between Home and Workouts |
| `app/(tabs)/index.tsx` | Home gained a "Today" card; `UPCOMING` is now just macros + quotes |

Tests: `src/domain/__tests__/tasks.test.ts` (606 lines, 68 cases),
`src/db/__tests__/tasks.test.ts` (461 lines, 29 cases),
`src/domain/__tests__/dates.test.ts` (115 lines, 12 cases).

### Schema (migration v3)

```sql
tasks(id PK, user_id, title, recurrence_rule DEFAULT 'daily', created_at, archived DEFAULT 0)
task_completions(id PK, task_id → tasks(id) ON DELETE CASCADE,
                 completed_date, completed_at, UNIQUE (task_id, completed_date))
```

Decisions embedded there, each of which a future change should argue with rather than
quietly reverse:

- **No materialised `Streak` table**, though `02-data-model.md` floats one. Streaks are
  derived from the completion rows. For one user with tens of habits the walk is trivial,
  and a stored counter is a second source of truth that drifts the moment a completion is
  deleted or arrives out of order over sync.
- **The UNIQUE constraint is the point of the table.** A habit is either done today or it
  is not, so a double-tap must not log it twice and inflate a count. That is what lets
  `setCompletion` be a plain `INSERT OR IGNORE`, makes `toggleCompletion` idempotent, and
  makes a replayed Phase 2 sync event harmless.
- **`completed_date` (local `YYYY-MM-DD`) and `completed_at` (the instant) are separate** —
  the same split as `body_weight_entries`, for the same reason: the day is what the streak
  counts, the instant is worth keeping.
- **`recurrence_rule` is stored as opaque text**, not normalised into flag columns, so
  Phase 2 sync moves one value rather than reconciling a set.

### The recurrence rule

A compact hand-rolled string, not an RRULE:

```
daily | weekdays | weekends | weekly:1,3,5 | interval:3
```

(`weekly:` takes `getDay()` numbers, Sunday `0`. `interval:n` counts from the task's
creation day.) `02-data-model.md` suggests "daily/weekdays/custom RRULE", but a full RRULE
parser is a dependency and a large surface for a habit list whose realistic vocabulary is
those five shapes. **`parseRecurrence` is the contract**: an unrecognised, malformed or
empty rule falls back to `daily` rather than throwing, because a corrupt row should not take
the Today list down with it. The add-task screen builds custom rules through
`formatRecurrence` so it cannot invent a rule the parser rejects — that round trip is tested.

### Streak semantics — read this before changing the walks

One function, `isScheduledOn(recurrence, day, anchorDay)`, decides whether a task was due on
a day, and **both** streak walks obey it. It returns false for any `day < anchorDay`. The
consequences are deliberate:

- **Completions on unscheduled days are bonus work.** Ticking a weekdays habit off on a
  Sunday does not extend the streak and cannot bridge Friday→Monday, because the walk only
  ever looks at scheduled days. There is a test that asserts the with-bonus and without-bonus
  answers are identical.
- **A completion dated before the task existed is ignored** by both walks — reachable from an
  edited row or a clock change. `longestStreak` used to start its walk at
  `Math.min(anchorDay, min(completedDays))`, which was dead code (`isScheduledOn` rejects
  those days anyway) and read as though it did something. It now starts at `anchorDay`, and
  the test asserts both walks agree at 0 rather than blessing a special case.
- **`currentStreak` grants today a grace day**: if today is scheduled and not yet done, the
  walk starts from yesterday, so an unfinished today neither counts nor breaks. A weekdays
  streak therefore survives the weekend — the case `04-feature-specs.md` names explicitly,
  and it is tested.
- **`longestStreak` grants no grace day.** An open today simply ends the run being measured;
  the best already recorded stands.

`HistoryState` has five values on purpose: `done | missed | pending | unscheduled | future`.
`pending` exists so an unfinished *today* does not render as a rest day or as a miss.
`[taskId].tsx` keys its cell colours with `Record<HistoryState, ViewStyle>`, so adding a
sixth state fails to compile until it has a colour.

### Query layer notes

`completionDatesByTask(db, userId)` is **deliberately unbounded** — no `LIMIT`. A row limit
would spend the whole budget on whichever task sorted first and report every other task as
streakless, which looks exactly like lost data. If it ever does need bounding, bound it by
*date* (`completed_date >= ?`), never by row count. The same comment is in the source.

`toggleCompletion` is `clearCompletion` then `setCompletion`, returning the state it landed
in (`true` = now complete). `clearCompletion` reports `result.changes > 0` so the toggle can
branch on it.

`listTasks(db, userId, includeArchived = false)` orders `created_at ASC`. Archived tasks keep
their completions and their `created_at`, so restoring one restores its streak — tested.

### Screen notes

- The Today list is a `ScrollView`, not a `FlatList`. The list is bounded by how many habits
  a person keeps; virtualisation would cost more than it saves.
- `index.tsx` loads `listTasks` + `listArchivedTasks` + `completionDatesByTask` in one
  `Promise.all` inside `useFocusEffect`, and **refreshes `nowMs` in the same `load()`** so
  the list and the data always describe the same day. A phone left open overnight otherwise
  renders yesterday's schedule against today's completions.
- Toggling reads the **wall clock** (`new Date()`), not the captured `nowMs`, so a tick at
  00:01 lands on the correct day even if the screen was loaded before midnight.
- `[taskId].tsx` is a one-shot `useEffect` load rather than a focus effect (the screen is
  pushed fresh each time); `load()` *returns* its data instead of setting state, so a late
  result can be dropped by the cancelled flag.
- Three stats on the detail screen — current, longest, and last-30-days as a rate — because
  a current streak alone is brittle to be judged on. 27 of 30 with yesterday missed reads as
  a streak of 1, and only the other two numbers say the user is doing well.

## Decisions to know (whole project)

- **Expo Router over React Navigation** (deviation from the planning docs): routes live in
  `app/(tabs)/<module>/`, no `src/screens/` or `src/navigation/`. Documented in
  `docs/07-repo-structure.md` — keep new modules under `app/(tabs)/`.
- **Local-first**: the app is 100% offline; the backend exists but nothing calls it yet.
  Sync arrives in Phase 2 per `docs/06-roadmap.md`. Seeded exercises use deterministic
  `seed-*` ids so Phase 2 sync won't duplicate them.
- **Single user for now**: `LOCAL_USER_ID = 'local-user'` in `src/constants.ts`, re-exported
  from `src/store/workoutStore.ts` so the existing workout screens kept working. Grep the
  constant to find everything Phase 2 auth has to touch; every row carries `user_id` from
  day one per the data model, and the queries honour it (there are tests for that, in a
  single-user app, on purpose — the filters must not be missing when sync arrives).
- **Calendar-day arithmetic lives in `src/domain/dates.ts`** (new this session, extracted
  from `domain/weight.ts` when tasks needed the same helpers — the same move `LOCAL_USER_ID`
  made). `dayKeyFromDate` is the single place the host timezone is read; `toDayKey` and
  `todayNumber` both route through it, so "the day this timestamp belongs to" and "the day
  it is now" cannot be computed two different ways. **A day is always a local calendar day**;
  a day *key* (`YYYY-MM-DD`) is parsed as UTC midnight because the timezone has already been
  resolved out of it, and re-applying an offset would shift days across a DST boundary.
- **Charting is hand-rolled** on `react-native-svg` (the only added dependency, and Expo
  bundles it). `react-native-svg-charts` peers on svg `^6||^7` against the 15.15.4 the SDK
  ships and is unmaintained since 2019; `victory-native@41` pulls Skia, Reanimated and
  gesture-handler as native deps for one line chart. Geometry lives in `src/domain/chart.ts`
  as pure functions (`seriesBounds`, `niceRange`, `project`, `linePath`, `yTicks`) — the
  degenerate cases that actually ship (one point, flat series, empty series) produce `NaN` in
  an SVG `d` attribute, which React Native reports as a render warning rather than a crash.
  Reach for the same split before adding any further chart.
- **Weight is stored as logged, normalised on read**: the row keeps the unit the user typed
  and the domain layer converts to kg, same as `workout_sets`. Derived values (goal, trend,
  deltas) are kg throughout, converted once at the display boundary. `LB_PER_KG` has one
  definition, in `src/domain/workouts.ts`.
- **Preferences are a generic key-value table** (`user_preferences`, PK `(user_id, key)`,
  upsert via `ON CONFLICT DO UPDATE`) rather than a column per setting, so the deferred
  unit-preference decision needs no further migration. `getGoalWeightKg` treats an
  unparseable value as unset rather than throwing — a corrupt preference should not break
  the screen it decorates.
- **Unit preference**: no app-wide default is stored; each set carries its own unit and
  `suggestNextSet` falls back to kg with no history (feature-spec open decision).
- **Infra/CI written, not fully exercised**: see "Work left".

## Work left

Ordered by what a next session should probably do first.

1. **Re-run the two skipped mobile checks** (5 minutes): `npx expo-doctor` and
   `npx expo export --platform android` from `apps/mobile`, then delete `dist/`. The export
   is the only thing that validates the four new route files as a router tree.
2. **Confirm CI on this push.** `.github/workflows/ci.yml` had three successful runs as of
   the start of this session. This session's two code commits have not been checked, and
   **`gh` is not installed in this environment** (`gh: command not found`), so it could not
   be verified from here — check the Actions tab, or install `gh`. The backend job's
   Postgres service container is the only real exercise of the Postgres path.
3. **Macro tracking** — the next roadmap module, and the last P0 one. Follow "Adding the next
   module" below. It is the biggest of the four (food entries, per-day targets, an aggregate
   ring), so expect a migration v4 with more than two tables.
4. **Home dashboard.** It has been a placeholder on the grounds that it aggregates modules
   that did not exist. Three of four now do, and `splitByDueToday` + `summarise` already
   return exactly what a dashboard card needs. Worth doing after macros, or before, if
   something visible is wanted sooner.
5. **Docker stack smoke test** (`infra/docker-compose.yml`): `docker compose up -d postgres`,
   `alembic upgrade head`, `uvicorn --reload`, `pytest` against it. **Still blocked in this
   environment**, and here is exactly why, so the next session does not re-derive it:
   `/usr/bin/docker` exists but the daemon socket returns permission denied (the user is in
   groups `student user`, not `docker`), there is no `docker compose` plugin installed, and
   `sudo` requires a password that is not available. Fixing it needs
   `sudo usermod -aG docker $USER` + a re-login, plus the compose plugin. Both
   `infra/docker-compose.yml` and `apps/backend/Dockerfile` note they are YAML-validated only.
6. **Screen-level polish** (manual, on-device), all consciously deferred per
   `04-feature-specs.md`: rest-timer target ("long enough" turns green at 90s), notes field
   on finish, RPE field, set edit/delete. Nothing in the tasks module is on this list — it
   shipped complete against its spec.
7. **`src/store/workoutStore.ts` refinement**: `emptySession()` returns all-`null` fields, so
   "no session open" and "session open" are not distinguishable at the type level. Worth a
   discriminated union once an edit flow exists. Not urgent, not flagged in the code.

Not on this list, and deliberately: no tasks-module follow-ups. Reminders/notifications are
Phase 3 in `docs/06-roadmap.md`, not a gap in what shipped.

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
npm test                # 275 passed (9 suites)
npx expo-doctor         # 20/20 as of the weight module; not re-run since
npx expo export --platform android   # not re-run since the tasks module; delete dist/ after
```

If `node_modules` or `.venv` are missing (a fresh clone, or a cleaned machine):
`npm install` in `apps/mobile`; `python3 -m venv .venv && source .venv/bin/activate &&
pip install -e '.[dev]'` in `apps/backend`.

## Test harness (mobile)

`src/db/__tests__/testDb.ts` exposes `createTestDb()`: a thin adapter presenting Node's
built-in `node:sqlite` through the subset of the `SQLiteDatabase` interface the query layer
uses (`execAsync`, `runAsync`, `getAllAsync`, `getFirstAsync`, `prepareAsync`). Tests get the
real schema from `migrations.ts` and the real seed data, so SQL is exercised as written
rather than mocked. All three query-layer suites use it.

Four things to know before extending it:

- `jest.testMatch` in `package.json` is narrowed to `**/*.test.[jt]s?(x)`. jest-expo's
  default treats every file under `__tests__/` as a suite, which made the shared `testDb.ts`
  helper fail as an empty test file. Colocated helpers are fine now.
- Because the harness runs the app's own `migrate()`, it inherits its
  `PRAGMA foreign_keys = ON` — so tests catch FK violations the app would hit. But note
  `node:sqlite` enables foreign keys **by default**, so a passing cascade test does not by
  itself prove that pragma is doing its job on a real device, where SQLite defaults it off.
  The tasks delete-cascade test says so in a comment.
- The store is a zustand module singleton: reset its state in `beforeEach`, or a `sessionId`
  from the previous test leaks into a fresh database and surfaces as a confusing FK error.
- `expo-crypto`'s `randomUUID` has no jest implementation; the store suite mocks it with a
  counter. `Date.now()` is pinned with `jest.useFakeTimers()`. The tasks suites avoid both by
  passing explicit ids and an injected `nowMs`.

### Timezone pinning — use `globalSetup`, not `setupFiles`

The weight domain buckets weigh-ins by **local** calendar day on purpose (a 22:00 weigh-in
should land on the date shown beside it), and the tasks domain counts a habit ticked off at
23:30 for that day. That makes both timezone-sensitive: a fixture at `23:59:59Z` is the 11th
in London and the 12th in Berlin. `jest.globalSetup.js` pins `TZ=UTC` for the run.

It has to be `globalSetup`. A setup file runs *inside* the jest environment, whose `process`
is a sandboxed copy — assigning `TZ` there never reaches the ICU timezone cache, so `Date`
quietly keeps using the host zone. This was confirmed the slow way: `jest --showConfig`
proved the setup file was resolved and loading, and separate Node probes proved Node does
honour a runtime `TZ` mutation, leaving the sandboxed `process` as the only explanation.
`globalSetup` runs in the real Node process before workers fork, so they inherit the zone at
spawn. Don't "fix" a future timezone failure by editing the assertion to match the machine.

## Bugs found and fixed by tests

**In `listSessions()`** (`src/db/workouts.ts`, the History screen's query) — neither was
reachable from the domain tests, which is what made the SQLite-backed pass worth doing:

- **`exercise_names` was silently truncated.** `GROUP_CONCAT(DISTINCT e.name)` ignores a
  custom separator (SQLite rejects a second argument alongside `DISTINCT`), so the query
  emitted comma-joined names while the mapper split on `'|'` — every session collapsed to one
  long pseudo-name. Fixed by moving the `DISTINCT` into a subquery so the two-argument
  `GROUP_CONCAT(name, '|')` can run outside it.
- **`total_volume` mixed lb and kg.** The SQL summed `reps * weight` raw while the detail
  screen's `setVolume()` normalises lb to kg — so a session logged in lb reported ~2.2× the
  volume of the same session's detail view. The SQL now applies the same conversion.

**In `summarise()` and `withinDays()`** (`src/domain/weight.ts`), found while extracting
`dates.ts` this session: both derived today with `Math.floor(nowMs / MS_PER_DAY)`, which
answers in **UTC**, while the points they filter were bucketed by **local** day. Off-UTC the
window compared two different calendars and could shift by a day. Both now call
`todayNumber(nowMs)`. Not caught earlier because the suite pins `TZ=UTC`, where the two agree
— worth remembering when reading a green run as proof of timezone correctness.

## Adding the next module

Three modules have now taken the same shape. Copy it:

1. **Migration** — append to `MIGRATIONS` in `src/db/migrations.ts` and bump
   `SCHEMA_VERSION` in `src/db/schema.ts`. Never edit an existing entry: installs in the wild
   have already run it. v1 workouts, v2 weight (`body_weight_entries`, `user_preferences`),
   v3 tasks (`tasks`, `task_completions`). Macros is v4.
2. **Types** — a row type and a domain type in `src/db/types.ts` plus a `to*` mapper. The
   split is what keeps `snake_case` SQL out of the screens. Don't add a join type
   speculatively — the tasks pass deleted a `TaskWithCompletion` that no query ended up
   wanting.
3. **Domain** — pure functions in `src/domain/<module>.ts`, no `db` or React import, and
   `nowMs` always injected rather than read. That is the whole testability seam; anything
   interesting should be reachable from here. Use `src/domain/dates.ts` for day math instead
   of dividing by `86_400_000`.
4. **Queries** — `src/db/<module>.ts`, one function per query, plus a `__tests__/` suite using
   `createTestDb()`. Include a migration test that upgrades a database holding the *previous*
   modules' rows, which is what a real install does on update — the tasks one seeds both a
   workout and a weight row, rewinds `user_version`, re-migrates, and asserts both survive.
   Finish with one integration case that feeds real query output through the domain layer, so
   a disagreement between the two shows in CI rather than on a phone.
5. **Screens** — `app/(tabs)/<module>/`, reloading with `useFocusEffect` rather than on mount
   so a modal dismissal shows the row just written. Refresh `nowMs` in the same load as the
   data. Add the tab in `app/(tabs)/_layout.tsx` and a card in `app/(tabs)/index.tsx`, and
   remove the module from that file's `UPCOMING` list.

Mistakes earlier modules' tests deliberately guard, worth repeating:

- **`ORDER BY … ASC LIMIT n` returns the oldest n.** For a chart you want the newest n, then
  sorted ascending — otherwise a user with years of history sees their first few entries and
  nothing since. `listEntriesAscending` does the limit in a subquery.
- **A rolling average must window by date, not by sample count.** Three weigh-ins in July and
  one in August would otherwise report a "7-day average" spanning six weeks.
- **Never derive "today" from `nowMs / MS_PER_DAY`** if the data was bucketed locally. See the
  `summarise` bug above.
- **Don't bound a per-entity history query with a row `LIMIT`.** It starves whichever entities
  sort last and reports them as empty, which is indistinguishable from data loss. Bound by
  date.

## Repo hygiene notes

- `.gitignore` is intentionally left as-is. It already covers `.claude/`, `*.db` /
  `*.db-shm` / `*.db-wal`, `node_modules/`, `.venv/` and `dist/`.
- `apps/backend/kairo.db` had been committed by mistake. It was untracked (`git rm --cached`,
  file kept on disk) and `*.db` / `*.db-shm` / `*.db-wal` added to `.gitignore`. It held only
  the Alembic version row
  and empty tables, so nothing was lost. Recreate with `alembic upgrade head`.
- `kairo_backend.egg-info/` and `.venv/` are untracked (fine).
- `expo` had been floating on `"latest"` in `apps/mobile/package.json` and is now pinned to
  the SDK 57 range like everything else. Expo-managed packages use a **tilde** range by
  convention here; `react-native-svg` went in with a caret and was corrected.
- `expo-doctor` drifts to 19/20 on its own as the SDK publishes patch releases — the four it
  flagged were upstream, not local. `npx expo install --fix` is the remedy, run from
  `apps/mobile` (from the repo root, `npx` bootstraps a throwaway `expo` instead of using the
  local one). It cannot take `--check` and `--fix` together. On a slow link it can die
  mid-install and leave `package-lock.json` half-rewritten; a plain `npm install` afterwards
  reconciles it.
- `.claude/` at the repo root is machine-local tool config holding settings from other
  projects in this workspace. It was staged accidentally by a `git add` once, unstaged before
  committing, and is now gitignored so it cannot happen again.
