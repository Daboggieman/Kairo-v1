# Current state — 2026-08-21

The status board. Everything here is dated; if a claim is older than the work, distrust it and
re-measure.

## What is being built right now

The complete Greek-themed UI rebuild. The brief, in the user's words: *"i want to rebuild the ui
completely … dark masculine greek themed app for Kairo maintaining the same logo and accent color of
the logo"*. Every screen is renamed on a Greek lexicon — The Citadel (dashboard), The Rites (tasks),
The Forge (workouts), The Feast (macros), The Scales (weight), The Expedition (movement), The Call
(reminders), The Oracle (wallpaper).

`docs/09-ui-rebuild-plan.md` is the **locked scope**: the lexicon, the screen → route map, the
colour/spacing substitution table, the token changes, the five new screens, the delivery gates.

| Stage | State |
|---|---|
| **Stage 0 — foundations** | **Done.** Theme tokens, Cinzel, all 25 `Layout` primitives, `Button`, `Checkbox`, `Logo`. |
| **Stage 1 — shell** | **Done.** `app/(tabs)/_layout.tsx` is the six-tab Canon bar. |
| **Stage 2 — 22 screens** | **Done — 22 of 22.** The Citadel (1), the tasks module (3), the workouts module (4), the macros module (3), the weight module (3), the movement module (6), The Call and The Oracle (2) — plus each module's `_layout.tsx`. |
| **Stage 3 — 5 new screens** | **In progress — 2 of 5 built.** The Envoy and The Gates landed 2026-08-21 (plus `LaunchRouter` and the route registrations). The Pantheon has its vocabulary and both database reads but no domain module and no screen. The Annals and The Sanctum are not started. Scoped for all five in [`12-stage-3-brief.md`](12-stage-3-brief.md). |

Detail on what landed and why: [`03-ui-rebuild-progress.md`](03-ui-rebuild-progress.md). The rules the
Stage 3 screens must follow: [`02-ui-rebuild-conventions.md`](02-ui-rebuild-conventions.md).

## The resume point — The Pantheon

Stage 3 is **two screens in**. The Envoy (`app/(tabs)/envoy.tsx`, 386 lines) and The Gates
(`app/gates.tsx`, 533) were built 2026-08-21 against [`12-stage-3-brief.md`](12-stage-3-brief.md),
along with `src/components/LaunchRouter.tsx` (56), `src/domain/envoy.ts` (206) and its 20-case suite,
the four new preference keys, and `startOfWeek` / `relativeTimeLabel` / `untilTimeLabel` in
`src/domain/dates.ts`. **The test count moved 494 → 523 across 20 → 21 suites.** What landed and every
departure taken:
[`03-ui-rebuild-progress.md`](03-ui-rebuild-progress.md#stage-3--the-envoy-and-the-gates). A per-step
build table, including what is still to write:
[`12-stage-3-brief.md`](12-stage-3-brief.md#build-state--measured-2026-08-21).

**Two divergences from the brief are worth knowing before you touch either screen.** The Envoy is
reached from The Sanctum only — the Citadel Outer Ward row was dropped — so it currently has **no entry
point in the running app**, which is expected and clears when The Sanctum lands. And `LAST_SYNC_AT` is
written only by a run that *delivered* something (`succeeded > 0`), so its row is labelled "Last
delivered", not "Last ran".

**Next: The Pantheon** (`src/domain/pantheon.ts` + `app/pantheon.tsx` + a suite). Its **groundwork has
landed** and its domain module has not:

| Landed | Still to write |
|---|---|
| `formatLoad`, `formatElevation` + `METERS_PER_FOOT` (`src/domain/{workouts,movement}.ts`) | every function in `src/domain/pantheon.ts` |
| `RecordSet`, `RouteSample` (`src/db/types.ts`) | `app/pantheon.tsx` |
| `listSetsForRecords`, `listRouteSamples` (`src/db/{workouts,movement}.ts`) | `src/domain/__tests__/pantheon.test.ts` |

The rules each remaining function needs — the elevation noise floor and its hysteresis, the fastest-5K
two-pointer, why perfect weeks are walked *backwards* from the last fully elapsed week, and why dates
are carried as day indices rather than formatted strings — are in the brief's "Still to write" list.
Then The Annals, then The Sanctum last.

**One decision The Pantheon must take and has not:** `listMovementActivities` defaults to
`limit = 100`, a silent cap a records screen must not inherit. The intended fix is an exported
`NO_LIMIT = -1` in `src/db/movement.ts` — SQLite treats a negative `LIMIT` as unbounded — passed
explicitly at the Pantheon's call site so the cap is visible in the code that wants no cap.

Two things still need the user, and neither is started:

- **`expo-sharing` is not installed**, and The Sanctum's "export everything" cannot hand a file to
  the user without it (RN's own `Share` takes a message string on Android). A dependency is a
  decision here, so it is flagged, not taken. **Ask before starting The Sanctum**, not during.
- **The Oracle's quote set** — open item 5 below, unchanged.

**Where The Sanctum is reached from is now settled**, and was an open question here on 2026-08-20: it
is an `IconButton` in The Citadel's brand row (`app/(tabs)/index.tsx:162`, `router.push('/sanctum')`),
which is what the brief proposed. The Citadel is the one tab root with no `ScreenHeader` — its brand
block is bespoke, because `KairoMark`'s interior is opaque — so there was no header to hang it in.

The rebuild hangs the Pantheon and the Annals off The Citadel's Outer Ward row group, and those two
rows are **already in place** (`index.tsx:331` and `:336`), pushing routes whose files do not exist
yet. That is the source of the three expected `tsc` errors below.

**Two things the Stage 2 close-out turned up, neither of them blocking, both still true:** the
`flexShrink: 1` day-toggle fix, now a convention in
[`02-ui-rebuild-conventions.md`](02-ui-rebuild-conventions.md); and The Oracle's modern-versus-classical
quote set, which is open item 5.

**One tracker gap the movement pass found and did not paper over:** `elevation_gain_meters` is never
written by anything, so The Chronicle's CLIMB cell and elevation chart were dropped rather than
rendered as a permanent zero. Whoever implements elevation owns both.

**Stage 3's read of that gap found the way out**, and it mattered because the locked plan got it
wrong: `docs/09-ui-rebuild-plan.md` justified the Pantheon's "greatest climb" as *"a `MAX`"* over
that column, which would return 0 for every activity ever recorded. **`altitude_meters` on each
sample *is* written** (`src/services/movementTracking.ts:81` → the insert in `src/db/movement.ts`), so
the figure comes from the plan's other sentence — the new elevation-from-samples function, which is why
`formatElevation` and `listRouteSamples` exist. The wrong sentence is now **struck in place** in the
plan with a dated correction, because it had been acted on once. Once the function exists, The
Chronicle's CLIMB cell becomes re-addable; **not in Stage 3**. Reasoning in
[`12-stage-3-brief.md`](12-stage-3-brief.md#the-pantheon--apppantheontsx-527-srcdomainpantheonts).

## Verification — measured 2026-08-21

Run from `apps/mobile`, after The Envoy and The Gates and the Pantheon groundwork:

| Check | Result |
|---|---|
| `npx jest` | **21 suites passed, 523 tests passed, 0 failures** (60 s cold, less warm) |
| `npx eslint .` | clean, exit 0 — the gate is 0 errors / 0 warnings |
| `npx tsc --noEmit` | **3 errors, all expected** — see below |

Suites covered: `db/{alarms,tasks,workouts,weight,macros,movement,outbox}`, `store/workoutStore`,
`sync/sync`, and
`domain/{tasks,movement,macros,weight,workouts,dashboard,reminders,motivation,chart,dates,numbers,envoy}`.

**The three `tsc` errors are the same shape and are not a regression.** `experiments.typedRoutes` makes
expo-router generate an `Href` union from the route files that exist, and The Citadel already pushes
three routes whose files do not:

| Where | Route |
|---|---|
| `app/(tabs)/index.tsx:162` | `/sanctum` |
| `app/(tabs)/index.tsx:331` | `/pantheon` |
| `app/(tabs)/index.tsx:336` | `/annals` |

Each clears the moment its screen file is created — proven when `app/gates.tsx` landed and cleared both
`/gates` errors without any change to the pushing code. **`tsc` returns to clean when Stage 3 finishes,
and not before.** Do not "fix" these by casting.

**This supersedes every earlier count in the handover** (350/16, 376/18, 394/20, the never-measured
"426 expected", 481/20 from 2026-08-19, and 494/20 from 2026-08-20). The +29 over 494 is
`envoy.test.ts` (20 cases) plus the new `dates.ts` cases.

**Still not run at all:** any device pass. Delivery gate 4 — *each module restyled and run on a device
before the next is started* — is therefore half-satisfied for all of Stage 2, and gate 8 (a
wipe-and-reinstall to walk The Gates once) is now due and unrun. So are `npx expo export` (both
platforms) and `expo-doctor`, which predate the rebuild. Those belong to the user; see
[`08-verification.md`](08-verification.md).

## Working tree — branch `phase_3`

**All of Stage 2 and the Stage 3 code so far are committed**, the latest in **`ox-08`** (`50a82e3`) —
19 files, 1,963 insertions — which is the whole of The Envoy and The Gates plus the Pantheon
groundwork. Nothing here stages or commits on its own; every commit in the table below was the user's.

**This section does not list the current tree**, deliberately: it went stale three times in one session,
once because the commit that made it stale happened while it was being written. Run
`git status --short --branch` — that is the answer, and it is never older than the moment you ask.


What `ox-07(2)` fixed is worth keeping, because both were **pre-existing misses from the movement pass**
rather than from the Stage 2 close-out, and both were the same shape — a **future-tense claim about work
already done**, which reads as current until someone opens the file it describes:

| File | The stale claim |
|---|---|
| `02-ui-rebuild-conventions.md` | the `movement/active.tsx` exception still named `headerBackVisible: false` and said it "must survive the restyle"; the restyle had already moved that intent to `gestureEnabled: false` in `movement/_layout.tsx` |
| `04-movement-restyle-brief.md` | its "After movement" section still said `alarms.tsx` (391 lines) and `wallpaper.tsx` (211) needed §5.22 / §5.23 transcribing |

The same audit found the resume point living in **three** files, drifting in two of them. It is now in this
document only; [`README.md`](README.md) and the root `to_continue_with.md` link here instead of restating
it, and the root file was cut to a pure redirect that holds no facts of its own.

| Commit | Date | What |
|---|---|---|
| `50a82e3` | 2026-08-21 | `ox-08` — **The Envoy and The Gates**: both screens, `LaunchRouter.tsx`, `domain/envoy.ts` + suite, the four preference keys, `dates.ts`'s four additions + cases, the Citadel's Sanctum door, and the Pantheon groundwork (`db/types.ts`, `db/workouts.ts`, `db/movement.ts`, `domain/workouts.ts`, `domain/movement.ts`) |
| `1e02a21` | 2026-08-21 | `ox-07(4)` — handover corrections (`01-current-state.md`, `05-design-handoff.md`, `README.md`) |
| `27a02bf` | 2026-08-21 | `ox-07(3)` — [`12-stage-3-brief.md`](12-stage-3-brief.md) itself (376 lines), and `to_continue_with.md` cut to a redirect |
| `cac8cfa` | 2026-08-20 | `ox-07(2)` — the doc-audit fixes: the two stale future-tense claims above, and the resume point collapsed to one copy |
| `32870e5` | 2026-08-20 | `ox-07` — **the whole of Stage 2 past the weight module**: the movement module (7 files) + `movement.ts` + its suite, The Call, The Oracle, `motivation.ts`, the `tasks/new.tsx` `flexShrink` fix, and the handover updates |
| `89499ba`, `c8ceed9` | 2026-08-20 | merges of PR #14 (`master`) and PR #13 (`phase_3`) |
| `85960e2` | 2026-08-19 | `ox-06(4)` |
| `f46dca7` | 2026-08-19 | `ox-06(3)` — the `personal_test.txt` rewrite, `docs/07-repo-structure.md`, the `dates.test.ts` comment repoint |
| `7d744c9` | 2026-08-19 | `ox-06(2)` — the `HANDOVER_DOCS/` split itself, plus the `README.md` / `docs/README.md` / roadmap / rebuild-plan repoints |
| `369531c` | 2026-08-19 | `ox-06` — carries the weight module (and the last touch to `apps/backend/.env`) |
| `fff186f`, `65521f2` | 2026-08-18 | `end of day commit` ×2 — the earlier rebuild work; `65521f2` also carries the `ui_rebuild_stitch_prompt.md` deletion |
| `92c21da` | 2026-08-18 | merge of `phase_3` from the remote |
| `e164a93` | 2026-08-18 | the 30 Stitch designs under `media/stitch/` |

`phase_3` is **16 ahead / 0 behind `origin/master`** as of 2026-08-21. It was 13/0 after `ox-07`, 11/0
before it, and 8 ahead / 1 behind on 2026-08-19, so the user merges and pushes between sessions. That
also retires three warnings the handover used to carry: "nothing is committed", "part of it is already
in the index", and the unstaged `ui_rebuild_stitch_prompt.md` deletion.


Confirm the real state with `git status --short --branch`, `git log --oneline -5` and
`git rev-list --left-right --count origin/master...HEAD` rather than trusting this table — the user
merges and pushes between sessions, so any commit list here dates the moment it was written.

## Open items — none of them blocking

1. **`apps/backend/.env` is tracked in git and holds non-example `DEVICE_KEY` and `JWT_SECRET`
   values** (last committed in `369531c`). `.gitignore`'s secrets block has the `!.env.example`
   exception but no `.env` pattern, so nothing was ever ignoring it. Remedy and reasoning in
   [`11-module-pattern-and-hygiene.md`](11-module-pattern-and-hygiene.md) — it needs the user's
   decision, because it means rotating two secrets, not just a `git rm --cached`.
2. **`apps/backend/.venv` is absent.** Recreate with
   `python3 -m venv .venv && source .venv/bin/activate && pip install -e '.[dev]'` before any backend
   check.
3. **Four Expo packages a patch behind** — `expo-location`, `expo-notifications`, `expo-router`,
   `expo-task-manager`, as reported by `npx expo install --check` before the Cinzel install rebuilt
   `node_modules`. The recommendation was to leave them (nothing observed traces to those versions) and
   the user has not decided. Worth re-running `--check` to see whether the drift is still the same four.
4. **Workout polish** — RPE, set edit/delete, finish notes, rest-timer threshold — remains explicitly
   deferred, and the rebuild does not add it.
5. **The Oracle's quote set is modern, the design's is classical.** `QUOTES` in
   `src/domain/motivation.ts` holds seven lines from Twain, Collier, Roosevelt, Mandela, Franklin, Gandhi
   and Ashe; `5.23_the_oracle` shows *"Know thyself. — Inscribed at Delphi"*. The set was kept, per the
   rule that design sample content is not transcribed. Replacing it with classical sources would suit the
   lexicon and costs nothing technically — `motivation.test.ts` asserts structure, not content, and
   `quoteForDate` works on any array length — but it changes what the app says to its user every morning,
   so it is the user's call. Raised 2026-08-20; undecided.
