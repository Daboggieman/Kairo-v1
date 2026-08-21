# The movement module (The Expedition) — the brief, as it was decided

**This is now a record, not a to-do.** The module was written and verified on 2026-08-20; the departures
actually taken are in [`03-ui-rebuild-progress.md`](03-ui-rebuild-progress.md). Read this when you want
to know why a movement screen reads the way it does, or which gaps in the tracker it worked around.

Everything here was decided before any code was written. The six designs (`5.16`–`5.21`) were dumped and
read, the tracker's real schema was checked against them, and the vocabulary the domain layer needed is
specified below. The line counts in the table are the **pre-restyle** ones.

| File | Lines | Becomes | Design |
|---|---|---|---|
| `_layout.tsx` | 22 | — | — |
| `index.tsx` | 111 | **The Expedition** (tab root) | `5.16` |
| `new.tsx` | 112 | **The Threshold** (modal) | `5.17` |
| `active.tsx` | 158 | **The March** | `5.18` |
| `[activityId].tsx` | 206 | **The Chronicle** | `5.19`, `5.20` |
| `replay.tsx` | 103 | **The Retelling** | `5.21` |
| `settings.tsx` | 79 | **The Compass** | — |

Restyle in that order: `_layout` → `index` → `new` → `active` → `[activityId]` → `replay` → `settings`,
writing `src/domain/movement.ts` and its tests as the screens need them. `_layout` first because
`headerShown: false` has to land before any screen renders its own `AppBar`, or every push shows two
headers for one commit.

Read [`02-ui-rebuild-conventions.md`](02-ui-rebuild-conventions.md) before starting; the fold-in
checklist there names the five `.catch` guards and two `LogoLoader` swaps this module owes.

---

## The lexicon

Type names come from **`5.17`**, which states them in full. `5.16` writes the third one as "RIDE";
5.17 is the fuller statement and wins.

`MovementType` is **`'run' | 'walk' | 'ride'`** — note the third value is `ride`, and its
MaterialCommunityIcons glyph is `bike`. Do not write `'bike'` as an activity type.

| `MovementType` | Display | Gloss | Glyph |
|---|---|---|---|
| `run` | **Dromos** | the run | `run` |
| `walk` | **March** | the walk | `walk` |
| `ride` | **Chariot** | the ride | `bike` |

**"March" is overloaded, and this is the resolution.** It is both the walk *type* and the generic word
for an outing — and `active.tsx` is titled The March regardless of which type is recording. So: keep
Dromos / March / Chariot as the three type names, and use **"journeys"** for the generic count —
*"42 journeys · 318 km"*. A journey is recorded in **The Expedition**, lived through **The March**, and
written up in **The Chronicles**. Do not introduce a fourth word for it.

## What the tracker does not write — and what to do about it

Checked against the real schema and the real writers, not the designs:

- **`elevation_gain_meters` is never written.** Nothing computes it. So:
  - **Drop the CLIMB cell** from The Chronicle (`5.19`, `5.20` both show it). A cell that is always
    "0 m" is worse than an absent one — it reads as a flat route rather than as an unmeasured one.
  - **Drop the ELEVATION area chart** too. Raw GPS altitude is noisy enough that a gain figure needs a
    threshold gate to mean anything, and inventing that gate is a feature, not a restyle.
  - This is a **real tracker gap**, not a design error. Record it as such; it is the natural companion
    to whoever implements elevation.
  - **Update 2026-08-20 — the gap has a floor.** The *column* is unwritten, but **`altitude_meters` on
    every sample is written** (`src/services/movementTracking.ts:81` → the insert in
    `src/db/movement.ts`), so a gain figure is computable without a schema change; what is still
    missing is the threshold gate this section declined to invent for a restyle. Stage 3 budgets that
    function for The Pantheon — see
    [`12-stage-3-brief.md`](12-stage-3-brief.md). **The two drops above stand**: they are correct
    until that function exists, and re-adding the CLIMB cell is not Stage 3 work.
- **`paused_seconds` is only written by `trimMovementActivity`**, so it is unreliable as a live figure.
  Derive the design's HELD cell instead: `heldSeconds = elapsedSeconds - movingSeconds`. That is true by
  construction, whatever wrote the row.
- **No event records a pace peak.** `5.20`'s timeline entry *"Pace peaked at 4:10/km"* has no source.
  **Drop it.** The rest of the timeline is real — see below.
- **`MovementEvent.eventType` is typed `string`, not `MovementEventType`** (`src/db/types.ts:254`,
  `src/db/movement.ts:430`), and `movement/active.tsx:77` writes **`'finished'`**, which is *not* in the
  `MovementEventType` union (that has `'completed'`). Both spellings therefore exist in real rows.
  `describeMovementEvent` must handle both; a `switch` over the union alone would silently drop the finish
  event from every chronicle. Verified 2026-08-19 — do not "tidy" it into the union without a migration.

Two the designs get right and should be built:

- **THE SPLITS: implement it.** Every input is already loaded for the map — `cumulativeDistanceMeters`
  and `recordedAt` on the points. It is a pure function over an array, so it is a tested domain function,
  not screen arithmetic.
- **THE TIMELINE: implement it** from real `listMovementEvents` rows plus a domain
  `describeMovementEvent`.

## Screen by screen

### The Expedition — `index.tsx` (`5.16`)

- `ScreenHeader` titled THE EXPEDITION with **one outlined `IconButton icon="plus"`** in the action slot.
  The design's docked full-width *"Cross the threshold"* is dropped, per the convention.
- **The Compass becomes a `NavRow`** in the content. That is what makes dropping the footer safe: the
  header's `+` starts a journey, the row reaches settings, and nothing is stranded.
- **A live recording gets the accent left rule** — accent-soft `Card`, `borderLeftWidth: 4`,
  `borderLeftColor: colors.accent` — the same treatment as The Anvil's active lift, because it carries
  the identical meaning: *the one thing in play*. This widened the rule from "The Anvil only"; the note
  in [`02`](02-ui-rebuild-conventions.md) records that it is not to be widened again.
  `SessionElapsed prefix="In progress"` is the clock, exactly as The Forge uses it.
- The week strip is a `StatStrip` over `movementWeek` (below). Weekday initials are formatted **at the
  call site** from `WEEKDAY_LABELS`, not in the domain.
- The journey list is unbounded → **`FlatList`**, which means this screen reads `useSafeAreaInsets`
  itself and adds `insets.bottom + layout.scrollFooter` to `contentContainerStyle`.
- Aggregates render only when there is at least one journey; `EmptyState` gated on the loaded flag.

### The Threshold — `new.tsx` (`5.17`)

- `AppBar` **without `onBack`**, with `IconButton icon="close"` in the action slot.
- The three types are `Chip role="radio"` — name, gloss and glyph from `MOVEMENT_LABELS`.
- Density pass owed here (`spacing.lg` → `layout.screenPadding`, gaps → `layout.cardGap`).

### The March — `active.tsx` (`5.18`)

- **Keeps no back affordance at all.** It sets `headerBackVisible: false` deliberately today; the
  restyle must not reintroduce a chevron or a close glyph. The way out is finishing or discarding.
- The design's app-bar clock is the existing **`SessionElapsed`** — no new timer component.
- **"Hold to finish": keep the existing `Alert.alert` confirm and drop the hint text.** The confirm is
  the safeguard the hint describes; shipping both means the hint documents a gesture that does not exist.
- The performance figure (pace or speed) comes from `movementPerformance`, not from a branch in this file.

### The Chronicle — `[activityId].tsx` (`5.19`, `5.20`)

- `AppBar` with `onBack`. `LogoLoader` replaces the full-screen `ActivityIndicator`.
- Hero figures **2×2, not 1×4** — the same per-cell arithmetic as The Stele and The Feast.
- Cells: distance, moving time, pace/speed, **HELD** (derived). **No CLIMB.**
- **THE SPLITS** from `splits()`. **THE TIMELINE** from `listMovementEvents` +
  `describeMovementEvent`, dropping any event the describer returns `null` for.

### The Retelling — `replay.tsx` (`5.21`)

- `AppBar` with `onBack`. Keep the existing playback controls; restyle only.

### The Compass — `settings.tsx`

- No design export. Build it as a `RowGroup` of settings rows in the module's idiom, reached from The
  Expedition's `NavRow`. Density pass owed.

## `src/domain/movement.ts` — the vocabulary that was written

All seven exports below are **written and under test** as of 2026-08-20.
`src/domain/__tests__/movement.test.ts` grew from 12 `it` blocks to 26 (121 → 305 lines); the suite is
the record of what each one actually promises. The house style they follow is
`src/domain/weight.ts` — named constants at the top, one exported function per phrase, and a `null`
return wherever the data cannot justify an answer.

**`src/domain/movement.ts` already exports the primitives these compose over** — `formatPace`,
`formatMovementDistance`, `formatMovementSpeed`, `METERS_PER_MILE`, `haversineMeters`,
`movementThresholds` — plus the whole tracking engine (`processSample`, `transition`,
`evaluateAutopause`, `crossedCues`, `replayFrameAt`, `recomputeEditedRoute`). **Compose the new functions
over those; do not reimplement pace or distance formatting.**

| Export | Signature | Notes |
|---|---|---|
| `MOVEMENT_LABELS` | `Record<MovementType, {name, gloss, icon}>` | The table above. `run` / `walk` / `bike` glyphs. |
| `movementPerformance` | `({activityType, distanceMeters, movingSeconds}, unit) => {value, unit, label}` | **Consolidates the duplicated ride→speed / else→pace branch** currently written in both `index.tsx` and `active.tsx`. One place decides that a Chariot reports speed (`formatMovementSpeed`) and everything else reports pace (`formatPace`). |
| `splits` | `(points, unit) => Split[]` | Interpolates the boundary between the two points that straddle each unit mark rather than snapping to the nearer sample. Carries a `partial` flag on the final split, extrapolates its `secondsPerUnit` so it is comparable with the whole ones, and applies a **`MIN_SPLIT_METERS = 50`** floor so a 3-metre tail is not reported as a split. Unit length comes from `METERS_PER_MILE` / 1000. |
| `describeMovementEvent` | `(eventType: string) => string \| null` | `null` for `prepare`, `voice_cue`, `finish_requested` — machinery, not narrative. Takes a `string`, and handles **both** `'finished'` and `'completed'`, for the reason above. |
| `movementWeek` | `(activities, nowMs) => {count, distanceMeters, movingSeconds, days: [{day, distanceMeters}]}` | Windowed over the **last seven days ending today**, not a calendar week — which sidesteps locale week-start entirely. Weekday-initial formatting stays at the call site. |
| `formatExpeditionTotals` | `(count, distanceMeters, unit) => string` | *"42 journeys · 318 km"*. The fifth link in the domain-vocabulary chain. |
| `heldSeconds` | `(activity) => number` | `elapsedSeconds - movingSeconds`, floored at 0. Ignore the stored `pausedSeconds`. |

Test-writing rules that already bit this repo: assert against `n.toLocaleString()` rather than a literal
grouped number, and never pin the locale in a test — `jest.globalSetup.js` pins `TZ` only. See
[`08-verification.md`](08-verification.md).

## After movement

~~`alarms.tsx` and `wallpaper.tsx` still need §5.22 / §5.23 transcribing.~~ **Both are done** as of
2026-08-20 — The Call (430 lines) and The Oracle (312), which closes Stage 2 at 22 of 22. Their
departures are in
[`03-ui-rebuild-progress.md`](03-ui-rebuild-progress.md#stage-2--the-call-and-the-oracle).

Next: **Stage 3's five new screens** — Gates, Sanctum, Envoy, Pantheon, Annals.
