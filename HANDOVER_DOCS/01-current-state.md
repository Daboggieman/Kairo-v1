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
| **Stage 3 — 5 new screens** | **Complete — 5 of 5.** The Envoy, Gates, Pantheon, Annals and Sanctum are implemented; native acceptance was user-reported successful. |

Detail on what landed and why: [`03-ui-rebuild-progress.md`](03-ui-rebuild-progress.md). The rules the
Stage 3 screens must follow: [`02-ui-rebuild-conventions.md`](02-ui-rebuild-conventions.md).

## The resume point — continued product work

Stage 3 implementation and acceptance are complete: native acceptance was user-reported successful,
and Android/iOS exports were measured successful on 2026-08-22. Automated checks are green at **554
tests across 24 suites**, clean ESLint, and clean TypeScript. Expo Doctor is **20/21** because the
project intentionally remains on its current Expo patch set. The workout-set sync path also has an
opt-in end-to-end proof against a live backend — `npm run test:e2e`, **5 passed** on 2026-08-22.

The five Stage 3 screens now exist: The Envoy, The Gates, The Pantheon, The Annals and The Sanctum.
The supporting work includes `LaunchRouter`, typed preferences, Pantheon and Annals domain suites,
macro range readers, `NO_LIMIT`, `expo-sharing ~57.0.13`, the lazy sharing adapter, and the
SQLite-backed export/raze maintenance suite.

**Two divergences from the brief remain deliberate.** The Envoy is reached from The Sanctum only —
the Citadel Outer Ward row was dropped. And `LAST_SYNC_AT` is
written only by a run that *delivered* something (`succeeded > 0`), so its row is labelled "Last
delivered", not "Last ran".

One item remains explicitly deferred by user decision:

- **Expo patch alignment** — leave the nine one-patch-behind SDK packages unchanged.

**Where The Sanctum is reached from is now settled**, and was an open question here on 2026-08-20: it
is an `IconButton` in The Citadel's brand row (`app/(tabs)/index.tsx:162`, `router.push('/sanctum')`),
which is what the brief proposed. The Citadel is the one tab root with no `ScreenHeader` — its brand
block is bespoke, because `KairoMark`'s interior is opaque — so there was no header to hang it in.

The rebuild hangs the Pantheon and the Annals off The Citadel's Outer Ward row group, and those two
rows are now backed by their route files. The Sanctum is reached from the Citadel brand row.

**One thing the Stage 2 close-out turned up and remains true:** the `flexShrink: 1` day-toggle fix,
now a convention in [`02-ui-rebuild-conventions.md`](02-ui-rebuild-conventions.md). The Oracle quote
set is now classical; its date-stable selection contract remains unchanged.

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

## Verification — measured 2026-08-22

Run from `apps/mobile`, after the Stage 3 screens and the workout-set sync routes:

| Check | Result |
|---|---|
| `npx jest` | **24 suites passed, 554 tests passed, 0 failures** |
| `npx eslint .` | clean, exit 0 — the gate is 0 errors / 0 warnings |
| `npx tsc --noEmit` | **clean** |

Backend, from `apps/backend`: `ruff check .` clean and **35 `pytest` cases passing**, both on 2026-08-22.

[`08-verification.md`](08-verification.md) owns the full record — the suite list, the backend and
packaging figures, and the traps. Read it rather than re-deriving any of it here.

**`tsc` is clean, and the three typed-route errors that stood until 2026-08-21 are gone.** They were
`/sanctum`, `/pantheon` and `/annals` pushed from The Citadel before those route files existed; each
cleared when its file landed. Kept as history in
[`08-verification.md`](08-verification.md#historical-typed-route-errors--all-cleared) because the shape
recurs — never cast one away.

**This supersedes every earlier count in the handover** (350/16, 376/18, 394/20, the never-measured
"426 expected", 481/20 from 2026-08-19, 494/20 from 2026-08-20, 532/24 from 2026-08-21, 534/24, and
538/24 taken earlier the same day).
Fifteen of the +16 over 538 are the Annals ledger suite (3 cases → 18). The remaining one is **not**
attributable to this pass, and 538 is superseded rather than reconciled — the arithmetic is set out in
[`08-verification.md`](08-verification.md#what-was-last-measured-and-when). Backend went 28 → 35 in the
workout-set route pass.

**Native acceptance was reported successful by the user on 2026-08-22.** The Gates, Sanctum controls,
export/share, raze/reseed path, and the rebuilt screens were reported working. This is user-reported
device evidence, not a command measured in this environment. Packaging was measured here on the same
date: both platform exports succeeded, while Expo Doctor passed 20/21 checks and reported nine Expo
packages one patch behind. See [`08-verification.md`](08-verification.md).

Backend readiness was re-measured 2026-08-22: Ruff clean, **35** pytest cases passed (28 before the seven
workout-set route cases landed the same day), and Alembic upgraded an empty SQLite database through
movement head `7e3b9a1c2d44`. **The two new routes need no migration** — `PATCH`/`DELETE` on
`workout_sets` touch no schema, so `7e3b9a1c2d44` is still head.

## Working tree — branch `phase_3`

**All of Stage 2 and the Stage 3 screens are committed**, the latest in **`ox-08(5)`** (`6dd3de9`,
2026-08-21). `ox-08` (`50a82e3`) — 19 files, 1,963 insertions — was The Envoy and The Gates plus the
Pantheon groundwork; the four commits after it carried the Pantheon, the Annals and the Sanctum. Nothing
here stages or commits on its own; every commit in the table below was the user's.

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
| `6dd3de9` | 2026-08-21 | `ox-08(5)` — `01-current-state.md` only |
| `ad0d1fd` | 2026-08-21 | `ox-08(4)` — **The Sanctum**: the screen, `db/maintenance.ts` + its suite, `services/sharing.ts`, `expo-sharing`, and the purity fixes to Annals and Pantheon |
| `4a3ffc4` | 2026-08-21 | `ox-08(3)` — **The Annals**: the screen, `domain/annals.ts` + suite, and the two `db/macros.ts` range readers |
| `4c731c0` | 2026-08-21 | **The Pantheon** — the screen, `domain/pantheon.ts` (163 lines) + suite, `db/movement.ts`. **Its message is wrong**: it reads *"started solution folder … python oop exercises"* and carries none of that. Searching the log for the Pantheon will not find it; that is why it is spelled out here. |
| `6d4aa24` | 2026-08-21 | `0x-08(2)` — the handover and `docs/` pass (8 + 4 files), and the `envoy.tsx` `set-state-in-effect` fix |
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

`phase_3` is **21 ahead / 0 behind `origin/master`** as of 2026-08-22. It was 16/0 after `ox-08`, 13/0
after `ox-07`, 11/0 before it, and 8 ahead / 1 behind on 2026-08-19, so the user merges and pushes between
sessions. That also retires three warnings the handover used to carry: "nothing is committed", "part of it
is already in the index", and the unstaged `ui_rebuild_stitch_prompt.md` deletion.


Confirm the real state with `git status --short --branch`, `git log --oneline -5` and
`git rev-list --left-right --count origin/master...HEAD` rather than trusting this table — the user
merges and pushes between sessions, so any commit list here dates the moment it was written.

## Open items — none of them blocking

1. **`apps/backend/.env` is intentionally tracked in git and holds non-example `DEVICE_KEY` and `JWT_SECRET`
   values** (last committed in `369531c`). `.gitignore`'s secrets block has the `!.env.example`
   exception but no `.env` pattern, so nothing was ever ignoring it. Remedy and reasoning in
   [`11-module-pattern-and-hygiene.md`](11-module-pattern-and-hygiene.md) — it needs the user's
   values. The user explicitly confirmed on 2026-08-22 that this is intentional; do not rotate or
   remove them unless the user reverses that decision.
2. **`apps/backend/.venv` exists** as of 2026-08-22, and the Ruff and 35-case `pytest` figures above were
   measured through it. It is untracked, so a fresh clone recreates it with
   `python3 -m venv .venv && source .venv/bin/activate && pip install -e '.[dev]'`.
3. **Nine Expo packages are one patch behind by deliberate choice** — `expo`, `expo-constants`, `expo-file-system`,
   `expo-linking`, `expo-location`, `expo-notifications`, `expo-router`, `expo-sharing`, and
   `expo-task-manager`, measured by Expo Doctor on 2026-08-22. Both platform exports still succeed;
   The user explicitly chose not to upgrade them; do not reopen this as required work.
4. **The Annals is now wired to data — this item is closed, kept for the reasoning.** It read
   `describeVerdict({ kept: 0, due: 0, macroDaysOver: 0 })`, so the reckoning card printed *"A quiet
   week. Nothing was owed."* for every week, and the day strip was derived from **today** rather than
   the selected range, so paging back did not move it. Closed 2026-08-22 by `weekLedger` in
   `src/domain/annals.ts`, which returns the seven `DayLedger` rows **and** the totals as sums of those
   same rows — one function, because computing the verdict and the strip separately is how a card saying
   "a held week" ends up above a strip showing a miss. `app/annals.tsx` renders `ledger.days` and passes
   the same ledger to `describeVerdict`. Five decisions are recorded in the function's docblock rather
   than here: archived rites excluded, only *scheduled* days counted (a bonus tick would push `kept`
   above `due` and wrongly fire the `kept === due` branch), a future day not yet owed, today owed only
   once done — mirroring `historyState`'s `pending` grace — and a day with no target or nothing logged
   reported as silent rather than as the decree holding. **One trap worth carrying forward:**
   `listMacroTargetsBetween` returns only targets *set* within the range, so a week that changed no
   target reads as having no decree at all; the screen fetches `getMacroTargetForDate(range.startKey)`
   as well and merges it by id. 18 cases in `src/domain/__tests__/annals.test.ts`, including one pinning
   the totals to the rows.

