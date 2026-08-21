# Module reference — files, schemas, and the decisions embedded in them

One section per module, covering what each one is made of and the decisions a future change should argue
with rather than quietly reverse. The UI-side record of the restyle is in
[`03-ui-rebuild-progress.md`](03-ui-rebuild-progress.md); this file is about the data and logic underneath.

---

## The tasks module

### Files

| Path | Role |
|---|---|
| `src/db/schema.ts` | `CREATE_TASKS`, `CREATE_TASK_COMPLETIONS`, `CREATE_TASK_INDEXES`; introduced by schema v3 |
| `src/db/migrations.ts` | migration `version: 3` appended |
| `src/db/types.ts` | `TaskRow`/`Task`, `TaskCompletionRow`/`TaskCompletion`, `toTask`, `toTaskCompletion` |
| `src/domain/dates.ts` | shared calendar-day helpers |
| `src/domain/tasks.ts` | pure — recurrence parsing, streak walks, history grid, plus `formatProgress`/`formatStreak` |
| `src/db/tasks.ts` | 11 query functions |
| `src/components/Checkbox.tsx` | presentational tick box |
| `app/(tabs)/tasks/_layout.tsx` | Stack: `index`, `new` (modal), `[taskId]`; `headerShown: false` since the rebuild |
| `app/(tabs)/tasks/index.tsx` | the Today list — **The Rites** |
| `app/(tabs)/tasks/new.tsx` | add-task modal — **The New Rite** |
| `app/(tabs)/tasks/[taskId].tsx` | streak detail + history grid — **The Flame** |
| `app/(tabs)/index.tsx` | The Citadel's Rites card |

Tests: `src/domain/__tests__/tasks.test.ts`, `src/db/__tests__/tasks.test.ts`,
`src/domain/__tests__/dates.test.ts`.

### Schema (migration v3)

```sql
tasks(id PK, user_id, title, recurrence_rule DEFAULT 'daily', created_at, archived DEFAULT 0)
task_completions(id PK, task_id → tasks(id) ON DELETE CASCADE,
                 completed_date, completed_at, UNIQUE (task_id, completed_date))
```

- **No materialised `Streak` table**, though `docs/02-data-model.md` floats one. Streaks are derived from
  the completion rows. For one user with tens of habits the walk is trivial, and a stored counter is a
  second source of truth that drifts the moment a completion is deleted or arrives out of order over sync.
- **The UNIQUE constraint is the point of the table.** A habit is either done today or it is not, so a
  double-tap must not log it twice and inflate a count. That is what lets `setCompletion` be a plain
  `INSERT OR IGNORE`, makes `toggleCompletion` idempotent, and makes a replayed Phase 2 sync event
  harmless.
- **`completed_date` (local `YYYY-MM-DD`) and `completed_at` (the instant) are separate** — the same split
  as `body_weight_entries`, for the same reason: the day is what the streak counts, the instant is worth
  keeping.
- **`recurrence_rule` is stored as opaque text**, not normalised into flag columns, so Phase 2 sync moves
  one value rather than reconciling a set.

### The recurrence rule

A compact hand-rolled string, not an RRULE:

```
daily | weekdays | weekends | weekly:1,3,5 | interval:3
```

`weekly:` takes `getDay()` numbers, Sunday `0`. `interval:n` counts from the task's creation day.
`docs/02-data-model.md` suggests "daily/weekdays/custom RRULE", but a full RRULE parser is a dependency and
a large surface for a habit list whose realistic vocabulary is those five shapes. **`parseRecurrence` is
the contract**: an unrecognised, malformed or empty rule falls back to `daily` rather than throwing,
because a corrupt row should not take the Today list down with it. The add screen builds custom rules
through `formatRecurrence` so it cannot invent a rule the parser rejects — that round trip is tested.

### Streak semantics — read this before changing the walks

One function, `isScheduledOn(recurrence, day, anchorDay)`, decides whether a task was due on a day, and
**both** streak walks obey it. It returns false for any `day < anchorDay`. The consequences are deliberate:

- **Completions on unscheduled days are bonus work.** Ticking a weekdays habit off on a Sunday does not
  extend the streak and cannot bridge Friday→Monday, because the walk only ever looks at scheduled days.
  There is a test asserting the with-bonus and without-bonus answers are identical.
- **A completion dated before the task existed is ignored** by both walks — reachable from an edited row or
  a clock change. `longestStreak` used to start its walk at `Math.min(anchorDay, min(completedDays))`,
  which was dead code (`isScheduledOn` rejects those days anyway) and read as though it did something. It
  now starts at `anchorDay`, and the test asserts both walks agree at 0 rather than blessing a special
  case.
- **`currentStreak` grants today a grace day**: if today is scheduled and not yet done, the walk starts
  from yesterday, so an unfinished today neither counts nor breaks. A weekdays streak therefore survives
  the weekend — the case `docs/04-feature-specs.md` names explicitly, and it is tested.
- **`longestStreak` grants no grace day.** An open today simply ends the run being measured; the best
  already recorded stands.

`HistoryState` has five values on purpose: `done | missed | pending | unscheduled | future`. `pending`
exists so an unfinished *today* does not render as a rest day or as a miss. `[taskId].tsx` keys its cell
colours with `Record<HistoryState, ViewStyle>`, so adding a sixth state fails to compile until it has a
colour.

### Query layer

`completionDatesByTask(db, userId)` is **deliberately unbounded** — no `LIMIT`. A row limit would spend the
whole budget on whichever task sorted first and report every other task as streakless, which looks exactly
like lost data. If it ever needs bounding, bound it by *date* (`completed_date >= ?`), never by row count.
The same comment is in the source.

`toggleCompletion` is `clearCompletion` then `setCompletion`, returning the state it landed in (`true` = now
complete). `clearCompletion` reports `result.changes > 0` so the toggle can branch on it.
`listTasks(db, userId, includeArchived = false)` orders `created_at ASC`. Archived tasks keep their
completions and their `created_at`, so restoring one restores its streak — tested.

### Screen behaviour worth preserving

- The Today list is a `ScrollView`, not a `FlatList`. The list is bounded by how many habits a person
  keeps; virtualisation would cost more than it saves.
- `index.tsx` loads `listTasks` + `listArchivedTasks` + `completionDatesByTask` in one `Promise.all` inside
  `useFocusEffect`, and **refreshes `nowMs` in the same `load()`** so the list and the data always describe
  the same day. A phone left open overnight otherwise renders yesterday's schedule against today's
  completions.
- Toggling reads the **wall clock** (`new Date()`), not the captured `nowMs`, so a tick at 00:01 lands on
  the correct day even if the screen was loaded before midnight.
- `[taskId].tsx` is a one-shot `useEffect` load rather than a focus effect (the screen is pushed fresh each
  time); `load()` *returns* its data instead of setting state, so a late result can be dropped by the
  cancelled flag.
- Three stats on the detail screen — current, longest, and last-30-days as a rate — because a current
  streak alone is brittle to be judged on. 27 of 30 with yesterday missed reads as a streak of 1, and only
  the other two numbers say the user is doing well.

---

## The macros module

| Path | Role |
|---|---|
| `src/db/schema.ts` | `food_items`, `nutrition_entries`, `macro_targets`, indexes; `SCHEMA_VERSION = 4` |
| `src/db/migrations.ts` | append-only migration `version: 4` |
| `src/db/types.ts` | food, entry, target row/domain types and mappers |
| `src/domain/macros.ts` | pure serving math, daily totals, target comparison, meal grouping, the Feast lexicon |
| `src/db/macros.ts` | food search/create, day-log CRUD, effective-target queries |
| `app/(tabs)/macros/index.tsx` | **The Feast** |
| `app/(tabs)/macros/add.tsx` | **The Offering** |
| `app/(tabs)/macros/targets.tsx` | **The Decree** |

Tests: `src/domain/__tests__/macros.test.ts` and `src/db/__tests__/macros.test.ts`, including a populated
v3→v4 migration test and a real-query-output-to-domain-summary integration case.

### Decisions embedded in migration v4

- **Personal food library, no licensed nutrition dataset.** `food_items` belongs to a user and stores
  nutrition per a human-readable serving (`100 g`, `one scoop`). Search is case-insensitive substring
  matching over saved foods; `%` and `_` are literal because the query uses `instr`, not `LIKE`.
- **Quantity is a serving multiplier.** The food definition stays reusable while each
  `nutrition_entry.quantity` records `0.5`, `1`, `1.5`; pure domain math multiplies all four nutrients by
  it.
- **`logged_date` and `logged_at` are separate** — the day log reads the local `YYYY-MM-DD`, the instant
  records when the entry was added. Follows tasks and weight rather than deriving a local date inside SQL.
- **Targets are effective-dated.** Saving on a new date creates a target; saving again on the same date
  updates that row. A historical day uses the newest target whose `effective_date <= logged_date`, so
  changing today's plan does not rewrite old progress.
- **Food deletion is deliberately absent.** Entries reference a food definition without a cascade. The v1
  UI can delete a mistaken day entry but cannot orphan years of history by removing a library item.
- **Progress uses bars rather than rings.** `docs/04-feature-specs.md` permits either; bars render all four
  metrics legibly in a compact panel with no further chart dependency. The drawn fill caps at 100% while
  consumed totals and negative remaining values still preserve over-target information.
- **User ownership is enforced on writes.** `addNutritionEntry` uses `INSERT … SELECT` from a food row
  scoped to the same `user_id`, so a guessed food id from another future account cannot be attached to the
  current user's log.
- **`nutritionFor` takes `PerServing`**, not a whole `FoodItem` — see
  [`03-ui-rebuild-progress.md`](03-ui-rebuild-progress.md) for why.

---

## The Home dashboard — The Citadel

| Path | Role |
|---|---|
| `src/domain/dashboard.ts` | pure cross-module composition; delegates every calculation to its own module |
| `src/domain/__tests__/dashboard.test.ts` | schedules, streak risk, macros, trend weight, workout priority, empty state |
| `app/(tabs)/index.tsx` | the dashboard itself |

No schema, store, or dashboard-specific persisted state. **Home is a read model over the module tables**,
so it cannot drift from the screens it summarises.

- **One focus-time `Promise.all`.** The dashboard captures `nowMs`, derives the local day, and reads all
  modules together. Returning from a logging modal updates it immediately, and a phone left open across
  midnight moves every section to the new day together.
- **Existing domain functions remain authoritative.** Tasks route through `splitByDueToday`, macros through
  `summariseMacros`, weight through `dailyWeights`/`movingAverage`/`summarise`. Home carries no simplified
  copies of streak, target or calendar-window logic.
- **Unfinished tasks only in the preview** — at most three, in the exact priority order The Rites uses.
  Due/done/at-risk counts still cover the whole day.
- **Trend weight, not the latest raw reading** — the weight module's product decision, not reintroduced
  scale noise on the first screen.
- **An active workout wins.** An open session changes the card action to Resume and routes straight to the
  active screen; otherwise the most recent completed session is summarised.
- **Late reads are dropped.** The focus effect applies its result only if Home is still focused, so
  navigating away during a SQLite load cannot set stale state.

---

## The movement module — data layer

The UI was restyled on 2026-08-20; the brief that decided it is
[`04-movement-restyle-brief.md`](04-movement-restyle-brief.md) and the departures taken are in
[`03-ui-rebuild-progress.md`](03-ui-rebuild-progress.md). The layer underneath is complete and tested.

| Path | Role |
|---|---|
| `src/db/movement.ts` | 19 functions over schemas v7–v9 |
| `src/domain/movement.ts` | the pure tracking engine, the formatters, and the module's display vocabulary |
| `src/services/movementTracking.ts` | the background task, permissions, start/stop |
| `src/services/runtime.ts` | `IS_EXPO_GO`, re-exported from `movementTracking` |
| `app/(tabs)/movement/*` | six screens + `_layout`, **all restyled 2026-08-20** |

Tests: `src/db/__tests__/movement.test.ts` and `src/domain/__tests__/movement.test.ts` (26 cases).

**`src/db/movement.ts` entry points:** `createMovementActivity`, `getMovementActivity`,
`getActiveMovementActivity`, `listMovementActivities`, `setMovementStatus`, `completeMovementActivity`,
`editMovementActivity`, `trimMovementActivity`, `deleteMovementActivity`, `appendMovementPoint`,
`listMovementPoints`, `listRouteSamples`, `loadMovementState`, `appendMovementEvent`,
`appendNextMovementEvent`, `listMovementEvents`, plus the engine-state trio `createMovementEngineState` /
`getMovementEngineState` / `updateMovementEngineState`.

**`src/domain/movement.ts` exports** the types (`MovementType` = `'run' | 'walk' | 'ride'`,
`TrackingStatus`, `MovementEventType`, `LocationSample`, `AcceptedPoint`, `MovementState`,
`AutopauseState`, `CueSchedule`, `ReplayPoint`, `ReplayFrame`, `EditableMovementPoint`,
`RecomputedRoute`), the constants (`METERS_PER_MILE`, `DEFAULT_ACCURACY_LIMIT_METERS`), the formatters
(`formatPace`, `formatMovementDistance`, `formatMovementSpeed`), and the engine (`haversineMeters`,
`movementThresholds`, `createAutopauseState`, `evaluateAutopause`, `initialCueSchedule`, `crossedCues`,
`createMovementState`, `transition`, `replayFrameAt`, `processSample`, `recomputeEditedRoute`).

The 2026-08-20 restyle added the module's **display vocabulary** to the same file, so that wording the UI
depends on is tested once rather than repeated per screen: `MOVEMENT_LABELS`, `movementPerformance` (the
single ride→speed / else→pace branch, which used to be duplicated in `index.tsx` and `active.tsx`),
`splits` with `MIN_SPLIT_METERS` / `Split` / `SplitPoint`, `describeMovementEvent`, `movementWeek` with
`MovementWeek` / `MovementWeekActivity`, `formatExpeditionTotals`, and `heldSeconds`. Compose over these
rather than reformatting a pace or a distance at a call site.

Three things about it that are easy to get wrong:

- **`MovementEvent.eventType` is a plain `string`**, not the `MovementEventType` union — at both the row
  type (`src/db/types.ts:254`) and the writer (`src/db/movement.ts:430`). `movement/active.tsx` writes
  `'finished'` (grep for it; the restyle moved the line), which the union does not contain. Anything
  reading events must tolerate both spellings — which is why `describeMovementEvent` takes a `string` and
  handles `'finished'` and `'completed'` alike. Changing the written spelling would need a migration for
  the rows already stored, not an edit at the call site.
- **`elevation_gain_meters` exists on the row and is never written.** It is a tracker gap, not a UI one,
  which is why The Chronicle has no CLIMB cell and no elevation chart — a permanent zero reads as a flat
  route rather than an unmeasured one. Whoever implements elevation owns both. **Amended 2026-08-21:** the
  column is still never written and a `MAX` over it is still worthless, but the *figure* is now reachable
  without it — `altitude_meters` on each sample **is** written, `listRouteSamples` reads it, and
  `formatElevation` (`src/domain/movement.ts`) renders it. Once The Pantheon's
  elevation-from-sample-altitudes function exists, The Chronicle's CLIMB cell becomes re-addable from the
  same source. Not in Stage 3.
- **`paused_seconds` is only written by `trimMovementActivity`**, so derive held time from
  `elapsedSeconds - movingSeconds` instead of trusting it.
- **`listMovementActivities` defaults to `limit = 100`.** Harmless for The Expedition's list; wrong for
  anything claiming to read all of history. A caller that means "every activity" must say so explicitly —
  see The Pantheon's note in [`12-stage-3-brief.md`](12-stage-3-brief.md).

---

## Stage 3's new surface — sync, preferences, and the records reads

Added 2026-08-21 with The Envoy and The Gates. Grouped here rather than under a module because none of it
belongs to one: The Envoy is about the app itself, and The Pantheon reads across every module at once.

| Path | Role |
|---|---|
| `src/domain/envoy.ts` | pure — the sync vocabulary; 206 lines, 20 test cases |
| `src/db/preferences.ts` | four new keys and their accessors |
| `src/domain/dates.ts` | `startOfWeek`, `WeekStartDay`, `relativeTimeLabel`, `untilTimeLabel` |
| `src/components/LaunchRouter.tsx` | the onboarding redirect, a child of `SQLiteProvider` |
| `src/db/types.ts` | `RecordSet`, `RouteSample` |
| `src/db/workouts.ts` | `listSetsForRecords` |
| `src/db/movement.ts` | `listRouteSamples` |
| `src/domain/workouts.ts` | `formatLoad` |
| `src/domain/movement.ts` | `formatElevation`, `METERS_PER_FOOT` |

### `src/domain/envoy.ts`

`outboxState` (`due | waiting | failed`), `OUTBOX_STATE_LABELS`, `describeOutboxRow`,
`describeSyncState`, `describeRetryPolicy`, `formatEnvoyTotals`. The screen renders these and computes
nothing itself, which is what makes the wording testable — that is the same arrangement the movement
module arrived at with `MOVEMENT_LABELS` and `movementPerformance`.

- **Three states, because three is what a query can answer.** `SENDING` exists only inside one pass of
  `syncOutbox`'s loop and is never written down, so it is not a state the database can be asked about.
- **`describeRetryPolicy` takes `MAX_BACKOFF_MS` as an argument** rather than importing it. The screen
  passes the real constant, so the caption cannot drift from the behaviour; the test passes its own, so
  the assertion is about the sentence and not about the current cap.
- **A delivered intent leaves no trace.** `markSucceeded` deletes its row, so any "N delivered" figure
  needs a ledger table that does not exist. Do not add one to satisfy a design.

### The four preference keys

`UNIT_SYSTEM` predates these. New: `WEEK_START` (`getWeekStart`/`setWeekStart`, **Monday** default),
`FIRST_SCREEN` (`getFirstScreen`), `ONBOARDING_COMPLETE`
(`isOnboardingComplete`/`setOnboardingComplete`/`clearOnboardingComplete`), and `LAST_SYNC_AT`
(`getLastSyncAt`/`setLastSyncAt`).

- **`preferences` is key-value TEXT, so none of these needed a migration.** That is the property that made
  The Gates the cheap screen it is.
- **`LAST_SYNC_AT` is written only by a run that delivered something** (`succeeded > 0`), which is why the
  Envoy's row reads "Last delivered". `SyncBootstrap` calls in every 60 seconds, so "the loop ran" is
  almost always true and tells the reader nothing.
- **`clearOnboardingComplete` exists for The Sanctum's raze**, which must put the user back at The Gates
  rather than into an app with no data and no explanation.

### `startOfWeek`

`startOfWeek(day, weekStart)` in `src/domain/dates.ts`, on day indices like everything else in that
module. `WeekStartDay` is `'sunday' | 'monday' | 'saturday'`. The Annals' week navigator and The
Pantheon's perfect-week walk both take it from here; **`movementWeek` in `src/domain/movement.ts` stays
rolling-7-day and must not be unified with it** — a rolling total and a calendar week answer different
questions, and collapsing them would silently change what The Expedition's header means.

### The two records reads

Both are **deliberately narrower than the full row type** and both are the widest reads in the app, which
is the whole reason they are separate functions rather than a `LIMIT`-less call to an existing one.

- **`listSetsForRecords(db, userId) → RecordSet[]`** — every set ever logged, with its lift's name and its
  session's date. **Unbounded on purpose**: a `LIMIT` turns "your heaviest ever" into "your heaviest
  recently", which is the quiet wrong answer a records screen must not give. **Oldest-first**, so the
  first set to reach a figure is the one that dates the record and matching a best later does not move its
  date. `RecordSet` carries `sessionId` as well as `sessionStartedAt` because two sessions can share a
  timestamp, and grouping "heaviest session" by the date would merge them.
- **`listRouteSamples(db, userId) → RouteSample[]`** — accepted, un-excluded points from completed
  activities, ordered by activity then sequence. The Pantheon's one expensive read. **Paused samples are
  kept**: the ground still rises while a walker stands still, and dropping them would under-report a
  climb taken during a rest.

### `formatLoad` and `formatElevation`

- **`formatLoad(kg, unit)`** composes over `formatWeight` rather than repeating its rounding.
  `formatWeight` deliberately does not convert — a set is logged in a unit and shown back in that unit —
  but anything *derived* (an estimated 1RM, a heaviest-ever across sessions logged in both units) has been
  through `toKg` and carries no unit of its own, so the display unit becomes a preference. That is the
  distinction the two functions encode.
- **`formatElevation(meters, unit)`** prints whole units on purpose: `"148 m"`, `"486 ft"`. Elevation gain
  out of raw GPS altitude carries a real uncertainty of several metres, so a decimal would claim a
  precision the figure does not have. `METERS_PER_FOOT` is exported beside it because feet is the one
  figure read wherever miles are.

