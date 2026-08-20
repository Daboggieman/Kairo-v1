# Stage 3 — the five new screens: the brief, decided before any code

Stage 2 restyled 22 screens that already had data behind them. **Stage 3 is different: these five are
new, and four of them want figures the app does not currently produce.** So this document does for
Stage 3 what [`04-movement-restyle-brief.md`](04-movement-restyle-brief.md) did for the movement
module — the designs are read, every claim is checked against the real schema and the real writers, and
each gap is resolved *here*, before a screen is written.

Scope is [`docs/09-ui-rebuild-plan.md`](../docs/09-ui-rebuild-plan.md) §"New screens" (lines 233–279).
The conventions in [`02-ui-rebuild-conventions.md`](02-ui-rebuild-conventions.md) are binding.
Everything below was verified on **2026-08-20** against the files it cites.

| Screen | Route | Design | New domain module |
|---|---|---|---|
| **The Envoy** | `app/(tabs)/envoy.tsx` (hidden tab) | `5.26` | `src/domain/envoy.ts` (small) |
| **The Gates** | `app/gates.tsx` | `5.24` | — |
| **The Sanctum** | `app/sanctum.tsx` | `5.25` | — |
| **The Pantheon** | `app/pantheon.tsx` | `5.27` | `src/domain/pantheon.ts` |
| **The Annals** | `app/annals.tsx` | `5.28` | `src/domain/annals.ts` |

## Build order — and why it is not the plan's

The plan lists them "cheapest first". Build order is a different question from scope, and the
dependencies force one:

0. **`app/_layout.tsx` first.** It registers only `(tabs)` (`app/_layout.tsx:84`) and its
   `screenOptions` (line 78) do **not** set `headerShown: false`, so a new root route renders a native
   header over its own `AppBar` — the same two-headers-for-one-commit problem that put `_layout` first
   in the movement module.
1. **`src/db/preferences.ts` next** — four new keys, read by three screens. No migration: values are
   TEXT and the module's doc comment already states a key can be added without one.
2. **The Envoy** — self-contained.
3. **The Gates** — writes `ONBOARDING_COMPLETE`, `UNIT_SYSTEM`, `WEEK_START`.
4. **The Pantheon**, then **The Annals** — both need the week the Gates established.
5. **The Sanctum last.** It is the only screen that links to all four others; built last, none of its
   rows is a dead route.

## The four new preference keys

`src/db/preferences.ts` (keys at lines 12–18, typed accessors below them). Follow the existing house
shape: a `const` for the key, a typed getter with a safe default, a typed setter, and nothing outside
the module passing a raw key string.

| Key | Type | Default | Read by |
|---|---|---|---|
| `ONBOARDING_COMPLETE` | `'true'` \| absent | absent → walk The Gates | the root redirect |
| `WEEK_START` | `'monday'` \| `'sunday'` | `monday` | The Annals, The Pantheon |
| `FIRST_SCREEN` | a route name | `/(tabs)` | The Sanctum, the root redirect |
| `LAST_SYNC_AT` | ISO timestamp | absent → "never" | The Envoy, The Sanctum |

`LAST_SYNC_AT` is the one that is not free — see The Envoy.

---

## The Envoy — `app/(tabs)/envoy.tsx` (`5.26`)

A hidden tab (`href: null`, joining `alarms` and `wallpaper` at
`app/(tabs)/_layout.tsx:168-169`), pushed from the Citadel's Outer Ward and from the Sanctum. `AppBar`
with `onBack`, exactly as those two do.

### What the outbox really holds

`OutboxRow` (`src/db/outbox.ts:115`) carries `entity_type`, `entity_id`, `operation`, `payload`,
`created_at`, `attempts`, `last_error`, `next_attempt_at` — every field the design's rows show. Two
additive functions, as the plan says: **`listAll()`** beside `listDue`/`pendingCount`, and a retry
that **resets `next_attempt_at`** to now so a failed row becomes due again.

### Five things the design shows that have no source

- **"214 DELIVERED".** `markSucceeded` **deletes the row** (`src/db/outbox.ts:168`). There is no
  delivered ledger and building one is a new table, not a screen. **Drop the cell** — the stats strip
  becomes two, WAITING and FAILED, which is what the data can say. (Convention: aggregates render only
  when there is something to aggregate.)
- **"Last ran 12 minutes ago".** `SyncResult` (`src/sync/outbox.ts:28`) is returned in memory and
  never stored. **Decision: add it**, as `LAST_SYNC_AT` written by `syncOutbox` when a run completes.
  It is one preference write, needs no migration, and it is the single number that answers *is sync
  working?* — without it the whole hero card is decoration. Note that this makes `syncOutbox` a
  writer of preferences as well as a reader of the outbox; its existing suite should pin the write.
- **"Token expires in 41 minutes".** `SyncClient.tokens` is a **private field**
  (`src/sync/client.ts:24`) on an instance built fresh inside every `syncOutbox` call
  (`createSyncClient`, `src/sync/client.ts:119`). No token survives one sync and nothing parses `exp`.
  **Drop the row.**
- **"Forget Credentials".** The device key is a **build-time env constant** —
  `syncConfig.deviceKey` from `EXPO_PUBLIC_KAIRO_DEVICE_KEY` (`src/sync/config.ts:7`). There is
  nothing stored to forget, so the button would be a no-op that implies the app is holding a secret it
  could drop. **Drop it.** (The docked footer goes anyway, per the convention.)
- **"Retries: exponential, capped at 10m".** The real cap is `MAX_BACKOFF_MS = 60 * 60 * 1000`
  (`src/sync/outbox.ts:26`) — **one hour**. Print the true cap. This is the design being wrong about
  the app, not the app being wrong.

### The status vocabulary — three honest states, not the design's three

There is no persisted "SENDING": sending is transient inside one `syncOutbox` loop. What the row
actually distinguishes is `next_attempt_at`:

| State | Condition | Meaning |
|---|---|---|
| **DUE** | `next_attempt_at` ≤ now | goes on the next run |
| **WAITING** | `next_attempt_at` > now | backing off; show when |
| **FAILED** | `next_attempt_at IS NULL` | `markFailed` gave up (`src/db/outbox.ts:190`) |

`pendingCount` already counts the first two together (non-null), so FAILED is
`COUNT(*) WHERE next_attempt_at IS NULL`.

### `src/domain/envoy.ts` — a third new domain module, and why

The plan budgets only `pantheon.ts` and `annals.ts`. But the screen has to turn nine `SyncEntity`
values into module names, and *"wording that is tested lives in the domain layer, not at the call
site"* is a standing convention with five links in its chain already. No existing module owns sync
vocabulary, so this is a small new one:

| Export | What |
|---|---|
| `SYNC_ENTITY_LABELS` | `Record<SyncEntity, string>` → The Scales / The Rites / The Feast / The Forge / The Expedition (9 values collapse onto 5 modules) |
| `outboxState` | `(row, nowMs) => 'due' \| 'waiting' \| 'failed'` — the table above, in one place |
| `describeOutboxRow` | *"The Forge · 17 Aug"* + *"queued 3 minutes ago"* / *"failed 2 hours ago"* / *"next try in 4 minutes"* |
| `formatEnvoyTotals` | the two-cell strip's wording |
| `describeSyncState` | *"Configured · last ran 12 minutes ago"* / *"Not configured"* — also the Sanctum's Envoy row |

"Send now" is `requestSync(db)` (`src/sync/scheduler.ts:9`), already single-flight — it becomes the
`AppBar`'s one action, not a footer slab.

---

## The Gates — `app/gates.tsx` (`5.24`)

Three panels, horizontally paged, three dots. RN has no CSS scroll-snap: a `ScrollView`
`horizontal pagingEnabled` (or a `FlatList` of three) is the idiom, and the dots are three `View`s.

- **Panel 1 — KAIRO.** `KairoMark` plus the wordmark and the line *"One app for the work you owe
  yourself."* — product copy, not sample content, so it is kept. **`KairoMark`'s interior is opaque
  `colors.background`** (`src/components/Logo.tsx:13`), so this panel must not wrap it in a `Card`,
  the same reason the Citadel's brand block is a bare `View`.
- **Panel 2 — The Measures. Two rows, not three.** The plan's resolved divergence stands:
  `preferences.ts` has **one** `UNIT_SYSTEM` covering weight and distance, and the design's separate
  KG/LB and KM/MI toggles would mean auditing every `toKg` and `formatMovementDistance` call site to
  enable kilograms-with-miles, which nobody asked for. So: **one Units row** (metric/imperial) and
  **Week starts** (`WEEK_START`).
- **Panel 3 — The Gatekeepers: the checkboxes go.** An OS permission cannot be switched back off from
  inside the app, so a checkbox is a control that does not control its thing — the same objection that
  killed The Chronicle's always-zero CLIMB cell. And the app already requests each permission **at the
  point of first use**, deliberately: notifications inside `scheduleReminder`
  (`src/services/notifications.ts:169`, via the private `hasPermission`), location via
  `requestMovementPermissions` (`src/services/movementTracking.ts:148`), photos inside
  `saveImageToLibrary` (`src/services/mediaLibrary.ts`).
  **Decision:** three informational rows saying what each permission is for and that Kairo will ask
  when it first needs it — no checkbox, no fake state. Gate the copy on `notificationsMode()` and
  `mediaLibraryAvailable()` so Expo Go is not promised what it cannot do
  ([`06-architecture-decisions.md`](06-architecture-decisions.md) §"A native package Expo Go may
  lack").
- **"Cross the threshold"** writes `ONBOARDING_COMPLETE` and `router.replace`s to the tabs. A
  full-width button *in the content flow* is not the dropped docked footer — it is the panel's whole
  purpose, as on a modal.

### The redirect

The root layout renders `SQLiteProvider`, so it cannot itself call `useSQLiteContext`. **Follow
`SyncBootstrap`'s precedent** (`src/components/SyncBootstrap.tsx`): a small child component inside the
provider that reads the preference and `router.replace('/gates')` while it is unset. Mind
`react-hooks/set-state-in-effect` — derive from the query result rather than setting state in the
effect that reads it, the way `wallpaper.tsx` does.

**`IntroOverlay` already plays over the whole stack** on the first launch of a JS context
(`app/_layout.tsx`, module-scope `introPlayed`). On a genuine first install it will therefore play
*over* The Gates. That is acceptable — the intro is above the stack by design — and it is written down
so nobody reads it as a bug and "fixes" one of the two ceremonies away.

---

## The Sanctum — `app/sanctum.tsx` (`5.25`)

`AppBar` with `onBack`, `RowGroup` sections. Everything in The Foundations is real:

| Row | Source | Design's value |
|---|---|---|
| App version | `expo-constants` → `expoConfig.version` (`app.json:5` = `1.0.0`) | "Version 1.0.0" ✔ |
| Database version | `SCHEMA_VERSION` (`src/db/schema.ts:11` = `9`) | "9" ✔ |
| Runtime | `IS_EXPO_GO` (`src/services/runtime.ts`) | "Expo Go" ✔ |
| Device | `Platform.OS` + `Platform.Version` | "Android 15" ✔ |

The rest of the sections: **The Measures** (Units, Week starts, First screen), **The Herald**
(Reminders → The Call, with a live count from `listAlarms`; Movement cues → The Compass, summarised
from `getMovementPreferences`), **The Envoy** (one row, `describeSyncState`), **The Record** (Export
everything, The Pantheon, The Annals).

### The toggle becomes a `Chip` pair

The plan rules out RN's `Switch` (it cannot be squared off) and suggests a `Pressable`. But the house
already has a two-state control in use for exactly this: **`Chip role="radio"`**, as the movement
types and the day toggles use it. **Decision: render KG/LB, MON/SUN and metric/imperial as a pair of
`Chip role="radio"`** and add no new component. It is accessible, already themed, and it makes the
current value legible rather than inferring it from a knob's position.

### Export everything — the one thing in Stage 3 that wants a new dependency

`expo-file-system` is installed (`~57.0.4`) and the house uses its `/legacy` entry, so writing the
JSON is solved. **Handing the file to the user is not.** There is no `expo-sharing` in
`package.json`, and RN's own `Share` takes a message string on Android — a whole-database dump as a
message is not a file.

**Recommendation: `npx expo install expo-sharing`**, lazily required and shape-checked exactly like
`src/services/mediaLibrary.ts`, so a runtime without it disables the row instead of killing the
screen. It is Expo-bundled, so it stays inside `expo install`'s version management.
[`06-architecture-decisions.md`](06-architecture-decisions.md) asks that a dependency be a decision
rather than a reflex — **so this one is flagged for the user, not taken here.** If the answer is no,
the honest fallback is to write the file to the document directory and show the path, which is useful
on Android and useless on iOS.

### Raze local data — two things that are easy to get wrong

Nothing like this exists yet. Two traps:

1. **It must re-seed.** The exercise catalogue is seeded *inside migration 1*
   (`src/db/migrations.ts:55` → `seedExercises`). A `DELETE FROM` sweep that skips it leaves The
   Armory empty and no workout can be logged again.
2. **It must cancel the scheduled notifications.** The OS keeps firing reminders whose rows no longer
   exist; every alarm's `notificationId` needs `cancelReminder` before the sweep.

Do **not** reach for `deleteDatabaseAsync`: the handle is open and shared through `SQLiteProvider`.
`DELETE FROM` every table inside one transaction, re-seed, then reset `ONBOARDING_COMPLETE` so the
next launch walks The Gates. New `src/db/maintenance.ts` holding `razeLocalData(db)` and
`exportEverything(db)`, tested against the in-memory database like the other `src/db/__tests__` suites.
Outlined-danger button, behind an `Alert.alert` confirm — the same safeguard The March uses for
"finish".

### Reaching it from the Citadel

**The Citadel is the one tab root with no `ScreenHeader`** — its brand block is a bespoke `View`,
because `KairoMark` needs `colors.background` (`app/(tabs)/index.tsx:142-159`). So the Sanctum's
entry is an `IconButton` placed in that brand row, not a `ScreenHeader action`. The Outer Ward
(`app/(tabs)/index.tsx:314-320`) grows from two rows to four with The Pantheon and The Annals.

---

## The Pantheon — `app/pantheon.tsx` (`5.27`), `src/domain/pantheon.ts`

Mostly a composition of vocabulary that already exists and is tested: `bestOneRepMax`,
`estimateOneRepMax`, `sessionVolume`, `toKg`, `formatWeight`, `formatTonnage` from `workouts.ts`;
`formatPace`, `formatMovementDistance` from `movement.ts`; `longestStreak`, `completionDatesByTask`
from the tasks side; `movingAverage` from `weight.ts`. **Compose over those; do not reimplement a
formatter** — a figure has exactly one formatter.

### "Greatest climb" — the plan's justification is wrong, its remedy is right

The plan says *"`elevation_gain_meters` is already stored, so 'greatest climb' is a `MAX`"*. The
column exists (`src/db/types.ts:113`) but **nothing writes it** — that is precisely the tracker gap
[`04-movement-restyle-brief.md`](04-movement-restyle-brief.md) recorded, and why The Chronicle's CLIMB
cell was dropped. A `MAX` over it returns 0 for every activity ever recorded.

What *is* written is **`altitude_meters` on every sample** — `location.coords.altitude`
(`src/services/movementTracking.ts:81`) → the insert at `src/db/movement.ts:364`, typed
`number | null` at `src/db/types.ts:120`. So the figure comes from the plan's **other** sentence: the
new *"elevation gain from sample altitudes"* pure function. It needs

- a **named noise threshold** as a constant (raw GPS altitude is noisy; this is the gate the movement
  brief refused to invent *for a restyle* — Stage 3 is new work and the plan budgets a tested function
  for it),
- **null-safety**, since altitude is frequently absent, and
- an acknowledgement that it is the screen's **one expensive read**: it needs every activity's points,
  not just the activity rows.

**Once it exists, The Chronicle's CLIMB cell becomes re-addable — but not in Stage 3.** Out of scope;
noted so the connection is not lost.

### Two more figures that need a rule, not just a query

- **The "NEW" badge** has no source. It needs a recency rule — *set within the last N days*, N a named
  constant, computed against `nowMs`. Cheap, and it is what makes the screen feel current; define it in
  the domain rather than at the call site.
- **"Perfect weeks"** needs both a week definition (→ `WEEK_START`, which is why this screen comes
  after The Gates) and a rule for *perfect*: every scheduled rite kept on all seven days, via
  `isScheduledOn` + `anchorDayOf` + the completion set.
- **"Greatest 30-day fall"** is a rolling window over the trend series — a new pure function, not
  screen arithmetic.

### Non-negotiables

- Every row must be **null-safe**: a new user has no records at all. House style is a `null` return
  wherever the data cannot justify an answer; a row with no answer is absent, and a screen with no
  answers is an `EmptyState`.
- **The footnote is kept verbatim**, per the plan: *"Feats are derived from your own records. Nothing
  here is a target."* It is the honest description of the screen and what stops it becoming a goals
  feature.

---

## The Annals — `app/annals.tsx` (`5.28`), `src/domain/annals.ts`

### This screen introduces the calendar week the app has so far refused

`movementWeek` is a **rolling** seven days, and its comment says why in as many words: *"The last
seven days ending today — deliberately **not** the calendar week… A calendar week has to pick a first
day, and that answer is locale-dependent"* (`src/domain/movement.ts:589`). The Annals cannot be
rolling — it has prev/next and a week label — so `annals.ts` owns `weekStart` / `weekRange` /
`weekNumber`, driven by the `WEEK_START` preference that The Gates now sets. That is the answer to the
question `movementWeek` sidestepped, and it does **not** retroactively apply to `movementWeek`:
the two answer different questions and **must not be unified**.

Consequence worth stating: with `WEEK_START = sunday`, an ordinal week number will disagree with an
ISO week number, which is Monday-based by definition. **Derive the ordinal from the chosen start** and
accept that; the date range beneath it (*"11 – 17 August"*) is unambiguous either way.

### Data gaps

- **The macros module has no range reader.** `listNutritionEntriesForDate`
  (`src/db/macros.ts:162`) and `getMacroTargetForDate` (`:233`) are both per-date, so a week is 14
  queries. Add `listNutritionEntriesBetween` and `listMacroTargetsBetween` — additive, changing no
  existing contract.
- **`LineChart` lacks the two props the plan names.** Its `Props` type
  (`src/components/LineChart.tsx:45`) has `points`, `trend`, `goal`, `height`, `formatValue`,
  `emptyLabel` — no `showAxis`, no `pointsDashArray`. Add them optional, and keep every bit of geometry
  in the tested `src/domain/chart.ts`; that split is the whole reason the chart is hand-rolled.
  Previous-versus-current maps straight onto `points` (thin, muted) and `trend` (accent).
- The day strips are **plain views, not SVG**, per the plan.

### The verdict block must not take the design's left rule

The design gives it `border-l-4 border-l-primary-container`. **The accent left rule is reserved** for
*"the one thing in play"* — The Anvil's active lift and The Expedition's live recording — and
[`02-ui-rebuild-conventions.md`](02-ui-rebuild-conventions.md) says in as many words that it is not to
be widened again. The verdict is a **computed read-back of the week**, which is exactly the third
surface: **an accent-soft `Card` with an accent `CardHeader`**. That mapping is not a compromise; it is
the correct one.

The verdict's sentence itself is **generated prose and therefore tested domain wording**. The design's
*"A held week. Five rites kept every day…"* is sample content: do not transcribe it — write the
generator.

### "What slipped" — two of the three kinds are real

Missed rites (from `historyGrid`) and macros over on N days (from `checkDecree`) are both real.
*"Sunday long run — not recorded"* implies a **planned** movement schedule, and nothing in the app
plans a run — so it has no source and is **dropped**, the same call the movement brief made on
`5.20`'s *"Pace peaked at 4:10/km"*.

### Chrome the design shows that this screen does not have

It draws the bottom tab bar; The Annals is a **pushed root screen**, so there is no tab bar and the
way back is `AppBar onBack`. Its footer *"The previous reckoning"* duplicates the navigator's own left
chevron — dropped.

---

## What Stage 3 adds, in one list

| Layer | Change |
|---|---|
| `app/_layout.tsx` | register the four root routes with `headerShown: false` + the onboarding redirect child |
| `src/db/preferences.ts` | four keys and their typed accessors |
| `src/db/outbox.ts` | `listAll()`, retry-resets-`next_attempt_at` |
| `src/db/macros.ts` | two range readers |
| `src/db/maintenance.ts` | **new** — `exportEverything`, `razeLocalData` |
| `src/sync/outbox.ts` | write `LAST_SYNC_AT` on completion |
| `src/components/LineChart.tsx` | `showAxis`, `pointsDashArray` |
| `src/domain/envoy.ts` | **new** — sync vocabulary |
| `src/domain/pantheon.ts` | **new** — records, incl. elevation-from-samples and the rolling 30-day fall |
| `src/domain/annals.ts` | **new** — the calendar week, the four aggregates, the verdict generator |
| `app/(tabs)/index.tsx` | Sanctum `IconButton` in the brand row; Outer Ward 2 rows → 4 |
| `app/(tabs)/_layout.tsx` | `envoy` as a third `href: null` tab |
| dependency | **`expo-sharing` — the user's decision, not taken here** |

Three new domain suites mean the test count will move well past 494. **Measure it; do not predict it**
— see [`08-verification.md`](08-verification.md).

## Icons

Every Material Symbols name in these five exports is already mapped in the verified table in
[`05-design-handoff.md`](05-design-handoff.md) — including `shield_with_heart` →
`shield-crown-outline`, `sports_martial_arts` → `karate`, `sprint` → `run-fast`, `speed` →
`speedometer`, `terrain` → `terrain`, `trending_down` → `trending-down`. **Use the table.** A wrong
glyph name renders as a box, not an error.

## Delivery gate 8

The plan asks for *"a wipe-and-reinstall to walk The Gates once, and a Sanctum export/raze
round-trip"*. Both are device work and belong to the user, like every other native gate.
