# Continue with

Handoff for the Kairo v1 sessions so far: Phase 0 scaffold, then Workouts, Weight, Tasks
and Macros. Read before continuing.

Last updated: **2026-08-15**, after completing and verifying Phase 2.

## Status

Phase 0 (monorepo scaffold) and all four Phase 1/P0 modules — **workout logging**,
**weight/progress charts**, **daily tasks & streaks**, and **macro/nutrition tracking** —
are implemented and verified.

Phase 1/P0 is now complete as a coherent daily app: Home aggregates all four local modules.
The full manual device smoke test is complete, including the Today/tasks workflow, locale
decimal inputs, and real bottom-tab icons. **Phase 2 is complete**: authentication,
the authenticated body-weight, task, and nutrition APIs, and mobile replay for all three
datasets are implemented.
Sync is opt-in through Expo public configuration; without it the app stays fully offline.
**Phase 2 is complete.**

**Git branch strategy**: `phase_1` preserves the completed Phase 1 snapshot at `ea80c37`.
Active Phase 2 development lives on `phase_2`, which includes all Phase 1 history plus the
auth, weight/task/nutrition backend implementation, mobile outbox/replay client, compatibility bounds,
tests, and documentation. `master` remains at the Phase 1 snapshot for now.
Confirm the real state with `git status --short` and `git log --oneline origin/master..HEAD`.

The remaining Phase 2 implementation is now in the working tree after the manually pushed
`phase_2` baseline. Commit and push this completed slice when convenient.

The last pushed commits are:

| Commit | What |
|---|---|
| `ea80c37` | Confirm physical-device retest for locale decimals and final tab icons |
| `77d4016` | Locale-safe numeric parsing, real tab icons, regression tests and manual findings |
| `b08aabf` | Macro/nutrition v4 storage and UI, Home dashboard composition, tests, and handoff |
| `44c140d` | `refactor(dates)` — extract `src/domain/dates.ts`, fix two UTC/local window bugs in weight |
| `9d641d3` | `feat(tasks)` — the whole tasks module, migration v3, three screens, 97 new tests |
| `984901c` | `docs` — tasks-module handoff |

Two corrections to what the previous version of this file claimed:

- The "Unpushed / credential helper has no usable credentials" paragraph is **resolved**.
  `origin/master` and `HEAD` were level at the start of this session, so the earlier work
  did get pushed.
- Git identity is now configured **repo-local** as `Daboggieman` / `adaraph722@gmail.com`
  because this environment could not see the previous global identity when creating the
  Phase 2 commit.

## What is done and verified

### Backend — Phase 2 auth + weight/task/nutrition sync foundation
`apps/backend/`, FastAPI + SQLModel + Alembic. Portability decision from an earlier
session: models use portable SQLAlchemy types so everything runs on SQLite locally, with
Postgres as the deployment target.

- Migrations through `4d91e2f7c3ab` apply cleanly against SQLite. The latest adds foods,
  nutrition entries, and effective-dated macro targets.
- `pytest -q` → **24 passed** (auth, health/OpenAPI, authenticated workout lifecycle,
  cross-user isolation, weight/task/nutrition sync).
- `ruff check .` → **All checks passed!** (select E, F, I, UP, B; B008 `Depends`/`Query`
  exempted via `extend-immutable-calls`).
- `POST /auth/token` exchanges the configured device key for access/refresh JWTs;
  `POST /auth/refresh` rotates the pair. PyJWT performs HS256 claim/signature validation.
- All workout endpoints now require bearer auth. Workout creation derives `user_id` from the
  token, and list/detail/update/set writes hide rows belonging to another user.
- Body weight has authenticated create/list/delete endpoints. POST preserves the client UUID,
  treats identical replay as success, returns `409` for conflicting reuse, and normalizes
  offset timestamps to UTC before comparison/persistence.
- Tasks and completions have authenticated create/list/update/delete endpoints. Task POST replay
  preserves the client UUID; completion replay is idempotent by `(task_id, completed_date)`;
  archive/restore and clear operations are replay-safe. Streaks remain derived.
- Nutrition has authenticated owned-food, entry, and target endpoints. Food and entry UUIDs
  replay idempotently; target PUT updates the effective-date row; entry deletion is idempotent.
- `alembic/env.py` reads `DATABASE_URL` from `app.core.config` (single source of truth).

Workout, weight, task, and nutrition sync are implemented end to end when configured. Quotes,
Pillow wallpapers, and local daily/weekly reminders are also complete.

## Final Phase 2 verification

- Backend: `ruff check .` clean; `pytest -q` **24 passed**; `alembic upgrade head` reaches head.
- Mobile: `npm run typecheck` clean; `npm run lint` clean; `npm test -- --runInBand`
  **350 passed across 16 suites**; Android export emitted `dist/` successfully.
- Workout replay preserves client session/set IDs, accepts mobile seeded exercise IDs, and
  rejects conflicting ID reuse with `409`.
- Quotes are deterministic by calendar day; wallpaper tests decode a nonblank 1080x1920 PNG.
- Reminders persist in mobile schema v6 and schedule daily or selected-weekday notifications.

### Mobile — implemented and verified
`apps/mobile/`, Expo SDK 57 + Expo Router (file-based) + expo-sqlite + Zustand.

Verified after the completed Phase 2 implementation:

- `npm run typecheck` (`tsc --noEmit`) → **0 errors**.
- `npm run lint` (`eslint .`) → **clean**, 0 errors 0 warnings.
- `npm test` → **350 passed across 16 suites**. The new suites cover durable outbox storage,
  atomic rollback, weight/task/nutrition wire payloads, auth refresh, ordered replay, backoff,
  and terminal errors.
- `npx expo-doctor` was started against the final SDK 57 dependency graph.
- `npx expo export --platform android` → successful; the generated `dist/` bundle is present
  for inspection.

Module flows that work:

- **Home**: one focus-time load reads tasks, nutrition, weight, workout history, and any
  active session together. It shows unfinished tasks in priority order, macro progress,
  the smoothed weight trend and 30-day change, and active/recent workout status. Each section
  opens its owning module; an active workout goes straight to Resume.
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
- **Tasks**: Home → Today tab → tick habits off, or open one for its streak history.
  Detail below.
- **Macros** (new): Home → Macros → browse the day log, move backward through previous days,
  inspect calorie/protein/carbs/fat progress, add a saved or custom food with a serving
  quantity and meal, or edit effective-dated targets. Entries are grouped by meal and can be
  deleted with a long press. Detail below.

## Manual findings resolved after the first device run

The device run reported two defects outside the fully passing Today/tasks workflow:

- **Locale decimal input**: `Number.parseFloat` treated `1,5` as `1`, silently changing
  macro quantities and decimal weight values. `src/domain/numbers.ts` now parses dot, comma,
  and Arabic decimal separators with strict validation. Macro add/target fields, weight log,
  weight goal, and active-workout weight all use it. Mixed or malformed values are rejected
  instead of partially saved.
- **Bottom-tab icons**: the tab layout now uses Material Community Icons for Home, Today,
  Macros, Workouts, and Weight. `@expo/vector-icons` and its required `expo-font` peer/config
  plugin are declared directly.

The focused device retest passed:

1. Create Chicken breast (165 kcal, 31 g protein, 0 g carbs, 3.6 g fat per 100 g), enter
   quantity `1,5` (or the device's decimal separator), and verify the underlying `247.5 kcal`
   contribution (displayed as approximately `248 kcal`), `46.5 g` protein, `0.0 g` carbs,
   `5.4 g` fat, plus a `1.5 × 100 g` serving row.
2. Log weight `75,5` and verify the stored/displayed value is `75.5`, then compare Home's
   value with the smoothed Weight trend after multiple dated entries.
3. Log an active-workout set at `62,5` and verify the set displays/stores `62.5`.
4. Enter decimal values in macro targets and the weight goal and verify save, reload, and
   validation behaviour.
5. Confirm all five bottom tabs show real icons rather than placeholder rectangles.

All five checks passed on the physical device. The decimal-input and icon findings are closed.

The physical migration scenario was not available on this device because it had no prior
Kairo data; the populated v3-to-v4 migration remains covered by the automated SQLite suite.

## The tasks module

### Files

| Path | Role |
|---|---|
| `src/db/schema.ts` | `CREATE_TASKS`, `CREATE_TASK_COMPLETIONS`, `CREATE_TASK_INDEXES`; introduced by schema v3 |
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
| `app/(tabs)/index.tsx` | Home gained a "Today" card |

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

## The macros module (new this session)

### Files and shape

| Path | Role |
|---|---|
| `src/db/schema.ts` | `food_items`, `nutrition_entries`, `macro_targets`, indexes; `SCHEMA_VERSION = 4` |
| `src/db/migrations.ts` | append-only migration `version: 4` |
| `src/db/types.ts` | food, entry, target row/domain types and mappers |
| `src/domain/macros.ts` | pure serving math, daily totals, target comparison, meal grouping |
| `src/db/macros.ts` | food search/create, day log CRUD, effective target queries |
| `app/(tabs)/macros/index.tsx` | day navigation, progress bars, meal groups, entry deletion |
| `app/(tabs)/macros/add.tsx` | food search, custom food creation, quantity and meal selection |
| `app/(tabs)/macros/targets.tsx` | effective-dated calorie/protein/carbs/fat targets |

Tests: `src/domain/__tests__/macros.test.ts` (14 cases) and
`src/db/__tests__/macros.test.ts` (20 cases), including a populated v3→v4 migration test
and a real-query-output-to-domain-summary integration case.

### Decisions embedded in migration v4

- **Personal food library, no licensed nutrition dataset.** `food_items` belongs to a user
  and stores nutrition per a human-readable serving (`100 g`, `one scoop`, etc.). Search is
  case-insensitive substring matching over saved foods; `%` and `_` are literal because the
  query uses `instr`, not `LIKE`.
- **Quantity is a serving multiplier.** The food definition remains reusable, while each
  `nutrition_entry.quantity` records `0.5`, `1`, `1.5`, etc. Pure domain math multiplies all
  four nutrients by it.
- **`logged_date` and `logged_at` are separate.** The day log reads the local `YYYY-MM-DD`;
  the instant records when the entry was added. This follows tasks and weight rather than
  deriving a local date inside SQL.
- **Targets are effective-dated.** Saving on a new date creates a new target; saving again on
  the same date updates that row. A historical day uses the newest target whose
  `effective_date <= logged_date`, so changing today's plan does not rewrite old progress.
- **Food deletion is deliberately absent.** Entries reference a food definition without a
  cascade. The v1 UI can delete a mistaken day entry, but it cannot orphan years of history
  by removing a library item.
- **Progress uses bars rather than rings.** `04-feature-specs.md` explicitly permits
  ring/bar. Bars render all four metrics legibly in a compact mobile panel with no further
  chart dependency. The drawn fill caps at 100%, while consumed totals and negative
  remaining values still preserve over-target information.
- **User ownership is enforced on writes.** `addNutritionEntry` uses `INSERT … SELECT` from
  a food row scoped to the same `user_id`; a guessed food id from another future account
  cannot be attached to the current user's log.

## The Home dashboard (new this session)

### Files and shape

| Path | Role |
|---|---|
| `src/domain/dashboard.ts` | pure cross-module composition; delegates calculations to each module |
| `src/domain/__tests__/dashboard.test.ts` | 10 cases covering schedules, streak risk, macros, trend weight, workout priority, empty state |
| `app/(tabs)/index.tsx` | the actual daily dashboard, replacing the launcher and `UPCOMING` list |

No schema, store, or dashboard-specific persisted state was added. Home is a read model over
the module tables, so it cannot drift from the screens it summarizes.

Decisions worth keeping:

- **One focus-time `Promise.all`.** The dashboard captures `nowMs`, derives the local day,
  and reads all modules together. Returning from a logging modal updates Home immediately,
  and a phone left open across midnight moves every section to the new day together.
- **Existing domain functions remain authoritative.** Tasks route through
  `splitByDueToday`, macros through `summariseMacros`, and weight through
  `dailyWeights`/`movingAverage`/`summarise`. Home does not carry simplified copies of
  streak, target, or calendar-window logic.
- **Unfinished tasks only in the preview.** At most three are shown, in the exact priority
  order the Today screen uses. Due/done/at-risk counts still cover the whole day.
- **Trend weight, not the latest raw reading.** The dashboard follows the weight module's
  product decision instead of reintroducing daily scale noise on the first screen.
- **Active workout wins.** An open session changes the card action to Resume and routes
  directly to the active screen; otherwise the most recent completed session is summarized.
- **Late reads are dropped.** The focus effect applies its result only if Home is still
  focused, so navigating away during a SQLite load cannot set stale screen state.

## Decisions to know (whole project)

- **Expo Router over React Navigation** (deviation from the planning docs): routes live in
  `app/(tabs)/<module>/`, no `src/screens/` or `src/navigation/`. Documented in
  `docs/07-repo-structure.md` — keep new modules under `app/(tabs)/`.
- **Offline-first**: local writes remain authoritative. When sync configuration is present,
  weight creates/deletes are recorded in the outbox and replayed; without it the app remains
  fully offline. Seeded exercises use deterministic `seed-*` ids so sync will not duplicate
  them.
- **Single user for now**: `LOCAL_USER_ID = 'local-user'` in `src/constants.ts`, re-exported
  from `src/store/workoutStore.ts` so the existing workout screens kept working. Grep the
  constant to find everything Phase 2 auth has to touch; every row carries `user_id` from
  day one per the data model, and the queries honour it (there are tests for that, in a
  single-user app, on purpose — the filters must not be missing when sync arrives).
- **Calendar-day arithmetic lives in `src/domain/dates.ts`** (extracted
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

1. **Refine workout upload for client-generated IDs.** Workouts are authenticated now, but
   create/set schemas still generate backend IDs. Offline sync needs to preserve the mobile
   session/set UUIDs and define identical replay vs conflicting reuse, as weight now does.
2. **Confirm CI on `phase_2`.** The new Phase 2 branch has not yet been confirmed in GitHub
   Actions. **`gh` is not installed in this environment**, so check the
   Actions tab or install it. The backend job's Postgres service container is the important
   portability exercise for the new migration and UTC behavior.
3. **Docker stack smoke test** (`infra/docker-compose.yml`): `docker compose up -d postgres`,
   `alembic upgrade head`, `uvicorn --reload`, `pytest` against it. **Still blocked in this
   environment**, and here is exactly why, so the next session does not re-derive it:
   `/usr/bin/docker` exists but the daemon socket returns permission denied (the user is in
   groups `student user`, not `docker`), there is no `docker compose` plugin installed, and
   `sudo` requires a password that is not available. Fixing it needs
   `sudo usermod -aG docker $USER` + a re-login, plus the compose plugin. Both
   `infra/docker-compose.yml` and `apps/backend/Dockerfile` note they are YAML-validated only.
4. **Screen-level polish** (manual, on-device), all consciously deferred per
   `04-feature-specs.md`: rest-timer target ("long enough" turns green at 90s), notes field
   on finish, RPE field, set edit/delete. Nothing in the tasks module is on this list — it
   shipped complete against its spec.
5. **`src/store/workoutStore.ts` refinement**: `emptySession()` returns all-`null` fields, so
   "no session open" and "session open" are not distinguishable at the type level. Worth a
   discriminated union once an edit flow exists. Not urgent, not flagged in the code.

Not on this list, and deliberately: no tasks-module follow-ups. Phase 3 is now the movement
and GPS work in `docs/06-roadmap.md`.

## Verification commands

```sh
# Backend
cd apps/backend && source .venv/bin/activate
ruff check .            # All checks passed!
pytest -q               # 24 passed
alembic upgrade head    # reaches head (idempotent)

# Mobile
cd apps/mobile
npm run typecheck       # tsc --noEmit, 0 errors
npm run lint            # eslint ., clean
npm test                # 350 passed (16 suites)
npx expo-doctor         # dependency health check
npx expo export --platform android   # successful with macro routes; delete dist/ after
```

If `node_modules` or `.venv` are missing (a fresh clone, or a cleaned machine):
`npm install` in `apps/mobile`; `python3 -m venv .venv && source .venv/bin/activate &&
pip install -e '.[dev]'` in `apps/backend`.

## Test harness (mobile)

`src/db/__tests__/testDb.ts` exposes `createTestDb()`: a thin adapter presenting Node's
built-in `node:sqlite` through the subset of the `SQLiteDatabase` interface the query layer
uses (`execAsync`, `runAsync`, `getAllAsync`, `getFirstAsync`, `prepareAsync`). Tests get the
real schema from `migrations.ts` and the real seed data, so SQL is exercised as written
rather than mocked. All four query-layer suites use it.

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

## Pattern for future modules

Four modules have now taken the same shape. Copy it:

1. **Migration** — append to `MIGRATIONS` in `src/db/migrations.ts` and bump
   `SCHEMA_VERSION` in `src/db/schema.ts`. Never edit an existing entry: installs in the wild
   have already run it. v1 workouts, v2 weight (`body_weight_entries`, `user_preferences`),
   v3 tasks (`tasks`, `task_completions`), v4 macros (`food_items`,
   `nutrition_entries`, `macro_targets`).
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
