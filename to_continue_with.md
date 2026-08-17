# Continue with

Handoff for the Kairo v1 sessions so far: Phase 0 scaffold, then Workouts, Weight, Tasks
and Macros. Read before continuing.

Last updated: **2026-08-17**, after fixing the Expo Go runtime gate that prevented the app from
rendering at all on a physical device.

## Expo Go runtime gate — 2026-08-17

The first Expo Go LAN run on a physical Android device never rendered a single screen. The ~22
Metro lines the user reported came from **three** app-level root causes plus two environment
items; everything else was downstream noise.

**1. `expo-notifications` cannot be imported in Expo Go on Android — and it took the whole app
down.** Its barrel entry has a module-scope side effect (`DevicePushTokenAutoRegistration.fx`)
that registers a device-push-token listener as the module evaluates, and that listener *throws*
on Android in Expo Go because SDK 53 removed remote notifications from it. `app/_layout.tsx`
imported it at line 12, so the root layout never finished evaluating. Expo Router reported the
casualty as `Route "./_layout.tsx" is missing the required default export`, and rendering died on
`Cannot read property 'ErrorBoundary' of undefined` — the exported `ErrorBoundary` cannot catch a
throw in its own module. `src/db/alarms.ts` imported it too, which is why `./(tabs)/alarms.tsx`
warned as well. Read the repeated identical errors as *one* failure re-thrown from Metro's module
cache, not eight.

**2. `expo-media-library`'s default entry is wrong twice over.** It resolves the
`ExpoMediaLibraryNext` native module at module scope, which Expo Go does not ship — hence
`Cannot find native module 'ExpoMediaLibraryNext'` and a dead `wallpaper.tsx` route. In SDK 57
that entry's `saveToLibraryAsync` is also a deprecated stub that *throws* and tells you to import
from `expo-media-library/legacy`, so Save to Photos could not have worked in a development build
either. The legacy entry needs only the older `ExpoMediaLibrary` module and is where
`saveToLibraryAsync` still lives.

**3. Two smaller defects found in the same code.** `deleteAlarm` awaited
`cancelScheduledNotificationAsync` without a catch, so a schedule the OS had already dropped
would reject and abort the `DELETE`, leaving a row the user could not remove. And the alarms
screen validated `hour > 23` without a lower bound, so `-1:00` passed the screen and hit the
`alarms` CHECK constraint as an unhandled rejection.

**Environment, not app**: the React Native DevTools `chrome-sandbox` SUID error (affects only the
`j` debugger; `chown root` + `chmod 4755` fixes it) and one `npm ETIMEDOUT` fetching
`expo-doctor`, which passed 21/21 on the retry. Both are documented in `personal_test.txt`.

### The fix: capability tiers, required lazily

The rule this establishes, and the reason `src/services/runtime.ts` exists: **a native package
Expo Go may lack is never imported at module scope.** A static import is hoisted past every
guard, and its failure is not a degraded feature — it is a dead route, reported as a missing
default export.

| File | Role |
|---|---|
| `src/services/runtime.ts` | `IS_EXPO_GO` (`Constants.executionEnvironment === 'storeClient'`), moved out of `movementTracking.ts` and re-exported from it so `movement/new.tsx` is untouched |
| `src/services/notifications.ts` | `notificationsMode()` → `full` \| `local-only` \| `unavailable`, plus `configureNotificationHandler`, `scheduleReminder`, `cancelReminder` |
| `src/services/mediaLibrary.ts` | `mediaLibraryAvailable()` and `saveImageToLibrary()` over `expo-media-library/legacy` |
| `src/domain/reminders.ts` | pure `reminderTriggers` — the daily-versus-weekly decision and weekday validation |

`notificationsMode()` resolves once, lazily, through three tiers: the public barrel (development
builds, production, and Expo Go on **iOS**, where it only warns); the deep local-only modules
(`expo-notifications/build/{NotificationPermissions,scheduleNotificationAsync,cancelScheduledNotificationAsync,NotificationsHandler}`)
for Expo Go on Android, which do not pull the push side effect in and still schedule local
reminders; then `unavailable`. The deep paths are private API reached through a try/catch
`tryRequire`, so a future SDK restructuring `build/` degrades to a banner rather than a crash —
the exact failure this module exists to prevent. `expo-notifications` has no `exports` map today,
which is what makes the subpaths resolvable.

**Metro resolves `require()` at build time, so the path must be a literal.** The first version of
this module passed the path as a parameter (`require(request)`), which is not a runtime failure but
a *bundling* failure — `Invalid call at line 70: require(request)`, thrown by
`metro-transform-worker`, taking down the whole bundle rather than one route. Each path is now
written out at its own call site and handed over as a thunk (`tryRequire(() => require('…'))`);
the laziness was always in the closure, never in the dynamic path, so the tiers are unaffected.
Anything added here must keep the literal, and the five deliberate requires sit inside one scoped
`eslint-disable @typescript-eslint/no-require-imports` pair (that rule is `warn`, and the repo gate
is zero warnings).

Behaviour that follows from it:

- **Rows always save.** `scheduleReminder` returns `null` for an unavailable runtime, a denied
  permission, or a row whose time/weekdays do not describe a schedule; `createAlarm` stores
  `notification_id = NULL` and keeps the row, so the reminder starts working once the missing
  piece is in place. `src/db/alarms.ts` no longer mentions `expo-notifications`.
- **The reminders screen states the runtime.** A muted line for `local-only`, an amber notice for
  `unavailable`, and "Saved, but not scheduled" when a working runtime denied permission — the
  case that otherwise looks like a silent no-op.
- **The wallpaper screen offers Save to Photos only when it can.** Otherwise "Preview only".
  `saveImageToLibrary` returns `saved` / `permission-denied` / `unavailable` instead of throwing,
  because those are three different messages to the user.
- **An empty `repeatDays` means daily** (the screen's contract). A non-empty list whose weekdays
  are all invalid schedules *nothing* rather than falling back to daily — firing seven times a
  week is a worse answer than not firing. Weekdays here are `1`–`7` (Sunday first), which is
  `getDay() + 1`, **not** the `getDay()` numbering `src/domain/tasks.ts` uses.

Verified this session: `npm run typecheck` clean, `npm run lint` clean, and
`npm test -- --runInBand` → **394 passed across 20 suites** (up from 376/18; new suites
`src/domain/__tests__/reminders.test.ts` and `src/db/__tests__/alarms.test.ts`, the latter
mocking `@/services/notifications` to pin that rows persist when scheduling is unavailable and
that deletion works for a row that was never scheduled). The Android/iOS exports and
`expo-doctor` were **not** re-run after these edits, and no physical-device result has been
returned yet — the user is running the checks themselves.

**Expo Go now bundles and launches.** `npx expo start --go --lan -c` reached
`Android Bundled 68023ms node_modules/expo-router/entry.js (1741 modules)` with no
`expo-notifications` error, no missing-default-export warning, and no `ExpoMediaLibraryNext`
error. The one remaining `WARN` — Expo Go "can no longer provide full access to the media
library" — is emitted by the **Expo Go client's own native code** (the string appears nowhere in
`node_modules`), which is positive evidence that `expo-media-library/legacy` bound to a native
module that is actually present. `mediaLibraryAvailable()` therefore returns true in Expo Go and
the Save button renders; whether the file reaches the gallery is still the device check.

Still device-gated, unchanged: everything in the Phase 3 native list below, plus reminder
delivery and Save to Photos, which now need a development build to be *proven* rather than a
development build to avoid crashing.

## Phase 3 implementation checkpoint — 2026-08-16

Phase 3 is now explicitly Kairo-owned GPS tracking, not Strava or another provider import.
The locked plan is in `docs/08-phase-3-movement-plan.md`: run/walk/ride, Android-first native
spike with iOS designed in, live map, background tracking, pause/autopause, default-on time
and distance voice cues, shared units, indefinite raw-point retention with edit revisions,
route replay, and Kairo backend upload only after completion.

Implementation is complete through the executable mobile/backend layers. Mobile schemas v7–v9
cover activities, raw points, lifecycle events, durable engine state, and reversible raw-point
edit exclusion. Expo Location, Task Manager, Speech, and React Native Maps are installed at
SDK-compatible versions. The module-scope background task opens/migrates the same SQLite
database, recovers active state, processes location batches, and persists points atomically
with summaries. Expo Go has a foreground `watchPositionAsync` fallback for today's UI testing;
background/screen-lock behavior still requires a custom Android development build.

Schema v8 stores autopause candidate timestamps and next voice-cue thresholds per active
activity. Movement settings expose metric/imperial units, default-on voice cues with separate
distance/time toggles, and autopause. The background task evaluates those settings, persists
autopause/voice events in order, and invokes local speech. Native voice behavior still needs
physical Android testing, especially with the screen locked and Bluetooth audio.

The first Movement UI is also wired: a sixth bottom tab, run/walk/ride readiness and
permission flow, live map with persistent recording, pause/resume and finish, completed
history/detail, and offline animated route replay with normalized 1x/2x/4x/8x speeds. The
live view now respects the shared metric/imperial preference, shows run/walk pace or ride
speed, separates moving and elapsed time, displays autopause explicitly, and lets the user
pan before recentering. Replay uses the same unit preference and a responsive scrubber.
Schema v8 recovery and default-on preference behavior have direct SQLite-backed tests. Schema
v9 adds trim/recompute persistence without deleting raw points. Completed activities enqueue a
movement aggregate only after completion; later edits enqueue higher revisions and deletes enqueue
idempotent removal. Backend migration `7e3b9a1c2d44` provides authenticated movement upload,
list/detail, revision replacement, ownership isolation, and replay-safe deletion.

Automated verification is green: mobile typecheck/lint, **376 tests across 18 suites** at this
checkpoint (**394 across 20** after the 2026-08-17 Expo Go fix above), backend
Ruff, **28 backend tests**, Alembic at head, Expo Doctor **21/21**, and Android/iOS exports.
Physical-device results have not yet been provided by the user. Background location, screen lock,
foreground-service notification, force-kill recovery, Bluetooth speech, battery use, and iOS
native behavior remain acceptance gates. `personal_test.txt` is the current Phase 2/3 runbook.

## Status

Phase 0 (monorepo scaffold) and all four Phase 1/P0 modules — **workout logging**,
**weight/progress charts**, **daily tasks & streaks**, and **macro/nutrition tracking** —
are implemented and verified.

Phase 1/P0 is now complete as a coherent daily app: Home aggregates all four local modules.
The full manual device smoke test is complete, including the Today/tasks workflow, locale
decimal inputs, and real bottom-tab icons. **Phase 2 is complete**: authenticated replay for
workouts, weight, tasks, and nutrition; deterministic motivation; Pillow wallpapers; and
local daily/weekly reminders are implemented and verified.
Sync is opt-in through Expo public configuration; without it the app stays fully offline.

**Git branch strategy**: `phase_1` preserves the completed Phase 1 snapshot at `ea80c37`.
Active Phase 2 lives on `phase_2`, which includes all Phase 1 history plus the complete
auth, workout/weight/task/nutrition replay implementation, motivation/reminder features,
tests, and documentation. `master` remains at the Phase 1 snapshot for now.
Confirm the real state with `git status --short` and `git log --oneline origin/master..HEAD`.

The completed Phase 2 slice is committed as `af5b2da` and the local branch is synchronized
with `origin/phase_2` at the time of this handoff.

The last pushed commits are:

| Commit | What |
|---|---|
| `af5b2da` | Complete workout replay, quotes, Pillow wallpapers, local reminders, tests, and docs |
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

### Backend — Phase 2 auth, replay, and motivation
`apps/backend/`, FastAPI + SQLModel + Alembic. Portability decision from an earlier
session: models use portable SQLAlchemy types so everything runs on SQLite locally, with
Postgres as the deployment target.

- Alembic migrations through `4d91e2f7c3ab` apply cleanly against SQLite. Workout and
  motivation endpoints use the existing reference schema; mobile reminder state is local
  schema v6 rather than a server migration.
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
- Workout sessions accept client UUIDs; sets preserve client UUIDs, resolve mobile seeded
  exercise IDs, return success for exact replay, and return `409` for conflicting reuse.
- `GET /api/v1/quotes/today?day=` returns a stable deterministic quote. The mobile app has
  an offline quote catalogue and Home widget. `POST /api/v1/wallpapers/generate` returns a
  validated 1080x1920 PNG as base64; the mobile wallpaper screen previews and saves it.

Workout, weight, task, and nutrition sync are implemented end to end when configured. Quotes,
Pillow wallpapers, and local daily/weekly reminders are also complete.

## Final Phase 2 verification (historical, commit `af5b2da`)

- Backend: `ruff check .` clean; `pytest -q` **24 passed**; `alembic upgrade head` reaches head.
- Mobile: `npm run typecheck` clean; `npm run lint` clean; `npm test -- --runInBand`
  **350 passed across 16 suites** at the Phase 2 commit. The current Phase 3 count is recorded
  at the top of this handover.
- Workout replay preserves client session/set IDs, accepts mobile seeded exercise IDs, and
  rejects conflicting ID reuse with `409`.
- Quotes are deterministic by calendar day; wallpaper tests decode a nonblank 1080x1920 PNG.
- Reminders persist in mobile schema v6 and schedule daily or selected-weekday notifications.

### Phase 2 implementation map

| Area | Backend | Mobile | Verification |
|---|---|---|---|
| Workout replay | `app/api/workouts.py`, workout schemas | `db/workouts.ts`, `db/outbox.ts`, `sync/outbox.ts` | `test_workouts.py`, outbox suite |
| Quotes | `app/api/motivation.py` | `domain/motivation.ts`, Home | `test_motivation.py`, motivation suite |
| Wallpapers | Pillow route in `app/api/motivation.py` | `app/(tabs)/wallpaper.tsx`, `src/services/mediaLibrary.ts` (legacy media-library entry), file system package | PNG decode test, Android export |
| Reminders | Deliberately device-local | `db/alarms.ts`, `src/services/notifications.ts`, `src/domain/reminders.ts`, schema/migration v6, `app/(tabs)/alarms.tsx` | `src/db/__tests__/alarms.test.ts`, `src/domain/__tests__/reminders.test.ts`; delivery still requires a device |

The Android `dist/` directory is a generated, ignored build artifact and is not part of the
source commit. Re-run the export when validating a fresh checkout.

### Mobile — implemented and verified
`apps/mobile/`, Expo SDK 57 + Expo Router (file-based) + expo-sqlite + Zustand.

Verified after the completed Phase 2 implementation:

- `npm run typecheck` (`tsc --noEmit`) → **0 errors**.
- `npm run lint` (`eslint .`) → **clean**, 0 errors 0 warnings.
- `npm test` → **350 passed across 16 suites**. The new suites cover durable outbox storage,
  atomic rollback, weight/task/nutrition wire payloads, auth refresh, ordered replay, backoff,
  and terminal errors.
- `npx expo-doctor` started all 21 checks, but this runner did not return its final summary;
  rerun it in an interactive shell before treating Doctor as a release gate.
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
- **Motivation**: Home shows the deterministic local quote for the current calendar day.
  The Wallpaper action authenticates when sync configuration exists, asks the Pillow API for
  a 1080x1920 PNG, writes it to cache, previews it, and saves it after Photos permission.
- **Reminders**: Home → Reminders → add or edit a label/time and optional weekday selection.
  Empty weekday selection means daily. Rows can be reopened for editing or deleted; updates
  cancel old native schedule IDs before creating replacements.

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
- **Unit preference**: movement has one shared metric/imperial preference in
  `user_preferences`, and live/replay displays read it. Strength sets still carry their own
  logged unit, and `suggestNextSet` falls back to kg with no history.
- **A native package Expo Go may lack is never imported at module scope.** Import it lazily
  behind a capability check in `src/services/`, expose a mode/availability function, and have the
  screen say which tier it is in. A static import is hoisted past every guard, and in Expo Router
  its failure presents as "Route ... is missing the required default export" rather than as the
  native error it is — see the 2026-08-17 section above for the day that cost.
- **Infra/CI written, not fully exercised**: Docker/Postgres and GitHub CI remain optional
  follow-up checks; they are not prerequisites for the current local movement work.

## Next session: Phase 3 physical acceptance and handoff

Do not restart the provider/integration decision. It is locked: Kairo records and owns its
movement data; there is no Strava connection, import, segment competition, social feature,
or third-party activity upload. Read `docs/08-phase-3-movement-plan.md` first for the complete
product and technical contract, then inspect the current dirty worktree before editing. The
user is committing the latest implementation changes. Do not create or amend commits unless
the user asks. Inspect `git status --short --branch` first. Preserve any pre-existing user
changes, especially `.devcontainer/setup.sh`.

The most useful code entry points are:

- `apps/mobile/src/domain/movement.ts` — pure GPS filtering, state transitions, timing,
  distance/pace/speed formatting, autopause, cue scheduling, and replay interpolation.
- `apps/mobile/src/db/schema.ts` and `src/db/migrations.ts` — append-only schemas v7, v8, and v9.
  v9 is defensive/idempotent because migration tests can rewind `user_version` on a current DB.
- `apps/mobile/src/db/movement.ts` — activity/point/event/history/edit queries and durable
  engine-state recovery. Point plus summary writes and event sequence allocation are
  transactional.
- `apps/mobile/src/services/movementTracking.ts` — module-scope Expo background task and
  start/stop APIs. Local SQLite is authoritative throughout an active recording.
- `apps/mobile/app/(tabs)/movement/` — readiness, active tracking, history/detail, replay,
  and settings screens.
- `apps/mobile/src/db/__tests__/movement.test.ts` and
  `src/domain/__tests__/movement.test.ts` — executable persistence and domain contracts.

The implementation is ready for a physical test run. Offer to check readiness, then direct the
user to run `personal_test.txt` themselves. Do not claim the native gate passed until the user
returns the completed checklist and device evidence. Continue in this order:

0. Relaunch Expo Go and confirm the app now renders: no `expo-notifications` error, no
   "missing the required default export" warning, no `ExpoMediaLibraryNext` error, and all six
   tabs reachable. That is the 2026-08-17 fix above, verified only by typecheck/lint/tests so
   far. Then run the Expo Go foreground sections of the runbook.
1. Run the Android development-build physical spike. Verify foreground/background permission
   flows, the foreground-service notification, screen-lock collection, manual and automatic
   pause/resume, force-kill recovery of already persisted points, map tiles, voice cues through
   speaker and Bluetooth, and representative battery consumption. Continued collection after
   force-kill is explicitly not guaranteed; persisted activity recovery is required.
2. Record the user's Android development-build results. Expo Go is not sufficient evidence for
   the background-service contract; use a development build on a physical Android device. Keep
   iOS compatibility in the API and schema design, but Android remains the first native target.
3. Fix any native issues exposed by that spike and rerun all automated checks. Continued
   collection after force-kill is explicitly not guaranteed; persisted activity recovery is
   required.
4. Run backend sync acceptance when API credentials are configured: offline completion, exact
   replay, higher-revision edit, delete, and cross-user isolation.
5. Perform later iOS native integration and physical validation using the same product contract.

Native reminder delivery/permission prompts and Wallpaper Save-to-Photos also still deserve
a physical-device smoke test, but they are Phase 2 follow-up checks rather than Phase 3
movement blockers. Workout polish items (RPE, set edit/delete, finish notes, rest-timer
threshold) remain explicitly deferred.

## Verification commands

```sh
# Backend
cd apps/backend && source .venv/bin/activate
ruff check .            # All checks passed!
pytest -q               # 28 passed
alembic upgrade head    # reaches head (idempotent)

# Mobile
cd apps/mobile
npm run typecheck       # tsc --noEmit, 0 errors
npm run lint            # eslint ., clean
npm test -- --runInBand # 394 passed (20 suites)
EXPO_NO_TELEMETRY=1 npx expo-doctor # 21/21
EXPO_NO_TELEMETRY=1 npx expo export --platform android --output-dir /tmp/kairo-phase3-android-export
EXPO_NO_TELEMETRY=1 npx expo export --platform ios --output-dir /tmp/kairo-phase3-ios-export
                        # both successful; telemetry disabled because the sandbox cannot write ~/.expo
```

If `node_modules` or `.venv` are missing (a fresh clone, or a cleaned machine):
`npm install` in `apps/mobile`; `python3 -m venv .venv && source .venv/bin/activate &&
pip install -e '.[dev]'` in `apps/backend`.

## Test harness (mobile)

`src/db/__tests__/testDb.ts` exposes `createTestDb()`: a thin adapter presenting Node's
built-in `node:sqlite` through the subset of the `SQLiteDatabase` interface the query layer
uses (`execAsync`, `runAsync`, `getAllAsync`, `getFirstAsync`, `prepareAsync`). Tests get the
real schema from `migrations.ts` and the real seed data, so SQL is exercised as written
rather than mocked. The movement query suite uses it alongside the existing module suites.

Four harness details to know before extending it:

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
